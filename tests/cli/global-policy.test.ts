import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'jsonc-parser';
import { DEFAULT_CONFIG, generateAgentPermissions } from '../../src/cli/config';
import { parseAgent, installGlobalFiles, migrateProject, resetProject, initializeProjectAgents, readOpenCodeSettings } from '../../src/cli/opencode-config';
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

  it('installs prompt-only native agents and canonical global arrays, preserving unrelated JSONC and safe customs on update', () => {
    writeFileSync(join(global, 'opencode.jsonc'), `{
 // keep this comment
 "model": "other/model",
 "agents": {
   "my-agent": {"prompt": "mine"},
   "kiki-implementer": {
     "model": {"providerID": "custom", "model": "model"},
     "permissions": [{"action": "edit", "resource": "scripts/**", "effect": "allow"}]
   }
 }
}`);
    installGlobalFiles(global);
    for (const name of ['kiki-orchestrator', 'kiki-implementer', 'kiki-historian']) {
      expect(existsSync(join(global, 'agents', `${name}.md`)), name).toBe(true);
      const { settings } = parseAgent(readFileSync(join(global, 'agents', `${name}.md`), 'utf8'), name);
      expect(settings, name).not.toHaveProperty('permissions');
      expect(settings, name).not.toHaveProperty('permission');
    }
    expect(config(global).agents['my-agent'].prompt).toBe('mine');
    expect(config(global).agents['kiki-implementer'].model)
      .toEqual({ providerID: 'custom', model: 'model' });
    expect(config(global).agents['kiki-implementer'].permissions)
      .toContainEqual({ action: 'edit', resource: 'scripts/**', effect: 'allow' });
    expect(config(global).model).toBe('other/model');
    expect(config(global).plugins).toEqual([currentPackageSpec()]);
    expect(config(global).permissions).toBeUndefined();
    expect(existsSync(join(global, 'kiki/prompts'))).toBe(false);
    expect(existsSync(join(global, 'plugins/kiki.ts'))).toBe(false);

    const data = config(global);
    data.agents['kiki-implementer'].permissions = [{ action: 'edit', resource: 'vendor/**', effect: 'allow' }];
    data.agents['kiki-implementer'].model = { providerID: 'custom', model: 'changed' };
    writeFileSync(join(global, 'opencode.jsonc'), '// keep this comment\n' + JSON.stringify(data));
    // Manual permission divergence with ownership evidence present must halt;
    // this test covers the approved conservative bootstrap path.
    rmSync(join(global, 'kiki/state.json'));
    installGlobalFiles(global, true);
    expect(config(global).agents['kiki-implementer'].permissions)
      .toContainEqual({ action: 'edit', resource: 'vendor/**', effect: 'allow' });
    expect(config(global).agents['kiki-implementer'].model)
      .toEqual({ providerID: 'custom', model: 'changed' });
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
  write:
    "scripts/**": allow
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
    expect(settings.permissions).toBeUndefined();
    const rules = config(global).agents['kiki-implementer'].permissions;
    expect(rules).toContainEqual({ action: 'edit', resource: 'scripts/**', effect: 'allow' });
    expect(rules.slice(-7)).toEqual(generateAgentPermissions()['kiki-implementer'].slice(-7));
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

  it('preserves JSONC comments around existing agent settings during a global update', () => {
    writeFileSync(join(global, 'opencode.jsonc'), '{"agents":{"kiki-reviewer":{\n // project-independent restriction\n "model":{"providerID":"custom","model":"model"},\n // approved boundary\n "permissions": [{"action":"edit","resource":"scripts/**","effect":"allow"}]}}}');
    installGlobalFiles(global, true);
    const text = readFileSync(join(global, 'opencode.jsonc'), 'utf8');
    expect(text).toContain('// approved boundary');
    expect(text).toContain('// project-independent restriction');
    expect(config(global).agents['kiki-reviewer'].permissions)
      .toContainEqual({ action: 'edit', resource: 'scripts/**', effect: 'allow' });
    expect(config(global).agents['kiki-reviewer'].model)
      .toEqual({ providerID: 'custom', model: 'model' });
  });

  it('migrates local rights and models before removing duplicates; preserves JSON overrides and working data', () => {
    installGlobalFiles(global);
    mkdirSync(join(project, '.opencode/agents'), { recursive: true });
    mkdirSync(join(project, '.opencode/plugins'), { recursive: true });
    mkdirSync(join(project, '.agentic/kiki'), { recursive: true });
    writeFileSync(join(project, '.opencode/agents/kiki-implementer.md'), `---
description: local
mode: subagent
permissions:
  - action: edit
    resource: "backend/**"
    effect: allow
---
Local implementer
`);
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
    // The global src/** grant is authoritative; the project tier adds rights
    // rather than masking them.
    expect(rule('edit', 'src/**')).toBeUndefined();
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

  it('init writes no project config mirrors and re-init preserves existing bytes', () => {
    installGlobalFiles(global);
    initializeProjectAgents(project, DEFAULT_CONFIG, global);
    expect(existsSync(join(project, 'opencode.jsonc'))).toBe(false);
    expect(existsSync(join(project, 'opencode.json'))).toBe(false);
    const custom = '{ "agents": { "kiki-planner": { "model": { "providerID": "provider", "model": "local" } } } }\n';
    writeFileSync(join(project, 'opencode.jsonc'), custom);
    initializeProjectAgents(project, DEFAULT_CONFIG, global);
    expect(readFileSync(join(project, 'opencode.jsonc'), 'utf8')).toBe(custom);
  });

  it('init_no_native_config_writes including existing custom paths', () => {
    const custom = '// keep\n{"agents":{"mine":{"model":{"providerID":"x","model":"y"}}}}\n';
    writeFileSync(join(project, 'opencode.jsonc'), custom);
    initializeProjectAgents(project, DEFAULT_CONFIG, global);
    expect(existsSync(join(project, '.opencode'))).toBe(false);
    expect(readFileSync(join(project, 'opencode.jsonc'), 'utf8')).toBe(custom);
    expect(readOpenCodeSettings(project).agents?.['kiki-implementer']).toBeUndefined();
  });

  it('reset removes native and legacy Kiki overrides but retains other settings, agent customizations and task data', () => {
    const data: any = {
      agents: {
        'kiki-implementer': { permissions: [{ action: 'edit', resource: 'scripts/**', effect: 'allow' }] },
        'other-agent': { model: { providerID: 'keep', model: 'model' } },
      },
      agent: { 'kiki-reviewer': { model: 'legacy/model' } },
      theme: 'keep',
    };
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

  it('initialization is validation-only and never writes project mirrors of global grants', () => {
    installGlobalFiles(global);
    const before = readFileSync(join(global, 'opencode.jsonc'), 'utf8');
    initializeProjectAgents(project, {
      ...DEFAULT_CONFIG,
      paths: { ...DEFAULT_CONFIG.paths, source: 'backend/' },
    }, global);
    expect(existsSync(join(project, 'opencode.jsonc'))).toBe(false);
    expect(readFileSync(join(global, 'opencode.jsonc'), 'utf8')).toBe(before);
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
