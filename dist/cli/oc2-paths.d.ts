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
     * Installation/update owns a small set of Kiki-generated V1 artifacts and may
     * back up and remove them during an explicitly requested cleanup. This never
     * relaxes the machine-default credential boundary.
     */
    allowKnownV1Artifacts?: boolean;
}
/**
 * Fail closed when a target is, contains, or is contained by the machine-default
 * config directory and that directory cannot be proven Kiki-free using metadata
 * alone. The machine-default config may hold OC1's singular `agent.kiki-*`
 * entries next to provider credentials; metadata cannot distinguish them, so
 * Kiki refuses and asks for a user-created secret-free export instead of
 * parsing a possibly credential-bearing file.
 */
export declare function assertNotOC1Config(target: string, home: string, options?: OC1GuardOptions): void;
/**
 * Fail closed before Kiki 3.0.0 reads or writes an OpenCode 2 destination.
 * Refuses overlapping config/data/cache/state roots and any root that aliases
 * or nests inside a live OpenCode 1 installation.
 */
export declare function assertOC2Target(roots: OC2Roots, home: string, options?: OC1GuardOptions): void;
//# sourceMappingURL=oc2-paths.d.ts.map