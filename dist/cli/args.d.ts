export interface MigrationArgs {
    from?: string;
    project?: string;
    force: boolean;
    help: boolean;
}
/** Strict parser for the one-time migration command. */
export declare function parseMigrationArgs(args: string[]): MigrationArgs;
export declare function parseScope(args: string[], command: string, allowProject: boolean): {
    project?: string;
    help: boolean;
};
//# sourceMappingURL=args.d.ts.map