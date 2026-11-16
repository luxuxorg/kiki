/**
 * Prints a deterministic, read-only local summary of previously collected
 * diagnostics. It reads the existing ledger regardless of the current
 * collection setting, plus the configured health log and task-registry
 * metadata, and never writes, creates directories, calls a model/network, or
 * opens referenced spec/plan/code contents.
 */
export declare function stats(projectPath?: string): Promise<number>;
//# sourceMappingURL=stats.d.ts.map