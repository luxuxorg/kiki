# Task 1 Review — Opt-in Configuration and Metadata Ledger (2026-11-16)

**Verdict: PASS**

**Basis:** Read task-1-brief.md, task-1-report.md, full task-1-review.diff (996 lines, all six paths), plan Global Constraints/File Map lines 15–63, approved spec, alignment.json (guardrails: no secrets, parameterized queries, no stack-trace leakage — none implicated), and the actual worktree `src/cli/config.ts` to confirm the loader.

## Spec compliance

- Default-off, boolean-only `sanitizeDiagnostics`, `DEFAULT_DIAGNOSTICS = { enabled: false }`, applied in `loadConfig` (config.ts:173); modern and legacy paths flow through the same branch — report claim accurate. Unknown keys discarded; shared default not mutated (tested).
- `parseDispatchLabels` reads only the leading bracket, validates each field independently, enforces `[A-Za-z0-9._-]{1,128}`, first-token-wins, emits `'unknown'` per missing/invalid field; body never returned. All four brief-pinned assertions present verbatim (ledger.test.ts:585–597, config-diagnostics.test.ts:871–873).
- `LedgerRecord` = three allowlisted variants sharing `{v:1,id,timestamp,type}`; `DispatchRecord`/`SessionRecord`/`ComparisonRecord` as `Extract<...>` aliases; `TokenCounters` type-only import; watchdog types untouched. Dispatch identity parent-session+callId, `childSessionId:'unknown'`, declared labels/model kept distinct from observed facts. Session statuses match the exact eight strings; `null` vs zero preserved; missing tokens → skipped, not zeroed.
- Writer is lazy (no fs action at factory; invalid `v:2` write creates nothing — tested), fail-open (returns `false`, never throws, tested against a file-blocking `.agentic` path), append-only, rebuilds from allowlist so sentinels/prompt/body never persisted. Reader is read-only, tolerant (ENOENT → no data; unreadable → `readError`; malformed/truncated/unknown-version/unknown-type → `skipped` count, no repair/echo), and unknown fields on valid lines are discarded without counting as skipped.
- Wizard config includes `{...DEFAULT_DIAGNOSTICS}` with no new question (asserted via prompt stream); `installProjectConfig` unchanged, non-overwrite tested. `.gitignore` gains exactly one line. No deps, no Task 2+ machinery, no collectors/hooks/stats in diff. No registry/live config edits.

## Quality findings

- Diff contains only the six Task 1 paths; prerequisite deltas (worktrees test, async security test, retained `dist/`) correctly excluded.
- Minor (non-blocking): `isIsoTimestamp` uses lenient `Date.parse` (accepts non-ISO strings); a partial token-counters object (some keys numeric) skips the whole record rather than nulling — both consistent with the skip-and-count contract but worth noting for Task 2.
- Recorded evidence (not rerun per instructions): RED exit 1 with genuine import/missing-export failures; GREEN 33 targeted / 72 regression; tsc 0; lint 0. Baseline 694/2 predates these edits; full suite/build/audit/real-binary correctly deferred to Task 4.

Report path: `/home/lutz/lprojekte/kiki/.agentic/reviews/2026-11-16-usage-diagnostics-task-1-review.md`