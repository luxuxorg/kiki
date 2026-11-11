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
 * Metadata-only detection of a live OpenCode 1 Kiki installation. Config files
 * are deliberately not parsed here because they can contain provider
 * credentials; a credential-bearing config must be exported sanitized by the
 * user instead of being inspected by Kiki.
 */
export declare function hasOC1Markers(directory: string): boolean;
export interface OC1GuardOptions {
    /**
     * Installation/update owns the documented V1 Kiki artifacts and may back up
     * and remove them during an explicitly requested cleanup.
     */
    allowKnownV1Artifacts?: boolean;
}
/**
 * Fail closed when the target is, contains, or is contained by a directory with
 * OpenCode 1 (V1) Kiki artifacts. OpenCode 1 and OpenCode 2 share the standard
 * config directory (`~/.config/opencode`), so the presence of
 * `opencode.json(c)` proves nothing about the installed generation and is not a
 * marker. Only V1-specific Kiki files identify a legacy installation; config
 * contents are never inspected here because they may carry credentials.
 */
export declare function assertNotOC1Config(target: string, home: string, options?: OC1GuardOptions): void;
/**
 * Fail closed before Kiki 3.0.0 reads or writes an OpenCode 2 destination.
 * Refuses overlapping config/data/cache/state roots and any config root that
 * aliases or nests inside a directory with OpenCode 1 Kiki artifacts.
 */
export declare function assertOC2Target(roots: OC2Roots, home: string, options?: OC1GuardOptions): void;
//# sourceMappingURL=oc2-paths.d.ts.map