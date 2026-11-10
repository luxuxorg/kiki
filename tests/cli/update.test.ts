import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'jsonc-parser';
import { update } from '../../src/cli/commands/update';
import { currentPackageSpec } from '../../src/cli/oc2-registration';

describe('global update command', () => {
  let root: string;
  let global: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kiki-update-'));
    vi.stubEnv('XDG_CONFIG_HOME', root);
    global = join(root, 'opencode');
  });
  afterEach(() => { vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }); });

  it('updates globally without requiring or touching project files', async () => {
    const project = join(root, 'project'); mkdirSync(project);
    writeFileSync(join(project, 'opencode.json'), '{"agent":{"mine":{"model":"keep"}}}');
    await update([]);
    expect(existsSync(join(global, 'agents/kiki-planner.md'))).toBe(true);
    expect(parse(readFileSync(join(global, 'opencode.jsonc'), 'utf8')).plugins).toEqual([currentPackageSpec()]);
    expect(readFileSync(join(project, 'opencode.json'), 'utf8')).toBe('{"agent":{"mine":{"model":"keep"}}}');
    expect(existsSync(join(project, '.opencode'))).toBe(false);
  });

  it('rejects the old destructive positional project update before writing', async () => {
    await expect(update([root])).rejects.toThrow(/migrate/);
    expect(existsSync(global)).toBe(false);
  });

  it('help and unknown flags never write files', async () => {
    await update(['--help']);
    expect(existsSync(global)).toBe(false);
    await expect(update(['--unknown'])).rejects.toThrow();
    expect(existsSync(global)).toBe(false);
  });

  it('prints the native /kiki model hint and preserves existing global additions', async () => {
    const hint = 'Agent models: set them with the /kiki command in OpenCode (or edit agents.<name>.model in opencode.json).';
    await update([]);
    const file = join(global, 'opencode.jsonc');
    const data = parse(readFileSync(file, 'utf8'));
    data.agents = {
      'kiki-reviewer': {
        model: { providerID: 'custom', model: 'reviewer' },
        permissions: [{ action: 'edit', resource: '*', effect: 'deny' }],
      },
    };
    writeFileSync(file, JSON.stringify(data));

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await update([]);
      expect(logSpy.mock.calls.flat().join('\n')).toContain(hint);
    } finally {
      logSpy.mockRestore();
    }
    const after = parse(readFileSync(file, 'utf8'));
    expect(after.agents['kiki-reviewer']).toEqual({
      model: { providerID: 'custom', model: 'reviewer' },
      permissions: [{ action: 'edit', resource: '*', effect: 'deny' }],
    });
  });
});
