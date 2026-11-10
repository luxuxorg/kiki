import * as fs from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { parse as parseJsonc } from 'jsonc-parser';
import { parse as parseYaml } from 'yaml';
import { resolveOC2Roots } from './oc2-paths.js';
/**
 * Skills the Kiki agent templates require. The last entry is a user-level
 * skill rather than a superpowers skill; it is included because the
 * gui-designer template requires it.
 */
export const REQUIRED_SKILLS = [
    'brainstorming',
    'writing-plans',
    'executing-plans',
    'test-driven-development',
    'systematic-debugging',
    'receiving-code-review',
    'requesting-code-review',
    'ui-ux-pro-max',
];
/**
 * Version Kiki's agent templates were last verified against. This is an
 * observation, never a support floor or compatibility guarantee.
 */
export const TESTED_SUPERPOWERS_VERSION = '7.0.1';
const SKILL_FILE = 'SKILL.md';
const CONFIG_NAMES = ['opencode.json', 'opencode.jsonc'];
const SKILL_ROOT_NAMES = ['skill', 'skills'];
const MAX_CACHE_DEPTH = 6;
const NUMERIC_IDENTIFIER = /^(?:0|[1-9]\d*)/;
const IDENTIFIER_CHARACTERS = /^[0-9A-Za-z-]+/;
const DIGITS_ONLY = /^\d+/;
function isMissingError(error) {
    const code = error?.code;
    return code === 'ENOENT' || code === 'ENOTDIR';
}
function sortEntries(entries) {
    return [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
function isDirectory(path, skipped) {
    try {
        return fs.statSync(path).isDirectory();
    }
    catch {
        skipped.count++;
        return false;
    }
}
function record(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function readConfig(file) {
    try {
        const parsed = parseJsonc(fs.readFileSync(file, 'utf8'), [], { allowTrailingComma: true });
        return record(parsed) ? parsed : undefined;
    }
    catch {
        return undefined;
    }
}
/** Nearest ancestor carrying package.json, for observation-only version reads. */
function packageRootFor(directory) {
    let current = resolve(directory);
    for (;;) {
        try {
            if (fs.statSync(join(current, 'package.json')).isFile())
                return current;
        }
        catch {
            // Continue with the parent.
        }
        const parent = dirname(current);
        if (parent === current)
            return undefined;
        current = parent;
    }
}
function projectChain(project) {
    const chain = [];
    let current = resolve(project);
    for (;;) {
        chain.push(current);
        const parent = dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
    return chain;
}
function configDocuments(project, global) {
    const documents = [];
    const read = (file, scope, directory) => {
        if (!fs.existsSync(file))
            return;
        const settings = readConfig(file);
        if (settings)
            documents.push({ file, scope, directory, settings });
    };
    for (const name of CONFIG_NAMES)
        read(join(global, name), 'global', global);
    const projectRoot = resolve(project);
    for (const directory of projectChain(project)) {
        const scope = directory === projectRoot ? 'project' : 'ancestor';
        for (const name of CONFIG_NAMES)
            read(join(directory, name), scope, directory);
        for (const name of CONFIG_NAMES)
            read(join(directory, '.opencode', name), scope, join(directory, '.opencode'));
    }
    return documents;
}
function configSkillPaths(project, global, home) {
    const result = [];
    const seen = new Set();
    for (const document of configDocuments(project, global)) {
        const items = document.settings.skills;
        if (!Array.isArray(items))
            continue;
        for (const item of items) {
            if (typeof item !== 'string' || !item.trim())
                continue;
            if (/^https?:\/\//i.test(item))
                continue; // Cached URL skills are scanned from the cache root.
            const expanded = item.startsWith('~/') ? join(home, item.slice(2)) : item;
            const path = isAbsolute(expanded) ? resolve(expanded) : resolve(project, expanded);
            if (seen.has(path))
                continue;
            seen.add(path);
            result.push(path);
        }
    }
    return result;
}
/**
 * Read-only discovery of required skills in the native OC2 locations:
 * config `skill/` and `skills/` directories, explicit config `skills` paths and
 * the isolated URL-skill cache. V1 package-cache directories are never treated
 * as evidence that a skill is live.
 */
export function discoverSkills(project, env = process.env) {
    const byName = Object.fromEntries(REQUIRED_SKILLS.map(name => [name, []]));
    const skipped = { count: 0 };
    const traversalDirectories = new Set();
    const skillDirectories = new Set();
    const home = env.HOME ? resolve(env.HOME) : resolve(homedir());
    const roots = resolveOC2Roots(env, home);
    const recordSkill = (directory, packageRoot, source) => recordSkillCopy(directory, packageRoot, source ?? 'config-directory', byName, skillDirectories, skipped);
    // Project `.opencode` directories are the config directories OC2 registers
    // for skills; nearest project first, then every ancestor `.opencode`.
    for (const directory of projectChain(project)) {
        for (const name of SKILL_ROOT_NAMES) {
            scanSkillRoot(join(directory, '.opencode', name), recordSkill, skipped);
        }
    }
    // Global config directory skill roots.
    for (const name of SKILL_ROOT_NAMES)
        scanSkillRoot(join(roots.config, name), recordSkill, skipped);
    // Explicit config `skills` paths (project entries first).
    for (const directory of configSkillPaths(project, roots.config, home)) {
        const packageRoot = packageRootFor(directory);
        scanSkillTree(directory, recordSkill, packageRoot, 'config-skills', traversalDirectories, skipped);
    }
    // Isolated URL-skill cache: <global cache>/skills/<hash>/<skill-name>.
    scanSkillTree(join(roots.cache, 'skills'), recordSkill, undefined, 'url-cache', traversalDirectories, skipped);
    return { byName, skippedEntries: skipped.count };
}
/**
 * Turn a discovery result into warning-only observations. Missing skills,
 * name drift and version differences are warnings; duplicate copies are
 * informational. No observation changes doctor's exit status.
 */
export function observeSkills(discovery) {
    const observations = [];
    for (const name of REQUIRED_SKILLS) {
        const copies = discovery.byName[name] ?? [];
        if (copies.length === 0) {
            observations.push({
                level: 'warn',
                label: `skill ${name}`,
                detail: name === 'ui-ux-pro-max'
                    ? 'not found on disk; add the ui-ux-pro-max skill to an OpenCode config skills/ directory or config skills list'
                    : 'not found on disk; add the superpowers skills to an OpenCode config skills/ directory or config skills list',
            });
            continue;
        }
        const first = copies[0];
        if (first.nameDrift) {
            observations.push({
                level: 'warn',
                label: `skill ${name}`,
                detail: first.frontmatterName === undefined
                    ? 'name drift: no readable frontmatter name'
                    : `name drift: frontmatter says '${first.frontmatterName}'`,
            });
        }
        else {
            const suffix = first.source === 'config-directory'
                ? 'config skills directory'
                : first.source === 'config-skills' ? 'configured skills path; disk-only' : 'URL cache; disk-only';
            observations.push({
                level: 'pass',
                label: `skill ${name}`,
                detail: `found at ${first.path} (${suffix})`,
            });
        }
        if (copies.length > 1) {
            observations.push({
                level: 'info',
                label: `skill ${name} duplicate copies`,
                detail: `${copies.length} copies found; using ${first.path}`,
            });
        }
    }
    // ui-ux-pro-max is a user-level skill, not a superpowers package member;
    // its location must not be mistaken for a superpowers version source.
    const packageRoots = new Set();
    for (const name of REQUIRED_SKILLS) {
        if (name === 'ui-ux-pro-max')
            continue;
        for (const copy of discovery.byName[name] ?? []) {
            if (copy.packageRoot)
                packageRoots.add(resolve(copy.packageRoot));
        }
    }
    if (packageRoots.size === 0) {
        observations.push(unknownVersion());
    }
    else {
        for (const packageRoot of [...packageRoots].sort()) {
            observations.push(observePackageVersion(packageRoot));
        }
    }
    return observations;
}
function observePackageVersion(packageRoot) {
    let raw;
    try {
        raw = JSON.parse(fs.readFileSync(join(packageRoot, 'package.json'), 'utf8'));
    }
    catch {
        return unknownVersion();
    }
    const value = record(raw) ? raw.version : undefined;
    const parsed = parseVersion(value);
    if (!parsed)
        return unknownVersion();
    if (parsed.prerelease) {
        return {
            level: 'warn',
            label: 'superpowers version',
            detail: `observed superpowers ${parsed.version} (prerelease); Kiki agents were tested against ${TESTED_SUPERPOWERS_VERSION} — re-verify skill behavior after any superpowers change`,
        };
    }
    if (parsed.version === TESTED_SUPERPOWERS_VERSION) {
        return {
            level: 'pass',
            label: 'superpowers version',
            detail: `${parsed.version} (matches tested version)`,
        };
    }
    return {
        level: 'warn',
        label: 'superpowers version',
        detail: `observed superpowers ${parsed.version}; Kiki agents were tested against ${TESTED_SUPERPOWERS_VERSION} — re-verify skill behavior after any superpowers change`,
    };
}
function unknownVersion() {
    return {
        level: 'warn',
        label: 'superpowers version',
        detail: 'version unknown (unreadable package.json)',
    };
}
function matchesEntire(pattern, value) {
    return pattern.exec(value)?.[0] === value;
}
function parseVersion(value) {
    if (typeof value !== 'string')
        return undefined;
    let main = value;
    const buildIndex = value.indexOf('+');
    if (buildIndex !== -1) {
        const build = value.slice(buildIndex + 1);
        main = value.slice(0, buildIndex);
        if (!build || !build.split('.').every(identifier => matchesEntire(IDENTIFIER_CHARACTERS, identifier))) {
            return undefined;
        }
    }
    let prerelease;
    const prereleaseIndex = main.indexOf('-');
    if (prereleaseIndex !== -1) {
        prerelease = main.slice(prereleaseIndex + 1);
        main = main.slice(0, prereleaseIndex);
        if (!prerelease)
            return undefined;
        for (const identifier of prerelease.split('.')) {
            if (!identifier)
                return undefined;
            if (matchesEntire(DIGITS_ONLY, identifier)) {
                // Numeric prerelease identifiers never have leading zeros.
                if (!matchesEntire(NUMERIC_IDENTIFIER, identifier))
                    return undefined;
            }
            else if (!matchesEntire(IDENTIFIER_CHARACTERS, identifier)) {
                return undefined;
            }
        }
    }
    const core = main.split('.');
    if (core.length !== 3 || !core.every(identifier => matchesEntire(NUMERIC_IDENTIFIER, identifier))) {
        return undefined;
    }
    return { version: value, prerelease: prerelease !== undefined };
}
function scanSkillRoot(directory, record, skipped) {
    const root = resolve(directory);
    let entries;
    try {
        entries = fs.readdirSync(root, { withFileTypes: true });
    }
    catch (error) {
        // Missing roots are normal; access failures (including an inaccessible
        // ancestor, where existsSync would return false) are skipped-counted.
        if (!isMissingError(error))
            skipped.count++;
        return;
    }
    for (const entry of sortEntries(entries)) {
        const child = join(root, entry.name);
        if (!isDirectory(child, skipped))
            continue;
        record(child);
    }
}
function scanSkillTree(directory, record, packageRoot, source, traversalDirectories, skipped) {
    const root = resolve(directory);
    let realRoot;
    try {
        realRoot = fs.realpathSync(root);
    }
    catch (error) {
        if (!isMissingError(error))
            skipped.count++;
        return;
    }
    if (traversalDirectories.has(realRoot))
        return;
    traversalDirectories.add(realRoot);
    walkSkillTree(root, 0, record, packageRoot, source, traversalDirectories, skipped);
}
function walkSkillTree(directory, depth, record, packageRoot, source, traversalDirectories, skipped) {
    if (depth > MAX_CACHE_DEPTH)
        return;
    try {
        if (fs.statSync(join(directory, SKILL_FILE)).isFile()
            || fs.statSync(join(directory, `${basename(directory)}.md`)).isFile()) {
            record(directory, packageRoot, source);
            return;
        }
    }
    catch {
        // No entry file here; inspect children.
    }
    let entries;
    try {
        entries = fs.readdirSync(directory, { withFileTypes: true });
    }
    catch {
        skipped.count++;
        return;
    }
    for (const entry of sortEntries(entries)) {
        if (entry.name.startsWith('.'))
            continue;
        const child = join(directory, entry.name);
        let realChild;
        try {
            realChild = fs.realpathSync(child);
        }
        catch {
            skipped.count++;
            continue;
        }
        if (!isDirectory(realChild, skipped))
            continue;
        if (traversalDirectories.has(realChild))
            continue;
        traversalDirectories.add(realChild);
        if (depth + 1 > MAX_CACHE_DEPTH)
            continue;
        walkSkillTree(child, depth + 1, record, packageRoot, source, traversalDirectories, skipped);
    }
}
function recordSkillCopy(directory, packageRoot, source, byName, skillDirectories, skipped) {
    const resolvedDirectory = resolve(directory);
    let realDirectory;
    try {
        realDirectory = fs.realpathSync(resolvedDirectory);
    }
    catch {
        skipped.count++;
        return;
    }
    if (skillDirectories.has(realDirectory))
        return;
    skillDirectories.add(realDirectory);
    let path = join(resolvedDirectory, SKILL_FILE);
    let text;
    try {
        text = fs.readFileSync(path, 'utf8');
    }
    catch (error) {
        if (!isMissingError(error)) {
            skipped.count++;
            return;
        }
        // A URL-cache entry may use <name>.md instead of SKILL.md.
        const alternate = join(resolvedDirectory, `${basename(resolvedDirectory)}.md`);
        try {
            text = fs.readFileSync(alternate, 'utf8');
            path = alternate;
        }
        catch {
            skipped.count++;
            return;
        }
    }
    const frontmatter = parseFrontmatter(text);
    const frontmatterName = typeof frontmatter?.name === 'string' ? frontmatter.name : undefined;
    const directoryName = basename(resolvedDirectory);
    for (const required of REQUIRED_SKILLS) {
        const matchesFrontmatter = frontmatterName === required;
        const matchesDirectory = directoryName === required;
        if (!matchesFrontmatter && !matchesDirectory)
            continue;
        const copy = {
            path,
            directoryName,
            frontmatterName,
            nameDrift: !matchesFrontmatter,
            source,
        };
        if (packageRoot)
            copy.packageRoot = packageRoot;
        byName[required].push(copy);
    }
}
function parseFrontmatter(text) {
    const match = text.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!match)
        return undefined;
    try {
        const parsed = parseYaml(match[1], { uniqueKeys: false });
        return record(parsed) ? parsed : undefined;
    }
    catch {
        // Unreadable frontmatter falls back to the directory name with drift.
        return undefined;
    }
}
//# sourceMappingURL=doctor-skills.js.map