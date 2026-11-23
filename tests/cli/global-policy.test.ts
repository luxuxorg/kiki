import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'jsonc-parser';
import {
  DEFAULT_CONFIG, generateGlobalPermissions, generateSecretPolicies,
} from '../../src/cli/config';
import { parseAgent, installGlobalFiles, resetProject, initializeProjectAgents, readOpenCodeSettings } from '../../src/cli/opencode-config';
import { currentPackageSpec } from '../../src/cli/oc2-registration';
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
    expect(config(global).permissions).toEqual(generateGlobalPermissions());
    expect(config(global).policies).toEqual(generateSecretPolicies());
    expect(existsSync(join(global, 'kiki/prompts'))).toBe(false);
    expect(existsSync(join(global, 'plugins/kiki.ts'))).toBe(false);

    const data = config(global);
    data.agents['kiki-implementer'].permissions = [{ action: 'edit', resource: 'vendor/**', effect: 'allow' }];
    data.agents['kiki-implementer'].model = { providerID: 'custom', model: 'changed' };
    writeFileSync(join(global, 'opencode.jsonc'), '// keep this comment\n' + JSON.stringify(data));
    installGlobalFiles(global, true);
    expect(config(global).agents['kiki-implementer'].permissions)
      .toContainEqual({ action: 'edit', resource: 'vendor/**', effect: 'allow' });
    expect(config(global).agents['kiki-implementer'].model)
      .toEqual({ providerID: 'custom', model: 'changed' });
    expect(readFileSync(join(global, 'opencode.jsonc'), 'utf8')).toContain('// keep this comment');
    expect(config(global).model).toBe('other/model');
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

  it('reset removes native Kiki overrides but retains other settings, agent customizations and task data', () => {
    const data: any = {
      agents: {
        'kiki-implementer': { permissions: [{ action: 'edit', resource: 'scripts/**', effect: 'allow' }] },
        'other-agent': { model: { providerID: 'keep', model: 'model' } },
      },
      theme: 'keep',
    };
    writeFileSync(join(project, 'opencode.jsonc'), JSON.stringify(data));
    mkdirSync(join(project, '.agentic/kiki'), { recursive: true });
    writeFileSync(join(project, '.agentic/kiki/TASK_REGISTRY.json'), '{"tasks":[]}');
    resetProject(project);
    expect(config(project).agents['other-agent'].model).toEqual({ providerID: 'keep', model: 'model' });
    expect(config(project).agents['kiki-implementer']).toBeUndefined();
    expect(config(project).theme).toBe('keep');
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

  it('invalid JSONC leaves agent overrides intact before any cleanup', () => {
    installGlobalFiles(global);
    mkdirSync(join(project, '.opencode/agents'), { recursive: true });
    writeFileSync(join(project, '.opencode/agents/kiki-reviewer.md'), 'keep');
    writeFileSync(join(project, 'opencode.jsonc'), '{broken');
    expect(() => resetProject(project)).toThrow(/Invalid OpenCode/);
    expect(readFileSync(join(project, '.opencode/agents/kiki-reviewer.md'), 'utf8')).toBe('keep');
  });

  it('exposes reset through an explicit project command and never acts on help or missing scope', async () => {
    installGlobalFiles(global);
    mkdirSync(join(project, '.opencode/agents'), { recursive: true });
    writeFileSync(join(project, '.opencode/agents/kiki-reviewer.md'), 'old');
    writeFileSync(join(project, 'opencode.jsonc'), '{"agents":{"kiki-reviewer":{"model":{"providerID":"project","model":"model"}}}}');
    await reset(['--help']);
    await expect(reset([])).rejects.toThrow(/--project/);
    expect(existsSync(join(project, '.opencode/agents/kiki-reviewer.md'))).toBe(true);
    await reset(['--project', project]);
    expect(existsSync(join(project, '.opencode/agents/kiki-reviewer.md'))).toBe(false);
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
