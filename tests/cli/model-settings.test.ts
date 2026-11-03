import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'jsonc-parser';
import { listAgentModels, setAgentModel, removeAgentModel, removeAllProjectModels, type ModelContext } from '../../src/cli/opencode-config';

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
    writeFileSync(globalFile, '{\n// global note\n"model":"provider/default", "agent":{"kiki-reviewer":{"model":"provider/old", "prompt":"keep", "permission":{\n// approved rights\n"edit":"deny"}},"other":{"model":"provider/other"}}}');
    writeFileSync(projectFile, '{// project note\n"agent":{"kiki-reviewer":{"model":"provider/project","permission":{"read":"ask"}}}}');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  const read = (file: string) => parse(readFileSync(file, 'utf8'));
  const available = ['provider/new', 'provider/project'];

  it('shows the selected scope and marks inherited models', () => {
    const global = listAgentModels('global', context);
    expect(global).toHaveLength(8);
    expect(global.find(row => row.name === 'kiki-reviewer')).toMatchObject({ model: 'provider/old', inherited: false, projectOverride: 'provider/project' });
    expect(global.find(row => row.name === 'kiki-planner')).toMatchObject({ model: 'provider/default', inherited: true });
    const local = listAgentModels('project', context);
    expect(local.find(row => row.name === 'kiki-reviewer')).toMatchObject({ model: 'provider/project', inherited: false });
    expect(local.find(row => row.name === 'kiki-planner')).toMatchObject({ model: 'provider/default', inherited: true });
  });

  it('global save changes only the chosen model, retaining local overrides and nested comments', () => {
    const projectBefore = readFileSync(projectFile, 'utf8');
    const before = read(globalFile);
    const result = setAgentModel('global', 'kiki-reviewer', 'provider/new', available, context);
    before.agent['kiki-reviewer'].model = 'provider/new';
    expect(read(globalFile)).toEqual(before);
    expect(readFileSync(projectFile, 'utf8')).toBe(projectBefore);
    expect(readFileSync(globalFile, 'utf8')).toContain('// approved rights');
    expect(result).toEqual({ file: globalFile, projectOverride: 'provider/project' });
  });

  it('project save touches no global settings and creates only the selected model override', () => {
    const globalBefore = readFileSync(globalFile, 'utf8');
    setAgentModel('project', 'kiki-planner', 'provider/new', available, context);
    expect(read(projectFile).agent['kiki-planner']).toEqual({ model: 'provider/new' });
    expect(read(projectFile).agent['kiki-reviewer'].permission).toEqual({ read: 'ask' });
    expect(readFileSync(projectFile, 'utf8')).toContain('// project note');
    expect(readFileSync(globalFile, 'utf8')).toBe(globalBefore);
    expect(existsSync(join(context.projectDirectory, '.agentic/kiki/routing.json'))).toBe(false);
  });

  it('can create a minimal project model override without initializing or copying agents', () => {
    rmSync(projectFile);
    setAgentModel('project', 'kiki-planner', 'provider/new', available, context);
    expect(read(projectFile)).toEqual({
      $schema: 'https://opencode.ai/config.json',
      agent: { 'kiki-planner': { model: 'provider/new' } },
    });
    expect(existsSync(join(context.projectDirectory, '.opencode'))).toBe(false);
  });

  it('re-reads changed configuration before saving instead of writing a menu snapshot', () => {
    listAgentModels('global', context);
    const data = read(globalFile); data.agent.other.model = 'provider/concurrent';
    writeFileSync(globalFile, JSON.stringify(data));
    setAgentModel('global', 'kiki-reviewer', 'provider/new', available, context);
    expect(read(globalFile).agent.other.model).toBe('provider/concurrent');
  });

  it('respects existing higher-precedence .opencode JSON settings', () => {
    mkdirSync(join(context.projectDirectory, '.opencode'));
    const high = join(context.projectDirectory, '.opencode/opencode.json');
    writeFileSync(high, '{"agent":{"kiki-reviewer":{"model":"provider/high","permission":{"edit":"deny"}}}}');
    const before = readFileSync(projectFile, 'utf8');
    expect(setAgentModel('project', 'kiki-reviewer', 'provider/new', available, context).file).toBe(high);
    expect(read(high).agent['kiki-reviewer']).toEqual({ model: 'provider/new', permission: { edit: 'deny' } });
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
    expect(read(projectFile).agent['kiki-reviewer']).toEqual({ permission: { read: 'ask' } });
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
    expect(read(globalFile).agent['kiki-reviewer']).toEqual({ prompt: 'keep', permission: { edit: 'deny' } });
    expect(readFileSync(globalFile, 'utf8')).toContain('// approved rights');
    expect(readFileSync(globalFile, 'utf8')).toContain('// global note');
    expect(readFileSync(projectFile, 'utf8')).toBe(projectBefore);
    expect(result).toEqual({ file: globalFile, removed: 'provider/old', effective: 'provider/default' });
  });

  it('removes the whole agent entry when no settings remain', () => {
    const data = read(projectFile);
    data.agent['kiki-planner'] = { model: 'provider/project' };
    writeFileSync(projectFile, JSON.stringify(data));
    removeAgentModel('project', 'kiki-planner', context);
    expect(read(projectFile).agent['kiki-planner']).toBeUndefined();
    expect(read(projectFile).agent['kiki-reviewer']).toBeDefined();
  });

  it('removeAllProjectModels clears kiki model keys across all project tiers and keeps foreign agents', () => {
    mkdirSync(join(context.projectDirectory, '.opencode'));
    const high = join(context.projectDirectory, '.opencode/opencode.json');
    writeFileSync(high, '{"agent":{"kiki-implementer":{"model":"provider/high"},"other":{"model":"keep/other"}}}');
    const globalBefore = readFileSync(globalFile, 'utf8');
    const result = removeAllProjectModels(context);
    expect(read(high).agent['kiki-implementer']).toBeUndefined();
    expect(read(high).agent.other).toEqual({ model: 'keep/other' });
    expect(read(projectFile).agent['kiki-reviewer']).toEqual({ permission: { read: 'ask' } });
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
    writeFileSync(globalFile, '{"agent":{"kiki-reviewer":{"model":"provider/old"}}}');
    writeFileSync(projectFile, '{broken');
    const globalBefore = readFileSync(globalFile, 'utf8');
    expect(() => removeAgentModel('global', 'kiki-reviewer', context)).toThrow(/Invalid OpenCode/);
    expect(readFileSync(globalFile, 'utf8')).toBe(globalBefore);
  });

  it('rejects forbidden configuration keys before removal without writing', () => {
    const nested = '{"agent":{"kiki-reviewer":{"constructor":{"model":"provider/project"}}}}';
    writeFileSync(projectFile, nested);
    expect(() => removeAgentModel('project', 'kiki-reviewer', context)).toThrow(/Invalid configuration key/);
    expect(() => removeAllProjectModels(context)).toThrow(/Invalid configuration key/);
    expect(readFileSync(projectFile, 'utf8')).toBe(nested);
    const topLevel = '{"__proto__":{"polluted":true},"agent":{}}';
    writeFileSync(projectFile, topLevel);
    expect(() => removeAllProjectModels(context)).toThrow(/Invalid configuration key/);
    expect(readFileSync(projectFile, 'utf8')).toBe(topLevel);
  });
});
