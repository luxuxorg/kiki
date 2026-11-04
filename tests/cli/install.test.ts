import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { install } from '../../src/cli/commands/install';
import { readOpenCodeSettings } from '../../src/cli/opencode-config';

describe('global installation CLI', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'kiki-install-')); vi.stubEnv('XDG_CONFIG_HOME', root); });
  afterEach(() => { vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }); });
  it('writes global JSON agents and a single global plugin', async () => {
    await install([]);
    const global = join(root, 'opencode');
    expect(Object.keys(readOpenCodeSettings(global, true).agent)).toHaveLength(8);
    expect(existsSync(join(global, 'agents/kiki-implementer.md'))).toBe(false);
    expect(readFileSync(join(global, 'plugins/kiki.ts'), 'utf8')).toContain("KIKI_PLUGIN_SCOPE = 'global'");
  });
  it('accepts repeated install without resetting access or model choices', async () => {
    await install([]);
    const before = readFileSync(join(root, 'opencode/opencode.jsonc'), 'utf8');
    await install(['--force']);
    expect(readFileSync(join(root, 'opencode/opencode.jsonc'), 'utf8')).toBe(before);
  });
  it('help, unknown options and conflicting scopes never perform an install', async () => {
    await install(['--help']);
    expect(existsSync(join(root, 'opencode'))).toBe(false);
    await expect(install(['--unknown'])).rejects.toThrow();
    await expect(install(['--project', '.', '--global'])).rejects.toThrow();
    await expect(install(['--project'])).rejects.toThrow();
    expect(existsSync(join(root, 'opencode'))).toBe(false);
  });
  it('prints the /kiki model hint and preserves existing agent model and permission maps', async () => {
    const hint = 'Agent models: set them with the /kiki command in OpenCode (or edit agent.<name>.model in opencode.json).';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await install([]);
      expect(logSpy.mock.calls.flat().join('\n')).toContain(hint);

      const file = join(root, 'opencode/opencode.jsonc');
      const data = JSON.parse(readFileSync(file, 'utf8'));
      data.agent['kiki-implementer'].model = 'custom/model';
      data.agent['kiki-implementer'].permission = { edit: 'deny' };
      writeFileSync(file, JSON.stringify(data));

      logSpy.mockClear();
      await install([]);
      expect(logSpy.mock.calls.flat().join('\n')).toContain(hint);
      const after = readOpenCodeSettings(join(root, 'opencode'), true);
      expect(after.agent['kiki-implementer'].model).toBe('custom/model');
      expect(after.agent['kiki-implementer'].permission).toEqual({ edit: 'deny' });
    } finally {
      logSpy.mockRestore();
    }
  });
});
