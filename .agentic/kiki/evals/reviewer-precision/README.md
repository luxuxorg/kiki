# Reviewer-Precision Eval (real-provenance canary)

**Status: AUTHORED — B1, B2 and B3 are DISCARDED; C still awaits the gate. No accepted metric
cases remain.** B1's first gate was all-fail (Mistral Large PASS_WITH_NOTES, GPT 6.1 Sol PASS,
GLM 5.3 PASS_WITH_NOTES) because the original broad task prompt omitted the violated acceptance
criterion. The prompt was amended once — it now states the surviving-backup requirement without
naming the nested-`TMPDIR` scenario — and the full three-model gate was rerun: Mistral Large PASS,
GPT 6.1 Sol PASS and GLM 5.3 PASS_WITH_NOTES, all missing the defect. B2's behavioral proof is
genuine (the fix's test fails at base `ff6ea6d`, passes at `65a7148`), but its three-model gate was
also all-fail: Mistral Large PASS_WITH_NOTES, GPT 6.1 Sol PASS and GLM 5.3 PASS_WITH_NOTES, all
missing the copied `.bin` shim defect. Per the all-fail rule, B1 and B2 are discarded, not demoted
to smoke/edge and not metrics. B3's behavioral proof is also genuine (8 fails at base `7463ed1`,
25/25 pass at `b870bc7`), but the case is invalid: the task prompt only said "review the migration"
and never stated that standard OpenCode config must be accepted without an exact-version gate. The
exact `2.2.6` pin was intentional migration behavior; the later fix was a policy change, not a
defect at the time. Mistral Large PASS_WITH_NOTES and GLM 5.3 PASS_WITH_NOTES judged the gate intentional and
consistent with the prompt; GPT 6.1 Sol FAIL was an off-target data-root alias finding, not the
intended defect, so it does not count as a catch. B3 is therefore DISCARDED as invalid, not
demoted to smoke/edge and not a metric. All three case files and gate records are kept as
historical evidence only; none is accepted or counted. C still awaits the gate on the actual
reviewer set (three models now; the rule requires at least two). The set is a hand-run canary, not
a precision, recall, ranking or reliability measurement.

This is a small, hand-run regression canary for the reviewer contract: given a real change and a
neutral task prompt, does the reviewer produce the verdict, reason, severity band and evidence
the approved loop-controls spec requires? Ground truth comes only from real shipped defects and
their real fixes. Synthetic cases are smoke only.

Approved design: `docs/superpowers/specs/2026-11-13-reviewer-precision-eval-design.md`.
Implementation plan: `docs/superpowers/plans/2026-11-13-reviewer-precision-eval-plan.md`.

## What this is not

- Not an eval framework or runner package, and not a script.
- Not an LLM judge. Scoring is one human reading one report against one expected file.
- Not a benchmark, model ranking, precision figure, or blocking gate.
- Not a scheduled job. Runs are event-driven only.

## Layout

```
.agentic/kiki/evals/reviewer-precision/
  README.md                     # this runbook
  cases/<id>/
    input/                      # everything the reviewer may see
      task-prompt.md            # neutral task statement
      case.patch                # frozen change under review, path-restricted to src+tests
      base-sha                  # one line: the fix's parent
    expected.md                 # private: verdict, reason, severity band, evidence region
    provenance.md              # private: one-sentence defect + SHAs + behavioral proof
  smoke/                        # non-metric smoke/edge cases; never scored or gated
  results/                      # dated reports, scores and gate records
```

`expected.md` and `provenance.md` never enter a reviewer dispatch. The payload is `input/`
only, in a fresh session.

## Cases

| ID | Change under review | Base | Fix | Expected | Status |
|---|---|---|---|---|---|
| B1 | introducer `054407b`, retained apply backups under nested TMPDIR | `054407b` | `ff6ea6d` | FAIL / implementation / blocking | DISCARDED — all-fail after one prompt amendment (first gate: Mistral Large PASS_WITH_NOTES, GPT 6.1 Sol PASS, GLM 5.3 PASS_WITH_NOTES; post-amendment rerun: Mistral Large PASS, GPT 6.1 Sol PASS, GLM 5.3 PASS_WITH_NOTES; all missed). Case files and reports kept as historical evidence only; not smoke/edge, not a metric, not accepted or counted |
| B2 | introducer `054407b`, copied `.bin` shims in nested candidates | `ff6ea6d` | `65a7148` | FAIL / implementation / blocking | DISCARDED — all-fail on the actual reviewer set (Mistral Large PASS_WITH_NOTES, GPT 6.1 Sol PASS, GLM 5.3 PASS_WITH_NOTES; all missed the copied `.bin` shim defect). Behavioral proof is genuine (test fails at base `ff6ea6d`, passes at `65a7148`). Case files and gate record kept as historical evidence only; not smoke/edge, not a metric, not accepted or counted |
| B3 | introducer `7463ed1`, exact-2.2.6 gate and standard-config rejection | `7463ed1` | `b870bc7` | FAIL / implementation / blocking | DISCARDED / INVALID — behavioral proof genuine (8 fails at base `7463ed1`, 25/25 pass at `b870bc7`), but the task prompt only said "review the migration" and did not state that standard OpenCode config must be accepted without an exact-version gate. The exact `2.2.6` pin was intentional migration behavior; the fix was a policy change, not a defect at the time. Gate: Mistral Large PASS_WITH_NOTES and GLM 5.3 PASS_WITH_NOTES judged the gate intentional and consistent with the prompt; GPT 6.1 Sol FAIL was an off-target data-root alias finding, not the intended defect, so it does not count as a catch. Not accepted or counted; case files kept as historical evidence only |
| C | control change `64f0ec7`, loop controls + generated prompts | `00b9f2a` | — | PASS or PASS_WITH_NOTES; any blocking FAIL is a false positive | proof + gate pending |

Base SHAs are the fix's parent (`fix^`), verified with `git rev-parse`. For B1 and B3 the
introducer is HEAD at the base; for B2 it is HEAD~1. B2's base already contains B1's fix, so
citing B1's backup defect there is a deliberate distractor and does not match.

## Replay runbook

Run from a checkout of this repository. No script.

```bash
REPO=$(git rev-parse --show-toplevel)
```

1. Create the disposable review tree at the case base:

   ```bash
   git -C "$REPO" worktree add --detach /tmp/opencode/rp-eval/<id> \
     "$(cat "$REPO"/.agentic/kiki/evals/reviewer-precision/cases/<id>/input/base-sha)"
   ```

2. Apply nothing for B1–B3. The change under review is the frozen `case.patch` in the payload
   and already exists in the tree as HEAD (B1, B3) or HEAD~1 (B2). For C, apply the frozen
   patch uncommitted and verify the diff:

   ```bash
   git -C /tmp/opencode/rp-eval/C apply --check \
     "$REPO"/.agentic/kiki/evals/reviewer-precision/cases/C/input/case.patch
   git -C /tmp/opencode/rp-eval/C apply \
     "$REPO"/.agentic/kiki/evals/reviewer-precision/cases/C/input/case.patch
   ```

3. Dispatch `kiki-reviewer` in a fresh session whose working directory is the worktree. The
   payload is `input/task-prompt.md` plus `input/case.patch` as the attached change. Never
   mention eval, probe, expectations, fix identifiers or this directory.

4. Save the report verbatim as `results/<date>-<id>-run<k>.md`, with the reviewer model ID and
   prompt version in the header.

5. Read the report against `cases/<id>/expected.md` and write a one-line score into
   `results/<date>-summary.md` (see `results/TEMPLATE-run.md`).

6. Remove only the disposable worktree:

   ```bash
   git -C "$REPO" worktree remove --force /tmp/opencode/rp-eval/<id>
   ```

Construction asymmetry, disclosed: defect cases review a change already committed in the
worktree (clean `git diff`); the control reviews an uncommitted applied patch. The task prompt
must name the attached change explicitly.

## Scoring (by hand)

Only four fields are scored. Exact critical-vs-major severity is judgment and is not scored;
the blocking-vs-note band is what carries the routing consequence.

| Metric | Defect cases B1–B3 | Control C |
|---|---|---|
| Verdict | exact match; expected FAIL | PASS or PASS_WITH_NOTES acceptable; FAIL is a false positive |
| Reason | exact category `implementation` | n/a on a pass; any FAIL is a false positive |
| Severity band | blocking vs non-blocking only (critical/major both blocking; minor is a note) | any critical/major finding is a false positive |
| Evidence | complete (scenario + rule/requirement + file/line) and at or near the fix-touched lines | n/a |

Evidence anchors:

- **B1:** `preserveApplyBackups` / `preservedBackupBase` in `src/cli/commands/release.ts`.
- **B2:** shim handling in `src/cli/release-candidate.ts`; not B1's already-fixed backup defect.
- **B3:** version gate in `src/cli/commands/doctor.ts` and marker rejection in
  `src/cli/oc2-paths.ts`.

A reviewer's FAIL string alone is not a match. A case is failed when the report does not match
`expected.md` (wrong verdict, wrong reason, wrong band, or missing/incorrect evidence region).

## Validation gate (mandatory before a case counts)

A case file is a proposal until the gate accepts it. The gate runs once per case at authoring
time, and for each case added later by the growth rule.

- **Runs:** once per case on each of at least two different reviewer models, fresh session and
  worktree each time, input-only payload. Record the full model ID and prompt version. The actual
  reviewer set is now three models: Mistral Large, GPT 6.1 Sol and GLM 5.3.
- **Keep rule:** keep a defect only with behavioral proof (the fix's test fails at the base,
  passes with the fix) and mixed outcomes — at least one actual reviewer catches the defect
  (matches `expected.md`) and at least one misses it. "Catches the defect" means matching
  `expected.md`, not merely emitting FAIL.
- **All models catch a defect:** not discriminating; drop it or demote it to smoke. Smoke is
  non-metric.
- **No model catches a defect (all-fail):** ambiguous/too hard; investigate a concrete authoring
  flaw once, rerun the full gate, otherwise demote to smoke/edge or discard. Keep the original
  reports either way.
- **Control C:** all three models returning PASS or PASS_WITH_NOTES (no blocking FAIL) is the
  healthy expected outcome and does not drop it. No model matching at all is investigated for a
  real defect in `64f0ec7` or a misleading prompt.
- **One model available:** pending, never accepted.
- **Records:** verbatim reports under `results/<date>-gate/<case>-<model-slug>.md`, with model
  ID, prompt version, verdict, whether it matched `expected.md`, and the evidence pointer.
  Per-case keep/drop/pending decisions go in `results/<date>-gate-summary.md`.
- **No aggregation:** gate outcomes are never combined into a score, percentage, ranking or
  precision figure.

Steady state: three runs per case, majority (2/3) per metric, when the reviewer prompt or model
changes; one smoke run when only checking that nothing broke. This detects large regressions
only; it is never cited as a precision or reliability figure.

## Growth rule

When a defect slips past review and later gets a fix commit whose test is behavioral, freeze its
introducing diff as a case at fix time: use `git log -S` to find the introducer, path-restrict to
`src`+tests, write a neutral task prompt, state the defect in one sentence, record the proof
that the fix's test fails at the base and passes with the fix, write the expected labels, then
run it through the gate (at least two models, at least one failing the case). A case should cost
about fifteen minutes plus gate runs; if it takes longer, the change is too entangled — skip it
or keep it paste-only. No registry fields, no dashboard, no scorekeeping beyond dated result
files, no automatic runs. The set grows only from real slips; nothing is synthesized to fill
coverage gaps.

## Limitations

- **Canary, not a measurement.** Three authored defect cases (all now discarded) plus one control
  cannot produce a precision number and are never presented as one.
- **Shared-refs leak.** A worktree shares refs with the main repository, so `git log --all`
  could in principle reveal later commits, including a case's own fix. The reviewer's normal
  habit (`git diff` / `git log` on HEAD) shows only ancestors of the base. If the leak ever
  bites, that case falls back to paste-only.
- **Asymmetrical replay.** Defect cases review a committed change; the control reviews an
  applied uncommitted patch. Task prompts name the attached change to compensate.
- **Correlated cases.** B1 and B2 share one introducing commit and all three defect cases sit in the
  release/CLI domain. With B1, B2 and B3 discarded, no defect case remains and only the C control is
  pending, so the set is thin and currently has no accepted metric case.
- **Missing reason categories.** All real cases are Reason `implementation`; `plan`, `spec`,
  `user-decision` and `environment/permission` have no real cases yet.
- **Weak control ground truth.** Suite green plus no known defect is absence of evidence, not
  behavioral proof. An all-fail control triggers investigation, and a false-positive verdict on
  it might in principle be right.
- **Gate selection bias.** Cases are kept because a current model misses them. When models
  change, previously clean cases may flip; that is the canary working, not a set defect.
- **Routing incident excluded.** The 2026-11-09 provider/protocol failure is an
  orchestrator-routing case, not a diff review. It is a candidate for a future routing eval and
  is deliberately outside this set.
- **Smoke is not a metric.** `smoke/` cases test replay/report shape only; they are never
  scored, gated, counted or cited as coverage.
- **Result validity is per configuration.** Results name the model and prompt version they were
  produced on; they say nothing about other configurations.
- **Expected labels age.** They reference the approved loop-controls verdict rules; if that
  spec changes, revisit the expected files once as a batch.
- **Commit-era context.** Prompts were written today for yesterday's tasks; keep them minimal.

## Results conventions and templates

- `results/<date>-<id>-run<k>.md` — one verbatim reviewer report; header: model ID, prompt
  version, case, base SHA, date.
- `results/<date>-summary.md` — one-line scores per run against `expected.md`.
- `results/<date>-gate/<case>-<model-slug>.md` — one gate report per case per model.
- `results/<date>-gate-summary.md` — per-case keep/drop/pending decisions, no scores or
  rankings.
- `results/TEMPLATE-run.md` and `results/2026-11-13-gate/TEMPLATE-report.md` are unfilled
  templates, not evidence or results.
