import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
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
});
