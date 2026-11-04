import { type ApplyHooks } from '../release-apply.js';
import { type CommandRunner } from '../release-candidate.js';
import { type GateResult } from '../release-gates.js';
import { type ReleaseOptions, type VersionDecision } from '../release-policy.js';
export interface ReleaseDeps {
    runner: CommandRunner;
    now: () => Date;
    log: (line: string) => void;
    applyHooks?: ApplyHooks;
}
export interface ReleaseResult {
    version: VersionDecision;
    gates: GateResult[];
    applied: boolean;
}
export declare function prepareRelease(checkout: string, options: ReleaseOptions, deps: ReleaseDeps): Promise<ReleaseResult>;
export declare function release(args: string[]): Promise<void>;
//# sourceMappingURL=release.d.ts.map