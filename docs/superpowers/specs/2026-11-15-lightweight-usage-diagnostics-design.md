# Lightweight Usage Diagnostics (Tokens, Fix Dispatches, Review Rounds) — Design

- **Date:** 2026-11-15
- **Status:** APPROVED 2026-11-15 by user. Approach selected in discussion (dispatch-declared task/intent labels on the existing `subagent` path, one separate ledger, manual summary); the choices marked **proposed default** below are the author's, not the user's.
- **Out of scope:** implementation, planning, registry edits, commits. The deferred reviewer-precision eval stays deferred and untouched.

## 1. Intent and why

Incident A (48 h / ~200 M tokens) surfaced only after the fact because nothing records what a Kiki run cost in tokens, how many fix and review rounds it took, or which watchdog incidents belong to it. The user wants statistics that identify problems to address — tokens used, fixes and review rounds used — **without evaluating outcome quality**. The diagnostics layer is metadata-only observation: it sees what happened, never whether the result was good.

Both modes serve this: **passive observation** of normal runs, and **explicitly requested comparisons** of the same user-supplied task under alternate models or prompts, counted side by side.

## 2. Goals / non-goals / anti-goals

- **Goal:** per child run (session): token totals, declared fix/review-round intent, duration, terminal status — in one ledger separate from `TASK_REGISTRY.json`.
- **Goal:** watchdog incidents counted and identifiable, joined to their child session, as a source for "where to look"; the watchdog stays flag-only and never triggers paid runs.
- **Goal:** manual summary of ledger contents by a `kiki` CLI subcommand (existing CLI shape; no dashboard, no server, **no model call**).
- **Goal:** manual comparison runs as an **orchestrator workflow** with existing dispatch/config/permission machinery — not a new runner, replay or command.
- **Goal (later-use anchor only):** ledger records carry stable IDs plus read-only references to already-existing versioned artifacts (spec/plan paths, known Git revisions), so **later, independent** retrospective quality work can attach to the same IDs. This design performs no quality evaluation now.
- **Non-goals:** outcome-quality evaluation; syncing ledger state with the task registry (the registry is **never written** by collection — read-only reuse of its spec/plan references is allowed); native resolved-model telemetry; transcript or task-text archiving; source snapshots or retention machinery.
- **Anti-goals (failure even if it works):** feedback engine, questionnaires, rating UI, automated feedback requests, scoring or LLM judge, benchmark hunting, automatic model/prompt/routing changes, pricing service, budget engine, new permission grants, dependency upgrade just for telemetry. Task text is never automatically archived; prompt bodies and code are never read or stored for collection.

## 3. Approaches considered and the selection

1. **Zero-workflow-change raw counts** — measure dispatches/tokens/retries per session only. Set aside: cannot deliver the user's stated main metric (identifiable fix/review counts per task); "builder after first" is provably ambiguous (substeps, parallel builders).
2. **Dispatch-declared intent on the same measured core (selected)** — the orchestrator declares task ID + round-kind on each dispatch; the plugin parses it defensively and correlates with observed facts. A prompt convention is not enforced truth; missing/invalid labels record as `unknown`. A syntactically valid but semantically wrong declaration cannot be detected and is never claimed to be.
3. **Full telemetry/replay framework** — rejected: the machinery that sank the prior eval attempt; anti-goal territory.

## 4. What the plugin records

All parsing is **defensive**: the `subagent` input reaches `tool.execute.before` as untyped `input` (verified: `@opencode/plugin/dist/promise/tool.d.ts` ToolHooks); unexpected shapes record `unknown`, never throw. No extra tool args are proposed — the label convention rides inside the existing, schema-undefined description string.

- **Declared (self-report, stored as declared):** task ID; round-kind (`initial` | `fix` | `review`); an **optional independent comparison group ID** (`cmp:<groupId>`, present only on explicitly requested comparison runs); dispatch model string (`unknown` when absent — the **configured default is not a verified resolved model**; no resolved-model event exists under the pinned `@opencode/plugin@2.2.6`). Fields are independent: a comparison dispatch keeps its task ID and kind, and `cmp` never overwrites them; missing fields record `unknown` only when actually missing.
- **Observed (measured):** the dispatch occurred; agent ID; dispatching session ID; child session ID(s) via `session.created` `data.parentID` + `data.agent` (verified: `src/server/watchdog-events.ts:87-95`); one **final cumulative** token snapshot per child session from `session.usage.updated`/`session.step.ended`, which are cumulative per session (verified: `src/server/watchdog-events.ts:183-184`; brief §5) — snapshots are never summed, so no double counting; start/finish timestamps and terminal status from the existing finished-event set.
- **Counting semantics:** fix invocations and review invocations are **declared** labels on actual reviewer/builder dispatches — never inferred from dispatch order. Child runs are counted once via created/finished events; the existing tool-call events and cumulative snapshots are not re-counted as runs. `session.retry.scheduled` may be counted as retries, separately from rounds.
- **Partial/cancelled/interrupted sessions:** recorded with their last snapshot and an explicit `partial` / terminal status field; no guessing at totals.
- **Watchdog incidents:** stay in `health_log.jsonl` as today; the ledger/summary **joins by session ID** (`src/server/watchdog.ts` `watchdog-abort` entries already carry `sessionId`), so incidents are counted and identifiable per run. No new anomaly detection; no evaluation.

### 4.1 Read-only artifact and revision references (later-use anchors)

Specs and plans already describe intended work; code under Git describes delivered work. Reuse these existing artifacts; duplicate nothing:

- **Spec/plan reference:** the existing task registry entries already reference their spec/plan (e.g. `.agentic/kiki/TASK_REGISTRY.json` tasks). When the declared `taskId` matches a registry entry, the summary may surface that entry's spec/plan paths as read-only references — a path is a pointer, distinct from the immutable version, and current code alone is **not** historical evidence.
- **Revision fields, when known:** dispatch/session records may carry `startRevision` (comparison runs: the worktree's starting commit) and, when it actually exists at record time, a delivered end revision. The two stay distinct. A starting SHA **does not** reconstruct dirty or untracked worktree content, a delivered end commit may not exist (incomplete runs), and unavailable references stay `unknown` — no guessing, no auto-commits, no snapshots, no archival system, no recursive artifact ingestion, no retention machinery.
- **Later quality work** (not built here): a future evaluation could attach annotations or evidence to the same task/run IDs and known revisions. IDs do not guarantee the underlying artifacts are retained; OpenCode transcript retention is not promised here. Uncommitted/unretained states remain incomplete/unknown.

## 5. Correlation limit, stated honestly

Under **concurrent children of the same parent with the same agent**, parent linkage + agent + time is not a deterministic dispatch→child mapping, and no published plugin surface exposes a dispatch-to-child-session ID link (the `Subagent` job shape in `@opencode/schema/dist/job.d.ts` carries `childSessionID` but no tool-call ID, and no plugin jobs API was verified). Therefore: declared labels attach to the **dispatch record**; observed tokens/incidents attach to the **child session record**; the join is best-effort and, when ambiguous under concurrency, marked `unknown` rather than guessed. Resolving this deterministically is an **open question**, not something this design invents.

## 6. Ledger and summary

- **One file, proposed default:** `.agentic/kiki/run_ledger.jsonl` — one JSON line per event (dispatch, session finish, comparison marker), metadata-only. `TASK_REGISTRY.json` is untouched by collection; a comparison label must not overwrite task/intent fields.
- **Version/recovery:** each line self-describes (`v: 1`); unknown fields or malformed lines are skipped by the reader, never repaired in place; bounded file growth is accepted (JSONL rotation is out of scope).
- **On/off, proposed default OFF:** one boolean in the existing `.agentic/kiki/config.json` conventions (alongside the current `health` settings, same sanitize/fallback pattern as `src/server/index.ts` `sanitizeHealth` — **no new config engine**). **Off means off:** the plugin creates no ledger records, does not create the ledger file, and adds no observation instrumentation that could change watchdog/routing behavior; the existing routing log and health log are untouched. **On** records as above. `kiki stats` reads previously collected records regardless of the current setting. Default off, so existing installations change nothing until the user opts in.
- **Failure isolation:** all ledger writes happen inside try/catch like the existing routing/health writers (`src/server/index.ts` `createHealthWriter` pattern); a failing or unwritable ledger must not disrupt normal Kiki or the watchdog. Read errors surface only in the summary command's output.
- **Summary, proposed default:** `kiki stats [path]` — deterministic script over the ledger: per task (declared labels) and per child session: tokens, fix/review invocations, retries, incidents, durations, comparison groups side by side. No model call, no quality column, no verdicts. Dispatch labels count declared fix/review invocations per task **independently of session-token linkage**: the summary never attaches a child session's tokens to a task by guess, and §5 unknown joins stay `unknown` even for sequential dispatches (sequencing is not a verified correlation source).

## 7. Orchestrator addition and manual comparisons

**Orchestrator template (small addition):** every dispatch description is prefixed with one grammar that carries the independent fields — `[task:<taskId> <kind>]` for normal work, or `[task:<taskId> <kind> cmp:<groupId>]` on comparison runs — followed by the description's remaining words, keeping the whole description within the existing 3–5-word rule (convention: `src/cli/config.ts:573`). `cmp` is an optional group field, **not** a kind; the kind and task ID are always declared, comparison or not. Compliance is prompt-level; a missing/malformed prefix logs `unknown`. This is the only generated-prompt change; delivered via the normal `kiki update` flow.

**Comparisons (existing machinery only, dispatch-only):** the user explicitly requests one, supplies the task text at request time (never auto-archived), the model/prompt variant, and a starting revision. The orchestrator is **dispatch-only**: it cannot run shell commands or prepare worktrees. Worktree preparation and run execution are delegated by the orchestrator to **existing authorized subagents** (or the user supplies already-prepared directories), under the existing permission gates — no invented subagent working-directory argument, no new grants. Each run is a **separate freshly prepared detached git worktree at that same starting revision** — no shared mutated tree. The orchestrator dispatches each run with the model string set (the same declared input field the routing logger already reads — declared, not a verified resolved model) and the `[task:… <kind> cmp:<groupId>]` label; ordinary permission gates apply unchanged. Caveats, not solved: worktrees are not sandboxes; tracked files may contain secrets; commands run under normal approvals and may reach network/global state; untracked files and `node_modules` differ from the live tree; each run costs tokens; no replay, no reproducibility or savings guarantee, no equivalence of outcomes. No path correlation is promised without actual data (§5). Escalation's scratch-rights authorize nothing here.

## 8. Acceptance checklist (draft)

- [ ] A normal orchestrator run with collection **on** produces ledger entries: dispatches with labels, child sessions with final cumulative token totals, statuses; registry untouched.
- [ ] A comparison dispatch carries task ID, kind **and** `cmp:<groupId>` — all three preserved independently; `cmp` never overwrites kind or task.
- [ ] Unlabeled dispatch logs `unknown`; malformed input logs `unknown`; nothing throws.
- [ ] Collection **off** (the default): no ledger records, no ledger file created, watchdog/routing behavior byte-for-byte unchanged; `stats` still reads earlier collected records.
- [ ] A watchdog incident appears joined to its child session in `kiki stats`.
- [ ] A comparison group of two runs at the same revision appears side by side: declared labels, rounds, retries — session tokens shown per session, never attached to a task by guess; no quality verdict.
- [ ] Unwritable ledger path with collection on: normal run completes; error surfaces only in `stats`.
- [ ] When the declared task ID matches a registry entry, `kiki stats` shows that entry's spec/plan path as a read-only reference; the registry file is never written by collection; a missing registry entry leaves the reference `unknown`.
- [ ] Comparison records carry the known starting revision; missing or unavailable revision references stay `unknown`; dirty/untracked worktree content is never claimed to be reconstructable.

## 9. Test categories needed (no implementation here)

Unit tests for: defensive input parsing (valid, missing, malformed, extra keys); label extraction with independent fields — `cmp:<groupId>` present alongside task ID and kind, never overwriting them, missing fields `unknown` only when actually missing; final-snapshot-only token recording (no snapshot summing) incl. partial/interrupted sessions; watchdog join by session ID; read-only-on-error ledger writer; the off default creating no file and no records while `stats` reads existing records (config sanitize/fallback pattern per `src/server/index.ts`); `stats` output shape; concurrent-sibling ambiguity marked `unknown`; read-only spec/plan reference resolution (matching task → path shown, no registry write, missing match → `unknown`); revision fields recorded when known, `unknown` when absent. Existing suites (`tests/cli/`, `tests/server/` equivalents) for install/update of the template change; integration test against the OpenCode binary for one labeled dispatch, if the existing fixture supports it.

## 10. Open questions / proposed defaults

- **Open:** deterministic dispatch→child correlation under concurrency (§5) — none invented; §5 unknown joins hold even for sequential dispatches.
- **Proposed defaults (not user-approved):** ledger path `.agentic/kiki/run_ledger.jsonl`; `v: 1` lines; one grammar `[task:<id> <kind>]` with optional `cmp:<groupId>` as an independent field; collection **off by default** via one boolean in the existing config conventions; `kiki stats` as the summary; watchdog unchanged except the summary join; read-only spec/plan references and known revision fields per §4.1.
- **Not changed:** reviewer-precision eval stays deferred; no budget/pricing/quality machinery anywhere in this design.