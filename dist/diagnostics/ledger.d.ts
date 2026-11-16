import type { TokenCounters } from '../server/watchdog-events.js';
/** The single metadata-only ledger, relative to a project root. */
export declare const LEDGER_RELATIVE_PATH = ".agentic/kiki/run_ledger.jsonl";
export type DeclaredKind = 'initial' | 'fix' | 'review' | 'unknown';
/** Declared dispatch labels parsed from the leading bracketed metadata. */
export interface DeclaredLabels {
    taskId: string;
    kind: DeclaredKind;
    comparisonGroup: string;
}
export type SessionStatus = 'running' | 'succeeded' | 'failed' | 'interrupted' | 'idle' | 'deleted' | 'partial' | 'unknown';
interface LedgerRecordBase {
    v: 1;
    id: string;
    timestamp: string;
}
interface DispatchRecordShape extends LedgerRecordBase {
    type: 'dispatch';
    parentSessionId: string;
    callId: string;
    agent: string;
    declared: DeclaredLabels & {
        model: string;
    };
    childSessionId: 'unknown';
}
interface SessionRecordShape extends LedgerRecordBase {
    type: 'session';
    sessionId: string;
    parentSessionId: string;
    agent: string;
    startedAt: string | null;
    endedAt: string | null;
    status: SessionStatus;
    tokens: TokenCounters | null;
    tokenSource: 'session.usage.updated' | 'unknown';
    retries: number;
    partial: boolean;
}
interface ComparisonRecordShape extends LedgerRecordBase {
    type: 'comparison';
    taskId: string;
    comparisonGroup: string;
    startRevision: string;
    endRevision: string;
}
export type LedgerRecord = DispatchRecordShape | SessionRecordShape | ComparisonRecordShape;
export type DispatchRecord = Extract<LedgerRecord, {
    type: 'dispatch';
}>;
export type SessionRecord = Extract<LedgerRecord, {
    type: 'session';
}>;
export type ComparisonRecord = Extract<LedgerRecord, {
    type: 'comparison';
}>;
/**
 * Reads only the leading bracketed metadata, never the descriptive body.
 * Every field is validated independently: an invalid task ID or kind does not
 * discard a valid comparison group, and each missing/invalid field becomes
 * `unknown` instead of a guessed value.
 */
export declare function parseDispatchLabels(description: unknown): DeclaredLabels;
/**
 * Returns a fail-open writer. The directory and file are created lazily on the
 * first valid write; an invalid record or filesystem failure returns false and
 * never throws into the caller.
 */
export declare function createLedgerWriter(root: string): (record: LedgerRecord) => boolean;
/**
 * Read-only, tolerant reader. A missing ledger is simply "no data" (empty
 * records, no error); unreadable paths surface only through `readError`.
 * Malformed, truncated, unknown-version and unknown-type lines are skipped and
 * counted, never repaired or echoed.
 */
export declare function readLedger(root: string): {
    records: LedgerRecord[];
    skipped: number;
    readError: string | null;
};
export {};
//# sourceMappingURL=ledger.d.ts.map