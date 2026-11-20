# Review: read-only Git inspection grants for specialist agents

Date: 2026-11-19
Reviewer: kiki-reviewer (final diff review, inline)
Delta under review (uncommitted working tree, HEAD 620a9f9):
- `src/cli/config.ts` — new `READ_ONLY_GIT_PATTERNS` + `readOnlyGitRules()`; `shellRules(options)` gains `readOnlyGit`; five builders opt in
- `dist/cli/config.js`, `dist/cli/config.js.map`, `dist/cli/config.d.ts.map` — rebuilt artifacts
- `tests/cli/config-readonly-git.test.ts` — new focused test (9 runtime tests)
- Unrelated pre-existing dirty state preserved untouched: `opencode.jsonc` (agent model removals only), `.agentic/kiki/TASK_REGISTRY.json` (orchestrator bookkeeping, +106 lines)

## Verdict: PASS_WITH_NOTES

## Basis

Checked the actual diff of `src/cli/config.ts`, `dist/cli/config.js` (+ both maps), and the new test file against the user requirement: exact `git status *`, `git rev-parse *`, `git worktree list *` allows for the seven specialist agents, not the orchestrator; no blanket `git worktree *`, no write grant. Read `.agentic/kiki/alignment.json` fresh (guardrails: no hardcoded secrets, parameterized queries, no stack-trace leakage — none touched by this delta). Judged the builder's recorded evidence without rerunning checks.

**Requirement coverage (src/cli/config.ts:250–254, 231–243):** the three patterns are verbatim as specified. `shellRules({ readOnlyGit: true })` is used by the five builders that generate the seven specialists — `buildBrainstormerPermissions` (brainstormer + planner via `generatePlannerTemplate`), `buildImplementerPermissions` (implementer + gui-designer via `generateGuiDesignerTemplate`), reviewer, escalation, historian. `buildOrchestratorPermissions` (src:471) keeps plain `shellRules()` and gets none.

**No scope creep / no write grant:** the new rules are `allow` effects for three read-only inspection prefixes only. Repo-wide grep of src/dist finds no `git worktree *` blanket — only `git worktree list *` (src:253, dist:194). No dependency, persistence, or new abstraction beyond a one-field options parameter; smallest sufficient change. The pre-existing effective shell envelope for subagents (baseline `allow shell *`, publishing asks, force-push denies) is unchanged — the delta adds no capability that did not already exist mechanically; its value is the explicit, test-enforced read-only grants that survive inherited asks and a future tightened baseline.

**Rule order and security effect:** order is baseline allow → publishing asks → read-only allows → force-push denies (src:237–242). The load-bearing placement — the new allows precede the force-push denies — is enforced structurally by the existing regression (`tests/cli/oc2-permissions.test.ts:421–443`: per role, `shell.slice(-5)` equals the deny table, plus `effectFor` last-match-wins assertions that force-push forms deny and `-f` branch names stay ask, across all 8 roles). None of the three patterns glob-matches any push/force-push form, so no deny or ask is weakened. `projectPermissionRules` (src/cli/oc2-permissions.ts:96–130) never relaxes an inherited deny/ask into allow, and the new allow resources are distinct keys, so masking of project configs cannot use them to weaken the denies or a user's explicit same-resource ask.

**Test adequacy:** the new focused test asserts, via `baselineAgents()` (which parses the real generated templates, src/cli/opencode-config.ts:421–425): all 3 patterns present as allow for each of the 7 roles; absent for the orchestrator; and for every one of the 8 agents the only `git worktree`-prefixed allow is exactly `git worktree list *` (orchestrator: none). Together with the pre-existing regression suite this covers grant, exclusion, ordering, and effect-level security invariants.

**Source/dist parity:** `dist/cli/config.js` mirrors the source change exactly — same pattern array, same conditional spread, same five call sites, orchestrator still plain `shellRules()`; maps are regenerated single-line artifacts consistent with the recorded build EXIT 0. No stale dist logic.

**Evidence judged (not rerun):** focused GREEN 9 pass matches the final file's 9 runtime tests; permissions/worktrees regression 36 pass EXIT 0 is consistent with the invariants I verified by reading the current diff (the earlier rule-order mistake and its correction are exactly what that suite enforces); build/lint EXIT 0 consistent with in-parity dist artifacts. The broad `npm test` run (797 pass / 16 skip / 4 fail) was honestly reported as not green and not claimed as green; the four failures are attributed to the missing `OPENCODE_TEST_BINARY` fixture prerequisite in oc2-security-boundaries. No live install/update/commit/push — consistent with the working-tree state (delta uncommitted; only the expected files plus the two known-dirty unrelated files).

## Notes (non-blocking)

1. **README prose pending (planned historian step):** the "Security boundaries" section (README.md:29–35) still describes the shell model without the new read-only git allows. Known stale; do not treat as delivered documentation until the historian updates it.
2. **RED evidence counts describe an intermediate test revision:** the recorded RED (7 fail / 2 pass over 9 tests) cannot come from the final test file in a pre-implementation state — the strict third test (`toEqual(['git worktree list *'])` per specialist) would also fail, giving 8 fail / 1 pass. The worktree test was evidently strengthened between RED and GREEN. Legitimate TDD evolution; the load-bearing GREEN (9 pass) covers the final, stricter shape.
3. **Comment justification is mechanically imprecise (src/cli/config.ts:245–249):** the claim that placing the new allows "after the broad shell baseline" is what prevents an inherited `shell *` ask from blocking inspection is fuzzy — under last-match-wins the baseline allow already wins that contest, and the new rules' position relative to the baseline changes nothing. Their position's actual load-bearing function is preceding the force-push denies, which the regression enforces. Behavior is correct; only the comment's reasoning is loose.
4. **Pattern coverage detail:** `git status *` etc. require at least one argument (the project's glob model compiles to `^git status .*$`), so bare `git status` matches only via the baseline allow. Exact per the user-specified patterns and no functional gap today; worth remembering if the baseline shell allow is ever tightened.
5. **Broad-suite failures unverifiable as environmental:** per the no-rerun constraint I could not independently confirm all four `npm test` failures are the missing `OPENCODE_TEST_BINARY` fixture. The disclosure is honest and the delta-affected checks (focused, regression, build, lint) have their own recorded green evidence; the broad suite remains not-green and unclaimed.
