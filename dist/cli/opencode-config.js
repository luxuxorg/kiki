import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { applyEdits, modify, parse as parseJsonc } from 'jsonc-parser';
import { parse as parseYaml } from 'yaml';
import { DEFAULT_CONFIG, generateAllTemplates } from './config.js';
export const AGENT_NAMES = ['kiki-orchestrator', 'kiki-brainstormer', 'kiki-planner',
    'kiki-implementer', 'kiki-gui-designer', 'kiki-reviewer', 'kiki-escalation', 'kiki-historian'];
export function globalDirectory() {
    return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'opencode');
}
function object(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
function validateAgent(settings, label) {
    if (settings.model !== undefined && (typeof settings.model !== 'string' || !settings.model.trim())) {
        throw new Error(`Invalid agent model: ${label}`);
    }
    if (settings.permission === undefined)
        return;
    const action = (value) => value === 'allow' || value === 'deny' || value === 'ask';
    if (!object(settings.permission) || Object.values(settings.permission).some(value => !action(value) && (!object(value) || Object.values(value).some(rule => !action(rule))))) {
        throw new Error(`Invalid agent permission: ${label}`);
    }
}
export function mergeSettings(base, extra) {
    const result = { ...base };
    for (const [key, value] of Object.entries(extra)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key))
            throw new Error('Invalid configuration key');
        result[key] = object(value) && object(result[key]) ? mergeSettings(result[key], value) : value;
    }
    return result;
}
function rejectForbiddenKeys(value) {
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
            validateAgent(settings, name);
        }
    }
    return data;
}
function configFiles(directory, global = false) {
    const candidates = global
        ? ['config.json', 'opencode.json', 'opencode.jsonc'].map(file => join(directory, file))
        : ['opencode.json', 'opencode.jsonc', '.opencode/opencode.json', '.opencode/opencode.jsonc'].map(file => join(directory, file));
    return candidates.filter(existsSync);
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
    if (object(current) && object(value)) {
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
        text = patchValue(text, ['agent', name], remove ? undefined : agent);
    }
    if (!existsSync(file) || text !== readFileSync(file, 'utf8'))
        writeAtomic(file, text);
}
function validateModelScope(scope) {
    if (scope !== 'global' && scope !== 'project')
        throw new Error('Ungültiger Geltungsbereich.');
}
export function listAgentModels(scope, context) {
    validateModelScope(scope);
    const global = readOpenCodeSettings(context.globalConfigDirectory, true);
    const project = readOpenCodeSettings(context.projectDirectory);
    return AGENT_NAMES.map(name => {
        const globalModel = global.agent?.[name]?.model;
        const localModel = project.agent?.[name]?.model;
        return {
            name,
            model: scope === 'global' ? globalModel ?? global.model : localModel ?? globalModel ?? project.model ?? global.model,
            inherited: scope === 'global' ? globalModel === undefined : localModel === undefined,
            projectOverride: localModel,
        };
    });
}
export function setAgentModel(scope, agent, model, availableModels, context) {
    validateModelScope(scope);
    if (!AGENT_NAMES.includes(agent))
        throw new Error('Ungültiger Kiki-Agent.');
    if (!model || !availableModels.includes(model))
        throw new Error('Das ausgewählte Modell ist nicht verfügbar.');
    // Re-read rather than persisting the configuration snapshot shown in the menu.
    const row = listAgentModels(scope, context).find(item => item.name === agent);
    const file = configTarget(scope === 'global' ? context.globalConfigDirectory : context.projectDirectory, scope === 'global');
    patchAgents(file, { [agent]: { model } });
    return { file, ...(scope === 'global' && row.projectOverride ? { projectOverride: row.projectOverride } : {}) };
}
// Removes agent.<name>.model from one config file, dropping the whole agent
// entry when nothing else remains. Comments and other keys are preserved.
function patchAgentModel(file, agent) {
    readSettings(file); // Validate before modifying.
    if (!existsSync(file))
        return;
    const before = readFileSync(file, 'utf8');
    let text = patchValue(before, ['agent', agent, 'model'], undefined);
    const current = parseJsonc(text)?.agent?.[agent];
    if (object(current) && Object.keys(current).length === 0)
        text = patchValue(text, ['agent', agent], undefined);
    if (text !== before)
        writeAtomic(file, text);
}
export function removeAgentModel(scope, agent, context) {
    validateModelScope(scope);
    if (!AGENT_NAMES.includes(agent))
        throw new Error('Ungültiger Kiki-Agent.');
    // Validate both scopes before changing any file.
    const global = readOpenCodeSettings(context.globalConfigDirectory, true);
    const project = readOpenCodeSettings(context.projectDirectory);
    const directory = scope === 'global' ? context.globalConfigDirectory : context.projectDirectory;
    // An override can live in any config tier of the scope; remove it from all of them.
    const files = configFiles(directory, scope === 'global');
    const removed = (scope === 'global' ? global : project).agent?.[agent]?.model;
    if (removed !== undefined)
        for (const file of files)
            patchAgentModel(file, agent);
    const effective = scope === 'project'
        ? global.agent?.[agent]?.model ?? project.model ?? global.model
        : global.model;
    return { file: files.at(-1) ?? configTarget(directory, scope === 'global'), removed, effective };
}
export function removeAllProjectModels(context) {
    const files = configFiles(context.projectDirectory);
    for (const file of files)
        readSettings(file); // Validate everything before changing any file.
    const changed = [];
    const removed = [];
    for (const file of files) {
        for (const name of AGENT_NAMES) {
            const model = readSettings(file).agent?.[name]?.model;
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
    validateAgent(settings, label);
    return { settings, prompt: match[2] };
}
export function baselineAgents(config = DEFAULT_CONFIG) {
    const templates = generateAllTemplates(config, 'global');
    const keys = ['orchestrator', 'brainstormer', 'planner', 'implementer', 'guiDesigner', 'reviewer', 'escalation', 'historian'];
    return Object.fromEntries(AGENT_NAMES.map((name, i) => [name, parseAgent(templates[keys[i]], name)]));
}
function legacyAgents(directory) {
    const agents = {};
    const files = [];
    for (const name of AGENT_NAMES) {
        // OpenCode supports both spellings. Conflicting duplicates require manual resolution.
        const found = ['agent', 'agents'].map(dir => join(directory, dir, `${name}.md`)).filter(existsSync);
        if (found.length > 1)
            throw new Error(`Duplicate local agent definitions: ${name}`);
        if (!found.length)
            continue;
        const { settings } = parseAgent(readFileSync(found[0], 'utf8'), found[0]);
        agents[name] = {};
        for (const key of ['permission', 'model'])
            if (settings[key] !== undefined)
                agents[name][key] = settings[key];
        files.push(found[0]);
    }
    return { agents, files };
}
function pluginFiles(directory) {
    return ['plugin', 'plugins'].flatMap(dir => ['kiki.ts', 'kiki.js'].map(file => join(directory, dir, file))).filter(existsSync);
}
function backup(files, directory) {
    if (!files.length)
        return;
    const target = join(directory, randomUUID());
    mkdirSync(target, { recursive: true, mode: 0o700 });
    writeFileSync(join(directory, '.gitignore'), '*\n', { mode: 0o600 });
    // Restrictive modes because OpenCode configuration can contain provider settings.
    for (const [i, file] of files.entries())
        writeFileSync(join(target, `${i}-${file.split(/[\\/]/).pop()}`), readFileSync(file), { mode: 0o600 });
    writeFileSync(join(target, 'manifest.json'), JSON.stringify(files, null, 2), { mode: 0o600 });
}
function prepareTuiIntegration(directory) {
    const files = ['tui.json', 'tui.jsonc'].map(name => join(directory, name)).filter(existsSync);
    const configs = files.map(file => ({ file, settings: readSettings(file) }));
    const loader = resolve(directory, 'kiki/tui.js');
    let registered = false;
    for (const { file, settings } of configs) {
        const plugins = settings.plugin === undefined ? [] : settings.plugin;
        if (!Array.isArray(plugins))
            throw new Error(`Invalid TUI plugin configuration: ${file}`);
        for (const item of plugins) {
            const spec = typeof item === 'string' ? item : Array.isArray(item) && item.length === 2 && object(item[1]) ? item[0] : undefined;
            if (typeof spec !== 'string' || !spec.trim())
                throw new Error(`Invalid TUI plugin entry: ${file}`);
            if (spec.startsWith('file://')) {
                if (resolve(fileURLToPath(spec)) === loader)
                    registered = true;
            }
            else if (spec.startsWith('.') || spec.startsWith('/') || /^[A-Za-z]:[\\/]/.test(spec)) {
                if (resolve(directory, spec) === loader)
                    registered = true;
            }
        }
    }
    const target = files.at(-1) || join(directory, 'tui.json');
    let text = existsSync(target) ? readFileSync(target, 'utf8') : '{\n  "$schema": "https://opencode.ai/tui.json"\n}\n';
    if (!registered) {
        const settings = readSettings(target);
        text = settings.plugin
            ? applyEdits(text, modify(text, ['plugin', -1], './kiki/tui.js', { isArrayInsertion: true, formattingOptions: { insertSpaces: true, tabSize: 2 } }))
            : patchValue(text, ['plugin'], ['./kiki/tui.js']);
    }
    return {
        files,
        apply() {
            // Stable config spec, while the loader follows the currently invoked CLI.
            // Keep this outside plugins/: TUI and server modules are target-exclusive.
            writeAtomic(loader, `export { default } from ${JSON.stringify(new URL('../tui/index.js', import.meta.url).href)};\n`);
            if (!registered)
                writeAtomic(target, text);
        },
    };
}
export function installGlobalFiles(directory = globalDirectory(), update = false) {
    const existing = readOpenCodeSettings(directory, true);
    const legacy = legacyAgents(directory);
    const tui = prepareTuiIntegration(directory);
    const baseline = baselineAgents();
    const agents = {};
    const prompts = {};
    for (const name of AGENT_NAMES) {
        const current = mergeSettings(legacy.agents[name] || {}, existing.agent?.[name] || {});
        const settings = { ...baseline[name].settings, ...current };
        const previouslyDefined = legacy.agents[name] !== undefined || existing.agent?.[name]?.prompt !== undefined;
        if (previouslyDefined) {
            // Absence on an existing definition can deliberately inherit OpenCode's
            // top-level defaults. Restoring role grants here could expand access.
            for (const key of ['permission', 'model'])
                if (!(key in current))
                    delete settings[key];
        }
        // Preserve approved permission objects and models, not a deep merge with new grants.
        settings.prompt = `{file:./kiki/prompts/${name}.md}`;
        agents[name] = settings;
        prompts[name] = baseline[name].prompt + '\n\n## Project configuration\nRead `.agentic/kiki/config.json` when present. Its paths and commands describe this project; use them instead of the default paths in these instructions. Models and permissions are configured natively in OpenCode, not routing.json.\n';
    }
    const target = configTarget(directory, true);
    backup([...legacy.files, ...pluginFiles(directory), ...configFiles(directory, true), ...tui.files], join(directory, 'kiki/backups'));
    for (const name of AGENT_NAMES)
        writeAtomic(join(directory, 'kiki/prompts', `${name}.md`), prompts[name]);
    writeAtomic(join(directory, 'kiki/agentic-workflow.md'), generateAllTemplates(DEFAULT_CONFIG).workflow);
    patchAgents(target, agents);
    writeAtomic(join(directory, 'plugins/kiki.ts'), generateAllTemplates(DEFAULT_CONFIG, 'global').plugin);
    tui.apply();
    for (const file of [...legacy.files, ...pluginFiles(directory).filter(file => file !== join(directory, 'plugins/kiki.ts'))])
        unlinkSync(file);
    console.log(`Kiki ${update ? 'updated' : 'installed'} globally in ${directory}. Restart OpenCode to load it.`);
}
// Native deep merging must not retain global path grants absent from a project's
// original permission map. Mask those keys with that map's fallback action first.
function projectPermissions(permission, global) {
    const result = { ...permission };
    for (const [tool, rules] of Object.entries(permission)) {
        if (!object(rules) || !object(global[tool]))
            continue;
        const fallback = rules['*'] || 'ask';
        const masked = Object.fromEntries(Object.keys(global[tool]).filter(pattern => !(pattern in rules)).map(pattern => {
            const inherited = global[tool][pattern];
            // Narrow inherited grants, but never turn an inherited deny/ask into
            // an allow merely because a project's broad wildcard permits reads.
            const action = inherited === 'deny' ? 'deny' : inherited === 'ask' && fallback === 'allow' ? 'ask' : fallback;
            return [pattern, action];
        }));
        result[tool] = { ...masked, ...rules };
    }
    return result;
}
export function initializeProjectAgents(project, config, directory = globalDirectory()) {
    const existing = readOpenCodeSettings(project);
    const baseline = baselineAgents();
    const global = readOpenCodeSettings(directory, true).agent || {};
    const agents = Object.fromEntries(Object.entries(baselineAgents(config)).map(([name, value]) => [name, {
            ...(value.settings.permission ? { permission: projectPermissions(value.settings.permission, global[name]?.permission || baseline[name].settings.permission || {}) } : {}),
            ...(value.settings.model !== baseline[name].settings.model ? { model: value.settings.model } : {}),
            ...(existing.agent?.[name] || {}),
        }]).filter(([, value]) => Object.keys(value).length));
    patchAgents(configTarget(project), agents);
}
export function migrateProject(project, global = globalDirectory()) {
    const globalSettings = readOpenCodeSettings(global, true);
    if (!globalSettings.agent?.['kiki-orchestrator'] || !existsSync(join(global, 'plugins/kiki.ts'))) {
        throw new Error('Install/update Kiki globally before migrating a project.');
    }
    const existing = readOpenCodeSettings(project);
    const legacy = legacyAgents(join(project, '.opencode'));
    const routingFile = join(project, '.agentic/kiki/routing.json');
    const routing = existsSync(routingFile) ? readSettings(routingFile) : {};
    if (existsSync(routingFile)) {
        if (!object(routing.agents))
            throw new Error('Legacy routing.json requires an agents map; resolve it before migration.');
        for (const name of AGENT_NAMES)
            if (routing.agents[name] !== undefined)
                validateAgent({ model: routing.agents[name] }, name);
    }
    const agents = {};
    for (const name of AGENT_NAMES) {
        const local = { ...legacy.agents[name] };
        if (local.model === undefined && routing.agents?.[name] !== undefined)
            local.model = routing.agents[name];
        if (local.permission)
            local.permission = projectPermissions(local.permission, globalSettings.agent?.[name]?.permission || {});
        if (Object.keys(local).length)
            agents[name] = mergeSettings(local, existing.agent?.[name] || {});
    }
    const duplicates = [...legacy.files, ...pluginFiles(join(project, '.opencode'))];
    const files = [...duplicates, ...(existsSync(routingFile) ? [routingFile] : [])];
    backup([...files, ...configFiles(project)], join(project, '.agentic/kiki/backups'));
    if (Object.keys(agents).length)
        patchAgents(configTarget(project), agents);
    for (const file of files)
        unlinkSync(file);
    console.log(`Migrated Kiki settings in ${resolve(project)}; local runtime copies removed. Restart OpenCode.`);
}
export function resetProject(project) {
    const configs = configFiles(project);
    // Validate all configuration before changing any file.
    const changes = configs.map(file => ({ file, agents: readSettings(file).agent || {} }));
    const legacy = ['agent', 'agents'].flatMap(dir => AGENT_NAMES.map(name => join(project, '.opencode', dir, `${name}.md`))).filter(existsSync);
    const routing = join(project, '.agentic/kiki/routing.json');
    const files = [...legacy, ...pluginFiles(join(project, '.opencode')), ...(existsSync(routing) ? [routing] : [])];
    backup([...configs, ...files], join(project, '.agentic/kiki/backups'));
    for (const { file, agents } of changes)
        patchAgents(file, Object.fromEntries(AGENT_NAMES.filter(name => name in agents).map(name => [name, null])), true);
    for (const file of files)
        unlinkSync(file);
    console.log(`Kiki agent overrides reset in ${resolve(project)}. Project data retained. Restart OpenCode.`);
}
//# sourceMappingURL=opencode-config.js.map