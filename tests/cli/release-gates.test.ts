import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  createCandidate,
  readGit,
  type Candidate,
  type CommandResult,
  type CommandRunner,
} from '../../src/cli/release-candidate';
import {
  createAuditInvocation,
  runCandidateGates,
  validateCandidate,
  type GateResult,
} from '../../src/cli/release-gates';
import {
  createReleaseFixture,
  fixtureRunner,
  type ReleaseFixture,
} from '../helpers/release-fixture';

const NEXT = '2.3.0';
const DATE = '2026-11-04';
const PACKAGE_JSON = `${JSON.stringify(
  { name: 'kiki', version: '2.2.0', type: 'module', scripts: { test: 'vitest run' } },
  null,
  2,
)}\n`;
const PACKAGE_LOCK = `${JSON.stringify(
  {
    name: 'kiki',
    version: '2.2.0',
    lockfileVersion: 3,
    packages: { '': { name: 'kiki', version: '2.2.0' } },
  },
  null,
  2,
)}\n`;
const CHANGELOG =
  '# Changelog\n\n## [Unreleased]\n\n- Existing pending note.\n\n## [2.2.0] — 2026-01-01\n\n- Prior release.\n';

let fixture: ReleaseFixture;
let originalTmp: string | undefined;
let testTmp: string;
let candidates: Candidate[];

beforeEach(() => {
  originalTmp = process.env.TMPDIR;
  testTmp = mkdtempSync(join(tmpdir(), 'kiki-gates-test-'));
  process.env.TMPDIR = testTmp;
  candidates = [];
  fixture = createReleaseFixture({
    files: {
      'package.json': PACKAGE_JSON,
      'package-lock.json': PACKAGE_LOCK,
      'CHANGELOG.md': CHANGELOG,
    },
  });
});

afterEach(async () => {
  for (const candidate of candidates) {
    try {
      await candidate.dispose();
    } catch {
      // Best-effort test cleanup; assertions cover productive cleanup paths.
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

async function newCandidate(): Promise<Candidate> {
  const candidate = await createCandidate(fixture.checkout, await trackedPaths());
  candidates.push(candidate);
  return candidate;
}

async function installFakeTools(candidate: Candidate): Promise<{ tsc: string; eslint: string }> {
  const tsc = join(candidate.root, 'node_modules/typescript/bin/tsc');
  const eslint = join(candidate.root, 'node_modules/eslint/bin/eslint.js');
  await mkdir(join(candidate.root, 'node_modules/typescript/bin'), { recursive: true });
  await mkdir(join(candidate.root, 'node_modules/eslint/bin'), { recursive: true });
  await writeFile(tsc, 'console.log("fake tsc");\n');
  await writeFile(eslint, 'console.log("fake eslint");\n');
  return { tsc, eslint };
}

function fakeConfigModule(version: string, pluginVersion = version): string {
  return [
    `export const KIKI_VERSION = '${version}';`,
    'export const DEFAULT_CONFIG = {};',
    'export function generateAllTemplates(_config, _scope, version = KIKI_VERSION) {',
    `  return { plugin: "const KIKI_PLUGIN_VERSION = '${pluginVersion}';" + version.slice(0, 0) };`,
    '}',
    '',
  ].join('\n');
}

const DISTRIBUTABLE_OUTPUTS = [
  'dist/cli/index.js',
  'dist/index.js',
  'dist/index.d.ts',
  'dist/server/index.js',
  'dist/server/index.d.ts',
  'dist/tui/index.js',
  'dist/tui/index.d.ts',
];

async function writeDistributableOutputs(candidate: Candidate): Promise<void> {
  const files: Record<string, string> = {
    'dist/cli/index.js': 'export const cli = true;\n',
    'dist/index.js': 'export const index = true;\n',
    'dist/index.d.ts': 'export declare const index: true;\n',
    'dist/server/index.js': 'export const server = true;\n',
    'dist/server/index.d.ts': 'export declare const server: true;\n',
    'dist/tui/index.js': 'export const tui = true;\n',
    'dist/tui/index.d.ts': 'export declare const tui: true;\n',
  };
  for (const [relativePath, contents] of Object.entries(files)) {
    await mkdir(dirname(join(candidate.root, relativePath)), { recursive: true });
    await writeFile(join(candidate.root, relativePath), contents);
  }
}

async function writeBuiltDist(candidate: Candidate, pluginVersion = NEXT): Promise<void> {
  await mkdir(join(candidate.root, 'dist/cli'), { recursive: true });
  await writeFile(join(candidate.root, 'dist/cli/config.js'), fakeConfigModule(NEXT, pluginVersion));
  await writeDistributableOutputs(candidate);
}

interface RecordedCall {
  file: string;
  args: string[];
  options: { cwd: string; env: NodeJS.ProcessEnv };
}

interface FakeRunnerOptions {
  audit?: () => CommandResult | Promise<CommandResult>;
  onCall?: (call: RecordedCall) => Promise<CommandResult | undefined> | CommandResult | undefined;
}

function createFakeRunner(
  candidate: Candidate,
  options: FakeRunnerOptions = {},
): { runner: CommandRunner; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const runner: CommandRunner = async (file, args, callOptions) => {
    const call: RecordedCall = {
      file,
      args: [...args],
      options: { cwd: callOptions.cwd, env: { ...callOptions.env } },
    };
    calls.push(call);
    if (options.onCall !== undefined) {
      const override = await options.onCall(call);
      if (override !== undefined) return override;
    }

    const tsc = join(candidate.root, 'node_modules/typescript/bin/tsc');
    const eslint = join(candidate.root, 'node_modules/eslint/bin/eslint.js');

    if (file === process.execPath && args[0] === tsc) {
      if (!args.includes('--noEmit')) await writeBuiltDist(candidate);
      return { status: 0, stdout: 'tsc ok\n', stderr: '' };
    }
    if (file === process.execPath && args[0] === eslint) {
      return { status: 0, stdout: 'eslint ok\n', stderr: '' };
    }
    if (file === process.execPath && args[0]?.endsWith('release-gate-check.mjs') === true) {
      return { status: 0, stdout: `${NEXT}\n`, stderr: '' };
    }
    if (file === 'npm' && args[0] === 'test') {
      return { status: 0, stdout: 'test ok\n', stderr: '' };
    }
    if (file === 'npm' && args[0] === 'audit') {
      if (options.audit !== undefined) return options.audit();
      return { status: 0, stdout: cleanAuditJson(), stderr: '' };
    }
    throw new Error(`unexpected subprocess: ${file} ${args.join(' ')}`);
  };
  return { runner, calls };
}

function auditJson(input: {
  low?: number;
  moderate?: number;
  high?: number;
  critical?: number;
  includeDevVulnerability?: boolean;
}): string {
  const low = input.low ?? 0;
  const moderate = input.moderate ?? 0;
  const high = input.high ?? 0;
  const critical = input.critical ?? 0;
  const vulnerabilities: Record<string, unknown> = {};
  if (input.includeDevVulnerability === true && high + critical > 0) {
    vulnerabilities['dev-only'] = {
      name: 'dev-only',
      severity: critical > 0 ? 'critical' : 'high',
      isDirect: false,
      via: [],
      effects: [],
      range: '*',
      nodes: [],
      fixAvailable: false,
      dev: true,
    };
  }
  return JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities,
    metadata: {
      vulnerabilities: {
        info: 0,
        low,
        moderate,
        high,
        critical,
        total: low + moderate + high + critical,
      },
    },
  });
}

function cleanAuditJson(): string {
  return auditJson({});
}

function buildAuditErrorJson(): string {
  return JSON.stringify({
    error: {
      code: 'ENETUNREACH',
      summary: 'request to https://registry.invalid.example failed',
      detail: 'network unavailable',
    },
  });
}

function gate(results: GateResult[], name: GateResult['name']): GateResult {
  const result = results.find((entry) => entry.name === name);
  if (!result) throw new Error(`missing gate ${name}`);
  return result;
}

async function prepareInvariantCandidate(
  candidate: Candidate,
  options: {
    packageVersion?: string;
    lockRootVersion?: string;
    lockPackageVersion?: string;
    configVersion?: string;
    distVersion?: string;
    pluginVersion?: string;
    changelog?: string;
    omitOutput?: boolean;
    omitPackageEntrypoints?: boolean;
  } = {},
): Promise<void> {
  const packageVersion = options.packageVersion ?? NEXT;
  const lockRootVersion = options.lockRootVersion ?? NEXT;
  const lockPackageVersion = options.lockPackageVersion ?? NEXT;
  const configVersion = options.configVersion ?? NEXT;
  const distVersion = options.distVersion ?? NEXT;
  const pluginVersion = options.pluginVersion ?? NEXT;
  const changelog =
    options.changelog ??
    `# Changelog\n\n## [Unreleased]\n\n## [${NEXT}] — ${DATE}\n\n### Added\n- Release notes.\n`;

  const packageData: Record<string, unknown> = {
    name: 'kiki',
    version: packageVersion,
    type: 'module',
    scripts: { test: 'vitest run' },
  };
  if (options.omitPackageEntrypoints !== true) {
    packageData.main = 'dist/index.js';
    packageData.types = 'dist/index.d.ts';
    packageData.bin = { kiki: 'dist/cli/index.js' };
    packageData.exports = {
      './server': { types: './dist/server/index.d.ts', import: './dist/server/index.js' },
      './tui': { types: './dist/tui/index.d.ts', import: './dist/tui/index.js' },
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.js',
        require: './dist/index.js',
      },
    };
  }
  await writeFile(join(candidate.root, 'package.json'), `${JSON.stringify(packageData, null, 2)}\n`);
  await writeFile(
    join(candidate.root, 'package-lock.json'),
    `${JSON.stringify(
      {
        name: 'kiki',
        version: lockRootVersion,
        lockfileVersion: 3,
        packages: { '': { name: 'kiki', version: lockPackageVersion } },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(candidate.root, 'src/cli/config.ts'),
    `export const KIKI_VERSION = '${configVersion}';\n`,
  );
  await writeFile(join(candidate.root, 'CHANGELOG.md'), changelog);
  await rm(join(candidate.root, 'dist/stale.js'), { force: true });
  await rm(join(candidate.root, 'dist/cli/config.js'), { force: true });
  for (const output of DISTRIBUTABLE_OUTPUTS) {
    await rm(join(candidate.root, output), { force: true });
  }
  if (options.omitOutput !== true) {
    await writeFile(join(candidate.root, 'dist/cli/config.js'), fakeConfigModule(distVersion, pluginVersion));
    await writeDistributableOutputs(candidate);
  }
}

describe('createAuditInvocation', () => {
  it('sanitizes every case-insensitive npm_config key and redirects all writable state', async () => {
    const root = join(testTmp, 'audit-root');
    const runRoot = join(testTmp, 'audit-run');
    await mkdir(root, { recursive: true });
    await mkdir(runRoot, { recursive: true });

    const ambient: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: '/sentinel-home',
      KEEP_ME: 'kept',
      NODE_ENV: 'production',
      npm_config_omit: 'dev',
      NPM_CONFIG_OMIT: 'dev',
      npm_config_only: 'production',
      NPM_CONFIG_INCLUDE: 'prod',
      npm_config_userconfig: '/sentinel/user.npmrc',
      npm_config_globalconfig: '/sentinel/global.npmrc',
      npm_config_cache: '/sentinel/cache',
      npm_config_logs_dir: '/sentinel/logs',
      npm_config_tmp: '/sentinel/tmp',
      'npm_config_//registry.example.invalid/:_authToken': 'SECRET-SENTINEL',
      NODE_AUTH_TOKEN: 'SECRET-SENTINEL',
      NPM_TOKEN: 'SECRET-SENTINEL',
    };
    const before = structuredClone(ambient);

    const invocation = await createAuditInvocation(root, runRoot, ambient);

    expect(ambient).toEqual(before);
    expect(invocation.file).toBe('npm');
    expect(invocation.args).toEqual([
      'audit',
      '--json',
      '--include=dev',
      '--include=optional',
      '--include=peer',
    ]);
    expect(invocation.options.cwd).toBe(root);

    const env = invocation.options.env;
    expect(env.NODE_ENV).toBe('development');
    expect(env.KEEP_ME).toBe('kept');
    expect(env.HOME).toBe('/sentinel-home');
    expect(JSON.stringify(env)).not.toContain('SECRET-SENTINEL');
    expect(env.NODE_AUTH_TOKEN).toBeUndefined();
    expect(env.NPM_TOKEN).toBeUndefined();

    const npmKeys = Object.keys(env)
      .filter((key) => /^npm_config_/i.test(key))
      .map((key) => key.toLowerCase())
      .sort();
    expect(npmKeys).toEqual(
      [
        'npm_config_cache',
        'npm_config_globalconfig',
        'npm_config_logs_dir',
        'npm_config_tmp',
        'npm_config_userconfig',
      ].sort(),
    );

    const tmp = join(runRoot, 'tmp');
    expect(env.npm_config_cache).toBe(join(runRoot, 'cache'));
    expect(env.npm_config_logs_dir).toBe(join(runRoot, 'logs'));
    expect(env.npm_config_tmp).toBe(tmp);
    expect(env.TMPDIR).toBe(tmp);
    expect(env.TMP).toBe(tmp);
    expect(env.TEMP).toBe(tmp);

    for (const key of ['npm_config_userconfig', 'npm_config_globalconfig'] as const) {
      const path = env[key];
      expect(path).toBeDefined();
      expect(path?.startsWith(runRoot)).toBe(true);
      expect((await stat(path as string)).size).toBe(0);
      expect((await stat(path as string)).mode & 0o777).toBe(0o600);
    }
    for (const directory of ['cache', 'logs', 'tmp']) {
      expect((await stat(join(runRoot, directory))).isDirectory()).toBe(true);
    }
  });

  it('refuses a root .npmrc using metadata only without reading or printing it', async () => {
    const root = join(testTmp, 'npmrc-root');
    const runRoot = join(testTmp, 'npmrc-run');
    await mkdir(root, { recursive: true });
    await mkdir(runRoot, { recursive: true });
    const sentinel = 'SECRET-NPMRC-CONTENT-MUST-NOT-BE-READ';
    writeFileSync(join(root, '.npmrc'), sentinel, { mode: 0o600 });

    await expect(createAuditInvocation(root, runRoot, { PATH: process.env.PATH })).rejects.toThrow(
      /root \.npmrc|refusing/i,
    );
    await expect(
      createAuditInvocation(root, runRoot, { PATH: process.env.PATH }),
    ).rejects.not.toThrow(sentinel);
  });

  it('proves a real subprocess receives the sanitized argv and environment', async () => {
    const root = join(testTmp, 'standin-root');
    const runRoot = join(testTmp, 'standin-run');
    const bin = join(testTmp, 'standin-bin');
    const record = join(testTmp, 'standin-record.json');
    await mkdir(root, { recursive: true });
    await mkdir(runRoot, { recursive: true });
    await mkdir(bin, { recursive: true });
    const standIn = join(bin, 'npm');
    writeFileSync(
      standIn,
      [
        '#!/usr/bin/env node',
        "const fs = require('node:fs');",
        'const record = process.env.AUDIT_STANDIN_RECORD;',
        'const env = {};',
        'for (const key of Object.keys(process.env)) {',
        "  if (/^(?:NODE_ENV|TMPDIR|TMP|TEMP|npm_config_)/i.test(key)) env[key] = process.env[key];",
        '}',
        'fs.writeFileSync(record, JSON.stringify({ args: process.argv.slice(2), env }));',
        `process.stdout.write(${JSON.stringify(cleanAuditJson())});`,
        '',
      ].join('\n'),
      { mode: 0o755 },
    );
    chmodSync(standIn, 0o755);

    const ambient = {
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      NODE_ENV: 'production',
      npm_config_omit: 'dev',
      NPM_CONFIG_ONLY: 'production',
      npm_config_userconfig: '/sentinel/user.npmrc',
      AUDIT_STANDIN_RECORD: record,
    };
    const invocation = await createAuditInvocation(root, runRoot, ambient);
    const result = await fixtureRunner(invocation.file, invocation.args, invocation.options);

    expect(result.status).toBe(0);
    const captured = JSON.parse(readFileSync(record, 'utf8')) as {
      args: string[];
      env: NodeJS.ProcessEnv;
    };
    expect(captured.args).toEqual(invocation.args);
    expect(captured.env.NODE_ENV).toBe('development');
    expect(captured.env.npm_config_omit).toBeUndefined();
    expect(captured.env.NPM_CONFIG_ONLY).toBeUndefined();
    expect(captured.env.npm_config_userconfig).toBe(invocation.options.env.npm_config_userconfig);
    expect(captured.env.TMPDIR).toBe(join(runRoot, 'tmp'));
  });
});

describe('runCandidateGates invocation contract', () => {
  it('transforms before every gate and invokes candidate-local tools with run-owned npm state', async () => {
    const candidate = await newCandidate();
    const tools = await installFakeTools(candidate);
    const { runner, calls } = createFakeRunner(candidate);

    const results = await runCandidateGates(candidate, NEXT, DATE, runner);

    expect(results.map((entry) => entry.name)).toEqual([
      'build',
      'test',
      'typecheck',
      'lint',
      'security',
      'invariants',
    ]);
    expect(results.map((entry) => entry.status)).toEqual([
      'passed',
      'passed',
      'passed',
      'passed',
      'passed',
      'passed',
    ]);
    expect(gate(results, 'typecheck').detail).toContain('typecheck: passed (src/)');
    expect(gate(results, 'lint').detail).toContain('lint: passed (src/)');
    expect(gate(results, 'test').detail).not.toContain('typecheck');
    expect(gate(results, 'test').detail).not.toContain('lint');

    const buildCall = calls.find((call) => call.file === process.execPath && call.args[0] === tools.tsc && !call.args.includes('--noEmit'));
    expect(buildCall).toBeDefined();
    expect(buildCall?.args).toEqual([tools.tsc, '-p', 'tsconfig.json']);
    expect(buildCall?.options.cwd).toBe(candidate.root);
    expect(buildCall?.options.env.npm_config_cache).toBe(join(candidate.runRoot, 'cache'));

    const typecheckCall = calls.find((call) => call.file === process.execPath && call.args[0] === tools.tsc && call.args.includes('--noEmit'));
    expect(typecheckCall?.args).toEqual([tools.tsc, '-p', 'tsconfig.json', '--noEmit']);

    const lintCall = calls.find((call) => call.file === process.execPath && call.args[0] === tools.eslint);
    expect(lintCall?.args).toEqual([tools.eslint, 'src/**/*.ts']);
    expect(lintCall?.options.cwd).toBe(candidate.root);

    const testCall = calls.find((call) => call.file === 'npm' && call.args[0] === 'test');
    expect(testCall).toBeDefined();
    expect(testCall?.args).toEqual(['test']);
    expect(testCall?.options.cwd).toBe(candidate.root);
    expect(testCall?.options.env.npm_config_cache).toBe(join(candidate.runRoot, 'cache'));

    const auditCall = calls.find((call) => call.file === 'npm' && call.args[0] === 'audit');
    expect(auditCall).toBeDefined();
    expect(auditCall?.args).toEqual([
      'audit',
      '--json',
      '--include=dev',
      '--include=optional',
      '--include=peer',
    ]);
    expect(auditCall?.options.cwd).toBe(candidate.root);
    expect(auditCall?.options.env.NODE_ENV).toBe('development');
    expect(auditCall?.options.env.npm_config_omit).toBeUndefined();
    expect(auditCall?.options.env.npm_config_userconfig).toContain(candidate.runRoot);

    expect(calls.some((call) => call.file === 'npx')).toBe(false);
    expect(calls.some((call) => call.file === 'npm' && ['install', 'exec', 'add'].includes(call.args[0]))).toBe(false);

    expect(gate(results, 'security').detail).toContain('security: passed');
    expect(gate(results, 'security').detail).toContain('dev/optional/peer included');
  });

  it('fails closed before any subprocess when local TypeScript and ESLint are missing', async () => {
    const candidate = await newCandidate();
    const { runner, calls } = createFakeRunner(candidate);

    const results = await runCandidateGates(candidate, NEXT, DATE, runner);

    expect(gate(results, 'build').status).toBe('failed');
    expect(gate(results, 'build').detail).toMatch(/missing local TypeScript compiler/);
    expect(gate(results, 'typecheck').status).toBe('failed');
    expect(gate(results, 'typecheck').detail).toMatch(/missing local TypeScript compiler/);
    expect(gate(results, 'lint').status).toBe('failed');
    expect(gate(results, 'lint').detail).toMatch(/missing local ESLint/);
    expect(calls.some((call) => call.file === process.execPath)).toBe(false);
    expect(calls.some((call) => call.file === 'npx')).toBe(false);
    expect(calls.some((call) => call.file === 'npm' && call.args[0] === 'test')).toBe(true);
  });

  it('treats a spawn failure or nonzero exit as a failed gate, never success by absence', async () => {
    const candidate = await newCandidate();
    await installFakeTools(candidate);
    const { runner } = createFakeRunner(candidate, {
      onCall: (call) => {
        if (call.file === 'npm' && call.args[0] === 'test') {
          throw new Error('spawn npm ENOENT');
        }
        if (call.file === process.execPath && call.args[0]?.endsWith('eslint.js') === true) {
          return { status: 2, stdout: '', stderr: 'lint exploded\n' };
        }
        return undefined;
      },
    });

    const results = await runCandidateGates(candidate, NEXT, DATE, runner);

    expect(gate(results, 'test').status).toBe('failed');
    expect(gate(results, 'test').detail).toMatch(/test: failed/);
    expect(gate(results, 'lint').status).toBe('failed');
    expect(gate(results, 'lint').detail).toMatch(/exit 2/);
  });

  it('does not inherit release-recursion flags into the candidate test gate', async () => {
    const candidate = await newCandidate();
    await installFakeTools(candidate);
    candidate.npmEnv.KIKI_RELEASE_TEST_REAL_TSC = '1';
    const { runner, calls } = createFakeRunner(candidate);

    const results = await runCandidateGates(candidate, NEXT, DATE, runner);

    expect(gate(results, 'test').status).toBe('passed');
    const testCall = calls.find((call) => call.file === 'npm' && call.args[0] === 'test');
    expect(testCall).toBeDefined();
    expect(testCall?.options.env.KIKI_RELEASE_TEST_REAL_TSC).toBeUndefined();
    expect(testCall?.args).toEqual(['test']);
  });
});

describe('security gate policy', () => {
  const variants: Array<{ name: string; env: NodeJS.ProcessEnv }> = [
    { name: 'NODE_ENV=production', env: { NODE_ENV: 'production' } },
    { name: 'npm_config_omit=dev', env: { npm_config_omit: 'dev' } },
    { name: 'NPM_CONFIG_OMIT=dev', env: { NPM_CONFIG_OMIT: 'dev' } },
    { name: 'npm_config_only=production', env: { npm_config_only: 'production' } },
    {
      name: 'combined production and omit settings',
      env: { NODE_ENV: 'production', npm_config_omit: 'dev', NPM_CONFIG_INCLUDE: 'prod' },
    },
  ];

  for (const variant of variants) {
    it(`includes dev dependencies despite ${variant.name}`, async () => {
      const candidate = await newCandidate();
      await installFakeTools(candidate);
      Object.assign(candidate.npmEnv, variant.env);
      const { runner, calls } = createFakeRunner(candidate);

      const results = await runCandidateGates(candidate, NEXT, DATE, runner);

      expect(gate(results, 'security').status).toBe('passed');
      const auditCall = calls.find((call) => call.file === 'npm' && call.args[0] === 'audit');
      expect(auditCall?.args).toEqual([
        'audit',
        '--json',
        '--include=dev',
        '--include=optional',
        '--include=peer',
      ]);
      expect(auditCall?.options.env.NODE_ENV).toBe('development');
      const npmKeys = Object.keys(auditCall?.options.env ?? {}).filter((key) => /^npm_config_/i.test(key));
      expect(npmKeys.map((key) => key.toLowerCase()).sort()).toEqual(
        [
          'npm_config_cache',
          'npm_config_globalconfig',
          'npm_config_logs_dir',
          'npm_config_tmp',
          'npm_config_userconfig',
        ].sort(),
      );
    });

    for (const severity of ['high', 'critical'] as const) {
      it(`blocks a dev-only ${severity} advisory despite ${variant.name}`, async () => {
        const candidate = await newCandidate();
        await installFakeTools(candidate);
        Object.assign(candidate.npmEnv, variant.env);
        const { runner } = createFakeRunner(candidate, {
          audit: () => ({
            status: 1,
            stdout: auditJson({
              [severity]: 1,
              includeDevVulnerability: true,
            }),
            stderr: '',
          }),
        });

        const results = await runCandidateGates(candidate, NEXT, DATE, runner);

        const security = gate(results, 'security');
        expect(security.status).toBe('failed');
        expect(security.detail).toContain(
          'blocked: 1 high/critical vulnerabilities; no exception approved',
        );
        expect(results.some((entry) => entry.name === 'invariants' && entry.status === 'passed')).toBe(
          true,
        );
      });
    }
  }

  it('reports low and moderate advisories without blocking', async () => {
    const candidate = await newCandidate();
    await installFakeTools(candidate);
    const { runner } = createFakeRunner(candidate, {
      audit: () => ({ status: 1, stdout: auditJson({ low: 2, moderate: 1 }), stderr: '' }),
    });

    const results = await runCandidateGates(candidate, NEXT, DATE, runner);

    const security = gate(results, 'security');
    expect(security.status).toBe('passed');
    expect(security.detail).toContain('low: 2');
    expect(security.detail).toContain('moderate: 1');
    expect(security.detail).toContain('0 high/critical');
  });

  const exceptionReason = 'approved type-only graph';
  const exceptionVariants = [
    { name: 'high-only', high: 2, critical: 0 },
    { name: 'critical-only', high: 0, critical: 1 },
    { name: 'mixed', high: 2, critical: 1 },
  ];

  for (const variant of exceptionVariants) {
    it(`passes with an approved exception for ${variant.name} findings`, async () => {
      const candidate = await newCandidate();
      await installFakeTools(candidate);
      const { runner, calls } = createFakeRunner(candidate, {
        audit: () => ({
          status: 1,
          stdout: auditJson({ high: variant.high, critical: variant.critical }),
          stderr: '',
        }),
      });

      const results = await runCandidateGates(candidate, NEXT, DATE, runner, exceptionReason);
      const security = gate(results, 'security');

      expect(security.status).toBe('passed');
      expect(security.detail).toContain(
        `security: passed with approved exception (${variant.high} high, ${variant.critical} critical; reason: ${exceptionReason})`,
      );
      expect(security.detail).toContain('low: 0');
      expect(security.detail).toContain('moderate: 0');
      expect(security.detail).not.toContain('security: blocked');
      expect(security.detail).not.toMatch(/^security: passed \(0 high\/critical/);
      expect(calls.filter((call) => call.file === 'npm' && call.args[0] === 'audit')).toHaveLength(
        1,
      );
    });
  }

  it('keeps the reviewed no-flag high/critical block byte-identical', async () => {
    const candidate = await newCandidate();
    await installFakeTools(candidate);
    const { runner } = createFakeRunner(candidate, {
      audit: () => ({ status: 1, stdout: auditJson({ high: 2, critical: 1 }), stderr: '' }),
    });

    const results = await runCandidateGates(candidate, NEXT, DATE, runner);
    const security = gate(results, 'security');

    expect(security.status).toBe('failed');
    expect(security.detail).toBe(
      'security: blocked: 3 high/critical vulnerabilities; no exception approved',
    );
  });

  it('does not use exception wording when only low/moderate findings exist', async () => {
    const candidate = await newCandidate();
    await installFakeTools(candidate);
    const { runner } = createFakeRunner(candidate, {
      audit: () => ({ status: 1, stdout: auditJson({ low: 2, moderate: 1 }), stderr: '' }),
    });

    const results = await runCandidateGates(candidate, NEXT, DATE, runner, exceptionReason);
    const security = gate(results, 'security');

    expect(security.status).toBe('passed');
    expect(security.detail).toContain('security: passed (0 high/critical');
    expect(security.detail).not.toContain('approved exception');
  });

  const incompleteCases: Array<{ name: string; audit: () => CommandResult | Promise<CommandResult> }> = [
    {
      name: 'offline or unavailable registry',
      audit: () => ({ status: 1, stdout: '', stderr: 'npm error code ENETUNREACH\n' }),
    },
    {
      name: 'invalid JSON',
      audit: () => ({ status: 0, stdout: 'not-json', stderr: '' }),
    },
    {
      name: 'audit error response',
      audit: () => ({ status: 1, stdout: buildAuditErrorJson(), stderr: '' }),
    },
    {
      name: 'missing vulnerability metadata',
      audit: () => ({
        status: 0,
        stdout: JSON.stringify({ auditReportVersion: 2, vulnerabilities: {} }),
        stderr: '',
      }),
    },
    {
      name: 'unexplained nonzero status',
      audit: () => ({ status: 1, stdout: auditJson({}), stderr: '' }),
    },
    {
      name: 'spawn failure',
      audit: () => {
        throw new Error('spawn npm ENOENT');
      },
    },
  ];

  for (const incomplete of incompleteCases) {
    it(`fails closed as INCOMPLETE for ${incomplete.name}`, async () => {
      const candidate = await newCandidate();
      await installFakeTools(candidate);
      const { runner } = createFakeRunner(candidate, { audit: incomplete.audit });

      const results = await runCandidateGates(candidate, NEXT, DATE, runner);

      const security = gate(results, 'security');
      expect(security.status).toBe('incomplete');
      expect(security.detail).toMatch(/^security: INCOMPLETE — npm audit unavailable \(/);
      expect(security.detail).not.toContain('SECRET');
      expect(security.detail).not.toContain('registry.invalid.example');
    });
  }

  for (const incomplete of incompleteCases) {
    it(`still fails closed as INCOMPLETE with an approved exception for ${incomplete.name}`, async () => {
      const candidate = await newCandidate();
      await installFakeTools(candidate);
      const { runner } = createFakeRunner(candidate, { audit: incomplete.audit });

      const results = await runCandidateGates(candidate, NEXT, DATE, runner, exceptionReason);
      const security = gate(results, 'security');

      expect(security.status).toBe('incomplete');
      expect(security.detail).toMatch(/^security: INCOMPLETE — npm audit unavailable \(/);
    });
  }

  const invalidTerminations: Array<{
    name: string;
    result: CommandResult;
  }> = [
    {
      name: 'status 137 with moderate findings',
      result: { status: 137, stdout: auditJson({ moderate: 1 }), stderr: '' },
    },
    {
      name: 'status 137 with high findings',
      result: { status: 137, stdout: auditJson({ high: 1 }), stderr: '' },
    },
    {
      name: 'status 2 with valid findings payload',
      result: { status: 2, stdout: auditJson({ moderate: 1 }), stderr: '' },
    },
    {
      name: 'missing status with valid findings payload',
      result: { status: undefined as unknown as number, stdout: auditJson({ moderate: 1 }), stderr: '' },
    },
    {
      name: 'NaN status with valid findings payload',
      result: { status: Number.NaN, stdout: auditJson({ moderate: 1 }), stderr: '' },
    },
    {
      name: 'signal termination with valid findings payload',
      result: {
        status: 1,
        signal: 'SIGKILL',
        stdout: auditJson({ moderate: 1 }),
        stderr: '',
      } as CommandResult,
    },
  ];

  for (const invalid of invalidTerminations) {
    it(`fails closed as INCOMPLETE for ${invalid.name}`, async () => {
      const candidate = await newCandidate();
      await installFakeTools(candidate);
      const { runner } = createFakeRunner(candidate, { audit: () => invalid.result });

      const results = await runCandidateGates(candidate, NEXT, DATE, runner);

      const security = gate(results, 'security');
      expect(security.status).toBe('incomplete');
      expect(security.detail).toMatch(/^security: INCOMPLETE — npm audit unavailable \(/);
    });
  }

  for (const invalid of invalidTerminations) {
    it(`still fails closed as INCOMPLETE with an approved exception for ${invalid.name}`, async () => {
      const candidate = await newCandidate();
      await installFakeTools(candidate);
      const { runner } = createFakeRunner(candidate, { audit: () => invalid.result });

      const results = await runCandidateGates(candidate, NEXT, DATE, runner, exceptionReason);
      const security = gate(results, 'security');

      expect(security.status).toBe('incomplete');
      expect(security.detail).toMatch(/^security: INCOMPLETE — npm audit unavailable \(/);
    });
  }

  it('accepts the normal npm exit statuses 0 and 1 with valid payloads', async () => {
    for (const result of [
      { status: 0, stdout: auditJson({}), stderr: '' },
      { status: 1, stdout: auditJson({ low: 1, moderate: 1 }), stderr: '' },
    ] as CommandResult[]) {
      const candidate = await newCandidate();
      await installFakeTools(candidate);
      const { runner } = createFakeRunner(candidate, { audit: () => result });
      const results = await runCandidateGates(candidate, NEXT, DATE, runner);
      expect(gate(results, 'security').status).toBe('passed');
    }
  });
});

describe('invariants and validateCandidate', () => {
  it('accepts synchronized versions, a dated changelog and an allowlisted dist-only diff', async () => {
    const candidate = await newCandidate();
    await prepareInvariantCandidate(candidate);
    await mkdir(join(candidate.root, 'tmp'), { recursive: true });
    await writeFile(join(candidate.root, 'tmp/gate-artifact.log'), 'tool artifact\n');
    await mkdir(join(candidate.root, '.agentic'), { recursive: true });
    await writeFile(join(candidate.root, '.agentic/routing_log.jsonl'), '{"gate":true}\n');
    await mkdir(join(candidate.root, 'secrets'), { recursive: true });
    await writeFile(join(candidate.root, 'secrets/data.json'), '{"FIXTURE_ONLY":"gate-secret"}\n');
    await mkdir(join(candidate.root, 'credentials'), { recursive: true });
    await writeFile(join(candidate.root, 'credentials/config.json'), '{"FIXTURE_ONLY":"gate-credential"}\n');
    await mkdir(join(candidate.root, 'coverage'), { recursive: true });
    await writeFile(join(candidate.root, 'coverage/report.txt'), 'coverage\n');
    await mkdir(join(candidate.root, 'node_modules/.cache'), { recursive: true });
    await writeFile(join(candidate.root, 'node_modules/.cache/gate-state'), 'cache\n');
    await writeFile(join(candidate.root, '.env'), 'GATE_ONLY_SECRET_SENTINEL\n');

    await expect(validateCandidate(candidate, NEXT, DATE)).resolves.toBeUndefined();
  });

  it.each([
    ['package.json', { packageVersion: '2.2.0' }],
    ['package-lock.json root', { lockRootVersion: '2.2.0' }],
    ['package-lock.json packages[""]', { lockPackageVersion: '2.2.0' }],
    ['src/cli/config.ts', { configVersion: '2.2.0' }],
    ['dist/cli/config.js', { distVersion: '2.2.0' }],
  ] as const)('rejects a mismatched %s version field', async (_label, overrides) => {
    const candidate = await newCandidate();
    await prepareInvariantCandidate(candidate, overrides);

    await expect(validateCandidate(candidate, NEXT, DATE)).rejects.toThrow(/version|synchron/i);
  });

  it('requires all four transformed files to change', async () => {
    const candidate = await newCandidate();
    await prepareInvariantCandidate(candidate);
    candidate.before.set('package.json', await readFile(join(candidate.root, 'package.json')));

    await expect(validateCandidate(candidate, NEXT, DATE)).rejects.toThrow(
      /package\.json|not changed|did not change/i,
    );
  });

  it('rejects a stale or malformed changelog date and a non-empty fresh Unreleased section', async () => {
    const stale = await newCandidate();
    await prepareInvariantCandidate(stale, {
      changelog: `# Changelog\n\n## [Unreleased]\n\n## [${NEXT}] — 2026-01-01\n\n- Stale.\n`,
    });
    await expect(validateCandidate(stale, NEXT, DATE)).rejects.toThrow(/changelog|date|heading/i);

    const duplicate = await newCandidate();
    await prepareInvariantCandidate(duplicate, {
      changelog: `# Changelog\n\n## [Unreleased]\n\n## [${NEXT}] — ${DATE}\n\n- New.\n\n## [${NEXT}] — ${DATE}\n\n- Duplicate.\n`,
    });
    await expect(validateCandidate(duplicate, NEXT, DATE)).rejects.toThrow(/changelog|duplicate/i);

    const nonEmpty = await newCandidate();
    await prepareInvariantCandidate(nonEmpty, {
      changelog: `# Changelog\n\n## [Unreleased]\n\n- Not fresh.\n\n## [${NEXT}] — ${DATE}\n\n- New.\n`,
    });
    await expect(validateCandidate(nonEmpty, NEXT, DATE)).rejects.toThrow(/Unreleased|empty|fresh/i);
  });

  it('rejects missing build outputs and tracked mutations or additions outside the allowlist', async () => {
    const missing = await newCandidate();
    await prepareInvariantCandidate(missing, { omitOutput: true });
    await expect(validateCandidate(missing, NEXT, DATE)).rejects.toThrow(/dist|output/i);

    const changed = await newCandidate();
    await prepareInvariantCandidate(changed);
    await writeFile(join(changed.root, 'docs/with space.txt'), 'mutated tracked file\n');
    await expect(validateCandidate(changed, NEXT, DATE)).rejects.toThrow(/allowlist|outside/i);

    const added = await newCandidate();
    await prepareInvariantCandidate(added);
    await mkdir(join(added.root, 'docs'), { recursive: true });
    await writeFile(join(added.root, 'docs/extra.txt'), 'unexpected addition\n');
    await expect(validateCandidate(added, NEXT, DATE)).rejects.toThrow(/allowlist|outside/i);

    const deleted = await newCandidate();
    await prepareInvariantCandidate(deleted);
    await rm(join(deleted.root, 'docs/with\nnewline.txt'), { force: true });
    await expect(validateCandidate(deleted, NEXT, DATE)).rejects.toThrow(/allowlist|outside/i);
  });

  it('allows stale tracked dist deletions and generated dist additions', async () => {
    const candidate = await newCandidate();
    await prepareInvariantCandidate(candidate);

    await expect(validateCandidate(candidate, NEXT, DATE)).resolves.toBeUndefined();
    expect(existsSync(join(candidate.root, 'dist/stale.js'))).toBe(false);
    expect(existsSync(join(candidate.root, 'dist/cli/config.js'))).toBe(true);
  });

  it.each(DISTRIBUTABLE_OUTPUTS)(
    'rejects a missing actual distributable output %s',
    async (output) => {
      const candidate = await newCandidate();
      await prepareInvariantCandidate(candidate);
      await rm(join(candidate.root, output), { force: true });

      await expect(validateCandidate(candidate, NEXT, DATE)).rejects.toThrow(
        /dist|output|entrypoint/i,
      );
    },
  );

  it('rejects unsafe package entrypoint targets without reading outside dist', async () => {
    const candidate = await newCandidate();
    await prepareInvariantCandidate(candidate);
    const packagePath = join(candidate.root, 'package.json');
    const packageData = JSON.parse(await readFile(packagePath, 'utf8')) as Record<string, unknown>;
    packageData.exports = { './escape': '../outside-dist.js' };
    await writeFile(packagePath, `${JSON.stringify(packageData, null, 2)}\n`);

    await expect(validateCandidate(candidate, NEXT, DATE)).rejects.toThrow(
      /safe|dist|entrypoint|outside/i,
    );
  });

  it('requires the known Kiki outputs even when candidate package entrypoint fields are absent', async () => {
    const candidate = await newCandidate();
    await prepareInvariantCandidate(candidate, { omitPackageEntrypoints: true });

    await expect(validateCandidate(candidate, NEXT, DATE)).resolves.toBeUndefined();

    await rm(join(candidate.root, 'dist/tui/index.d.ts'), { force: true });
    await expect(validateCandidate(candidate, NEXT, DATE)).rejects.toThrow(
      /dist|output|entrypoint/i,
    );
  });

  it.each(['dist/server/index.js', 'dist/server/index.d.ts'])(
    'requires the planned server output %s even when package entrypoint fields are absent',
    async (output) => {
      const candidate = await newCandidate();
      await prepareInvariantCandidate(candidate, { omitPackageEntrypoints: true });
      await rm(join(candidate.root, output), { force: true });

      await expect(validateCandidate(candidate, NEXT, DATE)).rejects.toThrow(
        /dist|output|entrypoint/i,
      );
    },
  );

  it('does not apply an implicit security exception to a V2 high advisory', async () => {
    const candidate = await newCandidate();
    await installFakeTools(candidate);
    const { runner } = createFakeRunner(candidate, {
      audit: () => ({ status: 1, stdout: auditJson({ high: 1 }), stderr: '' }),
    });

    const results = await runCandidateGates(candidate, NEXT, DATE, runner);
    const security = gate(results, 'security');
    expect(security.status).toBe('failed');
    expect(security.detail).not.toContain('approved exception');
  });
});

describe('production boundary', () => {
  it('does not import the test fixture helper from production gate code', () => {
    const source = readFileSync(join(process.cwd(), 'src/cli/release-gates.ts'), 'utf8');
    expect(source).not.toContain('release-fixture');
    expect(source).not.toContain("'npx'");
    expect(source).not.toContain('npm install');
  });
});

