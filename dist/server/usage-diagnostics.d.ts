import type { DispatchRecord, LedgerRecord } from '../diagnostics/ledger.js';
import type { OpenCodeEvent } from './watchdog-events.js';
export interface UsageDiagnosticsOptions {
    write: (record: LedgerRecord) => boolean;
    now: () => number;
}
export interface UsageDiagnostics {
    dispatch(record: DispatchRecord): void;
    event(event: OpenCodeEvent): void;
    stop(): void;
}
/**
 * Builds the optional metadata collector for one plugin lifetime.
 *
 * The collector reads only raw event discriminants, so the watchdog's lossy
 * `finished`/`tokens` projection is never the source of truth. Dispatch labels
 * and child sessions remain unjoined: no parent/agent/timing heuristic creates
 * a task-to-session attribution. All failures are swallowed so diagnostics can
 * never disturb routing, watchdog handling or cleanup.
 */
export declare function createUsageDiagnostics(options: UsageDiagnosticsOptions): UsageDiagnostics;
//# sourceMappingURL=usage-diagnostics.d.ts.map