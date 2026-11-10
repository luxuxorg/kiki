import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  createCandidate,
  readGit,
  type Candidate,
  type CommandRunner,
} from '../../src/cli/release-candidate';
import { runCandidateGates, type GateResult } from '../../src/cli/release-gates';
import {
  createReleaseFixture,
  fixtureRunner,
  type ReleaseFixture,
} from '../helpers/release-fixture';

const enabled = process.env.KIKI_RELEASE_TEST_REAL_TSC === '1';
const TIMEOUT = 120_000;
const NEXT = '2.0.0';
const DATE = '2026-11-04';
const TYPESCRIPT_SOURCE = resolve('node_modules/typescript');

const FIXTURE_PACKAGE = `${JSON.stringify(
  {
    name: 'kiki',
    version: '1.0.0',
    type: 'module',
    scripts: { test: 'exit 0' },
  },
  null,
  2,
)}\n`;
const FIXTURE_LOCK = `${JSON.stringify(
  {
    name: 'kiki',
    version: '1.0.0',
    lockfileVersion: 3,
    packages: { '': { name: 'kiki', version: '1.0.0' } },
  },
  null,
  2,
)}\n`;
const FIXTURE_CONFIG = [
  "export const KIKI_VERSION = '1.0.0';",
  'export const DEFAULT_CONFIG = {};',
  'export function generateAllTemplates(',
  '  _config: unknown,',
  "  _scope: 'global' | 'project' = 'project',",
  '  version: string = KIKI_VERSION,',
  '): { plugin: string } {',
  "  return { plugin: \"const KIKI_PLUGIN_VERSION = '\" + version + \"';\" };",
  '}',
  '',
].join('\n');
const FIXTURE_TSCONFIG = `${JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      outDir: './dist',
      rootDir: './src',
      strict: true,
      skipLibCheck: true,
      declaration: true,
    },
    include: ['src/**/*'],
  },
  null,
  2,
)}\n`;
const FIXTURE_CHANGELOG =
  '# Changelog\n\n## [Unreleased]\n\n- Pending real-build fixture note.\n\n## [1.0.0] — 2026-01-01\n\n- Initial.\n';

let fixture: ReleaseFixture | undefined;
let candidate: Candidate | undefined;
let originalTmp: string | undefined;
let testTmp: string;

beforeEach(() => {
  originalTmp = process.env.TMPDIR;
  testTmp = mkdtempSync(join(tmpdir(), 'kiki-real-build-'));
  process.env.TMPDIR = testTmp;
});

afterEach(async () => {
  if (candidate !== undefined) {
    try {
      await candidate.dispose();
    } catch {
      // Test teardown only.
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

function gate(results: GateResult[], name: GateResult['name']): GateResult {
  const result = results.find((entry) => entry.name === name);
  if (!result) throw new Error(`missing gate ${name}`);
  return result;
}

describe.skipIf(!enabled)('opt-in real candidate build', () => {
  it('builds and typechecks a minimal candidate with the real local TypeScript compiler', async () => {
    if (!existsSync(TYPESCRIPT_SOURCE)) {
      throw new Error(
        `release-real-build: local TypeScript is required at ${TYPESCRIPT_SOURCE}; run in the disposable installed validation copy.`,
      );
    }

    fixture = createReleaseFixture({
      withoutNodeModules: true,
      files: {
        'package.json': FIXTURE_PACKAGE,
        'package-lock.json': FIXTURE_LOCK,
        'src/cli/config.ts': FIXTURE_CONFIG,
        'src/cli/index.ts': 'export const cliEntry = true;\n',
        'src/index.ts': 'export const packageEntry = true;\n',
        'src/server/index.ts': 'export const serverEntry = true;\n',
        'src/tui/index.ts': 'export const tuiEntry = true;\n',
        'tsconfig.json': FIXTURE_TSCONFIG,
        'CHANGELOG.md': FIXTURE_CHANGELOG,
      },
    });

    const checkoutNodeModules = join(fixture.checkout, 'node_modules');
    cpSync(TYPESCRIPT_SOURCE, join(checkoutNodeModules, 'typescript'), {
      recursive: true,
      dereference: true,
    });
    mkdirSync(join(checkoutNodeModules, 'eslint/bin'), { recursive: true });
    writeFileSync(join(checkoutNodeModules, 'eslint/bin/eslint.js'), 'export {};\n');

    const raw = await readGit(fixtureRunner, fixture.checkout, 'ls-files', ['-z']);
    const tracked = raw.split('\0').filter(Boolean);
    candidate = await createCandidate(fixture.checkout, tracked);
    const root = candidate.root;
    const tsc = join(root, 'node_modules/typescript/bin/tsc');
    const eslint = join(root, 'node_modules/eslint/bin/eslint.js');

    const runner: CommandRunner = async (file, args, options) => {
      if (file === process.execPath && (args[0] === tsc || args[0]?.endsWith('release-gate-check.mjs') === true)) {
        return fixtureRunner(file, args, options);
      }
      if (file === process.execPath && args[0] === eslint) {
        return { status: 0, stdout: 'injected lint success\n', stderr: '' };
      }
      if (file === 'npm' && args[0] === 'test') {
        return { status: 0, stdout: 'injected test success\n', stderr: '' };
      }
      if (file === 'npm' && args[0] === 'audit') {
        return {
          status: 0,
          stdout: JSON.stringify({
            auditReportVersion: 2,
            vulnerabilities: {},
            metadata: {
              vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
            },
          }),
          stderr: '',
        };
      }
      throw new Error(`release-real-build: unexpected subprocess ${file} ${args.join(' ')}`);
    };

    const results = await runCandidateGates(candidate, NEXT, DATE, runner);

    expect(results.map((entry) => entry.status)).toEqual([
      'passed',
      'passed',
      'passed',
      'passed',
      'passed',
      'passed',
    ]);
    expect(gate(results, 'build').detail).toContain('build: passed');
    expect(gate(results, 'typecheck').detail).toContain('typecheck: passed (src/)');

    const emitted = readFileSync(join(root, 'dist/cli/config.js'), 'utf8');
    expect(emitted).toContain(`KIKI_VERSION = '${NEXT}'`);
    expect(emitted).not.toContain(`KIKI_VERSION = '1.0.0'`);
    expect(readFileSync(join(root, 'package.json'), 'utf8')).toContain(`"version": "${NEXT}"`);
  }, TIMEOUT);
});
