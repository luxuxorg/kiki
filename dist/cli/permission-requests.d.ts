import { type PermissionRule } from './opencode-config.js';
import { type PermissionResult } from './oc2-permissions.js';
export interface PermissionContext {
    projectDirectory: string;
    globalConfigDirectory: string;
}
export interface PermissionRow {
    file: string;
    scope: 'global' | 'ancestor' | 'project';
    agent: string;
    index: number;
    rule: PermissionRule;
}
/** Inspect metadata only: no provider/model/prompt settings ever leave this function. */
export declare function inspectPermissions(context: PermissionContext): PermissionRow[];
/** Ordered inherited rules (global then ancestor tiers) for one role. */
export declare function inheritedPermissionRules(context: PermissionContext, agent: string): PermissionRule[];
/**
 * Select the sole project config, or the default absent target. `--file` is a
 * selector confined to the project's own config candidates, never an
 * authorization for ancestor or global writes. Symlink aliases are rejected by
 * canonicalizing both the target and the global root.
 */
export declare function selectProjectTarget(context: PermissionContext, explicitFile?: string): {
    file: string;
    expected?: Buffer;
};
/**
 * Validate and complete surviving project rules. Allow additions run through the
 * unchanged project validator; bounded file read/edit asks are checked through
 * an allow-shaped copy; inherited ask tuples are masks; unsafe asks and
 * baseline mirrors fail closed. The derived non-allow suffix is appended only
 * when it is not already the exact trailing sequence.
 */
export declare function protectProjectSurvivors(local: PermissionRule[], inherited: PermissionRule[]): PermissionResult;
/** Plan a narrow additive grant; redundant or invalid grants fail without writes. */
export declare function planPermissionAdd(local: PermissionRule[], inherited: PermissionRule[], grant: PermissionRule): PermissionResult;
/** Plan removal of exactly one selected project entry while keeping protection. */
export declare function planPermissionRemoval(local: PermissionRule[], inherited: PermissionRule[], index: number, expectedRule: PermissionRule): PermissionResult;
/**
 * Apply one project permission field under exact-byte preconditions. Only the
 * selected role's permission field is verified as changed; all other JSONC
 * settings/comments and the file mode are preserved. A concurrent change after
 * planning aborts before backup or before replacement.
 */
export declare function applyProjectPermissions(context: PermissionContext, file: string, agent: string, expected: Buffer | undefined, rules: PermissionRule[]): {
    changed: boolean;
    file: string;
};
//# sourceMappingURL=permission-requests.d.ts.map