# Reviewer Precision Eval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** PARTIAL — Tasks 1–2 only; pending second pass for remaining cases, smoke material, and validation runs.
**Goal:** Build a real-provenance reviewer regression canary, not a precision measurement.
**Architecture:** Freeze neutral inputs separately from human-only expectations and provenance. Replay pinned trees in disposable worktrees, score reports by hand, and accept cases only through the two-model validation gate.
**Tech Stack:** Markdown, Git diffs/worktrees, existing Node/npm/Vitest tooling for isolated behavioral proof; no new dependencies or scripts.
**Spec:** `docs/superpowers/specs/2026-11-13-reviewer-precision-eval-design.md` (APPROVED).

## Global Constraints
- Home: `.agentic/kiki/evals/reviewer-precision/`; only published-doc pointer is one line in README's Development section.
- No source/tests edits in the working checkout, framework, runner, LLM judge, registry changes, scheduled runs, automatic blocking gate, or commit.
- Reviewer sees `input/` only, in a fresh session; never expectations, provenance, eval framing, or fix identifiers.
- Defect patches contain introducer `src`+tests changes only; exclude `dist/`, operational state, and documentation; never apply defect patches during review.
- Verified anchors: B1 fix `ff6ea6d`, base `054407b`; B2 fix `65a7148`, base `ff6ea6d`; B3 fix `b870bc7`, base `7463ed1`; C change `64f0ec7`, base `00b9f2a`.
- Behavioral fail-at-base/pass-at-fix proof is mandatory; gate needs at least two distinct reviewer models. No precision, ranking, percentage, or reliability claims.
- `1decc15` and `afa31c5` are non-scored smoke only; drop `3e3749d`; exclude the 2026-11-09 routing incident.

## Review Focus
- Clean defect-worktree diff: the prompt must explicitly name the attached frozen change; verify in Task 2.
- Label/history leakage: audit input boundaries and disclose shared refs plus paste-only fallback; verify in Tasks 1–2.
- Already-fixed distractor at B2: reject evidence about B1 instead of the live shim defect; owned by second-pass B2 task.
- Form-only or environmental failures: require actual nested-backup containment failure, not string checks or setup failures; verify in Task 2.
- Gate corner cases: distinguish defect all-pass/all-fail from healthy control all-pass and one-model unavailability; verify in Task 1.

## File Map
- Create `.agentic/kiki/evals/reviewer-precision/README.md`: replay, scoring, gate, growth, limitations, and result conventions.
- Modify `README.md` at `## Development`: one relative link to the eval README.
- Create `.agentic/kiki/evals/reviewer-precision/cases/B1/input/{task-prompt.md,case.patch,base-sha}`: reviewer-visible input.
- Create `.agentic/kiki/evals/reviewer-precision/cases/B1/{expected.md,provenance.md}`: private labels and behavioral proof.
- Reserve `cases/B2/`, `cases/B3/`, `cases/C/`, `smoke/`, and dated `results/` for the second pass; no placeholder evidence or acceptance claims.

### Task 1: Eval home, README, runbook, and hand scoring
**Metadata:**
- risk: low
- parallel: false
- depends_on: []
**Files:** Create eval `README.md`; modify root `README.md` Development section only (paths above).
**Interfaces:** Consumes approved spec §§4–8; produces runbook contract for every case and dated report/summary files.
- [ ] **Step 1: Define acceptance checks before authoring:** manually check all six replay steps, four scoring fields, five gate scenarios, and the single root link against the spec; these checks initially fail because artifacts are absent.
- [ ] **Step 2: Write the replay instructions:** from the eval home, set `REPO=$(git rev-parse --show-toplevel)`; create `/tmp/opencode/rp-eval/<id>` detached at `input/base-sha`; apply nothing for B1–B3, apply C's absolute patch uncommitted; dispatch only prompt+patch in a fresh worktree session; save verbatim model/prompt-version reports; hand-score; remove only disposable worktrees after confirming any forced cleanup.
- [ ] **Step 3: Specify scores/results:** `results/<date>-<id>-run<k>.md` and `<date>-summary.md`; verdict, reason, blocking band (critical/major vs minor), evidence scenario+rule+file/line near fix; C PASS/PASS_WITH_NOTES acceptable, any blocking finding false positive. Three runs and 2/3 majority per metric on prompt/model changes, one smoke otherwise; event-driven only.
- [ ] **Step 4: Specify authoring gate:** once per case on at least two models; mixed pass/fail defects kept only with proof, all-pass defects dropped or smoke, all-fail investigated/amended once then rerun or discarded. C all-pass stays, all-fail investigated; one model means not accepted. Preserve per-model reports/evidence in `results/<date>-gate/` and decisions in `<date>-gate-summary.md`; never aggregate gate results.
- [ ] **Step 5: Add growth paragraph and limitations:** behavioral real slips only, roughly fifteen minutes plus gate runs or skip/paste-only; shared-ref leak/fallback, asymmetrical replay, correlated CLI cases, missing reason categories, weak control ground truth, routing exclusions, and smoke non-metrics.
- [ ] **Step 6: Add the single Development link; run `git diff --check` and inspect `git diff -- README.md`; manually pass Step 1's checklist including all gate corner cases and input-only dispatch. Expected: clean whitespace and exactly one new root README line; no scripts or source/test changes. Do not commit.

### Task 2: B1 retained-backup defect case
**Metadata:**
- risk: medium
- parallel: false
- depends_on: ['Task 1']
**Files:** Create the five B1 files in File Map; no source/test edits in the working checkout.
**Interfaces:** Consumes Task 1's runbook; produces frozen B1 input plus private expected labels and recorded proof, still pending second-pass model gate.
- [ ] **Step 1: Define acceptance checks:** base resolves to `ff6ea6d^`, frozen patch equals introducer `054407b`'s src+tests diff, prompt names attached diff without hints, and provenance contains observed behavioral failure/success; initially missing artifacts fail these checks.
- [ ] **Step 2: Freeze inputs:** write `054407b` plus newline to `input/base-sha`; save `git diff 054407b^ 054407b -- src tests` verbatim as `input/case.patch`. Write neutral task statement: “Review the attached change implementing release preparation and apply workflows in the provided repository context.” Do not mention backups, TMPDIR, defect, fix, or expected verdict.
- [ ] **Step 3: Record behavioral proof in disposable worktrees only:** extract `ff6ea6d`'s test-only diff with `git diff ff6ea6d^ ff6ea6d -- tests/cli/release.test.ts`; overlay it on a separate base proof tree, not the reviewer tree. Identify the exact nested-candidate retained-backup test from that diff and run with the historical npm/Vitest tooling and nested-candidate TMPDIR setup; repeat at `ff6ea6d`. Record exact test title, commands, environment, exits, and containment assertion output. Require genuine outside-run-root assertion failure at base and pass with fix; missing dependencies or setup errors are not proof.
- [ ] **Step 4: Write private labels:** `expected.md` requires FAIL / implementation / blocking and complete evidence at `preserveApplyBackups`/`preservedBackupBase` in `src/cli/commands/release.ts`. `provenance.md` starts with the spec's one-sentence B1 defect statement, identifies introducer/base/fix, and embeds Step 3's observed proof; absent proof leaves the case unaccepted.
- [ ] **Step 5: Verify:** compare patch bytes with Step 2's Git output, check every changed path is under `src/` or `tests/`, and confirm clean detached review tree at `054407b` without applying patch. Audit the neutral prompt and input-only payload for hints; verify the evidence region against `git show ff6ea6d -- src/cli/commands/release.ts`. Run `git diff --check`; expected: all checks pass, no tracked source/test edits, no commit, and B1 explicitly awaiting its two-model gate.

### Task 3: B2 candidate-local shim case
**Metadata:**
- risk: medium
- parallel: true
- depends_on: ['Task 1']
**Files:** Create `.agentic/kiki/evals/reviewer-precision/cases/B2/input/{task-prompt.md,case.patch,base-sha}` and `cases/B2/{expected.md,provenance.md}` under that eval home.
**Interfaces:** Consumes Task 1's replay/scoring contract; produces B2 inputs and private proof for Task 5.
- [ ] **Step 1: Define acceptance checks:** `git rev-parse 65a7148^` resolves to `ff6ea6d`; patch matches `git diff 054407b^ 054407b -- src tests`; real candidate construction fails the fix's named assertion at base and passes at fix. Missing proof is a failed check.
- [ ] **Step 2: Freeze inputs:** write `ff6ea6d` plus newline to `base-sha`, save Step 1's diff verbatim, and use neutral prompt “Review the attached change implementing release preparation and apply workflows in the provided repository context.” Apply nothing in the clean reviewer worktree.
- [ ] **Step 3: Prove behavior separately:** overlay `git diff 65a7148^ 65a7148 -- tests/integration/release-copied-deps.test.ts` on a disposable proof tree at `ff6ea6d`; run `npm test -- tests/integration/release-copied-deps.test.ts -t 'regenerates a kiki .bin shim against the candidate-local entrypoint'`, then the same command at `65a7148`. Use historical dependencies; record commands, environment, exits, and actual assertion output. Require candidate-local target containment and absence of the outer target after construction; dependency/setup failures do not count.
- [ ] **Step 4: Write private labels:** copy the spec §5 B2 one-sentence defect into provenance with introducer/base/fix and observed proof. Expected: FAIL / implementation / blocking; scenario + isolation rule + file/line at shim handling in `src/cli/release-candidate.ts`. Explicitly reject evidence citing B1's backup defect: `ff6ea6d` already fixes it.
- [ ] **Step 5: Verify:** byte-compare patch to Step 1 output, audit src+tests-only paths and neutral input-only payload, confirm reviewer tree remains clean at `ff6ea6d`, and run `git diff --check`. Expected: behavioral red/green proof, no leakage, no working-checkout source/test edits; pending Task 5 gate.

### Task 4: B3 doctor and standard-config case
**Metadata:**
- risk: medium
- parallel: true
- depends_on: ['Task 1']
**Files:** Create `.agentic/kiki/evals/reviewer-precision/cases/B3/input/{task-prompt.md,case.patch,base-sha}` and `cases/B3/{expected.md,provenance.md}` under that eval home.
**Interfaces:** Consumes Task 1's contract; produces B3's large frozen change and private behavioral evidence for Task 5.
- [ ] **Step 1: Define acceptance checks:** `git rev-parse b870bc7^` resolves to `7463ed1`; patch equals `git diff 7463ed1^ 7463ed1 -- src tests`; both doctor/version and standard-config behavior have observed base-fail/fix-pass evidence.
- [ ] **Step 2: Freeze inputs:** write `7463ed1` plus newline to `base-sha`, save Step 1's diff, and prompt “Review the attached change migrating Kiki to OpenCode 2 in the provided repository context.” Do not hint at versions, markers, or fixes; apply nothing in the clean reviewer worktree.
- [ ] **Step 3: Prove behavior:** overlay `git diff b870bc7^ b870bc7 -- tests/cli/doctor.test.ts tests/cli/oc2-paths.test.ts` on a separate disposable tree at `7463ed1`; run `npm test -- tests/cli/doctor.test.ts tests/cli/oc2-paths.test.ts`, then repeat at `b870bc7`. Record historical tooling/environment, exact failing titles/assertions, commands and exits; reject runtime/setup errors as proof.
- [ ] **Step 4: Pin assertions in provenance:** name `passes with native agents and package registration without gating on the binary version`, `reports the standard OpenCode roots as the normal setup`, and parameterized `accepts_standard_config_files_shared_by_oc1_and_oc2 (%s)` / `accepts_legacy_cli_config_without_a_kiki_loader (%s)`. Require doctor output without version gating, standard roots accepted, config bytes unchanged, and real V1 artifacts still rejected at fix (including `fails closed on leftover V1 Kiki artifacts instead of masking them`).
- [ ] **Step 5: Label and verify:** provenance starts with spec §5 B3's one-sentence defect plus introducer/base/fix and Step 3 evidence. Expected: FAIL / implementation / blocking, evidence at version gate in `src/cli/commands/doctor.ts` and marker rejection in `src/cli/oc2-paths.ts`. Byte-check the patch, audit paths/input isolation and clean reviewer tree, and run `git diff --check`; no claim of acceptance before Task 5.

### Task 5: Control, non-scored smoke, and mandatory authoring gate
**Metadata:**
- risk: medium
- parallel: false
- depends_on: ['Task 1', 'Task 2', 'Task 3', 'Task 4']
**Files:** Create `.agentic/kiki/evals/reviewer-precision/cases/C/input/{task-prompt.md,case.patch,base-sha}`, `cases/C/{expected.md,provenance.md}`, `smoke/{README.md,case-a.md,case-b.md,1decc15.md,afa31c5.md}`, and `results/<date>-gate/` reports plus `results/<date>-gate-summary.md`; finalize eval README.
**Interfaces:** Consumes all case proposals and Task 1's manual scoring; produces per-case acceptance decisions, not a benchmark or blocking automation.
- [ ] **Step 1: Define control/smoke checks:** verify `git rev-parse 64f0ec7^` is `00b9f2a`; control patch is `git diff 00b9f2a 64f0ec7 -- src tests`. Smoke is explicitly not scored, not gated, and never counted in results.
- [ ] **Step 2: Freeze C:** write `00b9f2a` plus newline and Step 1's patch; prompt “Review the attached change adding bounded loop controls and reviewer governance in the provided repository context.” Apply the absolute patch path uncommitted in C's detached base tree; verify the diff matches, including generated prompts in `src/cli/config.ts` and the three test files named in spec §5.
- [ ] **Step 3: Record control ground truth:** run `npm test` with historical dependencies in an isolated C proof tree carrying the patch; record actual suite output/exits and inspect subsequent history touching its files. Do not invent a green result or infer defect absence from it. Expected C is PASS or PASS_WITH_NOTES; any FAIL or blocking finding is a false positive pending investigation; document the weaker, absence-of-known-defect basis.
- [ ] **Step 4: Preserve smoke only:** copy available probe case-a/case-b inputs from `/tmp/opencode/kiki-loop-probe/` without private labels in reviewer payloads; if unavailable record that blocker rather than fabricate provenance. Record `1decc15` (introducer `0c13814`, later live-plugin mirror `82bb29d`, no behavioral test) and `afa31c5` (introducer `10912e6`, form-only template assertion) with frozen src+tests diffs and neutral prompts. These test replay/report shape only; exclude `3e3749d` and routing incidents.
- [ ] **Step 5: Run mandatory gate:** dispatch B1, B2, B3 and C once each on every one of at least two distinct reviewer models, fresh session/worktree each time, input-only payloads. Save verbatim reports under `results/<date>-gate/<case>-<model-slug>.md` with full model ID, prompt version, reviewer verdict, expected-match decision and evidence pointer; keep private annotations outside reviewer input. One model available means pending, never accepted.
- [ ] **Step 6: Decide by hand:** keep a defect only with behavioral proof and mixed outcomes (at least one model fails the case and at least one passes); “fails the case” means mismatches expected labels, not merely emits FAIL. All models pass = too easy: drop or demote to smoke. All fail = ambiguous: investigate, amend a concrete authoring flaw once and rerun the full gate, otherwise discard; retain original reports. Healthy all-pass C stays; all-fail C is investigated for real defects or misleading prompt, not automatically accepted.
- [ ] **Step 7: Record decisions/growth:** write per-case keep/drop/pending decisions in `results/<date>-gate-summary.md`, without scores, percentages or model rankings. Finalize README's one-paragraph rule: real slipped defect + behavioral fix test only; locate introducer with `git log -S`, freeze neutral input and one-sentence provenance, prove base-fail/fix-pass, then gate on at least two models. Budget about fifteen minutes authoring plus gate runs; skip or paste-only if entangled, never synthesize coverage.
- [ ] **Step 8: Final verification:** manually replay boundaries and gate scenarios, check artifact completeness and report/model IDs, run `git diff --check`, and inspect `git diff --name-only`. Expected: eval artifacts plus single root README pointer only, no source/tests edits, scripts, registry changes or commit. Unrun proofs/models leave cases pending, never manufacture acceptance.

## Self-review checklist (planning pass)
- [x] Spec §§4–8 mapped to Tasks 1–5; exact B2/B3/control anchors, smoke demotions and exclusions retained.
- [x] Steps specify files, frozen diffs, behavioral assertions, commands, scoring interfaces and checkable outcomes; no source implementation prescribed.
- [x] Review Focus covered: B1 containment, input leakage, B2 already-fixed distractor, B3 real behavior, and gate corner cases.
- [x] Gate distinguishes reviewer FAIL from failing a case, defect all-pass/all-fail from healthy control, and missing second model; growth and non-metric limitations explicit.
- [x] Proportion and consistency checked against approved spec; case execution and behavioral/model evidence remain future work, not claimed results.

**Status: COMPLETE — ready for reviewer gate.** This appended status supersedes the first-pass PARTIAL marker; plan completeness does not mean the eval cases have passed their authoring gate.
