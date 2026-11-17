# Lightweight Usage Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in token, fix/review-dispatch and watchdog-incident statistics, with existing-artifact references and explicitly requested comparisons, without evaluating quality.

**Architecture:** A small metadata ledger records declared dispatch labels separately from observed child-session usage. The existing routing hook and event subscription feed an optional collector; the watchdog keeps its current behavior. A read-only `kiki stats [path]` command summarizes the ledger, existing health log and task-document references without a model call.

**Tech Stack:** Existing TypeScript/Node ESM, Node filesystem APIs, Vitest, pinned `@opencode/plugin@2.2.6`; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-15-lightweight-usage-diagnostics-design.md` — user-approved 2026-11-15.

**Plan status:** Written 2026-11-16 in the main agent at the user's request; architect/reviewer approval pending. No implementation, tests, runtime rollout or commits authorized by this document.

## Global Constraints

- Collection is **off by default**. Off means no ledger file, records, extra hook/subscription or changes to existing watchdog/routing behavior.
- One metadata-only ledger: `.agentic/kiki/run_ledger.jsonl`, version `v: 1`; existing health/routing logs retain their formats.
- Collection never writes `TASK_REGISTRY.json`; only `stats` may read existing task/spec/plan references.
- Task ID, `initial | fix | review`, optional comparison group and model selection are **declared**, not independent proof of intent or the resolved model.
- Never infer a fix from dispatch order, or join a dispatch to a child using parent/agent/timing, even sequentially. Missing identity/reference/usage stays unknown, not zero.
- Preserve `[task:<taskId> <kind>]` / `[task:<taskId> <kind> cmp:<groupId>]` within the existing 3–5-word description; no new subagent arguments.
- No quality scoring, feedback engine, prompt/code/transcript archive, replay runner, automatic optimization, budget/pricing engine, dependency upgrade or permission widening.
- Comparisons require an explicit user request; existing authorized subagents prepare separate worktrees at one starting revision. Worktrees are not sandboxes.
- Keep the deferred reviewer-precision task deferred. Preserve unrelated working-tree changes and runtime artifacts.
- No commits, global installation/update, publishing or paid comparison runs without separate authorization. Implementation commands below are future verification, not evidence already obtained.

## Review Focus

1. Failed/retried hooks and resumed sessions: count distinct dispatch invocations, never multiply lifetime session tokens — Tasks 1–3.
2. Concurrent or sequential same-agent children: leave task-token/comparison-token attribution unknown without an explicit verified link — Tasks 2–3.
3. Reload, duplicate finish events, interruption or missing usage: preserve partial evidence and distinguish unknown totals from zero — Tasks 1–3.
4. Malformed input, unwritable logs or damaged metadata: diagnostics must not interrupt work, disclose raw payloads or modify existing files — Tasks 1–3.
5. Different project roots/custom registry or health paths: use project-scoped settings, preserve path-versus-version distinction and never ingest referenced contents — Tasks 2–4.

## File Map and Shared Decisions

| File | Responsibility |
|---|---|
| `src/diagnostics/ledger.ts` (new) | Small allowlisted record protocol, label parser, fail-open writer and tolerant reader |
| `src/server/usage-diagnostics.ts` (new) | Optional collector; dispatch and child-session observations remain separate |
| `src/server/routing-logger.ts` | Optional metadata observer on the existing hook; unchanged routing log |
| `src/server/index.ts` | Opt-in setup, event fan-out and cleanup; no watchdog algorithm changes |
| `src/cli/config.ts`, `src/cli/commands/init.ts` | One `diagnostics.enabled` boolean, default false; orchestrator description/workflow text |
| `src/cli/commands/stats.ts` (new), `src/cli/index.ts` | Read-only summary and CLI registration |
| `tests/diagnostics/ledger.test.ts`, `tests/plugin/usage-diagnostics.test.ts`, `tests/cli/config-diagnostics.test.ts`, `tests/cli/stats.test.ts` (new) | Focused behavior tests |
| Existing routing/lifecycle/loop-controls/update tests; `tests/integration/oc2-diagnostics.test.ts` (new) | Regression and fixture-backed integration evidence |
| `README.md`, `CHANGELOG.md`, `.gitignore` | User documentation and exclusion of the new runtime ledger only |

**Protocol decisions (implementation defaults within the spec):**

- Export `DeclaredKind = 'initial' | 'fix' | 'review' | 'unknown'` and `DeclaredLabels = { taskId: string; kind: DeclaredKind; comparisonGroup: string }`; missing strings use `'unknown'`.
- `parseDispatchLabels(description: unknown): DeclaredLabels` reads only the leading bracketed metadata, not the descriptive body. IDs use ASCII letters/digits/`._-`, 1–128 characters. Validate each field independently; never save the whole description.
- Export `LedgerRecord` as three allowlisted variants sharing `{ v: 1; id: string; timestamp: string; type: 'dispatch' | 'session' | 'comparison' }`.
- Export `DispatchRecord`, `SessionRecord` and `ComparisonRecord` as the corresponding `Extract<LedgerRecord, { type: ... }>` aliases. Reuse `TokenCounters` by type-only import from `src/server/watchdog-events.ts`; do not move or alter watchdog types.
- Dispatch records contain `parentSessionId`, tool `callId`, target `agent`, `declared` labels/model and `childSessionId: 'unknown'`. The stable dispatch identity is parent-session ID plus tool-call ID, not a timestamp.
- Session records contain `sessionId`, known parent/agent or `'unknown'`, `startedAt`/`endedAt` as ISO strings or `null`, `status`, `tokens: TokenCounters | null`, `tokenSource: 'session.usage.updated' | 'unknown'`, `retries: number` and `partial: boolean`. `null` means unavailable; retain the five counters separately, without inventing an additive billing total.
- Comparison markers contain independent task/group IDs and known `startRevision`/`endRevision` or `'unknown'`. They describe supplied/prepared context, not an automatically verified dispatch-to-session binding.
- Exact status strings: `running`, `succeeded`, `failed`, `interrupted`, `idle`, `deleted`, `partial`, `unknown`. Idle/deleted alone are not proof of success.
- Only explicitly allowlisted primitive fields enter JSONL. Unknown fields are discarded; unsupported record types/versions and malformed lines are skipped with a count, never repaired or echoed.
- No automatic task-token join is implemented in this version. Counts by declared task and usage by observed session are separate tables; comparisons show unknown token attribution when no verified binding exists.

---

### Task 1: Opt-in Configuration and Metadata Ledger

**Files:** create `src/diagnostics/ledger.ts`, `tests/diagnostics/ledger.test.ts`, `tests/cli/config-diagnostics.test.ts`; modify `src/cli/config.ts`, `src/cli/commands/init.ts`, `.gitignore`.

**Interfaces:**
- In `src/cli/config.ts`, export `KikiDiagnosticsConfig = { enabled: boolean }`, `DEFAULT_DIAGNOSTICS = { enabled: false }`, and `sanitizeDiagnostics(raw: unknown): KikiDiagnosticsConfig`.
- Add `diagnostics` to the CLI `KikiConfig`, defaults, loader and wizard-created config; keep all existing health/path/model handling unchanged.
- In `ledger.ts`, export the types/parser above, `createLedgerWriter(root: string): (record: LedgerRecord) => boolean`, and `readLedger(root: string): { records: LedgerRecord[]; skipped: number; readError: string | null }`.
- Writer returns false on failure, never throws or creates files until an actual write. Reader never writes; missing ledger returns no records and a distinct “no data” result through the empty records, not invented zero usage.

- [ ] **Step 1: Write failing configuration/parser/storage tests.** Pin these assertions:

  ```ts
  expect(sanitizeDiagnostics(undefined)).toEqual({ enabled: false });
  expect(sanitizeDiagnostics({ enabled: 'true' })).toEqual({ enabled: false });
  expect(sanitizeDiagnostics({ enabled: true })).toEqual({ enabled: true });
  expect(parseDispatchLabels('[task:diag fix cmp:trial] Check regression')).toEqual({
    taskId: 'diag', kind: 'fix', comparisonGroup: 'trial',
  });
  expect(parseDispatchLabels('[task:diag invalid cmp:trial] Check regression'))
    .toEqual({ taskId: 'diag', kind: 'unknown', comparisonGroup: 'trial' });
  ```

  Also assert absent/malformed brackets, missing fields, excessive IDs, arrays/null and control characters remain safe; prompt/body sentinels never appear in a parsed/written record. Test missing/unwritable paths, one valid JSONL record, truncated/unsupported lines, and preservation of unknown/null versus zero.

- [ ] **Step 2: Run `npm test -- tests/diagnostics/ledger.test.ts tests/cli/config-diagnostics.test.ts`; require genuine assertion/import failures for the new behavior, not an unrelated environment failure.**
- [ ] **Step 3: Implement the exact interfaces and `diagnostics.enabled` sanitization.** Apply the sanitizer in `loadConfig`; include `{ ...DEFAULT_DIAGNOSTICS }` in `runWizard` without another wizard question. Keep project initialization non-overwriting. Build records from a whitelist rather than spreading raw tool/event input. Append one complete JSON line per write; do not rewrite existing lines. Add only `.agentic/kiki/run_ledger.jsonl` to `.gitignore`.
- [ ] **Step 4: Re-run the targeted tests plus `npm test -- tests/cli/config-health.test.ts`; require pass and unchanged health defaults.**
- [ ] **Step 5: Review the Task 1 diff.** No live config/registry edits, unrelated ignore rules or commits.

### Task 2: Observe Dispatches and Child Sessions Without Altering Watchdog Behavior

**Files:** create `src/server/usage-diagnostics.ts`, `tests/plugin/usage-diagnostics.test.ts`; modify `src/server/index.ts`, `src/server/routing-logger.ts`, `tests/plugin/server-lifecycle.test.ts`, `tests/plugin/routing-logger.test.ts`.

**Interfaces:**
- `startRoutingLogger(ctx: ServerContext, onDispatch?: (record: DispatchRecord) => void): Promise<() => Promise<void>>`; `DispatchRecord` is Task 1's dispatch variant.
- `createUsageDiagnostics(options: { write: (record: LedgerRecord) => boolean; now: () => number }): { dispatch(record: DispatchRecord): void; event(event: OpenCodeEvent): void; stop(): void }`.
- `loadDiagnosticsConfig(directory: string): KikiDiagnosticsConfig` in `src/server/index.ts`: project-scoped modern config only, same safe fallback pattern as `loadHealthConfig`.

- [ ] **Step 1: Write failing tests using the existing fake hook/stream lifecycle harness.** Exercise enabled recording, default-off zero ledger activity, unwritable writer, cleanup twice, setup failure, late events and reload. Off must still have exactly the existing one routing hook and one stream; enabled also reuses them.
- [ ] **Step 2: Run `npm test -- tests/plugin/usage-diagnostics.test.ts tests/plugin/server-lifecycle.test.ts tests/plugin/routing-logger.test.ts`; verify the expected failures.**
- [ ] **Step 3: Add the optional dispatch observer to the existing routing hook.** SDK `tool.d.ts` exposes `sessionID`, `messageID`, `id`, `tool`, and untyped `input`. Project only those identities, target agent, bounded declared model and parsed prefix. Keep routing JSON exactly `{ timestamp, agent, model }`. Catch observer failure independently of existing logging; do not mutate input, execute tools or inspect the prompt. Mark this as an observed invocation at `execute.before`, not proof that the child completed or even started.
- [ ] **Step 4: Implement the collector against raw event discriminants, not lossy watchdog completion events.** Do not change `decodeWatchdogEvent` or `watchdog.ts`:
  - Register observed children from `session.created` with a parent; agent updates affect the same session. Do not invent parent IDs for root/unknown sessions.
  - Keep one session-lifetime usage snapshot; treat `session.usage.updated` as the aggregate source. Do **not** blindly replace it with `session.step.ended`/`failed` counters: their schema also contains `assistantMessageID`, and the existing decoder erases that distinction. Until aggregate semantics are verified, step-only values cannot be advertised as a session total.
  - Persist an initial partial session record, then its last known snapshot on finish or cleanup. A hard process kill may leave only the initial incomplete record; do not promise recovery of in-memory observations.
  - Record distinct execution statuses, retry events once by event ID, and durations only when their endpoints are known. Repeated idle/finish signals must not add runs or tokens. A resumed session remains one lifetime token row; do not attribute that total anew to every dispatch.
  - Stable session snapshot IDs use session ID plus source event ID; `stats` selects the latest observed snapshot per session. Flush during bounded existing cleanup; stop accepting late events.
  - Dispatch labels and sessions remain unjoined, including sequential/concurrent identical-agent children. Existing `input.sessionID` may be a continuation request, not proof of a new child's identity or task-scoped usage.
- [ ] **Step 5: Wire collection only when enabled.** No second event subscription or new timer. Feed the collector through its own exception boundary while preserving watchdog event handling and existing cleanup order. No extra discovery/API requests, interrupt calls or resolved-model lookup. Missing live events after reload are incomplete evidence, not grounds for reconstructing history.
- [ ] **Step 6: Add and run deduplication/usage/privacy assertions.**

  ```ts
  // Two aggregate snapshots: retain the latter, never sum to 30.
  expect(latestSession.tokens?.input).toBe(20);
  // Two same-agent children: no guessed label ownership.
  expect(dispatchRecords.every(row => row.childSessionId === 'unknown')).toBe(true);
  ```

  Fixtures must also cover a later small step value not replacing the aggregate, missing aggregates as `null`, zero-valued real snapshots, duplicate retries/finishes, resumed sessions, interrupted/failed status, root exclusion, cleanup partials and injected description/prompt/error-content sentinels.

- [ ] **Step 7: Run `npm test -- tests/plugin/usage-diagnostics.test.ts tests/plugin/server-lifecycle.test.ts tests/plugin/routing-logger.test.ts tests/plugin/watchdog.test.ts tests/plugin/watchdog-events.test.ts`; require pass.** Do not tune watchdog thresholds or cancellation handling to make diagnostics tests pass. Review the task diff; no commits.

### Task 3: Read-Only Statistics and Existing-Artifact References

**Files:** create `src/cli/commands/stats.ts`, `tests/cli/stats.test.ts`; modify `src/cli/index.ts`.

**Interfaces:**
- `stats(projectPath = '.'): Promise<number>` prints the summary and returns CLI exit status; `0` for readable/no-data input, `1` for actual read/config errors. Register `stats [path]` and propagate nonzero status as for `routing`.
- Consume Task 1's validated records; use existing project `loadConfig` for `paths.taskRegistry` and sanitized health settings for `health.logPath`. No global OpenCode settings or credentials are needed.

- [ ] **Step 1: Write failing fixture-based summary tests.** Spy on console output; invoke `stats(root)` directly. Start with one declared fix, two declared reviews, two same-agent child sessions and an independent comparison group. Assert separate task/dispatch and session tables, explicit unknown attribution and preservation of the task/kind/comparison fields.
- [ ] **Step 2: Run `npm test -- tests/cli/stats.test.ts`; verify genuine missing-command/behavior failures.**
- [ ] **Step 3: Implement deterministic local aggregation.**
  - Dedupe dispatch invocations by parent-session/tool-call identity; dedupe session snapshots by stable record ID and display only the latest snapshot per session. Repeating a JSONL line must not inflate counts.
  - Count declared `fix`/`review` invocations; show unknown/missing labels separately. These are invocations, not proof that separate logical review cycles or successful fixes occurred.
  - Display the five token counters per session with source/completeness; never sum successive snapshots, task-associated guesses or potentially overlapping reasoning/cache billing categories.
  - Group declared comparisons side by side, with known start/result revisions; task/group token totals remain `unknown` without a verified dispatch-to-session link. Show session usage separately so no misleading cost-per-variant conclusion is implied.
  - Join watchdog records strictly on `sessionId`. Identify incidents using the health event, session, timestamp and reason. Count `watchdog-abort` once as an incident, not again for `watchdog-abort-ok`/`failed`; show `watchdog-quiet` separately as warnings. Show unmatched incidents rather than discarding them. Never emit raw health error/message payloads.
  - Read the configured registry JSON only to match a declared task's existing `spec`/`plan` strings. Display them as **current reference paths**, not historical versions; never open those documents or scan source. Preserve explicit known start/end revision markers separately. No Git subprocess or guessed `HEAD` association in `stats`.
  - Missing optional health/registry data produces a clear unavailable-reference note, not false absence of incidents or invented paths. Unreadable/malformed required ledger/config data produces a sanitized command error; no stack trace/raw JSON dump. Distinguish “no data”, recorded zero and unknown usage. Unknown record versions are reported as skipped.
  - When collection is enabled but no ledger is available, report that observation gap without claiming to know whether writes failed or no child ran. No sidecar error store or permission probe is introduced.
- [ ] **Step 4: Pin regression/security assertions.** Registry and input-log bytes unchanged before/after; no file creation when data missing or collection disabled; custom project/config paths beat cwd; missing task and revision references remain unknown. Use fixtures with a truncated line, future version, duplicate line, invalid token values, unmatched incident and secret sentinel; output must not echo raw invalid data. Assert no model, network or child-process call and no reads of referenced spec/plan/code contents.
- [ ] **Step 5: Re-run `npm test -- tests/cli/stats.test.ts tests/cli/status.test.ts`; require pass.** Review the CLI registration/diff, without building or committing as part of this task.

### Task 4: Orchestrator Labels, Manual Comparisons and End-to-End Evidence

**Files:** modify `src/cli/config.ts`, `tests/cli/loop-controls.test.ts`, `tests/cli/update.test.ts`, `README.md`, `CHANGELOG.md`; create `tests/integration/oc2-diagnostics.test.ts`. Reuse `tests/helpers/oc2-fixture.ts` and `tests/integration/fixtures/oc2-provider.ts`; do not create another harness.

**Interfaces:** only the orchestrator-generated body changes. Existing permissions, role responsibilities and other agent prompts remain unchanged. Comparison preparation uses Task 1's existing `createLedgerWriter` with a typed `comparison` marker, not a new runner, CLI command or tool argument.

- [ ] **Step 1: Write failing generated-template/update tests.** Pin examples with 3–5 whitespace-separated words:

  ```ts
  expect('[task:diag fix] Correct regression now'.split(/\s+/)).toHaveLength(5);
  expect('[task:diag review cmp:trial] Check changes'.split(/\s+/)).toHaveLength(5);
  ```

  Test the actual generated guidance and round-trip its examples through `parseDispatchLabels`. Require task/kind preservation, optional comparison ID, unknown fallback, and task/substep IDs using the existing task identity rather than new registry counters.

- [ ] **Step 2: Run `npm test -- tests/cli/loop-controls.test.ts tests/cli/update.test.ts`; verify the new assertions fail.**
- [ ] **Step 3: Add one small orchestrator section for labels and requested comparisons.** Keep guardrails, dispatch limits and native permission frontmatter unchanged. Do not add budgets, quality labels or a rule to set a model unless the user explicitly requested that comparison.
  - Only on user request: obtain task text, chosen variants and starting revision; delegate preparation/execution to authorized existing builders, or use user-prepared directories.
  - Require a fresh separate worktree at the same resolved starting revision for each trial. No fictitious `subagent.workdir`; builders receive explicit directory instructions and use ordinary permitted operations.
  - When collection is enabled and writing the ledger is permitted, the preparation builder appends one metadata-only comparison marker using `createLedgerWriter`: task/group, known starting commit and any genuinely available result commit. This is a record of supplied/prepared context, not a session-binding mechanism. Do not copy prompts, diffs or source; off means no marker write.
  - Preparation/cleanup must preserve user changes, retain useful work until disposal is authorized, and report dependencies/untracked inputs/dirty-state limitations. No automatic commits, paid trials, global routing edits or permission workarounds.
  - Explicitly state that absent child binding yields unknown comparison-token attribution; separate records do not justify claiming equal quality, savings or replay.
- [ ] **Step 4: Add a real-binary integration test using the existing loopback scripted provider and disposable HOME/XDG fixture.** Run one labeled child with collection on and an equivalent off control; no paid provider or live user config. Verify ledger presence/absence, independent labels, session ID/status/usage-source behavior and unchanged routing-log keys. Use a multi-step child to compare aggregate usage with the fixture session's observable total; pin the source semantics rather than treating all token-bearing events alike. If the installed runtime contradicts the spec's cumulative-token assumption, stop with evidence for reviewer/spec handling, not a guessed sum. Do not weaken watchdog protections to avoid the unrelated planner interruption.
- [ ] **Step 5: Add synthetic two-variant marker/summary coverage.** Use different isolated fixture roots at a common fixture revision and known comparison metadata; verify side-by-side labels/revisions and honest unknown session linkage. This tests plumbing, not reviewer quality, cheaper-model effectiveness or reproducible outcomes.
- [ ] **Step 6: Historian documentation pass.** Document `{ "diagnostics": { "enabled": true } }`, default-off behavior, `kiki stats [path]`, metadata privacy, ledger growth/no rotation, declared counts/model identity, unknown joins, partial sessions and current-path-versus-version limits. Explain explicit comparison preparation/marker recording under normal permissions and that worktrees are not sandboxes. Add a factual Unreleased CHANGELOG entry; do not claim measured savings or quality improvement. Do not install/update the live agents.
- [ ] **Step 7: Run final verification only during authorized implementation.**
  - `npm run build`, `npm run lint`, `npx tsc --noEmit` — each exit 0.
  - Run the project's configured `commands.security` check (default: `npm audit`). Record the exact command, exit status and complete stdout/stderr in the builder handoff; do not claim success without evidence. If permission is required but not granted, report `PERMISSION_BLOCKED: <command>` and stop without retry or workaround. An unresolved check failure is reported as `BLOCKED`, not waived.
  - `npm test -- --no-file-parallelism` — report actual pass/fail/skip counts; no fabricated baseline counts.
  - `OPENCODE_TEST_BINARY=/home/lutz/.opencode/bin/opencode npm test -- tests/integration/oc2-diagnostics.test.ts tests/integration/oc2-watchdog.test.ts --no-file-parallelism` — require actual execution/pass, record the fixture-observed 2.x version; no exact 2.2.6 runtime gate. If unavailable/denied, report blocked rather than counting skips as evidence.
  - Inspect `git diff --check` and the task diff. Build output may modify generated `dist/`; preserve unrelated changes and record any generated outputs rather than deleting/resetting them.
- [ ] **Step 8: Obtain whole-change reviewer approval against this plan, the approved spec and `.agentic/kiki/alignment.json`.** Historian documentation must be complete or explicitly not required before task completion. No automatic commit, push, install, release or comparison run follows the review.

## Coverage and Handoff

- Spec §§1–4, 6: Tasks 1–3; opt-in/privacy/fail-open/regression coverage in Tasks 1–2.
- Spec §4.1: reference projection in Task 3; supplied known revision markers and limitations in Task 4.
- Spec §5: no guessed joins in Tasks 2–4, including the sequential case.
- Spec §7: Task 4; comparisons remain an explicitly requested existing-agent workflow, not new execution infrastructure.
- Spec §§8–10: acceptance mapped across the four tasks and fixture-backed verification above.

**Self-review:** Interfaces and ownership are shared above; every task has a failing-test/run/implementation/pass gate. No unsupported subagent arguments, dependency upgrade, telemetry registry writes or quality subsystem are planned. Token aggregate semantics require fixture evidence before implementation can claim session totals. Known dispatch/session correlation limitations are preserved, not solved by inference.

**Next gate:** Architect review of this plan; user approves the spec, reviewer approves the plan. No new user plan-approval or execution-method question is introduced. This planning-only control run does not authorize implementation.
