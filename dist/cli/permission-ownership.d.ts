import type { PermissionRule } from './opencode-config.js';
/**
 * Hash-only ownership evidence for the global `agents.<name>.permissions`
 * field. The state file stores no rules; it only proves which exact ordered
 * array Kiki last verified. Array order matters and JSONC whitespace does not.
 */
export interface OwnershipState {
    version: 1;
    roles: Record<string, string>;
}
export declare function hashPermissionField(rules: PermissionRule[]): string;
/**
 * Strict shape validation. Any unknown version, extra payload field, non-hash
 * value or forbidden key degrades to the legacy classifier bootstrap.
 */
export declare function parseOwnershipState(value: unknown): OwnershipState | undefined;
/** The single state file under the env-resolved global config root. */
export declare function ownershipStateFile(globalConfigDirectory: string): string;
/** Read the state file; absent, unreadable, corrupt or unknown versions are undefined. */
export declare function readOwnershipState(file: string): OwnershipState | undefined;
/** Deterministic serialization; callers write it atomically after verification. */
export declare function serializeOwnershipState(state: OwnershipState): string;
/** Ensure the state parent directory exists with restrictive permissions. */
export declare function ownershipStateDirectory(file: string): string;
//# sourceMappingURL=permission-ownership.d.ts.map