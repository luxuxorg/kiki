import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import { applyEdits, findNodeAtLocation, modify, parse as parseJsonc, parseTree, ParseError, type Node } from 'jsonc-parser';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import {
  DEFAULT_CONFIG, generateAgentPermissions, generateAllTemplates, generateGlobalPermissions,
  generateSecretPolicies, KikiConfig, withBaselineBehaviorPrompt, withPermissionRequestPrompt,
} from './config.js';
import { canonicalPath, pathsOverlap, resolveOC2Roots } from './oc2-paths.js';
import {
  classifyPermissionSources,
  splitSecretTail,
  type PermissionSource,
} from './permission-consolidation.js';
import { currentPackageSpec, prepareRegistration } from './oc2-registration.js';

export type Settings = Record<string, any>;
export const AGENT_NAMES = ['kiki-orchestrator', 'kiki-brainstormer', 'kiki-planner',
  'kiki-implementer', 'kiki-gui-designer', 'kiki-reviewer', 'kiki-escalation', 'kiki-historian'];

export interface ModelSelection {
  providerID: string;
  model: string;
  variant?: string;
}

export interface PermissionRule {
  action: string;
  resource: string;
  effect: 'allow' | 'deny' | 'ask';
}

export interface ConfigTier {
  file: string;
  scope: 'global' | 'ancestor' | 'project';
  directory: string;
}

/** Split a UI model ID at the first `/`; variants are passed separately. */
export function parseModelID(id: string, variant?: string): ModelSelection {
  if (typeof id !== 'string' || !id.trim() || id.includes('#')) throw new Error('Invalid model identifier.');
  const separator = id.indexOf('/');
  if (separator <= 0 || separator === id.length - 1) throw new Error('Invalid model identifier.');
  const providerID = id.slice(0, separator);
  const model = id.slice(separator + 1);
  if (!providerID.trim() || !model.trim()) throw new Error('Invalid model identifier.');
  if (variant !== undefined && (typeof variant !== 'string' || !variant.trim() || variant.includes('#'))) {
    throw new Error('Invalid model variant.');
  }
  return { providerID, model, ...(variant ? { variant } : {}) };
}

/** Render a native model selection as the string ID used by the existing UI. */
export function formatModelID(model: ModelSelection): string {
  if (!model || typeof model.providerID !== 'string' || !model.providerID.trim()
    || typeof model.model !== 'string' || !model.model.trim()) {
    throw new Error('Invalid model selection.');
  }
  return `${model.providerID}/${model.model}`;
}

export function globalDirectory(): string {
  return resolveOC2Roots(process.env, homedir()).config;
}

function object(value: unknown): value is Settings {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function mergeSettings(base: Settings, extra: Settings): Settings {
  const result = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Invalid configuration key');
    // A model selection is one value: deep-merging providerID/model/variant
    // across tiers can invent a variant the higher tier deliberately omitted.
    if (key === 'model' && object(value)) {
      result[key] = value;
      continue;
    }
    result[key] = object(value) && object(result[key]) ? mergeSettings(result[key], value) : value;
  }
  return result;
}

function rejectForbiddenKeys(value: unknown): void {
  // Rules and other V2 settings are arrays; recurse through them as well.
  if (Array.isArray(value)) {
    for (const child of value) rejectForbiddenKeys(child);
    return;
  }
  if (!object(value)) return;
  // A top-level "__proto__" key parsed by assignment mutates the prototype instead of creating an own key.
  if (Object.getPrototypeOf(value) !== Object.prototype) throw new Error('Invalid configuration key');
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Invalid configuration key');
    rejectForbiddenKeys(child);
  }
}

function validateNativeModel(value: unknown, label: string): void {
  if (value === undefined) return;
  if (typeof value === 'string') {
    if (!value.trim()) throw new Error(`Invalid agent model: ${label}`);
    return;
  }
  if (!object(value) || typeof value.providerID !== 'string' || !value.providerID.trim()
    || typeof value.model !== 'string' || !value.model.trim()
    || (value.variant !== undefined && (typeof value.variant !== 'string' || !value.variant.trim()))) {
    throw new Error(`Invalid agent model: ${label}`);
  }
}

function validateNativePermissions(value: unknown, label: string): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some(rule => !object(rule)
    || typeof rule.action !== 'string' || !rule.action.trim()
    || typeof rule.resource !== 'string' || !rule.resource.trim()
    || (rule.effect !== 'allow' && rule.effect !== 'deny' && rule.effect !== 'ask'))) {
    throw new Error(`Invalid agent permission: ${label}`);
  }
}

function validateNativeAgent(settings: Settings, label: string): void {
  validateNativeModel(settings.model, label);
  validateNativePermissions(settings.permissions, label);
}

function validateAgentFile(settings: Settings, label: string): void {
  validateNativeModel(settings.model, label);
  validateNativePermissions(settings.permissions, label);
  if (settings.mode !== undefined && !['primary', 'subagent', 'all'].includes(settings.mode)) {
    throw new Error(`Invalid agent mode: ${label}`);
  }
}

export function readSettings(file: string): Settings {
  if (!existsSync(file)) return {};
  const errors: ParseError[] = [];
  const data = parseJsonc(readFileSync(file, 'utf8'), errors, { allowTrailingComma: true });
  if (errors.length || !object(data)) throw new Error(`Invalid OpenCode configuration: ${file}`);
  rejectForbiddenKeys(data);
  if (data.agents !== undefined) {
    if (!object(data.agents)) throw new Error(`Invalid agent configuration: ${file}`);
    for (const [name, settings] of Object.entries(data.agents)) {
      if (!object(settings)) throw new Error(`Invalid agent configuration: ${name}`);
      validateNativeAgent(settings, name);
    }
  }
  return data;
}

function configFiles(directory: string, global = false): string[] {
  const candidates = global
    ? ['opencode.json', 'opencode.jsonc']
    : ['opencode.json', 'opencode.jsonc', '.opencode/opencode.json', '.opencode/opencode.jsonc'];
  return candidates.map(file => join(directory, file)).filter(existsSync);
}

/**
 * Discover every config file that applies to a project, lowest precedence
 * first: global, then ancestor directories from outermost to innermost, then
 * the project directory itself. V1's `config.json` is never a candidate.
 */
export function discoverConfigTiers(project: string, global: string): ConfigTier[] {
  const files = (directory: string, scope: ConfigTier['scope']): ConfigTier[] => {
    const names = scope === 'global'
      ? ['opencode.json', 'opencode.jsonc']
      : ['opencode.json', 'opencode.jsonc', '.opencode/opencode.json', '.opencode/opencode.jsonc'];
    return names.map(name => join(directory, name)).filter(existsSync)
      .map(file => ({ file, scope, directory: dirname(file) }));
  };

  const result = files(global, 'global');
  const projectRoot = resolve(project);
  const globalRoot = resolve(global);
  const chain: string[] = [];
  let current = projectRoot;
  for (;;) {
    chain.push(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  for (const directory of chain.reverse()) {
    if (directory === globalRoot) continue;
    result.push(...files(directory, directory === projectRoot ? 'project' : 'ancestor'));
  }
  return result;
}


export function readOpenCodeSettings(directory: string, global = false): Settings {
  return configFiles(directory, global).reduce((data, file) => mergeSettings(data, readSettings(file)), {});
}

function configTarget(directory: string, global = false): string {
  return configFiles(directory, global).slice(-1)[0] || join(directory, 'opencode.jsonc');
}

function writeAtomic(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, content, { mode: existsSync(file) ? statSync(file).mode & 0o777 : 0o600 });
    renameSync(temp, file);
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
  }
}

function patchValue(text: string, path: string[], value: any): string {
  let current = parseJsonc(text);
  for (const key of path) current = current?.[key];
  if (JSON.stringify(current) === JSON.stringify(value)) return text;
  // A model selection is replaced as a whole so a stale variant cannot survive.
  if (path.at(-1) !== 'model' && object(current) && object(value)) {
    for (const [key, child] of Object.entries(value)) text = patchValue(text, [...path, key], child);
    return text;
  }
  return applyEdits(text, modify(text, path, value, {
    formattingOptions: { insertSpaces: true, tabSize: 2 },
  }));
}

function patchAgents(file: string, agents: Settings, remove = false): void {
  readSettings(file); // Validate before modifying.
  let text = existsSync(file) ? readFileSync(file, 'utf8') : '{\n  "$schema": "https://opencode.ai/config.json"\n}\n';
  for (const [name, agent] of Object.entries(agents)) {
    text = patchValue(text, ['agents', name], remove ? undefined : agent);
  }
  if (!existsSync(file) || text !== readFileSync(file, 'utf8')) writeAtomic(file, text);
}

export type ModelScope = 'global' | 'project';
export interface ModelContext {
  projectDirectory: string;
  globalConfigDirectory: string;
}
export interface AgentModelRow {
  name: string;
  model?: string;
  inherited: boolean;
  projectOverride?: string;
}
export interface ModelSaveResult {
  file: string;
  projectOverride?: string;
}

function validateModelScope(scope: ModelScope): void {
  if (scope !== 'global' && scope !== 'project') throw new Error('Ungültiger Geltungsbereich.');
}

// The menu functions can be called with explicit directories (TUI sends the
// env-derived config dir). Refuse overlapping scopes before reading or writing
// either one.
function assertContextTargets(context: ModelContext): void {
  const config = canonicalPath(context.globalConfigDirectory);
  const project = canonicalPath(context.projectDirectory);
  if (pathsOverlap(config, project)) {
    throw new Error('Refusing to modify overlapping OpenCode configuration directories.');
  }
}

function selectionString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (!object(value)) return undefined;
  try {
    return formatModelID(value as ModelSelection);
  } catch {
    return undefined;
  }
}

function agentModelString(settings: Settings, name: string): string | undefined {
  return selectionString(settings.agents?.[name]?.model);
}

function topModelString(settings: Settings): string | undefined {
  return selectionString(settings.model);
}

function tierSettings(project: string, global: string): Record<ConfigTier['scope'], Settings> {
  const tiers = discoverConfigTiers(project, global);
  return {
    global: tiers.filter(tier => tier.scope === 'global')
      .reduce((data, tier) => mergeSettings(data, readSettings(tier.file)), {}),
    ancestor: tiers.filter(tier => tier.scope === 'ancestor')
      .reduce((data, tier) => mergeSettings(data, readSettings(tier.file)), {}),
    project: tiers.filter(tier => tier.scope === 'project')
      .reduce((data, tier) => mergeSettings(data, readSettings(tier.file)), {}),
  };
}

export function listAgentModels(scope: ModelScope, context: ModelContext): AgentModelRow[] {
  validateModelScope(scope);
  assertContextTargets(context);
  const tiers = tierSettings(context.projectDirectory, context.globalConfigDirectory);
  const defaultModel = topModelString(tiers.project) ?? topModelString(tiers.ancestor) ?? topModelString(tiers.global);
  return AGENT_NAMES.map(name => {
    const globalModel = agentModelString(tiers.global, name);
    const projectModel = agentModelString(tiers.project, name);
    return {
      name,
      model: scope === 'global'
        ? globalModel ?? topModelString(tiers.global)
        : projectModel ?? agentModelString(tiers.ancestor, name) ?? globalModel ?? defaultModel,
      inherited: scope === 'global' ? globalModel === undefined : projectModel === undefined,
      projectOverride: projectModel,
    };
  });
}

export function setAgentModel(scope: ModelScope, agent: string, model: string,
  availableModels: readonly string[], context: ModelContext): ModelSaveResult {
  validateModelScope(scope);
  if (!AGENT_NAMES.includes(agent)) throw new Error('Ungültiger Kiki-Agent.');
  if (!model || !availableModels.includes(model)) throw new Error('Das ausgewählte Modell ist nicht verfügbar.');
  assertContextTargets(context);
  const selection = parseModelID(model);
  // Re-read rather than persisting the configuration snapshot shown in the menu.
  const row = listAgentModels(scope, context).find(item => item.name === agent)!;
  const file = configTarget(scope === 'global' ? context.globalConfigDirectory : context.projectDirectory, scope === 'global');
  patchAgents(file, { [agent]: { model: selection } });
  return { file, ...(scope === 'global' && row.projectOverride ? { projectOverride: row.projectOverride } : {}) };
}

export interface ModelRemoveResult {
  file: string;
  removed?: string;
  effective?: string;
}
export interface ModelRemoveAllResult {
  files: string[];
  removed: { agent: string; model: string }[];
}

// Removes agents.<name>.model from one config file, dropping the whole agent
// entry when nothing else remains. Comments and other keys are preserved.
function patchAgentModel(file: string, agent: string): void {
  readSettings(file); // Validate before modifying.
  if (!existsSync(file)) return;
  const before = readFileSync(file, 'utf8');
  let text = patchValue(before, ['agents', agent, 'model'], undefined);
  const current = parseJsonc(text)?.agents?.[agent];
  if (object(current) && Object.keys(current).length === 0) text = patchValue(text, ['agents', agent], undefined);
  if (text !== before) writeAtomic(file, text);
}

export function removeAgentModel(scope: ModelScope, agent: string, context: ModelContext): ModelRemoveResult {
  validateModelScope(scope);
  if (!AGENT_NAMES.includes(agent)) throw new Error('Ungültiger Kiki-Agent.');
  assertContextTargets(context);
  // Validate both scopes before changing any file.
  const global = readOpenCodeSettings(context.globalConfigDirectory, true);
  const project = readOpenCodeSettings(context.projectDirectory);
  const directory = scope === 'global' ? context.globalConfigDirectory : context.projectDirectory;
  // Only remove keys owned by the selected scope; ancestor-owned config is never touched.
  const files = configFiles(directory, scope === 'global');
  const removed = selectionString((scope === 'global' ? global : project).agents?.[agent]?.model);
  if (removed !== undefined) for (const file of files) patchAgentModel(file, agent);
  const tiers = tierSettings(context.projectDirectory, context.globalConfigDirectory);
  const effective = scope === 'project'
    ? agentModelString(tiers.project, agent) ?? agentModelString(tiers.ancestor, agent)
      ?? agentModelString(tiers.global, agent)
      ?? topModelString(tiers.project) ?? topModelString(tiers.ancestor) ?? topModelString(tiers.global)
    : topModelString(tiers.global);
  return { file: files.at(-1) ?? configTarget(directory, scope === 'global'), removed, effective };
}

export function removeAllProjectModels(context: ModelContext): ModelRemoveAllResult {
  assertContextTargets(context);
  const files = configFiles(context.projectDirectory);
  for (const file of files) readSettings(file); // Validate everything before changing any file.
  const changed: string[] = [];
  const removed: { agent: string; model: string }[] = [];
  for (const file of files) {
    for (const name of AGENT_NAMES) {
      const model = selectionString(readSettings(file).agents?.[name]?.model);
      if (model === undefined) continue;
      patchAgentModel(file, name);
      removed.push({ agent: name, model });
      if (!changed.includes(file)) changed.push(file);
    }
  }
  return { files: changed, removed };
}

export function parseAgent(text: string, label: string): { settings: Settings; prompt: string } {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) throw new Error(`Invalid agent frontmatter: ${label}`);
  const settings = parseYaml(match[1], { uniqueKeys: false });
  if (!object(settings) || (settings.permission !== undefined && !object(settings.permission))) {
    throw new Error(`Invalid agent settings: ${label}`);
  }
  validateAgentFile(settings, label);
  return { settings, prompt: match[2] };
}

export function baselineAgents(config: KikiConfig = DEFAULT_CONFIG): Record<string, { settings: Settings; prompt: string }> {
  const templates = generateAllTemplates(config);
  const permissions = generateAgentPermissions(config);
  const keys = ['orchestrator', 'brainstormer', 'planner', 'implementer', 'guiDesigner', 'reviewer', 'escalation', 'historian'] as const;
  return Object.fromEntries(AGENT_NAMES.map((name, i) => {
    const parsed = parseAgent(templates[keys[i]], name);
    // Markdown is prompt-only; the canonical arrays are persisted separately in
    // the global config but remain available to internal consumers here.
    return [name, { settings: { ...parsed.settings, permissions: permissions[name] }, prompt: parsed.prompt }];
  }));
}

const PROJECT_CONFIG_POINTER = '\n\n## Project configuration\nRead `.agentic/kiki/config.json` when present. Its paths and commands describe this project; use them instead of the default paths in these instructions. Models and permissions are configured natively in OpenCode.\n';

function backup(files: string[], directory: string): string | undefined {
  const existing = [...new Set(files.filter(existsSync))];
  if (!existing.length) return undefined;
  const target = join(directory, randomUUID());
  mkdirSync(target, { recursive: true, mode: 0o700 });
  writeFileSync(join(directory, '.gitignore'), '*\n', { mode: 0o600 });
  // Restrictive modes because OpenCode configuration can contain provider settings.
  for (const [i, file] of existing.entries()) writeFileSync(join(target, `${i}-${file.split(/[\\/]/).pop()}`), readFileSync(file), { mode: 0o600 });
  writeFileSync(join(target, 'manifest.json'), JSON.stringify(existing, null, 2), { mode: 0o600 });
  return target;
}

function nativeAgentFile(directory: string, name: string): string {
  return join(directory, 'agents', `${name}.md`);
}

function renderAgentFile(settings: Settings, prompt: string): string {
  const frontmatter = stringifyYaml(settings, { lineWidth: 0 }).trimEnd();
  return `---\n${frontmatter}\n---\n${prompt}`;
}

function withProjectConfigPointer(prompt: string): string {
  const behavior = prompt.indexOf('## Kiki baseline behavior (v1)');
  const permission = prompt.indexOf('## Kiki managed permission requests (v1)');
  // Keep both managed sections intact: insert before the behavior section when
  // present so the behavior section stays immediately before the permission
  // tail, and fall back to the permission heading otherwise.
  const index = behavior >= 0 && (permission < 0 || behavior < permission) ? behavior : permission;
  if (index < 0) return prompt + PROJECT_CONFIG_POINTER;
  const head = prompt.slice(0, index).replace(/\n+$/, '\n\n');
  return `${head}${PROJECT_CONFIG_POINTER.trim()}\n\n${prompt.slice(index)}`;
}

function nativeAgentContent(name: string, existingText?: string): string {
  const baseline = baselineAgents()[name];
  if (existingText !== undefined) {
    // This permission round deliberately does not refresh prompt, description or
    // mode bytes; it strips only the permission fields from the markdown. The
    // canonical arrays live in the global config.
    const existing = parseAgent(existingText, name);
    const settings: Settings = { ...existing.settings };
    delete settings.model;
    delete settings.permissions;
    delete settings.permission;
    return renderAgentFile(settings, withBaselineBehaviorPrompt(
      withPermissionRequestPrompt(existing.prompt), name,
    ));
  }
  const settings: Settings = { ...baseline.settings };
  delete settings.model;
  delete settings.permissions;
  delete settings.permission;
  return renderAgentFile(settings, withBaselineBehaviorPrompt(
    withPermissionRequestPrompt(withProjectConfigPointer(baseline.prompt)), name,
  ));
}

interface FileSnapshot {
  file: string;
  existed: boolean;
  content?: Buffer;
  mode?: number;
}

function snapshotFiles(files: string[]): FileSnapshot[] {
  return [...new Set(files)].map(file => {
    const existed = existsSync(file);
    return {
      file,
      existed,
      ...(existed ? { content: readFileSync(file), mode: statSync(file).mode & 0o777 } : {}),
    };
  });
}

function restoreFiles(snapshots: FileSnapshot[]): string[] {
  const failures: string[] = [];
  for (const snapshot of [...snapshots].reverse()) {
    try {
      if (snapshot.existed) {
        mkdirSync(dirname(snapshot.file), { recursive: true });
        writeFileSync(snapshot.file, snapshot.content!, { mode: snapshot.mode });
        chmodSync(snapshot.file, snapshot.mode!);
      } else if (existsSync(snapshot.file)) {
        unlinkSync(snapshot.file);
      }
    } catch (error) {
      failures.push(`${snapshot.file}: ${error instanceof Error ? error.message : 'restore failed'}`);
    }
  }
  return failures;
}

/** Focused transaction interfaces for the scoped project permission writer. */
export function backupConfigFiles(files: string[], directory: string): string | undefined {
  return backup(files, directory);
}

export function snapshotConfigFiles(files: string[]): FileSnapshot[] {
  return snapshotFiles(files);
}

export function restoreConfigFiles(snapshots: FileSnapshot[]): string[] {
  return restoreFiles(snapshots);
}

export function writeConfigAtomic(file: string, content: string): void {
  writeAtomic(file, content);
}

/** Write (or remove, with undefined) one agent's permission field, preserving JSONC. */
export function patchAgentPermissions(
  file: string, agent: string, rules: PermissionRule[] | undefined,
): void {
  readSettings(file); // Validate before modifying.
  const before = existsSync(file) ? readFileSync(file, 'utf8') : '{\n  "$schema": "https://opencode.ai/config.json"\n}\n';
  const text = patchValue(before, ['agents', agent, 'permissions'], rules);
  if (!existsSync(file) || text !== before) writeAtomic(file, text);
}

export function duplicateAgentConfigKeys(file: string): string[] {
  return duplicateConfigKeys(file);
}

export function permissionArrayHasComments(file: string, agent: string): boolean {
  return hasInnerArrayComments(file, agent);
}

export type { FileSnapshot };

function duplicateConfigKeys(file: string): string[] {
  const tree = parseTree(readFileSync(file, 'utf8'));
  if (!tree) return [];
  const duplicates: string[] = [];
  const walk = (node: Node | undefined, path: string[]): void => {
    if (!node || node.type !== 'object' || !node.children) return;
    const seen = new Set<string>();
    for (const property of node.children) {
      const key = String(property.children?.[0]?.value ?? '');
      if (key) {
        if (seen.has(key)) duplicates.push([...path, key].join('.'));
        seen.add(key);
      }
      walk(property.children?.[1], key ? [...path, key] : path);
    }
  };
  walk(tree, []);
  // Only the agent map and its direct fields are relevant here; a duplicate
  // scalar elsewhere is unrelated user data.
  return [...new Set(duplicates.filter(path => path.split('.')[0] === 'agents'))];
}

function assertUniqueAgentKeys(text: string, label: string): void {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error(`Invalid agent frontmatter: ${label}`);
  try {
    parseYaml(match[1], { uniqueKeys: true });
  } catch {
    throw new Error(`Ambiguous agent frontmatter (duplicate keys): ${label}`);
  }
}

const MANAGED_MARKERS = {
  permissions: {
    begin: '/* kiki managed permissions begin */',
    end: '/* kiki managed permissions end */',
  },
  policies: {
    begin: '/* kiki managed policies begin */',
    end: '/* kiki managed policies end */',
  },
} as const;

type ManagedKind = keyof typeof MANAGED_MARKERS;

interface ManagedFragmentPlan {
  text: string;
  permissions: PermissionRule[];
  policies: PermissionRule[];
}

interface CommentToken {
  start: number;
  end: number;
  text: string;
}

/** Comment tokens outside string literals, offsets relative to `text`. */
function scanComments(text: string): CommentToken[] {
  const tokens: CommentToken[] = [];
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '/' && text[index + 1] === '/') {
      const end = text.indexOf('\n', index + 2);
      const stop = end < 0 ? text.length : end;
      tokens.push({ start: index, end: stop, text: text.slice(index, stop) });
      index = stop - 1;
    } else if (char === '/' && text[index + 1] === '*') {
      const end = text.indexOf('*/', index + 2);
      if (end < 0) throw new Error('Malformed JSONC comment.');
      const stop = end + 2;
      tokens.push({ start: index, end: stop, text: text.slice(index, stop) });
      index = stop - 1;
    }
  }
  return tokens;
}

function withoutComments(text: string): string {
  const chars = [...text];
  for (const token of scanComments(text)) {
    for (let index = token.start; index < token.end; index++) chars[index] = ' ';
  }
  return chars.join('');
}

function hasCommaOutsideComments(text: string): boolean {
  return withoutComments(text).includes(',');
}

function duplicateObjectKeyPaths(text: string): string[] {
  const tree = parseTree(text);
  if (!tree) return [];
  const duplicates: string[] = [];
  const walk = (node: Node | undefined, path: string): void => {
    if (!node) return;
    if (node.type === 'object' && node.children) {
      const seen = new Set<string>();
      for (const property of node.children) {
        const key = String(property.children?.[0]?.value ?? '');
        if (key && seen.has(key)) duplicates.push(path ? `${path}.${key}` : key);
        seen.add(key);
        walk(property.children?.[1], path ? `${path}.${key}` : key);
      }
      return;
    }
    if (node.type === 'array' && node.children) {
      node.children.forEach((child, index) => walk(child, `${path}[${index}]`));
    }
  };
  walk(tree, '');
  return [...new Set(duplicates)];
}

function parseManagedRoot(text: string, file: string): Node {
  const errors: ParseError[] = [];
  const tree = parseTree(text, errors, { allowTrailingComma: true, disallowComments: false });
  if (!tree || errors.length || tree.type !== 'object') {
    throw new Error(`Invalid OpenCode configuration: ${file}`);
  }
  return tree;
}

function managedArrayNode(tree: Node, kind: ManagedKind, file: string): Node | undefined {
  const properties = (tree.children ?? []).filter(property => property.children?.[0]?.value === kind);
  if (properties.length > 1) {
    throw new Error(`Ambiguous OpenCode configuration (duplicate top-level ${kind}): ${file}`);
  }
  const value = properties[0]?.children?.[1];
  if (value !== undefined && value.type !== 'array') {
    throw new Error(`Invalid top-level ${kind} (expected an array): ${file}`);
  }
  return value;
}

function sameManagedRule(value: unknown, expected: PermissionRule): boolean {
  if (!object(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === 3 && keys[0] === 'action' && keys[1] === 'effect' && keys[2] === 'resource'
    && value.action === expected.action
    && value.resource === expected.resource
    && value.effect === expected.effect;
}

function managedDrift(
  kind: ManagedKind, file: string, expected: PermissionRule[], observed: unknown,
): Error {
  return new Error(
    `Modified managed ${kind} fragment: ${file}: top-level ${kind} array. `
    + `Expected ${expected.length} exact ordered rules ${JSON.stringify(expected)}; `
    + `observed ${JSON.stringify(observed)}.`,
  );
}

function inspectManagedBlock(
  inner: string,
  kind: ManagedKind,
  expected: PermissionRule[],
  file: string,
): { present: false } | {
  present: true;
  beginStart: number;
  endEnd: number;
} {
  const comments = scanComments(inner);
  const otherKind: ManagedKind = kind === 'permissions' ? 'policies' : 'permissions';
  const foreign = comments.filter(comment =>
    Object.values(MANAGED_MARKERS[otherKind]).some(marker => marker === comment.text));
  if (foreign.length) {
    throw new Error(`Ambiguous managed ${kind} markers in ${file}: top-level ${kind} array contains ${otherKind} markers.`);
  }
  const begin = comments.filter(comment => comment.text === MANAGED_MARKERS[kind].begin);
  const end = comments.filter(comment => comment.text === MANAGED_MARKERS[kind].end);
  if (begin.length === 0 && end.length === 0) return { present: false };
  if (begin.length !== 1 || end.length !== 1) {
    throw new Error(
      `Modified or ambiguous managed ${kind} markers: ${file}: top-level ${kind} array. `
      + `Expected exactly one begin and one end marker; observed ${begin.length} begin and ${end.length} end.`,
    );
  }
  if (begin[0].start >= end[0].start) {
    throw new Error(`Modified managed ${kind} markers: ${file}: top-level ${kind} array has end before begin.`);
  }
  const enclosed = inner.slice(begin[0].end, end[0].start);
  if (scanComments(enclosed).length) {
    throw new Error(`Modified managed ${kind} fragment: ${file}: top-level ${kind} array contains an unexpected comment inside the managed block.`);
  }
  const duplicateKeys = duplicateObjectKeyPaths(`[${enclosed}]`);
  if (duplicateKeys.length) {
    throw new Error(`Ambiguous managed ${kind} fragment: ${file}: duplicate keys ${duplicateKeys.join(', ')}.`);
  }
  const errors: ParseError[] = [];
  const parsed = parseJsonc(`[${enclosed}]`, errors, { allowTrailingComma: true }) as unknown;
  if (errors.length || !Array.isArray(parsed)) {
    throw managedDrift(kind, file, expected, parsed);
  }
  const exact = parsed.length === expected.length
    && parsed.every((rule, index) => sameManagedRule(rule, expected[index]));
  if (!exact) throw managedDrift(kind, file, expected, parsed);
  return { present: true, beginStart: begin[0].start, endEnd: end[0].end };
}

function managedRuleText(rule: PermissionRule): string {
  return `{ "action": ${JSON.stringify(rule.action)}, "resource": ${JSON.stringify(rule.resource)}, "effect": ${JSON.stringify(rule.effect)} }`;
}

function managedBlockLines(entries: PermissionRule[], kind: ManagedKind): string[] {
  const lines = [`    ${MANAGED_MARKERS[kind].begin}`];
  entries.forEach((rule, index) => {
    lines.push(`    ${managedRuleText(rule)}${index < entries.length - 1 ? ',' : ''}`);
  });
  lines.push(`    ${MANAGED_MARKERS[kind].end}`);
  return lines;
}

/**
 * Append the canonical marked block after every existing array item. Existing
 * user bytes (entries, comments and extra policy fields) are copied verbatim;
 * only the managed block and the separating comma are inserted.
 */
function appendManagedBlock(inner: string, entries: PermissionRule[], kind: ManagedKind, file: string): string {
  const base = inner.replace(/[ \t\r\n]+$/, '');
  const errors: ParseError[] = [];
  // Keep a newline before the closing bracket so a trailing line comment in
  // `base` cannot swallow it in this validation parse.
  const arrayTree = parseTree(`[${base}\n]`, errors, { allowTrailingComma: true, disallowComments: false });
  if (!arrayTree || errors.length) throw new Error(`Invalid OpenCode configuration: ${file}`);
  const elements = arrayTree.children ?? [];
  let insertion = base;
  if (elements.length) {
    const last = elements[elements.length - 1];
    const lastEnd = last.offset - 1 + last.length;
    const tail = base.slice(lastEnd);
    if (!hasCommaOutsideComments(tail)) {
      insertion = `${base.slice(0, lastEnd)},${base.slice(lastEnd)}`;
    }
  }
  return `${insertion}\n${managedBlockLines(entries, kind).join('\n')}\n  `;
}

function createManagedArrayProperty(text: string, entries: PermissionRule[], kind: ManagedKind, file: string): string {
  let result = text;
  const selectRoot = (): Node => parseManagedRoot(result, file);
  let root = selectRoot();
  const compact = (root.children ?? []).at(-1);
  if (compact) {
    const rootClose = root.offset + root.length - 1;
    const between = result.slice(compact.offset + compact.length, rootClose);
    if (!hasCommaOutsideComments(between)) {
      const at = compact.offset + compact.length;
      result = `${result.slice(0, at)},${result.slice(at)}`;
      root = selectRoot();
    }
  }
  const close = root.offset + root.length - 1;
  const before = result.slice(0, close).replace(/[ \t\r\n]+$/, '');
  return `${before}\n  "${kind}": [\n${managedBlockLines(entries, kind).join('\n')}\n  ]\n${result.slice(close)}`;
}

function planManagedArray(text: string, kind: ManagedKind, file: string): string {
  const expected = kind === 'permissions' ? generateGlobalPermissions() : generateSecretPolicies();
  const tree = parseManagedRoot(text, file);
  const node = managedArrayNode(tree, kind, file);
  if (!node) return createManagedArrayProperty(text, expected, kind, file);
  const start = node.offset + 1;
  const end = node.offset + node.length - 1;
  const inner = text.slice(start, end);
  const inspected = inspectManagedBlock(inner, kind, expected, file);
  let nextInner: string;
  if (!inspected.present) {
    nextInner = appendManagedBlock(inner, expected, kind, file);
  } else {
    const after = inner.slice(inspected.endEnd);
    const afterArray = parseTree(`[${inner}]`, undefined, { allowTrailingComma: true, disallowComments: false });
    const followingElement = (afterArray?.children ?? []).some(child => child.offset - 1 >= inspected.endEnd);
    if (!followingElement) {
      // Already the final block: byte-stable no-op, even if the generated
      // whitespace differs from the canonical form.
      return text;
    }
    const following = after.match(/^\s*,/);
    if (!following) {
      throw new Error(`Ambiguous managed ${kind} fragment: ${file}: unexpected content after the end marker.`);
    }
    const withoutBlock = inner.slice(0, inspected.beginStart) + after.slice(following[0].length);
    nextInner = appendManagedBlock(withoutBlock, expected, kind, file);
  }
  return `${text.slice(0, start)}${nextInner}${text.slice(end)}`;
}

/**
 * Plan the two fixed managed top-level fragments. It consumes Task 3's
 * generators, refuses modified/ambiguous markers or duplicate keys, preserves
 * every user span verbatim, and returns the expected whole arrays for the
 * installer's reread verification. Pure: reads no file and mutates nothing.
 */
function planManagedGlobalFragments(text: string, file: string): ManagedFragmentPlan {
  const source = text.trim()
    ? text
    : '{\n  "$schema": "https://opencode.ai/config.json"\n}\n';
  let planned = planManagedArray(source, 'permissions', file);
  planned = planManagedArray(planned, 'policies', file);
  const errors: ParseError[] = [];
  const data = parseJsonc(planned, errors, { allowTrailingComma: true });
  if (errors.length || !object(data)
    || !Array.isArray(data.permissions) || !Array.isArray(data.policies)) {
    throw new Error(`Invalid OpenCode configuration: ${file}`);
  }
  return {
    text: planned,
    permissions: data.permissions as PermissionRule[],
    policies: data.policies as PermissionRule[],
  };
}

interface AgentFileState {
  sources: PermissionSource[];
  markdownFile?: string;
  markdownText?: string;
  hasNative: boolean;
  commentFiles: string[];
}

function hasInnerArrayComments(file: string, name: string): boolean {
  const text = readFileSync(file, 'utf8');
  const tree = parseTree(text);
  if (!tree) return false;
  const node = findNodeAtLocation(tree, ['agents', name, 'permissions']);
  if (!node) return false;
  const slice = text.slice(node.offset, node.offset + node.length);
  // Detect real comments, not comment-like characters inside string literals
  // such as a `/**` resource glob.
  let inString = false;
  let escaped = false;
  for (let index = 0; index < slice.length; index++) {
    const char = slice[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '/' && (slice[index + 1] === '/' || slice[index + 1] === '*')) {
      return true;
    }
  }
  return false;
}

function collectAgentSources(directory: string, name: string): AgentFileState {
  const sources: PermissionSource[] = [];
  const commentFiles: string[] = [];
  for (const file of configFiles(directory, true)) {
    const settings = readSettings(file);
    const rules = settings.agents?.[name]?.permissions;
    if (rules !== undefined) {
      sources.push({ file, rules: rules as PermissionRule[] });
      if (hasInnerArrayComments(file, name)) commentFiles.push(file);
    }
  }
  const native = nativeAgentFile(directory, name);
  const hasNative = existsSync(native);
  const markdownFile = hasNative ? native : undefined;
  let markdownText: string | undefined;
  if (markdownFile) {
    markdownText = readFileSync(markdownFile, 'utf8');
    assertUniqueAgentKeys(markdownText, name);
    const { settings } = parseAgent(markdownText, name);
    // Markdown permission blocks are a real classification source: exact known
    // defaults are replaceable, and every unknown rule is preserved as a custom
    // for every effect.
    if (settings.permissions !== undefined) {
      sources.push({ file: markdownFile, rules: settings.permissions as PermissionRule[] });
    }
  }
  return {
    sources,
    markdownFile,
    markdownText,
    hasNative,
    commentFiles,
  };
}

function removeAgentPermissions(file: string, names: string[]): boolean {
  if (!existsSync(file)) return false;
  const before = readFileSync(file, 'utf8');
  let text = before;
  for (const name of names) {
    if (parseJsonc(text)?.agents?.[name]?.permissions !== undefined) {
      text = patchValue(text, ['agents', name, 'permissions'], undefined);
    }
  }
  if (text !== before) writeAtomic(file, text);
  return text !== before;
}

export function installGlobalFiles(directory = globalDirectory(), update = false): void {
  // Validate malformed tiers before any write.
  const configs = configFiles(directory, true);
  for (const file of configs) {
    readSettings(file);
    const duplicateKeys = duplicateConfigKeys(file);
    if (duplicateKeys.length) {
      throw new Error(
        `Ambiguous OpenCode configuration (duplicate agent keys): ${file}: ${duplicateKeys.join(', ')}`,
      );
    }
  }
  const registration = prepareRegistration(directory, currentPackageSpec());
  const canonical = generateAgentPermissions(DEFAULT_CONFIG);
  const targetFile = configTarget(directory, true);
  const targetSettings = existsSync(targetFile) ? readSettings(targetFile) : {};
  const targetText = existsSync(targetFile) ? readFileSync(targetFile, 'utf8') : '';
  // Preflight before registration mutation and backup: modified or ambiguous
  // managed fragments stop here without writing anything.
  const fragmentPlan = planManagedGlobalFragments(targetText, targetFile);
  const states = new Map<string, AgentFileState>();
  const targets: Settings = {};
  const report: string[] = [];
  for (const name of AGENT_NAMES) {
    const state = collectAgentSources(directory, name);
    states.set(name, state);
    const classification = classifyPermissionSources(name, canonical[name], state.sources);
    for (const entry of classification.entries) {
      report.push(`  [${entry.kind}] ${entry.file}: ${entry.rule.action} ${entry.rule.resource} ${entry.rule.effect}`);
    }
    const { prefix, tail } = splitSecretTail(canonical[name]);
    targets[name] = { permissions: [...prefix, ...classification.customs, ...tail] };
  }
  console.log('Kiki permission plan (verbatim):');
  console.log(report.length ? report.join('\n') : '  (no existing permission rules)');

  const writes: { file: string; content: string }[] = [];
  for (const name of AGENT_NAMES) {
    const state = states.get(name)!;
    const native = nativeAgentFile(directory, name);
    const content = nativeAgentContent(name, state.markdownText);
    if (!state.hasNative || readFileSync(native, 'utf8') !== content) {
      writes.push({ file: native, content });
    }
  }
  const workflow = join(directory, 'kiki/agentic-workflow.md');
  const workflowContent = generateAllTemplates(DEFAULT_CONFIG).workflow;
  if (!existsSync(workflow) || readFileSync(workflow, 'utf8') !== workflowContent) {
    writes.push({ file: workflow, content: workflowContent });
  }

  let needsChange = registration.files.length > 0 || writes.length > 0
    || fragmentPlan.text !== targetText;
  for (const name of AGENT_NAMES) {
    if (JSON.stringify(targetSettings.agents?.[name]?.permissions)
      !== JSON.stringify(targets[name].permissions)) {
      needsChange = true;
    }
  }
  for (const file of configs) {
    if (file === targetFile) continue;
    const settings = readSettings(file);
    for (const name of AGENT_NAMES) {
      if (settings.agents?.[name]?.permissions !== undefined) {
        needsChange = true;
      }
    }
  }

  // Fail closed instead of silently losing comments inside a permissions array
  // that would be replaced or removed.
  for (const name of AGENT_NAMES) {
    const state = states.get(name)!;
    const targetChanged = JSON.stringify(targetSettings.agents?.[name]?.permissions)
      !== JSON.stringify(targets[name].permissions);
    const otherRemoval = configs.some(file =>
      file !== targetFile && readSettings(file).agents?.[name]?.permissions !== undefined);
    if (state.commentFiles.length && (targetChanged || otherRemoval)) {
      throw new Error(
        `Refusing to update ${name}: comments inside an existing permissions array would be lost. Move them outside the array: ${state.commentFiles.join(', ')}`,
      );
    }
  }

  if (!needsChange) {
    console.log(`Kiki ${update ? 'updated' : 'installed'} globally in ${directory}. Restart OpenCode to load it.`);
    console.log('Agent models: set them with the /kiki command in OpenCode (or edit agents.<name>.model in opencode.json).');
    return;
  }

  const touched = [...new Set([
    ...configs,
    targetFile,
    ...registration.files,
    ...writes.map(write => write.file),
    ...AGENT_NAMES.map(name => states.get(name)!.markdownFile).filter((file): file is string => !!file),
  ])];
  const backupDirectory = backup(touched.filter(existsSync), join(directory, 'kiki/backups'));
  const configSnapshots = snapshotFiles(touched);

  try {
    // Registration first: captured server-config text cannot overwrite the
    // permission arrays persisted afterwards.
    registration.apply();
    patchAgents(targetFile, targets);
    for (const file of configFiles(directory, true)) {
      if (file !== targetFile) removeAgentPermissions(file, [...AGENT_NAMES]);
    }
    // Apply the managed fragments to freshly read text so registration's
    // captured server-config text cannot overwrite them. Re-planning uses the
    // same canonical generators and refuses any concurrent marker drift.
    const freshText = existsSync(targetFile) ? readFileSync(targetFile, 'utf8') : '';
    const appliedFragments = planManagedGlobalFragments(freshText, targetFile);
    if (appliedFragments.text !== freshText) writeAtomic(targetFile, appliedFragments.text);
    // Verify both top-level arrays and every role array by re-read before
    // stripping any markdown.
    const verified = readSettings(targetFile);
    for (const name of AGENT_NAMES) {
      if (JSON.stringify(verified.agents?.[name]?.permissions)
        !== JSON.stringify(targets[name].permissions)) {
        throw new Error(`Permission persistence verification failed for ${name}.`);
      }
    }
    if (JSON.stringify(verified.permissions) !== JSON.stringify(appliedFragments.permissions)) {
      throw new Error('Managed top-level permissions verification failed.');
    }
    if (JSON.stringify(verified.policies) !== JSON.stringify(appliedFragments.policies)) {
      throw new Error('Managed top-level policies verification failed.');
    }
    for (const write of writes) writeAtomic(write.file, write.content);
    for (const name of AGENT_NAMES) {
      const settings = parseAgent(readFileSync(nativeAgentFile(directory, name), 'utf8'), name).settings;
      if (settings.permissions !== undefined) {
        throw new Error(`Markdown permission strip verification failed for ${name}.`);
      }
    }
  } catch (error) {
    const failures = restoreFiles(configSnapshots);
    const restored = failures.length === 0 && configSnapshots.every(snapshot =>
      snapshot.existed
        ? existsSync(snapshot.file) && readFileSync(snapshot.file).equals(snapshot.content!)
        : !existsSync(snapshot.file));
    if (!restored) {
      throw new Error(
        `Install/update failed and rollback was incomplete. Restore from ${backupDirectory ?? 'the backup directory'}: ${failures.join('; ') || 'configuration verification failed'}. Original error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    throw error instanceof Error
      ? new Error(`${error.message} All changes were rolled back.`)
      : error;
  }
  console.log(`Kiki ${update ? 'updated' : 'installed'} globally in ${directory}. Restart OpenCode to load it.`);
  console.log('Agent models: set them with the /kiki command in OpenCode (or edit agents.<name>.model in opencode.json).');
}

/**
 * `kiki init` is metadata-only. Validate every existing global and project
 * config tier so malformed input fails before any metadata write, but never
 * mirror baseline permissions into the project config.
 */
export function initializeProjectAgents(project: string, config: KikiConfig, directory = globalDirectory()): void {
  void config;
  for (const file of [...configFiles(project), ...configFiles(directory, true)]) readSettings(file);
}

export function resetProject(project: string): void {
  const configs = configFiles(project);
  // Validate all configuration before changing any file.
  const settingsByFile = new Map(configs.map(file => [file, readSettings(file)]));
  const files = AGENT_NAMES
    .map(name => join(project, '.opencode', 'agents', `${name}.md`))
    .filter(existsSync);
  const changes: { file: string; text: string; content: Settings }[] = [];
  for (const [file, settings] of settingsByFile) {
    const text = readFileSync(file, 'utf8');
    let updated = text;
    const entries = settings.agents;
    if (object(entries)) {
      for (const name of AGENT_NAMES) {
        if (entries[name] !== undefined) updated = patchValue(updated, ['agents', name], undefined);
      }
    }
    if (updated !== text) changes.push({ file, text: updated, content: settings });
  }
  backup([...changes.map(change => change.file), ...files], join(project, '.agentic/kiki/backups'));
  for (const change of changes) writeAtomic(change.file, change.text);
  for (const file of files) unlinkSync(file);
  console.log(`Kiki agent overrides reset in ${resolve(project)}. Project data retained. Restart OpenCode.`);
}
