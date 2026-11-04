import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareRelease, type ReleaseDeps } from '../../src/cli/commands/release';
import type { CommandRunner } from '../../src/cli/release-candidate';
import type { ReleaseOptions } from '../../src/cli/release-policy';
import {
  createReleaseFixture,
  releaseTempRoots,
  type ReleaseFixture,
} from '../helpers/release-fixture';

const control = vi.hoisted(() => ({
  forbidReads: new Set<string>(),
  readCalls: [] as string[],
}));

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const readFile = (async (...args: unknown[]) => {
    const path = String(args[0]);
    control.readCalls.push(path);
    if (control.forbidReads.has(path)) throw new Error(`FORBIDDEN_READ:${path}`);
    return (actual.readFile as (...inner: unknown[]) => Promise<unknown>)(...args);
  }) as typeof actual.readFile;
  return { ...actual, readFile };
});

let fixture: ReleaseFixture;
let originalTmp: string | undefined;
let testTmp: string;

beforeEach(() => {
  originalTmp = process.env.TMPDIR;
  testTmp = mkdtempSync(join(tmpdir(), 'kiki-release-spy-test-'));
  process.env.TMPDIR = testTmp;
  fixture = createReleaseFixture();
  control.forbidReads.clear();
  control.readCalls.length = 0;
});

afterEach(() => {
  fixture.cleanup();
  rmSync(testTmp, { recursive: true, force: true });
  if (originalTmp === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = originalTmp;
});

function options(): ReleaseOptions {
  return { apply: false, bump: 'auto', help: false };
}

function deps(): ReleaseDeps {
  const runner: CommandRunner = async () => {
    throw new Error('UNEXPECTED_SUBPROCESS');
  };
  return {
    runner,
    now: () => new Date(2026, 10, 4, 12, 0, 0),
    log: () => undefined,
  };
}

async function failure(): Promise<Error> {
  try {
    await prepareRelease(fixture.checkout, options(), deps());
  } catch (error) {
    return error as Error;
  }
  throw new Error('EXPECTED_RELEASE_TO_FAIL');
}

function expectForbiddenPathsUnread(paths: string[]): void {
  for (const path of paths) {
    expect(control.readCalls).not.toContain(path);
  }
  expect(control.readCalls.join('\n')).not.toContain('FORBIDDEN_READ');
}

describe('release root guard path metadata precedes reads', () => {
  it('refuses an external package.json symlink without reading the alias or target', async () => {
    const outside = join(fixture.root, 'outside-package.json');
    writeFileSync(outside, `${JSON.stringify({ name: 'kiki', version: '2.2.0' })}\n`);
    fixture.remove('package.json');
    fixture.symlink('../outside-package.json', 'package.json');
    const alias = join(fixture.checkout, 'package.json');
    control.forbidReads.add(alias);
    control.forbidReads.add(outside);

    const error = await failure();

    expect(error.message).toMatch(/symlink|unsafe|refus/i);
    expectForbiddenPathsUnread([alias, outside]);
    expect([...releaseTempRoots()]).toEqual([]);
  });

  it('refuses a secret-target CHANGELOG alias before reading package.json', async () => {
    fixture.mkdir('secrets');
    fixture.write('secrets/changelog.md', 'FIXTURE_ONLY_SECRET_CHANGELOG\n', 0o600);
    fixture.remove('CHANGELOG.md');
    fixture.symlink('secrets/changelog.md', 'CHANGELOG.md');
    const packagePath = join(fixture.checkout, 'package.json');
    const alias = join(fixture.checkout, 'CHANGELOG.md');
    const secret = join(fixture.checkout, 'secrets', 'changelog.md');
    control.forbidReads.add(packagePath);
    control.forbidReads.add(alias);
    control.forbidReads.add(secret);

    const error = await failure();

    expect(error.message).toMatch(/symlink|secret|unsafe|refus/i);
    expectForbiddenPathsUnread([packagePath, alias, secret]);
    expect(control.readCalls).toEqual([]);
    expect([...releaseTempRoots()]).toEqual([]);
  });

  it('refuses a symlinked config ancestor before reading package.json', async () => {
    fixture.remove('src');
    fixture.mkdir('secrets/cli');
    fixture.write('secrets/cli/config.ts', "export const KIKI_VERSION = '2.2.0';\n", 0o600);
    fixture.symlink('secrets', 'src');
    const packagePath = join(fixture.checkout, 'package.json');
    const alias = join(fixture.checkout, 'src', 'cli', 'config.ts');
    const secret = join(fixture.checkout, 'secrets', 'cli', 'config.ts');
    control.forbidReads.add(packagePath);
    control.forbidReads.add(alias);
    control.forbidReads.add(secret);

    const error = await failure();

    expect(error.message).toMatch(/symlink|secret|unsafe|refus/i);
    expectForbiddenPathsUnread([packagePath, alias, secret]);
    expect(control.readCalls).toEqual([]);
    expect([...releaseTempRoots()]).toEqual([]);
  });
});
