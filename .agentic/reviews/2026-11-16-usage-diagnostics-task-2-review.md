# Task 2 Review — Usage Diagnostics (Dispatch + Child Session Observation)

**Reviewer:** Kiki Reviewer (GLM-5.3)
**Date:** 2026-11-16
**Scope:** Spec compliance + code quality for the six Task-2 paths (new `src/server/usage-diagnostics.ts`, `tests/plugin/usage-diagnostics.test.ts`; modified `src/server/index.ts`, `src/server/routing-logger.ts`, `tests/plugin/server-lifecycle.test.ts`, `tests/plugin/routing-logger.test.ts`).

## Verdict: PASS

Report path: `.agentic/reviews/2026-11-16-usage-diagnostics-task-2-review.md`

## Basis

Read task-2 brief, report, and the full review diff (all six paths, incl. both new files). Verified Task-1 reuse (`parseDispatchLabels`, `DispatchRecord`, `createLedgerWriter`, `sanitizeDiagnostics` in `src/diagnostics/ledger.ts` / `src/cli/config.ts`) and `watchdog-events.ts` raw-event shapes only as needed. Judged recorded evidence only; no reruns, probes, or commands.

## Spec compliance findings

- **Default-off honored.** `setup` only constructs collector/writer when `diagnostics.enabled`; `sanitizeDiagnostics` accepts only an explicit boolean; absent/malformed/legacy paths fall back disabled. Off lifecycle test: one hook, one stream, no ledger file.
- **Existing machinery reused.** Single `execute.before` hook gains an optional `onDispatch`; single event stream fans out to `usage.event(next.value)` behind its own try/catch after `liveWatchdog.handle`. No second subscription, timer, discovery/API/model/interrupt calls, deps, or permission changes. `watchdog.ts`/`decodeWatchdogEvent` untouched; collector keys off raw `OpenCodeEvent` discriminants, not the lossy `finished`/`tokens` projection.
- **Privacy/allowlist.** Dispatch record projects sessionID, call id, kiki-* agent, bounded declared model (≤200, no control chars), and leading-bracket labels only; prompt/description-body/error sentinels asserted absent. Routing JSON keys remain exactly `{agent, model, timestamp}`.
- **ID/state handling.** Root/unknown-parent sessions excluded; snapshot IDs `session:<id>:<event id>` with stable `stop` marker for cleanup; retry dedupe by event ID; repeated same-status idle/finish adds nothing; distinct terminal statuses recorded; resumed session keeps one lifetime row with latest aggregate; `session.usage.updated` is the sole token source (step events deliberately ignored), missing aggregate → `null`, genuine zeros preserved; `partial` marks snapshot completeness, terminal statuses set `partial: false`. Dispatch/session records remain unjoined (`childSessionId: 'unknown'`).
- **Isolation/cleanup.** Observer exceptions isolated from routing logging and dispatch; writer failures/throws swallowed; `stop()` latches (late events, second cleanup write nothing); cleanup flush sits after stream settle and before watchdog-stop/logger disposal; enabled setup failure releases the logger. Project root via `ctx.location.directory`, never cwd.

## Quality findings

Nonblocking notes only:

1. `dispatchRecord` timestamps use `new Date()` while session snapshots use injected `now` — two clock sources, consistent with each record type; acceptable.
2. `finish()` allows a second, *different* terminal status after `succeeded` (e.g. later `session.deleted`) to overwrite `status` with `endedAt` bumped — spec says "preserve actual terminal status," so acceptable, but Task 4 native-aggregation fixtures should confirm the real event ordering.
3. A future runtime emitting only step events records `tokens: null` — conservative and explicitly justified in the report; verify in Task 4.

Recorded evidence (RED→GREEN, 5-file/115-test step-7 pass, 8-file/152-test regression, tsc 0, lint 0, diff-check 0) is consistent with the diff; full build/audit deferred to Task 4 per plan.