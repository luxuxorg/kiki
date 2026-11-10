export interface RegistrationPlan {
    /** Files whose content changes; absent targets are included. */
    files: string[];
    apply(): void;
}
export interface PluginSource {
    file: string;
    entry: unknown;
}
/** Known Kiki package names, versions, local directories and V1 source files. */
export declare function isKikiPluginEntry(entry: unknown, activePackageSpec?: string): boolean;
/** Kiki package entries configured in server opencode.json(c) files. */
export declare function kikiServerSources(directory: string): PluginSource[];
/** Kiki package entries configured in cli.json(c) files. */
export declare function kikiCliSources(directory: string): PluginSource[];
/** Auto-discovered V1 source files that OC2 would load alongside a package entry. */
export declare function autoDiscoveredKikiPlugins(directory: string): string[];
export declare function hasKikiServerRegistration(directory: string): boolean;
export declare function hasKikiCliRegistration(directory: string): boolean;
export declare function currentPackageDirectory(): string;
/**
 * Development/checkout installations use the absolute package directory; a
 * package-managed installation uses its package name for `opencode plugin add`.
 */
export declare function currentPackageSpec(): string;
/**
 * Plan once-only package registration for the server plugin and the TUI plugin.
 * Conflicting entries are refused instead of silently replaced.
 */
export declare function prepareRegistration(directory: string, packageSpec: string): RegistrationPlan;
/** Remove only known Kiki entries; unrelated plugins and comments survive. */
export declare function removeKikiRegistration(directory: string): void;
//# sourceMappingURL=oc2-registration.d.ts.map