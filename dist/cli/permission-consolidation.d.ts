import type { PermissionRule } from './opencode-config.js';
/**
 * Pure classification of existing permission rules against the canonical
 * builder output and the proven historical defaults. Exact
 * (action, resource, effect) identity decides whether a rule is a known
 * default or an unknown custom; customs keep source order and are
 * deduplicated exactly.
 *
 * This is not a runtime evaluator: no path is applied, nothing is written.
 */
export interface PermissionSource {
    file: string;
    rules: PermissionRule[];
}
export interface ClassifiedRule {
    file: string;
    rule: PermissionRule;
    kind: 'generated' | 'custom';
}
export interface Classification {
    entries: ClassifiedRule[];
    customs: PermissionRule[];
}
/**
 * Additional evidenced historical generated sequences, keyed by agent name.
 * The tracked fixture `tests/fixtures/kiki-permission-history.json` pins these
 * values. Entries are added only with exact content and provenance; a
 * generated-looking tuple without a proven sequence is ordinary custom input.
 *
 * Each role keeps its recorded 2026-11-19 shape and the exact 2026-11-20
 * pre-change output of `generateAgentPermissions()` at bb1acee. The latter was
 * captured by compiling that revision before the managed-permission-requests
 * generator change, so an interruption during an update converges on rerun.
 */
export declare const HISTORICAL_GENERATED_SEQUENCES: Record<string, PermissionRule[][]>;
/** Split a canonical array into its non-secret prefix and final secret-edit tail. */
export declare function splitSecretTail(baseline: PermissionRule[]): {
    prefix: PermissionRule[];
    tail: PermissionRule[];
};
/** Exact-tuple deduplication that keeps the first occurrence and tail order. */
export declare function stableCustoms(customs: PermissionRule[]): PermissionRule[];
/**
 * Classify ordered sources (discovered config files first, then the single
 * existing role markdown). Every tuple with a known default identity — the
 * role's recorded historical sequences or the fresh canonical baseline — is a
 * replaceable default regardless of author, position or surrounding
 * completeness. Every other tuple is a custom and is preserved for every
 * effect in encounter order.
 */
export declare function classifyPermissionSources(agent: string, baseline: PermissionRule[], sources: PermissionSource[]): Classification;
//# sourceMappingURL=permission-consolidation.d.ts.map