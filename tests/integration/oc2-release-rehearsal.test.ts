import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { chmod, lstat, mkdir, readFile, readdir, readlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { applyEdits, modify } from 'jsonc-parser';
import { prepareRelease, type ReleaseDeps } from '../../src/cli/commands/release';
import {
  parseReleaseArgs,
  decideVersion,
} from '../../src/cli/release-policy';
import type { CommandResult, CommandRunner } from '../../src/cli/release-candidate';
import {
  assertFixturePathSafe,
  fixtureRunner,
  releaseTempRoots,
} from '../helpers/release-fixture';

const execFileAsync = promisify(execFile);

const ENABLED = process.env.KIKI_RELEASE_TEST_OC2_REHEARSAL === '1';
const TIMEOUT = 900_000;
const BASELINE = 'e2bf396df5a14657f34f55c78b31819be10b9c05';
const SYNTHETIC_VERSION = '2.4.0';
const RELEASE_VERSION = '3.0.0';
const CHECKOUT = resolve('.');
const REAL_NODE_MODULES = join(CHECKOUT, 'node_modules');
const REHEARSAL_ARTIFACTS = process.env.KIKI_RELEASE_REHEARSAL_ARTIFACTS_DIR
  ? resolve(process.env.KIKI_RELEASE_REHEARSAL_ARTIFACTS_DIR)
  : undefined;
const NORMALIZATION_INPUTS = [
  'package.json',
  'package-lock.json',
  'src/cli/config.ts',
  'CHANGELOG.md',
] as const;
const GATE_NAMES = ['build', 'test', 'typecheck', 'lint', 'security', 'invariants'] as const;
const SECRET_BASENAME =
  /^(?:\.env(?:\..*)?|\.npmrc|\.netrc|\.git-credentials|id_rsa(?:\.pub)?|id_ed25519(?:\.pub)?|.*\.(?:pem|key|p12|pfx)|credentials(?:\.json)?|secrets?)$/i;
const LIVE_CONFIG_BASENAMES = new Set([
  'opencode.json',
  'opencode.jsonc',
  'cli.json',
  'cli.jsonc',
  'auth.json',
]);
const GATE_ARTIFACT_PREFIXES = ['tmp/', '.agentic/', 'coverage/', '.cache/'];

interface RecordedCall {
  file: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  result: CommandResult;
}

interface CandidateEvidence {
  packageVersion: string;
  lockRootVersion: string;
  lockPackageVersion: string;
  sourceConfigVersion: string;
  distConfigVersion: string;
  changelog: {
    unreleasedCount: number;
    hasReleaseHeading: boolean;
    unreleasedNonEmpty: boolean;
  };
  artifacts: Record<string, { sha256: string; size: number }>;
  distManifest: Record<string, string>;
  candidateRoot: string;
}

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function gitEnv(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    HOME: process.env.HOME,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_AUTHOR_NAME: 'Rehearsal Fixture',
    GIT_AUTHOR_EMAIL: 'rehearsal@example.invalid',
    GIT_COMMITTER_NAME: 'Rehearsal Fixture',
    GIT_COMMITTER_EMAIL: 'rehearsal@example.invalid',
  };
}

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    env: gitEnv(),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: 'pipe',
  });
}

function hasSecretSegment(relativePath: string): boolean {
  return relativePath
    .split('/')
    .some((segment) => segment !== '' && SECRET_BASENAME.test(segment));
}

function isLiveConfigPath(relativePath: string): boolean {
  return relativePath
    .split('/')
    .some((segment) => segment !== '' && LIVE_CONFIG_BASENAMES.has(segment));
}

function validateRelativePath(relativePath: string): void {
  if (
    relativePath === '' ||
    relativePath.includes('\0') ||
    isAbsolute(relativePath) ||
    relativePath.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new Error(`rehearsal: unsafe source path '${relativePath}'`);
  }
  if (relativePath === '.git' || relativePath.startsWith('.git/')) {
    throw new Error(`rehearsal: refusing to copy git metadata path '${relativePath}'`);
  }
}

function sourcePaths(checkout: string): { tracked: string[]; untracked: string[] } {
  const split = (raw: string): string[] => raw.split('\0').filter((entry) => entry !== '');
  return {
    tracked: split(git(['ls-files', '-z'], checkout)),
    untracked: split(git(['ls-files', '--others', '--exclude-standard', '-z'], checkout)),
  };
}

async function copyReviewedSource(
  sourceRoot: string,
  destinationRoot: string,
): Promise<{ manifest: string[]; deleted: string[]; excludedLiveConfigs: string[] }> {
  const { tracked, untracked } = sourcePaths(sourceRoot);
  const trackedSet = new Set(tracked);
  const manifest = new Set<string>();
  const deleted = new Set<string>();
  const excludedLiveConfigs = new Set<string>();
  for (const relativePath of [...tracked, ...untracked]) {
    validateRelativePath(relativePath);
    if (hasSecretSegment(relativePath)) {
      if (trackedSet.has(relativePath)) {
        throw new Error(`rehearsal: tracked secret-bearing path '${relativePath}' is not copyable`);
      }
      continue;
    }
    if (isLiveConfigPath(relativePath)) {
      // Live OpenCode/TUI config can carry provider credentials. Exclude it by
      // metadata only; never open or copy it into the rehearsal snapshot.
      excludedLiveConfigs.add(relativePath);
      continue;
    }
    if (manifest.has(relativePath)) continue;
    const source = join(sourceRoot, ...relativePath.split('/'));
    const destination = join(destinationRoot, ...relativePath.split('/'));
    let info;
    try {
      info = await lstat(source);
    } catch (error) {
      if (
        trackedSet.has(relativePath) &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        // The reviewed working tree retired this tracked file. Staging the
        // synthetic tree with `git add -A` records the deletion without
        // inventing a commit.
        deleted.add(relativePath);
        continue;
      }
      throw error;
    }
    if (info.isSymbolicLink()) {
      throw new Error(`rehearsal: refusing symlinked source path '${relativePath}'`);
    }
    if (!info.isFile()) {
      throw new Error(`rehearsal: source path '${relativePath}' is not a regular file`);
    }
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, await readFile(source));
    await chmod(destination, info.mode & 0o777);
    manifest.add(relativePath);
  }
  return {
    manifest: [...manifest].sort(),
    deleted: [...deleted].sort(),
    excludedLiveConfigs: [...excludedLiveConfigs].sort(),
  };
}

async function hashFile(path: string): Promise<string> {
  return sha256(await readFile(path));
}

async function hashTree(
  root: string,
  skip: (relativePath: string) => boolean = () => false,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const visit = async (directory: string, prefix: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    for (const entry of entries) {
      const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (skip(relativePath)) continue;
      const absolute = join(directory, entry.name);
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) {
        result[relativePath] = `symlink:${await readlink(absolute)}`;
        continue;
      }
      if (info.isDirectory()) {
        await visit(absolute, relativePath);
        continue;
      }
      if (info.isFile()) {
        result[relativePath] = await hashFile(absolute);
        continue;
      }
      result[relativePath] = 'other';
    }
  };
  await visit(root, '');
  return result;
}

async function snapshotCheckout(): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  const mergeTree = async (label: string, root: string): Promise<void> => {
    const tree = await hashTree(root);
    for (const [relativePath, digest] of Object.entries(tree)) {
      snapshot[`${label}/${relativePath}`] = digest;
    }
  };
  await mergeTree('src', join(CHECKOUT, 'src'));
  await mergeTree('dist', join(CHECKOUT, 'dist'));
  await mergeTree('.git/refs', join(CHECKOUT, '.git/refs'));
  for (const relativePath of [
    'package.json',
    'package-lock.json',
    'CHANGELOG.md',
    'tsconfig.json',
    '.git/index',
    '.git/HEAD',
    '.git/packed-refs',
  ]) {
    const absolute = join(CHECKOUT, ...relativePath.split('/'));
    if (!existsSync(absolute)) continue;
    snapshot[relativePath] = await hashFile(absolute);
  }
  return snapshot;
}

async function workingTreeHashes(root: string): Promise<Record<string, string>> {
  return hashTree(
    root,
    (relativePath) =>
      relativePath === 'node_modules' ||
      relativePath.startsWith('node_modules/') ||
      relativePath === '.git' ||
      relativePath.startsWith('.git/'),
  );
}

function configVersion(text: string, label: string): string {
  const matches = [...text.matchAll(/^export const KIKI_VERSION = (['"])([^'"\r\n]+)\1;$/gm)];
  if (matches.length !== 1) {
    throw new Error(`rehearsal: ${label} must contain exactly one anchored KIKI_VERSION export`);
  }
  return matches[0][2];
}

function inspectChangelog(text: string): CandidateEvidence['changelog'] {
  const unreleased = [...text.matchAll(/^## \[Unreleased\][ \t]*$/gm)];
  const releaseHeading = /^## \[3\.0\.0\]/m.test(text);
  let unreleasedNonEmpty = false;
  if (unreleased.length === 1) {
    const headingEnd = (unreleased[0].index ?? 0) + unreleased[0][0].length;
    const following = /^## /gm;
    following.lastIndex = headingEnd;
    const nextHeading = following.exec(text);
    const end = nextHeading ? nextHeading.index : text.length;
    unreleasedNonEmpty = text.slice(headingEnd, end).trim() !== '';
  }
  return {
    unreleasedCount: unreleased.length,
    hasReleaseHeading: releaseHeading,
    unreleasedNonEmpty,
  };
}

async function normalizeSyntheticInputs(root: string): Promise<{
  changed: string[];
  normalizationInputs: readonly string[];
  changelog: CandidateEvidence['changelog'];
}> {
  const before = await workingTreeHashes(root);

  const packagePath = join(root, 'package.json');
  const packageText = await readFile(packagePath, 'utf8');
  const packageData = JSON.parse(packageText) as Record<string, unknown>;
  packageData.version = SYNTHETIC_VERSION;
  await writeFile(packagePath, `${JSON.stringify(packageData, null, 2)}\n`);

  const lockPath = join(root, 'package-lock.json');
  let lockText = await readFile(lockPath, 'utf8');
  const formattingOptions = { insertSpaces: true, tabSize: 2 };
  lockText = applyEdits(
    lockText,
    modify(lockText, ['version'], SYNTHETIC_VERSION, { formattingOptions }),
  );
  lockText = applyEdits(
    lockText,
    modify(lockText, ['packages', '', 'version'], SYNTHETIC_VERSION, { formattingOptions }),
  );
  await writeFile(lockPath, lockText);

  const configPath = join(root, 'src/cli/config.ts');
  const configText = await readFile(configPath, 'utf8');
  const configMatches = [...configText.matchAll(/^export const KIKI_VERSION = '([^'\r\n]+)';$/gm)];
  if (configMatches.length !== 1) {
    throw new Error('rehearsal: synthetic src/cli/config.ts must contain exactly one KIKI_VERSION export');
  }
  const configMatch = configMatches[0];
  const start = configMatch.index ?? 0;
  const normalizedConfig =
    configText.slice(0, start) +
    `export const KIKI_VERSION = '${SYNTHETIC_VERSION}';` +
    configText.slice(start + configMatch[0].length);
  await writeFile(configPath, normalizedConfig);

  const changelogText = await readFile(join(root, 'CHANGELOG.md'), 'utf8');
  const changelog = inspectChangelog(changelogText);
  if (changelog.unreleasedCount !== 1 || changelog.hasReleaseHeading || !changelog.unreleasedNonEmpty) {
    throw new Error(
      'rehearsal: synthetic CHANGELOG.md must have one nonempty [Unreleased] section and no [3.0.0] target',
    );
  }

  const after = await workingTreeHashes(root);
  const changed = Object.keys({ ...before, ...after })
    .filter((relativePath) => before[relativePath] !== after[relativePath])
    .sort();
  const unexpected = changed.filter(
    (relativePath) => !NORMALIZATION_INPUTS.includes(relativePath as (typeof NORMALIZATION_INPUTS)[number]),
  );
  if (unexpected.length > 0) {
    throw new Error(`rehearsal: normalization changed unrelated files: ${unexpected.join(', ')}`);
  }
  return {
    changed,
    normalizationInputs: NORMALIZATION_INPUTS,
    changelog,
  };
}

async function captureCandidateEvidence(candidateRoot: string): Promise<CandidateEvidence> {
  const packageData = JSON.parse(await readFile(join(candidateRoot, 'package.json'), 'utf8')) as Record<
    string,
    unknown
  >;
  const lockData = JSON.parse(
    await readFile(join(candidateRoot, 'package-lock.json'), 'utf8'),
  ) as {
    version?: string;
    packages?: Record<string, { version?: string }>;
  };
  const rootPackage = lockData.packages?.['']?.version;
  const artifacts: CandidateEvidence['artifacts'] = {};
  for (const relativePath of [
    'dist/server/index.js',
    'dist/server/index.d.ts',
    'dist/tui/index.js',
    'dist/tui/index.d.ts',
  ]) {
    const absolute = join(candidateRoot, ...relativePath.split('/'));
    artifacts[relativePath] = {
      sha256: await hashFile(absolute),
      size: statSync(absolute).size,
    };
  }
  const distManifest = await hashTree(candidateRoot, (relativePath) => {
    if (relativePath === 'node_modules' || relativePath.startsWith('node_modules/')) return true;
    if (relativePath === '.git' || relativePath.startsWith('.git/')) return true;
    return GATE_ARTIFACT_PREFIXES.some(
      (prefix) => relativePath === prefix.slice(0, -1) || relativePath.startsWith(prefix),
    );
  });
  return {
    packageVersion: String(packageData.version),
    lockRootVersion: String(lockData.version),
    lockPackageVersion: String(rootPackage),
    sourceConfigVersion: configVersion(
      await readFile(join(candidateRoot, 'src/cli/config.ts'), 'utf8'),
      'candidate src/cli/config.ts',
    ),
    distConfigVersion: configVersion(
      await readFile(join(candidateRoot, 'dist/cli/config.js'), 'utf8'),
      'candidate dist/cli/config.js',
    ),
    changelog: inspectChangelog(await readFile(join(candidateRoot, 'CHANGELOG.md'), 'utf8')),
    artifacts,
    distManifest,
    candidateRoot,
  };
}

function writeEvidence(name: string, value: unknown): void {
  if (REHEARSAL_ARTIFACTS === undefined) return;
  mkdirSync(REHEARSAL_ARTIFACTS, { recursive: true });
  writeFileSync(
    join(REHEARSAL_ARTIFACTS, name),
    typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`,
  );
}

describe.skipIf(!ENABLED)('isolated 2.4.0 to 3.0.0 OC2 release rehearsal', () => {
  let previousEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    previousEnv = { ...process.env };
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in previousEnv)) delete process.env[key];
    }
    Object.assign(process.env, previousEnv);
  });

  it(
    'runs the unchanged release command against a synthetic 2.4.0 V3 source snapshot without source writes',
    async () => {
      expect(git(['rev-parse', 'HEAD'], CHECKOUT).trim()).toBe(BASELINE);

      // Negative scope pins: the existing parser rejects --dry-run, and an input
      // already at 3.0.0 can only compute 4.0.0 for --bump major.
      expect(() => parseReleaseArgs(['--dry-run'])).toThrow(/unsupported argument/i);
      const alreadyThree = decideVersion('3.0.0', [], 'major');
      expect(alreadyThree.next).toBe('4.0.0');
      expect(alreadyThree.next).not.toBe('3.0.0');
      const argv = parseReleaseArgs(['--bump', 'major', '--since', BASELINE]);
      expect(argv.apply).toBe(false);
      expect(argv.bump).toBe('major');
      expect(argv.since).toBe(BASELINE);
      expect(argv.securityException).toBeUndefined();

      const testTmp = mkdtempSync(join(tmpdir(), 'kiki-oc2-rehearsal-'));
      assertFixturePathSafe(testTmp);
      const syntheticRoot = join(testTmp, 'synthetic');
      const runRoot = join(testTmp, 'runs');
      const home = join(testTmp, 'home');
      for (const directory of [
        syntheticRoot,
        runRoot,
        home,
        join(testTmp, 'xdg-config'),
        join(testTmp, 'xdg-data'),
        join(testTmp, 'xdg-cache'),
        join(testTmp, 'xdg-state'),
        join(testTmp, 'npm-cache'),
        join(testTmp, 'npm-logs'),
        join(testTmp, 'npm-tmp'),
      ]) {
        mkdirSync(directory, { recursive: true });
      }
      const userNpmrc = join(testTmp, 'user.npmrc');
      const globalNpmrc = join(testTmp, 'global.npmrc');
      writeFileSync(userNpmrc, '', { mode: 0o600 });
      writeFileSync(globalNpmrc, '', { mode: 0o600 });
      for (const key of Object.keys(process.env)) {
        if (
          /^npm_config_/i.test(key) ||
          /^(?:NODE_AUTH_TOKEN|NPM_TOKEN|NPM_AUTH_TOKEN|YARN_NPM_AUTH_TOKEN)$/i.test(key)
        ) {
          delete process.env[key];
        }
      }
      Object.assign(process.env, {
        HOME: home,
        XDG_CONFIG_HOME: join(testTmp, 'xdg-config'),
        XDG_DATA_HOME: join(testTmp, 'xdg-data'),
        XDG_CACHE_HOME: join(testTmp, 'xdg-cache'),
        XDG_STATE_HOME: join(testTmp, 'xdg-state'),
        TMPDIR: runRoot,
        TMP: runRoot,
        TEMP: runRoot,
        NODE_ENV: 'development',
        VITEST_MAX_WORKERS: '8',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        npm_config_cache: join(testTmp, 'npm-cache'),
        npm_config_logs_dir: join(testTmp, 'npm-logs'),
        npm_config_tmp: join(testTmp, 'npm-tmp'),
        npm_config_userconfig: userNpmrc,
        npm_config_globalconfig: globalNpmrc,
      });

      try {
        const copied = await copyReviewedSource(CHECKOUT, syntheticRoot);
        const manifest = copied.manifest;
        expect(manifest.length).toBeGreaterThan(0);
        expect(copied.deleted.length).toBeGreaterThan(0);
        writeEvidence('source-manifest.json', {
          fileCount: manifest.length,
          deletedTrackedFiles: copied.deleted,
          excludedLiveConfigPaths: copied.excludedLiveConfigs,
          files: manifest,
        });
        expect(manifest.some((relativePath) => relativePath === 'src/server/index.ts')).toBe(true);
        expect(manifest.some((relativePath) => relativePath === 'tests/integration/oc2-release-rehearsal.test.ts')).toBe(true);
        expect(copied.excludedLiveConfigs).toContain('opencode.jsonc');
        for (const relativePath of manifest) {
          expect(hasSecretSegment(relativePath)).toBe(false);
          expect(isLiveConfigPath(relativePath)).toBe(false);
        }

        const normalization = await normalizeSyntheticInputs(syntheticRoot);
        expect(normalization.normalizationInputs).toEqual([...NORMALIZATION_INPUTS]);
        expect(normalization.changed).toEqual(
          expect.arrayContaining(['package.json', 'package-lock.json', 'src/cli/config.ts']),
        );
        expect(
          normalization.changed.every((relativePath) =>
            NORMALIZATION_INPUTS.includes(relativePath as (typeof NORMALIZATION_INPUTS)[number]),
          ),
        ).toBe(true);
        writeEvidence('normalization.json', {
          syntheticVersion: SYNTHETIC_VERSION,
          changed: normalization.changed,
          inputs: normalization.normalizationInputs,
          changelog: normalization.changelog,
        });

        git(['init', '-q'], syntheticRoot);
        cpSync(join(CHECKOUT, '.git/objects'), join(syntheticRoot, '.git/objects'), {
          recursive: true,
        });
        git(['update-ref', 'refs/heads/oc2-rehearsal', BASELINE], syntheticRoot);
        git(['symbolic-ref', 'HEAD', 'refs/heads/oc2-rehearsal'], syntheticRoot);
        git(['add', '-A', '--', '.'], syntheticRoot);
        const staged = git(['ls-files', '-z'], syntheticRoot)
          .split('\0')
          .filter((entry) => entry !== '')
          .sort();
        expect(staged).toEqual(manifest);
        expect(git(['log', '-1', '--format=%H'], syntheticRoot).trim()).toBe(BASELINE);
        expect(git(['rev-list', '--count', 'HEAD'], syntheticRoot).trim()).toBe(
          git(['rev-list', '--count', 'HEAD'], CHECKOUT).trim(),
        );

        cpSync(REAL_NODE_MODULES, join(syntheticRoot, 'node_modules'), {
          recursive: true,
          dereference: false,
          verbatimSymlinks: true,
        });

        const actualBefore = await snapshotCheckout();
        const syntheticBefore = await hashTree(
          syntheticRoot,
          (relativePath) => relativePath === 'node_modules' || relativePath.startsWith('node_modules/'),
        );

        const cliLog = await (async (): Promise<{ stdout: string; stderr: string }> => {
          try {
            const result = await execFileAsync(
              process.execPath,
              ['dist/cli/index.js', 'release', '--bump', 'major', '--since', BASELINE],
              {
                cwd: syntheticRoot,
                env: process.env,
                encoding: 'utf8',
                maxBuffer: 64 * 1024 * 1024,
                timeout: TIMEOUT,
              },
            );
            return { stdout: result.stdout, stderr: result.stderr };
          } catch (error) {
            const failure = error as {
              stdout?: string;
              stderr?: string;
              message?: string;
            };
            writeEvidence(
              'cli-release-failure.log',
              `${failure.stdout ?? ''}${failure.stderr ?? ''}${failure.message ?? String(error)}`,
            );
            throw new Error(
              `rehearsal CLI failed: ${failure.stderr || failure.stdout || failure.message || String(error)}`,
            );
          }
        })();
        writeEvidence('cli-release.log', `${cliLog.stdout}${cliLog.stderr}`);
        expect(cliLog.stdout).toContain(`Baseline: --since ${BASELINE}`);
        expect(cliLog.stdout).toContain(
          `Version: ${SYNTHETIC_VERSION} -> ${RELEASE_VERSION} (--bump major; ignored 0)`,
        );
        for (const gate of GATE_NAMES) {
          expect(cliLog.stdout).toContain(`${gate}: passed`);
        }
        expect(cliLog.stdout).toContain('Applied: false (dry run; no checkout writes).');
        expect(cliLog.stdout).not.toContain('Applied: true');

        const calls: RecordedCall[] = [];
        const logs: string[] = [];
        let candidateEvidence: CandidateEvidence | undefined;
        const runner: CommandRunner = async (file, args, options) => {
          const result = await fixtureRunner(file, args, options);
          calls.push({
            file,
            args: [...args],
            cwd: options.cwd,
            env: { ...options.env },
            result,
          });
          if (file === 'npm' && args[0] === 'audit') {
            candidateEvidence = await captureCandidateEvidence(options.cwd);
          }
          return result;
        };
        const deps: ReleaseDeps = {
          runner,
          now: () => new Date(),
          log: (line) => logs.push(line),
        };
        const exported = await prepareRelease(syntheticRoot, argv, deps);
        writeEvidence('exported-release.log', `${logs.join('\n')}\n`);
        writeEvidence('observed-calls.json', {
          calls: calls.map((call) => ({
            file: call.file,
            args: call.args,
            cwd: call.cwd,
            status: call.result.status,
          })),
        });

        expect(exported.version).toMatchObject({
          current: SYNTHETIC_VERSION,
          next: RELEASE_VERSION,
          rule: '--bump major',
          ignored: 0,
        });
        expect(exported.applied).toBe(false);
        expect(exported.gates.map((gate) => gate.name)).toEqual([...GATE_NAMES]);
        expect(exported.gates.map((gate) => gate.status)).toEqual(
          GATE_NAMES.map(() => 'passed'),
        );
        expect(calls.length).toBeGreaterThan(0);
        const testCall = calls.find((call) => call.file === 'npm' && call.args[0] === 'test');
        const auditCall = calls.find((call) => call.file === 'npm' && call.args[0] === 'audit');
        expect(testCall).toBeDefined();
        expect(auditCall).toBeDefined();
        // npm audit legitimately exits 1 when it reports non-blocking
        // advisories; the gate parser accepts 0/1 and all six gates passed.
        expect(
          calls
            .filter((call) => !(call.file === 'npm' && call.args[0] === 'audit'))
            .every((call) => call.result.status === 0),
        ).toBe(true);
        expect([0, 1]).toContain(auditCall?.result.status);
        expect(
          Object.keys(testCall?.env ?? {}).some((key) => /^KIKI_RELEASE_TEST_/i.test(key)),
        ).toBe(false);
        expect(testCall?.env.KIKI_RELEASE_TEST_OC2_REHEARSAL).toBeUndefined();

        expect(candidateEvidence).toBeDefined();
        const evidence = candidateEvidence as CandidateEvidence;
        expect(evidence.packageVersion).toBe(RELEASE_VERSION);
        expect(evidence.lockRootVersion).toBe(RELEASE_VERSION);
        expect(evidence.lockPackageVersion).toBe(RELEASE_VERSION);
        expect(evidence.sourceConfigVersion).toBe(RELEASE_VERSION);
        expect(evidence.distConfigVersion).toBe(RELEASE_VERSION);
        expect(evidence.changelog).toEqual({
          unreleasedCount: 1,
          hasReleaseHeading: true,
          unreleasedNonEmpty: false,
        });
        for (const artifact of Object.values(evidence.artifacts)) {
          expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
          expect(artifact.size).toBeGreaterThan(0);
        }
        expect(evidence.distManifest['dist/server/index.js']).toBe(
          evidence.artifacts['dist/server/index.js'].sha256,
        );
        expect(evidence.distManifest['dist/server/index.d.ts']).toBe(
          evidence.artifacts['dist/server/index.d.ts'].sha256,
        );
        expect(evidence.distManifest['dist/tui/index.js']).toBe(
          evidence.artifacts['dist/tui/index.js'].sha256,
        );
        expect(evidence.distManifest['dist/tui/index.d.ts']).toBe(
          evidence.artifacts['dist/tui/index.d.ts'].sha256,
        );
        writeEvidence('candidate-evidence.json', {
          ...evidence,
          candidateRoot: '<disposed>',
        });

        expect(await snapshotCheckout()).toEqual(actualBefore);
        expect(git(['rev-parse', 'HEAD'], CHECKOUT).trim()).toBe(BASELINE);
        expect(
          await hashTree(
            syntheticRoot,
            (relativePath) =>
              relativePath === 'node_modules' || relativePath.startsWith('node_modules/'),
          ),
        ).toEqual(syntheticBefore);
        expect(releaseTempRoots().size).toBe(0);
      } finally {
        rmSync(testTmp, { recursive: true, force: true });
      }
    },
    TIMEOUT,
  );
});
