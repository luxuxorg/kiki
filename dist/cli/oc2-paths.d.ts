export interface OC2Roots {
    config: string;
    data: string;
    cache: string;
    state: string;
}
/**
 * Resolve OpenCode 2's global roots exactly like the pinned upstream runtime:
 * every XDG root gets the `opencode` suffix and OPENCODE_CONFIG_DIR overrides
 * only the config root.
 */
export declare function resolveOC2Roots(env: NodeJS.ProcessEnv, home: string): OC2Roots;
/**
 * Canonicalize a destination that may not exist yet by resolving the nearest
 * existing parent. This makes symlinked ancestors and absent destinations
 * comparable before a write happens.
 */
export declare function canonicalPath(target: string): string;
/** True when two canonical destinations are equal or nested within each other. */
export declare function pathsOverlap(first: string, second: string): boolean;
/**
 * Fail closed before Kiki 3.0.0 reads or writes an OpenCode 2 destination.
 * Refuses overlapping config/data/cache/state roots.
 */
export declare function assertOC2Target(roots: OC2Roots): void;
//# sourceMappingURL=oc2-paths.d.ts.map