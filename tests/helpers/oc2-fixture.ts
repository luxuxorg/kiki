import { execFileSync, spawn, spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { createHash, randomInt } from 'node:crypto';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync,
  symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseJsonc } from 'jsonc-parser';

/** The only OpenCode 2 binary generation Kiki 3.0.0 accepts. */
export const OC2_VERSION = '2.2.6';

export interface OC2Fixture {
  root: string;
  home: string;
  env: NodeJS.ProcessEnv;
  project: string;
  config: string;
  globalFile: string;
  cliFile: string;
  data: string;
  cache: string;
  state: string;
  binary: string;
  run(args: string[], options?: FixtureRunOptions): FixtureRunResult;
  runAsync(args: string[], options?: FixtureRunOptions): Promise<FixtureRunResult>;
  runCli(args: string[], options?: FixtureRunOptions): FixtureRunResult;
  readConfig(file?: string): any;
  writeGlobal(value: unknown): void;
  cleanup(): Promise<void>;
}

export interface FixtureRunOptions {
  cwd?: string;
  timeout?: number;
  input?: string;
  extraEnv?: NodeJS.ProcessEnv;
}

export interface FixtureRunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Environment for a disposable OpenCode 2 fixture. Only PATH plus explicitly
 * synthetic roots are inherited; auth, provider, config-override and unrelated
 * OPENCODE_* variables from the caller never reach the child.
 */
export function fixtureEnv(root: string): NodeJS.ProcessEnv {
  const home = join(root, 'home');
  const config = join(root, 'config');
  return {
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    HOME: home,
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    TMPDIR: join(root, 'tmp'),
    XDG_CONFIG_HOME: config,
    XDG_DATA_HOME: join(root, 'data'),
    XDG_CACHE_HOME: join(root, 'cache'),
    XDG_STATE_HOME: join(root, 'state'),
    OPENCODE_CONFIG_DIR: join(config, 'opencode'),
    OPENCODE_DISABLE_AUTOUPDATE: 'true',
    OPENCODE_DISABLE_MODELS_FETCH: 'true',
    PYTHONDONTWRITEBYTECODE: '1',
  };
}

const versionCache = new Map<string, string>();

/**
 * Resolve the explicitly supplied `OPENCODE_TEST_BINARY` and refuse any version
 * other than exactly 2.2.6. The probe runs in a disposable HOME and XDG roots so
 * a user's live config, credentials and state are never opened.
 */
export function requireOC2Binary(): string {
  const binary = process.env.OPENCODE_TEST_BINARY;
  if (!binary || !binary.trim()) {
    throw new Error('OPENCODE_TEST_BINARY must point at an absolute OpenCode 2.2.6 binary.');
  }
  if (!isAbsolute(binary)) throw new Error('OPENCODE_TEST_BINARY must be an absolute path.');
  const cached = versionCache.get(binary);
  if (cached) return cached;

  const probe = mkdtempSync(join(tmpdir(), 'kiki-oc2-version-'));
  try {
    const env = fixtureEnv(probe);
    const output = execFileSync(binary, ['--version'], {
      env,
      encoding: 'utf8',
      timeout: 15_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim().split(/\r?\n/)[0]?.trim() ?? '';
    const match = output.match(/^(?:opencode\s+v)?(\d+\.\d+\.\d+)$/i);
    if (!match || match[1] !== OC2_VERSION) {
      throw new Error(`Refusing OpenCode binary ${binary}: expected exactly ${OC2_VERSION}, observed ${JSON.stringify(output)}.`);
    }
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
  versionCache.set(binary, binary);
  return binary;
}

export function hasOC2Binary(): boolean {
  return typeof process.env.OPENCODE_TEST_BINARY === 'string'
    && process.env.OPENCODE_TEST_BINARY.trim().length > 0;
}

function repositoryRoot(): string {
  return resolve(fileURLToPath(new URL('../..', import.meta.url)));
}

function run(
  binary: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  options: FixtureRunOptions = {},
): FixtureRunResult {
  const spawnOptions: SpawnSyncOptions & { encoding: 'utf8' } = {
    cwd: options.cwd ?? process.cwd(),
    env: { ...env, ...(options.extraEnv ?? {}) },
    encoding: 'utf8',
    timeout: options.timeout ?? 90_000,
    input: options.input,
    stdio: ['pipe', 'pipe', 'pipe'],
  };
  const result = spawnSync(binary, args, spawnOptions);
  if (result.error) throw result.error;
  return {
    status: result.status,
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
  };
}

/**
 * Asynchronous variant used whenever a loopback fixture provider runs in the
 * test process: spawnSync would block the event loop and starve the provider.
 */
function runAsync(
  binary: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  options: FixtureRunOptions = {},
): Promise<FixtureRunResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(binary, args, {
      cwd: options.cwd ?? process.cwd(),
      env: { ...env, ...(options.extraEnv ?? {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, options.timeout ?? 90_000);
    child.stdout.on('data', chunk => { stdout += String(chunk); });
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', status => {
      clearTimeout(timer);
      resolveResult({ status, stdout, stderr });
    });
    if (options.input !== undefined) child.stdin.end(options.input);
    else child.stdin.end();
  });
}

/**
 * Disposable HOME, all four XDG roots and an explicit OPENCODE_CONFIG_DIR for a
 * real 2.2.6 binary. Callers own every file; cleanup removes only this root.
 */
export function createOC2Fixture(binary?: string): OC2Fixture {
  const resolvedBinary = binary ?? (hasOC2Binary() ? requireOC2Binary() : '');
  const root = mkdtempSync(join(tmpdir(), 'kiki-oc2-fixture-'));
  const env = fixtureEnv(root);
  const project = join(root, 'project');
  for (const directory of [
    join(root, 'home'), join(root, 'config', 'opencode'), join(root, 'data', 'opencode'),
    join(root, 'cache', 'opencode'), join(root, 'state', 'opencode'), join(root, 'tmp'), project,
  ]) {
    mkdirSync(directory, { recursive: true });
  }
  if (resolvedBinary) {
    // Shadow any user wrapper on PATH with the explicitly supplied raw binary,
    // so commands that resolve `opencode` by name can never touch live roots.
    const bin = join(root, 'bin');
    mkdirSync(bin, { recursive: true });
    symlinkSync(resolvedBinary, join(bin, 'opencode'));
    env.PATH = `${bin}:${env.PATH ?? ''}`;
  }

  const config = env.OPENCODE_CONFIG_DIR!;
  const globalFile = join(config, 'opencode.jsonc');
  const cliFile = join(config, 'cli.json');
  // Give every fixture its own managed-service port so parallel integration
  // files (and a user's live OpenCode service) cannot collide on 49374.
  writeFileSync(join(config, 'service.json'), JSON.stringify({ port: randomInt(20_000, 60_000) }));

  const fixture: OC2Fixture = {
    root,
    home: env.HOME!,
    env,
    project,
    config,
    globalFile,
    cliFile,
    data: env.XDG_DATA_HOME!,
    cache: env.XDG_CACHE_HOME!,
    state: env.XDG_STATE_HOME!,
    binary: resolvedBinary,
    run(args, options) {
      return run(resolvedBinary, args, env, { cwd: project, ...options });
    },
    runAsync(args, options) {
      return runAsync(resolvedBinary, args, env, { cwd: project, ...options });
    },
    runCli(args, options) {
      return run(process.execPath, [join(repositoryRoot(), 'dist/cli/index.js'), ...args], env, {
        cwd: project,
        ...options,
      });
    },
    readConfig(file = globalFile) {
      return parseJsonc(readFileSync(file, 'utf8'));
    },
    writeGlobal(value) {
      mkdirSync(config, { recursive: true });
      writeFileSync(globalFile, `${JSON.stringify(value, null, 2)}\n`);
    },
    async cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
  return fixture;
}

export interface TreeDigest {
  path: string;
  sha256: string;
  mode: number;
  size: number;
}

/**
 * Byte/mode snapshot of a directory tree. Used by isolation tests to prove an
 * OC1-shaped fixture was not rewritten by OC2 activity.
 */
export function snapshotTree(directory: string): TreeDigest[] {
  const entries: TreeDigest[] = [];
  const walk = (current: string): void => {
    if (!existsSync(current)) return;
    for (const name of readdirSync(current).sort()) {
      const file = join(current, name);
      const stat = statSync(file);
      if (stat.isDirectory()) {
        walk(file);
        continue;
      }
      entries.push({
        path: file.slice(directory.length + 1),
        sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
        mode: stat.mode & 0o777,
        size: stat.size,
      });
    }
  };
  walk(directory);
  return entries;
}

export function fileDigest(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

export function writeJSONC(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function readJSONC(file: string): any {
  return parseJsonc(readFileSync(file, 'utf8'));
}

export function readJsonLines(file: string): Array<Record<string, any>> {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as Record<string, any>);
}
