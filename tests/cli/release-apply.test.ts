import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import {
  createCandidate,
  readGit,
  type Candidate,
} from '../../src/cli/release-candidate';
import {
  applyCandidate,
  scanDistCollisions,
} from '../../src/cli/release-apply';
import {
  createReleaseFixture,
  fixtureRunner,
  type ReleaseFixture,
} from '../helpers/release-fixture';

const TARGET_FILES = ['package.json', 'package-lock.json', 'src/cli/config.ts', 'CHANGELOG.md'];
const NEXT = '2.3.0';
const DATE = '2026-11-04';
const NEXT_PACKAGE = `${JSON.stringify(
  { name: 'kiki', version: NEXT, type: 'module', scripts: { test: 'vitest run' } },
  null,
  2,
)}\n`;
const NEXT_LOCK = `${JSON.stringify(
  {
    name: 'kiki',
    version: NEXT,
    lockfileVersion: 3,
    packages: { '': { name: 'kiki', version: NEXT } },
  },
  null,
  2,
)}\n`;
const NEXT_CONFIG = `export const KIKI_VERSION = '${NEXT}';\n`;
const NEXT_CHANGELOG = `# Changelog\n\n## [Unreleased]\n\n## [${NEXT}] — ${DATE}\n\n### Added\n- Release apply fixture.\n`;

interface EntryState {
  type: 'file' | 'directory' | 'symlink' | 'other' | 'absent';
  mode?: number;
  hash?: string;
  target?: string;
}

let fixture: ReleaseFixture;
let originalTmp: string | undefined;
let testTmp: string;
let candidates: Candidate[];

beforeEach(() => {
  originalTmp = process.env.TMPDIR;
  testTmp = mkdtempSync(join(tmpdir(), 'kiki-apply-test-'));
  process.env.TMPDIR = testTmp;
  candidates = [];
  fixture = createReleaseFixture();
});

afterEach(async () => {
  for (const candidate of candidates) {
    try {
      await candidate.dispose();
    } catch {
      // Test teardown only; failure paths assert retention explicitly.
    }
  }
  fixture.cleanup();
  if (originalTmp === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = originalTmp;
  rmSync(testTmp, { recursive: true, force: true });
});

async function trackedPaths(): Promise<string[]> {
  const raw = await readGit(fixtureRunner, fixture.checkout, 'ls-files', ['-z']);
  return raw.split('\0').filter(Boolean);
}

async function newCandidate(exclude: string[] = []): Promise<Candidate> {
  const tracked = (await trackedPaths()).filter(path => !exclude.includes(path));
  const candidate = await createCandidate(fixture.checkout, tracked);
  candidates.push(candidate);
  return candidate;
}

async function transformCandidate(candidate: Candidate): Promise<void> {
  await writeFile(join(candidate.root, 'package.json'), NEXT_PACKAGE);
  await writeFile(join(candidate.root, 'package-lock.json'), NEXT_LOCK);
  await writeFile(join(candidate.root, 'src/cli/config.ts'), NEXT_CONFIG);
  await writeFile(join(candidate.root, 'CHANGELOG.md'), NEXT_CHANGELOG);

  const dist = join(candidate.root, 'dist');
  await rm(dist, { recursive: true, force: true });
  await mkdir(join(dist, 'cli'), { recursive: true });
  await mkdir(join(dist, 'nested'), { recursive: true });
  await mkdir(join(dist, 'empty-dir'), { recursive: true });
  await writeFile(join(dist, 'cli/config.js'), NEXT_CONFIG);
  await writeFile(join(dist, 'new-only.js'), 'export const NEW_ONLY = true;\n');
  await writeFile(join(dist, 'nested/new.js'), 'export const NESTED = true;\n');
}

function hash(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function entryState(absolute: string): EntryState {
  let info;
  try {
    info = lstatSync(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { type: 'absent' };
    throw error;
  }
  if (info.isSymbolicLink()) {
    return { type: 'symlink', mode: info.mode & 0o777 };
  }
  if (info.isDirectory()) {
    return { type: 'directory', mode: info.mode & 0o777 };
  }
  if (info.isFile()) {
    return { type: 'file', mode: info.mode & 0o777, hash: hash(readFileSync(absolute)) };
  }
  return { type: 'other', mode: info.mode & 0o777 };
}

function treeState(root: string): Record<string, EntryState> {
  const state: Record<string, EntryState> = {};
  const visit = (absolute: string, relativePath: string): void => {
    const info = lstatSync(absolute);
    if (info.isSymbolicLink()) {
      state[relativePath] = { type: 'symlink', mode: info.mode & 0o777 };
      return;
    }
    state[relativePath] = {
      type: info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other',
      mode: info.mode & 0o777,
      ...(info.isFile() ? { hash: hash(readFileSync(absolute)) } : {}),
    };
    if (info.isDirectory()) {
      for (const name of readdirSync(absolute).sort()) {
        visit(join(absolute, name), relativePath === '' ? name : `${relativePath}/${name}`);
      }
    }
  };
  visit(root, '');
  return state;
}

function checkoutState(): {
  targets: Record<string, EntryState>;
  dist: Record<string, EntryState> | null;
  sentinels: Record<string, string>;
} {
  const dist = join(fixture.checkout, 'dist');
  return {
    targets: Object.fromEntries(
      TARGET_FILES.map(relativePath => [relativePath, entryState(join(fixture.checkout, relativePath))]),
    ),
    dist: existsSync(dist) ? treeState(dist) : null,
    sentinels: {
      ignored: fixture.read('ignored-sentinel.txt').toString(),
      untracked: fixture.read('untracked-sentinel.txt').toString(),
      env: fixture.read('.env').toString(),
      routing: fixture.read('.agentic/routing_log.jsonl').toString(),
      cache: fixture.read('.agentic/cache/cache-sentinel').toString(),
      tmp: fixture.read('tmp/build.log').toString(),
      dependency: fixture.read('node_modules/fake-dep/index.js').toString(),
    },
  };
}

async function failure(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error('EXPECTED_APPLY_TO_FAIL');
}

function backupDirectories(candidate: Candidate): string[] {
  return readdirSync(candidate.runRoot)
    .filter(name => name.startsWith('apply-backup-'))
    .map(name => join(candidate.runRoot, name));
}

async function readCheckout(relativePath: string): Promise<Buffer> {
  return readFile(join(fixture.checkout, relativePath));
}

function expectRestored(before: ReturnType<typeof checkoutState>): void {
  expect(checkoutState()).toEqual(before);
}

describe('scanDistCollisions', () => {
  it('accepts a tracked-only dist tree', async () => {
    const tracked = await trackedPaths();
    await expect(scanDistCollisions(fixture.checkout, tracked)).resolves.toEqual([]);
  });

  it('reports an ignored file under dist', async () => {
    fixture.write('.gitignore', `${fixture.read('.gitignore').toString()}dist/ignored.bin\n`);
    fixture.write('dist/ignored.bin', 'ignored collision\n');
    const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
      cwd: fixture.checkout,
      encoding: 'utf8',
    });
    expect(status).not.toContain('dist/ignored.bin');
    const tracked = await trackedPaths();
    await expect(scanDistCollisions(fixture.checkout, tracked)).resolves.toEqual(['dist/ignored.bin']);
  });

  it('reports ordinary untracked and nested files', async () => {
    fixture.write('dist/untracked.txt', 'untracked\n');
    fixture.write('dist/nested/deep/file.txt', 'nested untracked\n');
    const tracked = await trackedPaths();
    await expect(scanDistCollisions(fixture.checkout, tracked)).resolves.toEqual([
      'dist/nested/deep/file.txt',
      'dist/untracked.txt',
    ]);
  });

  it('reports symlinks and special entries without following them', async () => {
    fixture.write('outside-target.txt', 'OUTSIDE_SENTINEL\n');
    fixture.symlink('../outside-target.txt', 'dist/link');
    execFileSync('mkfifo', [join(fixture.checkout, 'dist/fifo')]);
    const tracked = await trackedPaths();

    await expect(scanDistCollisions(fixture.checkout, tracked)).resolves.toEqual([
      'dist/fifo',
      'dist/link',
    ]);
    expect(fixture.read('outside-target.txt').toString()).toBe('OUTSIDE_SENTINEL\n');
  });

  it('reports an untracked empty directory', async () => {
    fixture.mkdir('dist/empty-dir');
    const tracked = await trackedPaths();
    await expect(scanDistCollisions(fixture.checkout, tracked)).resolves.toEqual(['dist/empty-dir']);
  });

  it('handles an absent dist tree', async () => {
    fixture.remove('dist');
    const tracked = await trackedPaths();
    await expect(scanDistCollisions(fixture.checkout, tracked)).resolves.toEqual([]);
  });

  it('refuses a symlinked dist root without touching its target', async () => {
    fixture.remove('dist');
    fixture.mkdir('external-dist');
    fixture.write('external-dist/kept.txt', 'EXTERNAL_KEPT\n');
    fixture.symlink('../external-dist', 'dist');
    const tracked = await trackedPaths();

    await expect(scanDistCollisions(fixture.checkout, tracked)).resolves.toEqual(['dist']);
    expect(fixture.read('external-dist/kept.txt').toString()).toBe('EXTERNAL_KEPT\n');
  });

  it('flags secret-named dist entries without reading their contents', async () => {
    fixture.mkdir('dist/secrets');
    fixture.write('dist/secrets/token', 'FIXTURE_ONLY_SECRET\n', 0o000);
    const tracked = await trackedPaths();

    await expect(scanDistCollisions(fixture.checkout, tracked)).resolves.toEqual(['dist/secrets']);
  });
});

describe('applyCandidate success', () => {
  it('applies four targets plus the complete dist tree and preserves unrelated source', async () => {
    const candidate = await newCandidate();
    await transformCandidate(candidate);
    chmodSync(join(fixture.checkout, 'package.json'), 0o600);
    chmodSync(join(fixture.checkout, 'src/cli/config.ts'), 0o640);
    const before = checkoutState();
    const writes: string[] = [];

    const result = await applyCandidate(fixture.checkout, candidate, {
      afterWrite: async relativePath => {
        writes.push(relativePath);
      },
    });

    expect(writes.slice(0, 4)).toEqual(TARGET_FILES);
    expect(writes.at(-1)).toBe('dist');
    expect(writes.some(path => path.startsWith('dist/'))).toBe(true);
    expect(resolve(result.backupRoot).startsWith(resolve(candidate.runRoot) + sep)).toBe(true);
    expect(existsSync(result.backupRoot)).toBe(false);

    expect((await readCheckout('package.json')).equals(Buffer.from(NEXT_PACKAGE))).toBe(true);
    expect((await readCheckout('package-lock.json')).equals(Buffer.from(NEXT_LOCK))).toBe(true);
    expect((await readCheckout('src/cli/config.ts')).equals(Buffer.from(NEXT_CONFIG))).toBe(true);
    expect((await readCheckout('CHANGELOG.md')).equals(Buffer.from(NEXT_CHANGELOG))).toBe(true);
    expect(statSync(join(fixture.checkout, 'package.json')).mode & 0o777).toBe(0o600);
    expect(statSync(join(fixture.checkout, 'src/cli/config.ts')).mode & 0o777).toBe(0o640);

    expect(treeState(join(fixture.checkout, 'dist'))).toEqual(treeState(join(candidate.root, 'dist')));
    expect(existsSync(join(fixture.checkout, 'dist/stale.js'))).toBe(false);
    expect(existsSync(join(fixture.checkout, 'dist/new-only.js'))).toBe(true);
    expect(existsSync(join(fixture.checkout, 'dist/empty-dir'))).toBe(true);

    expect(checkoutState().sentinels).toEqual(before.sentinels);
    expect(readdirSync(fixture.checkout).filter(name => name.startsWith('.kiki-apply-'))).toEqual([]);
  });

  it('applies from an absent dist state', async () => {
    const candidate = await newCandidate(['dist/cli/config.js', 'dist/stale.js']);
    await transformCandidate(candidate);
    fixture.remove('dist');
    const before = checkoutState();
    expect(before.dist).toBeNull();

    await applyCandidate(fixture.checkout, candidate);

    expect(treeState(join(fixture.checkout, 'dist'))).toEqual(treeState(join(candidate.root, 'dist')));
    expect(checkoutState().sentinels).toEqual(before.sentinels);
  });
  it('applies an absent target with the candidate mode', async () => {
    const candidate = await newCandidate(['CHANGELOG.md']);
    await transformCandidate(candidate);
    chmodSync(join(candidate.root, 'CHANGELOG.md'), 0o600);
    fixture.remove('CHANGELOG.md');

    await applyCandidate(fixture.checkout, candidate);

    expect((await readCheckout('CHANGELOG.md')).equals(Buffer.from(NEXT_CHANGELOG))).toBe(true);
    expect(statSync(join(fixture.checkout, 'CHANGELOG.md')).mode & 0o777).toBe(0o600);
  });
});

describe('apply rollback on injected failures', () => {
  it.each(TARGET_FILES)('restores every target and the dist tree when writing %s fails', async target => {
    const candidate = await newCandidate();
    await transformCandidate(candidate);
    chmodSync(join(fixture.checkout, 'package.json'), 0o600);
    chmodSync(join(fixture.checkout, 'src/cli/config.ts'), 0o640);
    const before = checkoutState();

    const error = await failure(
      applyCandidate(fixture.checkout, candidate, {
        afterWrite: async relativePath => {
          if (relativePath === target) throw new Error(`INJECT_WRITE:${target}`);
        },
      }),
    );

    expect(error.message).toContain(`INJECT_WRITE:${target}`);
    expect(error.message).toMatch(/restored/i);
    const backups = backupDirectories(candidate);
    expect(backups).toHaveLength(1);
    expect(error.message).toContain(backups[0]);
    expect(existsSync(backups[0])).toBe(true);
    expectRestored(before);
  });

  it('restores when dist replacement is interrupted midway', async () => {
    const candidate = await newCandidate();
    await transformCandidate(candidate);
    const before = checkoutState();

    const error = await failure(
      applyCandidate(fixture.checkout, candidate, {
        afterWrite: async relativePath => {
          if (relativePath === 'dist') throw new Error('INJECT_DIST_SWAP');
        },
      }),
    );

    expect(error.message).toContain('INJECT_DIST_SWAP');
    expect(error.message).toMatch(/restored/i);
    expect(backupDirectories(candidate)).toHaveLength(1);
    expectRestored(before);
  });

  it('restores when dist copying is interrupted midway', async () => {
    const candidate = await newCandidate();
    await transformCandidate(candidate);
    const before = checkoutState();
    let distWrites = 0;

    const error = await failure(
      applyCandidate(fixture.checkout, candidate, {
        afterWrite: async relativePath => {
          if (relativePath.startsWith('dist/') && ++distWrites === 2) {
            throw new Error('INJECT_DIST_COPY');
          }
        },
      }),
    );

    expect(error.message).toContain('INJECT_DIST_COPY');
    expect(error.message).toMatch(/restored/i);
    expect(backupDirectories(candidate)).toHaveLength(1);
    expectRestored(before);
  });

  it('restores when post-apply verification finds a corrupted target byte', async () => {
    const candidate = await newCandidate();
    await transformCandidate(candidate);
    const before = checkoutState();

    const error = await failure(
      applyCandidate(fixture.checkout, candidate, {
        beforeVerify: async () => {
          await writeFile(join(fixture.checkout, 'package.json'), 'CORRUPTED_BY_HOOK\n');
        },
      }),
    );

    expect(error.message).toMatch(/verification/i);
    expect(error.message).toMatch(/restored/i);
    expect(backupDirectories(candidate)).toHaveLength(1);
    expectRestored(before);
  });

  it('restores when post-apply verification finds a corrupted target mode', async () => {
    const candidate = await newCandidate();
    await transformCandidate(candidate);
    chmodSync(join(fixture.checkout, 'package.json'), 0o640);
    const before = checkoutState();
    expect(before.targets['package.json'].mode).toBe(0o640);

    const error = await failure(
      applyCandidate(fixture.checkout, candidate, {
        beforeVerify: async () => {
          await chmod(join(fixture.checkout, 'package.json'), 0o600);
        },
      }),
    );

    expect(error.message).toMatch(/verification/i);
    expect(error.message).toMatch(/mode/i);
    expect(error.message).toMatch(/restored/i);
    expect(backupDirectories(candidate)).toHaveLength(1);
    expectRestored(before);
  });

  it('restores when post-apply verification finds a missing dist file', async () => {
    const candidate = await newCandidate();
    await transformCandidate(candidate);
    const before = checkoutState();

    const error = await failure(
      applyCandidate(fixture.checkout, candidate, {
        beforeVerify: async () => {
          await rm(join(fixture.checkout, 'dist/new-only.js'), { force: true });
        },
      }),
    );

    expect(error.message).toMatch(/verification/i);
    expect(error.message).toContain('dist/new-only.js');
    expect(error.message).toMatch(/restored/i);
    expectRestored(before);
  });

  it('restores when post-apply verification finds an extra dist file', async () => {
    const candidate = await newCandidate();
    await transformCandidate(candidate);
    const before = checkoutState();

    const error = await failure(
      applyCandidate(fixture.checkout, candidate, {
        beforeVerify: async () => {
          await writeFile(join(fixture.checkout, 'dist/extra.js'), 'EXTRA_BY_HOOK\n');
        },
      }),
    );

    expect(error.message).toMatch(/verification/i);
    expect(error.message).toContain('dist/extra.js');
    expect(error.message).toMatch(/restored/i);
    expectRestored(before);
  });

  it('removes a target that was absent before apply when a later step fails', async () => {
    const candidate = await newCandidate(['CHANGELOG.md']);
    await transformCandidate(candidate);
    fixture.remove('CHANGELOG.md');
    const before = checkoutState();
    expect(before.targets['CHANGELOG.md'].type).toBe('absent');

    const error = await failure(
      applyCandidate(fixture.checkout, candidate, {
        afterWrite: async relativePath => {
          if (relativePath === 'dist') throw new Error('INJECT_AFTER_TARGETS');
        },
      }),
    );

    expect(error.message).toMatch(/restored/i);
    expectRestored(before);
    expect(existsSync(join(fixture.checkout, 'CHANGELOG.md'))).toBe(false);
  });

  it('removes an absent-before dist tree when verification fails', async () => {
    const candidate = await newCandidate(['dist/cli/config.js', 'dist/stale.js']);
    await transformCandidate(candidate);
    fixture.remove('dist');
    const before = checkoutState();
    expect(before.dist).toBeNull();

    const error = await failure(
      applyCandidate(fixture.checkout, candidate, {
        beforeVerify: async () => {
          await mkdir(join(fixture.checkout, 'dist'), { recursive: true });
          await writeFile(join(fixture.checkout, 'dist/extra.js'), 'EXTRA_BY_HOOK\n');
        },
      }),
    );

    expect(error.message).toMatch(/verification/i);
    expect(error.message).toMatch(/restored/i);
    expectRestored(before);
    expect(existsSync(join(fixture.checkout, 'dist'))).toBe(false);
  });
});

describe('apply preconditions and refusal', () => {
  it('refuses concurrent target edits since candidate validation without overwriting them', async () => {
    const candidate = await newCandidate();
    await transformCandidate(candidate);
    fixture.write('package.json', 'CONCURRENT_TARGET_EDIT\n');
    const before = checkoutState();

    const error = await failure(applyCandidate(fixture.checkout, candidate));

    expect(error.message).toMatch(/changed|concurrent/i);
    expectRestored(before);
    expect(backupDirectories(candidate)).toHaveLength(0);
  });

  it('refuses concurrent dist edits since candidate validation without overwriting them', async () => {
    const candidate = await newCandidate();
    await transformCandidate(candidate);
    fixture.write('dist/cli/config.js', 'CONCURRENT_DIST_EDIT\n');
    const before = checkoutState();

    const error = await failure(applyCandidate(fixture.checkout, candidate));

    expect(error.message).toMatch(/changed|concurrent/i);
    expectRestored(before);
    expect(backupDirectories(candidate)).toHaveLength(0);
  });

  it('preserves an external late dist file detected before replacement and restores only our target writes', async () => {
    const candidate = await newCandidate();
    await transformCandidate(candidate);
    const originalConfig = fixture.read('dist/cli/config.js');
    const before = checkoutState();
    let injected = false;

    const error = await failure(
      applyCandidate(fixture.checkout, candidate, {
        afterWrite: async relativePath => {
          if (!injected && relativePath === 'package.json') {
            injected = true;
            fixture.write('dist/late-collision.bin', 'LATE_COLLISION\n');
          }
        },
      }),
    );

    expect(error.message).toMatch(/collid|refus/i);
    expect(error.message).toContain('dist/late-collision.bin');
    expect(error.message).toMatch(/target writes restored/i);
    expect(error.message).toMatch(/dist was not modified/i);
    expect(error.message).not.toMatch(/dist tree restored/i);
    expect(backupDirectories(candidate)).toHaveLength(1);
    const after = checkoutState();
    expect(after.targets).toEqual(before.targets);
    expect(after.sentinels).toEqual(before.sentinels);
    expect(fixture.read('dist/late-collision.bin').toString()).toBe('LATE_COLLISION\n');
    expect(fixture.read('dist/cli/config.js').equals(originalConfig)).toBe(true);
    expect(after.dist?.['stale.js']).toEqual(before.dist?.['stale.js']);
  });

  it('preserves an external late dist edit detected before replacement and restores only our target writes', async () => {
    const candidate = await newCandidate();
    await transformCandidate(candidate);
    const originalStale = fixture.read('dist/stale.js');
    const before = checkoutState();
    let injected = false;

    const error = await failure(
      applyCandidate(fixture.checkout, candidate, {
        afterWrite: async relativePath => {
          if (!injected && relativePath === 'package.json') {
            injected = true;
            fixture.write('dist/cli/config.js', 'LATE_CONCURRENT_DIST_EDIT\n');
          }
        },
      }),
    );

    expect(error.message).toMatch(/changed|concurrent/i);
    expect(error.message).toMatch(/target writes restored/i);
    expect(error.message).toMatch(/dist was not modified/i);
    expect(backupDirectories(candidate)).toHaveLength(1);
    const after = checkoutState();
    expect(after.targets).toEqual(before.targets);
    expect(after.sentinels).toEqual(before.sentinels);
    expect(fixture.read('dist/cli/config.js').toString()).toBe('LATE_CONCURRENT_DIST_EDIT\n');
    expect(fixture.read('dist/stale.js').equals(originalStale)).toBe(true);
  });

  it('rechecks each target immediately before writing and preserves a later external target edit', async () => {
    const candidate = await newCandidate();
    await transformCandidate(candidate);
    const before = checkoutState();
    let injected = false;

    const error = await failure(
      applyCandidate(fixture.checkout, candidate, {
        afterWrite: async relativePath => {
          if (!injected && relativePath === 'package.json') {
            injected = true;
            fixture.write('CHANGELOG.md', 'EXTERNAL_LATER_EDIT\n');
          }
        },
      }),
    );

    expect(error.message).toMatch(/changed|concurrent/i);
    expect(error.message).toContain('CHANGELOG.md');
    expect(error.message).toMatch(/target writes restored/i);
    expect(error.message).toMatch(/dist was not modified/i);
    expect(backupDirectories(candidate)).toHaveLength(1);
    const after = checkoutState();
    expect(fixture.read('CHANGELOG.md').toString()).toBe('EXTERNAL_LATER_EDIT\n');
    expect(after.targets['package.json']).toEqual(before.targets['package.json']);
    expect(after.targets['package-lock.json']).toEqual(before.targets['package-lock.json']);
    expect(after.targets['src/cli/config.ts']).toEqual(before.targets['src/cli/config.ts']);
    expect(after.dist).toEqual(before.dist);
    expect(after.sentinels).toEqual(before.sentinels);
  });

  it('refuses an untracked dist collision and lists the relative path', async () => {
    const candidate = await newCandidate();
    await transformCandidate(candidate);
    fixture.write('dist/untracked-collision.bin', 'COLLISION\n');
    const before = checkoutState();

    const error = await failure(applyCandidate(fixture.checkout, candidate));

    expect(error.message).toMatch(/collid|refus/i);
    expect(error.message).toContain('dist/untracked-collision.bin');
    expectRestored(before);
    expect(backupDirectories(candidate)).toHaveLength(0);
  });

  it('refuses a symlinked target without following or overwriting its target', async () => {
    const candidate = await newCandidate(['package.json']);
    await transformCandidate(candidate);
    fixture.remove('package.json');
    fixture.write('outside-target.txt', 'OUTSIDE_TARGET\n');
    fixture.symlink('../outside-target.txt', 'package.json');
    const before = checkoutState();

    const error = await failure(applyCandidate(fixture.checkout, candidate));

    expect(error.message).toMatch(/symlink|link|unsafe/i);
    expect(fixture.read('outside-target.txt').toString()).toBe('OUTSIDE_TARGET\n');
    expectRestored(before);
    expect(backupDirectories(candidate)).toHaveLength(0);
  });

  it('leaves source unchanged when the run-owned backup cannot be created', async () => {
    const candidate = await newCandidate();
    await transformCandidate(candidate);
    const originalPackage = readFileSync(join(fixture.checkout, 'package.json'));
    const originalSentinels = checkoutState().sentinels;
    chmodSync(candidate.runRoot, 0o555);

    try {
      const error = await failure(applyCandidate(fixture.checkout, candidate));
      expect(error.message).toMatch(/apply failed before writing|permission|EACCES/i);
    } finally {
      chmodSync(candidate.runRoot, 0o755);
    }

    expect(readFileSync(join(fixture.checkout, 'package.json')).equals(originalPackage)).toBe(true);
    expect(existsSync(join(fixture.checkout, 'dist/new-only.js'))).toBe(false);
    expect(checkoutState().sentinels).toEqual(originalSentinels);
  });

  it('leaves source unchanged when a pre-write snapshot cannot be read', async () => {
    const candidate = await newCandidate();
    await transformCandidate(candidate);
    const originalPackage = readFileSync(join(fixture.checkout, 'package.json'));
    const originalStale = readFileSync(join(fixture.checkout, 'dist/stale.js'));
    chmodSync(join(fixture.checkout, 'dist/stale.js'), 0o000);

    try {
      const error = await failure(applyCandidate(fixture.checkout, candidate));
      expect(error.message).toMatch(/cannot read|unreadable|permission|EACCES/i);
    } finally {
      chmodSync(join(fixture.checkout, 'dist/stale.js'), 0o644);
    }

    expect(readFileSync(join(fixture.checkout, 'package.json')).equals(originalPackage)).toBe(true);
    expect(readFileSync(join(fixture.checkout, 'dist/stale.js')).equals(originalStale)).toBe(true);
    expect(backupDirectories(candidate)).toHaveLength(0);
  });
});

describe('rollback failure reporting', () => {
  const maybeIt = process.getuid?.() === 0 ? it.skip : it;

  maybeIt('reports a truthful rollback failure, retains the backup and never claims restoration', async () => {
    const candidate = await newCandidate();
    await transformCandidate(candidate);
    const originalPackage = readFileSync(join(fixture.checkout, 'package.json'));

    let error: Error;
    try {
      error = await failure(
        applyCandidate(fixture.checkout, candidate, {
          beforeVerify: async () => {
            chmodSync(fixture.checkout, 0o555);
            writeFileSync(join(fixture.checkout, 'package.json'), 'CORRUPTED_BEFORE_ROLLBACK\n');
          },
        }),
      );
    } finally {
      chmodSync(fixture.checkout, 0o755);
    }

    expect(error.message).toMatch(/rollback failed|manual recovery/i);
    expect(error.message).not.toMatch(/checkout restored/i);
    const backups = backupDirectories(candidate);
    expect(backups).toHaveLength(1);
    expect(error.message).toContain(backups[0]);
    expect(existsSync(backups[0])).toBe(true);
    expect(readFileSync(join(backups[0], 'targets/package.json')).equals(originalPackage)).toBe(true);
  });
});

describe('rollback verification failure reporting', () => {
  it('fails truthfully when the retained backup cannot restore verified bytes', async () => {
    const candidate = await newCandidate();
    await transformCandidate(candidate);

    const error = await failure(
      applyCandidate(fixture.checkout, candidate, {
        beforeVerify: async () => {
          const backups = backupDirectories(candidate);
          expect(backups).toHaveLength(1);
          await writeFile(join(backups[0], 'targets/package.json'), 'CORRUPTED_BACKUP\n');
          await writeFile(join(fixture.checkout, 'package.json'), 'FORCE_VERIFY_FAILURE\n');
        },
      }),
    );

    expect(error.message).toMatch(/rollback failed/i);
    expect(error.message).toMatch(/rollback verification failed/i);
    expect(error.message).toMatch(/manual recovery/i);
    expect(error.message).not.toMatch(/checkout restored/i);
    const backups = backupDirectories(candidate);
    expect(backups).toHaveLength(1);
    expect(error.message).toContain(backups[0]);
    expect(existsSync(backups[0])).toBe(true);
  });
});

describe('source safety invariants', () => {
  it('keeps apply free of production git writers and subprocess runners', () => {
    const source = readFileSync(join(process.cwd(), 'src/cli/release-apply.ts'), 'utf8');
    expect(source).not.toMatch(/node:child_process|execFile|spawnSync|\bspawn\(|readGit\(/);
    expect(source).toMatch(/export async function scanDistCollisions/);
    expect(source).toMatch(/export async function applyCandidate/);
  });
});
