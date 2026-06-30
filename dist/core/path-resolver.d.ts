export declare const AGENTIC_KIKI_DIR = ".agentic/kiki";
export declare const GLOBAL_KIKI_DIR: string;
/**
 * Resolve a Kiki config file using priority order:
 * 1. .agentic/kiki/<filename>  (new per-project location)
 * 2. .agentic/<filename>        (legacy fallback)
 * 3. ~/.config/opencode/kiki/defaults/<filename>  (global defaults)
 *
 * If none exist, returns the .agentic/kiki/ path (caller can create it).
 */
export declare function resolveKikiFile(filename: string, projectRoot: string): string;
/**
 * Check whether a project has any Kiki configuration.
 * Returns 'kiki' | 'legacy' | 'global' | null.
 */
export declare function detectKikiConfig(projectRoot: string): 'kiki' | 'legacy' | 'global' | null;
//# sourceMappingURL=path-resolver.d.ts.map