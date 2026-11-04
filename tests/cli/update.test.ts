import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { update } from '../../src/cli/commands/update';
import { readOpenCodeSettings } from '../../src/cli/opencode-config';

describe('global update command', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kiki-update-'));
    vi.stubEnv('XDG_CONFIG_HOME', root);
  });
  afterEach(() => { vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }); });
  it('updates globally without requiring or touching project files', async () => {
    const project = join(root, 'project'); mkdirSync(project);
    writeFileSync(join(project, 'opencode.json'), '{"agent":{"mine":{"model":"keep"}}}');
    await update([]);
    expect(readOpenCodeSettings(join(root, 'opencode'), true).agent['kiki-planner']).toBeDefined();
    expect(readFileSync(join(project, 'opencode.json'), 'utf8')).toBe('{"agent":{"mine":{"model":"keep"}}}');
    expect(existsSync(join(project, '.opencode'))).toBe(false);
  });
  it('rejects the old destructive positional project update before writing', async () => {
    await expect(update([root])).rejects.toThrow(/migrate/);
    expect(existsSync(join(root, 'opencode'))).toBe(false);
  });
  it('help and unknown flags never write files', async () => {
    await update(['--help']);
    expect(existsSync(join(root, 'opencode'))).toBe(false);
    await expect(update(['--unknown'])).rejects.toThrow();
    expect(existsSync(join(root, 'opencode'))).toBe(false);
  });
  it('prints the /kiki model hint and preserves existing global model and permission maps', async () => {
    const hint = 'Agent models: set them with the /kiki command in OpenCode (or edit agent.<name>.model in opencode.json).';
    await update([]);
    const file = join(root, 'opencode/opencode.jsonc');
    const data = JSON.parse(readFileSync(file, 'utf8'));
    data.agent['kiki-reviewer'].model = 'custom/reviewer';
    data.agent['kiki-reviewer'].permission = { edit: 'deny' };
    writeFileSync(file, JSON.stringify(data));

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await update([]);
      expect(logSpy.mock.calls.flat().join('\n')).toContain(hint);
    } finally {
      logSpy.mockRestore();
    }
    const after = readOpenCodeSettings(join(root, 'opencode'), true);
    expect(after.agent['kiki-reviewer'].model).toBe('custom/reviewer');
    expect(after.agent['kiki-reviewer'].permission).toEqual({ edit: 'deny' });
  });
});
