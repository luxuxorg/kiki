# C (control) provenance (private — never dispatch to the reviewer)

**Control statement:** No known defect — `64f0ec7` adds bounded loop controls and reviewer
governance; the full suite is green and no later fix is known to touch its files.

- **Change under review:** `64f0ec7` — "feat: add bounded loop controls and reviewer
  governance"
- **Base:** `00b9f2a` (TASK_REGISTRY-only chore)
- **Fix:** none (control case)
- **Files in the change:** `src/cli/config.ts` (code and generated agent prompts) and
  `tests/cli/loop-controls.test.ts`, `tests/cli/install.test.ts`,
  `tests/cli/oc2-permissions.test.ts`

## Control ground truth

**Status: NOT RECORDED — case not accepted.** A native `external_directory` permission block
prevented running the suite in a `/tmp/opencode` worktree in this session. No green result is
claimed below.

Planned procedure (from the plan, Task 5 Step 3):

1. Create an isolated proof tree at `00b9f2a` carrying `input/case.patch` (applied uncommitted).
2. Run `npm test` with the historical dependency set.
3. Record actual suite output and exit code.
4. Inspect subsequent history touching the changed files.

Do not invent a green result or infer defect absence from it. Ground truth is weaker than
B1–B3's behavioral proof and the gate treats it accordingly.

## Artifact verification performed

- `git rev-parse 64f0ec7^` = `00b9f2a92a3df2812f2c5811131e62a80291b5cf`; base is `00b9f2a`.
- `input/case.patch` is byte-identical to `git diff 00b9f2a 64f0ec7 -- src tests`; every path
  is under `src/` or `tests/`.
- On a detached worktree at `00b9f2a`, `git apply --check input/case.patch` succeeds. For the
  control the patch is applied uncommitted before review; for defect cases it is not applied.

## Gate

Pending. C runs on the same models as the defect cases. Every model returning PASS or
PASS_WITH_NOTES (no blocking FAIL) is its healthy expected outcome and does not drop it; an
all-fail (no model matching) result is investigated for a real defect or a misleading prompt.
Never aggregate gate outcomes into a precision figure.
