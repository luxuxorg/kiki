export interface MigrationOptions {
    from?: string;
    project?: string;
    force: boolean;
    destination: string;
}
export interface MigrationReport {
    migrated: string[];
    rejected: {
        agent: string;
        reason: string;
    }[];
    manual: string[];
    marker?: string;
    exitCode: 0 | 1;
}
/** V1's global config resolution: XDG_CONFIG_HOME or ~/.config, never OC2 overrides. */
export declare function oc1GlobalDirectory(env?: NodeJS.ProcessEnv, home?: string): string;
/**
 * One-time, fail-closed extraction from an OC1 configuration. Global mode is
 * read-only at the source; project mode removes redundant Kiki-only local
 * copies only after every eligible agent succeeded.
 */
export declare function migrateOC1(options: MigrationOptions): MigrationReport;
//# sourceMappingURL=oc2-migration.d.ts.map