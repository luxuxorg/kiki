import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'jsonc-parser';
import { DEFAULT_CONFIG, generateImplementerTemplate } from '../../src/cli/config';
import { parseAgent, installGlobalFiles, migrateProject, resetProject, initializeProjectAgents } from '../../src/cli/opencode-config';
import { currentPackageSpec } from '../../src/cli/oc2-registration';
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

  it('installs native agents and package registration, preserving unrelated JSONC and native additions on update', () => {
    writeFileSync(join(global, 'opencode.jsonc'), `{
 // keep this comment
 "model": "other/model",
 "agents": {
   "my-agent": {"prompt": "mine"},
   "kiki-implementer": {
     "model": {"providerID": "custom", "model": "model"},
     "permissions": [{"action": "edit", "resource": "src/**", "effect": "allow"}]
   }
 }
}`);
    installGlobalFiles(global);
    for (const name of ['kiki-orchestrator', 'kiki-implementer', 'kiki-historian']) {
      expect(existsSync(join(global, 'agents', `${name}.md`)), name).toBe(true);
    }
    expect(config(global).agents['my-agent'].prompt).toBe('mine');
    expect(config(global).agents['kiki-implementer']).toEqual({
      model: { providerID: 'custom', model: 'model' },
      permissions: [{ action: 'edit', resource: 'src/**', effect: 'allow' }],
    });
    expect(config(global).model).toBe('other/model');
    expect(config(global).plugins).toEqual([currentPackageSpec()]);
    expect(config(global).permissions).toBeUndefined();
    expect(existsSync(join(global, 'kiki/prompts'))).toBe(false);
    expect(existsSync(join(global, 'plugins/kiki.ts'))).toBe(false);

    const data = config(global);
    data.agents['kiki-implementer'].permissions = [{ action: 'edit', resource: '*', effect: 'deny' }];
    data.agents['kiki-implementer'].model = { providerID: 'custom', model: 'changed' };
    writeFileSync(join(global, 'opencode.jsonc'), '// keep this comment\n' + JSON.stringify(data));
    installGlobalFiles(global, true);
    expect(config(global).agents['kiki-implementer'].permissions).toEqual(
      [{ action: 'edit', resource: '*', effect: 'deny' }]);
    expect(config(global).agents['kiki-implementer'].model).toEqual({ providerID: 'custom', model: 'changed' });
    expect(readFileSync(join(global, 'opencode.jsonc'), 'utf8')).toContain('// keep this comment');
    expect(config(global).model).toBe('other/model');
  });

  it('migrates a legacy singular agent file to the native agents directory without seeding a model', () => {
    mkdirSync(join(global, 'agent'));
    writeFileSync(join(global, 'agent/kiki-implementer.md'), `---
description: legacy
mode: subagent
model: custom/legacy
permission:
  edit: deny
---
body
`);
    installGlobalFiles(global, true);
    const file = join(global, 'agents/kiki-implementer.md');
    expect(existsSync(file)).toBe(true);
    expect(existsSync(join(global, 'agent/kiki-implementer.md'))).toBe(false);
    const { settings } = parseAgent(readFileSync(file, 'utf8'), file);
    expect(settings).not.toHaveProperty('model');
    expect(settings.permission).toBeUndefined();
    expect(settings.permissions).toEqual([{ action: 'edit', resource: '*', effect: 'deny' }]);
    expect(readdirSync(join(global, 'kiki/backups'), { withFileTypes: true }).filter(entry => entry.isDirectory())).toHaveLength(1);
  });

  it('preserves deliberately inherited global permissions and models rather than restoring agent grants', () => {
    installGlobalFiles(global);
    const file = join(global, 'agents/kiki-implementer.md');
    writeFileSync(file, '---\ndescription: inherited\nmode: subagent\n---\nCustom\n');
    const data = config(global);
    data.permission = { edit: 'deny' };
    data.model = 'inherited/model';
    writeFileSync(join(global, 'opencode.jsonc'), JSON.stringify(data));
    installGlobalFiles(global, true);
    const { settings } = parseAgent(readFileSync(file, 'utf8'), file);
    expect(settings).not.toHaveProperty('permissions');
    expect(settings).not.toHaveProperty('model');
    expect(config(global).permission.edit).toBe('deny');
    expect(config(global).model).toBe('inherited/model');
  });

  it('preserves comments inside existing native agent permission settings during a global update', () => {
    writeFileSync(join(global, 'opencode.jsonc'), '{"agents":{"kiki-reviewer":{\n // project-independent restriction\n "permissions": [\n // approved boundary\n {"action":"edit","resource":"*","effect":"deny"}], "model":{"providerID":"custom","model":"model"}}}}');
    installGlobalFiles(global, true);
    const text = readFileSync(join(global, 'opencode.jsonc'), 'utf8');
    expect(text).toContain('// approved boundary');
    expect(text).toContain('// project-independent restriction');
    expect(config(global).agents['kiki-reviewer'].permissions).toEqual(
      [{ action: 'edit', resource: '*', effect: 'deny' }]);
  });

  it('migrates local rights and models before removing duplicates; preserves JSON overrides and working data', () => {
    installGlobalFiles(global);
    // The source is an OC1-shaped config; installed OC2 agent files alone are
    // not a V1 permission source.
    const globalData = config(global);
    globalData.agent = { 'kiki-implementer': { permission: { edit: { 'src/**': 'allow' } } } };
    writeFileSync(join(global, 'opencode.jsonc'), JSON.stringify(globalData));
    mkdirSync(join(project, '.opencode/agents'), { recursive: true });
    mkdirSync(join(project, '.opencode/plugins'), { recursive: true });
    mkdirSync(join(project, '.agentic/kiki'), { recursive: true });
    writeFileSync(join(project, '.opencode/agents/kiki-implementer.md'), generateImplementerTemplate(DEFAULT_CONFIG).replace('resource: "src/**"', 'resource: "backend/**"'));
    writeFileSync(join(project, '.opencode/agents/unrelated.md'), 'keep');
    writeFileSync(join(project, '.opencode/plugins/kiki.ts'), 'legacy plugin');
    writeFileSync(join(project, '.agentic/kiki/routing.json'), JSON.stringify({ agents: { 'kiki-planner': 'custom/planner' } }));
    writeFileSync(join(project, '.agentic/kiki/TASK_REGISTRY.json'), '{"tasks":[{"id":"keep"}]}');
    writeFileSync(join(project, 'opencode.jsonc'), '// keep\n{"agents":{"kiki-implementer":{"model":{"providerID":"existing","model":"model"}}},"model":"unrelated/model"}');
    migrateProject(project, global);
    const agent = config(project).agents['kiki-implementer'];
    expect(agent.model).toEqual({ providerID: 'existing', model: 'model' });
    const rule = (action: string, resource: string) =>
      agent.permissions.find((entry: { action: string; resource: string }) =>
        entry.action === action && entry.resource === resource);
    expect(rule('edit', 'backend/**')?.effect).toBe('allow');
    // A global allow must not leak through the native deep merge.
    expect(rule('edit', 'src/**')?.effect).toBe('deny');
    expect(config(project).agents['kiki-planner'].model).toEqual({ providerID: 'custom', model: 'planner' });
    expect(config(project).agent?.['kiki-implementer']).toBeUndefined();
    expect(existsSync(join(project, '.opencode/agents/kiki-implementer.md'))).toBe(false);
    expect(existsSync(join(project, '.opencode/plugins/kiki.ts'))).toBe(false);
    expect(existsSync(join(project, '.opencode/agents/unrelated.md'))).toBe(true);
    expect(readFileSync(join(project, '.agentic/kiki/TASK_REGISTRY.json'), 'utf8')).toContain('keep');
    expect(existsSync(join(project, '.agentic/kiki/migration.json'))).toBe(true);
    const once = readFileSync(join(project, 'opencode.jsonc'), 'utf8');
    expect(() => migrateProject(project, global)).toThrow(/already|force/i);
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

  it('default init writes no local model keys and existing local models survive re-init', () => {
    installGlobalFiles(global);
    initializeProjectAgents(project, DEFAULT_CONFIG, global);
    for (const settings of Object.values(config(project).agents)) expect(settings).not.toHaveProperty('model');
    const data = config(project);
    data.agents['kiki-planner'].model = { providerID: 'provider', model: 'local' };
    writeFileSync(join(project, 'opencode.jsonc'), JSON.stringify(data));
    initializeProjectAgents(project, DEFAULT_CONFIG, global);
    expect(config(project).agents['kiki-planner'].model).toEqual({ providerID: 'provider', model: 'local' });
    expect(config(project).agents['kiki-orchestrator']?.model).toBeUndefined();
  });

  it('initializes project permissions without local runtime or agent copies and without replacing existing grants', () => {
    initializeProjectAgents(project, DEFAULT_CONFIG, global);
    expect(existsSync(join(project, '.opencode'))).toBe(false);
    expect(config(project).agents['kiki-implementer'].permissions).toContainEqual(
      { action: 'edit', resource: 'src/**', effect: 'allow' });
    const data = config(project);
    data.agents['kiki-implementer'].permissions = [{ action: 'edit', resource: '*', effect: 'deny' }];
    writeFileSync(join(project, 'opencode.jsonc'), JSON.stringify(data));
    initializeProjectAgents(project, DEFAULT_CONFIG, global);
    expect(config(project).agents['kiki-implementer'].permissions).toEqual(
      [{ action: 'edit', resource: '*', effect: 'deny' }]);
  });

  it('reset removes native and legacy Kiki overrides but retains other settings, agent customizations and task data', () => {
    initializeProjectAgents(project, DEFAULT_CONFIG, global);
    const data = config(project);
    data.agents['other-agent'] = { model: { providerID: 'keep', model: 'model' } };
    data.agent = { 'kiki-reviewer': { model: 'legacy/model' } };
    data.theme = 'keep';
    writeFileSync(join(project, 'opencode.jsonc'), JSON.stringify(data));
    mkdirSync(join(project, '.agentic/kiki'), { recursive: true });
    writeFileSync(join(project, '.agentic/kiki/TASK_REGISTRY.json'), '{"tasks":[]}');
    writeFileSync(join(project, '.agentic/kiki/routing.json'), '{"agents":{}}');
    resetProject(project);
    expect(config(project).agents['other-agent'].model).toEqual({ providerID: 'keep', model: 'model' });
    expect(config(project).agents['kiki-implementer']).toBeUndefined();
    expect(config(project).agent['kiki-reviewer']).toBeUndefined();
    expect(config(project).theme).toBe('keep');
    expect(existsSync(join(project, '.agentic/kiki/routing.json'))).toBe(false);
    expect(existsSync(join(project, '.agentic/kiki/TASK_REGISTRY.json'))).toBe(true);
    expect(readdirSync(join(project, '.agentic/kiki/backups'), { withFileTypes: true })
      .filter(entry => entry.isDirectory())).toHaveLength(1);
    resetProject(project);
  });

  it('initialization masks existing global grants outside project boundaries without seeding models', () => {
    installGlobalFiles(global);
    const data = config(global);
    data.agents = {
      ...(data.agents || {}),
      'kiki-implementer': {
        permissions: [
          { action: 'edit', resource: 'outside/**', effect: 'allow' },
          { action: 'read', resource: 'protected/**', effect: 'deny' },
        ],
      },
    };
    writeFileSync(join(global, 'opencode.jsonc'), JSON.stringify(data));
    initializeProjectAgents(project, {
      ...DEFAULT_CONFIG,
      paths: { ...DEFAULT_CONFIG.paths, source: 'backend/' },
    }, global);
    const permissions = config(project).agents['kiki-implementer'].permissions;
    const rule = (action: string, resource: string) =>
      permissions.find((entry: { action: string; resource: string }) =>
        entry.action === action && entry.resource === resource);
    expect(rule('edit', 'outside/**')?.effect).toBe('deny');
    expect(rule('read', 'protected/**')?.effect).toBe('deny');
    expect(config(project).agents['kiki-implementer']).not.toHaveProperty('model');
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
    writeFileSync(join(project, 'opencode.jsonc'), '{"agents":{"kiki-reviewer":{"model":{"providerID":"project","model":"model"}}}}');
    await migrate(['--help']); await reset(['--help']);
    await expect(migrate([])).rejects.toThrow(/Refusing|overlap|isolat/i);
    await expect(reset([])).rejects.toThrow(/--project/);
    expect(existsSync(join(project, '.opencode/plugins/kiki.ts'))).toBe(true);
    await migrate(['--project', project]);
    expect(existsSync(join(project, '.opencode/plugins/kiki.ts'))).toBe(false);
    await reset(['--project', project]);
    expect(config(project).agents['kiki-reviewer']).toBeUndefined();
  });

  it('reset clears Kiki keys in every project config tier without touching other agents or ancestors', () => {
    const parent = join(root, 'parent');
    mkdirSync(parent);
    writeFileSync(join(parent, 'opencode.json'), '{"agents":{"kiki-reviewer":{"model":{"providerID":"parent","model":"model"}},"other":{"model":{"providerID":"parent","model":"other"}}}}');
    mkdirSync(join(project, '.opencode'), { recursive: true });
    const files = ['opencode.json', 'opencode.jsonc', '.opencode/opencode.json', '.opencode/opencode.jsonc'];
    for (const file of files) writeFileSync(join(project, file), '{"agents":{"kiki-reviewer":{"model":{"providerID":"project","model":"model"}},"other":{"model":{"providerID":"project","model":"keep"}}}}');
    resetProject(project);
    for (const file of files) {
      const data = parse(readFileSync(join(project, file), 'utf8'));
      expect(data.agents['kiki-reviewer']).toBeUndefined();
      expect(data.agents.other.model).toEqual({ providerID: 'project', model: 'keep' });
    }
    expect(parse(readFileSync(join(parent, 'opencode.json'), 'utf8')).agents['kiki-reviewer'])
      .toEqual({ model: { providerID: 'parent', model: 'model' } });
  });
});
