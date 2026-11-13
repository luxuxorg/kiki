# Loop Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the approved loop limits, evidence-based review contract, escalation boundary, and shared alignment baseline into generated prompts, with static regression tests.

**Architecture:** Keep the existing eight agent generators and workflow generator in `src/cli/config.ts`; change their prompt bodies, not their permission builders. Use one fixed guardrail constant corresponding to `DEFAULT_ALIGNMENT` / this repository's alignment, with no production filesystem read or loader; the reviewer reads the active project's alignment fresh every review. Focused Vitest assertions prove instruction presence and baseline consistency, not model compliance.

**Tech Stack:** TypeScript, Vitest 4.1, existing YAML parsing and CLI sandbox fixtures; Node >=18.

**Spec:** `docs/superpowers/specs/2026-11-13-loop-controls-design.md` (approved and amended 2026-11-13 to select the fixed baseline), especially §§2–10 and R1–R16.

## Global Constraints

- “Out of scope: plugin code, permission arrays, registry schema changes, new agent roles, custom UI, watchdog changes”. No new dependencies or model/routing configuration.
- “at most one dispatch retry (only for non-BLOCKED empty/failed results); at most two review rounds per task, with the one fix round between; escalation at most once per task; the same failure twice stops.”
- “Wall clock keeps today's bounds (30-minute dispatch timeout; watchdog thresholds).” Token/wall-clock budget engine is deferred, not dropped; do not implement one.
- Preserve the existing `PERMISSION_BLOCK_PROMPT` exactly once in each agent, including its rejection/no-workaround override.
- The guardrail block is a fixed literal corresponding one-to-one to `DEFAULT_ALIGNMENT` / this repository's alignment, never derived from an active project file at generation time. No production filesystem read or loader; per-project dynamic injection is deferred, not rejected. Custom guardrails are checked through the reviewer's fresh read of the active project's `.agentic/kiki/alignment.json` every review.
- User approves specs; machines own plans only within unchanged spec requirements, scope, security intent, and acceptance criteria. Changes to delivery or permissions require explicit user-approved spec changes.
- No source/test implementation or commits during planning. During execution, do not commit, install globally, refresh the real installation, or release without separate authorization.
- `.agentic/kiki/config.json` is absent in this checkout. Use package scripts: `npm run build`, `npm test`, `npm run lint`; the default generated security command is `npm audit`. Do not invent a project-specific command.
- Preserve unrelated dirty registry/log/spec files. Only the files in the map below belong to this implementation.

## Review Focus

1. Customized project alignment versus global agent installation: the fixed block stays baseline-only; the reviewer must read the active file fresh every review, including custom rules and baseline/file conflicts (Task 1 correspondence tests and Task 2 active-file instruction assertions).
2. Incomplete evidence or minor-only findings: prompt must downgrade to non-blocking notes, not trap work in FAIL (Task 2 static assertions; actual classification observe-in-use).
3. A missing credential disguised as repeated technical test failure: classify user-only before spending escalation (Task 4 checklist assertion; actual routing observe-in-use).
4. Legacy retry/rollback instructions or inline-plan-review instructions contradicting new boundaries: remove contradictory text without widening permissions (Tasks 2–4 negative assertions).
5. Updating stale installed prompt bodies with custom permissions/models: refresh prose exactly once and preserve native settings (Task 5 sandbox update test).

## File Map and Interfaces

| File | Responsibility / permitted change |
|---|---|
| `src/cli/config.ts` | One fixed literal guardrail constant near `PERMISSION_BLOCK_PROMPT`; prose in eight role generators and workflow only. Reviewer instructions require a fresh active-project alignment read each review, not a generation-time read. No production filesystem read/loader, permission builder/array, default alignment, health, registry schema, or public type changes. |
| `tests/cli/loop-controls.test.ts` (new) | Static R1–R13/R15/R16 prompt assertions; fixed eight-role list; default and custom config variants; literal exactly-once checks, one-to-one correspondence to `DEFAULT_ALIGNMENT` / repo alignment, and fresh active-file reviewer instruction assertions. Reads repo alignment in tests only. |
| `tests/cli/oc2-permissions.test.ts` | Replace obsolete whole-body freeze with precise retained delegation invariants; keep all policy tests and historical fixture intact. |
| `tests/cli/install.test.ts` | Sandbox fresh install and stale-body update assertions; preserve native permission/model settings. |

Read/run unchanged regressions: `tests/cli/init.test.ts`, `tests/cli/update.test.ts`, `tests/cli/global-policy.test.ts`, `tests/cli/oc2-migration.test.ts`. Do not regenerate `tests/fixtures/oc1-permission-templates.json`: it is historical migration input.

Public interfaces remain `generateOrchestratorTemplate`, `generateBrainstormerTemplate`, `generatePlannerTemplate`, `generateImplementerTemplate`, `generateGuiDesignerTemplate`, `generateReviewerTemplate`, `generateEscalationTemplate`, `generateHistorianTemplate`, and `generateWorkflowTemplate`, each `(config: KikiConfig) => string`; `generateAllTemplates(config: KikiConfig): GeneratedTemplates` stays unchanged. `GeneratedTemplates.guiDesigner` is camelCase; native role ID is `kiki-gui-designer`.

In the new test file, define an explicit eight-key role-generator table typed `Record<string, (config: KikiConfig) => string>` and a test-local `bodyOf(template: string): string` that strips YAML frontmatter as in the existing permissions tests. Parameterize static agent assertions over default config and a custom `KikiConfig` with paths `backend/`, `spec/`, `documentation/`, registry `.agentic/custom-tasks.json`, and commands `custom-build`, `custom-test`, `custom-lint`, `custom-security`. No new production helper API is needed.

---

### Task 1: Shared Guardrail Baseline and Compatible Test Foundation

**Metadata:**
- risk: medium
- parallel: false
- depends_on: []

**Files:**
- Modify: `src/cli/config.ts` near lines 424–425 and the eight generator bodies, lines 444–674.
- Create: `tests/cli/loop-controls.test.ts`.
- Modify: `tests/cli/oc2-permissions.test.ts:607–639`.
- Read only: `.agentic/kiki/alignment.json`, `DEFAULT_ALIGNMENT` in `src/cli/config.ts:89–96`.

**Interfaces:** Consumes the existing generator signatures and imports `DEFAULT_ALIGNMENT` in tests only for correspondence checking. Produces private `ALIGNMENT_GUARDRAIL_PROMPT: string`, a fixed literal interpolated once per role; tests inspect generated strings, not an exported constant. No project-root/alignment input or production file loading is added.

- [ ] **Step 1: Add failing baseline tests.** Name them `R15_guardrail_block_all_eight_roles_exactly_once`, `R15_guardrail_rules_match_alignment_one_to_one`, and `guardrail_block_excludes_compliance_labels`. Assert the role table's keys equal the eight named agent generators in the interface section (excluding workflow), not just its length; each stripped body contains exactly one occurrence of the following entire literal, under both configurations:

  > Project guardrails (non-negotiable; source: .agentic/kiki/alignment.json): Never hardcode secrets in source code. Use parameterized statements for every database query. Never leak internal stack traces in API responses. If a guardrail cannot be satisfied, stop and report it; do not work around it.

  Read alignment **in test code only** via `new URL('../../.agentic/kiki/alignment.json', import.meta.url)`. Assert its `guardrails` equals `DEFAULT_ALIGNMENT.guardrails` and the exact ordered source list: `No hardcoded secrets in source code`; `All database queries must use parameterized statements`; `API responses must not leak internal stack traces`. Use an explicit three-pair test table mapping each source string to its corresponding pinned sentence above; assert both ordered sides equal the source list and the block's three rule sentences extracted from each generated body. Assert the trailing stop rule separately, and neither compliance label occurs **inside the block**. Do not just check that each word occurs somewhere. Both configs must yield the same fixed literal; no test fixture feeds project alignment into a generator.
- [ ] **Step 2: Run RED.** `npx vitest run tests/cli/loop-controls.test.ts -t 'R15|guardrail_block'`. Expect assertion failures for absent block, not import/type errors.
- [ ] **Step 3: Update the legacy freeze test.** Replace `prompt_body_only_changes_delegation` with `prompt_bodies_preserve_native_delegation_contract`: keep direct assertions for `subagent` tool, agent ID/description requirement, optional model/sessionID, no nested delegation, inline skills for skill-loading roles, and no legacy `task` tool or `subagent_type` in either config. Keep the existing `security_blocked_prompt_all_roles`, all permission matrix tests, fixture contents, and YAML helpers unchanged. The old fixture's entire prose is no longer the desired contract; do not solve failures by whitelisting every new sentence or deleting policy coverage.
- [ ] **Step 4: Implement the fixed baseline.** Add the single private constant with the exact pinned literal and interpolate it once in each of the eight system-prompt bodies, adjacent to the existing permission block. Remove the orchestrator's superseded `Never hardcode secrets or log sensitive data` ad-hoc line. In the orchestrator, explicitly forbid repeating the block/raw alignment JSON in dispatch payloads; system prompts already carry it. No compliance standards in the block, generation-time derivation, production filesystem read, or loader. Do not modify generator inputs or installers; per-project dynamic injection remains deferred.
- [ ] **Step 5: Run GREEN.** `npx vitest run tests/cli/loop-controls.test.ts tests/cli/oc2-permissions.test.ts`. Expect all tests added so far and all retained permission/delegation tests to pass. Review the source diff to confirm the constant is a literal, no production file read/loader or generation-time derivation was added, and permission builders/defaults remain untouched. No commit.

### Task 2: Evidence-Based Reviewer Contract and Plan Ownership

**Metadata:**
- risk: medium
- parallel: false
- depends_on: ['Task 1']

**Files:**
- Modify: `src/cli/config.ts`, `generateReviewerTemplate` (600–628), `generatePlannerTemplate` (517–549), workflow architect/code review prose (694–704).
- Test: `tests/cli/loop-controls.test.ts`.

**Interfaces:** Consumes unchanged generators and Task 1's block. Produces prose report contracts only; no verdict enum/parser/runtime type is introduced.

- [ ] **Step 1: Add failing reviewer tests.** Use names `R1_reviewer_has_exact_three_verdicts_and_fail_fields`, `R2_reviewer_requires_complete_evidence_and_downgrades`, `R3_reviewer_records_basis_and_nonblocking_notes`, `R9_reviewer_checks_silent_scope_creep`, `R16_reviewer_checks_alignment_without_certification_claims`, and `R7_planner_respects_spec_ownership`. Assert:
  - Output line exactly `Verdict: PASS | PASS_WITH_NOTES | FAIL`, with no `Verdict: PASS | FAIL` or fourth verdict. FAIL item labels include `Reason: implementation | plan | spec | user-decision | environment/permission`, `Severity: critical | major | minor`, and `Evidence:`. PASS variants require `Basis:`; `Notes:` are concrete/non-blocking.
  - Each blocking item requires scenario, violated rule/requirement, file/line; plan/spec items quote the faulty passage and explain why no implementation can satisfy it. Minor **or** incomplete-evidence items downgrade to notes; FAIL requires at least one critical/major item with complete evidence, otherwise PASS_WITH_NOTES. Unverifiable findings become notes, not a fourth verdict; BLOCKED is an implementer report, not a verdict.
  - Notes go to review document and phase/progress prose, never `reviewNotes` (unresolved issues only).
  - Standing list explicitly includes unrequested features, widened permissions, new dependencies, extra behavior, unrelated refactors, guardrail violations. Implementation creep routes FAIL/implementation; plan creep FAIL/plan with quoted passage; genuine scope expansion requires user-approved spec change.
   - Reviewer instruction explicitly says to read the **active project's `.agentic/kiki/alignment.json` fresh in every review** and compare the diff against its guardrails, including custom rules beyond the fixed baseline; checking only its own prompt block is insufficient. Violation means critical (never minor), implementation reason, or spec reason when demanded by spec, with complete evidence. A conflict between fixed block and active file is Reason `spec`, stops for user decision, never silently prefers either. Both `OWASP Top 10` and `SOC 2 Type II` are context only, not diff-checkable requirements; no certification/advancement claims. Assert this wording/check instruction under both configs; this is not a test that a model actually reads or obeys the file.
  - Planner may revise/rewrite machine-owned plans only within unchanged requirements/scope/security intent/acceptance criteria; what is delivered/allowed is a spec change requiring user approval.
- [ ] **Step 2: Run RED.** `npx vitest run tests/cli/loop-controls.test.ts -t 'R1_|R2_|R3_|R7_planner|R9_|R16_'`. Expect missing contract assertions to fail.
- [ ] **Step 3: Rewrite reviewer/ownership prose.** Add the exact report labels and evidence/downgrade rules above, preserving actual-diff review and parallelization checklist. Require the reviewer to read the active project's alignment fresh every review, check custom rules as well as baseline rules, and route fixed-block/active-file conflicts as FAIL/spec for the user. This is an agent instruction, not generator filesystem access or a new loader. Require judging diff/plan plus recorded evidence, not rerunning build/test/lint/security. Write reviews to `.agentic/reviews/*` and return the verdict/report reference; remove workflow instructions to append verdicts directly to plans (reviewer has no plan edit grant). Add the planner ownership boundary. Workflow names the standing scope/alignment checks, the fresh active-file read, and the report location without broadening grants.
- [ ] **Step 4: Run GREEN.** Repeat Step 2's command, then `npx vitest run tests/cli/oc2-permissions.test.ts`. Expect PASS. Inspect both review modes: plan review cites approved spec and quoted plan passages; code review cites actual diff. No commit.

### Task 3: Implementer/GUI Evidence Handoff and Explicit Blocking

**Metadata:**
- risk: medium
- parallel: false
- depends_on: ['Task 2']

**Files:**
- Modify: `src/cli/config.ts`, implementer/GUI bodies (551–598), reviewer check instructions.
- Test: `tests/cli/loop-controls.test.ts`.

**Interfaces:** Existing `KikiConfig.commands` fields `build`, `test`, `lint`, `security` remain strings. Handoff text carries exact command output; `BLOCKED` has fields `Blocker:`, `Tried:`, `Need:`. No registry/report schema additions.

- [ ] **Step 1: Add failing tests.** `R10_builders_report_exact_output_reviewer_does_not_rerun` checks both implementer and guiDesigner require all four configured commands, exact command output (including failure output), and handoff to reviewer/historian; custom command strings must appear verbatim. Check reviewer explicitly does not rerun checks and judges diff plus recorded evidence. `R11_builders_define_BLOCKED_without_silent_workaround` checks both builders' three exact labels, stop/report instruction, no silent retry/workaround, no unilateral spec/plan edits. `builder_prompts_do_not_authorize_unbounded_retries_or_destructive_rollback` rejects `after all retries`, `tests fail after 3 retries`, and `git checkout -- .` in generated bodies.
- [ ] **Step 2: Run RED.** `npx vitest run tests/cli/loop-controls.test.ts -t 'R10_builders|R11_|builder_prompts'`. Expect missing GUI/check/block contracts and conflicting rollback wording to fail.
- [ ] **Step 3: Update builder and reviewer prose.** Both builders run configured build/test/lint/security, report exact command/output and implementation summary/changed files, and emit the explicit BLOCKED format on inability to proceed. Keep permission-block priority and no spec/plan modifications. Replace existing retry-exhaustion/blanket checkout rollback wording with stop-and-report preserving existing/user changes; retain pre-change inventory and `git clean -fd` prohibition. Do not introduce another autonomous fix loop or implement a rollback subsystem. Reviewer uses recorded evidence; missing/unverifiable evidence follows Task 2 downgrade rules rather than silently rerunning commands.
- [ ] **Step 4: Run GREEN.** Repeat Step 2; then `npx vitest run tests/cli/loop-controls.test.ts tests/cli/oc2-permissions.test.ts`. Expect PASS. No commit.

### Task 4: Bounded Orchestrator Routing, Escalation, and Workflow

**Metadata:**
- risk: medium
- parallel: false
- depends_on: ['Task 3']

**Files:**
- Modify: `src/cli/config.ts`, orchestrator (444–496), escalation (630–651), workflow (676–758).
- Test: `tests/cli/loop-controls.test.ts`.

**Interfaces:** Consumes Task 2 report fields, Task 3 BLOCKED fields, existing numeric `failures` and existing phase/progress prose. Produces no new registry fields. Escalation returns one of the five exact §6 recommendation strings below, not an enum/API.

- [ ] **Step 1: Add failing routing/cap tests.** Names and assertions:
  - `R4_orchestrator_routes_reasons_before_retry_or_escalation`: PASS variants accept/no follow-up; implementation gets exactly one fix dispatch to original builder with FAIL evidence then re-review; plan goes planner/no fix; spec and user-decision stop/ask user; environment/permission terminal, no retry/workaround. Second FAIL/same failure twice stops automatic work and classifies user-only versus technical before spending escalation. Checklist includes missing permission/credential, product/scope decision, external service/hosting, unclear requirement, destructive/irreversible choice, including ostensibly technical failures caused by credentials. Only technical deadlocks may escalate.
  - `R5_terminal_dispatch_reports_never_retry`: preserve exact existing permission override, add BLOCKED and planner/user-routed FAIL terminal exceptions; only non-BLOCKED empty/failed transport results retry once with the same prompt. Reject old `If a task fails twice, dispatch` and `tests fail after 3 retries` wording.
  - `BLOCKED_routing_supplies_context_or_stops_at_owner`: missing context supplies it, plan ambiguity/bug goes planner and reviewer, permission/credential/product asks user, technical deadlock follows one-escalation limit; never blindly resend the same BLOCKED prompt.
  - `R7_R8_ownership_and_every_revised_plan_review`: orchestrator and workflow include Task 2 ownership boundary; every revision (FAIL/plan, escalation, planner-initiated) must pass reviewer before implementation resumes. A second technical plan failure is a deadlock, not an unlimited planner loop.
  - `R10_orchestrator_coordinates_without_project_checks`: explicit no build/test/lint/security execution; pass recorded evidence to reviewer/escalation.
  - `R13_caps_use_existing_failures_and_phase_prose`: exactly one eligible dispatch retry, two review rounds, one implementation fix round, one escalation per task, same failure twice stops; dispatch retry/fix round increments numeric `failures`, review rounds/escalation-use/notes summarized in phase/progress prose, no new counter fields. Preserve 30-minute timeout/watchdog backstop; budget engine deferred, not rejected. Check workflow JSON schema example remains the existing keys, with no budget/review/escalation counter additions.
- [ ] **Step 2: Add failing escalation/workflow tests.** `R6_escalation_contract_has_exact_five_recommendations` extracts only the recommendation list and compares its ordered entries to `Fix with guidance`, `Rewrite plan`, `Rewrite spec`, `Split`, `Stop-needs-user` (not shortened aliases). Assert both review reports, diff, recorded builder evidence as inputs; registry/health/routing logs on request; rewrite requires faulty quoted passage and why unsatisfiable. Assert may reproduce build/test/lint/read-only git in current tree; justified scratch copy under `/tmp/opencode` via routine shell/existing external access, never edit tool. Assert one report plus optional **unapplied** patch only in `.agentic/reviews/*`; no source edits, publishing/remote writes, permission changes; implementer applies approved patch through normal review loop; at most once per task. `R12_orchestrator_presents_escalation_recommendations_before_action` checks all five mappings: user presentation/acceptance before anything, Fix proceeds without plan/spec change, Rewrite plan to planner+review, Rewrite spec to brainstormer+explicit user spec approval, Split user then planner, Stop user; no automatic rewrites. `R1_workflow_documents_three_verdicts_and_fields` checks exact verdict and Reason/Severity/Evidence lists, and no binary/fourth-verdict wording.
- [ ] **Step 3: Run RED.** `npx vitest run tests/cli/loop-controls.test.ts -t 'R4_|R5_|BLOCKED_routing|R7_R8|R10_orchestrator|R13_|R6_|R12_|R1_workflow'`. Expect absent/obsolete instructions to fail.
- [ ] **Step 4: Rewrite the orchestrator routing sections.** Replace the unconditional twice-failed escalation and generic retry instructions with the tested ladder. Put terminal overrides before the eligible dispatch retry instruction. Scope the first implementation FAIL to the one fix round, and the second FAIL to stop/classify; do not reset counters after plan revisions or an escalation dispatch. Preserve documentation gate, delegation and coordination-only rules. Dispatch payloads pass reports/evidence/references but never duplicate the guardrail block/raw JSON.
- [ ] **Step 5: Rewrite escalation prose.** Define exactly the five recommendations, inputs, optional scratch capability and restricted artifacts as tested. Existing broad shell allows more than this contract: explicitly describe these as prompt-level restrictions, not mechanical permission denial. Spend escalation once; it diagnoses, does not apply or publish fixes.
- [ ] **Step 6: Synchronize workflow prose.** Document ownership/revised-plan gates, three verdicts and fields, note destinations, alignment/scope checks, builder/reviewer/escalation check split, bounded ladder, and deferred budget engine/watchdog boundary. Preserve the registry schema example and documentation/model-routing sections. Describe prompt guidance honestly rather than claiming the pipeline is mechanically enforced by these additions.
- [ ] **Step 7: Run GREEN.** Repeat Step 3, then `npx vitest run tests/cli/loop-controls.test.ts tests/cli/oc2-permissions.test.ts`. Expect PASS. Read orchestrator+workflow together for contradictions; no third automatic review/fix/retry cycle after repeated failure, and no automatic escalation rewrite. No commit.

### Task 5: Sandbox Delivery Regression and Honest Verification Handoff

**Metadata:**
- risk: low
- parallel: false
- depends_on: ['Task 4']

**Files:**
- Modify: `tests/cli/install.test.ts`.
- Verify unchanged: `tests/cli/init.test.ts`, `tests/cli/update.test.ts`, `tests/cli/global-policy.test.ts`, `tests/cli/oc2-migration.test.ts`.

**Interfaces:** Existing `install([]): Promise<void>`, `update([]): Promise<void>`, `parseAgent(content, filename)`; all writes isolated by existing `XDG_CONFIG_HOME` sandbox. No install/update/migration production changes.

- [ ] **Step 1: Add delivery tests.** `installs_loop_control_prompts_for_all_eight_roles` extends fresh install coverage: parse all eight installed agents and assert pinned block exactly once, reviewer three-verdict line and fresh active-project `.agentic/kiki/alignment.json` read instruction, workflow fields and active-file alignment check. `updates_stale_prompt_bodies_without_changing_native_settings` installs, records parsed permissions/mode/model presence, replaces each body with a stale marker while retaining frontmatter (use `parseAgent`/existing render API or preserve the frontmatter substring), calls `update([])`, then asserts stale markers gone, block once, current reviewer/routing contracts including the fresh active-file read instruction present, native settings unchanged. Preserve/add a deliberate reviewer permission restriction and custom native model override as in existing preservation fixtures. Call update again and assert generated file bytes stable.
- [ ] **Step 2: Verify test sensitivity without production edits.** On the completed implementation these delivery tests should be GREEN. For their RED check, temporarily change only the test's expected guardrail marker to an impossible value, run `npx vitest run tests/cli/install.test.ts -t 'loop_control|stale_prompt'`, confirm assertion failure, then restore the correct expectation immediately. Do not roll back production or alter real installed prompts to demonstrate RED.
- [ ] **Step 3: Run sandbox regression GREEN.** `npx vitest run tests/cli/loop-controls.test.ts tests/cli/oc2-permissions.test.ts tests/cli/install.test.ts tests/cli/init.test.ts tests/cli/update.test.ts tests/cli/global-policy.test.ts tests/cli/oc2-migration.test.ts`. Expect all suites passing. Do not relax migration/permission assertions to accommodate prompt changes.
- [ ] **Step 4: Run full checks and retain exact evidence.** Run `npm run build`, `npm test`, `npm run lint`, and `npm audit`, recording each command, exit status and exact output in the handoff. Audit may require network/approval and may report pre-existing vulnerabilities: report them honestly, do not change dependencies or retry a permission denial. If a check cannot run, report `BLOCKED`, `Blocker:`, `Tried:`, `Need:` rather than claiming it passed.
- [ ] **Step 5: Review scope and acceptance evidence.** Run `git diff --check` and inspect `git diff -- src/cli/config.ts tests/cli/loop-controls.test.ts tests/cli/oc2-permissions.test.ts tests/cli/install.test.ts`. Confirm only intended prompt bodies/fixed literal/tests changed, no production filesystem read/loader or generation-time alignment derivation added, no permission arrays/plugin/schema/defaults touched, no historical fixture regenerated. Confirm reviewer wording requires a fresh active-file read every review, distinct from the baseline-only constant. Return static test evidence plus the R14 observation checklist below. Do not run real `kiki update`: the spec's installed-prompt refresh is a separately authorized rollout step; the sandbox test proves its delivery path. No commits.

## Acceptance Coverage and Observe-in-Use

| Requirement | Owner / evidence |
|---|---|
| R1 | Tasks 2 and 4: exact reviewer/workflow vocabulary and fields |
| R2–R3 | Task 2: evidence, downgrade, basis and notes |
| R4–R5 | Task 4: routing and terminal/retry exceptions |
| R6 | Task 4: exact escalation recommendations/capabilities |
| R7 | Tasks 2 and 4: planner, orchestrator, workflow ownership |
| R8 | Task 4: all revised plans gated by review |
| R9 | Task 2: standing silent-scope-creep checks/consequences |
| R10 | Tasks 2–4: builder execution/evidence, reviewer judgment, coordination |
| R11 | Task 3: both builders' explicit BLOCKED reports |
| R12–R13 | Task 4: user acceptance of escalation, caps/recording |
| R14 | Observe-in-use only; not a unit-test behavior claim |
| R15 | Task 1 fixed literal exactly once in all eight prompts under both configs; one-to-one ordered correspondence to `DEFAULT_ALIGNMENT` / repo alignment. Tasks 1 and 5 source-diff inspection confirms no generation-time read/derivation or production loader; dynamic injection deferred. |
| R16 | Task 2 reviewer instruction assertions: read active project alignment fresh each review, including custom rules; criticality/evidence; spec/user routing for demanded violations or fixed-block/file conflicts; no certification claims. Task 5 checks delivered wording. |

Observe-in-use checklist (pending until genuine transcripts exist; no new integration engine or model calls for these tests):

- Second FAIL/user-decision or environment/permission asks the user, without escalation; a credential-caused repeated technical test failure does likewise.
- Technical deadlock dispatches escalation at most once per task and does not silently start a third automatic review round.
- FAIL/plan goes to planner, never builder fix round; revised plan review precedes resumed implementation.
- Minor-only or incomplete-evidence-only claimed FAIL becomes PASS_WITH_NOTES, with notes outside `reviewNotes`.
- PERMISSION_BLOCKED ends the dispatch without retry/workaround; BLOCKED routes to its owner rather than identical-prompt retry.
- Guardrails present in context are actually respected; their presence alone is not proof of compliance.
- Reviewer actually reads the active project's alignment fresh on each review and detects custom guardrail violations beyond the fixed baseline; a fixed-block/active-file conflict stops for user decision as FAIL/spec. Static wording tests alone do not prove these actions.

## Plan Self-Review

- **Spec coverage:** Rechecked amended §§2–12 and R1–R16 against the table above: no uncovered requirement or remaining design blocker. R15 is fixed-baseline static correspondence, not active-file generation; R16 requires a fresh active-file review instruction and spec/user routing on conflicts. Dynamic injection, runtime enforcement and budget engine remain explicitly deferred; R14 still needs genuine observation.
- **Interfaces/types:** All production generator/config/registry signatures unchanged; exact verdict/reason/recommendation strings are prose, not new TypeScript unions. `guiDesigner`/`kiki-gui-designer` naming preserved.
- **Step scan:** Each task owns static named assertions and RED/GREEN commands; implementation steps specify text contracts without speculative code bodies. No permission-array edits are used to enforce prompt contracts.
- **Review Focus:** Five conditions mapped to Task 1 correspondence plus Task 2 fresh active-file/conflict instruction tests, Task 2 downgrade tests, Task 4 classification tests, Tasks 2–4 negative assertions, Task 5 sandbox update regression. Behavioral outcomes remain observe-in-use.
- **Proportion:** Five sequential reviewable deliverables, one new focused test file, one source file, two existing test files. No new subsystem, loader, agent, UI, registry extension, or automatic rollout.
