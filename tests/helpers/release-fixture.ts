/**
 * Test-only fixture graph for release-candidate/release integration tests.
 *
 * This module is intentionally under tests/helpers and must never be imported by
 * production source. It creates synthetic repositories only inside freshly made
 * OS temp roots; the fixture git wrapper is restricted to init/add/commit and
 * never runs in the caller's repository.
 */
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { CommandRunner, CommandResult } from '../../src/cli/release-candidate';

const execFileAsync = promisify(execFile);

export interface FixtureOptions {
  /** Extra tracked files written before the initial commit. */
  files?: Record<string, string | Buffer>;
  /** Extra tracked files committed after the initial commit. */
  laterFiles?: Record<string, string | Buffer>;
  /** Skip the synthetic node_modules dependency graph. */
  withoutNodeModules?: boolean;
}

export interface SnapshotEntry {
  type: 'directory' | 'file' | 'symlink' | 'other';
  mode?: number;
  hash?: string;
  ino?: number;
  target?: string;
}

export interface ReleaseFixture {
  root: string;
  checkout: string;
  cleanup(): void;
  write(relativePath: string, contents: string | Buffer, mode?: number): string;
  mkdir(relativePath: string): string;
  symlink(target: string, relativePath: string): string;
  read(relativePath: string): Buffer;
  remove(relativePath: string): void;
  /** Remove fixture-only untracked sentinels so `--apply` sees a clean tree. */
  makeApplyClean(): void;
  add(paths: string | string[]): void;
  commit(subject: string, body?: string): void;
  runGit(args: string[]): string;
}

const DEFAULT_TRACKED: Record<string, string> = {
  'package.json': `${JSON.stringify({ name: 'kiki', version: '2.2.0' }, null, 2)}\n`,
  'package-lock.json': `${JSON.stringify(
    {
      name: 'kiki',
      version: '2.2.0',
      lockfileVersion: 3,
      packages: {
        '': { name: 'kiki', version: '2.2.0' },
      },
    },
    null,
    2,
  )}\n`,
  'src/cli/config.ts': "export const KIKI_VERSION = '2.2.0';\n",
  'CHANGELOG.md':
    '# Changelog\n\n## [Unreleased]\n\n## [2.2.0] — 2026-01-01\n\n- Initial fixture release.\n',
  'dist/cli/config.js': "export const KIKI_VERSION = '2.2.0';\n",
  'dist/stale.js': "export const STALE = true;\n",
  '.gitignore': [
    'node_modules/',
    'tmp/',
    '.agentic/routing_log.jsonl',
    '.agentic/cache/',
    'ignored-sentinel.txt',
    '.env',
    '',
  ].join('\n'),
  'docs/with space.txt': 'space path\n',
  'docs/with\nnewline.txt': 'newline path\n',
};

const FAKE_CLI = `#!/usr/bin/env node
const relativeMarker = require('./relative.js');
console.log(JSON.stringify({
  args: process.argv.slice(2),
  relative: relativeMarker,
  dir: __dirname,
}));
process.exit(process.argv.slice(2).includes('FAIL') ? 7 : 0);
`;

const NESTED_CLI = `#!/usr/bin/env node
console.log(JSON.stringify({ nested: true, args: process.argv.slice(2) }));
`;

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function assertFixturePathSafe(root: string): void {
  const resolvedRoot = resolve(root);
  const temp = resolve(tmpdir());
  const rel = relative(temp, resolvedRoot);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`fixture: refusing to operate outside the OS temp root: ${root}`);
  }
}

function safeJoin(base: string, relativePath: string): string {
  if (
    relativePath === '' ||
    relativePath.includes('\0') ||
    isAbsolute(relativePath) ||
    relativePath.split('/').includes('..')
  ) {
    throw new Error(`fixture: unsafe relative path '${relativePath}'`);
  }
  const target = resolve(base, relativePath);
  const rel = relative(base, target);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`fixture: path escapes fixture root: ${relativePath}`);
  }
  return target;
}

function writeFile(root: string, relativePath: string, contents: string | Buffer, mode?: number): string {
  const target = safeJoin(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
  if (mode !== undefined) chmodSync(target, mode);
  return target;
}

function makeNodeModules(checkout: string): void {
  const nm = join(checkout, 'node_modules');
  mkdirSync(nm, { recursive: true });

  writeFile(nm, 'fake-dep/package.json', `${JSON.stringify({ name: 'fake-dep', version: '1.0.0' })}\n`);
  writeFile(nm, 'fake-dep/index.js', 'module.exports = "fake-dep";\n');
  writeFile(nm, 'fake-dep/.cache/state.txt', 'source-cache-sentinel\n');
  writeFile(nm, 'fake-dep/.env', 'FIXTURE_ONLY=dependency-sentinel\n', 0o600);

  writeFile(nm, 'fake-cli/package.json', `${JSON.stringify({ name: 'fake-cli', version: '1.0.0' })}\n`);
  writeFile(nm, 'fake-cli/cli.js', FAKE_CLI, 0o755);
  writeFile(nm, 'fake-cli/relative.js', 'module.exports = "relative-marker";\n');

  writeFile(
    nm,
    'outer/node_modules/nested-cli/package.json',
    `${JSON.stringify({ name: 'nested-cli', version: '1.0.0' })}\n`,
  );
  writeFile(nm, 'outer/node_modules/nested-cli/cli.js', NESTED_CLI, 0o755);

  writeFile(nm, 'linked-target/real.js', 'module.exports = "linked-target";\n');
  mkdirSync(join(nm, 'linked'), { recursive: true });
  symlinkSync('../linked-target/real.js', join(nm, 'linked/alias.js'));

  mkdirSync(join(nm, '.bin'), { recursive: true });
  symlinkSync('../fake-cli/cli.js', join(nm, '.bin/fake-cli'));

  mkdirSync(join(nm, 'outer/node_modules/.bin'), { recursive: true });
  symlinkSync('../nested-cli/cli.js', join(nm, 'outer/node_modules/.bin/nested-cli'));
}

export function createReleaseFixture(options: FixtureOptions = {}): ReleaseFixture {
  const root = mkdtempSync(join(tmpdir(), 'kiki-release-fixture-'));
  assertFixturePathSafe(root);
  const checkout = join(root, "checkout with space's");
  mkdirSync(checkout, { recursive: true });

  const initialFiles: Record<string, string | Buffer> = { ...DEFAULT_TRACKED, ...(options.files ?? {}) };
  const initialPaths = Object.keys(initialFiles);
  for (const [relativePath, contents] of Object.entries(initialFiles)) {
    writeFile(checkout, relativePath, contents);
  }

  if (!options.withoutNodeModules) makeNodeModules(checkout);

  const gitEnv: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 'Fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  };

  const runGit = (args: string[]): string => {
    const subcommand = args[0];
    if (subcommand !== 'init' && subcommand !== 'add' && subcommand !== 'commit') {
      throw new Error(`fixture: git '${subcommand ?? ''}' is not permitted by the fixture wrapper`);
    }
    assertFixturePathSafe(root);
    return execFileSync('git', args, {
      cwd: checkout,
      env: gitEnv,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  };

  runGit(['init', '-q']);
  runGit(['add', '--', ...initialPaths]);
  runGit(['commit', '-q', '-m', 'feat: release v2.2.0 with synthetic fixture']);

  const laterFiles: Record<string, string | Buffer> = { ...(options.laterFiles ?? {}) };
  if (Object.keys(laterFiles).length > 0) {
    for (const [relativePath, contents] of Object.entries(laterFiles)) {
      writeFile(checkout, relativePath, contents);
    }
    runGit(['add', '--', ...Object.keys(laterFiles)]);
    runGit(['commit', '-q', '-m', 'fix: add later fixture files']);
  }

  // Deliberately ignored/untracked state exists only after the commit.
  writeFile(checkout, 'ignored-sentinel.txt', 'ignored-sentinel\n');
  writeFile(checkout, 'untracked-sentinel.txt', 'untracked-sentinel\n');
  writeFile(checkout, '.env', 'FIXTURE_ONLY=checkout-sentinel\n', 0o600);
  writeFile(checkout, '.agentic/routing_log.jsonl', '{"source":"fixture-sentinel"}\n');
  writeFile(checkout, '.agentic/cache/cache-sentinel', 'source-agentic-cache\n');
  writeFile(checkout, 'tmp/build.log', 'source-tmp-log\n');

  return {
    root,
    checkout,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
    write: (relativePath, contents, mode) => writeFile(checkout, relativePath, contents, mode),
    mkdir: relativePath => {
      const target = safeJoin(checkout, relativePath);
      mkdirSync(target, { recursive: true });
      return target;
    },
    symlink: (target, relativePath) => {
      const link = safeJoin(checkout, relativePath);
      mkdirSync(dirname(link), { recursive: true });
      symlinkSync(target, link);
      return link;
    },
    read: relativePath => readFileSync(safeJoin(checkout, relativePath)),
    remove: relativePath => rmSync(safeJoin(checkout, relativePath), { recursive: true, force: true }),
    makeApplyClean: () => {
      const output = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
        cwd: checkout,
        env: gitEnv,
        encoding: 'utf8',
        stdio: 'pipe',
      });
      for (const line of output.split('\n')) {
        if (!line.startsWith('?? ')) continue;
        rmSync(safeJoin(checkout, line.slice(3)), { recursive: true, force: true });
      }
    },
    add: paths => {
      const list = Array.isArray(paths) ? paths : [paths];
      runGit(['add', '--', ...list]);
    },
    commit: (subject, body) => {
      const args = ['commit', '-q', '-m', subject];
      if (body !== undefined) args.push('-m', body);
      runGit(args);
    },
    runGit,
  };
}

/**
 * Snapshot a synthetic tree (files, directories, symlink targets, modes and
 * inodes). Test-only: callers use fresh fixture roots, never the real repo.
 */
export function snapshotEntries(root: string): Record<string, SnapshotEntry> {
  const entries: Record<string, SnapshotEntry> = {};
  const visit = (absolute: string, rel: string): void => {
    const stat = lstatSync(absolute);
    const mode = stat.mode & 0o777;
    if (stat.isSymbolicLink()) {
      entries[rel] = { type: 'symlink', mode, target: readlinkSync(absolute) };
      return;
    }
    if (stat.isDirectory()) {
      entries[rel] = { type: 'directory', mode };
      for (const name of readdirSync(absolute).sort()) {
        visit(join(absolute, name), rel === '' ? name : `${rel}/${name}`);
      }
      return;
    }
    if (stat.isFile()) {
      entries[rel] = { type: 'file', mode, ino: stat.ino, hash: sha256(readFileSync(absolute)) };
      return;
    }
    entries[rel] = { type: 'other', mode };
  };
  visit(root, '');
  return entries;
}

/** Real child-process runner used only by tests to exercise readGit. */
export const fixtureRunner: CommandRunner = async (file, args, options): Promise<CommandResult> => {
  try {
    const result = await execFileAsync(file, args, {
      cwd: options.cwd,
      env: options.env,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    return { status: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as {
      code?: number | string;
      stdout?: string;
      stderr?: string;
      message?: string;
      signal?: NodeJS.Signals | null;
    };
    return {
      status: typeof failure.code === 'number' ? failure.code : 1,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? failure.message ?? String(error),
      signal: failure.signal ?? null,
    };
  }
};

/** Names of candidate run roots currently present under the OS temp dir. */
export function releaseTempRoots(): Set<string> {
  return new Set(
    readdirSync(tmpdir())
      .filter(name => name.startsWith('kiki-candidate-'))
      .map(name => join(tmpdir(), name)),
  );
}

/** Names of relocated apply backups currently present under the OS temp dir. */
export function releasePreservedBackups(): Set<string> {
  return new Set(
    readdirSync(tmpdir())
      .filter(name => name.startsWith('kiki-release-backup-'))
      .map(name => join(tmpdir(), name)),
  );
}
