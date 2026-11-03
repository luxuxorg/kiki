import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'jsonc-parser';
import { DEFAULT_CONFIG, generateImplementerTemplate } from '../../src/cli/config';
import { installGlobalFiles, migrateProject, resetProject, initializeProjectAgents } from '../../src/cli/opencode-config';
import { migrate } from '../../src/cli/commands/migrate';
import { reset } from '../../src/cli/commands/reset';

describe('global-only Kiki policy', () => {
  let root: string;
  let global: string;
  let project: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kiki-policy-'));
    global = join(root, 'opencode');
    project = join(root, 'project');
    mkdirSync(global); mkdirSync(project);
    vi.stubEnv('XDG_CONFIG_HOME', root);
  });
  afterEach(() => { vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }); });
  const config = (dir: string) => parse(readFileSync(join(dir, 'opencode.jsonc'), 'utf8'));

  it('installs JSON agents and prompt files, preserving unrelated JSONC and user permissions/models on update', () => {
    writeFileSync(join(global, 'opencode.jsonc'), '{\n // keep this comment\n "model": "other/model", "agent": {"my-agent": {"prompt":"mine"}}\n}');
    installGlobalFiles(global);
    expect(config(global).agent['kiki-implementer'].permission.edit['src/**']).toBe('allow');
    expect(config(global).agent['my-agent'].prompt).toBe('mine');
    expect(existsSync(join(global, 'agents', 'kiki-implementer.md'))).toBe(false);
    expect(readFileSync(join(global, 'kiki/prompts/kiki-implementer.md'), 'utf8')).toContain('Kiki Implementer');
    const data = config(global);
    data.agent['kiki-implementer'].permission = { edit: 'deny' };
    data.agent['kiki-implementer'].model = 'custom/model';
    writeFileSync(join(global, 'opencode.jsonc'), '// keep this comment\n' + JSON.stringify(data));
    installGlobalFiles(global, true);
    expect(config(global).agent['kiki-implementer'].permission).toEqual({ edit: 'deny' });
    expect(config(global).agent['kiki-implementer'].model).toBe('custom/model');
    expect(readFileSync(join(global, 'opencode.jsonc'), 'utf8')).toContain('// keep this comment');
    expect(config(global).model).toBe('other/model');
    expect(readFileSync(join(global, 'plugins/kiki.ts'), 'utf8')).toContain("KIKI_PLUGIN_SCOPE = 'global'");
  });

  it('migrates legacy global Markdown rights and models before deleting the old definition', () => {
    mkdirSync(join(global, 'agents'));
    writeFileSync(join(global, 'agents/kiki-implementer.md'), generateImplementerTemplate(DEFAULT_CONFIG).replace('model: deepseek/deepseek-v4-pro', 'model: custom/legacy'));
    installGlobalFiles(global, true);
    expect(config(global).agent['kiki-implementer'].model).toBe('custom/legacy');
    expect(existsSync(join(global, 'agents/kiki-implementer.md'))).toBe(false);
    expect(readdirSync(join(global, 'kiki/backups'), { withFileTypes: true }).filter(entry => entry.isDirectory())).toHaveLength(1);
  });

  it('preserves deliberately inherited global permissions and models rather than restoring agent grants', () => {
    installGlobalFiles(global);
    const data = config(global);
    data.permission = { edit: 'deny' };
    data.model = 'inherited/model';
    delete data.agent['kiki-implementer'].permission;
    delete data.agent['kiki-implementer'].model;
    writeFileSync(join(global, 'opencode.jsonc'), JSON.stringify(data));
    installGlobalFiles(global, true);
    expect(config(global).agent['kiki-implementer']).not.toHaveProperty('permission');
    expect(config(global).agent['kiki-implementer']).not.toHaveProperty('model');
    expect(config(global).permission.edit).toBe('deny');
  });

  it('preserves comments inside existing agent permission settings during a global update', () => {
    writeFileSync(join(global, 'opencode.jsonc'), '{"agent":{"kiki-reviewer":{\n // project-independent restriction\n "permission": {\n // approved boundary\n "edit":"deny"}, "model":"custom/model"}}}');
    installGlobalFiles(global, true);
    const text = readFileSync(join(global, 'opencode.jsonc'), 'utf8');
    expect(text).toContain('// approved boundary');
    expect(text).toContain('// project-independent restriction');
    expect(config(global).agent['kiki-reviewer'].permission.edit).toBe('deny');
  });

  it('migrates local rights and models before removing duplicates; preserves JSON overrides and working data', () => {
    installGlobalFiles(global);
    mkdirSync(join(project, '.opencode/agents'), { recursive: true });
    mkdirSync(join(project, '.opencode/plugins'), { recursive: true });
    mkdirSync(join(project, '.agentic/kiki'), { recursive: true });
    writeFileSync(join(project, '.opencode/agents/kiki-implementer.md'), generateImplementerTemplate(DEFAULT_CONFIG).replace('"src/**": allow', '"backend/**": allow'));
    writeFileSync(join(project, '.opencode/agents/unrelated.md'), 'keep');
    writeFileSync(join(project, '.opencode/plugins/kiki.ts'), 'legacy plugin');
    writeFileSync(join(project, '.agentic/kiki/routing.json'), JSON.stringify({ agents: { 'kiki-planner': 'custom/planner' } }));
    writeFileSync(join(project, '.agentic/kiki/TASK_REGISTRY.json'), '{"tasks":[{"id":"keep"}]}');
    writeFileSync(join(project, 'opencode.jsonc'), '// keep\n{"agent":{"kiki-implementer":{"model":"existing/model"}},"model":"unrelated/model"}');
    migrateProject(project, global);
    const agent = config(project).agent['kiki-implementer'];
    expect(agent.model).toBe('existing/model');
    expect(agent.permission.edit['backend/**']).toBe('allow');
    // A global allow must not leak through the native deep merge.
    expect(agent.permission.edit['src/**']).toBe('deny');
    expect(config(project).agent['kiki-planner'].model).toBe('custom/planner');
    expect(existsSync(join(project, '.opencode/agents/kiki-implementer.md'))).toBe(false);
    expect(existsSync(join(project, '.opencode/plugins/kiki.ts'))).toBe(false);
    expect(existsSync(join(project, '.opencode/agents/unrelated.md'))).toBe(true);
    expect(readFileSync(join(project, '.agentic/kiki/TASK_REGISTRY.json'), 'utf8')).toContain('keep');
    const once = readFileSync(join(project, 'opencode.jsonc'), 'utf8');
    migrateProject(project, global);
    expect(readFileSync(join(project, 'opencode.jsonc'), 'utf8')).toBe(once);
  });

  it('leaves originals intact when migration input is malformed', () => {
    installGlobalFiles(global);
    mkdirSync(join(project, '.opencode/agents'), { recursive: true });
    const file = join(project, '.opencode/agents/kiki-implementer.md');
    writeFileSync(file, '---\npermission: [\n---\nbody');
    expect(() => migrateProject(project, global)).toThrow();
    expect(existsSync(file)).toBe(true);
    expect(existsSync(join(project, 'opencode.jsonc'))).toBe(false);
  });

  it('default init writes no local model keys; explicit choices still write; existing local models survive re-init', () => {
    installGlobalFiles(global);
    initializeProjectAgents(project, DEFAULT_CONFIG, global);
    for (const settings of Object.values(config(project).agent)) expect(settings).not.toHaveProperty('model');
    const data = config(project);
    data.agent['kiki-planner'].model = 'provider/local';
    writeFileSync(join(project, 'opencode.jsonc'), JSON.stringify(data));
    initializeProjectAgents(project, { ...DEFAULT_CONFIG, models: { ...DEFAULT_CONFIG.models, standard: 'custom/standard' } }, global);
    expect(config(project).agent['kiki-planner'].model).toBe('provider/local');
    expect(config(project).agent['kiki-orchestrator'].model).toBe('custom/standard');
  });

  it('initializes project permissions without local runtime or agent copies and without replacing existing grants', () => {
    initializeProjectAgents(project, DEFAULT_CONFIG, global);
    expect(existsSync(join(project, '.opencode'))).toBe(false);
    expect(config(project).agent['kiki-implementer'].permission.edit['src/**']).toBe('allow');
    const data = config(project);
    data.agent['kiki-implementer'].permission.edit = 'deny';
    writeFileSync(join(project, 'opencode.jsonc'), JSON.stringify(data));
    initializeProjectAgents(project, DEFAULT_CONFIG, global);
    expect(config(project).agent['kiki-implementer'].permission.edit).toBe('deny');
  });

  it('reset removes Kiki overrides and legacy copies but retains other settings, agent customizations and task data', () => {
    initializeProjectAgents(project, DEFAULT_CONFIG, global);
    const data = config(project);
    data.agent['other-agent'] = { model: 'keep/model' };
    data.theme = 'keep';
    writeFileSync(join(project, 'opencode.jsonc'), JSON.stringify(data));
    mkdirSync(join(project, '.agentic/kiki'), { recursive: true });
    writeFileSync(join(project, '.agentic/kiki/TASK_REGISTRY.json'), '{"tasks":[]}');
    writeFileSync(join(project, '.agentic/kiki/routing.json'), '{"agents":{}}');
    resetProject(project);
    expect(Object.keys(config(project).agent)).toEqual(['other-agent']);
    expect(config(project).theme).toBe('keep');
    expect(existsSync(join(project, '.agentic/kiki/routing.json'))).toBe(false);
    expect(existsSync(join(project, '.agentic/kiki/TASK_REGISTRY.json'))).toBe(true);
    resetProject(project);
  });

  it('initialization masks existing global grants outside project boundaries and applies explicitly selected project models', () => {
    installGlobalFiles(global);
    const data = config(global);
    data.agent['kiki-implementer'].permission.edit['outside/**'] = 'allow';
    data.agent['kiki-implementer'].permission.read['protected/**'] = 'deny';
    writeFileSync(join(global, 'opencode.jsonc'), JSON.stringify(data));
    initializeProjectAgents(project, {
      ...DEFAULT_CONFIG,
      paths: { ...DEFAULT_CONFIG.paths, source: 'backend/' },
      models: { ...DEFAULT_CONFIG.models, workhorse: 'custom/workhorse' },
    }, global);
    expect(config(project).agent['kiki-implementer'].permission.edit['outside/**']).toBe('deny');
    expect(config(project).agent['kiki-implementer'].permission.read['protected/**']).toBe('deny');
    expect(config(project).agent['kiki-implementer'].model).toBe('custom/workhorse');
  });

  it('invalid JSONC leaves legacy files intact before any cleanup', () => {
    installGlobalFiles(global);
    mkdirSync(join(project, '.opencode/plugins'), { recursive: true });
    writeFileSync(join(project, '.opencode/plugins/kiki.ts'), 'keep');
    writeFileSync(join(project, 'opencode.jsonc'), '{broken');
    expect(() => migrateProject(project, global)).toThrow(/Invalid OpenCode/);
    expect(() => resetProject(project)).toThrow(/Invalid OpenCode/);
    expect(readFileSync(join(project, '.opencode/plugins/kiki.ts'), 'utf8')).toBe('keep');
  });

  it('rejects syntactically valid but invalid permissions before removing the source agent', () => {
    installGlobalFiles(global);
    mkdirSync(join(project, '.opencode/agents'), { recursive: true });
    const file = join(project, '.opencode/agents/kiki-reviewer.md');
    writeFileSync(file, '---\nmodel: provider/model\npermission:\n  edit: sometimes\n---\nReviewer');
    expect(() => migrateProject(project, global)).toThrow(/permission/i);
    expect(existsSync(file)).toBe(true);
  });

  it('exposes migration/reset through explicit project commands and never acts on help or missing scope', async () => {
    installGlobalFiles(global);
    mkdirSync(join(project, '.opencode/plugins'), { recursive: true });
    writeFileSync(join(project, '.opencode/plugins/kiki.ts'), 'old');
    writeFileSync(join(project, 'opencode.jsonc'), '{"agent":{"kiki-reviewer":{"model":"project/model"}}}');
    await migrate(['--help']); await reset(['--help']);
    await expect(migrate([])).rejects.toThrow(/--project/);
    await expect(reset([])).rejects.toThrow(/--project/);
    expect(existsSync(join(project, '.opencode/plugins/kiki.ts'))).toBe(true);
    await migrate(['--project', project]);
    expect(existsSync(join(project, '.opencode/plugins/kiki.ts'))).toBe(false);
    await reset(['--project', project]);
    expect(config(project).agent['kiki-reviewer']).toBeUndefined();
  });

  it('reset clears Kiki keys in every OpenCode project config tier without touching other agents', () => {
    mkdirSync(join(project, '.opencode'), { recursive: true });
    const files = ['opencode.json', 'opencode.jsonc', '.opencode/opencode.json', '.opencode/opencode.jsonc'];
    for (const file of files) writeFileSync(join(project, file), '{"agent":{"kiki-reviewer":{"model":"project/model"},"other":{"model":"keep/model"}}}');
    resetProject(project);
    for (const file of files) {
      const data = parse(readFileSync(join(project, file), 'utf8'));
      expect(data.agent['kiki-reviewer']).toBeUndefined();
      expect(data.agent.other.model).toBe('keep/model');
    }
  });
});
