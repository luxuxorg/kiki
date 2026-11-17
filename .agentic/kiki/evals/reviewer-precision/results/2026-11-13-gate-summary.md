# Gate summary — 2026-11-13 (B2 gate and B3 validity triage added 2026-11-14)

**Scope:** the B1 and B2 gates and the B3 validity triage, scored on the project's actual reviewer
models. No scores, percentages, model rankings or precision figures; gate outcomes are not
aggregated.

**Gate model set:** `mistral/mistral-large-latest` (Mistral Large), `gpt/gpt-6.1-sol`
(GPT 6.1 Sol) and `openrouter/z-ai/glm-5.3` (GLM 5.3). DeepSeek is the project's coding
workhorse and Kimi K3.1 Pro is an additional non-gate review; neither is a gate model, and both
runs are recorded as extra evidence only and do not count toward the gate decision.

| Case | Models run (actual reviewers) | At least one model failed the case? | Decision | Notes |
|---|---|---|---|---|
| B1 | `mistral/mistral-large-latest`; `gpt/gpt-6.1-sol`; `openrouter/z-ai/glm-5.3` | no | **DISCARDED — all-fail after one prompt amendment** | First gate all-fail: expected FAIL, but Mistral Large PASS_WITH_NOTES, GPT 6.1 Sol PASS and GLM 5.3 PASS_WITH_NOTES all missed. The task prompt was amended once (now states the surviving-backup requirement without naming nested `TMPDIR`); the full three-model rerun was also all-fail (Mistral Large PASS, GPT 6.1 Sol PASS, GLM 5.3 PASS_WITH_NOTES; all missed). Per the gate, all-fail after one amendment is discarded — not demoted to smoke/edge and not a metric. Case files and reports kept as historical evidence only; not accepted and not counted. DeepSeek caught it but is not a gate model; Kimi K3.1 Pro (extra evidence) also missed it. |
| B2 | `mistral/mistral-large-latest`; `gpt/gpt-6.1-sol`; `openrouter/z-ai/glm-5.3` | no | **DISCARDED — all-fail with genuine behavioral proof** | Expected FAIL / implementation / blocking, but Mistral Large PASS_WITH_NOTES, GPT 6.1 Sol PASS and GLM 5.3 PASS_WITH_NOTES all missed the copied `.bin` shim defect. Proof is genuine: the fix's test fails at base `ff6ea6d` with the candidate-local shim assertion and passes at `65a7148`. Per the all-fail branch, B2 is ambiguous/too hard and is discarded — not demoted to smoke/edge and not a metric. Case files kept as historical evidence only; not accepted and not counted. |
| B3 | `mistral/mistral-large-latest`; `gpt/gpt-6.1-sol`; `openrouter/z-ai/glm-5.3` | no (the sole FAIL was off-target) | **DISCARDED / INVALID — prompt lacked acceptance criterion; intended defect is a policy change** | Behavioral proof is genuine (8 fails at base `7463ed1`, 25/25 pass at `b870bc7`), but the task prompt only said "review the migration" and did not state that standard OpenCode config must be accepted without an exact-version gate. The exact `2.2.6` pin was intentional migration behavior; the later fix was a policy change, not a defect at the time. Mistral Large PASS_WITH_NOTES and GLM 5.3 PASS_WITH_NOTES judged the gate intentional and consistent with the prompt. GPT 6.1 Sol FAIL was an off-target data-root alias finding, not the intended version-gate defect, so it does not count as a catch. Not a metric, not accepted and not counted; case files kept as historical evidence only. |
| C | — | n/a | pending | Gate not run. |

## B1 details

Expected labels (`cases/B1/expected.md`): FAIL / implementation / blocking, with the retained
apply-backup containment evidence at or near `preserveApplyBackups` / `preservedBackupBase` in
`src/cli/commands/release.ts`.

First gate (original broad prompt):

| Model | Verdict | Matched expected | Case outcome |
|---|---|---|---|
| `mistral/mistral-large-latest` | PASS_WITH_NOTES | no | model fails the case (miss) |
| `gpt/gpt-6.1-sol` | PASS | no | model fails the case (miss) |
| `openrouter/z-ai/glm-5.3` | PASS_WITH_NOTES | no | model fails the case (miss) |

Extra evidence (not a gate model, not counted):

| Model | Verdict | Matched expected | Note |
|---|---|---|---|
| `deepseek/deepseek-flash` | FAIL / implementation / major | yes | coding workhorse; caught the defect at `src/cli/commands/release.ts:474-490` (line 482) and `release.ts:680-682`. Does not affect the gate decision. |
| `openrouter/moonshotai/kimi-k3.1-pro` | PASS | no | non-gate review; basis was that backups are relocated before `dispose` and paths are rewritten, with tests covering the failure modes; missed the nested-`TMPDIR` defect. Does not affect the gate decision. |

Post-amendment rerun (amended `cases/B1/input/task-prompt.md`, fresh session and worktree per model):

| Model | Verdict | Matched expected | Case outcome |
|---|---|---|---|
| `mistral/mistral-large-latest` | PASS | no | model fails the case (miss) |
| `gpt/gpt-6.1-sol` | PASS | no | model fails the case (miss) |
| `openrouter/z-ai/glm-5.3` | PASS_WITH_NOTES | no | model fails the case (miss) |

Decision rule applied: behavioral proof exists (the fix's test fails at `054407b`, passes at
`ff6ea6d`), but no model on the actual reviewer set matched the expected FAIL in either run. The
first all-fail was investigated once as a prompt-authoring flaw: the original one-liner omitted the
violated acceptance criterion, so `cases/B1/input/task-prompt.md` was amended to state the required
apply/rollback behavior and the surviving-backup-path requirement without naming the nested-`TMPDIR`
scenario. The mandatory full three-model rerun was also all-fail: Mistral Large PASS, GPT 6.1 Sol
PASS and GLM 5.3 PASS_WITH_NOTES, all missing the defect. Per the gate's no-model-catches branch,
after one concrete amendment and one full rerun the case is **DISCARDED** — not demoted to
smoke/edge and not a metric. The expected labels and frozen patch are unchanged; the case files and
all reports are kept as historical evidence only. B1 is not accepted and not counted. At the time
of this decision, B2, B3 and C remained pending; B2 and B3 were later discarded (see below), so
only C remains pending.

Reports (first gate):

- `results/2026-11-13-gate/B1-mistral.md`
- `results/2026-11-13-gate/B1-gpt-sol.md`
- `results/2026-11-13-gate/B1-glm-5.3.md`
- `results/2026-11-13-gate/B1-deepseek.md` (extra evidence only)
- `results/2026-11-13-gate/B1-kimi-k3.1-pro.md` (extra evidence only)

All reports are historical evidence only and condensed from the dispatch record, not full verbatim
reviewer text; each states that explicitly. The post-amendment rerun verdicts are recorded in this
summary.

## B2 details

Expected labels (`cases/B2/expected.md`): FAIL / implementation / blocking, with evidence at the
copied-shim handling in `src/cli/release-candidate.ts`; B1's already-fixed backup defect does not
match.

Behavioral proof (`.superpowers/sdd/reviewer-eval-proof-B2.md`): genuine fail-at-base /
pass-at-fix. The fix's test diff overlaid on `ff6ea6d` fails at
`tests/integration/release-copied-deps.test.ts:300` because the copied shim still targets the outer
candidate entrypoint (`…/kiki-candidate-outer/node_modules/fake-pkg/cli.mjs`); a clean `65a7148`
tree passes the same test. The base failure is the real candidate-local shim assertion, not a
dependency or setup error. No source or test changes and no commits were made to the main checkout.

Gate (actual reviewer set, 2026-11-14):

| Model | Verdict | Matched expected | Case outcome |
|---|---|---|---|
| `mistral/mistral-large-latest` | PASS_WITH_NOTES | no | model fails the case (miss) |
| `gpt/gpt-6.1-sol` | PASS | no | model fails the case (miss) |
| `openrouter/z-ai/glm-5.3` | PASS_WITH_NOTES | no | model fails the case (miss) |

Decision rule applied: behavioral proof is genuine, but every actual reviewer missed the copied
`.bin` shim defect, so there are no mixed outcomes. Per the gate's all-fail branch, B2 is treated as
ambiguous/too hard and is **DISCARDED** — not demoted to smoke/edge and not a metric. The expected
labels and frozen patch are unchanged; the case files are kept as historical evidence only. B2 is
not accepted and not counted.

Reports: the B2 verdicts are recorded here from the dispatch record; no separate verbatim B2 gate
reports were retained under `results/2026-11-13-gate/`.

## B3 details

Expected labels (`cases/B3/expected.md`): FAIL / implementation / blocking, with evidence at the
version gate in `src/cli/commands/doctor.ts` and the marker rejection in `src/cli/oc2-paths.ts`.

Behavioral proof: genuine. The fix's test diff overlaid on base `7463ed1` produced 8 failing tests;
the same suite at `b870bc7` passed 25/25. The base failures were the intended version-gate and
standard-config assertions, not setup or dependency errors.

Gate (actual reviewer set):

| Model | Verdict | Matched expected | Case outcome |
|---|---|---|---|
| `mistral/mistral-large-latest` | PASS_WITH_NOTES | no | miss; judged the exact-version gate intentional and consistent with the prompt |
| `gpt/gpt-6.1-sol` | FAIL | no | off-target data-root alias finding, not the intended version-gate defect; does not count as a catch |
| `openrouter/z-ai/glm-5.3` | PASS_WITH_NOTES | no | miss; judged the exact-version gate intentional and consistent with the prompt |

Decision rule applied: **DISCARDED / INVALID — not a valid defect case.** Behavioral proof is
genuine, but the task prompt only says "review the migration" and never states that standard
OpenCode config must be accepted without an exact-version gate. The exact `2.2.6` pin was
intentional migration behavior; the later `b870bc7` change was a policy change, not a defect at the
time. Mistral Large (PASS_WITH_NOTES) and GLM 5.3 (PASS_WITH_NOTES) both judged the gate intentional and consistent with the prompt;
GPT 6.1 Sol's FAIL was an off-target data-root alias finding, so it is not a catch of the intended
defect. Because no reviewer matched the intended defect on a prompt that stated the acceptance
criterion, the case is discarded as invalid rather than treated as all-fail. It is not demoted to
smoke/edge and not a metric. The expected labels and frozen patch are unchanged; the case files are
kept as historical evidence only. B3 is not accepted and not counted.

Reports: the B3 verdicts are recorded here from the dispatch record; no separate verbatim B3 gate
reports were retained under `results/2026-11-13-gate/`.

## Current status

B1, B2 and B3 are DISCARDED. B1 and B2 were all-fail after the gate; B3 is invalid because its
prompt lacked the acceptance criterion and its intended defect was a policy change. C remains
pending. There are no accepted metric cases; the set is a hand-run canary and its gate outcomes are
never aggregated into a precision, recall, ranking or reliability figure.
