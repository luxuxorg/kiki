# Reviewer-Precision Eval (Real-Provenance Cases) — Design

- **Date:** 2026-11-13
- **Status:** APPROVED 2026-11-13 by user after strengthening the cases to behavioral proof and adding a two-model validation gate. Decisions carried in this draft:
  - Cases are anchored at the **parent of the fix commit** (`base = fix^`, every SHA verified with `git rev-parse`): the defect's last live state, exactly the tree on which the fix's behavioral test fails (§3, §5).
  - Every defect case must carry a **behavioral proof**: the fix commit's named test fails at the base and passes with the fix, recorded in `provenance.md` (§4, §5).
  - A **mandatory validation gate** runs each case once on at least two different reviewer models before the set counts: a case is kept only if at least one model fails it; all-pass = too easy, all-fail = ambiguous, neither is accepted. Model IDs, runs, verdicts and evidence are recorded. The gate validates the set and supports no precision claims (§6).
  - `1decc15` and `afa31c5` stay **smoke/edge only, explicitly not metrics**; the docs-only `3e3749d` is **dropped**, superseded by a real code+prompt control (§5).
  - Unchanged from the earlier draft: scratch-worktree replay as the run method; home at `.agentic/kiki/evals/reviewer-precision/`, referenced from the README's Development section only; neutral task prompts; expected/provenance files never reach the reviewer; three runs per case on a reviewer prompt or model change, one smoke run otherwise; hand scoring, no LLM judge; the 2026-11-09 routing incident stays out of this set. Nothing is implemented yet.
- **Scope:** the design of a lightweight reviewer-precision eval only. No source code, no scripts, no framework. When implemented, the artifacts are case files and a runbook at the home in §4, plus one reference line in the README's Development section.
- **Inputs:** the approved loop-controls design (`docs/superpowers/specs/2026-11-13-loop-controls-design.md` — verdicts PASS / PASS_WITH_NOTES / FAIL plus Reason / Severity / Evidence); `docs/research/2026-11-12-critical-review-kiki-improvement-research.md` and the evidence-base doc (form-vs-validity critique, small-repeats-are-smoke critique, SWR-Bench false-positive root causes: misunderstood context and missing domain knowledge); fix commits `ff6ea6d`, `65a7148`, `b870bc7` with their behavioral tests; control commit `64f0ec7`; the demoted `1decc15`, `afa31c5` and the dropped `3e3749d`; incident `.agentic/reviews/2026-11-09-kiki-implementer-protocol-failure.md`; the disposable probe at `/tmp/opencode/kiki-loop-probe/`.

## 1. Intent and why

The loop-controls spec makes the reviewer's report carry routing decisions (verdict + Reason + Severity + Evidence). Nothing currently checks that a reviewer config actually produces the right report on a real defect. The research review recommends exactly this: a small known-defect / known-non-issue set, with ground truth from real incidents and confirmed root causes — not form-only labels. SWR-Bench's finding that reviewer false positives trace mainly to misunderstood context and missing domain knowledge argues for running cases *in context*, not as bare pasted diffs.

The user has no pre-existing golden set. Ground truth comes from real provenance only: a defect that really shipped and was really fixed. The initial draft's cases failed exactly the form-vs-validity test the research review warns about — `afa31c5`'s "test" asserted that a template *contains* a function name (form, not behavior) and `1decc15` shipped no test at all — so nothing proved those defects were real. This revision rebuilds the set from fixes whose tests pin behavior, makes that proof a hard requirement, and adds a validation gate that each case must pass before the set counts. The synthetic probe cases stay as smoke tests (does a structured report come out at all), never as metrics.

## 2. Goals / non-goals / anti-goals

- **Goal:** detect large regressions in reviewer behavior when the reviewer prompt or model changes — a canary, not a precision measurement.
- **Goal:** a set whose cases are individually validated to discriminate — each has caught at least one real reviewer model missing (or, for the control, has survived it) — before it counts.
- **Non-goals:** measuring numeric precision/recall; testing the orchestrator or routing; certifying anything.
- **Anti-goals (failure even if it technically works):** an eval framework or runner package; an LLM judge; a synthetic-only golden set presented as metrics; a benchmark or model ranking — the validation gate's outputs included; any automatic gate that blocks work; scheduled runs; registry schema changes.

## 3. Approach chosen

**Fix-anchored scratch-worktree replay.** Each case pins a base SHA — the parent of the fix commit, verified with `git rev-parse <fix>^` — plus a frozen diff as the change under review. Run: `git worktree add --detach /tmp/opencode/rp-eval/<id> <base>`, dispatch the reviewer with its normal task prompt and the change under review, capture the report, remove the worktree. The base is the defect's last live state: exactly the tree on which the fix's behavioral test fails, so ground truth is checkable in place, and the fix commit itself — message included — never exists in the worktree's history. For defect cases the change under review is the introducing commit's diff, path-restricted to `src` + tests; for B1 and B3 the introducer *is* the base's HEAD, for B2 its HEAD~1, so the change is already in the tree and nothing needs applying — the frozen `case.patch` in the dispatch payload keeps the reviewed diff deterministic. The control is the exception: its change (`64f0ec7`) postdates its base, so its patch is applied uncommitted, as in the earlier draft.

Two alternatives were considered and set aside. Introducer-anchored replay — worktree at the introducer's parent with the introducing diff applied uncommitted, the earlier draft's mechanics — re-injects the change as a patch that can drift and, when one commit bundles several defects (B1 and B2 both come from `054407b`), forces those cases onto identical inputs, erasing their distinct trees; anchoring at the fix instead keeps B2 in a tree where B1's defect is already fixed — an in-tree trap for reviewers that pattern-match instead of checking. Paste-only frozen cases (the probe's mode) remain smoke-only: the reviewer never exercises its real habits, and stripped context biases toward exactly the false-positive modes SWR-Bench documents. A tiny runner script with auto-scoring still sits at the top of the eval-framework slope; the runbook is two commands, and scoring is one human reading one report against one expected file. Verified feasible with `git log -S`; exact SHAs in §5.

## 4. Case format

```
.agentic/kiki/evals/reviewer-precision/
  README.md                     # runbook + growth rule
  cases/<id>/
    input/                      # everything the reviewer may see
      task-prompt.md            # neutral task statement (the "spec")
      case.patch                # frozen diff under review, path-restricted
      base-sha                  # one line: the fix's parent
    expected.md                 # verdict, reason, severity band, evidence region
    provenance.md               # one-sentence defect statement + fix SHA
                                #   + the recorded behavioral proof (see rules)
  smoke/                        # absorbed from /tmp/opencode/kiki-loop-probe
                                #   + the demoted 1decc15 / afa31c5 cases
  results/<date>-...            # verbatim reports + one-line scores + gate records
```

Positioning: this directory is a development / continuous-improvement artifact, tracked like the rest of the `.agentic/` operational material (`reviews/`, `TASK_REGISTRY.json`). The only pointer from the published docs is a single line in the README's Development section; nothing about the eval appears in user-facing install or usage documentation.

Rules:
- `expected.md` and `provenance.md` never enter any reviewer dispatch. The dispatch payload is `input/` only, in a fresh session.
- `task-prompt.md` is written neutrally at case-creation time — "load the health config and merge it with the defaults", never "make sure values are validated" — and it **names the change under review explicitly** (the attached diff), because a defect case's worktree has a clean `git diff`. Reviewed once for hints before the case is accepted.
- **The change under review:** a defect case's diff is the *introducing* commit's diff, path-restricted to `src` plus its tests; `dist/` (build output), `.agentic/` state and doc churn are dropped. It is not applied — it already exists in the base's history (HEAD for B1 and B3, HEAD~1 for B2) — and it travels in the payload as the frozen `case.patch`. The control's change under review is `64f0ec7`'s `src`+tests diff (the code and the generated agent prompts both live in `src/cli/config.ts`), applied uncommitted on its base. No history is rewritten, rebased or committed anywhere.
- **One-sentence provenance plus behavioral proof.** A case is accepted for the gate only if the defect can be stated in **one sentence** in `provenance.md`, and the fix commit's **behavioral test** is recorded as proof: applied at the base, the named test fails; with the fix, it passes. A fix whose test is form-only — asserting that source contains strings, as `afa31c5`'s did — or absent, as `1decc15`'s was, proves nothing and disqualifies the case. That is the defect of the rejected initial set, stated as a rule.
- Residual leak, accepted and disclosed: a worktree shares refs with the main repo, so `git log --all` could in principle reveal later commits — including each case's own fix. The reviewer's habit is `git diff` / `git log` on HEAD, which shows only ancestors of the base. For B2, HEAD *is* B1's fix message — a deliberate distractor, since it names a defect B2's tree no longer contains. If the leak ever bites, that case falls back to paste-only.

## 5. The initial set

| ID | Defect (one sentence) | Introduced by | Base (= fix^) | Fix | Behavioral proof (in the fix) | Expected |
|---|---|---|---|---|---|---|
| B1 | Nested-candidate TMPDIR redirection makes `preserveApplyBackups` relocate retained apply backups into the outer candidate run root, where `dispose()` deletes them | `054407b` | `054407b` | `ff6ea6d` | `tests/cli/release.test.ts` | FAIL, `implementation`, blocking |
| B2 | Candidate creation byte-copies outer Kiki `.bin` shims verbatim, so a nested candidate's `.bin` entries delegate to the outer candidate's entrypoint and break inner isolation | `054407b` | `ff6ea6d` | `65a7148` | `tests/integration/release-copied-deps.test.ts` | FAIL, `implementation`, blocking |
| B3 | oc2 paths enforce an exact-2.2.6 version gate in doctor and reject standard OpenCode config files (`opencode.json(c)` / `tui.json(c)`) as OC1 markers | `7463ed1` | `7463ed1` | `b870bc7` | `tests/cli/doctor.test.ts` + `tests/cli/oc2-paths.test.ts` | FAIL, `implementation`, blocking |
| C (control) | None — loop-controls code and generated-prompt change; full suite green, no known defect | — | `00b9f2a` | — (change under review is `64f0ec7`) | suite green; no later fix touches its files | PASS or PASS_WITH_NOTES; any blocking FAIL is a false positive |

Base SHAs, verified with `git rev-parse <fix>^` at revision time: `ff6ea6d^` → `054407b`; `65a7148^` → `ff6ea6d`; `b870bc7^` → `7463ed1`; `64f0ec7^` → `00b9f2a`.

Provenance, verified against git history (`git log -S`, `git show`, `git rev-list`) at revision time:

- **B1:** `054407b` ("feat: retire model slots, add doctor skill checks, source lint and safe release automation"; 81 files, 31 under src+tests) introduced the release automation carrying the defective relocation in `src/cli/commands/release.ts`. `ff6ea6d` fixed it — `preservedBackupBase` now walks above any `kiki-candidate-` ancestry with realpath containment verification — and its test in `tests/cli/release.test.ts` is behavioral: it drives a failing apply inside a nested candidate and asserts via `realpathSync` that the retained backup lands **outside** the candidate run root. That test fails at `054407b` and passes at `ff6ea6d`. At the base, the introducer is HEAD, so the change under review is the latest commit.
- **B2:** the same `054407b` introduced the byte-copying of `node_modules/.bin` shims in `src/cli/release-candidate.ts`. `65a7148` fixed it — Kiki-shaped shims are detected and regenerated against the candidate-local entrypoint with containment checks, failing closed on unsafe targets — and its test in `tests/integration/release-copied-deps.test.ts` is behavioral: it builds a candidate carrying a pre-shimmed `fake-cli` that points at an outer candidate root and asserts the shim was regenerated to the candidate-local entrypoint. That test fails at `ff6ea6d` and passes at `65a7148`. The base `ff6ea6d` is B1's fix: at that tree B1's defect is fixed while B2's is live — an in-tree discrimination trap (a reviewer pattern-matching on "release automation is buggy" and citing the already-fixed backup defect fails this case), and HEAD's commit message names B1's fix, a deliberate distractor. The change under review is `054407b`'s diff, i.e. HEAD~1 at this base.
- **B3:** `7463ed1` ("feat!: release v3.0.0 for OpenCode 2"; 172 files, 62 under src+tests — this is the isolation stress test) introduced both the exact-2.2.6 check in `src/cli/commands/doctor.ts` and the OC1-marker rejection of standard config files in `src/cli/oc2-paths.ts`. `b870bc7` — whose direct parent is `7463ed1` — dropped the gate and accepted standard config; its tests in `tests/cli/doctor.test.ts` and `tests/cli/oc2-paths.test.ts` are behavioral: they run doctor and the path guards against real config trees and assert no version gating, standard OpenCode roots accepted as the normal setup, and V1 artifacts failing closed. Those tests fail at `7463ed1` and pass at `b870bc7`. At the base, the introducer is HEAD.
- **C:** `64f0ec7` ("feat: add bounded loop controls and reviewer governance") is the change under review — `src/cli/config.ts` (the code and every generated agent prompt it carries) plus `tests/cli/loop-controls.test.ts`, `tests/cli/install.test.ts`, `tests/cli/oc2-permissions.test.ts` — applied uncommitted on `00b9f2a` (a TASK_REGISTRY-only chore). Ground truth: full suite green at `64f0ec7`, and no later commit touching its files (verified: the three commits after it are registry/probe chores). A control's ground truth is absence of evidence, not behavioral proof — weaker than B1–B3's, and the gate treats it accordingly (§6).
- **Dropped: `3e3749d`** (docs-only, three research documents). The earlier draft used it as the control; the user demoted it. It is dropped rather than demoted because `64f0ec7` supersedes it as a control — a real code+prompt change with a green suite — and a second, docs-only control adds a run without adding false-positive signal.
- **Smoke/edge cases — explicitly not metrics, not gated, not scored:** the probe's case-a (minor-only → PASS_WITH_NOTES) and case-b (wrong arithmetic + out-of-scope cache → FAIL) check only that a structured report with one verdict and the three fields comes out. `1decc15` (plugin hook registration) and `afa31c5` (health config validation) join them as replay-machinery smoke cases *and* as documented examples of insufficient proof: `1decc15`'s fix ships no test; `afa31c5`'s fix ships a form-only test (string containment on the template). Their old provenance is kept for the record — `0c13814` introduced the defective registration into the plugin template (with `82bb29d` later mirroring it in the live plugin outside the src+tests restriction), `10912e6` introduced the unvalidated `Object.assign` merge; `1decc15` and `afa31c5` fixed them — but none of it counts as ground truth for metrics.
- The 2026-11-09 incident is a **routing** case (provider/protocol failure, environment-class), not a diff review. It is noted in the README as a candidate for a future routing eval and deliberately kept out of this set.
- Known coverage gaps, stated honestly: all real cases are Reason `implementation` — `plan`, `spec`, `user-decision` and `environment/permission` have no real cases yet; all three defects sit in the release/CLI domain; and B1 and B2 share one introducing commit, so the set is thinner than three defects look. The growth rule may add diversity; nothing will be synthesized to fill a gap.

## 6. How to run — and the validation gate

Runbook in the README, no script:

1. `git worktree add --detach /tmp/opencode/rp-eval/<id> $(cat cases/<id>/input/base-sha)` — for every case.
2. Defect cases (B1–B3): apply nothing — the change under review is the frozen `case.patch` in the payload, already present in the worktree as HEAD (B1, B3) or HEAD~1 (B2). Control (C): `git -C /tmp/opencode/rp-eval/C apply <repo>/.agentic/kiki/evals/reviewer-precision/cases/C/input/case.patch` (uncommitted).
3. Dispatch `kiki-reviewer` in a fresh session whose working directory is the worktree, with `task-prompt.md` plus `case.patch` as the change under review as the payload. Never mention eval, probe or expectations.
4. Save the report verbatim to `results/<date>-<id>-run<k>.md`; record the reviewer model and prompt version in the results header.
5. The user reads the report against `expected.md` and writes a one-line score into `results/<date>-summary.md`.
6. `git worktree remove --force /tmp/opencode/rp-eval/<id>`

### The validation gate — mandatory, before the set counts

A case file is a proposal until the gate accepts it. The gate runs **once per case, at authoring time** — for this initial set, and for every case the growth rule adds later — and never on routine reviewer config changes (the steady-state runs below cover those; re-gating on every config change would turn the gate into a benchmark, an anti-goal).

- **Runs:** each case is run **once on each of at least two different reviewer models**, using the runbook above. Model IDs are recorded in every result file. If only one reviewer model is available, the set does not count until a second model has run.
- **Keep rule:** a case is kept only if **at least one model fails the case** — its report does not match `expected.md`; for B1–B3, it misses the defect — **while the fix commit's behavioral test proves the defect** (the proof recorded in `provenance.md` at authoring, §4). The proof is what makes a model's miss a genuine miss rather than an authoring artifact.
- **All models pass the case = too easy:** the case currently discriminates nothing; it is dropped from the set (it may be kept as a smoke case — smoke is explicitly non-metrics).
- **All models fail the case = ambiguous, not accepted:** a misleading task prompt or a defect invisible in the path-restricted diff cannot be told apart from uniformly weak reviewers. The author investigates; a concrete flaw may be amended once and the gate re-run; otherwise the case is discarded. Either way the runs and the verdict are kept.
- **The control in the gate** (design call, flagged for approval): C runs on the same models like every other case, but all-pass is its healthy expected outcome and does **not** drop it — a control no current model false-positives still guards against future over-flagging, and demanding a current false positive would mean demanding a broken reviewer. An all-fail control is investigated exactly like an all-fail defect case: either `64f0ec7` contains a real defect the suite does not catch (then it is not a control and the premise of this case is wrong), or the case's prompt misleads.
- **Records:** each gate run is saved verbatim under `results/<date>-gate/` with the model ID, the verdict, whether the run matched `expected.md`, and the evidence pointer; a `results/<date>-gate-summary.md` lists per-case keep/drop decisions.
- **No precision claims:** the gate accepts or rejects cases, nothing more. Its outcomes are never aggregated into a score, a ranking, a percentage, or any precision figure, and never cited as one.

**Runs per case (steady state):** three per case, majority (2/3) per metric, when the reviewer prompt or model changes; one smoke run when just checking that nothing broke. Honest framing per the research review: this detects large regressions only; it is never cited as a precision or reliability figure.

**Cadence:** event-driven only (reviewer prompt change, model change). No schedule.

**Determinism:** pinned base + frozen diff + frozen task prompt = identical input every run; only the reviewer varies. The defect-case diff is doubly frozen — payload file and git-reachable commit in the worktree.

## 7. Metrics (scored by hand, no LLM judge)

| Metric | Defect cases (B1–B3) | Control (C) |
|---|---|---|
| Verdict | exact match; expected FAIL | PASS or PASS_WITH_NOTES both acceptable; a FAIL is a false positive |
| Reason | exact category (`implementation` for all three) | n/a on a pass; any FAIL is a false positive regardless of reason |
| Severity band | **blocking vs non-blocking** only (critical/major both count as blocking; minor downgrades to a note per the approved spec) — exact critical-vs-major is judgment and is not scored | any critical/major finding is a false positive |
| Evidence | complete per the spec (scenario + violated rule/requirement + file/line) **and** points at or near the lines the fix commit touched — B1: `preserveApplyBackups`/`preservedBackupBase` in `src/cli/commands/release.ts`; B2: the shim handling in `src/cli/release-candidate.ts`; B3: the version gate in `src/cli/commands/doctor.ts` and the marker rejection in `src/cli/oc2-paths.ts` | n/a |

The severity *band* (not exact severity) is what carries the routing consequence — the spec's downgrade rule makes blocking-vs-note the decision that matters. The evidence check is a form check, but anchored to a real, fix-proven defect location, which is what answers the research review's form-vs-validity critique — and this revision strengthens the same answer at the ground-truth level: every defect's existence is now proven by a behavioral test that fails at the base and passes with the fix, not by a form-only or absent test. With one control, false-positive detection still rests on a single case — said plainly, not hidden.

Gate outcomes are recorded per model under `results/<date>-gate/` but are not a metric: they accept or reject cases and are never aggregated (§6).

## 8. Growth without bureaucracy

One rule in the README, one paragraph long: **when a defect slips past review and later gets a fix commit whose test is behavioral, freeze its introducing diff as a case at fix time** (`git log -S` to find the introducer, path-restrict, neutral task prompt, one-sentence provenance, the recorded proof that the fix's test fails at the base and passes with the fix, expected labels), **then run it through the validation gate** (§6) — at least two models, at least one failing the case, or the case does not join the set. A case should cost about fifteen minutes to author plus two gate runs; if it takes longer, the change is too entangled — skip it or keep it paste-only. No registry fields, no dashboard, no scorekeeping beyond dated result files, no gate that blocks anything, no automatic runs. The set grows only from real slips; nothing is synthesized to fill coverage gaps.

## 9. Risks

- **Overfitting to three cases:** the set is a canary, not a measurement; three cases cannot produce a precision number and are never presented as one.
- **Gate selection bias:** the gate tunes the set to the current models' decision boundary — cases are kept precisely because some current model misses them. When models change, previously-clean cases may flip; that is the canary working as intended, not a defect of the set, and gate outcomes still never become precision claims.
- **Label leakage:** mitigated by input/expected separation, neutral task prompts, fresh sessions, and history that ends at the base — the fix commit never exists in the case worktree's history; B2's HEAD message (B1's fix) is a deliberate distractor; residual shared-refs leak (`git log --all`) accepted and disclosed, with paste-only as fallback.
- **Case too small or ambiguous:** the one-sentence provenance rule plus the mandatory behavioral proof — the fix's test fails at the base, passes with the fix — is the gate at authoring time; this is the fix for the rejected initial set's weakness.
- **Construction asymmetry:** defect cases review a change already committed in the worktree (clean `git diff`), the control reviews an applied uncommitted patch. The task prompt must name the change under review explicitly, or a reviewer may review the wrong thing; disclosed here and in the README.
- **Shared introducer and domain clustering:** B1 and B2 come from one commit, and all three defects sit in the release/CLI domain — the set is thinner than three cases look; diversification is the growth rule's job.
- **Control ground truth is weaker:** suite green + no known defect is absence of evidence, not behavioral proof; an all-fail control triggers investigation (a real defect in `64f0ec7` would reclassify it), and a false-positive verdict on it might, in principle, be right.
- **Gate model availability:** the gate needs at least two different reviewer models; with only one configured, the set does not count until a second has run.
- **Commit-era context:** solved by replaying at the fix's parent — the tree is the defect's last live state, what the fix's author saw. Residual: task prompts are written today for yesterday's tasks; keep them minimal.
- **Expected labels age:** they reference the approved loop-controls spec's verdict rules; if that spec changes, expected files are revisited once, as a batch.
- **Result validity is per configuration:** results name the model and prompt version they were produced on; they say nothing about other configurations.

## Appendix: Related routing case (separate from reviewer metrics)

Real incident, recorded for later: on 2026-11-13, before this spec was approved, the orchestrator dispatched the planner for the reviewer-eval work. The user challenged the dispatch; the planner was stopped and the spec marked DRAFT.

- **Expected** under the loop-controls governance: no planning until the user approves the spec — stop and ask.
- **Actual:** the plan file was written before approval.
- **Provenance:** the conversation in which the incident occurred; `docs/superpowers/plans/2026-11-13-reviewer-precision-eval-plan.md` (unapproved); `TASK_REGISTRY.json` phase `awaiting_spec_approval` (the incident is also recorded there as `routingCaseCandidate`).
- **Use:** candidate for a future orchestrator-routing eval, alongside the 2026-11-09 routing incident (§5). It is not part of reviewer precision / reason / severity scoring, is not a case in §5, and changes nothing about this eval's cases or scope.
