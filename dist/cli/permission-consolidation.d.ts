import type { PermissionRule } from './opencode-config.js';
/**
 * Pure classification of existing permission rules against the canonical
 * builder output. The installer and migration use this to drop only rules whose
 * generation is proven, keep unknown rules verbatim, and halt on anything
 * ambiguous instead of silently widening or narrowing policy.
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
    kind: 'generated' | 'custom' | 'ambiguous';
}
export interface Classification {
    entries: ClassifiedRule[];
    customs: PermissionRule[];
    blockers: string[];
}
/**
 * Additional evidenced historical generated sequences, keyed by agent name.
 * The tracked fixture `tests/fixtures/kiki-permission-history.json` pins these
 * values. Entries are added only with exact content and provenance; a
 * generated-looking tuple without a proven sequence is ordinary custom input.
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
 * existing role markdown) against the fresh canonical array. Proven generated
 * rules are replaceable; unknown rules stay custom and are preserved verbatim;
 * custom denies and incomplete/ambiguous generated shapes block the write.
 */
export declare function classifyPermissionSources(agent: string, baseline: PermissionRule[], sources: PermissionSource[]): Classification;
//# sourceMappingURL=permission-consolidation.d.ts.map