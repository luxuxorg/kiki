# Kiki Loop Controls and Reviewer/Escalation Governance — Design

- **Date:** 2026-11-13 (rewritten same day after review feedback; amended same day — the alignment guardrail baseline is folded in per the user's decision that it belongs in this spec, superseding the registry's earlier separate-task follow-up; amended again same day — the block is a FIXED baseline constant, not derived from the active project `alignment.json` at generation time, because generators are global and have no project root/alignment input)
- **Status:** APPROVED DESIGN — prompt-only scope, not yet implemented. No commit, rollout or release authorization is granted by this status.
- **Scope:** behavior rules carried by the generated agent prompts in `src/cli/config.ts` (orchestrator, planner, implementer/gui-designer, reviewer, escalation) and the generated workflow document: when dispatch/review loops must stop, what a reviewer may report, when escalation is spent, who may change what, and the alignment guardrail block every generated agent prompt carries (§3).
- **Out of scope:** plugin code, permission arrays, registry schema changes, new agent roles, custom UI, watchdog changes (the watchdog already excludes time spent waiting on approvals); OWASP/SOC 2 auditing or certification work — the compliance labels are context, not deliverables.
- **Inputs:** the stop-runaway-loops brainstorm (session `ses_e2aa265ebffeRFMC1XWCn7KdO1`; recorded in `.agentic/kiki/TASK_REGISTRY.json`); current templates in `src/cli/config.ts`; `docs/superpowers/specs/2026-11-12-security-boundaries-design.md` for the permission baseline this builds on; `.agentic/kiki/alignment.json` (guardrails and compliance labels; `DEFAULT_ALIGNMENT` in `src/cli/config.ts` is its in-code twin); and the alignment-baseline research recorded in the registry's `alignmentBaseline` entry.

## 1. Intent and why

Kiki's pipeline is a loop of dispatches and reviews run by prompted agents, and today that loop has no defined edges. The reviewer's verdict is binary (`PASS | FAIL`, `config.ts` line 622), so a wrong plan, a wrong spec, a missing credential and broken code all look identical. The orchestrator's only rule is "if a task fails twice, dispatch `kiki-escalation`" — an expensive full diagnosis spent even on problems only the user can solve. A rejected permission can resurface as the same command or a workaround. There is no way to pass with concrete non-blocking notes, so reviewers either inflate blockers or lose the notes. Nothing obliges the reviewer to flag unrequested features or widened permissions. And nothing tells the retry loops when to stop.

This design gives every loop a defined stop, makes the reviewer's report expressive enough to route work correctly, spends escalation only on technical deadlocks, and asks the user exactly when only the user can answer — all prompt-only, because in a one-person, lightweight harness the rules must stay one readable line in a prompt the user can inspect, not a new subsystem. A plugin budget engine (hard caps in code) is out of scope for this basic iteration — deferred, not rejected on principle: this iteration deliberately starts prompt-only, and the engine can be added later if data justifies it. Native permission/policy rules were rejected because they can deny an action but cannot count review rounds or grade evidence — these are judgment calls, which is what prompts carry and rule engines do not.

## 2. Ownership boundary

The user approves the **spec** — that is the whole of human gatekeeping. The **plan** belongs to the machines: the planner may revise or rewrite it freely, and the orchestrator may accept revisions, as long as the spec's requirements, scope, security intent and acceptance criteria are unchanged. If a proposed change would alter **what is delivered or what is allowed**, it is a spec change and requires explicit user approval. If implementation reveals the spec itself is wrong, work stops and the user is asked.

## 3. Alignment guardrail baseline — every generated prompt carries it

**Why it must travel in the prompt.** Subagents do not inherit the orchestrator's context: a dispatched agent sees only its own system prompt and its task prompt, so a rule that lives only in the orchestrator — or only in a file nobody reads — reaches no one else. Today `.agentic/kiki/alignment.json` is referenced only by the plan-review gate, and only the orchestrator's key rules carry a single guardrail line ("Never hardcode secrets or log sensitive data"); the implementer, gui-designer and code reviewer never see the guardrails at all (the orchestrator's ad-hoc secrets line is superseded by the block). The baseline therefore rides inside every generated agent system prompt — all eight roles, the loop roles of this spec plus brainstormer and historian — as one **fixed, constant** block interpolated verbatim into every template (the existing `PERMISSION_BLOCK_PROMPT` pattern in `src/cli/config.ts`); `kiki update` refreshes the installed copies. The block is a **fixed baseline** — a plain string constant in the templates, NOT derived from the active project's `.agentic/kiki/alignment.json` at generation time, with **no production filesystem read and no loader**. Rationale: the generators are global and have no project root or alignment input; per-project dynamic generation would exceed the prompt-only scope of this design. The baseline corresponds one-to-one with the three default guardrails (`DEFAULT_ALIGNMENT` in `config.ts` / this repository's `alignment.json`), and that correspondence is tested one-to-one (§12 R15) so the prompt constant and the defaults cannot drift apart silently. Per-project dynamic guardrail injection — deriving the block from the active project's `alignment.json` at generation time — is **deferred, not rejected**: it can be added later if needed, as a separate change with its own design, once a mechanism exists to feed the generator a project root. Until then, **custom project guardrails are caught by the reviewer, not by the fixed prompt block**: the reviewer reads the ACTIVE project's `.agentic/kiki/alignment.json` in every review (§3, "the reviewer's standing alignment check"), so a violation of the active file's guardrails — including guardrails beyond the fixed three — still fails the review even though the prompt block carries only the baseline.

**The block, verbatim:**

```text
Project guardrails (non-negotiable; source: .agentic/kiki/alignment.json): Never hardcode secrets in source code. Use parameterized statements for every database query. Never leak internal stack traces in API responses. If a guardrail cannot be satisfied, stop and report it; do not work around it.
```

Deliberately three rules and one stop rule — few, non-conflicting, natural language. Task prompts (dispatch payloads) never repeat the block or paste the raw JSON: constraint-heavy, duplicated rule lists measurably reduce compliance, and system-prompt placement already carries the block's priority in the instruction hierarchy. The wording is pinned so the static test can require it verbatim, and its three rule sentences correspond one-to-one with the `guardrails` list of the **fixed baseline** (`DEFAULT_ALIGNMENT` in `config.ts` / this repository's `alignment.json`), so the prompt constant and the defaults cannot drift apart silently — the correspondence is tested statically (R15), never computed at generation time, with no production filesystem read and no loader. Placement inside each prompt is builder's choice. The compliance labels (OWASP Top 10, SOC 2 Type II) stay out of the block: an agent cannot act on an audit standard, and a per-diff certification claim would be invented.

**The reviewer's standing alignment check.** In every review, alongside the scope-creep check (§7), the reviewer compares the diff against the guardrails — and it does so against the **active project's** `.agentic/kiki/alignment.json`, read fresh in every review, not merely against the fixed block in its own prompt. This is what catches custom project guardrails beyond the fixed three: the prompt block carries only the baseline; the reviewer's check enforces the active file. A violation of the active file's guardrails is **FAIL, Reason `implementation`, Severity `critical`** — a guardrail violation is never minor — with the file/line evidence of §4 (the §4 honesty rules still apply: evidence must be complete). When the spec itself demands the violation, the Reason is `spec` instead, and the §5 routing stops for the user (the spec is user-owned, §2); if the fixed block and the active file ever conflict, the Reason is `spec` and the user decides. The workflow document's review description names the check in one line.

**What the block is, honestly.** Prose is guidance for judgment; the hard rules stay mechanically enforced by the unchanged permission arrays, with the user and the transcript as the final backstop — a model can still disobey prose, and this design does not claim otherwise. The block makes the rules present in every context; the reviewer's check is the in-loop detector. The compliance labels stay what they are — context for humans, not diff-checkable requirements: no review may claim or imply that a change achieves or advances OWASP or SOC 2 certification; that judgment belongs to an external auditor, never to a reviewer.

## 4. Reviewer report: one verdict plus structured fields

The reviewer reports exactly one verdict: **PASS**, **PASS_WITH_NOTES**, or **FAIL**. There is no fourth verdict and no separate plan-bug verdict — everything else the reviewer might want to say is a *field of the FAIL*, not a new state.

**PASS** states its basis: what was checked, against what.
**PASS_WITH_NOTES** states its basis plus concrete, non-blocking notes. A reviewer who cannot verify something records it as a note; unverifiability never creates a new verdict. Notes go into the review document and the task's phase/progress prose — never into `reviewNotes`, which the registry schema reserves for unresolved issues only.

**FAIL** carries three structured fields:

- **Reason** — the category that routes the work (§5):
  - `implementation` — the code is blocking-broken: tests/build/lint fail, it does not do the task, or it is unsafe.
  - `plan` — the plan itself is wrong; no implementation can satisfy it.
  - `spec` — the spec itself is wrong or self-contradictory.
  - `user-decision` — only the user can answer: product or scope decision, unclear requirement, destructive or irreversible choice.
  - `environment/permission` — blocked by the environment or permissions: missing credential, unreachable external service, denied permission.
- **Severity**, per blocking item: `critical` | `major` | `minor`. Critical and major block. **Minor downgrades to a note** — a minor issue never blocks, whatever its reason, and appears among the notes instead. A claimed blocker whose evidence is incomplete is likewise downgraded to a note. A FAIL therefore stands only if at least one critical or major item with complete evidence remains; if every item downgrades, the report is a PASS_WITH_NOTES. This is the guard against inflated blockers: severity, not reviewer insistence, decides what blocks.
- **Evidence**, per blocking item: the scenario, the violated rule or requirement, and the file/line. For `plan` and `spec` reasons the evidence instead quotes the faulty passage and explains why no implementation can satisfy it.

**Why this replaced the earlier four-verdict model (PASS / PASS_WITH_NOTES / FAIL / PLAN_BUG) and the other candidate states.** The old model bolted the *kind* of failure onto the verdict, which forced a new state per kind and still could not say how bad it was or who should fix it. The structured FAIL says all three as data: what kind (Reason), how bad (Severity), and what proves it (Evidence). The mappings:

- **PLAN_BUG → FAIL + Reason `plan` or `spec`.** A plan-level bug is FAIL/plan; a wrong spec is FAIL/spec. Both quote the faulty passage as their evidence, and neither ever earns a fix round (§5).
- **PARTIAL** → FAIL + `implementation` (the work does not do the task).
- **OUT_OF_SCOPE / DUPLICATE** → the standing scope-creep check (§7): creep in the implementation is FAIL/`implementation`; creep baked into the plan is FAIL/`plan`.
- **CANNOT_VERIFY** → a note on a pass, or a downgraded item inside a FAIL.
- **BLOCKED** is not a reviewer verdict at all — it is the implementer's report format (§9), with its own routing.

One verdict plus fields covers the space that no finite verdict list could.

## 5. Orchestrator routing

On each review verdict:

- **PASS / PASS_WITH_NOTES** → accept; record the notes per §4 (review document and phase/progress prose, not `reviewNotes`); no action.
- **FAIL + Reason `implementation`** → exactly **one fix round**: dispatch the implementer (or gui-designer) with the FAIL evidence, then re-review. This is the only reason that earns a fix round.
- **FAIL + Reason `plan`** → no fix round. The planner revises; the revised plan passes the reviewer loop before implementation resumes (§7).
- **FAIL + Reason `spec`** → stop and ask the user. The spec is user-owned (§2); a spec change requires explicit user approval.
- **FAIL + Reason `user-decision`** → stop and ask the user directly. No escalation dispatch — escalation cannot answer product or access questions.
- **FAIL + Reason `environment/permission`** → terminal: no retry, no workaround. A runtime permission block keeps the existing `PERMISSION_BLOCKED` no-retry override; a missing credential or unreachable service stops for the user.

**Second FAIL on the same task** (or the same failure twice): before spending anything, classify **user-only vs technical**. The reviewer's Reason usually answers it — `user-decision` and `environment/permission` are user-only and go straight to the user. When the Reason is technical (`implementation` or `plan`) but the failure pattern says otherwise (the same test keeps failing because a credential is missing), the orchestrator asks the user anyway, consulting the user-only checklist: missing permission/credential, product or scope decision, external service/hosting, unclear requirement, destructive or irreversible choice. Only a **technical deadlock** dispatches escalation (§6).

**Terminal dispatch states are never retried with the same prompt:** a `BLOCKED` report (§9), a `PERMISSION_BLOCKED` report, and a FAIL routed to the planner or the user. Empty or failed dispatch results that are *not* BLOCKED are retried once with the same prompt, as today; a second empty/failed result is classified like a failure above.

## 6. Escalation

Escalation is a full, expensive diagnosis, dispatched **at most once per task**, only for technical deadlocks. Its contract:

- **Receives** both review reports, the diff, and the implementer's recorded evidence; on request, the registry, health and routing logs — a change from today, where escalation consults only the orchestrator.
- **May** run build/test/lint and read-only git in the current tree to reproduce the failure; may create and use a scratch copy under `/tmp/opencode` — through routine shell and the existing external-directory access, never via the edit tool — when the case justifies the extra tokens.
- **Writes** one escalation report, plus an optional proposed patch left **unapplied**, both into its review-directory edit grant (`.agentic/reviews/*`). Any patch is applied by the implementer through the normal review loop, never by escalation itself.
- **Does not** edit source, publish, perform remote writes, or change permissions. Like the rest of this design, these limits are carried by the prompt, not the permission arrays — the unchanged shell baseline allows routine local shell for every role, so the backstop is the transcript, not a permission denial. The edit grants (review directories only) remain the one mechanical restriction.
- **Returns** exactly one recommendation: **Fix with guidance / Rewrite plan / Rewrite spec / Split / Stop-needs-user**. A rewrite recommendation must quote the faulty plan/spec passage and why no implementation can satisfy it.
- **Afterwards** the orchestrator presents the recommendation to the user; nothing is rewritten automatically. Once accepted: Fix with guidance → proceed (no spec or plan change); Rewrite plan → the planner revises; Rewrite spec → the brainstormer revises and the revised spec requires user approval; Split → the user decides, then the planner; Stop → the user decides.

## 7. Plan changes and the standing scope-creep check

Every revised plan — from a FAIL/`plan`, an escalation recommendation, or a planner-initiated improvement — passes the reviewer loop before implementation resumes. The reviewer checks that the revised plan still delivers the spec and respects its boundaries (§2).

In **every** review, standing, the reviewer actively looks for: unrequested features, widened permissions, new dependencies, extra behavior beyond the task, unrelated refactors, and violations of the project guardrails (§3). Consequences: creep in the **implementation** → FAIL/`implementation`; creep in a **plan** → FAIL/`plan` with the offending passage quoted, back to the planner, never a fix round; a genuine need to expand scope → it is a spec change → user approval; guardrail violations → FAIL per §3 (Severity critical, Reason `implementation` — or `spec` when the spec itself demands the violation).

## 8. Who runs checks

The implementer and gui-designer run build, lint, tests and the security scan, and report the **exact command output** in their handoff. The reviewer does not rerun them — it judges the diff plus the recorded evidence. Escalation may reproduce a repeated technical failure. The orchestrator runs no project checks; it coordinates and passes evidence along. This split is prompt-level, like everything here.

## 9. Explicit blocking (implementer side)

The implementer reports **BLOCKED** with the exact blocker, what it tried, and what it needs to proceed — never a silent retry or workaround. The orchestrator routes by type: missing context → supply it; plan ambiguity or bug → planner plus reviewer loop; permission/credential/product decision → stop and ask the user; technical deadlock → escalation. This is the implementer's twin of the reviewer's `environment/permission` and `user-decision` reasons: whoever hits the wall first reports it in their own format, and the routing is the same.

## 10. Loop caps and recording

Caps, prompt-level: at most one dispatch retry (only for non-BLOCKED empty/failed results); at most two review rounds per task, with the one fix round between; escalation at most once per task; the same failure twice stops. Recording uses only existing registry fields (descriptive schema, no schema change): dispatch retries and fix rounds increment the existing numeric `failures` counter; review rounds are summarized in the entry's phase/progress prose, as the live registry already does. Wall clock keeps today's bounds (30-minute dispatch timeout; watchdog thresholds). Token caps: not part of this iteration — the budget engine is deferred, not rejected.

## 11. Limits

- **Prompt-level enforcement, not a sandbox.** If a model disobeys, the failure mode is that it retries anyway; the wall-clock bounds are the remaining backstop, and the user sees the transcript. This matches the accepted honest-boundaries posture of the security design. The guardrail block (§3) shares this posture: its prose guides every agent's judgment, the permission arrays remain the only mechanical backstop for the hard rules, and the reviewer's standing alignment check is the in-loop detector.
- **My calls, flagged for the user:** escalation writes its report and optional unapplied patch to `.agentic/reviews/*` (its only edit grant), and reaches any `/tmp/opencode` scratch copy via routine shell plus the existing external-directory access — no edit grant on `/tmp` and no new grant needed; whether the fix round reuses the implementer session is builder's choice. The cap numbers (retry once and the 30-minute timeout are today's behavior, kept; two review rounds; one escalation per task) follow from the decided ladder.
- **No token or wall-clock budget engine in this iteration** — deferred, not dropped: the original task text's "hard caps on tokens and wall clock" is not rejected, only outside this basic prompt-only iteration, and can be added later if data justifies it; the existing watchdog time limits remain the current backstop.

## 12. Acceptance criteria — testable prompt assertions

Static assertions are checkable against the generated templates (unit-testable the same way the existing "all eight agents contain the no-circumvention line exactly once" check is). Behavioral assertions are observed in use and recorded as evidence; none is claimed without observation. R15 and R16 are static and honest about their limit: they prove mechanically that every generated prompt *carries* the fixed guardrail block — matching the `DEFAULT_ALIGNMENT` baseline one-to-one, with no generation-time derivation from any project's `alignment.json` — and that the reviewer template *contains* the alignment check against the active project's file; no test can prove an agent *obeys* the prose; obedience is prompt-level guidance, observed in use like R14, with the unchanged permission arrays as the only mechanical backstop for the hard rules.

| # | Assertion |
|---|---|
| R1 | Reviewer and workflow templates list exactly PASS / PASS_WITH_NOTES / FAIL, and FAIL's three fields: Reason (the five categories), Severity (critical/major/minor), Evidence |
| R2 | Reviewer template requires per blocking item: scenario + rule/requirement + file/line (quoted passage for plan/spec reasons), and states the downgrade rule — minor or missing-evidence items become notes; a FAIL stands only on critical/major items with complete evidence |
| R3 | Reviewer template requires PASS and PASS_WITH_NOTES to state their basis; notes declared non-blocking; unverifiable items recorded as notes |
| R4 | Orchestrator template contains the routing: FAIL/implementation → one fix round → re-review; FAIL/plan → planner, no fix round; FAIL/spec, FAIL/user-decision → stop and ask the user; second FAIL → user-only vs technical classification with the user-only checklist; escalation only on technical deadlock |
| R5 | Orchestrator template keeps the `PERMISSION_BLOCKED` no-retry override and adds: BLOCKED reports and FAIL/plan dispatches are never retried with the same prompt |
| R6 | Escalation template lists exactly the five recommendations, requires quoting the faulty passage for rewrites, and defines the inputs and capability limits of §6 (report + optional unapplied patch only) |
| R7 | Orchestrator, planner and workflow templates state the ownership boundary of §2: user approves the spec; plans are machine-owned while spec requirements/scope/security intent/acceptance criteria are unchanged; delivery/permission changes are spec changes |
| R8 | Orchestrator and workflow templates require every revised plan to pass the reviewer loop before implementation resumes |
| R9 | Reviewer template contains the standing creep list and its consequences: implementation creep → FAIL/implementation; plan creep → FAIL/plan with the passage quoted; genuine scope need → spec change → user approval |
| R10 | Implementer template requires exact command output in the handoff; reviewer template forbids rerunning and requires judging diff + recorded evidence; orchestrator template states it runs no project checks |
| R11 | Implementer template defines the BLOCKED report (blocker, what was tried, what is needed) and forbids silent retry/workaround |
| R12 | Orchestrator template maps the five escalation recommendations per §6 and states: present to the user, no automatic rewrite |
| R13 | Orchestrator template carries the §10 caps and the recording convention: retry/fix counts increment the existing `failures` counter, review rounds are summarized in phase/progress prose — no new registry fields |
| R14 | Behavioral, in use: a second FAIL whose Reason is `user-decision` or `environment/permission` produces a user question and no escalation dispatch; a technical deadlock dispatches escalation at most once per task; a FAIL/`plan` never produces a fix round; a minor-only FAIL report is recorded as PASS_WITH_NOTES; a `PERMISSION_BLOCKED` report ends its dispatch without retry (to be observed in use); a revised plan is reviewed before implementation resumes |
| R15 | All eight generated agent templates (the loop roles plus brainstormer and historian) contain the §3 guardrail block **verbatim as a fixed constant**, exactly once — the same check shape as the no-circumvention line — and the block's three rule sentences correspond one-to-one with the `guardrails` list of the fixed baseline (`DEFAULT_ALIGNMENT` in `src/cli/config.ts` / this repository's `.agentic/kiki/alignment.json`), a static correspondence test only — no generation-time derivation from any project's `alignment.json`, no production filesystem read, no loader |
| R16 | Reviewer template contains the §3 standing alignment check: compare the diff against the guardrails of the **active project's `.agentic/kiki/alignment.json`**, read in every review — so custom project guardrails beyond the fixed block are caught here, not in the prompt block; a violation is FAIL, Reason `implementation` (Reason `spec` when the spec itself demands it, or when the fixed block and the active file conflict), Severity `critical` — never minor — with file/line evidence; and it names the compliance labels (OWASP Top 10, SOC 2 Type II) as project context only, never diff-checkable requirements, and forbids certification claims |

**Builder work:** rewrite the templates (orchestrator, planner, implementer, reviewer, escalation) and the workflow document in `src/cli/config.ts` to carry these rules; add the §3 guardrail block as one FIXED constant interpolated verbatim into all eight generated agent templates, with the R15 correspondence test tying it one-to-one to `DEFAULT_ALIGNMENT` (static test only — no generation-time derivation from any project's `alignment.json`, no production filesystem read, no loader); per-project dynamic guardrail injection is deferred, not rejected, and can be added later if needed; add the static assertions of §12 to the template tests; refresh installed prompts via `kiki update`. No permission arrays, plugin, or schema changes.
