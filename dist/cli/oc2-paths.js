import { existsSync, realpathSync, statSync } from 'fs';
import { basename, dirname, join, resolve, sep } from 'path';
function xdgBase(env, name, home, fallback) {
    const configured = env[name];
    return configured ? configured : join(home, ...fallback);
}
/**
 * Resolve OpenCode 2's global roots exactly like the pinned upstream runtime:
 * every XDG root gets the `opencode` suffix and OPENCODE_CONFIG_DIR overrides
 * only the config root.
 */
export function resolveOC2Roots(env, home) {
    return {
        config: env.OPENCODE_CONFIG_DIR || join(xdgBase(env, 'XDG_CONFIG_HOME', home, ['.config']), 'opencode'),
        data: join(xdgBase(env, 'XDG_DATA_HOME', home, ['.local', 'share']), 'opencode'),
        cache: join(xdgBase(env, 'XDG_CACHE_HOME', home, ['.cache']), 'opencode'),
        state: join(xdgBase(env, 'XDG_STATE_HOME', home, ['.local', 'state']), 'opencode'),
    };
}
/**
 * Canonicalize a destination that may not exist yet by resolving the nearest
 * existing parent. This makes symlinked ancestors and absent destinations
 * comparable before a write happens.
 */
export function canonicalPath(target) {
    let current = resolve(target);
    const suffix = [];
    while (!existsSync(current)) {
        const parent = dirname(current);
        if (parent === current)
            return current;
        suffix.unshift(basename(current));
        current = parent;
    }
    let real = current;
    try {
        real = realpathSync(current);
    }
    catch {
        // Keep the resolved path when the existing parent cannot be canonicalized.
    }
    return suffix.length ? join(real, ...suffix) : real;
}
/** True when two canonical destinations are equal or nested within each other. */
export function pathsOverlap(first, second) {
    return first === second || first.startsWith(second + sep) || second.startsWith(first + sep);
}
const OC1_MARKER_FILES = [
    ['plugins', 'kiki.ts'],
    ['plugins', 'kiki.js'],
    ['tui.json'],
    ['tui.jsonc'],
    ['kiki', 'tui.js'],
];
const CONFIG_FILES = ['opencode.json', 'opencode.jsonc'];
/**
 * Metadata-only detection of a live OpenCode 1 Kiki installation. Config files
 * are deliberately not parsed here because they can contain provider
 * credentials; a credential-bearing config must be exported sanitized by the
 * user instead of being inspected by Kiki.
 */
export function hasOC1Markers(directory) {
    for (const parts of OC1_MARKER_FILES) {
        if (existsSync(join(directory, ...parts)))
            return true;
    }
    try {
        if (statSync(join(directory, 'kiki', 'prompts')).isDirectory())
            return true;
    }
    catch {
        // Absent V1 prompt directory.
    }
    return false;
}
/** Existence-only check; the file is never opened because it may carry credentials. */
function hasConfigFile(directory) {
    return CONFIG_FILES.some(name => existsSync(join(directory, name)));
}
/**
 * Fail closed when a target is, contains, or is contained by the machine-default
 * config directory and that directory cannot be proven Kiki-free using metadata
 * alone. The machine-default config may hold OC1's singular `agent.kiki-*`
 * entries next to provider credentials; metadata cannot distinguish them, so
 * Kiki refuses and asks for a user-created secret-free export instead of
 * parsing a possibly credential-bearing file.
 */
export function assertNotOC1Config(target, home, options = {}) {
    const directory = canonicalPath(target);
    const machineDefault = canonicalPath(join(home, '.config', 'opencode'));
    const overlapsDefault = pathsOverlap(directory, machineDefault);
    const markers = hasOC1Markers(directory);
    const allowStaleCleanup = options.allowKnownV1Artifacts === true && !overlapsDefault;
    if ((markers && !allowStaleCleanup) || (overlapsDefault && hasOC1Markers(machineDefault))) {
        throw new Error('Refusing to modify an existing OpenCode 1 (V1) Kiki installation. Use the isolated OpenCode 2 wrapper (OPENCODE_CONFIG_DIR and private XDG roots).');
    }
    if (overlapsDefault && hasConfigFile(machineDefault)) {
        throw new Error('Refusing to inspect a possibly credential-bearing OpenCode 1 configuration. Create a secret-free export before Kiki 3 touches the machine-default config directory.');
    }
}
/**
 * Fail closed before Kiki 3.0.0 reads or writes an OpenCode 2 destination.
 * Refuses overlapping config/data/cache/state roots and any root that aliases
 * or nests inside a live OpenCode 1 installation.
 */
export function assertOC2Target(roots, home, options = {}) {
    const entries = Object.entries(roots);
    const canonical = {};
    for (const [scope, directory] of entries) {
        if (typeof directory !== 'string' || !directory.trim()) {
            throw new Error('Invalid OpenCode 2 root configuration.');
        }
        canonical[scope] = canonicalPath(directory);
    }
    for (let first = 0; first < entries.length; first += 1) {
        for (let second = first + 1; second < entries.length; second += 1) {
            if (pathsOverlap(canonical[entries[first][0]], canonical[entries[second][0]])) {
                throw new Error('Refusing to run: OpenCode 2 config/data/cache/state roots overlap. Isolate every XDG root before using Kiki 3.');
            }
        }
    }
    assertNotOC1Config(canonical.config, home, options);
}
//# sourceMappingURL=oc2-paths.js.map