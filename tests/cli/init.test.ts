import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import { init, runWizard } from '../../src/cli/commands/init';
import { installProjectConfig } from '../../src/cli/commands/install';
import { DEFAULT_CONFIG, DEFAULT_HEALTH, loadConfig } from '../../src/cli/config';
import { baselineAgents, readOpenCodeSettings, type PermissionRule } from '../../src/cli/opencode-config';

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
    const permissions = readOpenCodeSettings(root).agents['kiki-implementer'].permissions as PermissionRule[];
    expect(permissions).toContainEqual({ action: 'edit', resource: 'src/**', effect: 'allow' });
  });
  it('writes no models section and no agent model keys on a fresh init', async () => {
    await init(root, { wizard: false });
    const config = JSON.parse(readFileSync(join(root, '.agentic/kiki/config.json'), 'utf8'));
    expect(config).not.toHaveProperty('models');
    const agents = readOpenCodeSettings(root).agents ?? {};
    expect(Object.keys(agents).length).toBeGreaterThan(0);
    expect(Object.values(agents).some(settings => 'model' in settings)).toBe(false);
  });
  it('persists config as-is without models when metadata is missing', () => {
    installProjectConfig(root, DEFAULT_CONFIG);
    const config = JSON.parse(readFileSync(join(root, '.agentic/kiki/config.json'), 'utf8'));
    expect(config).not.toHaveProperty('models');
    expect(config.commands.security).toBe('npm audit');
  });
  it.each([
    ['modern', '.agentic/kiki/config.json'],
    ['legacy fallback', '.agentic/config.json'],
  ])('loads a %s config with models/riskMatrix inert and preserves its bytes after re-init', async (_label, relativePath) => {
    const configPath = join(root, relativePath);
    mkdirSync(dirname(configPath), { recursive: true });
    const commands = { build: 'custom-build', test: 'custom-test', lint: 'custom-lint', security: 'custom-security' };
    const raw = {
      projectName: 'legacy-project',
      language: 'python',
      commands,
      paths: { source: 'backend/' },
      models: { standard: 'custom/standard', critical: 'custom/critical', workhorse: 'custom/workhorse' },
      riskMatrix: { high: 'custom/high' },
      health: { stuckThresholdMs: 1234 },
    };
    const bytes = JSON.stringify(raw, null, 2);
    writeFileSync(configPath, bytes);

    const loaded = loadConfig(root);
    expect(loaded).not.toHaveProperty('models');
    expect(loaded).not.toHaveProperty('riskMatrix');
    expect(loaded.projectName).toBe('legacy-project');
    expect(loaded.commands).toEqual(commands);
    expect(loaded.paths.source).toBe('backend/');
    expect(loaded.paths.tests).toBe('tests/');
    expect(loaded.health.stuckThresholdMs).toBe(1234);
    expect(loaded.health.absoluteMaxMs).toBe(DEFAULT_HEALTH.absoluteMaxMs);

    await init(root, { wizard: false });
    expect(readFileSync(configPath, 'utf8')).toBe(bytes);
  });
  it('reinitialization preserves tasks, alignment and project metadata', async () => {
    await init(root, { wizard: false });
    writeFileSync(join(root, '.agentic/kiki/TASK_REGISTRY.json'), '{"tasks":[{"id":"keep"}]}');
    writeFileSync(join(root, '.agentic/kiki/alignment.json'), '{"guardrails":["custom"]}');
    await init(root, { wizard: false });
    expect(readFileSync(join(root, '.agentic/kiki/TASK_REGISTRY.json'), 'utf8')).toContain('keep');
    expect(readFileSync(join(root, '.agentic/kiki/alignment.json'), 'utf8')).toContain('custom');
  });
  it('wizard asks no model questions and applies path and command answers', async () => {
    const input = new PassThrough();
    const originalStdin = Object.getOwnPropertyDescriptor(process, 'stdin');
    Object.defineProperty(process, 'stdin', { value: input, configurable: true });
    const writes: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    try {
      const pending = runWizard(root);
      const answers = [
        'wizard-project', 'typescript', 'src/', 'tests/', 'docs/',
        'CHANGELOG.md', 'create', 'docs/DECISIONS.md', 'create', 'docs/knowledge/', 'create',
        'custom-build', 'custom-test', 'custom-lint', 'custom-security',
        // Extra defaults keep the retired-flow RED run from hanging if model
        // prompts still consume answers; the fixed flow never reads them.
        '', '', '', '', '', '', '', '',
      ];
      for (const line of answers) input.write(line + '\n');
      input.end();

      const config = await pending;
      expect(config).not.toHaveProperty('models');
      expect(config.commands).toEqual({
        build: 'custom-build',
        test: 'custom-test',
        lint: 'custom-lint',
        security: 'custom-security',
      });
      expect(config.paths.source).toBe('src/');
      expect(config.paths.tests).toBe('tests/');
      expect(config.paths.docs).toBe('docs/');

      const output = writes.join('');
      expect(output).not.toContain('--- Models ---');
      expect(output).not.toContain('Standard model');
      expect(output).not.toContain('Critical model');
      expect(output).not.toContain('Workhorse model');
    } finally {
      stdoutSpy.mockRestore();
      if (originalStdin) Object.defineProperty(process, 'stdin', originalStdin);
    }
  });
});

describe('global agent baselines', () => {
  const agents = baselineAgents();
  const rules = (name: string): PermissionRule[] => agents[name].settings.permissions as PermissionRule[];
  const rule = (name: string, action: string, resource: string) =>
    rules(name).find(entry => entry.action === action && entry.resource === resource);
  it('retains role permissions, broad reads and protected secret paths', () => {
    for (const [name] of Object.entries(agents)) {
      if (name === 'kiki-orchestrator') continue;
      expect(rule(name, 'read', '*')?.effect).toBe('allow');
      expect(rule(name, 'read', '**/.env*')?.effect).toBe('deny');
      expect(rule(name, 'read', '**/*credential*')?.effect).toBe('deny');
      expect(rules(name).some(entry => ['write', 'patch', 'apply_patch'].includes(entry.action))).toBe(false);
    }
    expect(rule('kiki-implementer', 'edit', 'src/**')?.effect).toBe('allow');
    expect(rule('kiki-historian', 'edit', 'src/**')?.effect).toBe('deny');
    expect(rule('kiki-reviewer', 'edit', '*')?.effect).toBe('deny');
  });
  it('grants project-local .worktree access scoped to each role', () => {
    const edit = (name: string, resource: string) => rule(name, 'edit', resource)?.effect;
    for (const name of ['kiki-brainstormer', 'kiki-planner']) {
      expect(edit(name, '*')).toBe('deny');
      expect(edit(name, '.worktree/**/docs/superpowers/**')).toBe('allow');
      expect(edit(name, '.worktree/**')).toBeUndefined();
    }
    for (const name of ['kiki-implementer', 'kiki-gui-designer']) {
      expect(edit(name, '.worktree/**/src/**')).toBe('allow');
      expect(edit(name, '.worktree/**/tests/**')).toBe('allow');
      expect(edit(name, '.worktree/**')).toBeUndefined();
    }
    for (const name of ['kiki-reviewer', 'kiki-escalation']) {
      expect(edit(name, '.worktree/**/.agentic/reviews/*')).toBe('allow');
      expect(edit(name, '.worktree/**/.opencode/docs/reviews/*')).toBe('allow');
      expect(edit(name, '.worktree/**')).toBeUndefined();
    }
    expect(edit('kiki-historian', '.worktree/**/README*')).toBe('allow');
    expect(edit('kiki-historian', '.worktree/**/docs/**')).toBe('allow');
    expect(edit('kiki-historian', '.worktree/**/src/**')).toBe('deny');
    expect(edit('kiki-historian', '.worktree/**/tests/**')).toBe('deny');
    expect(edit('kiki-historian', '.worktree/**')).toBeUndefined();
  });
  it('retains the documentation completion gate and inline skills', () => {
    expect(agents['kiki-orchestrator'].prompt).toContain('Documentation decision required');
    expect(agents['kiki-orchestrator'].prompt).toContain('documentation.status');
    for (const name of ['kiki-brainstormer', 'kiki-planner']) expect(agents[name].prompt).toContain('follow it **inline**');
  });
  it('produces no model setting in any of the eight agent baselines', () => {
    expect(Object.keys(agents).length).toBeGreaterThan(0);
    for (const [name, agent] of Object.entries(agents)) {
      expect(agent.settings, name).not.toHaveProperty('model');
    }
  });
});

describe('retired model-slot API', () => {
  it('no longer exports model-slot runtime symbols', async () => {
    const config = await import('../../src/cli/config');
    for (const name of ['DEFAULT_MODELS', 'DEFAULT_ROUTING_TABLE', 'writeAgenticFiles', 'writeOpencodeFiles']) {
      expect(config, name).not.toHaveProperty(name);
    }
  });
  it('no longer declares model-slot types, constants, templates or writers in config source', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/cli/config.ts'), 'utf8');
    expect(source).not.toMatch(/\bKikiModels\b/);
    expect(source).not.toMatch(/\bDEFAULT_MODELS\b/);
    expect(source).not.toMatch(/\bDEFAULT_ROUTING_TABLE\b/);
    expect(source).not.toMatch(/\bwriteAgenticFiles\b/);
    expect(source).not.toMatch(/\bwriteOpencodeFiles\b/);
    expect(source).not.toMatch(/\bmodels\s*:\s*KikiModels\b/);
    expect(source).not.toMatch(/config\.models\./);
  });
});
