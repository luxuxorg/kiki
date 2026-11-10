import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'jsonc-parser';
import {
  discoverConfigTiers,
  formatModelID,
  listAgentModels,
  parseModelID,
  readOpenCodeSettings,
  removeAgentModel,
  removeAllProjectModels,
  setAgentModel,
  type ModelContext,
} from '../../src/cli/opencode-config';

const v2 = (provider: string, model: string) => ({ providerID: provider, model });

describe('native model settings', () => {
  let root: string;
  let context: ModelContext;
  let globalFile: string;
  let projectFile: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kiki-models-'));
    context = { projectDirectory: join(root, 'project'), globalConfigDirectory: join(root, 'global') };
    mkdirSync(context.projectDirectory); mkdirSync(context.globalConfigDirectory);
    globalFile = join(context.globalConfigDirectory, 'opencode.jsonc');
    projectFile = join(context.projectDirectory, 'opencode.jsonc');
    writeFileSync(globalFile, '{\n// global note\n"$schema":"https://opencode.ai/config.json","model":"provider/default","agents":{"kiki-reviewer":{"model":{"providerID":"provider","model":"old"},"prompt":"keep","permissions":[\n// approved rights\n{"action":"edit","resource":"*","effect":"deny"}]},"other":{"model":{"providerID":"provider","model":"other"}}}}');
    writeFileSync(projectFile, '{// project note\n"agents":{"kiki-reviewer":{"model":{"providerID":"provider","model":"project"},"permissions":[{"action":"read","resource":"*","effect":"ask"}]}}}');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  const read = (file: string) => parse(readFileSync(file, 'utf8'));
  const available = ['provider/new', 'provider/project', 'vendor/org/model'];

  it('refuses explicit directories that alias a V1 install or overlap', () => {
    mkdirSync(join(context.globalConfigDirectory, 'plugins'), { recursive: true });
    writeFileSync(join(context.globalConfigDirectory, 'plugins', 'kiki.ts'), 'legacy\n');
    const before = readFileSync(globalFile, 'utf8');
    expect(() => setAgentModel('global', 'kiki-reviewer', 'provider/new', available, context)).toThrow(/V1|OC1|version 1|legacy/i);
    expect(() => listAgentModels('project', context)).toThrow(/V1|OC1|version 1|legacy/i);
    expect(readFileSync(globalFile, 'utf8')).toBe(before);

    expect(() => listAgentModels('project', {
      projectDirectory: context.globalConfigDirectory,
      globalConfigDirectory: context.globalConfigDirectory,
    })).toThrow(/overlap/i);
  });

  it('rejects_unwritable_destination_directory_without_changing_existing_files', () => {
    // A regular file can neither become nor contain the config directory, so the
    // atomic write fails deterministically even when this suite runs as root
    // (chmod-only read-only fixtures are bypassed by root).
    const blocked = join(root, 'blocked');
    writeFileSync(blocked, 'existing-bytes');
    const unwritable: ModelContext = {
      projectDirectory: context.projectDirectory,
      globalConfigDirectory: blocked,
    };
    const before = readFileSync(blocked, 'utf8');
    const listing = readdirSync(root).sort();
    expect(() => setAgentModel('global', 'kiki-reviewer', 'provider/new', available, unwritable))
      .toThrow(/EEXIST|ENOTDIR|not a directory|file already exists/i);
    expect(readFileSync(blocked, 'utf8')).toBe(before);
    expect(readdirSync(root).sort()).toEqual(listing);
    expect(existsSync(join(blocked, 'opencode.jsonc'))).toBe(false);
  });

  it('shows the selected scope and marks inherited models', () => {
    const global = listAgentModels('global', context);
    expect(global).toHaveLength(8);
    expect(global.find(row => row.name === 'kiki-reviewer')).toMatchObject({ model: 'provider/old', inherited: false, projectOverride: 'provider/project' });
    expect(global.find(row => row.name === 'kiki-planner')).toMatchObject({ model: 'provider/default', inherited: true });
    const local = listAgentModels('project', context);
    expect(local.find(row => row.name === 'kiki-reviewer')).toMatchObject({ model: 'provider/project', inherited: false });
    expect(local.find(row => row.name === 'kiki-planner')).toMatchObject({ model: 'provider/default', inherited: true });
  });

  it('model_object_roundtrip', () => {
    expect(parseModelID('vendor/org/model')).toEqual({ providerID: 'vendor', model: 'org/model' });
    expect(parseModelID('vendor/org/model', 'high')).toEqual({ providerID: 'vendor', model: 'org/model', variant: 'high' });
    expect(formatModelID({ providerID: 'vendor', model: 'org/model' })).toBe('vendor/org/model');
    expect(formatModelID({ providerID: 'vendor', model: 'org/model', variant: 'high' })).toBe('vendor/org/model');
    expect(() => parseModelID('vendor')).toThrow();
    expect(() => parseModelID('/model')).toThrow();
    expect(() => parseModelID('vendor/')).toThrow();
    expect(() => parseModelID('vendor/model#high')).toThrow();
    expect(() => parseModelID('vendor/model', 'bad#variant')).toThrow();

    setAgentModel('project', 'kiki-planner', 'vendor/org/model', available, context);
    expect(read(projectFile).agents['kiki-planner'].model).toEqual({ providerID: 'vendor', model: 'org/model' });
    expect(listAgentModels('project', context).find(row => row.name === 'kiki-planner')?.model).toBe('vendor/org/model');
  });

  it('preserves_jsonc_and_permissions', () => {
    const before = read(globalFile);
    setAgentModel('global', 'kiki-reviewer', 'provider/new', available, context);
    const after = read(globalFile);
    expect(after.agents['kiki-reviewer'].permissions).toEqual(before.agents['kiki-reviewer'].permissions);
    expect(after.agents['kiki-reviewer'].prompt).toBe('keep');
    expect(after.agents.other).toEqual(before.agents.other);
    expect(after.$schema).toBe('https://opencode.ai/config.json');
    expect(readFileSync(globalFile, 'utf8')).toContain('// global note');
    expect(readFileSync(globalFile, 'utf8')).toContain('// approved rights');
  });

  it('preserves an existing user $schema value', () => {
    const custom = 'https://example.test/custom-schema.json';
    const data = read(globalFile);
    data.$schema = custom;
    writeFileSync(globalFile, JSON.stringify(data));
    setAgentModel('global', 'kiki-reviewer', 'provider/new', available, context);
    expect(read(globalFile).$schema).toBe(custom);
  });

  it('rejects_prototype_keys_inside_arrays', () => {
    const nested = '{"agents":{"kiki-reviewer":{"permissions":[{"constructor":{"action":"read"}}]}}}';
    writeFileSync(projectFile, nested);
    expect(() => setAgentModel('project', 'kiki-reviewer', 'provider/new', available, context)).toThrow(/Invalid configuration key/);
    expect(() => removeAgentModel('project', 'kiki-reviewer', context)).toThrow(/Invalid configuration key/);
    expect(() => removeAllProjectModels(context)).toThrow(/Invalid configuration key/);
    expect(readFileSync(projectFile, 'utf8')).toBe(nested);

    const proto = '{"agents":{"kiki-reviewer":{"permissions":[{"__proto__":{"polluted":true}}]}}}';
    writeFileSync(projectFile, proto);
    expect(() => removeAllProjectModels(context)).toThrow(/Invalid configuration key/);
    expect(readFileSync(projectFile, 'utf8')).toBe(proto);
  });

  it('reports_ancestor_inheritance_without_deleting_parent', () => {
    const ancestor = join(root, 'opencode.json');
    writeFileSync(ancestor, '{"agents":{"kiki-planner":{"model":{"providerID":"ancestor","model":"base"}}}}');
    const before = readFileSync(ancestor, 'utf8');

    const row = listAgentModels('project', context).find(item => item.name === 'kiki-planner');
    expect(row).toMatchObject({ model: 'ancestor/base', inherited: true });

    const result = removeAgentModel('project', 'kiki-planner', context);
    expect(result.removed).toBeUndefined();
    expect(result.effective).toBe('ancestor/base');
    expect(readFileSync(ancestor, 'utf8')).toBe(before);
  });

  it('discovers global, ancestor and project tiers in low-to-high precedence and ignores config.json', () => {
    const globalJson = join(context.globalConfigDirectory, 'opencode.json');
    writeFileSync(globalJson, '{"agents":{"kiki-planner":{"model":{"providerID":"global","model":"json"}}}}');
    const ancestorJson = join(root, 'opencode.json');
    writeFileSync(ancestorJson, '{"agents":{"kiki-planner":{"model":{"providerID":"ancestor","model":"json"}}}}');
    const projectJson = join(context.projectDirectory, 'opencode.json');
    writeFileSync(projectJson, '{"agents":{"kiki-planner":{"model":{"providerID":"project","model":"json"}}}}');
    mkdirSync(join(context.projectDirectory, '.opencode'));
    const highJson = join(context.projectDirectory, '.opencode/opencode.json');
    const highJsonc = join(context.projectDirectory, '.opencode/opencode.jsonc');
    writeFileSync(highJson, '{"agents":{"kiki-planner":{"model":{"providerID":"project","model":"highjson"}}}}');
    writeFileSync(highJsonc, '{"agents":{"kiki-planner":{"model":{"providerID":"project","model":"highjsonc"}}}}');
    writeFileSync(join(context.globalConfigDirectory, 'config.json'), '{"agents":{"kiki-planner":{"model":{"providerID":"legacy","model":"configjson"}}}}');
    expect(readOpenCodeSettings(context.globalConfigDirectory, true).agents?.['kiki-planner']?.model).toEqual(v2('global', 'json'));

    const tiers = discoverConfigTiers(context.projectDirectory, context.globalConfigDirectory);
    expect(tiers.filter(tier => tier.scope === 'global').map(tier => tier.file)).toEqual([
      globalJson, globalFile,
    ]);
    expect(tiers.filter(tier => tier.scope === 'project').map(tier => tier.file)).toEqual([
      projectJson, projectFile, highJson, highJsonc,
    ]);
    expect(tiers.filter(tier => tier.scope === 'ancestor').map(tier => tier.file)).toEqual([ancestorJson]);
    expect(tiers.map(tier => tier.scope)).toEqual(['global', 'global', 'ancestor', 'project', 'project', 'project', 'project']);
    expect(listAgentModels('project', context).find(row => row.name === 'kiki-planner')?.model).toBe('project/highjsonc');
  });

  it('global save changes only the chosen model, retaining local overrides and nested comments', () => {
    const projectBefore = readFileSync(projectFile, 'utf8');
    const before = read(globalFile);
    const result = setAgentModel('global', 'kiki-reviewer', 'provider/new', available, context);
    before.agents['kiki-reviewer'].model = v2('provider', 'new');
    expect(read(globalFile)).toEqual(before);
    expect(readFileSync(projectFile, 'utf8')).toBe(projectBefore);
    expect(readFileSync(globalFile, 'utf8')).toContain('// approved rights');
    expect(result).toEqual({ file: globalFile, projectOverride: 'provider/project' });
  });

  it('project save touches no global settings and creates only the selected model override', () => {
    const globalBefore = readFileSync(globalFile, 'utf8');
    setAgentModel('project', 'kiki-planner', 'provider/new', available, context);
    expect(read(projectFile).agents['kiki-planner']).toEqual({ model: v2('provider', 'new') });
    expect(read(projectFile).agents['kiki-reviewer'].permissions).toEqual([{ action: 'read', resource: '*', effect: 'ask' }]);
    expect(readFileSync(projectFile, 'utf8')).toContain('// project note');
    expect(readFileSync(globalFile, 'utf8')).toBe(globalBefore);
    expect(existsSync(join(context.projectDirectory, '.agentic/kiki/routing.json'))).toBe(false);
  });

  it('can create a minimal project model override without initializing or copying agents', () => {
    rmSync(projectFile);
    setAgentModel('project', 'kiki-planner', 'provider/new', available, context);
    expect(read(projectFile)).toEqual({
      $schema: 'https://opencode.ai/config.json',
      agents: { 'kiki-planner': { model: v2('provider', 'new') } },
    });
    expect(existsSync(join(context.projectDirectory, '.opencode'))).toBe(false);
  });

  it('re-reads changed configuration before saving instead of writing a menu snapshot', () => {
    listAgentModels('global', context);
    const data = read(globalFile); data.agents.other.model = v2('provider', 'concurrent');
    writeFileSync(globalFile, JSON.stringify(data));
    setAgentModel('global', 'kiki-reviewer', 'provider/new', available, context);
    expect(read(globalFile).agents.other.model).toEqual(v2('provider', 'concurrent'));
  });

  it('respects existing higher-precedence .opencode JSON settings', () => {
    mkdirSync(join(context.projectDirectory, '.opencode'));
    const high = join(context.projectDirectory, '.opencode/opencode.json');
    writeFileSync(high, '{"agents":{"kiki-reviewer":{"model":{"providerID":"provider","model":"high"},"permissions":[{"action":"edit","resource":"*","effect":"deny"}]}}}');
    const before = readFileSync(projectFile, 'utf8');
    expect(setAgentModel('project', 'kiki-reviewer', 'provider/new', available, context).file).toBe(high);
    expect(read(high).agents['kiki-reviewer']).toEqual({
      model: v2('provider', 'new'),
      permissions: [{ action: 'edit', resource: '*', effect: 'deny' }],
    });
    expect(readFileSync(projectFile, 'utf8')).toBe(before);
  });

  it.each([
    ['global', 'other', 'provider/new'],
    ['global', '../kiki-reviewer', 'provider/new'],
    ['global', 'kiki-reviewer', 'provider/unavailable'],
    ['invalid', 'kiki-reviewer', 'provider/new'],
  ])('rejects invalid selection %s / %s / %s without writing', (scope, agent, model) => {
    const before = readFileSync(globalFile, 'utf8');
    expect(() => setAgentModel(scope as any, agent, model, available, context)).toThrow(/Ungültig|nicht verfügbar/);
    expect(readFileSync(globalFile, 'utf8')).toBe(before);
  });

  it('malformed JSONC leaves the original untouched', () => {
    writeFileSync(globalFile, '{broken');
    expect(() => setAgentModel('global', 'kiki-reviewer', 'provider/new', available, context)).toThrow(/Invalid OpenCode/);
    expect(readFileSync(globalFile, 'utf8')).toBe('{broken');
  });

  it('project remove deletes only the local model key and keeps permission and comments', () => {
    const globalBefore = readFileSync(globalFile, 'utf8');
    const result = removeAgentModel('project', 'kiki-reviewer', context);
    expect(read(projectFile).agents['kiki-reviewer']).toEqual({ permissions: [{ action: 'read', resource: '*', effect: 'ask' }] });
    expect(readFileSync(projectFile, 'utf8')).toContain('// project note');
    expect(readFileSync(globalFile, 'utf8')).toBe(globalBefore);
    expect(result).toEqual({ file: projectFile, removed: 'provider/project', effective: 'provider/old' });
  });

  it('remove without an existing override writes nothing and reports the inherited model', () => {
    const before = readFileSync(projectFile, 'utf8');
    const result = removeAgentModel('project', 'kiki-planner', context);
    expect(readFileSync(projectFile, 'utf8')).toBe(before);
    expect(result.removed).toBeUndefined();
    expect(result.effective).toBe('provider/default');
  });

  it('global remove deletes only the global agent model and keeps prompt, permission and comments', () => {
    const projectBefore = readFileSync(projectFile, 'utf8');
    const result = removeAgentModel('global', 'kiki-reviewer', context);
    expect(read(globalFile).agents['kiki-reviewer']).toEqual({
      prompt: 'keep',
      permissions: [{ action: 'edit', resource: '*', effect: 'deny' }],
    });
    expect(readFileSync(globalFile, 'utf8')).toContain('// approved rights');
    expect(readFileSync(globalFile, 'utf8')).toContain('// global note');
    expect(readFileSync(projectFile, 'utf8')).toBe(projectBefore);
    expect(result).toEqual({ file: globalFile, removed: 'provider/old', effective: 'provider/default' });
  });

  it('removes the whole agent entry when no settings remain', () => {
    const data = read(projectFile);
    data.agents['kiki-planner'] = { model: v2('provider', 'project') };
    writeFileSync(projectFile, JSON.stringify(data));
    removeAgentModel('project', 'kiki-planner', context);
    expect(read(projectFile).agents['kiki-planner']).toBeUndefined();
    expect(read(projectFile).agents['kiki-reviewer']).toBeDefined();
  });

  it('removeAllProjectModels clears kiki model keys across all project tiers and keeps foreign agents', () => {
    mkdirSync(join(context.projectDirectory, '.opencode'));
    const high = join(context.projectDirectory, '.opencode/opencode.json');
    writeFileSync(high, '{"agents":{"kiki-implementer":{"model":{"providerID":"provider","model":"high"}},"other":{"model":{"providerID":"keep","model":"other"}}}}');
    const globalBefore = readFileSync(globalFile, 'utf8');
    const result = removeAllProjectModels(context);
    expect(read(high).agents['kiki-implementer']).toBeUndefined();
    expect(read(high).agents.other).toEqual({ model: v2('keep', 'other') });
    expect(read(projectFile).agents['kiki-reviewer']).toEqual({ permissions: [{ action: 'read', resource: '*', effect: 'ask' }] });
    expect(result.files).toEqual(expect.arrayContaining([projectFile, high]));
    expect(result.removed).toEqual(expect.arrayContaining([
      { agent: 'kiki-reviewer', model: 'provider/project' },
      { agent: 'kiki-implementer', model: 'provider/high' },
    ]));
    expect(readFileSync(globalFile, 'utf8')).toBe(globalBefore);
  });

  it.each([
    ['invalid', 'kiki-reviewer'],
    ['project', 'other'],
    ['project', '../kiki-reviewer'],
  ])('rejects invalid removal scope/agent %s / %s without writing', (scope, agent) => {
    const before = readFileSync(projectFile, 'utf8');
    expect(() => removeAgentModel(scope as any, agent, context)).toThrow(/Ungültig/);
    expect(readFileSync(projectFile, 'utf8')).toBe(before);
  });

  it('malformed JSONC leaves the original untouched on removal', () => {
    writeFileSync(projectFile, '{broken');
    expect(() => removeAgentModel('project', 'kiki-reviewer', context)).toThrow(/Invalid OpenCode/);
    expect(() => removeAllProjectModels(context)).toThrow(/Invalid OpenCode/);
    expect(readFileSync(projectFile, 'utf8')).toBe('{broken');
  });

  it('validates both scopes before removing anything', () => {
    writeFileSync(globalFile, '{broken');
    const projectBefore = readFileSync(projectFile, 'utf8');
    expect(() => removeAgentModel('project', 'kiki-reviewer', context)).toThrow(/Invalid OpenCode/);
    expect(readFileSync(projectFile, 'utf8')).toBe(projectBefore);
    writeFileSync(globalFile, '{"agents":{"kiki-reviewer":{"model":{"providerID":"provider","model":"old"}}}}');
    writeFileSync(projectFile, '{broken');
    const globalBefore = readFileSync(globalFile, 'utf8');
    expect(() => removeAgentModel('global', 'kiki-reviewer', context)).toThrow(/Invalid OpenCode/);
    expect(readFileSync(globalFile, 'utf8')).toBe(globalBefore);
  });

  it('rejects forbidden configuration keys before removal without writing', () => {
    const nested = '{"agents":{"kiki-reviewer":{"permissions":[{"constructor":{"model":"provider/project"}}]}}}';
    writeFileSync(projectFile, nested);
    expect(() => removeAgentModel('project', 'kiki-reviewer', context)).toThrow(/Invalid configuration key/);
    expect(() => removeAllProjectModels(context)).toThrow(/Invalid configuration key/);
    expect(readFileSync(projectFile, 'utf8')).toBe(nested);
    const topLevel = '{"__proto__":{"polluted":true},"agents":{}}';
    writeFileSync(projectFile, topLevel);
    expect(() => removeAllProjectModels(context)).toThrow(/Invalid configuration key/);
    expect(readFileSync(projectFile, 'utf8')).toBe(topLevel);
  });
});
