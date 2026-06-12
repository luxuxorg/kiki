export const WORKFLOW = `# Kiki Agentic Development Workflow — Reusable Operating Manual

This is the canonical operating manual for the Kiki multi-agent development workflow. The **Orchestrator** agent reads this document at the start of every task. All other agents are dispatched as subagents and follow their own role-based descriptions in \`.opencode/agents/\`.

This workflow converts a user request into a validated design spec, execution plan, implementation, and review. Quality is guaranteed by separating concerns into distinct roles with strict artifact-based handoffs.

---

## 1. Roles & Config-Driven Models

All subagents are model-agnostic. The Orchestrator dynamically configures each subagent by hot-patching the \`model:\` frontmatter parameter before dispatching, reading assignments from \`.opencode/models.json\`:

| Phase | Agent File | Default Model | Invokes Superpowers Skill | Produces |
|---|---|---|---|---|
| Orchestration | \`kiki-orchestrator.md\` | \`google/gemini-3.5-flash\` | None (router) | State, routing logs, registry |
| Brainstorm | \`kiki-brainstormer.md\` | \`deepseek/deepseek-v4-pro\` | \`brainstorming\` (+ optional \`scientist\`) | \`docs/superpowers/specs/...-design.md\` |
| Plan | \`kiki-planner.md\` | \`moonshotai/kimi-k2.6\` | \`writing-plans\` | \`docs/superpowers/plans/...-plan.md\` |
| Architecture | \`kiki-architect.md\` | \`anthropic/claude-opus-4-8\` | None (Kiki gate) | Inline review on plan doc |
| Implementation | \`kiki-implementation-standard.md\` | \`deepseek/deepseek-v4-pro\` | \`executing-plans\` + TDD | Source code, tests |
| Complexity fallback | \`kiki-implementation-complexity.md\` | \`anthropic/claude-opus-4-8\` | Same | Source code, tests |
| First review | \`kiki-first-reviewer.md\` | \`moonshotai/kimi-k2.6\` | None (Kiki gate) | Inline verdict on plan doc |
| Second review | \`kiki-second-reviewer.md\` | \`anthropic/claude-opus-4-8\` | None (Kiki gate) | Inline verdict on plan doc |
| Escalation | \`kiki-escalation-agent.md\` | \`anthropic/claude-opus-4-8\` | None (Kiki gate) | \`ESCALATION_REPORT.md\` |

### Dynamic Hot-Patching Algorithm:
Before calling any subagent:
1. Load \`.opencode/models.json\`.
2. Extract the \`primary\` model for the role. (If a fallback is triggered, extract the \`fallback\` model).
3. If the task is High/Critical risk, or has looped twice, check if an \`escalation\` model is defined and use that instead.
4. Overwrite the \`model:\` parameter in the subagent's \`.opencode/agents/<agent_name>.md\` frontmatter.
5. Save the file and execute the subagent via the \`task\` tool.

---

## 2. Config-Driven Project Setup

Kiki reads its operational parameters from the project root:

1. **\`.agentic/config.json\` (Tech Stack & Risks):** Contains the project's build, test, and lint commands, alongside high-risk and critical-risk file boundaries.
2. **\`.agentic/alignment.json\` (Guardrails & Compliance):** Contains customized business, security, or product guardrails that the Architect and Second Reviewer must audit against.
3. **\`.agentic/TASK_REGISTRY.json\` (Progress Tracking):** Machine-readable registry of all tasks, their phases, and superpowers doc references.

---

## 3. Interactive Intake

Before creating a task directory, the Orchestrator engages in a clarifying conversation with the user. The Orchestrator must:

1. Confirm the core intent and scope of the request.
2. Identify any implicit assumptions or ambiguities in the user's prompt.
3. Ask targeted follow-up questions until the task is unambiguous.
4. Capture the refined request as \`user_request.md\` in the task's input directory.

Only after the intake conversation converges does the Orchestrator create the task directory and begin routing.

---

## 4. Superpowers Discovery Gate

Before dispatching any agent, the Orchestrator checks for existing superpowers documentation that may already cover the task:

1. Scan \`docs/superpowers/specs/\` for existing design documents relevant to the current request.
2. Scan \`docs/superpowers/plans/\` for existing approved plans.
3. If relevant superpowers docs exist, present them to the user and confirm whether to reuse, extend, or replace.
4. Skip redundant agents when existing docs provide sufficient coverage (e.g., skip brainstormer if a matching spec already exists, skip planner if a matching plan already exists).

---

## 5. Task Directory & Ephemeral State

Every task gets a unique gitignored task folder under \`.agentic/tasks/<TASK_ID>/\` with the following structure:

\`\`\`
.agentic/
  TASK_REGISTRY.json
  tasks/<TASK_ID>/
    input/
      user_request.md
    state/
      orchestrator_state.json
      routing_log.jsonl
    diffs/
      implementation.diff
    tests/
      test_results.txt
\`\`\`

No templates directory. All design docs live under \`docs/superpowers/\`.

---

## 6. Risk Classification

The Orchestrator classifies every task's risk before planning by comparing the requested or affected files against the rules in \`.agentic/config.json\`:

| Risk Level | File Pattern / Code Path | Actions Needed |
|---|---|---|
| **Micro** | Typo fixes, localization, minor copy changes, single-line self-contained adjustments | Direct-Fix eligible. Skips brainstorm, plan, and architecture. |
| **Low** | Readme, local helper copy, simple self-contained documentation | Fast-path eligible, skips Second Review. |
| **Medium** | Single-module additions, minor business logic updates | Standard path, skips Second Review unless test failures occur. |
| **High** | Files matching \`high_risk_paths\` (e.g. auth, databases, schemas) | **Opus Second Review is mandatory.** |
| **Critical** | Files matching \`critical_risk_paths\` (e.g. security boundaries, billing) | **Opus Second Review and Escalation check are mandatory.** |

---

## 7. Standard Routing Rules

The pipeline executes strictly in order:

\`\`\`
Intake
  → kiki-brainstormer (docs/superpowers/specs/...-design.md)
  → kiki-planner (docs/superpowers/plans/...-plan.md)
  → kiki-architect (inline review on plan doc)
  → kiki-implementation-standard (code + tests)
  → kiki-first-reviewer (inline verdict on plan doc)
  → [kiki-second-reviewer if required]
  → completed
\`\`\`

### Micro / Direct-Fix Path (Ultra-Lightweight):
For tasks classified as **Micro** (typo fixes, UI copy tweaks, simple config adjustments), the Orchestrator executes a streamlined, ultra-lightweight path:
\`\`\`
Intake ──► kiki-implementation-standard (code) ──► kiki-first-reviewer ──► completed
\`\`\`
This path completely skips Brainstorm, Plan, and Architecture gates, creating only \`user_request.md\` as a file. kiki-first-reviewer still executes the project build/test scripts to ensure zero compilation or logical regressions occur.

### Routing State Table (for Standard/Fast Path):
- If no spec in \`docs/superpowers/specs/\`: Route to \`kiki-brainstormer\`.
- If spec exists but no plan in \`docs/superpowers/plans/\`: Route to \`kiki-planner\`.
- If plan exists but no architecture review (and not on an authorized fast-path): Route to \`kiki-architect\`.
- If architect rejects: Route back to \`kiki-planner\` with changes noted.
- If architect approves: Route to \`kiki-implementation-standard\`.
- If implementation complete: Route to \`kiki-first-reviewer\`.
- If first-reviewer approves AND risk is Low/Medium: Complete task.
- If first-reviewer requires second review, OR risk is High/Critical: Route to \`kiki-second-reviewer\`.
- If any review fails or requests revision: Route back to \`kiki-implementation-standard\` (increment \`implementation_attempts\`).
- If loops fail twice (\`implementation_attempts >= 2\`) OR conceptual plan discrepancies occur: Route to \`kiki-escalation-agent\`.

---

## 8. Complexity Fallback (§9)

If the standard implementation agent fails or reports \`BLOCKED\` with reason \`COMPLEXITY\` (dense generics, async flows, complex state logic) but the plan remains sound, the Orchestrator routes the identical scope to **\`kiki-implementation-complexity\`** (a premium reasoning model) without re-planning.

---

## 9. Inline Review Format

Architecture reviews, first reviews, and second reviews are appended inline to the plan doc (\`docs/superpowers/plans/...-plan.md\`) rather than written as separate files. Each review uses the following format:

\`\`\`markdown
---
## Kiki Review: <Role> — <Date>
**Decision:** APPROVED / APPROVED_WITH_CHANGES / REJECTED
...
---
\`\`\`

Multiple reviews stack sequentially within the same plan doc. The Orchestrator parses the latest review block to determine routing.

The escalation agent is the exception: it writes a standalone \`ESCALATION_REPORT.md\` in the task directory.

---

## 10. Quality Gates (Rejections)

The Orchestrator must reject and re-dispatch when subagents output subpar artifacts:
- **Design Spec:** Requirements not cleanly enumerated; high-risk paths not flagged.
- **Execution Plan:** Missing pseudocode, missing requirement-to-subtask matrix, or lacking test matrices.
- **Implementation:** No tests written, code is out of scope, or contains placeholders.
- **Reviews:** Build/test commands weren't executed, or logs were omitted.

---

## 11. Completion

Upon successful completion, the Orchestrator writes \`FINAL_SUMMARY.md\` detailing the files changed, requirement coverage, and review results, leaving modifications uncommitted in the workspace for final user confirmation. If the superpowers workflow already provides sufficient closure (inline reviews document coverage and approval), the Orchestrator may skip writing \`FINAL_SUMMARY.md\`.
`;
