import { beforeEach, afterEach, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'jsonc-parser';
import { installGlobalFiles } from '../../src/cli/opencode-config';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'kiki-tui-install-')); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

it('installs one stable TUI loader and registers it once across updates', () => {
  installGlobalFiles(root);
  const file = join(root, 'tui.json');
  expect(parse(readFileSync(file, 'utf8')).plugin).toEqual(['./kiki/tui.js']);
  const loader = readFileSync(join(root, 'kiki/tui.js'), 'utf8');
  expect(loader).toMatch(/^export \{ default \} from "file:\/\//);
  expect(loader).toContain('/tui/index.js');
  expect(existsSync(join(root, 'plugins/tui.js'))).toBe(false);
  const before = readFileSync(file, 'utf8');
  installGlobalFiles(root, true);
  expect(readFileSync(file, 'utf8')).toBe(before);
});

it('preserves TUI JSONC comments, theme, keybindings, foreign plugin tuples and explicit disable state', () => {
  const file = join(root, 'tui.jsonc');
  writeFileSync(file, '{\n// theme choice\n"theme":"custom", "keybinds":{"leader":"ctrl+x"},"plugin_enabled":{"kiki":false},\n"plugin":[\n// keep plugin options\n["other-plugin",{"custom":true}]\n]}');
  installGlobalFiles(root);
  const text = readFileSync(file, 'utf8');
  const config = parse(text);
  expect(config.plugin).toEqual([['other-plugin', { custom: true }], './kiki/tui.js']);
  expect(config.plugin_enabled).toEqual({ kiki: false });
  expect(config.theme).toBe('custom');
  expect(config.keybinds.leader).toBe('ctrl+x');
  expect(text).toContain('// theme choice');
  expect(text).toContain('// keep plugin options');
  expect(existsSync(join(root, 'tui.json'))).toBe(false);
});

it('recognizes an already configured equivalent file URL in a lower global config tier', () => {
  const spec = pathToFileURL(join(root, 'kiki/tui.js')).href;
  writeFileSync(join(root, 'tui.json'), JSON.stringify({ plugin: [[spec, { keep: true }]] }));
  writeFileSync(join(root, 'tui.jsonc'), '// keep\n{"theme":"custom"}');
  installGlobalFiles(root);
  expect(parse(readFileSync(join(root, 'tui.json'), 'utf8')).plugin).toEqual([[spec, { keep: true }]]);
  expect(readFileSync(join(root, 'tui.jsonc'), 'utf8')).toBe('// keep\n{"theme":"custom"}');
});

it.each(['{broken', '{"plugin":"wrong"}', '{"plugin":null}', '{"plugin":[42]}'])('invalid TUI configuration fails before writing any installation files: %s', text => {
  writeFileSync(join(root, 'tui.jsonc'), text);
  expect(() => installGlobalFiles(root)).toThrow();
  expect(existsSync(join(root, 'plugins/kiki.ts'))).toBe(false);
  expect(existsSync(join(root, 'opencode.jsonc'))).toBe(false);
  expect(existsSync(join(root, 'kiki'))).toBe(false);
});
