import type { PermissionRule } from './opencode-config.js';
export type PermissionResult = {
    ok: true;
    rules: PermissionRule[];
} | {
    ok: false;
    reason: string;
};
/** Map a V1 permission map (or absence) into ordered native rules. */
export declare function translatePermissions(input: unknown): PermissionResult;
/**
 * Build the project-level rules appended after inherited (global) rules.
 *
 * Kiki-written project permissions are additions only: literal file paths or
 * literal directory prefixes (`.../**`). Generated baseline copies are removed
 * before validation, no broad fallback/grant is replayed, and any unsupported
 * or role-boundary-crossing rule fails closed. Accepted additions get a minimal
 * protective suffix so secret descendants stay denied under last-match
 * semantics. This is validation of Kiki-managed writes, not a runtime policy
 * engine; manually edited native configs remain outside this guarantee.
 */
export declare function projectPermissionRules(local: PermissionRule[], inherited: PermissionRule[]): PermissionResult;
//# sourceMappingURL=oc2-permissions.d.ts.map