import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { chmod, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { prepareRelease, release, type ReleaseDeps } from '../../src/cli/commands/release';
import type { CommandResult, CommandRunner } from '../../src/cli/release-candidate';
import type { GateResult } from '../../src/cli/release-gates';
import type { ReleaseOptions } from '../../src/cli/release-policy';
import {
  assertFixturePathSafe,
  createReleaseFixture,
  fixtureRunner,
  releasePreservedBackups,
  releaseTempRoots,
  snapshotEntries,
  type ReleaseFixture,
} from '../helpers/release-fixture';

const TARGET_FILES = ['package.json', 'package-lock.json', 'src/cli/config.ts', 'CHANGELOG.md'];
const DATE = '2026-11-04';
const DISTRIBUTABLE_OUTPUTS = [
  'dist/cli/index.js',
  'dist/index.js',
  'dist/index.d.ts',
  'dist/tui/index.js',
  'dist/tui/index.d.ts',
];
const ENV_KEYS = [
  'TMPDIR',
  'HOME',
  'XDG_CONFIG_HOME',
  'XDG_CACHE_HOME',
  'NODE_ENV',
  'npm_config_omit',
  'NPM_CONFIG_OMIT',
  'npm_config_only',
  'npm_config_cache',
  'npm_config_userconfig',
  'KIKI_RELEASE_TEST_REAL_TSC',
];

interface RecordedCall {
  file: string;
  args: string[];
  options: { cwd: string; env: NodeJS.ProcessEnv };
}

interface FakeRunnerOptions {
  next?: string;
  audit?: () => CommandResult | Promise<CommandResult>;
  onCall?: (call: RecordedCall) => Promise<CommandResult | undefined> | CommandResult | undefined;
}

let fixture: ReleaseFixture;
let testTmp: string;
let syntheticHome: string;
let originalEnv: Record<string, string | undefined>;
let cliBuildRoot: string | undefined;

function hash(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function shortHash(bytes: Buffer): string {
  return hash(bytes).slice(0, 12);
}

function options(overrides: Partial<ReleaseOptions> = {}): ReleaseOptions {
  return { apply: false, bump: 'auto', help: false, ...overrides };
}

function deps(
  runner: CommandRunner,
  logs: string[],
  applyHooks?: ReleaseDeps['applyHooks'],
): ReleaseDeps {
  return {
    runner,
    now: () => new Date(2026, 10, 4, 12, 0, 0),
    log: (line) => logs.push(line),
    ...(applyHooks === undefined ? {} : { applyHooks }),
  };
}

function ok(stdout = 'ok\n'): CommandResult {
  return { status: 0, stdout, stderr: '' };
}

function auditJson(input: {
  low?: number;
  moderate?: number;
  high?: number;
  critical?: number;
  includeDevVulnerability?: boolean;
} = {}): string {
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

async function writeBuiltDist(root: string, next: string): Promise<void> {
  const files: Record<string, string> = {
    'dist/cli/config.js': `export const KIKI_VERSION = '${next}';\n`,
    'dist/cli/index.js': 'export const cli = true;\n',
    'dist/index.js': 'export const index = true;\n',
    'dist/index.d.ts': 'export declare const index: true;\n',
    'dist/tui/index.js': 'export const tui = true;\n',
    'dist/tui/index.d.ts': 'export declare const tui: true;\n',
  };
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolute = join(root, ...relativePath.split('/'));
    await mkdir(join(absolute, '..'), { recursive: true });
    await writeFile(absolute, contents);
  }
}

async function writeGateArtifacts(root: string): Promise<void> {
  await mkdir(join(root, 'tmp'), { recursive: true });
  await writeFile(join(root, 'tmp', 'gate-ran'), 'candidate-only\n');
  await mkdir(join(root, '.agentic'), { recursive: true });
  await writeFile(join(root, '.agentic', 'routing_log.jsonl'), '{"candidate":true}\n');
  await mkdir(join(root, 'node_modules', 'fake-dep', '.cache'), { recursive: true });
  await writeFile(join(root, 'node_modules', 'fake-dep', '.cache', 'gate'), 'candidate-cache\n');
}

function isTsc(tool: string): boolean {
  return /[\\/]typescript[\\/]bin[\\/]tsc$/.test(tool);
}

function isEslint(tool: string): boolean {
  return /[\\/]eslint[\\/]bin[\\/]eslint\.js$/.test(tool);
}

function createRunner(fake: FakeRunnerOptions = {}): {
  runner: CommandRunner;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const next = fake.next ?? '2.3.0';
  const runner: CommandRunner = async (file, args, callOptions) => {
    const call: RecordedCall = {
      file,
      args: [...args],
      options: { cwd: callOptions.cwd, env: { ...callOptions.env } },
    };
    calls.push(call);
    if (fake.onCall !== undefined) {
      const override = await fake.onCall(call);
      if (override !== undefined) return override;
    }
    if (file === 'git') {
      return fixtureRunner(file, args, callOptions);
    }
    if (file === process.execPath) {
      const tool = args[0] ?? '';
      if (isTsc(tool)) {
        if (!args.includes('--noEmit')) await writeBuiltDist(callOptions.cwd, next);
        return ok('tsc ok\n');
      }
      if (isEslint(tool)) return ok('eslint ok\n');
      if (tool.endsWith('release-gate-check.mjs')) return ok(`${next}\n`);
    }
    if (file === 'npm' && args[0] === 'test') {
      await writeGateArtifacts(callOptions.cwd);
      return ok('test ok\n');
    }
    if (file === 'npm' && args[0] === 'audit') {
      if (fake.audit !== undefined) return fake.audit();
      return { status: 0, stdout: auditJson(), stderr: '' };
    }
    throw new Error(`unexpected subprocess: ${file} ${args.join(' ')}`);
  };
  return { runner, calls };
}

async function addEmptyCommit(subject: string, body?: string): Promise<void> {
  const args = ['commit', '--allow-empty', '-m', subject];
  if (body !== undefined) args.push('-m', body);
  fixture.runGit(args);
}

function sourceState(): {
  repository: ReturnType<typeof snapshotEntries>;
  home: ReturnType<typeof snapshotEntries>;
} {
  return {
    repository: snapshotEntries(fixture.root),
    home: snapshotEntries(syntheticHome),
  };
}

function expectSourceUnchanged(before: ReturnType<typeof sourceState>): void {
  expect(sourceState()).toEqual(before);
}

function expectNoCandidateState(): void {
  expect([...releaseTempRoots()]).toEqual([]);
  expect([...releasePreservedBackups()]).toEqual([]);
}

interface EntryState {
  type: 'file' | 'directory' | 'symlink' | 'other' | 'absent';
  mode?: number;
  hash?: string;
}

function entryState(absolute: string): EntryState {
  let info;
  try {
    info = lstatSync(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { type: 'absent' };
    throw error;
  }
  if (info.isSymbolicLink()) return { type: 'symlink', mode: info.mode & 0o777 };
  return {
    type: info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other',
    mode: info.mode & 0o777,
    ...(info.isFile() ? { hash: hash(readFileSync(absolute)) } : {}),
  };
}

function checkoutState(): {
  targets: Record<string, EntryState>;
  dist: ReturnType<typeof snapshotEntries> | null;
  ignored: string;
  env: string;
  routing: string;
  cache: string;
  tmp: string;
  dependency: string;
} {
  const dist = join(fixture.checkout, 'dist');
  return {
    targets: Object.fromEntries(
      TARGET_FILES.map((relativePath) => [
        relativePath,
        entryState(join(fixture.checkout, relativePath)),
      ]),
    ),
    dist: existsSync(dist) ? withoutInodes(snapshotEntries(dist)) : null,
    ignored: fixture.read('ignored-sentinel.txt').toString(),
    env: fixture.read('.env').toString(),
    routing: fixture.read('.agentic/routing_log.jsonl').toString(),
    cache: fixture.read('.agentic/cache/cache-sentinel').toString(),
    tmp: fixture.read('tmp/build.log').toString(),
    dependency: fixture.read('node_modules/fake-dep/index.js').toString(),
  };
}

const FIXTURE_GIT_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_AUTHOR_NAME: 'Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
};

function fixtureGit(args: string[], extraEnv: NodeJS.ProcessEnv = {}): string {
  assertFixturePathSafe(fixture.root);
  return execFileSync('git', args, {
    cwd: fixture.checkout,
    env: { ...FIXTURE_GIT_ENV, ...extraEnv },
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

function installFixtureTools(): void {
  fixture.write(
    'node_modules/typescript/bin/tsc',
    '#!/usr/bin/env node\nconsole.log("fixture tsc");\n',
    0o755,
  );
  fixture.write('node_modules/eslint/bin/eslint.js', 'console.log("fixture eslint");\n', 0o644);
}

function withoutInodes(
  entries: ReturnType<typeof snapshotEntries>,
): ReturnType<typeof snapshotEntries> {
  const copy = { ...entries };
  for (const key of Object.keys(copy)) {
    const entry = copy[key];
    if (entry.ino !== undefined) {
      delete entry.ino;
    }
  }
  return copy;
}

function addIgnoredDistCollision(relativePath = 'dist/ignored.bin'): void {
  mkdirSync(join(fixture.checkout, '.git', 'info'), { recursive: true });
  appendFileSync(join(fixture.checkout, '.git', 'info', 'exclude'), `\n${relativePath}\n`);
  fixture.write(relativePath, 'ignored collision\n');
}

async function failure(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error('EXPECTED_RELEASE_TO_FAIL');
}

function backupPathFrom(message: string): string | undefined {
  const strip = (value: string): string => value.trim().replace(/[.]+$/, '');
  const retained = /backup retained at ([^;\n]+)/.exec(message);
  if (retained !== null) return strip(retained[1]);
  const manual = /backup at ([^;\n]+)/.exec(message);
  return manual === null ? undefined : strip(manual[1]);
}

function candidateBackupDirectories(): string[] {
  return [...releaseTempRoots()].flatMap((root) =>
    readdirSync(root)
      .filter((name) => name.startsWith('apply-backup-'))
      .map((name) => join(root, name)),
  );
}

function expectPreservedBackup(error: Error): string {
  const backup = backupPathFrom(error.message);
  expect(backup).toBeDefined();
  expect(existsSync(backup as string)).toBe(true);
  expect((backup as string).startsWith(testTmp + sep)).toBe(true);
  expect(backup as string).not.toContain(`${sep}kiki-candidate-`);
  return backup as string;
}

function expectLog(lines: string[], pattern: RegExp): void {
  expect(lines.some((line) => pattern.test(line))).toBe(true);
}

beforeEach(() => {
  originalEnv = {};
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
  testTmp = mkdtempSync(join(tmpdir(), 'kiki-release-command-'));
  process.env.TMPDIR = testTmp;
  syntheticHome = join(testTmp, 'home');
  mkdirSync(syntheticHome, { recursive: true });
  writeFileSync(join(syntheticHome, 'sentinel.txt'), 'synthetic home sentinel\n');
  mkdirSync(join(syntheticHome, '.npm'), { recursive: true });
  writeFileSync(join(syntheticHome, '.npm', 'sentinel'), 'synthetic npm sentinel\n');
  process.env.HOME = syntheticHome;
  process.env.XDG_CONFIG_HOME = join(syntheticHome, '.config');
  process.env.XDG_CACHE_HOME = join(syntheticHome, '.cache');
  fixture = createReleaseFixture();
  installFixtureTools();
});

afterEach(() => {
  fixture.cleanup();
  for (const root of releaseTempRoots()) rmSync(root, { recursive: true, force: true });
  for (const root of releasePreservedBackups()) rmSync(root, { recursive: true, force: true });
  rmSync(testTmp, { recursive: true, force: true });
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

afterAll(() => {
  if (cliBuildRoot !== undefined) rmSync(cliBuildRoot, { recursive: true, force: true });
});

beforeAll(async () => {
  const repository = resolve(process.cwd());
  const typescript = join(repository, 'node_modules', 'typescript', 'bin', 'tsc');
  const output = mkdtempSync(join(tmpdir(), 'kiki-release-cli-'));
  cliBuildRoot = output;
  const compiled = join(output, 'dist');
  execFileSync(
    process.execPath,
    [typescript, '-p', join(repository, 'tsconfig.json'), '--outDir', compiled, '--pretty', 'false'],
    { cwd: repository, stdio: 'pipe' },
  );
  writeFileSync(join(compiled, 'package.json'), '{"type":"module"}\n');
  symlinkSync(join(repository, 'node_modules'), join(compiled, 'node_modules'), 'dir');
}, 180_000);

describe('release root guard and early failures', () => {
  it('rejects a non-Kiki package without mutating the checkout', async () => {
    fixture.write('package.json', `${JSON.stringify({ name: 'not-kiki', version: '2.2.0' }, null, 2)}\n`);
    const before = sourceState();
    const { runner } = createRunner();

    await expect(
      prepareRelease(fixture.checkout, options(), deps(runner, [])),
    ).rejects.toThrow(/not a Kiki source checkout/);

    expectSourceUnchanged(before);
    expectNoCandidateState();
  });

  it('rejects a missing config source without mutating the checkout', async () => {
    fixture.remove('src/cli/config.ts');
    const before = sourceState();
    const { runner } = createRunner();

    await expect(
      prepareRelease(fixture.checkout, options(), deps(runner, [])),
    ).rejects.toThrow(/config\.ts|Kiki source checkout/);

    expectSourceUnchanged(before);
    expectNoCandidateState();
  });

  it('refuses apply on a dirty tree including untracked files', async () => {
    const before = sourceState();
    const { runner } = createRunner();

    await expect(
      prepareRelease(fixture.checkout, options({ apply: true }), deps(runner, [])),
    ).rejects.toThrow(/clean working tree|dirty/);

    expectSourceUnchanged(before);
    expectNoCandidateState();
  });

  it('refuses apply on a dirty tracked tree', async () => {
    await addEmptyCommit('feat: add release command');
    fixture.write('package.json', `${fixture.read('package.json').toString().trim()}\n\n`);
    fixture.makeApplyClean();
    const before = sourceState();
    const { runner } = createRunner();

    await expect(
      prepareRelease(fixture.checkout, options({ apply: true }), deps(runner, [])),
    ).rejects.toThrow(/clean working tree|dirty/);

    expectSourceUnchanged(before);
    expectNoCandidateState();
  });

  it('rejects an invalid explicit since through read-only git log', async () => {
    const before = sourceState();
    const { runner, calls } = createRunner();

    await expect(
      prepareRelease(fixture.checkout, options({ since: 'definitely-not-a-ref' }), deps(runner, [])),
    ).rejects.toThrow(/since|usable git revision/i);

    expectSourceUnchanged(before);
    expectNoCandidateState();
    expect(calls.some((call) => call.file === 'git' && call.args[0] === 'log')).toBe(true);
  });

  it('fails closed when no current-version baseline exists', async () => {
    fixture.write(
      'package.json',
      `${JSON.stringify({ name: 'kiki', version: '9.9.9' }, null, 2)}\n`,
    );
    const before = sourceState();
    const { runner } = createRunner();

    await expect(
      prepareRelease(fixture.checkout, options(), deps(runner, [])),
    ).rejects.toThrow(/no commit matches.*--since/);

    expectSourceUnchanged(before);
    expectNoCandidateState();
  });

  it('fails closed when nothing is release-worthy since the baseline', async () => {
    const before = sourceState();
    const { runner } = createRunner();

    await expect(
      prepareRelease(fixture.checkout, options(), deps(runner, [])),
    ).rejects.toThrow(/nothing release-worthy/);

    expectSourceUnchanged(before);
    expectNoCandidateState();
  });

  it('fails closed when empty Unreleased generation produces no content', async () => {
    await addEmptyCommit('Merge branch main');
    const before = sourceState();
    const { runner } = createRunner();

    await expect(
      prepareRelease(fixture.checkout, options({ bump: 'patch' }), deps(runner, [])),
    ).rejects.toThrow(/non-empty after generation/);

    expectSourceUnchanged(before);
    expectNoCandidateState();
  });

  it('fails closed on TODO/TBD placeholder content', async () => {
    fixture.write(
      'CHANGELOG.md',
      '# Changelog\n\n## [Unreleased]\n\n- TODO: describe release\n\n## [2.2.0] — 2026-01-01\n\n- Prior release.\n',
    );
    await addEmptyCommit('feat: add release command');
    const before = sourceState();
    const { runner } = createRunner();

    await expect(
      prepareRelease(fixture.checkout, options(), deps(runner, [])),
    ).rejects.toThrow(/TODO|TBD|placeholder/);

    expectSourceUnchanged(before);
    expectNoCandidateState();
  });

  it('fails closed when a required tracked input is missing from the working tree', async () => {
    await addEmptyCommit('feat: add release command');
    fixture.remove('CHANGELOG.md');
    const before = sourceState();
    const { runner } = createRunner();

    await expect(
      prepareRelease(fixture.checkout, options(), deps(runner, [])),
    ).rejects.toThrow(/missing from the working tree/);

    expectSourceUnchanged(before);
    expectNoCandidateState();
  });
});

describe('successful dry-run command', () => {
  it('reads the actual baseline range so an older-dated merged branch commit is counted', async () => {
    const defaultBranch = fixtureGit(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
    fixtureGit(['checkout', '-q', '-b', 'old-side']);
    fixtureGit(
      [
        'commit',
        '--allow-empty',
        '-m',
        'feat(api)!: replacement',
        '-m',
        'BREAKING CHANGE: replace the public api',
      ],
      {
        GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
        GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
      },
    );
    fixtureGit(['checkout', '-q', defaultBranch]);
    fixtureGit(['commit', '--allow-empty', '-m', 'fix: main fix']);
    fixtureGit(['merge', '--no-ff', 'old-side', '-m', "Merge branch 'old-side'"]);

    let candidateChangelog = '';
    const logs: string[] = [];
    const { runner, calls } = createRunner({
      next: '3.0.0',
      onCall: async (call) => {
        if (call.file === 'npm' && call.args[0] === 'test') {
          candidateChangelog = await readFile(join(call.options.cwd, 'CHANGELOG.md'), 'utf8');
        }
        return undefined;
      },
    });

    const result = await prepareRelease(fixture.checkout, options(), deps(runner, logs));

    expect(result.version).toMatchObject({
      current: '2.2.0',
      next: '3.0.0',
      rule: 'breaking change',
      ignored: 1,
    });
    expectLog(logs, /Range: 3 commit\(s\)/);
    expect(result.gates.every((gate) => gate.status === 'passed')).toBe(true);
    expect(candidateChangelog).toContain('- replacement (api)');
    expect(candidateChangelog).toContain('- main fix');
    expect(candidateChangelog).not.toContain('Merge branch');
    const logCalls = calls.filter((call) => call.file === 'git' && call.args[0] === 'log');
    expect(logCalls).toHaveLength(2);
    expect(logCalls[1].args.some((arg) => arg.endsWith('..HEAD'))).toBe(true);
    expectNoCandidateState();
  });

  it('validates only in a candidate, reports every gate/file, and never writes the checkout', async () => {
    await addEmptyCommit(
      'feat(api): add parser',
      'Long body preserved.\n\nBREAKING CHANGE: removed the old parser',
    );
    await addEmptyCommit('fix(cli): correct parser');
    process.env.KIKI_RELEASE_TEST_REAL_TSC = '1';
    const logs: string[] = [];
    const { runner, calls } = createRunner({ next: '3.0.0' });
    const before = sourceState();

    const result = await prepareRelease(fixture.checkout, options(), deps(runner, logs));

    expect(result.applied).toBe(false);
    expect(result.version).toMatchObject({
      current: '2.2.0',
      next: '3.0.0',
      rule: 'breaking change',
      ignored: 0,
    });
    expect(result.gates.map((gate) => gate.name)).toEqual([
      'build',
      'test',
      'typecheck',
      'lint',
      'security',
      'invariants',
    ]);
    expect(result.gates.map((gate) => gate.status)).toEqual([
      'passed',
      'passed',
      'passed',
      'passed',
      'passed',
      'passed',
    ]);

    expectLog(logs, /Mode: dry run/i);
    expectLog(logs, /Dirty preview:.*changed\/untracked/i);
    expectLog(logs, /Baseline: [0-9a-f]{7,}/i);
    expectLog(logs, /Range: 2 commit\(s\)/i);
    expectLog(logs, /Version: 2\.2\.0 -> 3\.0\.0 \(breaking change; ignored 0\)/i);
    for (const gate of result.gates) {
      expectLog(logs, new RegExp(`${gate.name}: ${gate.status}`, 'i'));
    }
    expectLog(logs, /Candidate changed files:/i);
    expectLog(logs, /package\.json: [0-9a-f]{12} -> [0-9a-f]{12}/);
    expectLog(logs, /dist\/index\.js: \(absent\) -> [0-9a-f]{12}/);
    expectLog(logs, /Manual next steps \(not executed\):/i);
    expectLog(logs, /git add /);
    expectLog(logs, /git commit -m "feat: release v3\.0\.0"/);
    expectLog(logs, /separate authorization required/i);
    expect(logs.at(-1)).toBe('Kiki performed no commit/tag/push/publish.');

    expectSourceUnchanged(before);
    expectNoCandidateState();

    const gitCalls = calls.filter((call) => call.file === 'git');
    expect(gitCalls.length).toBeGreaterThan(0);
    for (const call of gitCalls) {
      expect(['log', 'ls-files', 'status']).toContain(call.args[0]);
      expect(call.args[0]).toMatch(/^(?:log|ls-files|status)$/);
      if (call.args[0] === 'log') {
        expect(call.args.filter((arg) => arg.startsWith('--format='))).toHaveLength(1);
        expect(call.args.filter((arg) => arg.startsWith('-') && !arg.startsWith('--format='))).toEqual([]);
      }
      if (call.args[0] === 'ls-files') expect(call.args.slice(1)).toEqual(['-z']);
      if (call.args[0] === 'status') {
        expect(call.args.slice(1).sort()).toEqual(['--porcelain', '--untracked-files=all']);
      }
    }

    const testCalls = calls.filter((call) => call.file === 'npm' && call.args[0] === 'test');
    expect(testCalls).toHaveLength(1);
    expect(testCalls[0].args).toEqual(['test']);
    expect(resolve(testCalls[0].options.cwd)).not.toBe(resolve(fixture.checkout));
    expect(testCalls[0].options.cwd.startsWith(testTmp + sep)).toBe(true);
    expect(testCalls[0].options.env.KIKI_RELEASE_TEST_REAL_TSC).toBeUndefined();

    const buildCalls = calls.filter(
      (call) => call.file === process.execPath && isTsc(call.args[0] ?? '') && !call.args.includes('--noEmit'),
    );
    const typecheckCalls = calls.filter(
      (call) => call.file === process.execPath && isTsc(call.args[0] ?? '') && call.args.includes('--noEmit'),
    );
    const lintCalls = calls.filter(
      (call) => call.file === process.execPath && isEslint(call.args[0] ?? ''),
    );
    const pluginCalls = calls.filter(
      (call) => call.file === process.execPath && (call.args[0] ?? '').endsWith('release-gate-check.mjs'),
    );
    expect(buildCalls).toHaveLength(1);
    expect(typecheckCalls).toHaveLength(1);
    expect(lintCalls).toHaveLength(1);
    expect(pluginCalls).toHaveLength(1);

    const auditCalls = calls.filter((call) => call.file === 'npm' && call.args[0] === 'audit');
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0].args).toEqual([
      'audit',
      '--json',
      '--include=dev',
      '--include=optional',
      '--include=peer',
    ]);
    expect(auditCalls[0].options.env.NODE_ENV).toBe('development');
    const auditKeys = Object.keys(auditCalls[0].options.env)
      .filter((key) => /^npm_config_/i.test(key))
      .map((key) => key.toLowerCase())
      .sort();
    expect(auditKeys).toEqual(
      [
        'npm_config_cache',
        'npm_config_globalconfig',
        'npm_config_logs_dir',
        'npm_config_tmp',
        'npm_config_userconfig',
      ].sort(),
    );

    for (const call of calls.filter((entry) => entry.file !== 'git')) {
      expect(resolve(call.options.cwd)).not.toBe(resolve(fixture.checkout));
      expect(call.options.cwd.startsWith(testTmp + sep)).toBe(true);
    }
    expect(calls.some((call) => call.file === 'npx')).toBe(false);
    expect(calls.some((call) => call.file === 'npm' && ['install', 'exec', 'add'].includes(call.args[0]))).toBe(false);
  });
});

describe('gate and security failures', () => {
  it('fails closed on a failing candidate gate and never applies', async () => {
    await addEmptyCommit('feat: add release command');
    fixture.makeApplyClean();
    const before = sourceState();
    const logs: string[] = [];
    const { runner } = createRunner({
      onCall: (call) => {
        if (call.file === process.execPath && isEslint(call.args[0] ?? '')) {
          return { status: 2, stdout: '', stderr: 'lint failed\n' };
        }
        return undefined;
      },
    });

    await expect(
      prepareRelease(fixture.checkout, options({ apply: true }), deps(runner, logs)),
    ).rejects.toThrow(/validation failed.*lint: failed/s);

    expectLog(logs, /lint: failed/);
    expectSourceUnchanged(before);
    expectNoCandidateState();
  });

  it('fails closed when the local TypeScript compiler is missing', async () => {
    fixture.remove('node_modules/typescript');
    await addEmptyCommit('feat: add release command');
    const before = sourceState();
    const { runner } = createRunner();

    await expect(
      prepareRelease(fixture.checkout, options(), deps(runner, [])),
    ).rejects.toThrow(/missing local TypeScript compiler/);

    expectSourceUnchanged(before);
    expectNoCandidateState();
  });

  it('fails closed when the local ESLint binary is missing', async () => {
    fixture.remove('node_modules/eslint');
    await addEmptyCommit('feat: add release command');
    const before = sourceState();
    const { runner } = createRunner();

    await expect(
      prepareRelease(fixture.checkout, options(), deps(runner, [])),
    ).rejects.toThrow(/missing local ESLint/);

    expectSourceUnchanged(before);
    expectNoCandidateState();
  });

  it('reports an offline audit as incomplete instead of passed', async () => {
    await addEmptyCommit('feat: add release command');
    const before = sourceState();
    const { runner } = createRunner({
      audit: () => ({ status: 1, stdout: '', stderr: 'network unavailable\n' }),
    });

    await expect(
      prepareRelease(fixture.checkout, options(), deps(runner, [])),
    ).rejects.toThrow(/INCOMPLETE.*registry or network unavailable/s);

    expectSourceUnchanged(before);
    expectNoCandidateState();
  });

  it('reports an unknown audit exit status as incomplete', async () => {
    await addEmptyCommit('feat: add release command');
    const before = sourceState();
    const { runner } = createRunner({
      audit: () => ({ status: 137, stdout: auditJson(), stderr: '' }),
    });

    await expect(
      prepareRelease(fixture.checkout, options(), deps(runner, [])),
    ).rejects.toThrow(/INCOMPLETE.*137/s);

    expectSourceUnchanged(before);
    expectNoCandidateState();
  });

  it('blocks high and critical audit findings without applying', async () => {
    await addEmptyCommit('feat: add release command');
    fixture.makeApplyClean();
    const before = sourceState();
    const { runner } = createRunner({
      audit: () => ({ status: 1, stdout: auditJson({ high: 2, critical: 1 }), stderr: '' }),
    });

    await expect(
      prepareRelease(fixture.checkout, options({ apply: true }), deps(runner, [])),
    ).rejects.toThrow(/blocked: 3 high\/critical vulnerabilities; no exception approved/);

    expectSourceUnchanged(before);
    expectNoCandidateState();
  });

  it('blocks dev-only high/critical findings despite production omission and sanitizes audit inputs', async () => {
    process.env.NODE_ENV = 'production';
    process.env.npm_config_omit = 'dev';
    process.env.NPM_CONFIG_OMIT = 'dev';
    process.env.npm_config_only = 'production';
    process.env.npm_config_userconfig = '/sentinel/user.npmrc';
    process.env.npm_config_cache = '/sentinel/cache';
    await addEmptyCommit('feat: add release command');
    fixture.makeApplyClean();
    const before = sourceState();
    let auditCall: RecordedCall | undefined;
    const { runner } = createRunner({
      onCall: async (call) => {
        if (call.file === 'npm' && call.args[0] === 'audit') {
          auditCall = call;
          const userConfig = call.options.env.npm_config_userconfig as string;
          const globalConfig = call.options.env.npm_config_globalconfig as string;
          expect((await stat(userConfig)).size).toBe(0);
          expect((await stat(userConfig)).mode & 0o777).toBe(0o600);
          expect((await stat(globalConfig)).size).toBe(0);
          return { status: 1, stdout: auditJson({ high: 1, includeDevVulnerability: true }), stderr: '' };
        }
        return undefined;
      },
    });

    await expect(
      prepareRelease(fixture.checkout, options({ apply: true }), deps(runner, [])),
    ).rejects.toThrow(/blocked: 1 high\/critical vulnerabilities; no exception approved/);

    expect(auditCall).toBeDefined();
    expect(auditCall?.args).toEqual([
      'audit',
      '--json',
      '--include=dev',
      '--include=optional',
      '--include=peer',
    ]);
    expect(auditCall?.options.env.NODE_ENV).toBe('development');
    const auditKeys = Object.keys(auditCall?.options.env ?? {})
      .filter((key) => /^npm_config_/i.test(key))
      .map((key) => key.toLowerCase())
      .sort();
    expect(auditKeys).toEqual(
      [
        'npm_config_cache',
        'npm_config_globalconfig',
        'npm_config_logs_dir',
        'npm_config_tmp',
        'npm_config_userconfig',
      ].sort(),
    );
    expect(auditCall?.options.env.npm_config_userconfig).not.toBe('/sentinel/user.npmrc');
    expect(auditCall?.options.env.npm_config_cache).not.toBe('/sentinel/cache');
    expectSourceUnchanged(before);
    expectNoCandidateState();
  });

  it('reports an approved security exception in the header, gate line and manual next steps', async () => {
    await addEmptyCommit('feat: add release command');
    const before = sourceState();
    const logs: string[] = [];
    const reason = 'approved type-only graph';
    const { runner, calls } = createRunner({
      audit: () => ({ status: 1, stdout: auditJson({ high: 2, critical: 1 }), stderr: '' }),
    });

    const result = await prepareRelease(
      fixture.checkout,
      options({ securityException: reason }),
      deps(runner, logs),
    );

    expect(result.applied).toBe(false);
    const security = result.gates.find((gate) => gate.name === 'security');
    expect(security?.status).toBe('passed');
    expect(security?.detail).toContain(
      'security: passed with approved exception (2 high, 1 critical; reason: approved type-only graph)',
    );
    expect(logs).toContain(`Security exception: ${reason}`);
    expect(
      logs.some((line) =>
        line.includes(
          'security: passed with approved exception (2 high, 1 critical; reason: approved type-only graph)',
        ),
      ),
    ).toBe(true);
    expect(logs.some((line) => line.includes('security: passed (0 high/critical'))).toBe(false);
    expect(logs).toContain(`  # Security exception: ${reason}`);
    expect(calls.filter((call) => call.file === 'npm' && call.args[0] === 'audit')).toHaveLength(1);
    expectSourceUnchanged(before);
    expectNoCandidateState();
  });

  it('allows apply with an approved exception when every other gate passes', async () => {
    await addEmptyCommit('feat: add release command');
    fixture.makeApplyClean();
    const reason = 'approved type-only graph';
    const logs: string[] = [];
    const { runner } = createRunner({
      next: '2.3.0',
      audit: () => ({ status: 1, stdout: auditJson({ high: 1, critical: 0 }), stderr: '' }),
    });

    const result = await prepareRelease(
      fixture.checkout,
      options({ apply: true, securityException: reason }),
      deps(runner, logs),
    );

    expect(result.applied).toBe(true);
    expect(JSON.parse(fixture.read('package.json').toString()).version).toBe('2.3.0');
    expect(logs).toContain(`Security exception: ${reason}`);
    expect(logs).toContain(`  # Security exception: ${reason}`);
    expect(
      logs.some((line) =>
        line.includes(
          'security: passed with approved exception (1 high, 0 critical; reason: approved type-only graph)',
        ),
      ),
    ).toBe(true);
    expectNoCandidateState();
  });

  it('still fails closed on INCOMPLETE audit evidence with an approved exception', async () => {
    await addEmptyCommit('feat: add release command');
    fixture.makeApplyClean();
    const before = sourceState();
    const { runner } = createRunner({
      audit: () => ({ status: 1, stdout: '', stderr: 'network unavailable\n' }),
    });

    await expect(
      prepareRelease(
        fixture.checkout,
        options({ apply: true, securityException: 'approved type-only graph' }),
        deps(runner, []),
      ),
    ).rejects.toThrow(/INCOMPLETE.*registry or network unavailable/s);

    expectSourceUnchanged(before);
    expectNoCandidateState();
  });

  it('does not apply when another gate fails despite an approved exception', async () => {
    await addEmptyCommit('feat: add release command');
    fixture.makeApplyClean();
    const before = sourceState();
    const { runner } = createRunner({
      audit: () => ({ status: 1, stdout: auditJson({ high: 1 }), stderr: '' }),
      onCall: (call) => {
        if (call.file === process.execPath && isEslint(call.args[0] ?? '')) {
          return { status: 2, stdout: '', stderr: 'lint failed\n' };
        }
        return undefined;
      },
    });

    await expect(
      prepareRelease(
        fixture.checkout,
        options({ apply: true, securityException: 'approved type-only graph' }),
        deps(runner, []),
      ),
    ).rejects.toThrow(/validation failed.*lint: failed/s);

    expectSourceUnchanged(before);
    expectNoCandidateState();
  });
});

describe('apply command', () => {
  it('applies the four targets plus dist only after every gate passes', async () => {
    await addEmptyCommit('feat: add release command');
    await addEmptyCommit('fix: correct release output');
    fixture.makeApplyClean();
    const logs: string[] = [];
    const { runner } = createRunner({ next: '2.3.0' });
    const sentinelBefore = checkoutState();
    const gitBefore = snapshotEntries(join(fixture.checkout, '.git'));
    const dependenciesBefore = snapshotEntries(join(fixture.checkout, 'node_modules'));
    const homeBefore = snapshotEntries(syntheticHome);

    const result = await prepareRelease(
      fixture.checkout,
      options({ apply: true }),
      deps(runner, logs),
    );

    expect(result.applied).toBe(true);
    expect(JSON.parse(fixture.read('package.json').toString()).version).toBe('2.3.0');
    expect(JSON.parse(fixture.read('package-lock.json').toString()).version).toBe('2.3.0');
    expect(JSON.parse(fixture.read('package-lock.json').toString()).packages[''].version).toBe('2.3.0');
    expect(fixture.read('src/cli/config.ts').toString()).toBe("export const KIKI_VERSION = '2.3.0';\n");
    const changelog = fixture.read('CHANGELOG.md').toString();
    expect(changelog).toContain('## [Unreleased]');
    expect(changelog).toContain('## [2.3.0] — 2026-11-04');
    expect(changelog).toMatch(/### Added\n- add release command/);
    expect(changelog).toMatch(/### Fixed\n- correct release output/);
    expect(existsSync(join(fixture.checkout, 'dist', 'stale.js'))).toBe(false);
    for (const output of DISTRIBUTABLE_OUTPUTS) {
      expect(existsSync(join(fixture.checkout, ...output.split('/')))).toBe(true);
    }
    const sentinelAfter = checkoutState();
    expect(sentinelAfter.ignored).toBe(sentinelBefore.ignored);
    expect(sentinelAfter.env).toBe(sentinelBefore.env);
    expect(sentinelAfter.routing).toBe(sentinelBefore.routing);
    expect(sentinelAfter.cache).toBe(sentinelBefore.cache);
    expect(sentinelAfter.tmp).toBe(sentinelBefore.tmp);
    expect(sentinelAfter.dependency).toBe(sentinelBefore.dependency);
    expect(snapshotEntries(join(fixture.checkout, '.git'))).toEqual(gitBefore);
    expect(snapshotEntries(join(fixture.checkout, 'node_modules'))).toEqual(dependenciesBefore);
    expect(snapshotEntries(syntheticHome)).toEqual(homeBefore);
    expectLog(logs, /Applied: true/);
    expectLog(logs, /backup removed after verified apply/i);
    expect(logs.at(-1)).toBe('Kiki performed no commit/tag/push/publish.');
    expectNoCandidateState();
  });

  it('preserves and relocates the retained backup on apply failure without misreporting restoration', async () => {
    await addEmptyCommit('feat: add release command');
    fixture.makeApplyClean();
    const before = checkoutState();
    const gitBefore = snapshotEntries(join(fixture.checkout, '.git'));
    const dependenciesBefore = snapshotEntries(join(fixture.checkout, 'node_modules'));
    const homeBefore = snapshotEntries(syntheticHome);
    let injected = false;
    const { runner } = createRunner({ next: '2.3.0' });

    const error = await failure(
      prepareRelease(
        fixture.checkout,
        options({ apply: true }),
        deps(runner, [], {
          afterWrite: async (relativePath) => {
            if (injected || relativePath !== 'package.json') return;
            injected = true;
            fixture.write('dist/late-external.txt', 'EXTERNAL_LATE_EDIT\n');
            throw new Error('injected copy failure');
          },
        }),
      ),
    );

    expect(error.message).toMatch(/injected copy failure/);
    expect(error.message).toMatch(/target writes restored/i);
    expect(error.message).toMatch(/dist was not modified/i);
    expect(error.message).not.toMatch(/dist tree restored/i);
    const backup = expectPreservedBackup(error);
    expect(readFileSync(join(backup, 'targets', 'package.json')).length).toBeGreaterThan(0);

    expect(fixture.read('dist/late-external.txt').toString()).toBe('EXTERNAL_LATE_EDIT\n');
    const after = checkoutState();
    expect(after.dist?.['late-external.txt']).toBeDefined();
    if (after.dist !== null) delete after.dist['late-external.txt'];
    expect(after).toEqual(before);
    expect(snapshotEntries(join(fixture.checkout, '.git'))).toEqual(gitBefore);
    expect(snapshotEntries(join(fixture.checkout, 'node_modules'))).toEqual(dependenciesBefore);
    expect(snapshotEntries(syntheticHome)).toEqual(homeBefore);
    expect([...releaseTempRoots()]).toEqual([]);
  });

  it('rolls back a post-apply verification failure and preserves the backup', async () => {
    await addEmptyCommit('feat: add release command');
    fixture.makeApplyClean();
    const before = checkoutState();
    const { runner } = createRunner({ next: '2.3.0' });

    const error = await failure(
      prepareRelease(
        fixture.checkout,
        options({ apply: true }),
        deps(runner, [], {
          beforeVerify: async () => {
            await writeFile(join(fixture.checkout, 'package.json'), 'FORCED_VERIFY_MISMATCH\n');
          },
        }),
      ),
    );

    expect(error.message).toMatch(/apply failed|verification|mismatch|changed/i);
    expect(error.message).toMatch(/target writes restored/i);
    expect(error.message).toMatch(/dist tree restored/i);
    const backup = expectPreservedBackup(error);
    expect(existsSync(backup)).toBe(true);
    expect(checkoutState()).toEqual(before);
    expect([...releaseTempRoots()]).toEqual([]);
  });

  it('preserves the backup and reports manual recovery when rollback verification fails', async () => {
    await addEmptyCommit('feat: add release command');
    fixture.makeApplyClean();
    const { runner } = createRunner({ next: '2.3.0' });

    const error = await failure(
      prepareRelease(
        fixture.checkout,
        options({ apply: true }),
        deps(runner, [], {
          beforeVerify: async () => {
            const backups = candidateBackupDirectories();
            expect(backups).toHaveLength(1);
            await writeFile(join(backups[0], 'targets', 'package.json'), 'CORRUPTED_BACKUP\n');
            await writeFile(join(fixture.checkout, 'package.json'), 'FORCE_VERIFY_FAILURE\n');
          },
        }),
      ),
    );

    expect(error.message).toMatch(/rollback failed/i);
    expect(error.message).toMatch(/manual recovery required/i);
    expect(error.message).toMatch(/restoration was NOT verified/i);
    expect(error.message).not.toMatch(/checkout restored/i);
    const backup = expectPreservedBackup(error);
    expect(existsSync(backup)).toBe(true);
    expect(readFileSync(join(backup, 'targets', 'package.json')).toString()).toBe(
      'CORRUPTED_BACKUP\n',
    );
    expect([...releaseTempRoots()]).toEqual([]);
  });

  it('refuses ignored dist collisions in apply while dry-run completes with a would-refuse preview', async () => {
    await addEmptyCommit('feat: add release command');
    fixture.makeApplyClean();
    addIgnoredDistCollision();
    const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
      cwd: fixture.checkout,
      encoding: 'utf8',
    });
    expect(status).toBe('');
    const before = sourceState();

    const dryLogs: string[] = [];
    const dryRun = createRunner({ next: '2.3.0' });
    const dryResult = await prepareRelease(
      fixture.checkout,
      options(),
      deps(dryRun.runner, dryLogs),
    );
    expect(dryResult.applied).toBe(false);
    expectLog(dryLogs, /would refuse: 1 colliding dist path/);
    expect(fixture.read('dist/ignored.bin').toString()).toBe('ignored collision\n');

    const applyRun = createRunner({ next: '2.3.0' });
    const error = await failure(
      prepareRelease(
        fixture.checkout,
        options({ apply: true }),
        deps(applyRun.runner, []),
      ),
    );
    expect(error.message).toMatch(/apply refused: 1 colliding dist path/);
    expect(error.message).toContain('dist/ignored.bin');
    expectSourceUnchanged(before);
    expectNoCandidateState();
  });
});

describe('report and real CLI subprocess fixtures', () => {
  function runCli(args: string[], cwd: string) {
    return spawnSync(process.execPath, [join(cliBuildRoot as string, 'dist', 'cli', 'index.js'), ...args], {
      cwd,
      env: { ...process.env },
      encoding: 'utf8',
    });
  }

  it('prints help with no side effects and exits 0', () => {
    const before = sourceState();
    const result = runCli(['release', '--help'], testTmp);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: kiki release');
    expect(result.stdout).toContain('--security-exception <reason>');
    expect(result.stderr).toBe('');
    expectSourceUnchanged(before);
    expectNoCandidateState();
  });

  it('rejects invalid release options with exit code 1 and a clean error', () => {
    const result = runCli(['release', '--bogus'], testTmp);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/unsupported argument '--bogus'/);
    expect(result.stderr).not.toMatch(/\n\s+at\s/);
    expectNoCandidateState();
  });

  it('refuses to run outside a Kiki checkout without creating a candidate', () => {
    const outside = join(testTmp, 'not-kiki');
    mkdirSync(outside, { recursive: true });
    const result = runCli(['release'], outside);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/not a Kiki source checkout/);
    expectNoCandidateState();
  });

  it('keeps production code free of fixture writers and non-allowlisted git commands', () => {
    const source = readFileSync(join(process.cwd(), 'src/cli/commands/release.ts'), 'utf8');
    expect(source).not.toMatch(/tests\/helpers|release-fixture|execFileSync|spawnSync|\bnpx\b/);
    expect(source).not.toMatch(/readGit\([^)]*['"](?:commit|tag|push|fetch|publish)['"]/);
    expect(source).toMatch(/prepareRelease/);
    expect(source).toMatch(/export async function release/);
  });
});
