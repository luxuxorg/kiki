# B1 provenance (private — never dispatch to the reviewer)

**One-sentence defect:** Nested-candidate TMPDIR redirection makes `preserveApplyBackups`
relocate retained apply backups into the outer candidate run root, where `dispose()` deletes
them.

- **Introduced by:** `054407b` (release automation; 32 paths under `src`+`tests`)
- **Base (= fix^):** `054407b`
- **Fix:** `ff6ea6d` — "fix: relocate retained apply backups outside candidate run roots
  regardless of TMPDIR"
- **Behavioral test:** `tests/cli/release.test.ts` —
  `relocates a retained backup outside an ambient candidate runRoot and survives dispose`
- **Evidence region:** `preserveApplyBackups` / `preservedBackupBase` in
  `src/cli/commands/release.ts`

## Behavioral proof

**Status: RECORDED — genuine fail-at-base / pass-at-fix observed.** The proof remains valid, but
B1 was **discarded** after the post-amendment gate rerun was also all-fail (see Gate and
Amendment 1 below). It is kept as historical evidence only.
Source: `.superpowers/sdd/reviewer-eval-proof-B1.md`.

- **Base run (defect present):** `054407b` with only the fix's test diff overlaid
  (`git diff ff6ea6d^ ff6ea6d -- tests/cli/release.test.ts`; 185 lines, 81 insertions /
  7 deletions to `tests/cli/release.test.ts`). No `src/` or `dist/` fix changes applied.
- **Command (base):**
  `node node_modules/vitest/vitest.mjs run tests/cli/release.test.ts -t 'relocates a retained backup outside an ambient candidate runRoot and survives dispose'`
- **Base result:** exit `1`; 1 failed / 32 skipped. The genuine outside-run-root containment
  assertion failed at `tests/cli/release.test.ts:379`
  (``expect(realBackup).not.toContain(`${sep}kiki-candidate-`)``): the retained backup landed at
  `…/kiki-candidate-outer-…/tmp/kiki-release-backup-…/apply-backup-…`, inside the outer candidate
  run root. Cross-check via `npm test -- …` gave exit `1` with the same assertion at the same
  line.
- **Fix run:** clean detached tree at `ff6ea6d`, same command and test title → exit `0`;
  1 passed / 32 skipped. Cross-check via `npm test -- …` also exit `0`.
- **Environment:** offline, using a symlink to the locally installed historical dependency set at
  `/home/lutz/lprojekte/kiki-v1/node_modules`; no install, fetch or network. WSL2 Linux
  6.6.87.2-microsoft-standard-WSL2 x86_64; Node v24.22.1; npm 11.19.1; Git 2.43.0;
  Vitest 4.1.0; Vite 8.3.5; TypeScript 5.9.3; `@opencode-ai/plugin` 1.18.35;
  `@types/node` 20.19.43; `jsonc-parser` 3.3.1; `yaml` 2.9.1 — all matching
  `054407b:package-lock.json`.
- **Setup/dependency errors excluded:** an initial attempt with the current checkout's
  `node_modules` failed in `beforeAll` with
  `TS2307: Cannot find module '@opencode-ai/plugin/tui'` (exit 2); that was a dependency setup
  failure, discarded and not counted. With the historical set, the TypeScript build exited `0`
  and the test body executed, so the base failure is the assertion — not import, compile or
  runtime setup.

## Artifact verification performed

- `git rev-parse 054407b` = `054407b386a2f57502243f8b1d288e6a94b65ad5`.
- `input/case.patch` is byte-identical to `git diff 054407b^ 054407b -- src tests`; every path
  is under `src/` or `tests/`.
- On a clean detached worktree at `054407b`, `git apply --check -R input/case.patch` succeeds:
  the introducing change is already in the base tree (it is HEAD), so the patch must not be
  applied for review.
- On a detached worktree at `054407b^`, `git apply --check input/case.patch` succeeds: the
  frozen diff reproduces the introducer.

## Gate

**Status: DISCARDED — all-fail after one prompt amendment.** The first gate below was all-fail;
the prompt was amended once and the full three-model gate was rerun, again all-fail. Per the gate,
B1 is discarded, not demoted to smoke/edge and not a metric; it is kept as historical evidence only
and is not accepted or counted. The gate ran the project's three actual reviewer models, plus
DeepSeek as extra evidence only (DeepSeek is the coding workhorse, not a gate model):

| Reviewer model ID | Gate model? | Verdict | Matched expected | Case outcome |
|---|---|---|---|---|
| `mistral/mistral-large-latest` | yes | PASS_WITH_NOTES | no | model fails the case (miss) |
| `gpt/gpt-6.1-sol` | yes | PASS | no | model fails the case (miss) |
| `openrouter/z-ai/glm-5.3` | yes | PASS_WITH_NOTES | no | model fails the case (miss) |
| `deepseek/deepseek-flash` | no (extra evidence) | FAIL / implementation / major | yes | catch, not counted |

Post-amendment rerun (amended `input/task-prompt.md`, fresh session and worktree per model):

| Reviewer model ID | Gate model? | Verdict | Matched expected | Case outcome |
|---|---|---|---|---|
| `mistral/mistral-large-latest` | yes | PASS | no | model fails the case (miss) |
| `gpt/gpt-6.1-sol` | yes | PASS | no | model fails the case (miss) |
| `openrouter/z-ai/glm-5.3` | yes | PASS_WITH_NOTES | no | model fails the case (miss) |

- Behavioral proof above (fail at `054407b`, pass at `ff6ea6d`) is genuine, but all three actual
  reviewer models missed the defect in both gate runs: no model matched the expected FAIL. The
  all-fail branch allows one concrete authoring-flaw investigation and one full-gate rerun; the
  prompt was amended once and the rerun was still all-fail, so B1 is **discarded** — not demoted to
  smoke/edge and not a metric. A discriminating case needs at least one actual reviewer catch and
  at least one miss. B1 is not accepted and not counted.
- Mistral's notes were unsanitized security-exception log text, `parseGitLog` NUL split, a
  vacuous doctor model check and `readStatus` trim; it missed the retained-backup defect.
- GPT 6.1 Sol returned PASS, judging the release apply and backup paths correct; it found no
  blocking defect and did not reach the retained-backup containment issue.
- GLM 5.3 returned PASS_WITH_NOTES, judging the apply/backup contract internally consistent and
  the backups relocated via `preserveApplyBackups` before `dispose` (trusting the tests that
  assert a path under the temp root with no `kiki-candidate` segment); its notes were a dead
  `runRoot`/backup directory path, benign pre-write retention leaving stray directories, and the
  `applied` flag being set before retention handling. It missed the nested-`TMPDIR` defect.
- DeepSeek's catch is retained as extra evidence only. It located the defect at
  `src/cli/commands/release.ts:474-490` (line 482) and the recursive `candidate.dispose()` cleanup
  at `release.ts:680-682`, noting that tests always override `TMPDIR`
  (`tests/cli/release.test.ts:384`). It does not count toward the gate.
- Reports (first gate): `results/2026-11-13-gate/B1-mistral.md`,
  `results/2026-11-13-gate/B1-gpt-sol.md`, `results/2026-11-13-gate/B1-glm-5.3.md`, and extra
  evidence `results/2026-11-13-gate/B1-deepseek.md`. All reports are historical evidence only; the
  post-amendment rerun verdicts are recorded in the decision summary,
  `results/2026-11-13-gate-summary.md`.
- Never aggregate gate outcomes into a precision figure.

## Amendment 1

**Status: RERUN COMPLETED — ALSO ALL-FAIL; B1 DISCARDED.** This is amendment 1, made after the
all-fail gate above. All three actual reviewer models missed the defect because the original task
prompt was a broad one-liner that omitted the violated acceptance criterion: it did not state that
a retained recovery backup must survive candidate cleanup and remain available for manual recovery,
or that the reported backup path must point to a surviving directory. The prompt therefore did not
put the nested-`TMPDIR` containment requirement in scope.

- **Prompt change:** `cases/B1/input/task-prompt.md` now states the required apply/rollback
  behavior and the surviving-backup-path requirement, without naming the nested-`TMPDIR`
  scenario, the defect, the fix, or its files. The expected labels are unchanged (FAIL /
  implementation / blocking).
- **Rerun result:** the full three-model gate was rerun once on the amended prompt: Mistral Large
  PASS, GPT 6.1 Sol PASS, GLM 5.3 PASS_WITH_NOTES — all three still missed the defect. Per the
  all-fail branch, one authoring-flaw investigation and one full-gate rerun are allowed; with the
  rerun also all-fail, B1 is **discarded**, not demoted to smoke/edge and not a metric. The
  expected labels and frozen patch are unchanged, and the case files and all reports are kept as
  historical evidence only. B1 is not accepted and not counted. B2 and B3 were later discarded; C
  remains pending.
- **Rule applied:** the all-fail branch allows one concrete authoring-flaw investigation and one
  full-gate rerun before keeping, demoting or discarding. No mixed outcomes appeared in either
  run, so the case cannot be kept.
