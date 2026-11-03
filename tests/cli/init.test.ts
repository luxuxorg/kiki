import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { init } from '../../src/cli/commands/init';
import { installProjectConfig } from '../../src/cli/commands/install';
import { DEFAULT_CONFIG, DEFAULT_MODELS } from '../../src/cli/config';
import { baselineAgents, readOpenCodeSettings } from '../../src/cli/opencode-config';

describe('project initialization', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'kiki-init-')); vi.stubEnv('XDG_CONFIG_HOME', join(root, 'global')); });
  afterEach(() => { vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }); });
  it('creates metadata and native permissions without duplicating the global installation', async () => {
    await init(root, { wizard: false });
    expect(existsSync(join(root, '.opencode'))).toBe(false);
    expect(existsSync(join(root, '.agentic/kiki/routing.json'))).toBe(false);
    const config = JSON.parse(readFileSync(join(root, '.agentic/kiki/config.json'), 'utf8'));
    expect(config.commands.security).toBe('npm audit');
    expect(readOpenCodeSettings(root).agent['kiki-implementer'].permission.edit['src/**']).toBe('allow');
  });
  it('init with default models persists no default model values and writes no local model keys', async () => {
    await init(root, { wizard: false });
    const config = JSON.parse(readFileSync(join(root, '.agentic/kiki/config.json'), 'utf8'));
    for (const value of Object.values(config.models ?? {})) {
      expect(Object.values(DEFAULT_MODELS)).not.toContain(value);
    }
    const agents = readOpenCodeSettings(root).agent ?? {};
    expect(Object.values(agents).some(settings => 'model' in settings)).toBe(false);
  });
  it('persists only non-default model preferences in config.json', () => {
    installProjectConfig(root, {
      ...DEFAULT_CONFIG,
      models: { standard: 'custom/standard', critical: DEFAULT_MODELS.critical, workhorse: DEFAULT_MODELS.workhorse },
    });
    const config = JSON.parse(readFileSync(join(root, '.agentic/kiki/config.json'), 'utf8'));
    expect(config.models).toEqual({ standard: 'custom/standard' });
  });
  it('reinitialization preserves tasks, alignment and project metadata', async () => {
    await init(root, { wizard: false });
    writeFileSync(join(root, '.agentic/kiki/TASK_REGISTRY.json'), '{"tasks":[{"id":"keep"}]}');
    writeFileSync(join(root, '.agentic/kiki/alignment.json'), '{"guardrails":["custom"]}');
    await init(root, { wizard: false });
    expect(readFileSync(join(root, '.agentic/kiki/TASK_REGISTRY.json'), 'utf8')).toContain('keep');
    expect(readFileSync(join(root, '.agentic/kiki/alignment.json'), 'utf8')).toContain('custom');
  });
});

describe('global agent baselines', () => {
  const agents = baselineAgents();
  it('retains role permissions, broad reads and protected secret paths', () => {
    for (const [name, agent] of Object.entries(agents)) {
      if (name === 'kiki-orchestrator') continue;
      expect(agent.settings.permission.read['*']).toBe('allow');
      expect(agent.settings.permission.read['**/.env*']).toBe('deny');
      expect(agent.settings.permission.read['**/*credential*']).toBe('deny');
      expect(agent.settings.permission).not.toHaveProperty('write');
    }
    expect(agents['kiki-implementer'].settings.permission.edit['src/**']).toBe('allow');
    expect(agents['kiki-historian'].settings.permission.edit['src/**']).toBe('deny');
    expect(agents['kiki-reviewer'].settings.permission.edit['*']).toBe('deny');
  });
  it('retains the documentation completion gate and inline skills', () => {
    expect(agents['kiki-orchestrator'].prompt).toContain('Documentation decision required');
    expect(agents['kiki-orchestrator'].prompt).toContain('documentation.status');
    for (const name of ['kiki-brainstormer', 'kiki-planner']) expect(agents[name].prompt).toContain('follow it **inline**');
  });
});
