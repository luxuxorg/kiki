# B3 provenance (private — never dispatch to the reviewer)

**One-sentence defect:** oc2 paths enforce an exact-2.2.6 version gate in doctor and reject
standard OpenCode config files (`opencode.json(c)` / `tui.json(c)`) as OC1 markers.

- **Introduced by:** `7463ed1` — "feat!: release v3.0.0 for OpenCode 2" (62 paths under
  `src`+`tests`; isolation stress test)
- **Base (= fix^):** `7463ed1`
- **Fix:** `b870bc7` — "fix: support standard OpenCode config and drop 2.2.6 version gate"
- **Behavioral tests:** `tests/cli/doctor.test.ts` + `tests/cli/oc2-paths.test.ts`
- **Evidence regions:** version gate in `src/cli/commands/doctor.ts`; marker rejection in
  `src/cli/oc2-paths.ts`

## Behavioral proof

**Status: GENUINE — recorded.** The fix's test diff overlaid on base `7463ed1` produced 8 failing
tests; the same suite at `b870bc7` passed 25/25. The base failures are the intended version-gate and
standard-config assertions, not setup or dependency errors. No source, test or commit changes were
made to the main checkout.

Proof procedure used (from the plan, Task 4 Step 3):

1. Create a disposable proof tree detached at `7463ed1`.
2. Overlay only the fix's test diff:
   `git diff b870bc7^ b870bc7 -- tests/cli/doctor.test.ts tests/cli/oc2-paths.test.ts`
3. Run:
   `npm test -- tests/cli/doctor.test.ts tests/cli/oc2-paths.test.ts`
4. Repeat the same command at `b870bc7` (fix present).

The proof recorded the historical tooling/environment, failing titles/assertions, commands and
exits. Required observed outcome: doctor/version and standard-config behavior fail at `7463ed1` and
pass at `b870bc7`; runtime/setup errors are not proof. Pinned assertions:

- `passes with native agents and package registration without gating on the binary version`
- `reports the standard OpenCode roots as the normal setup`
- parameterized `accepts_standard_config_files_shared_by_oc1_and_oc2 (%s)`
- parameterized `accepts_legacy_cli_config_without_a_kiki_loader (%s)`
- `fails closed on leftover V1 Kiki artifacts instead of masking them`

## Artifact verification performed

- `git rev-parse b870bc7^` = `7463ed1e3a06ac497fba6ae619e137d79b20566f`; base is `7463ed1`.
- `input/case.patch` is byte-identical to `git diff 7463ed1^ 7463ed1 -- src tests`; every path
  is under `src/` or `tests/`.
- On a clean detached worktree at `7463ed1`, `git apply --check -R input/case.patch` succeeds:
  the introducing change is already in the base tree (it is HEAD), so the patch must not be
  applied for review.

## Gate

**DISCARDED / INVALID — not an accepted defect case.** Behavioral proof is genuine (8 fails at base
`7463ed1`, 25/25 pass at `b870bc7`), but the case is not a valid defect case: the task prompt only
says "review the migration" and never states that standard OpenCode config must be accepted without
an exact-version gate. The exact `2.2.6` pin was intentional migration behavior; the later
`b870bc7` change was a policy change, not a defect at the time.

Gate outcomes on the actual reviewer set:

- `mistral/mistral-large-latest` — PASS_WITH_NOTES: judged the exact `2.2.6` gate intentional and
  consistent with the prompt; missed the intended defect (a miss, but the prompt lacked the
  criterion, so this is not evidence that the case is discriminating).
- `openrouter/z-ai/glm-5.3` — PASS_WITH_NOTES: same judgment; missed the intended defect.
- `gpt/gpt-6.1-sol` — FAIL: off-target data-root alias finding, not the intended version-gate
  defect, so it does not count as a catch.

Because no reviewer matched the intended defect on a prompt that stated the acceptance criterion,
the case is discarded as invalid rather than treated as all-fail. Case files are kept as historical
evidence only; not demoted to smoke/edge, not a metric, not accepted and not counted. Never aggregate
gate outcomes into a precision figure.
