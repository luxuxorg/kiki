import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'jsonc-parser';
import { install } from '../../src/cli/commands/install';
import { update } from '../../src/cli/commands/update';
import { parseAgent, readOpenCodeSettings } from '../../src/cli/opencode-config';
import { currentPackageSpec } from '../../src/cli/oc2-registration';

const AGENTS = [
  'kiki-orchestrator', 'kiki-brainstormer', 'kiki-planner', 'kiki-implementer',
  'kiki-gui-designer', 'kiki-reviewer', 'kiki-escalation', 'kiki-historian',
];

function filesUnder(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .flatMap(entry => {
      const full = join(directory, entry.name);
      return entry.isDirectory() ? filesUnder(full) : [full];
    });
}

describe('global installation CLI', () => {
  let root: string;
  let global: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kiki-install-'));
    vi.stubEnv('XDG_CONFIG_HOME', root);
    global = join(root, 'opencode');
  });
  afterEach(() => { vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }); });

  it('writes eight native agent files and registers one server and one TUI package source', async () => {
    await install([]);

    for (const name of AGENTS) {
      const file = join(global, 'agents', `${name}.md`);
      expect(existsSync(file), name).toBe(true);
      const { settings } = parseAgent(readFileSync(file, 'utf8'), file);
      expect(settings, name).not.toHaveProperty('model');
      if (name === 'kiki-orchestrator') expect(settings.permissions).toBeUndefined();
      else expect(Array.isArray(settings.permissions), name).toBe(true);
      expect(settings.mode, name).toBe(name === 'kiki-orchestrator' ? 'primary' : 'subagent');
    }
    expect(readOpenCodeSettings(global, true).agents).toBeUndefined();
    expect(parse(readFileSync(join(global, 'opencode.jsonc'), 'utf8')).plugins).toEqual([currentPackageSpec()]);
    expect(parse(readFileSync(join(global, 'cli.json'), 'utf8')).plugins).toEqual([currentPackageSpec()]);
    expect(existsSync(join(global, 'kiki/prompts'))).toBe(false);
    expect(existsSync(join(global, 'kiki/tui.js'))).toBe(false);
    expect(existsSync(join(global, 'plugins/kiki.ts'))).toBe(false);
    expect(existsSync(join(global, 'tui.json'))).toBe(false);
    expect(existsSync(join(global, 'package.json'))).toBe(false);
    expect(existsSync(join(global, 'node_modules'))).toBe(false);
    expect(existsSync(join(global, 'kiki/agentic-workflow.md'))).toBe(true);
  });

  it('accepts repeated install/update without changing files or duplicating registration', async () => {
    await install([]);
    const before = Object.fromEntries(filesUnder(global).map(file => [file, readFileSync(file, 'utf8')]));
    await install([]);
    await update([]);
    const after = Object.fromEntries(filesUnder(global).map(file => [file, readFileSync(file, 'utf8')]));
    expect(after).toEqual(before);
    expect(parse(readFileSync(join(global, 'opencode.jsonc'), 'utf8')).plugins)
      .toEqual([currentPackageSpec()]);
    expect(parse(readFileSync(join(global, 'cli.json'), 'utf8')).plugins)
      .toEqual([currentPackageSpec()]);
  });

  it('preserves native permission additions, models, unrelated plugins, comments and top-level settings', async () => {
    mkdirSync(global, { recursive: true });
    writeFileSync(join(global, 'opencode.jsonc'), `{
  // keep this comment
  "model": "other/model",
  "plugins": ["other-plugin"],
  "agents": {
    "kiki-implementer": {
      "model": { "providerID": "custom", "model": "model" },
      "permissions": [
        { "action": "edit", "resource": "src/**", "effect": "allow" },
        { "action": "read", "resource": "secret/**", "effect": "deny" }
      ]
    }
  }
}`);
    const before = readOpenCodeSettings(global, true);

    await install([]);

    const after = readOpenCodeSettings(global, true);
    expect(after.agents['kiki-implementer']).toEqual(before.agents['kiki-implementer']);
    expect(after.model).toBe('other/model');
    expect(after.plugins).toEqual(['other-plugin', currentPackageSpec()]);
    expect(after.permissions).toBeUndefined();
    expect(readFileSync(join(global, 'opencode.jsonc'), 'utf8')).toContain('// keep this comment');
  });

  it('preserves deliberate permission absence on an existing native agent file', async () => {
    mkdirSync(join(global, 'agents'), { recursive: true });
    writeFileSync(join(global, 'agents/kiki-implementer.md'), `---
description: custom
mode: subagent
---
Custom prompt
`);

    await install([]);

    const { settings } = parseAgent(
      readFileSync(join(global, 'agents/kiki-implementer.md'), 'utf8'),
      'kiki-implementer',
    );
    expect(settings).not.toHaveProperty('permissions');
    expect(settings).not.toHaveProperty('model');
  });

  it('backs up and removes stale V1 loader, prompts and generated plugin files on update', async () => {
    await install([]);
    mkdirSync(join(global, 'kiki/prompts'), { recursive: true });
    mkdirSync(join(global, 'plugins'), { recursive: true });
    writeFileSync(join(global, 'kiki/prompts/kiki-implementer.md'), 'stale prompt');
    writeFileSync(join(global, 'kiki/tui.js'), 'stale loader');
    writeFileSync(join(global, 'plugins/kiki.ts'), 'stale plugin');

    await update([]);

    expect(existsSync(join(global, 'kiki/prompts'))).toBe(false);
    expect(existsSync(join(global, 'kiki/tui.js'))).toBe(false);
    expect(existsSync(join(global, 'plugins/kiki.ts'))).toBe(false);
    const backups = filesUnder(join(global, 'kiki/backups'));
    expect(backups.some(file => file.endsWith('kiki.ts'))).toBe(true);
    expect(backups.some(file => file.endsWith('kiki-implementer.md'))).toBe(true);
  });

  it('validates every tier before writing when a config is malformed', async () => {
    mkdirSync(global, { recursive: true });
    writeFileSync(join(global, 'opencode.jsonc'), '{broken');
    await expect(install([])).rejects.toThrow(/Invalid OpenCode/);
    expect(existsSync(join(global, 'agents'))).toBe(false);
    expect(existsSync(join(global, 'cli.json'))).toBe(false);
  });

  it('refuses a machine-default OC1 marker before writing', async () => {
    vi.stubEnv('HOME', root);
    vi.stubEnv('XDG_CONFIG_HOME', '');
    const config = join(root, '.config', 'opencode');
    mkdirSync(join(config, 'plugins'), { recursive: true });
    writeFileSync(join(config, 'plugins/kiki.ts'), 'legacy');

    await expect(install([])).rejects.toThrow(/V1|OC1|version 1|legacy/i);
    expect(existsSync(join(config, 'agents'))).toBe(false);
    expect(existsSync(join(config, 'cli.json'))).toBe(false);
  });

  it('help, unknown options and conflicting scopes never perform an install', async () => {
    await install(['--help']);
    expect(existsSync(global)).toBe(false);
    await expect(install(['--unknown'])).rejects.toThrow();
    await expect(install(['--project', '.', '--global'])).rejects.toThrow();
    await expect(install(['--project'])).rejects.toThrow();
    expect(existsSync(global)).toBe(false);
  });

  it('prints the native /kiki model hint', async () => {
    const hint = 'Agent models: set them with the /kiki command in OpenCode (or edit agents.<name>.model in opencode.json).';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await install([]);
      expect(logSpy.mock.calls.flat().join('\n')).toContain(hint);
    } finally {
      logSpy.mockRestore();
    }
  });
});
