import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createCandidate,
  type Candidate,
} from '../../src/cli/release-candidate';
import {
  createReleaseFixture,
  fixtureRunner,
  type ReleaseFixture,
} from '../helpers/release-fixture';
import { readGit } from '../../src/cli/release-candidate';

const control = vi.hoisted(() => ({
  forbidReads: new Set<string>(),
  readCalls: [] as string[],
  rmCalls: [] as string[],
  failRmPaths: new Set<string>(),
  failAllRm: false,
}));

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const pathOf = (value: unknown): string => String(value);
  const checkedRead = (path: string): void => {
    control.readCalls.push(path);
    if (control.forbidReads.has(path)) throw new Error(`FORBIDDEN_READ:${path}`);
  };
  const readFile = (async (...args: unknown[]) => {
    checkedRead(pathOf(args[0]));
    return (actual.readFile as (...inner: unknown[]) => Promise<unknown>)(...args);
  }) as typeof actual.readFile;
  const copyFile = (async (...args: unknown[]) => {
    checkedRead(pathOf(args[0]));
    return (actual.copyFile as (...inner: unknown[]) => Promise<void>)(...args);
  }) as typeof actual.copyFile;
  const open = (async (...args: unknown[]) => {
    checkedRead(pathOf(args[0]));
    return (actual.open as (...inner: unknown[]) => Promise<unknown>)(...args);
  }) as typeof actual.open;
  const rm = (async (...args: unknown[]) => {
    const path = pathOf(args[0]);
    control.rmCalls.push(path);
    if (control.failAllRm || control.failRmPaths.has(path)) throw new Error('injected rm failure');
    return (actual.rm as (...inner: unknown[]) => Promise<void>)(...args);
  }) as typeof actual.rm;
  return { ...actual, readFile, copyFile, open, rm };
});

let fixture: ReleaseFixture;
let originalTmp: string | undefined;
let testTmp: string;

beforeEach(() => {
  originalTmp = process.env.TMPDIR;
  testTmp = mkdtempSync(join(tmpdir(), 'kiki-candidate-spy-test-'));
  process.env.TMPDIR = testTmp;
  fixture = createReleaseFixture();
  control.forbidReads.clear();
  control.readCalls.length = 0;
  control.rmCalls.length = 0;
  control.failRmPaths.clear();
  control.failAllRm = false;
});

afterEach(() => {
  control.failAllRm = false;
  control.failRmPaths.clear();
  fixture.cleanup();
  if (originalTmp === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = originalTmp;
  rmSync(testTmp, { recursive: true, force: true });
});

async function trackedPaths(): Promise<string[]> {
  const raw = await readGit(fixtureRunner, fixture.checkout, 'ls-files', ['-z']);
  return raw.split('\0').filter(Boolean);
}

function newCandidateRootsSince(before: Set<string>): string[] {
  return readdirSync(tmpdir()).filter(
    name => name.startsWith('kiki-candidate-') && !before.has(name),
  );
}

describe('secret paths are refused before any content read', () => {
  it('does not read a tracked symlink target that resolves to .env', async () => {
    const secretPath = join(fixture.checkout, '.env');
    control.forbidReads.add(secretPath);
    fixture.symlink('.env', 'alias-secret.txt');
    const tracked = await trackedPaths();
    let message = '';
    try {
      await createCandidate(fixture.checkout, [...tracked, 'alias-secret.txt']);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/secret|symlink/i);
    expect(message).not.toContain('FORBIDDEN_READ');
    expect(control.readCalls).not.toContain(secretPath);
  });

  it('does not read a tracked path whose symlinked ancestor resolves through a secret name', async () => {
    fixture.mkdir('secrets');
    fixture.write('secrets/token.txt', 'FIXTURE_ONLY_ANCESTOR_SECRET\n');
    fixture.symlink('secrets', 'alias-secret-dir');
    const lexical = join(fixture.checkout, 'alias-secret-dir/token.txt');
    const resolved = join(fixture.checkout, 'secrets/token.txt');
    control.forbidReads.add(lexical);
    control.forbidReads.add(resolved);
    const tracked = await trackedPaths();
    let message = '';
    try {
      await createCandidate(fixture.checkout, [...tracked, 'alias-secret-dir/token.txt']);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/secret|symlink/i);
    expect(message).not.toContain('FORBIDDEN_READ');
    expect(control.readCalls).not.toContain(lexical);
    expect(control.readCalls).not.toContain(resolved);
  });

  it('refuses a root .npmrc without reading it', async () => {
    const npmrc = join(fixture.checkout, '.npmrc');
    fixture.write('.npmrc', 'FIXTURE_ONLY_SPY_NPMRC\n', 0o600);
    control.forbidReads.add(npmrc);
    const tracked = await trackedPaths();
    let message = '';
    try {
      await createCandidate(fixture.checkout, tracked);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/\.npmrc/i);
    expect(control.readCalls).not.toContain(npmrc);
  });
});

describe('cleanup failures are surfaced and retained-root paths are reported', () => {
  it('surfaces dispose failure with the retained run root', async () => {
    const candidate: Candidate = await createCandidate(fixture.checkout, await trackedPaths());
    control.failRmPaths.add(candidate.runRoot);
    let message = '';
    try {
      await candidate.dispose();
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/cleanup|remove/i);
    expect(message).toContain(candidate.runRoot);
    expect(message).toMatch(/retained/i);
    control.failRmPaths.delete(candidate.runRoot);
    rmSync(candidate.runRoot, { recursive: true, force: true });
  });

  it('preserves both the construction failure and the cleanup failure', async () => {
    fixture.write('node_modules/foreign/cli.py', '#!/usr/bin/env python3\n', 0o755);
    fixture.symlink('../foreign/cli.py', 'node_modules/.bin/foreign');
    const before = new Set(
      readdirSync(tmpdir()).filter(name => name.startsWith('kiki-candidate-')),
    );
    control.failAllRm = true;
    let caught: unknown;
    try {
      await createCandidate(fixture.checkout, await trackedPaths());
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AggregateError);
    const message = (caught as Error).message;
    expect(message).toMatch(/construction failed/i);
    expect(message).toMatch(/cleanup also failed/i);
    expect(message).toMatch(/non-Node|unsupported/i);
    expect(message).toContain('retained run root');
    const leaked = newCandidateRootsSince(before);
    expect(leaked.length).toBeGreaterThan(0);
    control.failAllRm = false;
    for (const name of leaked) rmSync(join(tmpdir(), name), { recursive: true, force: true });
  });
});
