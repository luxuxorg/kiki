import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'jsonc-parser';
import {
  isKikiPluginEntry,
  prepareRegistration,
  removeKikiRegistration,
} from '../../src/cli/oc2-registration';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'kiki-registration-'));
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

const server = () => parse(readFileSync(join(root, 'opencode.jsonc'), 'utf8'));
const cli = () => parse(readFileSync(join(root, 'cli.json'), 'utf8'));
const backupDirectories = () => {
  const directory = join(root, 'kiki/backups');
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory());
};

describe('package registration planning', () => {
  it('recognizes the active package path even when its directory basename is not kiki', () => {
    expect(isKikiPluginEntry('/tmp/work/candidate', '/tmp/work/candidate')).toBe(true);
    expect(isKikiPluginEntry('/tmp/work/candidate', '/tmp/other/candidate')).toBe(false);
    expect(isKikiPluginEntry('/tmp/work/kiki')).toBe(true);
  });

  it('adds the server and cli.json package entry once while preserving unrelated plugins and comments', () => {
    writeFileSync(join(root, 'opencode.jsonc'), '{\n // keep server comment\n "plugins": [["other-plugin", {"custom": true}]]\n}\n');
    writeFileSync(join(root, 'cli.json'), '{\n // keep cli comment\n "theme": "custom", "plugins": ["tui-other"]\n}\n');

    const plan = prepareRegistration(root, '/checkout/kiki');
    expect(plan.files).toEqual(expect.arrayContaining([join(root, 'opencode.jsonc'), join(root, 'cli.json')]));
    plan.apply();

    expect(server().plugins).toEqual([['other-plugin', { custom: true }], '/checkout/kiki']);
    expect(cli().plugins).toEqual(['tui-other', '/checkout/kiki']);
    expect(cli().theme).toBe('custom');
    expect(readFileSync(join(root, 'opencode.jsonc'), 'utf8')).toContain('// keep server comment');
    expect(readFileSync(join(root, 'cli.json'), 'utf8')).toContain('// keep cli comment');

    const beforeServer = readFileSync(join(root, 'opencode.jsonc'), 'utf8');
    const beforeCli = readFileSync(join(root, 'cli.json'), 'utf8');
    const repeated = prepareRegistration(root, '/checkout/kiki');
    expect(repeated.files).toEqual([]);
    repeated.apply();
    expect(readFileSync(join(root, 'opencode.jsonc'), 'utf8')).toBe(beforeServer);
    expect(readFileSync(join(root, 'cli.json'), 'utf8')).toBe(beforeCli);
  });

  it('creates native config files with the pinned schema when no config exists', () => {
    prepareRegistration(root, 'kiki').apply();

    expect(server().$schema).toBe('https://opencode.ai/config.json');
    expect(server().plugins).toEqual(['kiki']);
    expect(cli().plugins).toEqual(['kiki']);
    expect(existsSync(join(root, 'tui.json'))).toBe(false);
    expect(existsSync(join(root, 'package.json'))).toBe(false);
    expect(existsSync(join(root, 'node_modules'))).toBe(false);
  });

  it('refuses conflicting or duplicate Kiki entries without rewriting user entries', () => {
    writeFileSync(join(root, 'opencode.jsonc'), '{"plugins":["kiki"],"theme":"keep"}');
    const before = readFileSync(join(root, 'opencode.jsonc'), 'utf8');
    expect(() => prepareRegistration(root, '/checkout/kiki')).toThrow(/conflict|duplicate/i);
    expect(readFileSync(join(root, 'opencode.jsonc'), 'utf8')).toBe(before);
    expect(existsSync(join(root, 'cli.json'))).toBe(false);

    writeFileSync(join(root, 'opencode.jsonc'), '{"plugins":["kiki","kiki"]}');
    expect(() => prepareRegistration(root, 'kiki')).toThrow(/duplicate/i);
  });

  it('rejects malformed config tiers before writing anything', () => {
    writeFileSync(join(root, 'opencode.jsonc'), '{broken');
    expect(() => prepareRegistration(root, 'kiki')).toThrow(/Invalid OpenCode configuration/);
    expect(existsSync(join(root, 'cli.json'))).toBe(false);

    writeFileSync(join(root, 'opencode.jsonc'), '{}');
    writeFileSync(join(root, 'cli.json'), '{"plugins":"wrong"}');
    expect(() => prepareRegistration(root, 'kiki')).toThrow(/plugin/i);
    expect(readFileSync(join(root, 'opencode.jsonc'), 'utf8')).toBe('{}');
  });

  it('fails closed before inspecting a machine-default credential-bearing config', () => {
    vi.stubEnv('HOME', root);
    const config = join(root, '.config', 'opencode');
    mkdirSync(config, { recursive: true });
    const file = join(config, 'opencode.json');
    writeFileSync(file, '{"provider":{"token":"sk-live-secret"}}');
    const before = readFileSync(file, 'utf8');

    expect(() => prepareRegistration(config, 'kiki')).toThrow(/credential-bearing|secret-free export/i);
    try {
      prepareRegistration(config, 'kiki');
    } catch (error) {
      expect((error as Error).message).not.toContain('sk-live-secret');
    }
    expect(readFileSync(file, 'utf8')).toBe(before);
  });
});

describe('registration removal', () => {
  it('removes only known Kiki entries from both package lists and backs the files up first', () => {
    writeFileSync(join(root, 'opencode.jsonc'), JSON.stringify({
      theme: 'keep',
      plugins: [
        'other',
        'kiki',
        ['kiki', { options: true }],
        { package: 'kiki', options: { native: true } },
        ['other-tuple', { keep: true }],
      ],
    }));
    writeFileSync(join(root, 'cli.json'), JSON.stringify({
      theme: 'keep',
      plugins: ['tui-other', 'kiki', ['kiki', { options: true }]],
    }));

    removeKikiRegistration(root);

    const serverConfig = server();
    expect(serverConfig.plugins).toEqual(['other', ['other-tuple', { keep: true }]]);
    expect(serverConfig.theme).toBe('keep');
    const cliConfig = cli();
    expect(cliConfig.plugins).toEqual(['tui-other']);
    expect(cliConfig.theme).toBe('keep');

    const backups = backupDirectories();
    expect(backups).toHaveLength(1);
    const manifestFile = join(root, 'kiki/backups', backups[0].name, 'manifest.json');
    expect(statSync(manifestFile).mode & 0o777).toBe(0o600);
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as string[];
    expect(manifest).toEqual(expect.arrayContaining([
      join(root, 'opencode.jsonc'),
      join(root, 'cli.json'),
    ]));

    removeKikiRegistration(root);
    expect(backupDirectories()).toHaveLength(1);
  });

  it('leaves non-Kiki files and configs untouched when there is nothing to remove', () => {
    writeFileSync(join(root, 'opencode.jsonc'), '{"plugins":["other"]}');
    const before = readFileSync(join(root, 'opencode.jsonc'), 'utf8');
    removeKikiRegistration(root);
    expect(readFileSync(join(root, 'opencode.jsonc'), 'utf8')).toBe(before);
    expect(existsSync(join(root, 'cli.json'))).toBe(false);
    expect(existsSync(join(root, 'kiki/backups'))).toBe(false);
  });
});
