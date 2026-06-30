import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
export const AGENTIC_KIKI_DIR = '.agentic/kiki';
export const GLOBAL_KIKI_DIR = join(homedir(), '.config', 'opencode', 'kiki', 'defaults');
/**
 * Resolve a Kiki config file using priority order:
 * 1. .agentic/kiki/<filename>  (new per-project location)
 * 2. .agentic/<filename>        (legacy fallback)
 * 3. ~/.config/opencode/kiki/defaults/<filename>  (global defaults)
 *
 * If none exist, returns the .agentic/kiki/ path (caller can create it).
 */
export function resolveKikiFile(filename, projectRoot) {
    const kikiPath = join(projectRoot, AGENTIC_KIKI_DIR, filename);
    if (existsSync(kikiPath)) {
        return kikiPath;
    }
    const legacyPath = join(projectRoot, '.agentic', filename);
    if (existsSync(legacyPath)) {
        return legacyPath;
    }
    const globalPath = join(GLOBAL_KIKI_DIR, filename);
    if (existsSync(globalPath)) {
        return globalPath;
    }
    return kikiPath;
}
/**
 * Check whether a project has any Kiki configuration.
 * Returns 'kiki' | 'legacy' | 'global' | null.
 */
export function detectKikiConfig(projectRoot) {
    const kikiPath = join(projectRoot, AGENTIC_KIKI_DIR, 'config.json');
    if (existsSync(kikiPath))
        return 'kiki';
    const legacyPath = join(projectRoot, '.agentic', 'config.json');
    if (existsSync(legacyPath))
        return 'legacy';
    const globalPath = join(GLOBAL_KIKI_DIR, 'config.json');
    if (existsSync(globalPath))
        return 'global';
    return null;
}
//# sourceMappingURL=path-resolver.js.map