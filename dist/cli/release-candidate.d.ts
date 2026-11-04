export interface CommandResult {
    status: number;
    stdout: string;
    stderr: string;
    /** Optional termination signal; present only when a runner reports one. */
    signal?: NodeJS.Signals | null;
}
export type CommandRunner = (file: string, args: string[], options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
}) => Promise<CommandResult>;
export type GitSubcommand = 'log' | 'ls-files' | 'status';
export type TreeSnapshot = Map<string, Buffer>;
export interface Candidate {
    root: string;
    runRoot: string;
    npmEnv: NodeJS.ProcessEnv;
    before: TreeSnapshot;
    tracked: string[];
    dispose(): Promise<void>;
}
export declare function readGit(runner: CommandRunner, root: string, subcommand: GitSubcommand, args: string[]): Promise<string>;
export declare function createCandidate(checkout: string, tracked: string[]): Promise<Candidate>;
export declare function snapshotTree(root: string): Promise<TreeSnapshot>;
export declare function changedPaths(before: TreeSnapshot, after: TreeSnapshot): string[];
//# sourceMappingURL=release-candidate.d.ts.map