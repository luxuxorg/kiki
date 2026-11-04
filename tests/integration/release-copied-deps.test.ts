import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  createCandidate,
  readGit,
  type Candidate,
} from '../../src/cli/release-candidate';
import {
  createReleaseFixture,
  fixtureRunner,
  snapshotEntries,
  type ReleaseFixture,
  type SnapshotEntry,
} from '../helpers/release-fixture';

const WORKSPACE_NODE_MODULES = resolve('node_modules');
const TEST_TIMEOUT = 120_000;

// Vitest 4 writes its own runner cache under node_modules/.vite while the
// outer test runs. That cache is not an installed dependency. Exclude only
// that cache from the live-workspace comparison; fixture and candidate
// dependency snapshots remain unfiltered so real mutations are still caught.
function workspaceDependencySnapshot(root: string): Record<string, SnapshotEntry> {
  return Object.fromEntries(
    Object.entries(snapshotEntries(root))
      .filter(([relativePath]) => !relativePath.startsWith('.vite/')),
  );
}

let workspaceDependenciesBefore: Record<string, SnapshotEntry>;

beforeAll(() => {
  if (!existsSync(WORKSPACE_NODE_MODULES)) {
    throw new Error(
      `release-copied-deps: local node_modules is required at ${WORKSPACE_NODE_MODULES}; run this integration test in the disposable installed validation copy.`,
    );
  }
  workspaceDependenciesBefore = workspaceDependencySnapshot(WORKSPACE_NODE_MODULES);
}, TEST_TIMEOUT);

let originalTmp: string | undefined;
let testTmp: string;
let fixture: ReleaseFixture | undefined;
let candidate: Candidate | undefined;

afterEach(async () => {
  if (candidate !== undefined) {
    try {
      await candidate.dispose();
    } catch {
      // Cleanup assertions run inside each test; this is only test teardown.
    }
    candidate = undefined;
  }
  fixture?.cleanup();
  fixture = undefined;
  if (originalTmp === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = originalTmp;
  if (testTmp !== undefined) {
    rmSync(testTmp, { recursive: true, force: true });
    testTmp = '';
  }
});

function packageJson(name: string): string {
  return `${JSON.stringify(
    {
      name,
      version: '1.0.0',
      private: true,
      type: 'module',
      scripts: {
        test: 'vitest run',
      },
      devDependencies: {
        vitest: '^1.6.0',
      },
    },
    null,
    2,
  )}\n`;
}

function packageLock(name: string): string {
  return `${JSON.stringify(
    {
      name,
      version: '1.0.0',
      lockfileVersion: 3,
      requires: true,
      packages: {
        '': {
          name,
          version: '1.0.0',
          devDependencies: { vitest: '^1.6.0' },
        },
      },
    },
    null,
    2,
  )}\n`;
}

const VITEST_CONFIG = [
  "import { defineConfig } from 'vitest/config';",
  '',
  'export default defineConfig({',
  "  test: { include: ['tests/smoke.test.ts'] },",
  '});',
  '',
].join('\n');

function passingSmoke(): string {
  return [
    "import { test, expect } from 'vitest';",
    "import { createRequire } from 'node:module';",
    "import { mkdirSync, writeFileSync } from 'node:fs';",
    "import { dirname, join } from 'node:path';",
    "import { fileURLToPath } from 'node:url';",
    '',
    'const require = createRequire(import.meta.url);',
    'const here = dirname(fileURLToPath(import.meta.url));',
    '',
    "test('release candidate copied dependency smoke', () => {",
    "  const resolved = require.resolve('vitest/package.json');",
    "  expect(resolved.startsWith(join(process.cwd(), 'node_modules'))).toBe(true);",
    "  const markerDir = join(process.cwd(), 'tmp');",
    '  mkdirSync(markerDir, { recursive: true });',
    "  writeFileSync(join(markerDir, 'smoke-ran'), 'ok');",
    "  writeFileSync(join(markerDir, 'resolved-vitest.txt'), resolved);",
    "  expect(here.startsWith(process.cwd())).toBe(true);",
    '});',
    '',
  ].join('\n');
}

function failingSmoke(): string {
  return [
    "import { test, expect } from 'vitest';",
    '',
    "test('release candidate copied dependency smoke failure', () => {",
    '  expect(2 + 2).toBe(5);',
    '});',
    '',
  ].join('\n');
}

function makeSourceFixture(smoke: string): ReleaseFixture {
  const name = 'release-copied-deps-fixture';
  const created = createReleaseFixture({
    withoutNodeModules: true,
    files: {
      'package.json': packageJson(name),
      'package-lock.json': packageLock(name),
      'vitest.config.mjs': VITEST_CONFIG,
      'tests/smoke.test.ts': smoke,
    },
  });
  const destination = join(created.checkout, 'node_modules');
  cpSync(WORKSPACE_NODE_MODULES, destination, {
    recursive: true,
    dereference: false,
    verbatimSymlinks: true,
  });
  return created;
}

async function trackedPaths(source: ReleaseFixture): Promise<string[]> {
  const raw = await readGit(fixtureRunner, source.checkout, 'ls-files', ['-z']);
  return raw.split('\0').filter(Boolean);
}

describe('real copied-dependency candidate npm test', () => {
  it('runs the candidate-local Vitest entrypoint through npm test with no source dependency writes', async () => {
    originalTmp = process.env.TMPDIR;
    testTmp = mkdtempSync(join(tmpdir(), "kiki copied deps success 'exam'- "));
    process.env.TMPDIR = testTmp;
    fixture = makeSourceFixture(passingSmoke());

    const sourceDependenciesBefore = snapshotEntries(join(fixture.checkout, 'node_modules'));
    candidate = await createCandidate(fixture.checkout, await trackedPaths(fixture));
    const candidateRoot = candidate.root;
    const candidateRunRoot = candidate.runRoot;
    const candidateEntrypoint = join(candidateRoot, 'node_modules/.bin/vitest');
    const candidateDependenciesBefore = snapshotEntries(join(candidateRoot, 'node_modules'));

    const result = await fixtureRunner('npm', ['test', '--', '--reporter=verbose'], {
      cwd: candidateRoot,
      env: candidate.npmEnv,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('release candidate copied dependency smoke');
    expect(result.stdout).not.toContain('release candidate copied dependency smoke failure');

    const marker = join(candidateRoot, 'tmp/smoke-ran');
    expect(existsSync(marker)).toBe(true);
    expect(readFileSync(marker, 'utf8')).toBe('ok');
    const resolvedVitest = readFileSync(join(candidateRoot, 'tmp/resolved-vitest.txt'), 'utf8');
    expect(resolvedVitest.startsWith(join(candidateRoot, 'node_modules'))).toBe(true);
    expect(resolvedVitest).not.toContain(fixture.checkout);
    expect(resolvedVitest).not.toContain(WORKSPACE_NODE_MODULES);

    expect(existsSync(candidateEntrypoint)).toBe(true);
    const shim = readFileSync(candidateEntrypoint, 'utf8');
    expect(shim.startsWith('#!/bin/sh\nexec ')).toBe(true);
    expect(shim).toContain(candidateRoot.replace(/'/g, "'\\''"));
    expect(shim).toContain('node_modules/vitest/vitest.mjs');
    expect(shim).not.toContain(fixture.checkout);
    expect(shim).not.toContain(WORKSPACE_NODE_MODULES);

    const candidateDependenciesAfter = snapshotEntries(join(candidateRoot, 'node_modules'));
    const candidateSymlinks = Object.values(candidateDependenciesAfter).filter(
      (entry) => entry.type === 'symlink',
    );
    expect(candidateSymlinks).toHaveLength(0);

    const sourceVitest = join(fixture.checkout, 'node_modules/vitest/package.json');
    const candidateVitest = join(candidateRoot, 'node_modules/vitest/package.json');
    expect(candidateDependenciesBefore[relativeKey(join(candidateRoot, 'node_modules'), candidateVitest)]).toBeDefined();
    expect(candidateDependenciesAfter[relativeKey(join(candidateRoot, 'node_modules'), candidateVitest)]?.ino).not.toBe(
      sourceDependenciesBefore[relativeKey(join(fixture.checkout, 'node_modules'), sourceVitest)]?.ino,
    );

    expect(snapshotEntries(join(fixture.checkout, 'node_modules'))).toEqual(sourceDependenciesBefore);
    expect(workspaceDependencySnapshot(WORKSPACE_NODE_MODULES)).toEqual(workspaceDependenciesBefore);

    await candidate.dispose();
    expect(existsSync(candidateRunRoot)).toBe(false);
    candidate = undefined;

  }, TEST_TIMEOUT);

  it('propagates a nonzero exit from the real candidate npm test failure case', async () => {
    originalTmp = process.env.TMPDIR;
    testTmp = mkdtempSync(join(tmpdir(), "kiki copied deps failure 'exam'- "));
    process.env.TMPDIR = testTmp;
    fixture = makeSourceFixture(failingSmoke());

    const sourceDependenciesBefore = snapshotEntries(join(fixture.checkout, 'node_modules'));
    candidate = await createCandidate(fixture.checkout, await trackedPaths(fixture));
    const candidateRoot = candidate.root;
    const candidateRunRoot = candidate.runRoot;

    const result = await fixtureRunner('npm', ['test', '--', '--reporter=verbose'], {
      cwd: candidateRoot,
      env: candidate.npmEnv,
    });

    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('release candidate copied dependency smoke failure');
    expect(result.stdout + result.stderr).toContain('expected 4 to be 5');
    expect(existsSync(join(candidateRoot, 'tmp/smoke-ran'))).toBe(false);

    expect(snapshotEntries(join(fixture.checkout, 'node_modules'))).toEqual(sourceDependenciesBefore);
    expect(workspaceDependencySnapshot(WORKSPACE_NODE_MODULES)).toEqual(workspaceDependenciesBefore);

    await candidate.dispose();
    expect(existsSync(candidateRunRoot)).toBe(false);
    candidate = undefined;
  }, TEST_TIMEOUT);
});

describe('pre-shimmed dependency trees', () => {
  it('regenerates a kiki .bin shim against the candidate-local entrypoint', async () => {
    originalTmp = process.env.TMPDIR;
    testTmp = mkdtempSync(join(tmpdir(), 'kiki-pre-shimmed-'));
    process.env.TMPDIR = testTmp;
    fixture = createReleaseFixture({ withoutNodeModules: true });
    const outerCandidateRoot = join(testTmp, 'kiki-candidate-outer');
    fixture.write(
      'node_modules/fake-pkg/package.json',
      `${JSON.stringify({ name: 'fake-pkg', version: '1.0.0' })}\n`,
    );
    fixture.write(
      'node_modules/fake-pkg/cli.mjs',
      "#!/usr/bin/env node\nconsole.log('fake');\n",
      0o755,
    );
    fixture.write(
      'node_modules/.bin/fake-cli',
      `#!/bin/sh\nexec '/usr/bin/node' '${outerCandidateRoot}/node_modules/fake-pkg/cli.mjs' "$@"\n`,
      0o755,
    );

    candidate = await createCandidate(fixture.checkout, await trackedPaths(fixture));
    const candidateRoot = candidate.root;
    const candidateRunRoot = candidate.runRoot;
    const shim = readFileSync(join(candidateRoot, 'node_modules', '.bin', 'fake-cli'), 'utf8');

    expect(shim.startsWith('#!/bin/sh\nexec ')).toBe(true);
    expect(shim).toContain(candidateRoot.replace(/'/g, "'\\''"));
    expect(shim).toContain('node_modules/fake-pkg/cli.mjs');
    expect(shim).not.toContain(outerCandidateRoot);

    await candidate.dispose();
    expect(existsSync(candidateRunRoot)).toBe(false);
    candidate = undefined;
  }, TEST_TIMEOUT);
});

function relativeKey(root: string, absolute: string): string {
  return absolute.slice(root.length + 1).split('\\').join('/');
}

