# Task 3 Review — Read-Only Statistics (scoped)

**Verdict: PASS_WITH_NOTES**

Report basis: read `task-3-brief.md`, `task-3-report.md`, full `task-3-review.diff` (all 3 changed paths), `alignment.json`, and inspected `ledger.ts`/`config.ts` contracts in the worktree. No commands/tests/build/audit run; only recorded evidence judged.

## Spec compliance findings

No spec violations found. Binding contract verified in `src/cli/commands/stats.ts`:

- `stats(projectPath='.'): Promise<number>`; exit 0 for readable/no-data, 1 for unreadable ledger or malformed config; registered in `src/cli/index.ts` (`stats [path]`) with `process.exit(code)` propagation mirroring `routing`.
- Read-only: no writes/dir creation; `node:fs` limited to `existsSync`/`readFileSync`; no model/network/subprocess/`fetch`/Git; registry/health resolved via `loadConfig(projectPath)` against the passed root, never cwd.
- Ledger read regardless of `diagnostics.enabled`; enabled + missing ledger prints `observationGap=` without claiming write failure or child absence (report RED/GREEN evidence recorded).
- Dispatch dedupe by parent+callId; session snapshots deduped by record ID then latest per `sessionId`; repeated JSONL lines never summed.
- Five token counters kept separate; `null` → `tokens=unknown`, real zeros → `0`; no additive total/billing/quality claim; sessions never attributed to task/group/order (explicit notes printed).
- Watchdog: strict `sessionId` join; `watchdog-abort` counted once via event+session+timestamp+reason identity (spec-prescribed); `abort-ok/failed` are outcome counters only; `watchdog-quiet` separate; unmatched sessions shown as `unmatchedIncidentSession=`; no raw error/message payloads echoed (sanitizer regexes + tests).
- Registry: only configured `paths.taskRegistry`; spec/plan printed as current reference paths with explicit disclaimer; missing registry/task/revision → `unknown`/unavailable; no `HEAD`/Git association; referenced documents never opened (fs spy test).
- Tests cover bytes-unchanged snapshots, no-file-creation (empty root stays empty), custom registry/health paths beating defaults, truncated/future/duplicate/invalid-token fixtures, unmatched incident, sentinel non-echo, and no forbidden calls. Static no-call spies (fetch/child_process/fs reads) are adequate for this code: `stats.ts` imports only `node:fs`/`node:path` plus local modules, so the spy surface covers all outbound channels.

## Quality findings (nonblocking)

1. **Minor** — `comparisonViews` (stats.ts ~line 200): only the latest comparison marker per group+task supplies start/end revisions; an earlier marker with a known `startRevision` can be hidden by a later marker with `startRevision: unknown`. Disclosed in report limitations; acceptable but could merge known fields forward in Task 4.
2. **Minor** — ledger/health/config are read whole-file into memory (`readFileSync`); unbounded on a hostile local ledger. Local read-only CLI, low risk.
3. **Minor** — exact-duplicate abort rows (same session+timestamp+reason) count once; genuinely distinct same-millisecond same-reason aborts would also collapse. This follows the brief's prescribed incident identity; report discloses it.
4. **Minor (unverifiable here)** — `session.status`/`tokenSource`/`retries`/`partial` printed from validated ledger records assumed sanitized upstream; ledger validation not fully audited in this scope.
5. Config strictness does not create false exit-1 for absence: no config file → defaults, exit 0 (verified in code and no-data test).

## Notes

Reported evidence (genuine RED missing-module + observation-gap RED; Step 5 combined 13 pass, stats-only 12; tsc/lint/diff-check exit 0) is internally consistent with the diff. Full build/full-suite/audit/native integration deferred to Task 4 per plan — not judged here.