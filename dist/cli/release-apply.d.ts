import type { Candidate } from './release-candidate.js';
export interface ApplyHooks {
    /** Test-only injection point, called after a target or dist file is written. */
    afterWrite?: (relativePath: string) => Promise<void>;
    /** Test-only injection point, called after all writes and before verification. */
    beforeVerify?: () => Promise<void>;
}
export interface ApplyResult {
    backupRoot: string;
}
export declare function scanDistCollisions(checkout: string, tracked: string[]): Promise<string[]>;
/**
 * Applies a validated candidate to the checkout.
 *
 * Precondition: the caller has run the candidate gates and they all passed.
 * This function deliberately does not run gates or expose a skip flag; a caller
 * that invokes it before validation is bypassing the release policy.
 */
export declare function applyCandidate(checkout: string, candidate: Candidate, hooks?: ApplyHooks): Promise<ApplyResult>;
//# sourceMappingURL=release-apply.d.ts.map