import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import { applyEdits, modify, parse as parseJsonc } from 'jsonc-parser';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { DEFAULT_CONFIG, generateAllTemplates } from './config.js';
import { assertNotOC1Config, canonicalPath, pathsOverlap, resolveOC2Roots } from './oc2-paths.js';
import { projectPermissionRules, translatePermissions } from './oc2-permissions.js';
import { migrateOC1, oc1GlobalDirectory } from './oc2-migration.js';
import { currentPackageSpec, prepareRegistration } from './oc2-registration.js';
export const AGENT_NAMES = ['kiki-orchestrator', 'kiki-brainstormer', 'kiki-planner',
    'kiki-implementer', 'kiki-gui-designer', 'kiki-reviewer', 'kiki-escalation', 'kiki-historian'];
/** Split a UI model ID at the first `/`; variants are passed separately. */
export function parseModelID(id, variant) {
    if (typeof id !== 'string' || !id.trim() || id.includes('#'))
        throw new Error('Invalid model identifier.');
    const separator = id.indexOf('/');
    if (separator <= 0 || separator === id.length - 1)
        throw new Error('Invalid model identifier.');
    const providerID = id.slice(0, separator);
    const model = id.slice(separator + 1);
    if (!providerID.trim() || !model.trim())
        throw new Error('Invalid model identifier.');
    if (variant !== undefined && (typeof variant !== 'string' || !variant.trim() || variant.includes('#'))) {
        throw new Error('Invalid model variant.');
    }
    return { providerID, model, ...(variant ? { variant } : {}) };
}
/** Render a native model selection as the string ID used by the existing UI. */
export function formatModelID(model) {
    if (!model || typeof model.providerID !== 'string' || !model.providerID.trim()
        || typeof model.model !== 'string' || !model.model.trim()) {
        throw new Error('Invalid model selection.');
    }
    return `${model.providerID}/${model.model}`;
}
export function globalDirectory() {
    return resolveOC2Roots(process.env, homedir()).config;
}
function object(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
function validateLegacyPermissions(value, label) {
    if (value === undefined)
        return;
    const action = (item) => item === 'allow' || item === 'deny' || item === 'ask';
    if (!object(value) || Object.values(value).some(item => !action(item) && (!object(item) || Object.values(item).some(rule => !action(rule))))) {
        throw new Error(`Invalid agent permission: ${label}`);
    }
}
function validateLegacyAgent(settings, label) {
    if (settings.model !== undefined && (typeof settings.model !== 'string' || !settings.model.trim())) {
        throw new Error(`Invalid agent model: ${label}`);
    }
    validateLegacyPermissions(settings.permission, label);
}
export function mergeSettings(base, extra) {
    const result = { ...base };
    for (const [key, value] of Object.entries(extra)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key))
            throw new Error('Invalid configuration key');
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
function rejectForbiddenKeys(value) {
    // Rules and other V2 settings are arrays; recurse through them as well.
    if (Array.isArray(value)) {
        for (const child of value)
            rejectForbiddenKeys(child);
        return;
    }
    if (!object(value))
        return;
    // A top-level "__proto__" key parsed by assignment mutates the prototype instead of creating an own key.
    if (Object.getPrototypeOf(value) !== Object.prototype)
        throw new Error('Invalid configuration key');
    for (const [key, child] of Object.entries(value)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key))
            throw new Error('Invalid configuration key');
        rejectForbiddenKeys(child);
    }
}
function validateNativeModel(value, label) {
    if (value === undefined)
        return;
    if (typeof value === 'string') {
        if (!value.trim())
            throw new Error(`Invalid agent model: ${label}`);
        return;
    }
    if (!object(value) || typeof value.providerID !== 'string' || !value.providerID.trim()
        || typeof value.model !== 'string' || !value.model.trim()
        || (value.variant !== undefined && (typeof value.variant !== 'string' || !value.variant.trim()))) {
        throw new Error(`Invalid agent model: ${label}`);
    }
}
function validateNativePermissions(value, label) {
    if (value === undefined)
        return;
    if (!Array.isArray(value) || value.some(rule => !object(rule)
        || typeof rule.action !== 'string' || !rule.action.trim()
        || typeof rule.resource !== 'string' || !rule.resource.trim()
        || (rule.effect !== 'allow' && rule.effect !== 'deny' && rule.effect !== 'ask'))) {
        throw new Error(`Invalid agent permission: ${label}`);
    }
}
function validateNativeAgent(settings, label) {
    validateNativeModel(settings.model, label);
    validateNativePermissions(settings.permissions, label);
}
function validateAgentFile(settings, label) {
    validateNativeModel(settings.model, label);
    validateLegacyPermissions(settings.permission, label);
    validateNativePermissions(settings.permissions, label);
    if (settings.mode !== undefined && !['primary', 'subagent', 'all'].includes(settings.mode)) {
        throw new Error(`Invalid agent mode: ${label}`);
    }
}
export function readSettings(file) {
    if (!existsSync(file))
        return {};
    const errors = [];
    const data = parseJsonc(readFileSync(file, 'utf8'), errors, { allowTrailingComma: true });
    if (errors.length || !object(data))
        throw new Error(`Invalid OpenCode configuration: ${file}`);
    rejectForbiddenKeys(data);
    if (data.agent !== undefined) {
        if (!object(data.agent))
            throw new Error(`Invalid agent configuration: ${file}`);
        for (const [name, settings] of Object.entries(data.agent)) {
            if (!object(settings))
                throw new Error(`Invalid agent configuration: ${name}`);
            validateLegacyAgent(settings, name);
        }
    }
    if (data.agents !== undefined) {
        if (!object(data.agents))
            throw new Error(`Invalid agent configuration: ${file}`);
        for (const [name, settings] of Object.entries(data.agents)) {
            if (!object(settings))
                throw new Error(`Invalid agent configuration: ${name}`);
            validateNativeAgent(settings, name);
        }
    }
    return data;
}
function configFiles(directory, global = false) {
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
export function discoverConfigTiers(project, global) {
    const files = (directory, scope) => {
        const names = scope === 'global'
            ? ['opencode.json', 'opencode.jsonc']
            : ['opencode.json', 'opencode.jsonc', '.opencode/opencode.json', '.opencode/opencode.jsonc'];
        return names.map(name => join(directory, name)).filter(existsSync)
            .map(file => ({ file, scope, directory: dirname(file) }));
    };
    const result = files(global, 'global');
    const projectRoot = resolve(project);
    const globalRoot = resolve(global);
    const chain = [];
    let current = projectRoot;
    for (;;) {
        chain.push(current);
        const parent = dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
    for (const directory of chain.reverse()) {
        if (directory === globalRoot)
            continue;
        result.push(...files(directory, directory === projectRoot ? 'project' : 'ancestor'));
    }
    return result;
}
export function readOpenCodeSettings(directory, global = false) {
    return configFiles(directory, global).reduce((data, file) => mergeSettings(data, readSettings(file)), {});
}
function configTarget(directory, global = false) {
    return configFiles(directory, global).slice(-1)[0] || join(directory, 'opencode.jsonc');
}
function writeAtomic(file, content) {
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
        writeFileSync(temp, content, { mode: existsSync(file) ? statSync(file).mode & 0o777 : 0o600 });
        renameSync(temp, file);
    }
    finally {
        if (existsSync(temp))
            unlinkSync(temp);
    }
}
function patchValue(text, path, value) {
    let current = parseJsonc(text);
    for (const key of path)
        current = current?.[key];
    if (JSON.stringify(current) === JSON.stringify(value))
        return text;
    // A model selection is replaced as a whole so a stale variant cannot survive.
    if (path.at(-1) !== 'model' && object(current) && object(value)) {
        for (const [key, child] of Object.entries(value))
            text = patchValue(text, [...path, key], child);
        return text;
    }
    return applyEdits(text, modify(text, path, value, {
        formattingOptions: { insertSpaces: true, tabSize: 2 },
    }));
}
function patchAgents(file, agents, remove = false) {
    readSettings(file); // Validate before modifying.
    let text = existsSync(file) ? readFileSync(file, 'utf8') : '{\n  "$schema": "https://opencode.ai/config.json"\n}\n';
    for (const [name, agent] of Object.entries(agents)) {
        text = patchValue(text, ['agents', name], remove ? undefined : agent);
    }
    if (!existsSync(file) || text !== readFileSync(file, 'utf8'))
        writeAtomic(file, text);
}
function validateModelScope(scope) {
    if (scope !== 'global' && scope !== 'project')
        throw new Error('Ungültiger Geltungsbereich.');
}
// The menu functions can be called with explicit directories (TUI sends the
// env-derived config dir). Refuse overlapping scopes and any alias of a live
// V1 installation before reading or writing either one.
function assertContextTargets(context) {
    const config = canonicalPath(context.globalConfigDirectory);
    const project = canonicalPath(context.projectDirectory);
    if (pathsOverlap(config, project)) {
        throw new Error('Refusing to modify overlapping OpenCode configuration directories.');
    }
    assertNotOC1Config(config, homedir());
}
function selectionString(value) {
    if (typeof value === 'string')
        return value;
    if (!object(value))
        return undefined;
    try {
        return formatModelID(value);
    }
    catch {
        return undefined;
    }
}
function agentModelString(settings, name) {
    return selectionString(settings.agents?.[name]?.model);
}
function topModelString(settings) {
    return selectionString(settings.model);
}
function tierSettings(project, global) {
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
export function listAgentModels(scope, context) {
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
export function setAgentModel(scope, agent, model, availableModels, context) {
    validateModelScope(scope);
    if (!AGENT_NAMES.includes(agent))
        throw new Error('Ungültiger Kiki-Agent.');
    if (!model || !availableModels.includes(model))
        throw new Error('Das ausgewählte Modell ist nicht verfügbar.');
    assertContextTargets(context);
    const selection = parseModelID(model);
    // Re-read rather than persisting the configuration snapshot shown in the menu.
    const row = listAgentModels(scope, context).find(item => item.name === agent);
    const file = configTarget(scope === 'global' ? context.globalConfigDirectory : context.projectDirectory, scope === 'global');
    patchAgents(file, { [agent]: { model: selection } });
    return { file, ...(scope === 'global' && row.projectOverride ? { projectOverride: row.projectOverride } : {}) };
}
// Removes agents.<name>.model from one config file, dropping the whole agent
// entry when nothing else remains. Comments and other keys are preserved.
function patchAgentModel(file, agent) {
    readSettings(file); // Validate before modifying.
    if (!existsSync(file))
        return;
    const before = readFileSync(file, 'utf8');
    let text = patchValue(before, ['agents', agent, 'model'], undefined);
    const current = parseJsonc(text)?.agents?.[agent];
    if (object(current) && Object.keys(current).length === 0)
        text = patchValue(text, ['agents', agent], undefined);
    if (text !== before)
        writeAtomic(file, text);
}
export function removeAgentModel(scope, agent, context) {
    validateModelScope(scope);
    if (!AGENT_NAMES.includes(agent))
        throw new Error('Ungültiger Kiki-Agent.');
    assertContextTargets(context);
    // Validate both scopes before changing any file.
    const global = readOpenCodeSettings(context.globalConfigDirectory, true);
    const project = readOpenCodeSettings(context.projectDirectory);
    const directory = scope === 'global' ? context.globalConfigDirectory : context.projectDirectory;
    // Only remove keys owned by the selected scope; ancestor-owned config is never touched.
    const files = configFiles(directory, scope === 'global');
    const removed = selectionString((scope === 'global' ? global : project).agents?.[agent]?.model);
    if (removed !== undefined)
        for (const file of files)
            patchAgentModel(file, agent);
    const tiers = tierSettings(context.projectDirectory, context.globalConfigDirectory);
    const effective = scope === 'project'
        ? agentModelString(tiers.project, agent) ?? agentModelString(tiers.ancestor, agent)
            ?? agentModelString(tiers.global, agent)
            ?? topModelString(tiers.project) ?? topModelString(tiers.ancestor) ?? topModelString(tiers.global)
        : topModelString(tiers.global);
    return { file: files.at(-1) ?? configTarget(directory, scope === 'global'), removed, effective };
}
export function removeAllProjectModels(context) {
    assertContextTargets(context);
    const files = configFiles(context.projectDirectory);
    for (const file of files)
        readSettings(file); // Validate everything before changing any file.
    const changed = [];
    const removed = [];
    for (const file of files) {
        for (const name of AGENT_NAMES) {
            const model = selectionString(readSettings(file).agents?.[name]?.model);
            if (model === undefined)
                continue;
            patchAgentModel(file, name);
            removed.push({ agent: name, model });
            if (!changed.includes(file))
                changed.push(file);
        }
    }
    return { files: changed, removed };
}
export function parseAgent(text, label) {
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
    if (!match)
        throw new Error(`Invalid agent frontmatter: ${label}`);
    const settings = parseYaml(match[1], { uniqueKeys: false });
    if (!object(settings) || (settings.permission !== undefined && !object(settings.permission))) {
        throw new Error(`Invalid agent settings: ${label}`);
    }
    validateAgentFile(settings, label);
    return { settings, prompt: match[2] };
}
export function baselineAgents(config = DEFAULT_CONFIG) {
    const templates = generateAllTemplates(config);
    const keys = ['orchestrator', 'brainstormer', 'planner', 'implementer', 'guiDesigner', 'reviewer', 'escalation', 'historian'];
    return Object.fromEntries(AGENT_NAMES.map((name, i) => [name, parseAgent(templates[keys[i]], name)]));
}
const PROJECT_CONFIG_POINTER = '\n\n## Project configuration\nRead `.agentic/kiki/config.json` when present. Its paths and commands describe this project; use them instead of the default paths in these instructions. Models and permissions are configured natively in OpenCode, not routing.json.\n';
function pluginFiles(directory) {
    return ['plugin', 'plugins'].flatMap(dir => ['kiki.ts', 'kiki.js'].map(file => join(directory, dir, file))).filter(existsSync);
}
function backup(files, directory) {
    const existing = [...new Set(files.filter(existsSync))];
    if (!existing.length)
        return;
    const target = join(directory, randomUUID());
    mkdirSync(target, { recursive: true, mode: 0o700 });
    writeFileSync(join(directory, '.gitignore'), '*\n', { mode: 0o600 });
    // Restrictive modes because OpenCode configuration can contain provider settings.
    for (const [i, file] of existing.entries())
        writeFileSync(join(target, `${i}-${file.split(/[\\/]/).pop()}`), readFileSync(file), { mode: 0o600 });
    writeFileSync(join(target, 'manifest.json'), JSON.stringify(existing, null, 2), { mode: 0o600 });
}
function nativeAgentFile(directory, name) {
    return join(directory, 'agents', `${name}.md`);
}
function singularAgentFile(directory, name) {
    return join(directory, 'agent', `${name}.md`);
}
function promptFiles(directory) {
    const promptDirectory = join(directory, 'kiki/prompts');
    if (!existsSync(promptDirectory))
        return [];
    return readdirSync(promptDirectory, { withFileTypes: true })
        .filter(entry => entry.isFile())
        .map(entry => join(promptDirectory, entry.name));
}
function staleV1Files(directory) {
    return [
        join(directory, 'kiki/tui.js'),
        ...promptFiles(directory),
        ...pluginFiles(directory),
    ].filter(existsSync);
}
function renderAgentFile(settings, prompt) {
    const frontmatter = stringifyYaml(settings, { lineWidth: 0 }).trimEnd();
    return `---\n${frontmatter}\n---\n${prompt}`;
}
function nativeAgentContent(name, existingText) {
    const baseline = baselineAgents()[name];
    const settings = { ...baseline.settings };
    if (existingText !== undefined) {
        const existing = parseAgent(existingText, name).settings;
        Object.assign(settings, existing);
        // Models belong to config, never to the native file frontmatter.
        delete settings.model;
        // An existing definition that deliberately omits permissions inherits
        // OpenCode's configuration; restoring file baseline grants could broaden it.
        if (!('permissions' in existing) && existing.permission === undefined)
            delete settings.permissions;
        if (existing.permission !== undefined) {
            if (existing.permissions !== undefined)
                throw new Error(`Duplicate native and legacy permissions for ${name}.`);
            const translated = translatePermissions(existing.permission);
            if (!translated.ok)
                throw new Error(translated.reason);
            settings.permissions = translated.rules;
            delete settings.permission;
        }
    }
    delete settings.model;
    return renderAgentFile(settings, baseline.prompt + PROJECT_CONFIG_POINTER);
}
function removeStaleDirectory(directory) {
    try {
        rmdirSync(directory);
    }
    catch {
        // Keep a non-empty or already absent directory.
    }
}
export function installGlobalFiles(directory = globalDirectory(), update = false) {
    // Reject overlapping machine defaults and malformed tiers before any write.
    assertNotOC1Config(canonicalPath(directory), homedir(), { allowKnownV1Artifacts: true });
    for (const file of configFiles(directory, true))
        readSettings(file);
    const registration = prepareRegistration(directory, currentPackageSpec());
    const writes = [];
    const removals = [];
    for (const name of AGENT_NAMES) {
        const native = nativeAgentFile(directory, name);
        const singular = singularAgentFile(directory, name);
        const hasNative = existsSync(native);
        const hasSingular = existsSync(singular);
        if (hasNative && hasSingular)
            throw new Error(`Duplicate local agent definitions: ${name}`);
        const existing = hasNative ? native : hasSingular ? singular : undefined;
        const content = nativeAgentContent(name, existing ? readFileSync(existing, 'utf8') : undefined);
        if (!hasNative || readFileSync(native, 'utf8') !== content)
            writes.push({ file: native, content });
        if (hasSingular)
            removals.push(singular);
    }
    const workflow = join(directory, 'kiki/agentic-workflow.md');
    const workflowContent = generateAllTemplates(DEFAULT_CONFIG).workflow;
    if (!existsSync(workflow) || readFileSync(workflow, 'utf8') !== workflowContent) {
        writes.push({ file: workflow, content: workflowContent });
    }
    removals.push(...staleV1Files(directory));
    const targets = [
        ...writes.map(write => write.file),
        ...removals,
        ...registration.files,
    ].filter(existsSync);
    backup(targets, join(directory, 'kiki/backups'));
    for (const write of writes)
        writeAtomic(write.file, write.content);
    for (const file of [...new Set(removals)].filter(existsSync))
        unlinkSync(file);
    removeStaleDirectory(join(directory, 'kiki/prompts'));
    registration.apply();
    console.log(`Kiki ${update ? 'updated' : 'installed'} globally in ${directory}. Restart OpenCode to load it.`);
    console.log('Agent models: set them with the /kiki command in OpenCode (or edit agents.<name>.model in opencode.json).');
}
// Native deep merging must not retain global path grants absent from a project's
// original permission map. The transaction applies the same masking rules.
export function initializeProjectAgents(project, config, directory = globalDirectory()) {
    assertNotOC1Config(canonicalPath(project), homedir(), { allowKnownV1Artifacts: true });
    assertNotOC1Config(canonicalPath(directory), homedir(), { allowKnownV1Artifacts: true });
    const existing = readOpenCodeSettings(project);
    const baseline = baselineAgents();
    const global = readOpenCodeSettings(directory, true).agents || {};
    const agents = Object.fromEntries(Object.entries(baselineAgents(config)).map(([name, value]) => {
        const local = value.settings.permissions;
        const inherited = [
            ...(Array.isArray(baseline[name]?.settings.permissions) ? baseline[name].settings.permissions : []),
            ...(Array.isArray(global[name]?.permissions) ? global[name].permissions : []),
        ];
        return [name, {
                ...(Array.isArray(local) ? { permissions: projectPermissionRules(local, inherited) } : {}),
                ...(existing.agents?.[name] || {}),
            }];
    }).filter(([, value]) => Object.keys(value).length));
    patchAgents(configTarget(project), agents);
}
export function migrateProject(project, global = oc1GlobalDirectory()) {
    const report = migrateOC1({ from: global, project, force: false, destination: project });
    if (report.exitCode !== 0) {
        const details = report.rejected.map(entry => `${entry.agent}: ${entry.reason}`).join('; ');
        throw new Error(`Migration incomplete: ${details}`);
    }
    console.log(`Migrated Kiki settings in ${resolve(project)}; local runtime copies removed. Restart OpenCode.`);
}
export function resetProject(project) {
    assertNotOC1Config(canonicalPath(project), homedir(), { allowKnownV1Artifacts: true });
    const configs = configFiles(project);
    // Validate all configuration before changing any file.
    const settingsByFile = new Map(configs.map(file => [file, readSettings(file)]));
    const agentFiles = ['agent', 'agents'].flatMap(dir => AGENT_NAMES.map(name => join(project, '.opencode', dir, `${name}.md`))).filter(existsSync);
    const routing = join(project, '.agentic/kiki/routing.json');
    const files = [...agentFiles, ...pluginFiles(join(project, '.opencode')), ...(existsSync(routing) ? [routing] : [])];
    const changes = [];
    for (const [file, settings] of settingsByFile) {
        const text = readFileSync(file, 'utf8');
        let updated = text;
        for (const section of ['agents', 'agent']) {
            const entries = settings[section];
            if (!object(entries))
                continue;
            for (const name of AGENT_NAMES) {
                if (entries[name] !== undefined)
                    updated = patchValue(updated, [section, name], undefined);
            }
        }
        if (updated !== text)
            changes.push({ file, text: updated, content: settings });
    }
    backup([...changes.map(change => change.file), ...files], join(project, '.agentic/kiki/backups'));
    for (const change of changes)
        writeAtomic(change.file, change.text);
    for (const file of files)
        unlinkSync(file);
    console.log(`Kiki agent overrides reset in ${resolve(project)}. Project data retained. Restart OpenCode.`);
}
//# sourceMappingURL=opencode-config.js.map