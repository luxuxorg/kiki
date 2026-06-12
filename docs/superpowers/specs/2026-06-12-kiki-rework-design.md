# Kiki Rework: Superpowers-Aligned Model-Agnostic Execution Pipeline

**Date:** 2026-06-12  
**Status:** Design Approved  
**Scope:** Complete architectural rework of Kiki to eliminate document duplication, reduce artifact overhead, enable interactive intake, and establish clear progress tracking.

\---

## 1\. Goal

Transform Kiki from a monolithic, document-heavy meta-framework into a **lightweight, model-agnostic execution pipeline** that dispatches **superpowers skills** at each phase, adds Kiki-specific quality gates (Architect, Reviewers, Escalation), and tracks cross-task progress in a machine-readable registry.

**Key outcomes:**

* Zero document duplication with superpowers
* Interactive intake (no single-prompt illusion)
* Consolidated artifacts (one doc per lifecycle, not clones)
* Clear progress tracking (`TASK\_REGISTRY.json`)
* Preserved model-agnostic dispatch and risk classification

\---

## 2\. Problem Statement (Current Kiki Flaws)

### 2.1 Document Duplication

Kiki creates `.agentic/templates/RESEARCH\_SUMMARY.md`, `.agentic/templates/EXECUTION\_PLAN\_DRAFT.md`, etc. — documents that overlap 1:1 with superpowers outputs (`docs/superpowers/specs/...`, `docs/superpowers/plans/...`). This causes confusion about which doc is canonical.

### 2.2 Single-Prompt Intake

The Orchestrator treats the user's first message as a complete specification. It does not pause, ask questions, or validate scope before spawning a task directory and dispatching agents. This creates the illusion that one prompt contains everything needed.

### 2.3 Too Many Artifacts

Kiki produces 9+ separate documents per task (`RESEARCH\_SUMMARY.md`, `EXECUTION\_PLAN\_DRAFT.md`, `ARCHITECTURE\_REVIEW.md`, `APPROVED\_EXECUTION\_PLAN.md`, `IMPLEMENTATION\_NOTES.md`, `FIRST\_REVIEW\_REPORT.md`, `SECOND\_REVIEW\_REPORT.md`, `ESCALATION\_REPORT.md`, `FINAL\_SUMMARY.md`). This is overwhelming and scatters state across files.

### 2.4 No Cross-Task Progress Visibility

There is no registry or index of what tasks have been started, what phase they are in, or what superpowers docs they reference. Running `kiki status` only shows static config — not dynamic progress.

### 2.5 Agents Duplicate Superpowers Skills

`project-researcher`, `planning-drafter-local`, and `planning-drafter-synthesis` are direct clones of the superpowers `brainstorming` and `writing-plans` skills. Kiki should dispatch these skills, not reimplement them.

\---

## 3\. Architecture

Kiki is a **pipeline of model-specific agents**, where each agent's primary job is to invoke the relevant **superpowers skill** (or perform a Kiki-specific quality gate). Kiki does not replace superpowers — it **orchestrates** superpowers with model-agnostic dispatch, risk classification, and additional review/escalation layers.

```
┌─────────────────────────────────────────────────────────────┐
│                      Kiki Pipeline                          │
├─────────────────────────────────────────────────────────────┤
│  Intake → Brainstorm → Plan → Architect → Implement →       │
│  Review1 → \[Review2] → Complete                             │
│                                                             │
│  Each stage dispatches a specific model + skill:            │
│  - Brainstormer → superpowers brainstorming skill           │
│  - Planner → superpowers writing-plans skill                │
│  - Implementer → superpowers executing-plans + TDD skills   │
│  - Architect / Reviewers → Kiki native quality gates        │
└─────────────────────────────────────────────────────────────┘
```

### 3.1 Design Principles

1. **Superpowers owns design docs.** Kiki never writes `RESEARCH\_SUMMARY.md`, `EXECUTION\_PLAN\_DRAFT.md`, or separate plan clones. It reads from and appends to superpowers docs.
2. **Kiki owns execution state.** Routing logs, task registry, risk classification, model dispatch, and review verdicts live in `.agentic/`.
3. **One doc per lifecycle.** The spec doc accumulates state (draft → review → approved). The plan doc accumulates state (draft → architect review → approved → implementation notes → review verdicts). No separate "review report" files.
4. **Interactive intake.** The Orchestrator asks clarifying questions before creating a task. No task directory is spawned for an underspecified request.

\---

## 4\. Agent Roles \& Skill Mapping

|Kiki Agent|Superpowers Skill|Output|Model Role|
|-|-|-|-|
|`kiki-orchestrator`|None (router)|`TASK\_REGISTRY.json`, routing logs|Configurable via `models.json`|
|`kiki-brainstormer`|`brainstorming` (+ optional `scientist`)|`docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`|`project-researcher` model|
|`kiki-planner`|`writing-plans`|`docs/superpowers/plans/YYYY-MM-DD-<topic>-plan.md`|`planning-drafter-local` model|
|`kiki-architect`|None (Kiki gate)|Inline review appended to plan doc|`planning-architect` model|
|`kiki-implementation-standard`|`executing-plans` + `test-driven-development`|Source code + tests|`implementation-agent-standard` model|
|`kiki-implementation-complexity`|Same skills, premium model|Source code + tests|`implementation-agent-complexity` model|
|`kiki-first-reviewer`|None (Kiki gate)|Inline verdict appended to plan/summary|`first-reviewer` model|
|`kiki-second-reviewer`|None (Kiki gate)|Inline verdict appended to plan/summary|`second-reviewer` model|
|`kiki-escalation-agent`|None (Kiki gate)|`ESCALATION\_REPORT.md` (only if needed)|`escalation-agent` model|

### 4.1 Agent Renaming Rationale

Old names (`project-researcher`, `planning-drafter-local`) described *what* the agent did in Kiki's old pipeline. New names (`kiki-brainstormer`, `kiki-planner`) describe *which superpowers skill it invokes*, making the relationship explicit and unambiguous.

### 4.2 Scientist Skill Integration

The `kiki-brainstormer` may optionally invoke the `scientist` skill (if available in the environment) for deep research within the LLM wiki or external knowledge bases. This is **additive** to the `brainstorming` skill — the brainstormer runs `brainstorming` first, and if the topic requires deep factual research, it dispatches `scientist` as a sub-step. The brainstormer then synthesizes both outputs into the final spec.

**Note:** The exact mechanism for chaining `brainstorming` → `scientist` within a single agent dispatch is TBD and may require skill-level support for sub-skill invocation.

\---

## 5\. File Structure \& Scaffold Changes

### 5.1 New Scaffold (what `kiki init` creates)

```
.agentic/
  config.json                 # Tech stack, commands, risk matrix
  alignment.json              # Guardrails \& compliance
  TASK\_REGISTRY.json          # Cross-task progress tracker
.opencode/
  models.json                 # Model routing table
  agents/
    kiki-orchestrator.md
    kiki-brainstormer.md
    kiki-planner.md
    kiki-architect.md
    kiki-implementation-standard.md
    kiki-implementation-complexity.md
    kiki-first-reviewer.md
    kiki-second-reviewer.md
    kiki-escalation-agent.md
  docs/
    agentic-workflow.md       # Canonical operating manual
```

### 5.2 Removed from Scaffold

The following are **deleted** and no longer created by `kiki init`:

* `.agentic/templates/` directory and all 9 blank templates
* `.agentic/tasks/` is still created dynamically per task, but only contains:

  * `input/user\_request.md`
  * `state/orchestrator\_state.json`
  * `state/routing\_log.jsonl`
  * `diffs/implementation.diff`
  * `tests/test\_results.txt`

### 5.3 Superpowers Path Convention

Kiki assumes the target project uses superpowers conventions:

* **Specs:** `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
* **Plans:** `docs/superpowers/plans/YYYY-MM-DD-<topic>-plan.md`

If these directories do not exist, Kiki does **not** create them. That is superpowers' domain.

\---

## 6\. Intake Flow (Interactive Elicitation)

The Orchestrator no longer treats the user's prompt as a complete specification.

### 6.1 Phase 1: Analyze

The Orchestrator parses the prompt and flags:

* **Missing scope:** "You said 'rework Kiki' — which subsystems?"
* **Ambiguous requirements:** "What does 'better check' mean — a CLI command, a web UI, or a file?"
* **Unstated constraints:** Tech stack, backward compatibility, time budget

### 6.2 Phase 2: Clarify

If gaps are found, the Orchestrator **pauses** and asks the user **one question at a time**. No task directory is created yet. This mimics the superpowers brainstorming style.

### 6.3 Phase 3: Lock

Once requirements are clear, the Orchestrator:

1. Generates a `TASK\_ID` (e.g., `T-042`).
2. Creates `.agentic/tasks/<TASK\_ID>/input/user\_request.md`.
3. Adds an entry to `TASK\_REGISTRY.json` with status `intake\_complete`.
4. Proceeds to Superpowers Discovery Gate.

\---

## 7\. Superpowers Discovery Gate

Before dispatching any agent, the Orchestrator checks for existing superpowers docs.

### 7.1 Spec Discovery

Scan `docs/superpowers/specs/` for any spec whose filename or content matches the task topic/intent.

* **If found:** Load the spec. Set `spec\_ref` in the registry. Skip `kiki-brainstormer`.
* **If not found:** Dispatch `kiki-brainstormer` to produce the spec via the `brainstorming` skill.

### 7.2 Plan Discovery

Scan `docs/superpowers/plans/` for an approved plan matching the task.

* **If found:** Load the plan. Set `plan\_ref` in the registry. Skip `kiki-planner`.
* **If not found:** Dispatch `kiki-planner` to produce the plan via the `writing-plans` skill.

### 7.3 Fast-Path Eligibility

For **Micro Risk** tasks (typo fixes, UI copy, single-line config tweaks), Kiki supports a Direct-Fix path:

* Skip Brainstormer and Planner entirely.
* Route: Intake → Implementation → First Reviewer → Complete.
* No superpowers docs are produced or required.

\---

## 8\. Artifact Strategy (Consolidated, No Duplicates)

Kiki does **not** invent its own document types. It uses exactly what superpowers defines, appending state inline.

|Lifecycle|Superpowers Doc|Kiki's Addition|
|-|-|-|
|**Design**|`docs/superpowers/specs/...-design.md`|Kiki consumes it. No parallel doc.|
|**Plan**|`docs/superpowers/plans/...-plan.md`|Architect appends review inline. Implementer appends notes inline. Reviewers append verdicts inline.|
|**Implementation**|Source code + tests|Standard.|
|**Completion**|—|Orchestrator updates `TASK\_REGISTRY.json`. Writes `FINAL\_SUMMARY.md` only if superpowers does not provide closure.|
|**Escalation**|—|`ESCALATION\_REPORT.md` (only if needed).|

### 8.1 Inline Review Format

When the Architect or a Reviewer appends to the plan doc, they use a standard header:

```markdown
---
## Kiki Review: <Role> — <Date>
\*\*Decision:\*\* APPROVED / APPROVED\_WITH\_CHANGES / REJECTED / REQUEST\_REVISION
\*\*Risk Level:\*\* <micro/low/medium/high/critical>
\*\*Findings:\*\*
- ...
\*\*Required Changes (if any):\*\*
- ...
---
```

This keeps all state in one document while preserving superpowers' plan structure.

\---

## 9\. Task Registry (`TASK\_REGISTRY.json`)

The Orchestrator owns the registry. It is the single source of truth for:

* What tasks exist
* What phase each task is in
* Which superpowers docs are referenced
* What has been achieved vs. what lies ahead

### 9.1 Schema

```json
{
  "version": "1.0.0",
  "tasks": \[
    {
      "id": "T-001",
      "status": "in\_progress",
      "phase": "implement",
      "user\_request\_summary": "Rework Kiki to align with superpowers",
      "risk\_level": "high",
      "spec\_ref": "docs/superpowers/specs/2026-06-12-kiki-rework-design.md",
      "plan\_ref": "docs/superpowers/plans/2026-06-12-kiki-rework-plan.md",
      "phases\_completed": \["intake", "brainstorm", "plan", "architect"],
      "phases\_pending": \["implement", "review1", "review2", "complete"],
      "created\_at": "2026-06-12T10:00:00Z",
      "completed\_at": null
    }
  ]
}
```

### 9.2 CLI Integration

`kiki status` prints a human-readable summary:

```
================================================================
Kiki Task Registry
================================================================
Active Tasks: 2
Completed Tasks: 5

T-002  \[in\_progress]  implement   Add task registry CLI command
       Spec: docs/superpowers/specs/2026-06-12-registry-design.md
       Plan: docs/superpowers/plans/2026-06-12-registry-plan.md
       Completed: intake, brainstorm, plan, architect
       Pending:  implement, review1, complete

T-003  \[completed]    complete    Fix typo in README
       Completed: intake, implement, review1, complete
================================================================
```

\---

## 10\. Data Flow / Pipeline

```
User Prompt
    │
    ▼
┌─────────────────────┐
│ Intake              │ ──► Orchestrator asks clarifying questions
│ (Orchestrator)      │ ──► Writes user\_request.md
└─────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Superpowers Discovery Gate  │ ──► Scan docs/superpowers/specs/ \& /plans/
│ (Orchestrator)              │ ──► Set spec\_ref / plan\_ref in registry
└─────────────────────────────┘
    │
    ├──► Spec missing? ──► Dispatch kiki-brainstormer → brainstorming skill
    │                      └──► Writes docs/superpowers/specs/...-design.md
    │
    ├──► Plan missing? ──► Dispatch kiki-planner → writing-plans skill
    │                      └──► Writes docs/superpowers/plans/...-plan.md
    │
    ▼
┌─────────────────────┐
│ Architect Review    │ ──► kiki-architect reads plan + alignment.json
│ (kiki-architect)    │ ──► Appends inline review to plan doc
└─────────────────────┘
    │ (approved)
    ▼
┌─────────────────────┐
│ Implementation      │ ──► kiki-implementation-standard
│ (Implementer)       │ ──► Invokes executing-plans + TDD skills
└─────────────────────┘
    │ (if COMPLEXITY)
    ├──► Escalate to kiki-implementation-complexity (premium model)
    │
    ▼
┌─────────────────────┐
│ First Review        │ ──► kiki-first-reviewer
│ (Reviewer)          │ ──► Build/test verification, plan compliance
└─────────────────────┘
    │ (if high risk or test failures)
    ├──► Dispatch kiki-second-reviewer
    │
    ▼ (approved)
┌─────────────────────┐
│ Completion          │ ──► Orchestrator updates TASK\_REGISTRY.json
│ (Orchestrator)      │ ──► Writes FINAL\_SUMMARY.md (if needed)
└─────────────────────┘
```

\---

## 11\. Error Handling \& Escalation

### 11.1 Escalation Triggers

The Orchestrator routes to `kiki-escalation-agent` when:

* Implementation has failed twice (`implementation\_attempts >= 2`).
* Architect rejects the plan twice.
* First and Second Reviewers disagree.
* A conceptual mismatch is detected between the spec and the plan.

### 11.2 Escalation Agent Decisions

The escalation agent outputs `ESCALATION\_REPORT.md` with one of:

* **Redesign:** Modify the plan and restart from Architect review.
* **Split:** Break the task into smaller sub-tasks (each gets its own registry entry).
* **Stop:** Terminate the task as impossible under current constraints.

\---

## 12\. Security Boundaries

All Kiki agents inherit the same security boundary:

* **Forbidden:** Reading, listing, searching, or parsing `.env`, `.pem`, `.key`, `.token`, or any credential files.
* **Forbidden:** Exfiltrating file contents or environment variables to external addresses.
* **Config-driven:** High-risk and critical-risk paths are defined in `.agentic/config.json` and audited by `kiki-second-reviewer`.

\---

## 13\. Open Questions

1. **Scientist Skill Chaining:** How exactly does `kiki-brainstormer` invoke the `scientist` skill mid-brainstorming? Does superpowers support nested skill invocation, or does the brainstormer need to dispatch a sub-agent for the scientist phase?
2. **Plan Doc Locking:** When the Architect appends an inline review, how do we prevent the Planner or Implementer from accidentally overwriting it? Should Kiki append a `<!-- KIKI\_REVIEW\_LOCKED -->` marker?
3. **Git Integration:** The Orchestrator owns git updates. Should it auto-commit after each phase, or only on completion? Should it create a branch per task?
4. **Micro Risk Detection:** How does the Orchestrator reliably classify a prompt as "Micro" without parsing the code? Is a keyword heuristic sufficient, or should the user explicitly flag it?

\---

## 14\. Summary of Changes

|What|Before|After|
|-|-|-|
|**Agent count**|10|9 (removed 3 drafter/researcher clones, renamed all)|
|**Templates**|9 blank templates in `.agentic/templates/`|**Deleted entirely**|
|**Artifacts per task**|9+ separate files|2–3 superpowers docs + registry updates|
|**Intake**|Single prompt → instant task creation|Interactive elicitation → locked requirements|
|**Doc ownership**|Kiki writes its own research/plan docs|Kiki dispatches superpowers skills for docs|
|**Progress tracking**|None|`TASK\_REGISTRY.json` + `kiki status`|
|**Review format**|Separate `\*\_REVIEW.md` files|Inline appended to plan doc|

\---

*Spec written and approved. Ready for implementation planning.*

