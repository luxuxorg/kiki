export interface ReleaseOptions {
    apply: boolean;
    bump: 'auto' | 'major' | 'minor' | 'patch';
    since?: string;
    securityException?: string;
    help: boolean;
}
export interface Commit {
    hash: string;
    subject: string;
    body: string;
}
export interface VersionDecision {
    current: string;
    next: string;
    rule: string;
    ignored: number;
}
type Bump = ReleaseOptions['bump'];
export declare function parseReleaseArgs(args: string[]): ReleaseOptions;
export declare function selectBaseline(commitsNewestFirst: Commit[], current: string, since?: string): string;
export declare function decideVersion(current: string, commits: Commit[], bump: Bump): VersionDecision;
export declare function prepareChangelog(text: string, commits: Commit[], next: string, date: string): string;
export declare function transformVersions(input: {
    packageJson: string;
    lockJson: string;
    configTs: string;
}, next: string): {
    packageJson: string;
    lockJson: string;
    configTs: string;
};
export {};
//# sourceMappingURL=release-policy.d.ts.map