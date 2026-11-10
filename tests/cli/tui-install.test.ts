import { beforeEach, afterEach, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'jsonc-parser';
import { installGlobalFiles } from '../../src/cli/opencode-config';
import { currentPackageSpec } from '../../src/cli/oc2-registration';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'kiki-tui-install-')); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

it('registers the TUI package in cli.json once across updates', () => {
  installGlobalFiles(root);
  const file = join(root, 'cli.json');
  expect(parse(readFileSync(file, 'utf8')).plugins).toEqual([currentPackageSpec()]);
  expect(existsSync(join(root, 'tui.json'))).toBe(false);
  expect(existsSync(join(root, 'kiki/tui.js'))).toBe(false);
  expect(existsSync(join(root, 'plugins/tui.js'))).toBe(false);
  expect(existsSync(join(root, 'plugins/kiki.ts'))).toBe(false);
  const before = readFileSync(file, 'utf8');
  installGlobalFiles(root, true);
  expect(readFileSync(file, 'utf8')).toBe(before);
});

it('preserves cli.json comments, theme, keybindings, foreign plugin tuples and explicit disable state', () => {
  const file = join(root, 'cli.json');
  writeFileSync(file, '{\n// theme choice\n"theme":"custom", "keybinds":{"leader":"ctrl+x"},"plugin_enabled":{"kiki":false},\n"plugins":[\n// keep plugin options\n["other-plugin",{"custom":true}]\n]}');
  installGlobalFiles(root);
  const text = readFileSync(file, 'utf8');
  const config = parse(text);
  expect(config.plugins).toEqual([['other-plugin', { custom: true }], currentPackageSpec()]);
  expect(config.plugin_enabled).toEqual({ kiki: false });
  expect(config.theme).toBe('custom');
  expect(config.keybinds.leader).toBe('ctrl+x');
  expect(text).toContain('// theme choice');
  expect(text).toContain('// keep plugin options');
});

it('recognizes an already configured equivalent package entry', () => {
  const file = join(root, 'cli.json');
  writeFileSync(file, JSON.stringify({ plugins: [currentPackageSpec()], theme: 'custom' }));
  const before = readFileSync(file, 'utf8');
  installGlobalFiles(root);
  expect(readFileSync(file, 'utf8')).toBe(before);
});

it.each(['{broken', '{"plugins":"wrong"}', '{"plugins":[42]}'])(
  'invalid cli configuration fails before writing any installation files: %s',
  text => {
    writeFileSync(join(root, 'cli.json'), text);
    expect(() => installGlobalFiles(root)).toThrow();
    expect(existsSync(join(root, 'agents'))).toBe(false);
    expect(existsSync(join(root, 'opencode.jsonc'))).toBe(false);
    expect(existsSync(join(root, 'kiki'))).toBe(false);
  },
);
