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
 * Omitted inherited grants are narrowed to the local fallback; inherited
 * deny/ask rules are never relaxed into allow.
 */
export declare function projectPermissionRules(local: PermissionRule[], inherited: PermissionRule[]): PermissionRule[];
//# sourceMappingURL=oc2-permissions.d.ts.map