import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  createCandidate,
  readGit,
  type Candidate,
} from '../../src/cli/release-candidate';
import { validateCandidate } from '../../src/cli/release-gates';
import {
  createReleaseFixture,
  fixtureRunner,
  type ReleaseFixture,
} from '../helpers/release-fixture';

const NEXT = '2.3.0';
const DATE = '2026-11-04';
const DISTRIBUTABLE_OUTPUTS = [
  'dist/cli/index.js',
  'dist/index.js',
  'dist/index.d.ts',
  'dist/tui/index.js',
  'dist/tui/index.d.ts',
];

const control = vi.hoisted(() => ({
  forbidReads: new Set<string>(),
  readCalls: [] as string[],
}));

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const readFileChecked = (async (...args: unknown[]) => {
    const path = String(args[0]);
    control.readCalls.push(path);
    if (control.forbidReads.has(path)) throw new Error(`FORBIDDEN_READ:${path}`);
    return (actual.readFile as (...inner: unknown[]) => Promise<unknown>)(...args);
  }) as typeof actual.readFile;
  return { ...actual, readFile: readFileChecked };
});

let fixture: ReleaseFixture;
let originalTmp: string | undefined;
let testTmp: string;
let candidate: Candidate | undefined;

beforeEach(() => {
  originalTmp = process.env.TMPDIR;
  testTmp = mkdtempSync(join(tmpdir(), 'kiki-gates-spy-test-'));
  process.env.TMPDIR = testTmp;
  fixture = createReleaseFixture();
  control.forbidReads.clear();
  control.readCalls.length = 0;
  candidate = undefined;
});

afterEach(async () => {
  if (candidate !== undefined) {
    try {
      await candidate.dispose();
    } catch {
      // Test teardown only.
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

function fakeConfigModule(version: string): string {
  return [
    `export const KIKI_VERSION = '${version}';`,
    'export const DEFAULT_CONFIG = {};',
    'export function generateAllTemplates(_config, _scope, version = KIKI_VERSION) {',
    `  return { plugin: "const KIKI_PLUGIN_VERSION = '${version}';" };`,
    '}',
    '',
  ].join('\n');
}

async function prepareInvariantCandidate(): Promise<Candidate> {
  const created = await createCandidate(fixture.checkout, await trackedPaths());
  const root = created.root;
  const packageData = {
    name: 'kiki',
    version: NEXT,
    type: 'module',
    main: 'dist/index.js',
    types: 'dist/index.d.ts',
    bin: { kiki: 'dist/cli/index.js' },
    exports: {
      './tui': { types: './dist/tui/index.d.ts', import: './dist/tui/index.js' },
      '.': { types: './dist/index.d.ts', import: './dist/index.js', require: './dist/index.js' },
    },
  };
  await writeFile(join(root, 'package.json'), `${JSON.stringify(packageData, null, 2)}\n`);
  await writeFile(
    join(root, 'package-lock.json'),
    `${JSON.stringify(
      {
        name: 'kiki',
        version: NEXT,
        lockfileVersion: 3,
        packages: { '': { name: 'kiki', version: NEXT } },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(join(root, 'src/cli/config.ts'), `export const KIKI_VERSION = '${NEXT}';\n`);
  await writeFile(
    join(root, 'CHANGELOG.md'),
    `# Changelog\n\n## [Unreleased]\n\n## [${NEXT}] — ${DATE}\n\n### Added\n- Release notes.\n`,
  );
  await rm(join(root, 'dist/stale.js'), { force: true });
  await mkdir(join(root, 'dist/cli'), { recursive: true });
  await writeFile(join(root, 'dist/cli/config.js'), fakeConfigModule(NEXT));
  for (const output of DISTRIBUTABLE_OUTPUTS) {
    await mkdir(dirname(join(root, output)), { recursive: true });
    await writeFile(join(root, output), 'export const fixture = true;\n');
  }
  candidate = created;
  return created;
}

describe('release-gates secret traversal safety', () => {
  it('does not read untracked secret-bearing gate directories such as secrets/ or credentials/', async () => {
    const created = await prepareInvariantCandidate();
    const secretsFile = join(created.root, 'secrets/data.json');
    const credentialsFile = join(created.root, 'credentials/config.json');
    control.forbidReads.add(secretsFile);
    control.forbidReads.add(credentialsFile);

    await mkdir(dirname(secretsFile), { recursive: true });
    await writeFile(secretsFile, '{"FIXTURE_ONLY":"secret-data"}\n');
    await mkdir(dirname(credentialsFile), { recursive: true });
    await writeFile(credentialsFile, '{"FIXTURE_ONLY":"credential-config"}\n');

    await expect(validateCandidate(created, NEXT, DATE)).resolves.toBeUndefined();
    expect(control.readCalls).not.toContain(secretsFile);
    expect(control.readCalls).not.toContain(credentialsFile);
  });

  it('fails safely without reading an unexpected tracked secret-bearing path', async () => {
    const created = await prepareInvariantCandidate();
    const trackedSecret = join(created.root, 'secrets/tracked-data.json');
    control.forbidReads.add(trackedSecret);
    await mkdir(dirname(trackedSecret), { recursive: true });
    await writeFile(trackedSecret, '{"FIXTURE_ONLY":"tracked-secret"}\n');
    created.before.set('secrets/tracked-data.json', Buffer.from('{"FIXTURE_ONLY":"before"}\n'));

    await expect(validateCandidate(created, NEXT, DATE)).rejects.toThrow(/secret|safely/i);
    expect(control.readCalls).not.toContain(trackedSecret);
    expect(control.readCalls.join('\n')).not.toContain('FORBIDDEN_READ');
  });
});
