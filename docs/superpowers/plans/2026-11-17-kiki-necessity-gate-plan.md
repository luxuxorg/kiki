# Kiki Necessity Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add substantive, proportional necessity criteria to Kiki's generated prompts and workflow without adding artifacts or runtime behavior.

**Architecture:** One shared criteria string feeds the existing brainstormer, reviewer and workflow generators; the planner receives the ownership/tradeoff guidance in spec §6(c). Existing reviewer gates, root-cause routing and severity rules remain authoritative.

**Tech Stack:** Existing TypeScript/Node ESM, Vitest, TypeScript build; no dependency changes.

**Spec:** [Current user-edited design](../specs/2026-11-17-kiki-sensemaking-gate-design.md), especially §§4–9.

**Approval / handoff:** Registry task `sensemaking-review-gate.designApproval` records the user's 2026-11-17 “akzeptiert” approval of this short-delta-plan approach. Preserve the spec, including its stale pending header. Next: existing architect review against alignment, spec **and** plan, then one cohesive builder delivery; no additional user plan-approval gate.

## Global Constraints

- “No runtime behavior, config schema, dependency, permission, subagent, CLI command, or new phase/review pass.” (spec §2)
- Superpowers files, orchestrator output, other role prompts, permission arrays, frontmatter, exported types and diagnostics/stats remain unchanged (§§3, 6, 11).
- Existing verdicts, five Reasons, routing, caps, downgrade rule, R1–R18 pinned phrases and workflow registry schema remain unchanged (§§5–8).
- Criteria concern existing prose, not mandatory downstream Necessity headings, records, catalogs, copied analysis, N/A or waiver templates (§§1–4).
- Apply `.agentic/kiki/alignment.json`; compliance labels are context, not certification claims.
- Preserve unrelated dirty README, registry/logs, untracked artifacts and the completed diagnostics worktree. No cleanup, broad staging, installs, commits or live `kiki update`.

## Review Focus

Static tests pin prompt contracts, not agent obedience. Task 1 covers these five failure modes:
1. Negative capability claims without bounded observed probes; small changes turned into templates — `R19_criteria_shared_and_proportional`.
2. Technically unsound but rationalized/previously approved choices escaping review, or taste vetoes — `R19_reviewer_technical_authority`.
3. Upstream flaws discovered later routed to builder fixes; exhaustive repeated investigation — `R19_cumulative_root_cause_review`.
4. New in-boundary planner choices incorrectly treated as spec changes — `R19_planner_owns_technical_details`.
5. Custom-path generation or install/update losing guidance or changing unrelated outputs/settings — `R19_delivery_boundaries` and existing install/update preservation tests.

## File / Function Delta Map

| Surface | Delta |
|---|---|
| `src/cli/config.ts:ALIGNMENT_GUARDRAIL_PROMPT` (~482) | Add private `NECESSITY_CRITERIA: string` immediately after it; content from §4, not a template. |
| `generateBrainstormerTemplate` (~642) | Insert §6(b) after Instructions item 4. |
| `generatePlannerTemplate` (~663) | Insert §6(c) between Ownership and Task Metadata. |
| `generateReviewerTemplate` (~749) | Add §6(d) as third Standing Checks bullet, before Output Format. |
| `generateWorkflowTemplate` (~859) | Apply §6(f): phases 2/4/6 and short Necessity Gate section between Ownership and routing. |
| `tests/cli/loop-controls.test.ts` | Add R19 tests using `CONFIGS`, `bodyOf`, `sectionOf`; leave R1–R18 unchanged. |
| `tests/cli/install.test.ts` | Extend `installs_loop_control_prompts_for_all_eight_roles` and `updates_stale_prompt_bodies_without_changing_native_settings`. |
| Tracked `dist/cli/config.js`, `.js.map`, `.d.ts`, `.d.ts.map` | Regenerate with build; include only actual generated differences, no hand edits. |
| `README.md:Loop controls and review governance`, `CHANGELOG.md:[Unreleased]` | Historian-owned documentation after builder/review; preserve pre-existing README edits. |

### Task 1: Deliver and verify the coupled prompt delta

**Metadata:**
- risk: medium
- parallel: false
- depends_on: []

**Files:** Builder source/tests/build outputs in the delta map; existing `tests/cli/oc2-permissions.test.ts`, `init.test.ts`, `update.test.ts` and `vitest.config.ts` stay unchanged.

**Interfaces:** Existing `(config: KikiConfig) => string` generators retain signatures. Private `NECESSITY_CRITERIA` is interpolated exactly once into brainstormer, reviewer and workflow; planner references approved evidence rather than repeating the block.

- [ ] **Prepare:** Inventory existing tracked/untracked changes and capture default/custom generated outputs before edits for byte comparison. Implementation isolation follows the existing worktree workflow; an authorized preparation builder may prepare a new worktree later, carrying this exact untracked spec/plan explicitly. Do not reuse, reset or remove the diagnostics worktree, or assume HEAD contains the edited spec.
- [ ] **RED — add R19 assertions:** `R19_criteria_shared_and_proportional` checks all §4 criteria, actual checked-command/search result for negative claims, bounded safe probes/limits, one-sentence proportionality and no required extra section/catalog/waiver. Extract the criteria block from outputs and assert equality and occurrence count `1` in each of the three consumers, for both `CONFIGS`.
- [ ] **RED — add reviewer assertions:** `R19_reviewer_technical_authority` pins §6(d)'s rejection of evidenced unnecessary/duplicative/insecure/disproportionate choices despite rationale or approval, product-goal ownership/no taste veto, and existing major/critical versus minor/uncertain treatment. `R19_cumulative_root_cause_review` pins artifact focuses, plan-evidence reassessment of spec, implementation-evidence reassessment of plan/spec, evidence reuse, no redundant full investigation, root-cause Reasons and no builder obligation to obey faulty upstream directions.
- [ ] **RED — add ownership/delivery assertions:** `R19_planner_owns_technical_details` pins §6(c)'s justified in-boundary choices, absence-from-spec not implying a spec change, and actual boundary changes/unavailable required evidence invoking existing BLOCKED handling. `R19_delivery_boundaries` checks §6 insertion order, workflow phases/heading, additive-to-skill framing, no new pass, and absence of necessity additions in unchanged roles. Extend install **and stale-body update** fixtures with a representative phrase in each affected prompt and workflow; retain native-settings/idempotence assertions.
- [ ] **Run RED:** `npm test -- tests/cli/loop-controls.test.ts tests/cli/install.test.ts`; expect new necessity assertions to fail because current generators lack the text. Record failure evidence, not unrelated/environment failures as RED.
- [ ] **GREEN — edit the four generators and shared constant:** Follow spec §6 insertion anchors and §§4–5 semantics, without copying sketches into new downstream artifacts. Use lowercase “duplication” to avoid R1's uppercase forbidden-token vocabulary. Preserve pinned contract sentences.
- [ ] **Resolve the existing evidence-language trap additively:** Reviewer Output Format and workflow phase 6 currently say “why no implementation can satisfy it”; R2 pins that sentence. In the new necessity text explicitly clarify that evidenced technical unsoundness also warrants the existing spec/plan Reason even when implementable (spec §§4–5). Do not let that older sentence limit technical rejection to impossibility; do not edit it or broaden scope to escalation/orchestrator prompts.
- [ ] **Run focused GREEN:** `npm test -- tests/cli/loop-controls.test.ts tests/cli/install.test.ts tests/cli/init.test.ts tests/cli/update.test.ts tests/cli/oc2-permissions.test.ts`; expect all passing, including unchanged R1–R18 and permissions tests. Compare pre/post default/custom outputs: orchestrator and other untouched role outputs, all frontmatter/permissions, and workflow registry block must be byte-identical.
- [ ] **Verify delivery:** Run `npm run build`, `OPENCODE_TEST_BINARY=/home/lutz/.opencode/bin/opencode npm test -- --no-file-parallelism`, `npm run lint`, `npm audit`. Existing `vitest.config.ts` scopes discovery to `tests/`; do not change it or skip real integration. Build/tests must pass; no lint warnings/errors in changed files. Record audit's actual result, including known possible moderate findings; apply existing security/blocking policy, never assume exit 0 or invent a waiver.
- [ ] **Handoff:** Record each exact command, exit status and complete stdout/stderr (including RED/failures), output-comparison evidence, changed files and Implementation Summary for reviewer/historian. Inspect generated diff; declaration files should have no public-interface changes. Unresolved failing checks follow existing BLOCKED handling, no autonomous retry loop.

### Task 2: Historian documentation and completion decision

**Metadata:**
- risk: low
- parallel: false
- depends_on: ['Task 1']

**Files:** `README.md:Loop controls and review governance` (standing-checks prose), `CHANGELOG.md:[Unreleased]`.

**Interfaces:** Consumes Task 1's Implementation Summary, changed-file list and recorded verification evidence; produces concise user documentation and changed-file handoff. The orchestrator owns registry updates.

- [ ] **Document after existing implementation review:** Dispatch the historian once. Describe substantive proportional criteria, cumulative technical review and root-cause routing through existing gates; note ordinary `kiki update` delivery and prompt-level—not mechanical—enforcement. Clarify the README's implementability-only evidence wording consistently with Task 1. Do not restate spec analysis or add README-prose tests.
- [ ] **Check and record:** Review only the task's README/CHANGELOG diff against spec §§4–7 and builder evidence; preserve all unrelated README edits. Return exact updated paths so the orchestrator can resolve `documentation.status` from `pending` to `completed` before completion; no commit or live rollout.

## Self-Review / Execution Scope

Self-reviewed against current spec §§1–11, alignment and registry approval: covered by Task 1 plus historian Task 2; no unresolved design blockers. No implementation or checks were executed by the planner. Existing architect review is next; one builder owns the coupled source/test/build delta without fresh contexts for trivial steps, followed by existing final review and historian documentation.
