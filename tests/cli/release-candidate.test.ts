import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import {
  changedPaths,
  createCandidate,
  readGit,
  snapshotTree,
  type Candidate,
  type CommandRunner,
} from '../../src/cli/release-candidate';
import {
  createReleaseFixture,
  fixtureRunner,
  releaseTempRoots,
  snapshotEntries,
  type ReleaseFixture,
} from '../helpers/release-fixture';

const execFileAsync = promisify(execFile);

let fixture: ReleaseFixture;
let originalTmp: string | undefined;
let testTmp: string;

beforeEach(() => {
  originalTmp = process.env.TMPDIR;
  testTmp = mkdtempSync(join(tmpdir(), 'kiki-candidate-test-'));
  process.env.TMPDIR = testTmp;
  fixture = createReleaseFixture();
});

afterEach(() => {
  fixture.cleanup();
  if (originalTmp === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = originalTmp;
  rmSync(testTmp, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function trackedPaths(): Promise<string[]> {
  const raw = await readGit(fixtureRunner, fixture.checkout, 'ls-files', ['-z']);
  return raw.split('\0').filter(Boolean);
}

async function newCandidate(): Promise<Candidate> {
  return createCandidate(fixture.checkout, await trackedPaths());
}

function candidateFile(candidate: Candidate, relativePath: string): string {
  return join(candidate.root, relativePath);
}

function listFiles(root: string, relative = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(root, relative)).sort()) {
    const rel = relative === '' ? name : `${relative}/${name}`;
    const stat = lstatSync(join(root, rel));
    out.push(rel);
    if (stat.isDirectory()) out.push(...listFiles(root, rel));
  }
  return out;
}

async function runExecutable(file: string, args: string[], cwd: string): Promise<{ status: number; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(file, args, { cwd, encoding: 'utf8' });
    return { status: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as { code?: number | string; stdout?: string; stderr?: string };
    return {
      status: typeof failure.code === 'number' ? failure.code : 1,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? '',
    };
  }
}

describe('readGit', () => {
  it('runs only allowlisted read-only subcommands with argv arrays and optional locks disabled', async () => {
    const calls: Array<{ file: string; args: string[]; options: { cwd: string; env: NodeJS.ProcessEnv } }> = [];
    const runner: CommandRunner = async (file, args, options) => {
      calls.push({ file, args, options });
      return { status: 0, stdout: 'abc\0subject\0body\0', stderr: '' };
    };
    process.env.KIKI_RELEASE_TEST_ENV = 'kept';
    const before = process.env.GIT_OPTIONAL_LOCKS;
    try {
      const output = await readGit(runner, '/synthetic/repo', 'log', ['--format=%H%x00%B%x00']);
      expect(output).toBe('abc\0subject\0body\0');
    } finally {
      delete process.env.KIKI_RELEASE_TEST_ENV;
    }
    expect(calls).toHaveLength(1);
    expect(calls[0].file).toBe('git');
    expect(calls[0].args).toEqual(['log', '--format=%H%x00%B%x00']);
    expect(calls[0].options.cwd).toBe('/synthetic/repo');
    expect(calls[0].options.env.GIT_OPTIONAL_LOCKS).toBe('0');
    expect(calls[0].options.env.KIKI_RELEASE_TEST_ENV).toBe('kept');
    expect(process.env.GIT_OPTIONAL_LOCKS).toBe(before);
  });

  it('supports ls-files -z and status porcelain with untracked files', async () => {
    const calls: string[][] = [];
    const runner: CommandRunner = async (_file, args) => {
      calls.push(args);
      return { status: 0, stdout: args.includes('-z') ? 'a\0b\0' : ' M package.json\n', stderr: '' };
    };
    await expect(readGit(runner, '/repo', 'ls-files', ['-z'])).resolves.toBe('a\0b\0');
    await expect(readGit(runner, '/repo', 'status', ['--porcelain', '--untracked-files=all'])).resolves.toBe(
      ' M package.json\n',
    );
    expect(calls).toEqual([
      ['ls-files', '-z'],
      ['status', '--porcelain', '--untracked-files=all'],
    ]);
  });

  it('rejects mutating or remote git subcommands before invoking the runner', async () => {
    const runner = vi.fn<CommandRunner>();
    for (const subcommand of ['commit', 'tag', 'push', 'fetch', 'publish', 'rev-parse', 'config', 'checkout', 'reset']) {
      await expect(
        readGit(runner, '/repo', subcommand as unknown as 'log', []),
      ).rejects.toThrow(/not allowed/);
    }
    expect(runner).not.toHaveBeenCalled();
  });

  it('uses a bounded argument allowlist and rejects abbreviated write options before invoking the runner', async () => {
    const runner = vi.fn<CommandRunner>();
    for (const args of [
      ['--out=/tmp/leak'],
      ['--output=/tmp/leak'],
      ['--exec-path=/tmp'],
      ['--config-env=core.x=Y'],
      ['-c', 'core.foo=bar'],
      ['--decorate'],
      ['-HEAD'],
      ['bad\0arg'],
    ]) {
      await expect(readGit(runner, '/repo', 'log', args)).rejects.toThrow(/unsupported|not allowed|NUL/);
    }
    await expect(readGit(runner, '/repo', 'ls-files', ['--error-unmatch'])).rejects.toThrow(/unsupported|not allowed/);
    await expect(readGit(runner, '/repo', 'status', ['--short'])).rejects.toThrow(/unsupported|not allowed/);
    expect(runner).not.toHaveBeenCalled();
  });

  it('permits only the read options Task 9 needs, with revisions passed as data', async () => {
    const calls: string[][] = [];
    const runner: CommandRunner = async (_file, args) => {
      calls.push(args);
      return { status: 0, stdout: 'ok', stderr: '' };
    };
    await expect(
      readGit(runner, '/repo', 'log', ['--format=%H%x00%B%x00', 'v2.2.0..HEAD']),
    ).resolves.toBe('ok');
    await expect(readGit(runner, '/repo', 'ls-files', ['-z'])).resolves.toBe('ok');
    await expect(
      readGit(runner, '/repo', 'status', ['--porcelain', '--untracked-files=all']),
    ).resolves.toBe('ok');
    expect(calls).toEqual([
      ['log', '--format=%H%x00%B%x00', 'v2.2.0..HEAD'],
      ['ls-files', '-z'],
      ['status', '--porcelain', '--untracked-files=all'],
    ]);
  });

  it('surfaces a non-zero git result as a clear error', async () => {
    const runner: CommandRunner = async () => ({ status: 128, stdout: '', stderr: 'fatal: not a git repository' });
    await expect(readGit(runner, '/repo', 'log', [])).rejects.toThrow(/git log failed.*not a git repository/);
  });

  it('creates no candidate temp state when the runner rejects', async () => {
    const originalTmp = process.env.TMPDIR;
    const isolated = mkdtempSync(join(tmpdir(), 'kiki-reject-isolated-'));
    process.env.TMPDIR = isolated;
    try {
      const before = releaseTempRoots();
      const runner: CommandRunner = async () => {
        throw new Error('runner rejected');
      };
      await expect(readGit(runner, fixture.checkout, 'status', ['--porcelain'])).rejects.toThrow(
        'runner rejected',
      );
      expect(releaseTempRoots()).toEqual(before);
    } finally {
      if (originalTmp === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = originalTmp;
      rmSync(isolated, { recursive: true, force: true });
    }
  });
});

describe('createCandidate tracked working-tree copy', () => {
  it('copies tracked paths containing spaces and newlines parsed from NUL output', async () => {
    const tracked = await trackedPaths();
    expect(tracked).toContain('docs/with space.txt');
    expect(tracked).toContain('docs/with\nnewline.txt');
    const candidate = await createCandidate(fixture.checkout, tracked);
    try {
      expect(readFileSync(candidateFile(candidate, 'docs/with space.txt'), 'utf8')).toBe('space path\n');
      expect(readFileSync(candidateFile(candidate, 'docs/with\nnewline.txt'), 'utf8')).toBe('newline path\n');
    } finally {
      await candidate.dispose();
    }
  });

  it('includes dirty tracked edits instead of HEAD bytes', async () => {
    fixture.write('package.json', '{"name":"kiki","version":"9.9.9-dirty"}\n');
    const candidate = await newCandidate();
    try {
      expect(readFileSync(candidateFile(candidate, 'package.json'), 'utf8')).toBe(
        '{"name":"kiki","version":"9.9.9-dirty"}\n',
      );
      expect(readFileSync(join(fixture.checkout, 'package.json'), 'utf8')).toBe(
        '{"name":"kiki","version":"9.9.9-dirty"}\n',
      );
    } finally {
      await candidate.dispose();
    }
  });

  it('excludes untracked, ignored, secret and .git paths while copying the explicit dependency tree', async () => {
    const candidate = await newCandidate();
    try {
      expect(existsSync(candidateFile(candidate, '.git'))).toBe(false);
      expect(existsSync(candidateFile(candidate, 'untracked-sentinel.txt'))).toBe(false);
      expect(existsSync(candidateFile(candidate, 'ignored-sentinel.txt'))).toBe(false);
      expect(existsSync(candidateFile(candidate, 'tmp/build.log'))).toBe(false);
      expect(existsSync(candidateFile(candidate, '.agentic/routing_log.jsonl'))).toBe(false);
      expect(existsSync(candidateFile(candidate, '.env'))).toBe(false);
      expect(existsSync(candidateFile(candidate, 'node_modules/fake-dep/package.json'))).toBe(true);
      expect(readFileSync(candidateFile(candidate, 'package.json'), 'utf8')).toContain('"version": "2.2.0"');
    } finally {
      await candidate.dispose();
    }
  });

  it('fails closed when a tracked file was deleted instead of falling back to HEAD bytes', async () => {
    const tracked = await trackedPaths();
    fixture.remove('docs/with space.txt');
    const before = releaseTempRoots();
    await expect(createCandidate(fixture.checkout, tracked)).rejects.toThrow(/missing|deleted|tracked/i);
    expect(releaseTempRoots()).toEqual(before);
  });

  it('refuses absolute, parent traversal, NUL and .git tracked paths', async () => {
    const tracked = await trackedPaths();
    await expect(createCandidate(fixture.checkout, [...tracked, '/etc/passwd'])).rejects.toThrow(/absolute|unsafe|path/i);
    await expect(createCandidate(fixture.checkout, [...tracked, '../outside.txt'])).rejects.toThrow(/parent|unsafe|path/i);
    await expect(createCandidate(fixture.checkout, [...tracked, 'bad\0path'])).rejects.toThrow(/NUL|unsafe|path/i);
    await expect(createCandidate(fixture.checkout, [...tracked, '.git/config'])).rejects.toThrow(/\.git|unsafe|path/i);
  });

  it('rejects a tracked path whose symlinked ancestor escapes the checkout', async () => {
    const outside = join(fixture.root, 'outside');
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'secret.txt'), 'outside sentinel\n');
    symlinkSync(outside, join(fixture.checkout, 'linked-outside'));
    const tracked = await trackedPaths();
    await expect(
      createCandidate(fixture.checkout, [...tracked, 'linked-outside/secret.txt']),
    ).rejects.toThrow(/symlink|escape|outside/i);
    expect(readFileSync(join(outside, 'secret.txt'), 'utf8')).toBe('outside sentinel\n');
  });

  it('rejects a tracked symlink whose target escapes the checkout', async () => {
    const outside = join(fixture.root, 'outside.txt');
    writeFileSync(outside, 'outside file\n');
    symlinkSync(outside, join(fixture.checkout, 'escape.txt'));
    const tracked = await trackedPaths();
    await expect(createCandidate(fixture.checkout, [...tracked, 'escape.txt'])).rejects.toThrow(
      /symlink|escape|outside/i,
    );
  });

  it('refuses tracked symlinks and symlinked ancestors for writable release targets even when internal', async () => {
    fixture.mkdir('docs/real-dir');
    fixture.write('docs/real-dir/real.txt', 'internal real\n');
    fixture.add('docs/real-dir/real.txt');
    fixture.commit('test: add internal symlink target');
    fixture.symlink('real-dir', 'docs/alias-dir');
    fixture.symlink('real-dir/real.txt', 'docs/alias-file.txt');
    const tracked = await trackedPaths();
    await expect(
      createCandidate(fixture.checkout, [...tracked, 'docs/alias-file.txt']),
    ).rejects.toThrow(/symlink/i);
    await expect(
      createCandidate(fixture.checkout, [...tracked, 'docs/alias-dir/real.txt']),
    ).rejects.toThrow(/symlink/i);
  });

  it('refuses benign tracked links that resolve through secret names', async () => {
    fixture.mkdir('secrets');
    fixture.write('secrets/token.txt', 'FIXTURE_ONLY_ALIAS_SECRET\n');
    fixture.symlink('.env', 'alias-secret-file.txt');
    fixture.symlink('secrets', 'alias-secret-dir');
    const tracked = await trackedPaths();
    await expect(
      createCandidate(fixture.checkout, [...tracked, 'alias-secret-file.txt']),
    ).rejects.toThrow(/secret|symlink/i);
    await expect(
      createCandidate(fixture.checkout, [...tracked, 'alias-secret-dir/token.txt']),
    ).rejects.toThrow(/secret|symlink/i);
  });

  it('fails clearly when dependencies are missing without a network fallback', async () => {
    fixture.cleanup();
    fixture = createReleaseFixture({ withoutNodeModules: true });
    const before = releaseTempRoots();
    await expect(newCandidate()).rejects.toThrow(/node_modules|dependencies/i);
    expect(releaseTempRoots()).toEqual(before);
  });

  it('refuses a temporary parent that resolves inside the checkout before creating anything', async () => {
    const originalTmp = process.env.TMPDIR;
    const inside = join(fixture.checkout, 'tmpdir-inside');
    mkdirSync(inside, { recursive: true });
    const before = snapshotEntries(fixture.root);
    process.env.TMPDIR = inside;
    try {
      await expect(newCandidate()).rejects.toThrow(/temporary.*checkout|TMPDIR|temp.*checkout/i);
    } finally {
      if (originalTmp === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = originalTmp;
    }
    expect(snapshotEntries(fixture.root)).toEqual(before);
  });

  it('rejects dependency trees beyond the bounded walk depth', async () => {
    let deep = join(fixture.checkout, 'node_modules');
    for (let index = 0; index < 70; index++) {
      deep = join(deep, `d${index}`);
      mkdirSync(deep);
    }
    writeFileSync(join(deep, 'leaf.txt'), 'deep leaf\n');
    const before = releaseTempRoots();
    await expect(newCandidate()).rejects.toThrow(/depth/i);
    expect(releaseTempRoots()).toEqual(before);
  });
});

describe('createCandidate isolation and ownership', () => {
  it('creates candidate, backup, cache, log and tmp state under a run-owned root outside the checkout', async () => {
    const candidate = await newCandidate();
    try {
      expect(candidate.root.startsWith(fixture.checkout + sep)).toBe(false);
      expect(candidate.runRoot.startsWith(fixture.checkout + sep)).toBe(false);
      expect(resolve(candidate.root).startsWith(resolve(candidate.runRoot) + sep)).toBe(true);
      for (const path of [candidate.root, candidate.runRoot]) {
        expect(lstatSync(path).isDirectory()).toBe(true);
        expect(lstatSync(path).isSymbolicLink()).toBe(false);
      }
      const paths = [
        candidate.npmEnv.npm_config_cache,
        candidate.npmEnv.npm_config_logs_dir,
        candidate.npmEnv.npm_config_tmp,
        candidate.npmEnv.TMPDIR,
        candidate.npmEnv.TMP,
        candidate.npmEnv.TEMP,
        join(candidate.runRoot, 'backup'),
      ];
      for (const value of paths) {
        expect(typeof value).toBe('string');
        const path = value as string;
        expect(resolve(path).startsWith(resolve(candidate.runRoot) + sep)).toBe(true);
        expect(lstatSync(path).isDirectory()).toBe(true);
        expect(lstatSync(path).isSymbolicLink()).toBe(false);
      }
      expect(candidate.npmEnv.TMPDIR).toBe(join(candidate.runRoot, 'tmp'));
      expect(candidate.npmEnv.npm_config_cache).toBe(join(candidate.runRoot, 'cache'));
    } finally {
      await candidate.dispose();
    }
  });

  it('does not alter source checkout, source dependencies, ignored/untracked files or .git when candidate state is written', async () => {
    const before = snapshotEntries(fixture.root);
    const candidate = await newCandidate();
    try {
      writeFileSync(candidateFile(candidate, 'node_modules/fake-dep/.cache/state.txt'), 'candidate-cache\n');
      mkdirSync(candidateFile(candidate, 'tmp'), { recursive: true });
      writeFileSync(candidateFile(candidate, 'tmp/candidate.log'), 'candidate tmp\n');
      writeFileSync(candidateFile(candidate, 'ignored-sentinel.txt'), 'candidate ignored\n');
      writeFileSync(candidateFile(candidate, 'untracked-sentinel.txt'), 'candidate untracked\n');
      mkdirSync(candidateFile(candidate, '.agentic'), { recursive: true });
      writeFileSync(candidateFile(candidate, '.agentic/routing_log.jsonl'), '{"candidate":"log"}\n');
      writeFileSync(candidateFile(candidate, '.env'), 'FIXTURE_ONLY=candidate\n');
    } finally {
      await candidate.dispose();
    }
    expect(snapshotEntries(fixture.root)).toEqual(before);
  });

  it('disposes the run root and is idempotent', async () => {
    const candidate = await newCandidate();
    await candidate.dispose();
    expect(existsSync(candidate.runRoot)).toBe(false);
    expect(existsSync(candidate.root)).toBe(false);
    await expect(candidate.dispose()).resolves.toBeUndefined();
  });

  it('cleans a partially copied candidate when dependency copying fails', async () => {
    fixture.write('node_modules/foreign/cli.py', '#!/usr/bin/env python3\nprint("foreign")\n', 0o755);
    fixture.symlink('../foreign/cli.py', 'node_modules/.bin/foreign');
    const before = releaseTempRoots();
    await expect(newCandidate()).rejects.toThrow(/non-Node|unsupported|Node-shebang/i);
    expect(releaseTempRoots()).toEqual(before);
  });

  it('cleans a partially copied candidate when a tracked file becomes unreadable', async () => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      // Running as root bypasses mode bits; the dependency-copy failure test
      // above still exercises partial-copy cleanup on this platform.
      return;
    }
    fixture.write('a-readable.txt', 'readable\n');
    fixture.write('z-unreadable.txt', 'unreadable\n');
    fixture.add(['a-readable.txt', 'z-unreadable.txt']);
    fixture.commit('test: add partial copy fixtures');
    chmodSync(join(fixture.checkout, 'z-unreadable.txt'), 0o000);
    const before = releaseTempRoots();
    try {
      await expect(newCandidate()).rejects.toThrow();
      expect(releaseTempRoots()).toEqual(before);
    } finally {
      chmodSync(join(fixture.checkout, 'z-unreadable.txt'), 0o600);
    }
  });
});

describe('candidate package safety guards', () => {
  it('refuses a root .npmrc using metadata only, without reading or printing it', async () => {
    const sentinel = 'FIXTURE_ONLY_ROOT_NPMRC_SENTINEL';
    fixture.write('.npmrc', sentinel, 0o000);
    const before = releaseTempRoots();
    try {
      let message = '';
      try {
        await newCandidate();
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/\.npmrc/i);
      expect(message).not.toContain(sentinel);
      expect(releaseTempRoots()).toEqual(before);
    } finally {
      chmodSync(join(fixture.checkout, '.npmrc'), 0o600);
    }
  });

  it('refuses a tracked .npmrc using metadata only, without reading or printing it', async () => {
    const sentinel = 'FIXTURE_ONLY_TRACKED_NPMRC_SENTINEL';
    fixture.write('config/.npmrc', sentinel, 0o600);
    fixture.add('config/.npmrc');
    fixture.commit('test: add tracked npmrc fixture');
    chmodSync(join(fixture.checkout, 'config/.npmrc'), 0o000);
    const before = releaseTempRoots();
    try {
      let message = '';
      try {
        await newCandidate();
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/\.npmrc/i);
      expect(message).not.toContain(sentinel);
      expect(releaseTempRoots()).toEqual(before);
    } finally {
      chmodSync(join(fixture.checkout, 'config/.npmrc'), 0o600);
    }
  });

  it('refuses tracked secret-bearing paths without reading them', async () => {
    const sentinel = 'FIXTURE_ONLY_SECRET_SENTINEL';
    fixture.write('id_rsa', sentinel, 0o600);
    fixture.add('id_rsa');
    fixture.commit('test: add synthetic secret fixture');
    chmodSync(join(fixture.checkout, 'id_rsa'), 0o000);
    const before = releaseTempRoots();
    try {
      let message = '';
      try {
        await newCandidate();
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/secret|id_rsa/i);
      expect(message).not.toContain(sentinel);
      expect(releaseTempRoots()).toEqual(before);
    } finally {
      chmodSync(join(fixture.checkout, 'id_rsa'), 0o600);
    }
  });

  it('refuses tracked paths with a secret-bearing parent segment without reading them', async () => {
    const sentinel = 'FIXTURE_ONLY_NESTED_SECRET_SENTINEL';
    fixture.write('secrets/token.txt', sentinel, 0o600);
    fixture.add('secrets/token.txt');
    fixture.commit('test: add nested synthetic secret fixture');
    chmodSync(join(fixture.checkout, 'secrets/token.txt'), 0o000);
    const before = releaseTempRoots();
    try {
      let message = '';
      try {
        await newCandidate();
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/secret|secrets/i);
      expect(message).not.toContain(sentinel);
      expect(releaseTempRoots()).toEqual(before);
    } finally {
      chmodSync(join(fixture.checkout, 'secrets/token.txt'), 0o600);
    }
  });

  it('never copies secret files from the dependency tree', async () => {
    fixture.write('node_modules/fake-dep/.npmrc', 'FIXTURE_ONLY_DEP_NPMRC\n', 0o000);
    const candidate = await newCandidate();
    try {
      expect(existsSync(candidateFile(candidate, 'node_modules/fake-dep/.env'))).toBe(false);
      expect(existsSync(candidateFile(candidate, 'node_modules/fake-dep/.npmrc'))).toBe(false);
      expect(existsSync(candidateFile(candidate, 'node_modules/fake-dep/index.js'))).toBe(true);
    } finally {
      await candidate.dispose();
    }
  });
});

describe('dependency links and .bin shims', () => {
  it('replaces .bin links with candidate-owned executable Node shims', async () => {
    const candidate = await newCandidate();
    try {
      const shimPath = candidateFile(candidate, 'node_modules/.bin/fake-cli');
      const stat = lstatSync(shimPath);
      expect(stat.isFile()).toBe(true);
      expect(stat.isSymbolicLink()).toBe(false);
      expect(stat.mode & 0o777).toBe(0o755);
      const shim = readFileSync(shimPath, 'utf8');
      expect(shim.startsWith('#!/bin/sh\n')).toBe(true);
      expect(shim).toContain(`'${process.execPath}'`);
      expect(shim).toContain(`'${candidateFile(candidate, 'node_modules/fake-cli/cli.js')}'`);
      expect(shim).toContain('"$@"');
      expect(shim).not.toContain(fixture.checkout);
      expect(shim).not.toContain(resolve(fixture.checkout));
    } finally {
      await candidate.dispose();
    }
  });

  it('preserves relative imports, argv forwarding and exit status through the shim', async () => {
    const candidate = await newCandidate();
    try {
      const shim = candidateFile(candidate, 'node_modules/.bin/fake-cli');
      const ok = await runExecutable(shim, ['hello', 'two words', "it's"], candidate.root);
      expect(ok.status).toBe(0);
      const payload = JSON.parse(ok.stdout);
      expect(payload.args).toEqual(['hello', 'two words', "it's"]);
      expect(payload.relative).toBe('relative-marker');
      expect(payload.dir).toBe(candidateFile(candidate, 'node_modules/fake-cli'));

      const failed = await runExecutable(shim, ['FAIL'], candidate.root);
      expect(failed.status).toBe(7);
    } finally {
      await candidate.dispose();
    }
  });

  it('applies the Node shim to nested .bin links too', async () => {
    const candidate = await newCandidate();
    try {
      const shimPath = candidateFile(candidate, 'node_modules/outer/node_modules/.bin/nested-cli');
      expect(lstatSync(shimPath).isSymbolicLink()).toBe(false);
      const result = await runExecutable(shimPath, ['nested-arg'], candidate.root);
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ nested: true, args: ['nested-arg'] });
    } finally {
      await candidate.dispose();
    }
  });

  it('quotes candidate paths containing spaces and apostrophes', async () => {
    const originalTmp = process.env.TMPDIR;
    const temp = join(fixture.root, "tmp space's");
    mkdirSync(temp, { recursive: true });
    process.env.TMPDIR = temp;
    let candidate: Candidate | undefined;
    try {
      candidate = await newCandidate();
      expect(candidate.root).toContain("tmp space's");
      const shim = candidateFile(candidate, 'node_modules/.bin/fake-cli');
      const content = readFileSync(shim, 'utf8');
      expect(content).toContain(`'${process.execPath}'`);
      const result = await runExecutable(shim, ["it's", 'two words'], candidate.root);
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout).args).toEqual(["it's", 'two words']);
    } finally {
      if (candidate) await candidate.dispose();
      if (originalTmp === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = originalTmp;
    }
  });

  it('rejects unsupported non-Node linked executables', async () => {
    fixture.write('node_modules/foreign/cli.py', '#!/usr/bin/env python3\nprint("foreign")\n', 0o755);
    fixture.symlink('../foreign/cli.py', 'node_modules/.bin/foreign');
    const before = releaseTempRoots();
    await expect(newCandidate()).rejects.toThrow(/non-Node|unsupported|Node-shebang/i);
    expect(releaseTempRoots()).toEqual(before);
  });

  it('rejects dangling, cyclic, external and missing mapped dependency links', async () => {
    const cases: Array<{ link: string; target: string; expected: RegExp }> = [
      { link: 'node_modules/.bin/dangling', target: '../missing/cli.js', expected: /dangling|missing|resolve/i },
      { link: 'node_modules/.bin/missing-target', target: '../fake-cli/missing.js', expected: /dangling|missing|resolve/i },
      { link: 'node_modules/.bin/external', target: '/etc/passwd', expected: /absolute|external|escape/i },
      { link: 'node_modules/.bin/parent-escape', target: '../../../outside/cli.js', expected: /external|escape|outside/i },
      { link: 'node_modules/cycle', target: '.', expected: /cyclic|cycle/i },
    ];
    for (const testCase of cases) {
      const before = releaseTempRoots();
      fixture.symlink(testCase.target, testCase.link);
      await expect(newCandidate()).rejects.toThrow(testCase.expected);
      expect(releaseTempRoots()).toEqual(before);
      fixture.remove(testCase.link);
    }
  });

  it('refuses .bin links whose target is under a secret-bearing path', async () => {
    fixture.write('node_modules/fake-cli/secrets/run.js', '#!/usr/bin/env node\n', 0o755);
    fixture.symlink('../fake-cli/secrets/run.js', 'node_modules/.bin/secret-target');
    const before = releaseTempRoots();
    await expect(newCandidate()).rejects.toThrow(/secret/i);
    expect(releaseTempRoots()).toEqual(before);
    fixture.remove('node_modules/.bin/secret-target');
  });

  it('supports recognized ELF native .bin targets with a candidate-owned direct-exec shim', async () => {
    const nativeBytes = readFileSync('/bin/echo');
    expect([...nativeBytes.subarray(0, 4)]).toEqual([0x7f, 0x45, 0x4c, 0x46]);
    fixture.write('node_modules/native-cli/bin/native', nativeBytes, 0o755);
    fixture.symlink('../native-cli/bin/native', 'node_modules/.bin/native-cli');
    const before = snapshotEntries(fixture.root);
    const candidate = await newCandidate();
    try {
      const shimPath = candidateFile(candidate, 'node_modules/.bin/native-cli');
      const shimStat = lstatSync(shimPath);
      expect(shimStat.isFile()).toBe(true);
      expect(shimStat.isSymbolicLink()).toBe(false);
      expect(shimStat.mode & 0o777).toBe(0o755);
      const shim = readFileSync(shimPath, 'utf8');
      const nativePath = candidateFile(candidate, 'node_modules/native-cli/bin/native');
      expect(shim.startsWith('#!/bin/sh\n')).toBe(true);
      expect(shim).toBe(`#!/bin/sh\nexec '${nativePath}' "$@"\n`);
      expect(shim).not.toContain(process.execPath);
      expect(shim).not.toContain(fixture.checkout);
      expect(readFileSync(nativePath).equals(nativeBytes)).toBe(true);
      expect(lstatSync(nativePath).isSymbolicLink()).toBe(false);
      expect(shimStat.ino).not.toBe(lstatSync(join(fixture.checkout, 'node_modules/native-cli/bin/native')).ino);

      const success = await runExecutable(shimPath, ['hello', "it's", 'two words'], candidate.root);
      expect(success.status).toBe(0);
      expect(success.stdout.trim()).toBe("hello it's two words");
    } finally {
      await candidate.dispose();
    }
    expect(snapshotEntries(fixture.root)).toEqual(before);
  });

  it('propagates non-zero exit status from an ELF native .bin shim', async () => {
    const nativeBytes = readFileSync('/bin/false');
    fixture.write('node_modules/native-fail/bin/native', nativeBytes, 0o755);
    fixture.symlink('../native-fail/bin/native', 'node_modules/.bin/native-fail');
    const candidate = await newCandidate();
    try {
      const result = await runExecutable(candidateFile(candidate, 'node_modules/.bin/native-fail'), [], candidate.root);
      expect(result.status).toBe(1);
    } finally {
      await candidate.dispose();
    }
  });

  it('supports ELF native .bin shims when the candidate path contains spaces and apostrophes', async () => {
    const originalTmp = process.env.TMPDIR;
    const temp = join(fixture.root, "native temp's");
    mkdirSync(temp, { recursive: true });
    fixture.write('node_modules/native-cli/bin/native', readFileSync('/bin/echo'), 0o755);
    fixture.symlink('../native-cli/bin/native', 'node_modules/.bin/native-cli');
    process.env.TMPDIR = temp;
    let candidate: Candidate | undefined;
    try {
      candidate = await newCandidate();
      expect(candidate.root).toContain("native temp's");
      const result = await runExecutable(
        candidateFile(candidate, 'node_modules/.bin/native-cli'),
        ["it's", 'two words'],
        candidate.root,
      );
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("it's two words");
    } finally {
      if (candidate) await candidate.dispose();
      if (originalTmp === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = originalTmp;
    }
  });

  it('does not classify non-Node scripts as native executables', async () => {
    fixture.write('node_modules/script-cli/cli.sh', '#!/bin/sh\nexit 0\n', 0o755);
    fixture.symlink('../script-cli/cli.sh', 'node_modules/.bin/script-cli');
    const before = releaseTempRoots();
    await expect(newCandidate()).rejects.toThrow(/non-Node|unsupported|Node-shebang/i);
    expect(releaseTempRoots()).toEqual(before);
  });

  it('materializes other internal dependency symlinks as independent byte copies', async () => {
    const candidate = await newCandidate();
    try {
      const aliasPath = candidateFile(candidate, 'node_modules/linked/alias.js');
      const alias = lstatSync(aliasPath);
      expect(alias.isFile()).toBe(true);
      expect(alias.isSymbolicLink()).toBe(false);
      expect(readFileSync(aliasPath, 'utf8')).toBe('module.exports = "linked-target";\n');
      const sourceAlias = lstatSync(join(fixture.checkout, 'node_modules/linked/alias.js'));
      expect(sourceAlias.isSymbolicLink()).toBe(true);
      const sourceTarget = statSync(join(fixture.checkout, 'node_modules/linked-target/real.js'));
      expect(alias.ino).not.toBe(sourceTarget.ino);

      writeFileSync(aliasPath, 'module.exports = "candidate-mutated";\n');
      expect(readFileSync(join(fixture.checkout, 'node_modules/linked-target/real.js'), 'utf8')).toBe(
        'module.exports = "linked-target";\n',
      );
    } finally {
      await candidate.dispose();
    }
  });

  it('copies dependency bytes independently with no hardlinks or source symlinks', async () => {
    const candidate = await newCandidate();
    try {
      const sourcePath = join(fixture.checkout, 'node_modules/fake-dep/index.js');
      const candidatePath = candidateFile(candidate, 'node_modules/fake-dep/index.js');
      expect(statSync(sourcePath).ino).not.toBe(statSync(candidatePath).ino);
      writeFileSync(candidatePath, "candidate's independent bytes\n");
      expect(readFileSync(sourcePath, 'utf8')).toBe('module.exports = "fake-dep";\n');

      for (const relativePath of listFiles(candidate.root, 'node_modules')) {
        if (lstatSync(candidateFile(candidate, relativePath)).isSymbolicLink()) {
          throw new Error(`candidate contains a symlink: ${relativePath}`);
        }
      }
      expect(lstatSync(join(fixture.checkout, 'node_modules/.bin/fake-cli')).isSymbolicLink()).toBe(true);
    } finally {
      await candidate.dispose();
    }
  });

  it('preserves executable modes for copied dependency files', async () => {
    const candidate = await newCandidate();
    try {
      const mode = lstatSync(candidateFile(candidate, 'node_modules/fake-cli/cli.js')).mode & 0o777;
      expect(mode & 0o100).toBe(0o100);
      expect(readFileSync(candidateFile(candidate, 'node_modules/fake-cli/cli.js'), 'utf8')).toContain(
        '#!/usr/bin/env node',
      );
    } finally {
      await candidate.dispose();
    }
  });
});

describe('snapshotTree and changedPaths', () => {
  it('captures relative file names and bytes including spaces and newlines', async () => {
    const root = mkdtempSync(join(tmpdir(), 'kiki-snapshot-'));
    try {
      mkdirSync(join(root, 'dir'));
      writeFileSync(join(root, 'dir', 'with space.txt'), 'space\n');
      writeFileSync(join(root, 'with\nnewline.txt'), 'newline\n');
      const snapshot = await snapshotTree(root);
      expect([...snapshot.keys()].sort()).toEqual(['dir/with space.txt', 'with\nnewline.txt']);
      expect(snapshot.get('dir/with space.txt')?.toString('utf8')).toBe('space\n');
      expect(snapshot.get('with\nnewline.txt')?.toString('utf8')).toBe('newline\n');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports added, deleted and modified paths deterministically', async () => {
    const before = new Map<string, Buffer>([
      ['b.txt', Buffer.from('old')],
      ['a.txt', Buffer.from('same')],
      ['deleted.txt', Buffer.from('gone')],
    ]);
    const after = new Map<string, Buffer>([
      ['b.txt', Buffer.from('new')],
      ['a.txt', Buffer.from('same')],
      ['added.txt', Buffer.from('new file')],
    ]);
    expect(changedPaths(before, after)).toEqual(['added.txt', 'b.txt', 'deleted.txt']);
    expect(changedPaths(before, before)).toEqual([]);
  });

  it('snapshots the tracked candidate tree before transforms and excludes copied dependencies', async () => {
    const candidate = await newCandidate();
    try {
      expect(candidate.before.has('package.json')).toBe(true);
      expect(candidate.before.has('docs/with space.txt')).toBe(true);
      expect(candidate.before.has('docs/with\nnewline.txt')).toBe(true);
      expect(candidate.before.has('node_modules/fake-dep/index.js')).toBe(false);
      writeFileSync(candidateFile(candidate, 'package.json'), '{"name":"kiki","version":"9.9.9"}\n');
      const after = await snapshotTree(candidate.root);
      expect(changedPaths(candidate.before, after)).toContain('package.json');
    } finally {
      await candidate.dispose();
    }
  });
});

describe('production boundary', () => {
  it('does not import the test fixture helper from production candidate code', () => {
    const source = readFileSync(new URL('../../src/cli/release-candidate.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('tests/helpers');
    expect(source).not.toContain('release-fixture');
    expect(source).not.toMatch(/from ['"][^'"]*tests\//);
  });
});
