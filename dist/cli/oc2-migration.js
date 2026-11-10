import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync, } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import { applyEdits, modify, parse as parseJsonc } from 'jsonc-parser';
import { parse as parseYaml } from 'yaml';
import { AGENT_NAMES } from './opencode-config.js';
import { assertNotOC1Config, canonicalPath, pathsOverlap } from './oc2-paths.js';
import { projectPermissionRules, translatePermissions } from './oc2-permissions.js';
import { KIKI_VERSION } from './config.js';
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const PLUGIN_DIRECTORIES = ['plugin', 'plugins'];
const AGENT_DIRECTORIES = ['agent', 'agents'];
const CONFIG_NAMES = ['opencode.json', 'opencode.jsonc'];
function object(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
function plainObject(value) {
    if (!object(value))
        return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
/** V1's global config resolution: XDG_CONFIG_HOME or ~/.config, never OC2 overrides. */
export function oc1GlobalDirectory(env = process.env, home = homedir()) {
    return join(env.XDG_CONFIG_HOME || join(home, '.config'), 'opencode');
}
function configCandidates(directory, global) {
    const names = global
        ? CONFIG_NAMES
        : ['opencode.json', 'opencode.jsonc', '.opencode/opencode.json', '.opencode/opencode.jsonc'];
    return names.map(name => join(directory, name)).filter(existsSync);
}
function configTarget(directory, global) {
    return configCandidates(directory, global).slice(-1)[0] || join(directory, 'opencode.jsonc');
}
function readConfig(file) {
    const errors = [];
    const data = parseJsonc(readFileSync(file, 'utf8'), errors, { allowTrailingComma: true });
    if (errors.length || !plainObject(data))
        throw new Error(`Invalid OpenCode configuration: ${file}`);
    return data;
}
function validateAgentMaps(settings, label) {
    for (const section of AGENT_DIRECTORIES) {
        if (settings[section] !== undefined && !plainObject(settings[section])) {
            throw new Error(`Invalid agent configuration: ${label}`);
        }
    }
}
/**
 * Merge configuration tiers without deep-merging a model object: a higher file
 * either defines the whole selection or leaves it absent. Agent entries are
 * replaced as whole values so a lower file cannot leak a stale variant.
 */
function mergeConfigSettings(base, extra) {
    const result = { ...base };
    for (const [key, value] of Object.entries(extra)) {
        if (FORBIDDEN_KEYS.has(key))
            throw new Error('Invalid configuration key');
        if (key === 'agent' || key === 'agents') {
            if (!plainObject(value))
                throw new Error('Invalid agent configuration');
            const current = plainObject(result[key]) ? result[key] : {};
            const merged = { ...current };
            for (const [name, node] of Object.entries(value)) {
                if (FORBIDDEN_KEYS.has(name))
                    throw new Error('Invalid configuration key');
                merged[name] = object(current[name]) && object(node)
                    ? mergeConfigSettings(current[name], node)
                    : node;
            }
            result[key] = merged;
            continue;
        }
        if (key === 'model' && object(value)) {
            result[key] = value;
            continue;
        }
        result[key] = object(value) && object(result[key]) ? mergeConfigSettings(result[key], value) : value;
    }
    return result;
}
function readConfigSet(directory, global) {
    const files = configCandidates(directory, global);
    let settings = {};
    for (const file of files) {
        const parsed = readConfig(file);
        validateAgentMaps(parsed, file);
        settings = mergeConfigSettings(settings, parsed);
    }
    return { files, settings };
}
function assertSecretFree(settings) {
    for (const key of ['provider', 'providers', 'auth', 'env']) {
        if (settings[key] !== undefined) {
            throw new Error('Refusing to inspect a possibly credential-bearing OC1 source configuration. Create a secret-free export and pass it with --from.');
        }
    }
}
function renameProvider(providerID) {
    if (providerID === 'azure-cognitive-services')
        return 'azure';
    if (providerID === 'google-vertex-anthropic')
        return 'google-vertex';
    return providerID;
}
function modelSelection(value, variant, label) {
    if (value === undefined) {
        return variant === undefined ? { ok: true } : { ok: false, reason: `Invalid model variant for ${label}.` };
    }
    let model;
    if (typeof value === 'string') {
        if (typeof variant !== 'string' && variant !== undefined) {
            return { ok: false, reason: `Invalid model variant for ${label}.` };
        }
        if (variant !== undefined && (!variant.trim() || variant.includes('#'))) {
            return { ok: false, reason: `Invalid model variant for ${label}.` };
        }
        const separator = value.indexOf('/');
        if (separator <= 0 || separator === value.length - 1 || value.includes('#')) {
            return { ok: false, reason: `Invalid model for ${label}.` };
        }
        const providerID = value.slice(0, separator);
        const modelID = value.slice(separator + 1);
        if (!providerID.trim() || !modelID.trim())
            return { ok: false, reason: `Invalid model for ${label}.` };
        model = { providerID: renameProvider(providerID), model: modelID, ...(variant ? { variant } : {}) };
        return { ok: true, model };
    }
    if (!plainObject(value) || variant !== undefined
        || typeof value.providerID !== 'string' || !value.providerID.trim()
        || typeof value.model !== 'string' || !value.model.trim()
        || (value.variant !== undefined && (typeof value.variant !== 'string' || !value.variant.trim()))) {
        return { ok: false, reason: `Invalid model for ${label}.` };
    }
    model = {
        providerID: renameProvider(value.providerID),
        model: value.model,
        ...(value.variant ? { variant: value.variant } : {}),
    };
    return { ok: true, model };
}
function nativeRules(value) {
    if (value === undefined)
        return undefined;
    if (!Array.isArray(value))
        return undefined;
    const rules = [];
    for (const rule of value) {
        if (!plainObject(rule)
            || typeof rule.action !== 'string' || !rule.action.trim()
            || typeof rule.resource !== 'string' || !rule.resource.trim()
            || (rule.effect !== 'allow' && rule.effect !== 'deny' && rule.effect !== 'ask')) {
            return undefined;
        }
        rules.push({ action: rule.action, resource: rule.resource, effect: rule.effect });
    }
    return rules;
}
function mergePermissionMaps(base, extra) {
    const result = Object.fromEntries(Object.entries(base));
    for (const [tool, value] of Object.entries(extra)) {
        if (FORBIDDEN_KEYS.has(tool))
            throw new Error('Invalid permission action.');
        result[tool] = plainObject(value) && plainObject(result[tool])
            ? { ...result[tool], ...value }
            : value;
    }
    return result;
}
function sourcePermissions(node, topPermission, label) {
    if (node.permissions !== undefined && node.permission !== undefined) {
        return { ok: false, reason: `Duplicate native and legacy permissions for ${label}.` };
    }
    if (node.permissions !== undefined) {
        if (topPermission !== undefined) {
            return { ok: false, reason: `Top-level source permission cannot be combined with native permissions for ${label}.` };
        }
        const rules = nativeRules(node.permissions);
        return rules ? { ok: true, permissions: rules } : { ok: false, reason: `Invalid permission for ${label}.` };
    }
    if (node.permission !== undefined) {
        if (!plainObject(node.permission))
            return { ok: false, reason: `Invalid permission for ${label}.` };
        const combined = topPermission === undefined
            ? node.permission
            : mergePermissionMaps(topPermission, node.permission);
        const translated = translatePermissions(combined);
        return translated.ok
            ? { ok: true, permissions: translated.rules }
            : { ok: false, reason: translated.reason };
    }
    if (topPermission !== undefined) {
        const translated = translatePermissions(topPermission);
        return translated.ok
            ? { ok: true, permissions: translated.rules }
            : { ok: false, reason: translated.reason };
    }
    return { ok: true };
}
function sourceAgent(node, topPermission, label) {
    if (!plainObject(node))
        return { ok: false, reason: `Invalid agent definition for ${label}.` };
    const model = modelSelection(node.model, node.variant, label);
    if (!model.ok)
        return model;
    const permissions = sourcePermissions(node, topPermission, label);
    if (!permissions.ok)
        return permissions;
    return {
        ok: true,
        value: {
            ...(model.model ? { model: model.model } : {}),
            ...(permissions.permissions ? { permissions: permissions.permissions } : {}),
        },
    };
}
function destinationAgent(node, label) {
    if (!plainObject(node))
        return { ok: false, reason: `Invalid destination definition for ${label}.` };
    if (node.permissions !== undefined && node.permission !== undefined) {
        return { ok: false, reason: `Duplicate native and legacy permissions for ${label}.` };
    }
    const model = modelSelection(node.model, node.variant, label);
    if (!model.ok)
        return model;
    let permissions;
    if (node.permissions !== undefined) {
        permissions = nativeRules(node.permissions);
        if (!permissions)
            return { ok: false, reason: `Invalid destination permission for ${label}.` };
    }
    else if (node.permission !== undefined) {
        if (!plainObject(node.permission))
            return { ok: false, reason: `Invalid destination permission for ${label}.` };
        const translated = translatePermissions(node.permission);
        if (!translated.ok)
            return { ok: false, reason: translated.reason };
        permissions = translated.rules;
    }
    return {
        ok: true,
        value: {
            ...(model.model ? { model: model.model } : {}),
            ...(permissions !== undefined ? { permissions } : {}),
        },
    };
}
function modelKey(model) {
    return `${model.providerID}\0${model.model}\0${model.variant ?? ''}`;
}
function rulesKey(rules) {
    return JSON.stringify(rules);
}
function pluginSpec(item) {
    if (typeof item === 'string')
        return item;
    if (Array.isArray(item) && typeof item[0] === 'string')
        return item[0];
    return undefined;
}
function isKikiPluginSpec(spec) {
    const clean = spec.split('#')[0].split('?')[0].replace(/\\/g, '/');
    const name = clean.split('/').pop() || '';
    return name === 'kiki.ts' || name === 'kiki.js' || name === 'kiki' || clean === 'kiki' || clean.startsWith('kiki@');
}
/** Report only a package/path name, never a URL's credentials or query. */
function pluginName(spec) {
    const clean = spec.split('#')[0].split('?')[0].replace(/\\/g, '/');
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(clean)) {
        try {
            const url = new URL(clean);
            return url.pathname.split('/').filter(Boolean).pop() || url.hostname || 'plugin';
        }
        catch {
            return 'plugin';
        }
    }
    if (clean.startsWith('.') || clean.startsWith('/') || clean.includes('/')) {
        return clean.split('/').filter(Boolean).pop() || 'plugin';
    }
    return clean;
}
function sourcePluginList(settings) {
    if (settings.plugin === undefined)
        return [];
    if (!Array.isArray(settings.plugin))
        throw new Error('Invalid source plugin configuration');
    return settings.plugin;
}
function destinationPluginList(settings) {
    const result = [];
    for (const key of ['plugins', 'plugin']) {
        if (settings[key] === undefined)
            continue;
        if (!Array.isArray(settings[key]))
            throw new Error('Invalid destination plugin configuration');
        result.push(...settings[key]);
    }
    return result;
}
function patchValue(text, path, value) {
    let current = parseJsonc(text);
    for (const key of path)
        current = current?.[key];
    if (JSON.stringify(current) === JSON.stringify(value))
        return text;
    if (path.at(-1) !== 'model' && object(current) && object(value)) {
        for (const [key, child] of Object.entries(value))
            text = patchValue(text, [...path, key], child);
        return text;
    }
    return applyEdits(text, modify(text, path, value, {
        formattingOptions: { insertSpaces: true, tabSize: 2 },
    }));
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
function backup(files, directory) {
    const base = join(directory, '.agentic/kiki/backups');
    mkdirSync(base, { recursive: true, mode: 0o700 });
    chmodSync(base, 0o700);
    const target = join(base, randomUUID());
    mkdirSync(target, { recursive: true, mode: 0o700 });
    chmodSync(target, 0o700);
    writeFileSync(join(base, '.gitignore'), '*\n', { mode: 0o600 });
    for (const [index, file] of files.entries()) {
        writeFileSync(join(target, `${index}-${basename(file)}`), readFileSync(file), { mode: 0o600 });
    }
    writeFileSync(join(target, 'manifest.json'), JSON.stringify(files, null, 2), { mode: 0o600 });
    return target;
}
function restore(changes) {
    for (const change of changes.reverse()) {
        if (change.existed) {
            mkdirSync(dirname(change.file), { recursive: true });
            writeFileSync(change.file, change.content, { mode: change.mode });
        }
        else if (existsSync(change.file)) {
            unlinkSync(change.file);
        }
    }
}
function apply(file, content, applied) {
    const existed = existsSync(file);
    const original = existed ? readFileSync(file) : undefined;
    const mode = existed ? statSync(file).mode & 0o777 : undefined;
    writeAtomic(file, content);
    applied.push({ file, existed, content: original, mode });
}
function remove(file, applied) {
    const content = readFileSync(file);
    const mode = statSync(file).mode & 0o777;
    unlinkSync(file);
    applied.push({ file, existed: true, content, mode });
}
function markerPath(directory) {
    return join(directory, '.agentic/kiki/migration.json');
}
function markerContent(source) {
    return `${JSON.stringify({ source, timestamp: new Date().toISOString(), version: KIKI_VERSION }, null, 2)}\n`;
}
function sourceDefinitions(settingsByFile) {
    const definitions = new Map();
    const nonKiki = new Set();
    for (const { file, settings } of settingsByFile) {
        for (const section of AGENT_DIRECTORIES) {
            const agents = settings[section];
            if (!plainObject(agents))
                continue;
            for (const [name, value] of Object.entries(agents)) {
                if (!AGENT_NAMES.includes(name)) {
                    nonKiki.add(name);
                    continue;
                }
                definitions.set(name, [...(definitions.get(name) ?? []), {
                        value,
                        file,
                        section: section,
                    }]);
            }
        }
    }
    return { definitions, nonKiki };
}
function readSource(sourceDir, required) {
    const files = configCandidates(sourceDir, true);
    if (!files.length) {
        if (required)
            throw new Error(`No OC1 configuration found in ${sourceDir}.`);
        return {
            files: [], settingsByFile: [], settings: {}, pluginList: [],
            definitions: new Map(), nonKiki: new Set(),
        };
    }
    const settingsByFile = files.map(file => ({ file, settings: readConfig(file) }));
    let settings = {};
    let topPermission;
    let modelValue;
    let variantValue;
    let smallValue;
    let pluginList = [];
    for (const { file, settings: parsed } of settingsByFile) {
        assertSecretFree(parsed);
        validateAgentMaps(parsed, file);
        settings = mergeConfigSettings(settings, parsed);
        if (parsed.permission !== undefined) {
            if (!plainObject(parsed.permission))
                throw new Error('Invalid source permission configuration.');
            topPermission = topPermission === undefined
                ? parsed.permission
                : mergePermissionMaps(topPermission, parsed.permission);
        }
        if (parsed.model !== undefined) {
            modelValue = parsed.model;
            variantValue = parsed.variant;
        }
        if (parsed.small_model !== undefined)
            smallValue = parsed.small_model;
        if (parsed.plugin !== undefined)
            pluginList = sourcePluginList(parsed);
    }
    const model = modelSelection(modelValue, variantValue, 'default model');
    if (!model.ok)
        throw new Error(`Invalid source default model. ${model.reason}`);
    const small = modelSelection(smallValue, undefined, 'small model');
    if (!small.ok)
        throw new Error(`Invalid source small model. ${small.reason}`);
    const { definitions, nonKiki } = sourceDefinitions(settingsByFile);
    return {
        files,
        settingsByFile,
        settings,
        topPermission,
        defaultModel: model.model,
        smallModel: small.model,
        pluginList,
        definitions,
        nonKiki,
    };
}
function destinationState(directory, global) {
    const set = readConfigSet(directory, global);
    validateAgentMaps(set.settings, directory);
    return set;
}
function duplicateDestinationAgents(settings) {
    const duplicates = new Set();
    const native = plainObject(settings.agents) ? settings.agents : {};
    const legacy = plainObject(settings.agent) ? settings.agent : {};
    for (const name of AGENT_NAMES) {
        if (native[name] !== undefined && legacy[name] !== undefined)
            duplicates.add(name);
    }
    return duplicates;
}
function guardGlobal(source, destination) {
    const sourceRoot = canonicalPath(source);
    const destinationRoot = canonicalPath(destination);
    if (pathsOverlap(sourceRoot, destinationRoot)) {
        throw new Error('Refusing to migrate: OC1 source and OC2 destination roots overlap. Isolate every config root before using Kiki 3.');
    }
    assertNotOC1Config(destinationRoot, homedir());
}
function assertDirectory(path, label) {
    if (!existsSync(path) || !statSync(path).isDirectory())
        throw new Error(`${label} directory does not exist: ${path}`);
}
function globalMigration(options) {
    const sourceDir = resolve(options.from || oc1GlobalDirectory());
    const destinationDir = resolve(options.destination);
    guardGlobal(sourceDir, destinationDir);
    assertDirectory(sourceDir, 'Migration source');
    assertDirectory(destinationDir, 'Migration destination');
    const markerFile = markerPath(destinationDir);
    if (existsSync(markerFile) && !options.force) {
        throw new Error('Migration was already completed. Use --force to run again with a fresh backup.');
    }
    const source = readSource(sourceDir, true);
    const destination = destinationState(destinationDir, true);
    const destinationDuplicates = duplicateDestinationAgents(destination.settings);
    const rejected = [];
    const migrated = [];
    const manual = new Set(source.nonKiki);
    const agentPatches = {};
    for (const name of AGENT_NAMES) {
        const definitions = source.definitions.get(name) ?? [];
        if (destinationDuplicates.has(name)) {
            rejected.push({ agent: name, reason: 'Duplicate native and legacy destination definitions.' });
            continue;
        }
        if (!definitions.length)
            continue;
        if (definitions.length > 1) {
            rejected.push({ agent: name, reason: 'Duplicate source definitions.' });
            continue;
        }
        const normalized = sourceAgent(definitions[0].value, source.topPermission, name);
        if (!normalized.ok) {
            rejected.push({ agent: name, reason: normalized.reason });
            continue;
        }
        const nativeNode = plainObject(destination.settings.agents) ? destination.settings.agents[name] : undefined;
        const legacyNode = plainObject(destination.settings.agent) ? destination.settings.agent[name] : undefined;
        let existing = {};
        if (nativeNode !== undefined || legacyNode !== undefined) {
            const normalizedDestination = destinationAgent(nativeNode ?? legacyNode, name);
            if (!normalizedDestination.ok) {
                rejected.push({ agent: name, reason: normalizedDestination.reason });
                continue;
            }
            existing = normalizedDestination.value;
        }
        const patch = {};
        if (normalized.value.model !== undefined) {
            if (existing.model !== undefined && modelKey(existing.model) !== modelKey(normalized.value.model)) {
                rejected.push({ agent: name, reason: 'Conflicting destination model.' });
                continue;
            }
            if (existing.model === undefined)
                patch.model = normalized.value.model;
        }
        if (normalized.value.permissions !== undefined) {
            if (existing.permissions !== undefined
                && rulesKey(existing.permissions) !== rulesKey(normalized.value.permissions)) {
                rejected.push({ agent: name, reason: 'Conflicting destination permissions.' });
                continue;
            }
            if (existing.permissions === undefined)
                patch.permissions = normalized.value.permissions;
        }
        if (legacyNode !== undefined && nativeNode === undefined && Object.keys(patch).length) {
            rejected.push({ agent: name, reason: 'Legacy destination definition cannot be extended safely.' });
            continue;
        }
        if (Object.keys(patch).length)
            agentPatches[name] = patch;
        migrated.push(name);
    }
    const topPatch = {};
    const destinationModel = destination.settings.model;
    if (source.defaultModel && destinationModel === undefined)
        topPatch.model = source.defaultModel;
    if (source.smallModel) {
        const title = plainObject(destination.settings.agents) ? destination.settings.agents.title : undefined;
        const titleModel = plainObject(title) ? title.model : undefined;
        if (titleModel === undefined)
            topPatch.titleModel = source.smallModel;
    }
    let sourceKikiPlugin = false;
    for (const item of source.pluginList) {
        const spec = pluginSpec(item);
        if (!spec)
            throw new Error('Invalid source plugin entry.');
        if (isKikiPluginSpec(spec))
            sourceKikiPlugin = true;
        else
            manual.add(pluginName(spec));
    }
    if (sourceKikiPlugin) {
        const existingPlugins = destinationPluginList(destination.settings);
        if (!existingPlugins.some(item => {
            const spec = pluginSpec(item);
            return spec !== undefined && isKikiPluginSpec(spec);
        })) {
            const base = Array.isArray(destination.settings.plugins) ? destination.settings.plugins : [];
            topPatch.plugins = [...base, 'kiki'];
        }
    }
    const filesToBackup = [...destination.files];
    if (existsSync(markerFile))
        filesToBackup.push(markerFile);
    backup(filesToBackup, destinationDir);
    const target = configTarget(destinationDir, true);
    let text = existsSync(target)
        ? readFileSync(target, 'utf8')
        : '{\n  "$schema": "https://opencode.ai/config.json"\n}\n';
    for (const [name, patch] of Object.entries(agentPatches)) {
        text = patchValue(text, ['agents', name], patch);
    }
    if (topPatch.model !== undefined)
        text = patchValue(text, ['model'], topPatch.model);
    if (topPatch.titleModel !== undefined) {
        text = patchValue(text, ['agents', 'title', 'model'], topPatch.titleModel);
    }
    if (topPatch.plugins !== undefined)
        text = patchValue(text, ['plugins'], topPatch.plugins);
    const changed = !existsSync(target) || text !== readFileSync(target, 'utf8');
    const exitCode = rejected.length ? 1 : 0;
    const report = {
        migrated,
        rejected,
        manual: [...manual].sort(),
        ...(exitCode === 0 ? { marker: markerFile } : {}),
        exitCode,
    };
    const applied = [];
    try {
        if (changed)
            apply(target, text, applied);
        if (exitCode === 0)
            apply(markerFile, markerContent(sourceDir), applied);
    }
    catch (error) {
        restore(applied);
        throw error;
    }
    return report;
}
function readAgentFile(file) {
    const text = readFileSync(file, 'utf8');
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
    if (!match)
        throw new Error(`Invalid agent frontmatter: ${basename(file)}`);
    const settings = parseYaml(match[1], { uniqueKeys: true });
    if (!plainObject(settings))
        throw new Error(`Invalid agent settings: ${basename(file)}`);
    return settings;
}
function localAgentFiles(project) {
    const result = new Map();
    for (const name of AGENT_NAMES) {
        const files = AGENT_DIRECTORIES
            .map(directory => join(project, '.opencode', directory, `${name}.md`))
            .filter(existsSync);
        if (files.length)
            result.set(name, files);
    }
    return result;
}
function nonKikiAgentNames(project) {
    const names = new Set();
    for (const directory of AGENT_DIRECTORIES) {
        const path = join(project, '.opencode', directory);
        if (!existsSync(path) || !statSync(path).isDirectory())
            continue;
        for (const entry of readdirSync(path, { withFileTypes: true })) {
            if (!entry.isFile() || !entry.name.endsWith('.md'))
                continue;
            const name = entry.name.slice(0, -3);
            if (!AGENT_NAMES.includes(name))
                names.add(name);
        }
    }
    return names;
}
function projectPluginFiles(project) {
    return PLUGIN_DIRECTORIES.flatMap(directory => ['kiki.ts', 'kiki.js'].map(file => join(project, '.opencode', directory, file))).filter(existsSync);
}
function routingFile(project) {
    return join(project, '.agentic/kiki/routing.json');
}
function readRouting(project) {
    const file = routingFile(project);
    if (!existsSync(file))
        return {};
    const routing = readConfig(file);
    if (!plainObject(routing.agents)) {
        throw new Error('Legacy routing.json requires an agents map; resolve it before migration.');
    }
    return routing;
}
function projectMigration(options) {
    const project = resolve(options.project);
    const destinationDir = resolve(options.destination);
    assertDirectory(project, 'Project');
    assertDirectory(destinationDir, 'Migration destination');
    const sourceDir = options.from ? resolve(options.from) : oc1GlobalDirectory();
    if (pathsOverlap(canonicalPath(sourceDir), canonicalPath(destinationDir))) {
        throw new Error('Refusing to migrate: OC1 source and OC2 destination roots overlap. Isolate every config root before using Kiki 3.');
    }
    assertNotOC1Config(canonicalPath(destinationDir), homedir());
    const markerFile = markerPath(project);
    if (existsSync(markerFile) && !options.force) {
        throw new Error('Migration was already completed. Use --force to run again with a fresh backup.');
    }
    const globalSource = readSource(sourceDir, false);
    const destination = destinationState(destinationDir, false);
    const duplicates = duplicateDestinationAgents(destination.settings);
    const localFiles = localAgentFiles(project);
    const routing = readRouting(project);
    const rejected = [];
    const migrated = [];
    const manual = new Set([...nonKikiAgentNames(project), ...globalSource.nonKiki]);
    const agentPatches = {};
    const nativeDestination = plainObject(destination.settings.agents) ? destination.settings.agents : {};
    const legacyDestination = plainObject(destination.settings.agent) ? destination.settings.agent : {};
    for (const name of AGENT_NAMES) {
        if (duplicates.has(name)) {
            rejected.push({ agent: name, reason: 'Duplicate native and legacy destination definitions.' });
            continue;
        }
        const files = localFiles.get(name) ?? [];
        if (files.length > 1) {
            rejected.push({ agent: name, reason: 'Duplicate local agent definitions.' });
            continue;
        }
        const local = {};
        try {
            if (files.length) {
                const settings = readAgentFile(files[0]);
                if (settings.permission !== undefined && settings.permissions !== undefined) {
                    throw new Error(`Duplicate native and legacy permissions for ${name}.`);
                }
                const model = modelSelection(settings.model, settings.variant, name);
                if (!model.ok)
                    throw new Error(model.reason);
                if (model.model)
                    local.model = model.model;
                if (settings.permissions !== undefined) {
                    const rules = nativeRules(settings.permissions);
                    if (!rules)
                        throw new Error(`Invalid permission for ${name}.`);
                    local.permissions = rules;
                }
                else if (settings.permission !== undefined) {
                    if (!plainObject(settings.permission))
                        throw new Error(`Invalid permission for ${name}.`);
                    const translated = translatePermissions(settings.permission);
                    if (!translated.ok)
                        throw new Error(translated.reason);
                    local.permissions = translated.rules;
                }
            }
        }
        catch (error) {
            rejected.push({ agent: name, reason: error instanceof Error ? error.message : 'Invalid local definition.' });
            continue;
        }
        const routingModel = plainObject(routing.agents) ? routing.agents[name] : undefined;
        if (local.model === undefined && routingModel !== undefined) {
            const model = modelSelection(routingModel, undefined, name);
            if (!model.ok) {
                rejected.push({ agent: name, reason: model.reason });
                continue;
            }
            if (model.model)
                local.model = model.model;
        }
        const nativeNode = nativeDestination[name];
        const legacyNode = legacyDestination[name];
        let existing = {};
        if (nativeNode !== undefined || legacyNode !== undefined) {
            const normalized = destinationAgent(nativeNode ?? legacyNode, name);
            if (!normalized.ok) {
                rejected.push({ agent: name, reason: normalized.reason });
                continue;
            }
            existing = normalized.value;
        }
        if (legacyNode !== undefined && nativeNode === undefined && object(legacyNode)) {
            const extra = Object.keys(legacyNode)
                .filter(key => !['model', 'variant', 'permission', 'permissions'].includes(key));
            if (extra.length) {
                rejected.push({ agent: name, reason: 'Legacy destination definition has unsupported fields.' });
                continue;
            }
        }
        if (local.permissions !== undefined && existing.permissions === undefined) {
            let inherited = [];
            if (globalSource.files.length) {
                const definitions = globalSource.definitions.get(name) ?? [];
                if (definitions.length > 1) {
                    rejected.push({ agent: name, reason: 'Duplicate global source definitions.' });
                    continue;
                }
                if (definitions.length) {
                    const normalized = sourceAgent(definitions[0].value, globalSource.topPermission, name);
                    if (!normalized.ok) {
                        rejected.push({ agent: name, reason: normalized.reason });
                        continue;
                    }
                    inherited = normalized.value.permissions ?? [];
                }
                else if (globalSource.topPermission !== undefined) {
                    const translated = translatePermissions(globalSource.topPermission);
                    if (!translated.ok) {
                        rejected.push({ agent: name, reason: translated.reason });
                        continue;
                    }
                    inherited = translated.rules;
                }
            }
            local.permissions = projectPermissionRules(local.permissions, inherited);
        }
        const patch = {};
        const hasNative = nativeNode !== undefined;
        if (existing.model !== undefined) {
            if (!hasNative || nativeNode.model === undefined)
                patch.model = existing.model;
        }
        else if (local.model !== undefined) {
            patch.model = local.model;
        }
        if (existing.permissions !== undefined) {
            if (!hasNative || nativeNode.permissions === undefined)
                patch.permissions = existing.permissions;
        }
        else if (local.permissions !== undefined) {
            patch.permissions = local.permissions;
        }
        if (Object.keys(patch).length)
            agentPatches[name] = patch;
        if (Object.keys(patch).length || nativeNode !== undefined || legacyNode !== undefined)
            migrated.push(name);
    }
    const target = configTarget(destinationDir, false);
    const fileTexts = new Map();
    for (const file of destination.files)
        fileTexts.set(file, readFileSync(file, 'utf8'));
    if (!fileTexts.has(target)) {
        fileTexts.set(target, '{\n  "$schema": "https://opencode.ai/config.json"\n}\n');
    }
    let targetText = fileTexts.get(target);
    for (const [name, patch] of Object.entries(agentPatches)) {
        targetText = patchValue(targetText, ['agents', name], patch);
    }
    fileTexts.set(target, targetText);
    const exitCode = rejected.length ? 1 : 0;
    if (exitCode === 0) {
        for (const [file, text] of fileTexts) {
            let updated = text;
            const current = parseJsonc(updated);
            for (const name of AGENT_NAMES) {
                if (plainObject(current?.agent) && current.agent[name] !== undefined) {
                    updated = patchValue(updated, ['agent', name], undefined);
                }
            }
            const parsed = parseJsonc(updated);
            if (plainObject(parsed?.plugin) && Array.isArray(parsed.plugin)) {
                const filtered = parsed.plugin.filter((item) => {
                    const spec = pluginSpec(item);
                    return spec === undefined || !isKikiPluginSpec(spec);
                });
                updated = patchValue(updated, ['plugin'], filtered.length ? filtered : undefined);
            }
            fileTexts.set(file, updated);
        }
    }
    const filesToRemove = new Set();
    if (exitCode === 0) {
        for (const files of localFiles.values())
            for (const file of files)
                filesToRemove.add(file);
        for (const file of projectPluginFiles(project))
            filesToRemove.add(file);
        if (existsSync(routingFile(project)))
            filesToRemove.add(routingFile(project));
    }
    const backupFiles = [...new Set([
            ...destination.files, ...filesToRemove, ...(existsSync(markerFile) ? [markerFile] : []),
        ])].filter(existsSync);
    backup(backupFiles, project);
    const writes = [];
    for (const [file, text] of fileTexts) {
        if (existsSync(file)) {
            if (readFileSync(file, 'utf8') !== text)
                writes.push({ file, content: text });
        }
        else if (text !== '{\n  "$schema": "https://opencode.ai/config.json"\n}\n') {
            writes.push({ file, content: text });
        }
    }
    const report = {
        migrated,
        rejected,
        manual: [...manual].sort(),
        ...(exitCode === 0 ? { marker: markerFile } : {}),
        exitCode,
    };
    const applied = [];
    try {
        for (const write of writes)
            apply(write.file, write.content, applied);
        for (const file of filesToRemove)
            if (existsSync(file))
                remove(file, applied);
        if (exitCode === 0)
            apply(markerFile, markerContent(project), applied);
    }
    catch (error) {
        restore(applied);
        throw error;
    }
    return report;
}
/**
 * One-time, fail-closed extraction from an OC1 configuration. Global mode is
 * read-only at the source; project mode removes redundant Kiki-only local
 * copies only after every eligible agent succeeded.
 */
export function migrateOC1(options) {
    if (options.project !== undefined)
        return projectMigration(options);
    return globalMigration(options);
}
//# sourceMappingURL=oc2-migration.js.map