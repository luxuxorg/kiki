# Review: Lightweight Usage Diagnostics Implementation Plan (2026-11-16)

**Verdict: PASS_WITH_NOTES**

**Reviewed paths:**
- `docs/superpowers/plans/2026-11-15-lightweight-usage-diagnostics-plan.md`
- `docs/superpowers/specs/2026-11-15-lightweight-usage-diagnostics-design.md` (approved 2026-11-15)
- `.agentic/kiki/alignment.json`

## Basis (correction re-review)

Previous verdict PASS_WITH_NOTES is reaffirmed. The only subsequent plan change is Task 4 Step 7 (plan lines 175–180), which now explicitly includes the project's configured `commands.security` check (default: `npm audit`) with exact command/output/exit-status evidence, `PERMISSION_BLOCKED: <command>` reporting on missing permission, and `BLOCKED` (not waived) on unresolved failure. This closes the prior checklist gap (old note 2): the security command was previously missing from the plan's verification gates and is now explicitly included. No security check has actually been run during this plan review; it is planned as a future authorized implementation gate only.

Full-scope Basis from the initial review remains: four proportional tasks; default-off `diagnostics.enabled` with no ledger/hook activity when off (plan:17, 70); one metadata-only allowlisted JSONL ledger with no `TASK_REGISTRY.json` writes (plan:19, 60); declared task/kind/comparison/model labels kept strictly separate from measured tokens/status/duration (plan:52–61); no timing/order-based task-session joins, explicitly including sequential dispatches (plan:21, 113, 124); native cumulative usage distinguished from per-step counters, with the aggregate semantics to be fixture-verified before any session-total claim (plan:109, 172); duplicate hooks, retries and resumed sessions must not inflate counts (plan:111, 139); partial/late events and unwritable ledger isolated from watchdog/routing behavior (plan:73, 114, 126); `stats` shows current spec/plan reference paths, not historical versions, without opening or ingesting referenced contents (plan:144); comparisons only on explicit user request via existing authorized subagents/worktrees at a common starting revision, no sandbox/quality/savings claims, no new runner, arguments or permissions (plan:24, 167–171); TDD gates per task; no feedback, pricing, budget or retention machinery. Verified interface anchors exist (`src/server/watchdog-events.ts:9,183`; `src/server/index.ts:30,52`).

## Notes (non-blocking)

1. **Token source (unchanged, accurate):** Plan line 57 restricts `tokenSource` to `'session.usage.updated' | 'unknown'` while spec §4 also names `session.step.ended` as cumulative. The plan conservatively requires the runtime fixture (Task 4 Step 4, plan:172) to verify aggregate counts before implementation may claim session totals; no guessed fallback is permitted. If the fixture shows `session.usage.updated` is never emitted, this becomes a spec-side user decision, not a plan defect.
2. **Security check (corrected old note):** The security command was previously absent from the plan's gates; Task 4 Step 7 (plan:177) now explicitly includes it with evidence requirements. No security scan has been executed during this review; execution is deferred to authorized implementation.
3. No claims are made here that implementation exists, that savings or quality improvements are measured, or about the source of the prior planner cancellations.

**Next gate:** whole-change reviewer approval against plan, spec and `alignment.json` during authorized implementation (plan:181). User approves the spec; reviewer approves the plan; no user plan-approval gate is introduced.