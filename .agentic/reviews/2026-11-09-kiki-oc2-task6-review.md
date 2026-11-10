# Task 6 review — typed watchdog engine and V2 event adapter

Date: 2026-11-09
Reviewer: `kiki-reviewer` (independent spec + quality/security review)
Plan: `docs/superpowers/plans/2026-11-09-kiki-opencode2-migration-plan.md` (Task 6, lines 181–199; Global Constraints; Review Focus 5)
Spec: `docs/superpowers/specs/2026-11-09-kiki-opencode2-migration-design.md` (§3 last bullet, §6.3 watchdog, §7.1, §11 event enumeration)
Contract: `docs/migrations/kiki-3-oc2-api-contract.md` (§§3.2, 3.3, 8)
Inputs reviewed: `/tmp/opencode/kiki-oc2-task6-report.md`, `/tmp/opencode/kiki-oc2-task6.diff` (2172 lines, read in full — 4 file diffs, exactly the reported set), and the actual tree: `src/server/watchdog.ts` (384 lines), `src/server/watchdog-events.ts` (172 lines), `tests/plugin/watchdog.test.ts`, `tests/plugin/watchdog-events.test.ts` (read in full; on-disk content matches the diff), the retained V1 baseline `src/plugin/watchdog-source.ts` (read in full for parity), and the **installed** `@opencode/plugin@2.2.6` + nested `@opencode/client@2.2.6` type declarations (event payloads, `SessionStatus`, `SessionInfo`, `SessionInterruptInput`, `SessionsResponse`, `TokenUsageInfo`, `SelectedEvent`).

## Verdicts

- **Spec compliance: PASS**
- **Quality/security: PASS** — no blockers. Deferred observations in the last section; all are carried to their owning tasks or are outcome-equivalent notes.

## 1. Verification I re-ran (not just read from the report)

| Check | Result | Report claim |
|---|---|---|
| `npx --no-install vitest run tests/plugin/watchdog.test.ts tests/plugin/watchdog-events.test.ts` | 2 files / **68 passed** | 68 ✅ |
| `npx --no-install vitest run … + tests/cli/plugin-template.test.ts tests/integration/watchdog-plugin-syntax.test.ts tests/cli/oc2-sdk-contract.test.ts` | 5 files / **105 passed** | 105 ✅ |
| `npm test` (full suite) | 6 failed files / **24 failed tests** — exactly the six pre-existing Task 2–5 CLI suites named in the report (doctor 14, global-policy 5, install 2, status 1, update 2, release suite-level tsc failure via the 15 deferred TUI errors); 579 passed / 36 skipped (639) | 24 failed / 574 passed (634) — report's snapshot predates the final test refinements; its **final six-file rerun (24 failed / 15 passed / 33 skipped) matches my reproduction exactly** ✅ |
| `npx --no-install tsc --noEmit` | exit 2, **exactly the 15 known `src/tui/*` diagnostics, zero `src/server/*` errors** | ✅ |
| `npx --no-install tsc --noEmit --strict --moduleResolution bundler … tests/plugin/watchdog.test.ts tests/plugin/watchdog-events.test.ts` (my own disposable equivalent of the report's bundler-tsconfig check) | **exit 0** — the fixtures genuinely typecheck against the SDK-derived union | ✅ (reproduced independently) |
| `npm run lint` (whole `src/**`, includes both new files) | exit 0, clean | scoped eslint clean ✅ |
| `npm audit --json` | **0 high / 0 critical, 32 moderate** — identical graph to the Task 4/5-reviewed state; Task 6 adds no dependencies | not reported — same reporting gap as Tasks 4/5 (non-blocking, but reports must include the audit line) |
| `git log` / `git status` | HEAD still `e2bf396`, **no commits**; `src/server/` contains exactly the two new files; dirty set = pre-existing Task 2–5 files + the four Task 6 files; no `dist`, no lockfile/package changes in the task diff | ✅ no build/install/commit/registry/live edit |

None of the six failing CLI suites imports `src/server/*`, `watchdog-events`, or `createWatchdog` (grep-verified by me, matching the report's claim). RED evidence (module-not-found) is plausible and correctly framed for a new-module TDD port.

## 2. Engine parity audit — V1 `WATCHDOG_SOURCE` vs V2 `createWatchdog` (line-by-line)

Retained unchanged (verified against `src/plugin/watchdog-source.ts`):

- **Evaluation order** identical: `shouldWatch` → `status === 'busy'` gate → **loop checks before grace** (`tailAllSame(partHashes)` → `'content-loop'`, `tailAllSame(toolSignatures)` → `'tool-loop'`) → grace (`age < gracePeriodMs`) → absolute (`age >= absoluteMaxMs` → `'absolute-timeout'`) → silence (`silentMs >= stuckThresholdMs` → `'stuck'`) → one-shot 50% quiet debug warning (`warned50` latch, `stuckThresholdMs / 2`).
- **Ring size 8**, push+shift semantics; **content normalization** (`trim().toLowerCase().replace(/\s+/g,' ')` with null→`''`), FNV-1a 32-bit base-36 hash, **tool signature** `name:JSON.stringify(input ?? {})` with `name:?` throw fallback; **`watchAllSubagents`** → watch all, `agentName == null` → watch (unknown agent), else `indexOf('kiki-') === 0` prefix; **root exclusion** (`register` refuses without `parentID`, same falsy check as V1); **token activity** (first observation refreshes; later only on input/output/reasoning/cacheRead/cacheWrite growth — cache mapped from `t.cache.read/write`, V1 semantics); **delete-before-interrupt** (at-most-one); **health log fields/levels** byte-identical names: `watchdog-quiet` (debug: event/sessionId/agent/silentMs), `watchdog-abort` (warn: +reason/elapsedMs), `watchdog-abort-ok` (info), `watchdog-abort-failed` (error: +message); `checkIntervalMs` interval, idempotent `start()`, `unref()`'d interval; `watchdogEnabled` gates; discovery failure tolerated; abort failure tolerated and never throws.

Deliberate deviations — all are plan Task 6 requirements, each tested:

1. **Logical-item rings** (plan bullet 196): `recordRing` updates the entry with a matching key in place, so streaming fragments (`text:<assistantMessageID>:<ordinal>` started/delta/ended) can never masquerade as repeated output. V1's `lastPartId` heuristic is superseded exactly as specified ("Accumulate deltas to replace the same logical ring item rather than count fragments as repeats").
2. **Sanitized interrupt failure**: constant `'interrupt failed'` replaces V1's raw `String(err.message)` — required by bullet 198 ("Sanitize logged failures, never emit raw upstream errors"); tests assert the upstream detail strings never reach the log calls.
3. **`stop()` is an async latch**: sets `stopped`, clears the interval, and **awaits the in-flight tick** (discovery *and* the sequential interrupt loop — `abortSession` is awaited inside `runTick`); post-stop `handle`/health writes/interrupts are suppressed by `if (stopped)` guards — this is Review Focus 5's Task 6 slice, all race-tested (see §4).
4. **Terminal-child memory**: `finishedSessions` (bounded 1024, LRU-refreshed) so a `finished`/idle child cannot be revived by late discovery — the plan's "no renewed idle child after terminal events" requirement; V1 had no such memory (documented improvement).
5. **Bounded accumulation**: 64 most-recent logical text items, tool names dropped after the completed call. V1 kept unbounded per-session Maps; new code is instance-scoped and bounded.

Observation (outcome-equivalent): `hashText` uses `Math.imul(hash, 0x01000193) >>> 0` where V1 used float `(h * 0x01000193) >>> 0`. The two can differ for intermediate hash ≥ 2^29 (double rounding); hashes are only ever compared **within one session's own ring**, never persisted or compared across versions, so loop/no-loop outcomes are identical. V2's form is the more faithful 32-bit FNV-1a. No test pinned V1 hash values.

## 3. Event decoder vs the installed SDK (`watchdog-events.ts`)

`OpenCodeEvent` is derived (`ReturnType<Plugin.Context['event']['subscribe']> extends AsyncIterable<infer E>`) from the published plugin context — verified against `@opencode/plugin@2.2.6`'s `EventDomain`: the derivation yields the full client union minus `server.connected` (`SelectedEvent` distributes; the plugin re-declaration omits the `| "server.connected"` the raw client `make()` includes). The watchdog never needs `server.connected`; every other union member falls to the decoder's `default: []`. This satisfies the contract §1 rule ("use types re-exported through `@opencode/plugin`, not the transitive `@opencode/client`") without weakening typing.

Every mapped payload was verified against the **installed** `@opencode/client@2.2.6` generated types:

- `session.created`: `data.parentID?`/`data.agent?`/`data.sessionID` direct (not `.info`) ✅; root (no `parentID`) → `[]`.
- `session.agent.selected`: `{sessionID, agent, previous?}` → child agent update ✅.
- `session.execution.started|succeeded|failed|interrupted`, `session.deleted`: `{sessionID}` → running/finish ✅.
- `session.status`: `data.status.type` — the real `SessionStatus` union is exactly `idle | retry(attempt,message,next) | busy`; decoder maps idle→finished, busy/retry→running, and the narrowed `status: 'busy'|'retry'` **typechecks exactly** (no other variant exists to lose) ✅.
- `session.idle` → finished ✅. `session.retry.scheduled` (`{sessionID, assistantMessageID, attempt, at, error}`) → running+retry ✅.
- text/reasoning started/delta/ended keyed `assistantMessageID`+`ordinal` (started `''` replace, delta append, ended final replace) ✅ matches the real payloads.
- tool `input.started` (`{…, id, name}`) caches the name; `input.delta|ended` (`{…, id, delta|text}`), `called` (`{…, id, input, executed}`) with completed input; `tool.success|failed` keyed by id; **`tool.progress` → ephemeral `running` only** (no ring item) ✅.
- `session.step.ended` tokens `{input, output, reasoning, cache:{read, write}}` → `TokenCounters{…, cacheRead, cacheWrite}` ✅; `step.failed` `tokens?` optional → emits only when present ✅; `session.usage.updated` ✅.
- `session.usage.recorded` (`source: 'title'|'compaction'`) deliberately ignored — conservative and parity-correct (auxiliary title/compaction usage must not mask a genuinely stuck child; V1 had no such event). Documented as ruling 7.

Test fixtures use `Extract<OpenCodeEvent, {type}>` typed literals (no `as any`, no `@ts-ignore`, no OC1 payload casts anywhere — grep-verified, and I re-typechecked both test files with strict bundler resolution: exit 0), including the correct per-event `durable.version` literals (notably `version: 2` on `session.deleted` — matches the installed SDK).

## 4. Cleanup races, at-most-once, no post-cleanup effects (Review Focus 5, Task 6 slice)

- **Stop before start**: `start()` no-ops on the latch — later ticks never scheduled (tested).
- **Double stop**: resolves safely (tested).
- **Stop during in-flight discovery**: the tick's `if (stopped) return` after `await discover()` drops late results; `stop()` awaits the same tick promise — tested with a manually-resolved discovery promise resolving *after* `stop()` was called: no handle, no writes, no interrupt.
- **Stop while an interrupt is in flight**: `watchdog-abort` (pre-stop) is written, `abort-ok`/`abort-failed` are suppressed by `if (!stopped)`, and no further interrupt fires after `await stop()` (tested).
- **Stop while discovery pending + a stuck child exists**: no evaluation starts (tested).
- **At-most-one interrupt per child**: `markFinished` removes from `sessions` *before* the interrupt and latches in `finishedSessions`; three consecutive ticks → one interrupt (tested); discovery re-reporting a finished child → still one (tested); late discovery cannot revive a finished child (tested); a session interrupted via terminal event is never interrupted afterwards (tested).
- **No interval leak / no blocked cleanup**: `stop()` clears the interval and awaits `ticking`; overlapping ticks are prevented (`scheduleTick` re-entrancy guard). Instance-scoped state only (no `globalThis`), so Task 7's reload semantics (fresh `createWatchdog` per setup) are unaffected by the latch.

## 5. Ported test parity — original outcomes retained, not weakened

Every V1 source-string-harness scenario is present in the typed port with the same or stronger outcome: parentID registration, root exclusion, terminal removal (idle/deleted; `session.error` has no V2 union member — execution.failed/interrupted cover it, decoder-tested), part/text activity refresh, token-growth vs no-growth, reasoning growth, status update+activity, grace period, recent activity, retry non-abortable (**plus** the new "retry returns to busy resumes abort" test), abort warn+info log with exact field names, absolute timeout with fresh activity, 50% quiet debug warning, disabled watchdog no-op, abort failure (async + sync throw, now sanitized), health-write failure survival, multi-session abort in one tick, at-most-one across ticks, content loop (3 identical), whitespace/case normalization, same-logical-item updates no-loop, varied no-loop, streaming deltas accumulate, three identical logical items → loop, tool loop, same-tool-id lifecycle no-loop, different inputs no-loop, loop reason logging, agent filtering (non-kiki not watched when `watchAllSubagents: false`, kiki watched, non-kiki watched when true), discovery registration + evaluation next tick, discovery failure tolerance, discovered-agent watch policy (replacing V1's `session.messages` resolution, which does not exist in V2 per the contract), startedAt not reset on re-discovery. The V1 `client.app.log` fallback is correctly outside the engine now (the injected `writeHealth` owns it in Task 7); the engine's own write-failure tolerance is tested.

New coverage beyond V1 (all plan bullet 197 items): stop-before-start, double stop, both post-stop race tests, late-discovery-after-finish, at-most-once under discovery re-reports, and the typed decoder suite (25+ payload assertions). Fake-clock timing uses `checkIntervalMs: 100` with threshold-specific offsets (500/4000/6000/3000/59000/61000) — exact threshold behavior, not loose ranges.

## 6. Security / secret boundary

- No `process.env`, filesystem, network, or credential access anywhere in `src/server/*` (grep-verified); all I/O is injected (`deps.writeHealth`, `deps.interrupt`, `deps.discover`).
- Interrupt/discovery failures log only the constant `'interrupt failed'` or nothing — raw upstream/provider/config data can never reach the health log (tests assert the upstream detail strings are absent from serialized log calls).
- Health entries contain only sessionId/agent/reason/elapsedMs/silentMs — same field set as V1 minus the raw error text.
- The adapter touches only `session.list()` and `session.interrupt({sessionID})` — no `messages`, no `abort`, no private client modules (contract §3.3 pins verified). Structural compatibility with the real `Plugin.Context['session']` (`SessionDomain = Pick<SessionApi, …>`; `SessionInfo{id, parentID?, agent?}`, `SessionInterruptInput{sessionID, resume?}`, `SessionInterruptResponse`) verified against the installed types; the implementer additionally compiled a disposable probe (report), consistent with my type-level verification.
- No `.env`/auth/credential file read or written; no installs, builds, `dist` emission, commits, tags, pushes, or registry edits (git-verified). Pre-existing dirty Task 2–5 files, docs, config, logs untouched by the task diff.

## 7. Security scan (checklist item)

Report does not include an audit line (same gap as Tasks 4/5). I ran `npm audit --json`: **0 high / 0 critical / 32 moderate** — identical to the Task 4/5-reviewed graph (`@vitest/mocker` advisory fix outside pinned 4.1.0; transitive `glob`/`minimatch`/`@npmcli/*` chains). Task 6 adds **no dependencies**, so the audit surface is unchanged; no high/critical finding exists to fix. Non-blocking, but future task reports must include the audit line (third repetition of this note). Fresh-graph disposition remains Task 13's gate.

## 8. Parallelization / dependency check

Task 6 metadata: `risk: high`, `parallel: true`, `depends_on: ['Task 2', 'Task 3']` — both released (Task 2 PASS/PASS; Task 3 PASS/PASS after its fix round). No circular chain. Source ownership is disjoint from the concurrent tasks: Task 4 owns `src/cli/config.ts` + `tests/cli/*`, Task 9 owns `src/tui/*`; Task 6 owns `src/server/*` + `tests/plugin/{watchdog,watchdog-events}.test.ts` only. The one shared symbol, `KikiHealthConfig` from `src/cli/config.ts`, is **imported read-only** (type-only import) — the "keep shared-interface changes in Task 3" rule is respected. All referenced exports exist; the retained `src/plugin/watchdog-source.ts` and the `src/cli/config.ts` generator consumers are untouched and their suites (`plugin-template`, `watchdog-plugin-syntax`) are green in the 105-test regression. Downstream join (Task 4 + Task 6 → Task 7) is correctly ordered in the plan.

## Non-blocking notes / deferred observations

1. **Discovery pagination cursor ignored** (`WatchdogSessionApi.list` reads one `page.data`; `SessionsResponse` carries `cursor.next/previous`, `SessionListInput` has `limit?`/`cursor?`). This **follows the Task 2 pinned contract §3.3 verbatim** ("`const page = await ctx.session.list()` … filter parentID"), so it is not a Task 6 defect — but the report's rulings do not mention pagination. If the real binary applies a default page cap, a *fallback* discovery pass could miss older children (the primary `session.created` event path is unaffected). Carry to Task 7 (wiring `ctx.session`) / Task 11 (real-binary watchdog trip test): confirm a no-`limit` `list()` returns the complete active set, or loop `cursor.next` / pass an explicit `limit` if capped. A server-side `parentID` filter also exists in `SessionListInput` if ever needed.
2. **Mid-abort-loop terminal delivery (new async-engine window, outcome-equivalent-or-better)**: `runTick` collects `toAbort` and awaits each `abortSession` sequentially; a `finished` event delivered *while a previous interrupt is in flight* cannot demote an already-collected entry (V1's fully synchronous `checkNow` had no such interleaving). Affected child: one that was already verdict-guity this tick and completed within the loop's microsecond window; consequence is a single sanitized no-op interrupt plus one spurious `watchdog-abort` line. At-most-once and stop-race guarantees are unaffected. Suggested 1-line hardening for Task 7 or a follow-up: `if (!sessions.has(state.sessionId)) continue;` at the top of the abort loop (re-check liveness, mirroring `markFinished`'s removal).
3. **Subscription wiring deferred to Task 7** (`src/server/index.ts` owns `ctx.event.subscribe`, `AbortSignal`/`iterator.return()` cancellation, and setup/cleanup composition per Task 7's Files/Interfaces): consistent with the task boundary — Task 6 supplies the stateless decoder, engine, and adapter only. Task 7 **must** `await watchdog.stop()` in its cleanup and wire the iterator cancellation; the report's ruling 6 records the cost if forgotten.
4. **`ServerContext = Plugin.Context` alias in `watchdog-events.ts`** duplicates the contract §3 canonical derivation (`Parameters<typeof Plugin.define>[0]['setup']`); both reduce to the same `Plugin.Context`, and the canonical alias belongs to Task 7's server module. Unused export in Task 6 — harmless, noted for Task 7 consistency.
5. **Union shorthand deviation**: `child.parentID?` and `running.status?` are optional relative to the plan's interface shorthand (rulings 2/3). The engine enforces the invariants (no registration without `parentID`; retry non-abortable), so there is no runtime broadening; documented with cost-if-wrong.
6. **`session.usage.recorded` ignored** (title/compaction auxiliary usage): conservative and parity-correct; would only have *masked* stuck detection if counted. Keep as-is.
7. **`Math.imul` vs V1 float-multiply hash**: outcome-equivalent (hashes compared only within one ring); see §2. No action.
8. **Report full-suite snapshot bookkeeping**: the report's full-suite numbers (634 tests / 574 passed) predate the final Task 6 test refinements; the final state is 639/579 with the identical six-file/24-test pre-existing failure set, and the report's own final six-file rerun matches my reproduction exactly. Honesty intact; record full-suite numbers from the final tree going forward.
9. **Audit-line reporting gap**: third consecutive task report without an audit line; verified by reviewer (§7). Non-blocking per precedent (0 high/0 critical, unchanged graph), but it must appear in future reports.

## Boundary compliance

Task 6 scope held: only the four declared files; V1 `watchdog-source.ts` and the `src/cli/config.ts` generator retained untouched until Task 7; no builds, global config edits, installs, commits, tags, pushes, registry edits, or secret operations by implementer or reviewer; interim `src/tui/*` typecheck failures remain exactly the 15 permitted diagnostics; real-binary/package acceptance remains explicitly deferred to Task 11 (nothing here claims it).
