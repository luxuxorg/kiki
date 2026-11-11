import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync, } from 'fs';
import { dirname, isAbsolute, join, resolve, sep } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { applyEdits, modify, parse as parseJsonc } from 'jsonc-parser';
import { assertNotOC1Config, canonicalPath } from './oc2-paths.js';
const SERVER_CONFIG_NAMES = ['opencode.json', 'opencode.jsonc'];
const CLI_CONFIG_NAMES = ['cli.json', 'cli.jsonc'];
const KIKI_PACKAGE_NAME = 'kiki';
const BACKUP_DIRECTORY = 'kiki/backups';
function object(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
function pluginSpec(entry) {
    if (typeof entry === 'string')
        return entry;
    if (Array.isArray(entry) && typeof entry[0] === 'string')
        return entry[0];
    if (object(entry) && typeof entry.package === 'string')
        return entry.package;
    return undefined;
}
/** Known Kiki package names, versions, local directories and V1 source files. */
export function isKikiPluginEntry(entry, activePackageSpec = currentPackageSpec()) {
    const spec = pluginSpec(entry);
    if (spec === undefined)
        return false;
    const clean = spec.split('#')[0].split('?')[0].replace(/\\/g, '/');
    if (clean === KIKI_PACKAGE_NAME || clean.startsWith(`${KIKI_PACKAGE_NAME}@`))
        return true;
    if (isAbsolute(clean) && samePackageSpec(clean, activePackageSpec))
        return true;
    const name = clean.split('/').filter(Boolean).pop() || '';
    return name === KIKI_PACKAGE_NAME || name === 'kiki.ts' || name === 'kiki.js'
        || name.startsWith(`${KIKI_PACKAGE_NAME}@`);
}
function samePackageSpec(first, second) {
    if (first === second)
        return true;
    if (isAbsolute(first) && isAbsolute(second))
        return canonicalPath(first) === canonicalPath(second);
    return false;
}
function readConfig(file) {
    if (!existsSync(file))
        return undefined;
    const errors = [];
    const data = parseJsonc(readFileSync(file, 'utf8'), errors, { allowTrailingComma: true });
    if (errors.length || !object(data) || Object.getPrototypeOf(data) !== Object.prototype) {
        throw new Error(`Invalid OpenCode configuration: ${file}`);
    }
    for (const key of ['plugins', 'plugin']) {
        if (data[key] === undefined)
            continue;
        if (!Array.isArray(data[key]))
            throw new Error(`Invalid plugin configuration: ${file}`);
        for (const entry of data[key]) {
            if (pluginSpec(entry) === undefined)
                throw new Error(`Invalid plugin entry: ${file}`);
        }
    }
    return data;
}
function configFiles(directory, names) {
    return names.map(name => join(directory, name)).filter(existsSync);
}
function targetConfig(directory, names, fallback) {
    return configFiles(directory, names).at(-1) ?? join(directory, fallback);
}
function patchValue(text, path, value) {
    let current = parseJsonc(text);
    for (const key of path)
        current = current?.[key];
    if (JSON.stringify(current) === JSON.stringify(value))
        return text;
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
function backupFiles(files, directory) {
    const existing = [...new Set(files.filter(existsSync))];
    if (!existing.length)
        return;
    const target = join(directory, BACKUP_DIRECTORY, randomUUID());
    mkdirSync(target, { recursive: true, mode: 0o700 });
    writeFileSync(join(directory, BACKUP_DIRECTORY, '.gitignore'), '*\n', { mode: 0o600 });
    for (const [index, file] of existing.entries()) {
        writeFileSync(join(target, `${index}-${file.split(/[\\/]/).pop()}`), readFileSync(file), { mode: 0o600 });
    }
    writeFileSync(join(target, 'manifest.json'), JSON.stringify(existing, null, 2), { mode: 0o600 });
}
function newServerConfig() {
    return '{\n  "$schema": "https://opencode.ai/config.json"\n}\n';
}
function guard(directory) {
    // Installation/update owns the documented V1 artifacts and may back them up
    // and replace them.
    assertNotOC1Config(canonicalPath(directory), homedir(), { allowKnownV1Artifacts: true });
}
function collectConfigSources(directory, names) {
    const result = [];
    for (const file of configFiles(directory, names)) {
        const settings = readConfig(file);
        if (!settings)
            continue;
        for (const key of ['plugins', 'plugin']) {
            const entries = settings[key];
            if (!Array.isArray(entries))
                continue;
            for (const entry of entries) {
                if (isKikiPluginEntry(entry))
                    result.push({ file, entry });
            }
        }
    }
    return result;
}
/** Kiki package entries configured in server opencode.json(c) files. */
export function kikiServerSources(directory) {
    return collectConfigSources(directory, SERVER_CONFIG_NAMES);
}
/** Kiki package entries configured in cli.json(c) files. */
export function kikiCliSources(directory) {
    return collectConfigSources(directory, CLI_CONFIG_NAMES);
}
/** Auto-discovered V1 source files that OC2 would load alongside a package entry. */
export function autoDiscoveredKikiPlugins(directory) {
    return ['plugin', 'plugins'].flatMap(folder => ['kiki.ts', 'kiki.js'].map(file => join(directory, folder, file))).filter(existsSync);
}
export function hasKikiServerRegistration(directory) {
    return kikiServerSources(directory).length > 0;
}
export function hasKikiCliRegistration(directory) {
    return kikiCliSources(directory).length > 0;
}
export function currentPackageDirectory() {
    return resolve(dirname(fileURLToPath(import.meta.url)), '../..');
}
/**
 * Development/checkout installations use the absolute package directory; a
 * package-managed installation uses its package name for `opencode plugin add`.
 */
export function currentPackageSpec() {
    const root = currentPackageDirectory();
    let name = KIKI_PACKAGE_NAME;
    try {
        const parsed = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
        if (object(parsed) && typeof parsed.name === 'string' && parsed.name.trim())
            name = parsed.name.trim();
    }
    catch {
        // Fall back to the fixed package name.
    }
    return root.split(sep).includes('node_modules') ? name : root;
}
function registrationEntry(directory, names, fallback, packageSpec, defaultText) {
    const sources = collectConfigSources(directory, names);
    if (sources.length > 1) {
        throw new Error('Duplicate Kiki plugin registration. Remove the extra entry before installing.');
    }
    if (sources.length === 1) {
        const existing = pluginSpec(sources[0].entry);
        if (!samePackageSpec(existing, packageSpec)) {
            throw new Error('Conflicting Kiki plugin registration. Remove the existing entry before installing.');
        }
        return undefined;
    }
    const file = targetConfig(directory, names, fallback);
    const before = existsSync(file) ? readFileSync(file, 'utf8') : defaultText;
    const settings = readConfig(file) ?? {};
    const current = Array.isArray(settings.plugins) ? settings.plugins : [];
    // Appending at the array tail preserves comments inside existing entries.
    const text = Array.isArray(settings.plugins)
        ? applyEdits(before, modify(before, ['plugins', -1], packageSpec, {
            isArrayInsertion: true,
            formattingOptions: { insertSpaces: true, tabSize: 2 },
        }))
        : patchValue(before, ['plugins'], [...current, packageSpec]);
    return text === before && existsSync(file) ? undefined : { file, text };
}
/**
 * Plan once-only package registration for the server plugin and the TUI plugin.
 * Conflicting entries are refused instead of silently replaced.
 */
export function prepareRegistration(directory, packageSpec) {
    if (typeof packageSpec !== 'string' || !packageSpec.trim())
        throw new Error('Invalid Kiki package specification.');
    guard(directory);
    const server = registrationEntry(directory, SERVER_CONFIG_NAMES, 'opencode.jsonc', packageSpec, newServerConfig());
    const cli = registrationEntry(directory, CLI_CONFIG_NAMES, 'cli.json', packageSpec, '{}\n');
    const writes = [server, cli].filter((entry) => entry !== undefined);
    return {
        files: writes.map(entry => entry.file),
        apply() {
            for (const write of writes)
                writeAtomic(write.file, write.text);
        },
    };
}
/** Remove only known Kiki entries; unrelated plugins and comments survive. */
export function removeKikiRegistration(directory) {
    guard(directory);
    const changes = [];
    for (const names of [SERVER_CONFIG_NAMES, CLI_CONFIG_NAMES]) {
        for (const file of configFiles(directory, names)) {
            const before = readFileSync(file, 'utf8');
            const settings = readConfig(file) ?? {};
            let text = before;
            for (const key of ['plugins', 'plugin']) {
                const entries = settings[key];
                if (!Array.isArray(entries))
                    continue;
                const filtered = entries.filter(entry => !isKikiPluginEntry(entry));
                if (filtered.length === entries.length)
                    continue;
                text = patchValue(text, [key], filtered.length ? filtered : undefined);
            }
            if (text !== before)
                changes.push({ file, text });
        }
    }
    if (!changes.length)
        return;
    backupFiles(changes.map(change => change.file), directory);
    for (const change of changes)
        writeAtomic(change.file, change.text);
}
//# sourceMappingURL=oc2-registration.js.map