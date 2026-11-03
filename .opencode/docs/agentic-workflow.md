# Kiki Workflow

This document describes the Kiki software engineering pipeline enforced by the orchestrator agent.

## Pipeline Phases

### 1. Intake
The orchestrator asks clarifying questions one at a time until requirements are fully understood. No implementation begins before intake is complete.

### 2. Brainstorm
The orchestrator dispatches the `kiki-brainstormer` subagent. The brainstormer loads the superpowers `brainstorming` skill inline and produces a design spec at `docs/superpowers/specs/...`.

### 3. Plan
The orchestrator dispatches the `kiki-planner` subagent. The planner loads the superpowers `writing-plans` skill inline and produces an implementation plan at `docs/superpowers/plans/...`. Tasks in the plan include metadata: `risk`, `parallel`, and `depends_on`.

### 4. Architect Review
The orchestrator dispatches `kiki-reviewer` for architect review of the plan against `.agentic/kiki/alignment.json` guardrails. The reviewer appends an inline verdict to the plan document. The plan must pass this gate before implementation begins.

### 5. Implement
The orchestrator dispatches the appropriate implementation subagent via the `task` tool. UI/frontend/visual/layout/component/design tasks route to `kiki-gui-designer`, which loads `ui-ux-pro-max`, `executing-plans`, `test-driven-development`, and `systematic-debugging` skills inline. All other tasks (backend/logic/data/tooling) route to `kiki-implementer`, which loads `executing-plans` and `test-driven-development` skills inline. Either agent implements the tasks per the plan.

### 6. Review
The `kiki-reviewer` loads `receiving-code-review` or `requesting-code-review` inline and verifies plan adherence, security, code quality, test coverage, and parallelization logic. An inline verdict is appended to the plan.

### 7. Document
The orchestrator dispatches the `kiki-historian` subagent to update `README.md`, `CHANGELOG.md`, and any project docs in `docs/*` (excluding `docs/superpowers/*`), plus decisions in `docs/DECISIONS.md`.

### 8. Complete
The orchestrator updates `.agentic/kiki/TASK_REGISTRY.json` with the task status and any failure metrics.

## Task Registry Schema

TASK_REGISTRY entries use the descriptive schema:

```json
{
  "id": "short_task_id",
  "description": "One-sentence task description",
  "status": "pending | in_progress | completed | failed",
  "phase": "brainstorm | plan | plan-review | implement | implementation-review | document | complete",
  "failures": 0,
  "startedAt": "2026-07-01T00:00:00.000Z",
  "completedAt": "2026-07-01T01:00:00.000Z",
  "spec": "docs/superpowers/specs/example-design.md",
  "plan": "docs/superpowers/plans/example-plan.md",
  "reviewNotes": ["Only unresolved issue strings go here"],
  "documentation": {
    "status": "pending | not_required | completed",
    "reason": "Concrete explanation of the decision",
    "updatedFiles": ["README.md", "CHANGELOG.md"]
  }
}
```

Do not use `name`, `created_at`, `phases`, or `failure_count`. `reviewNotes` is an array of unresolved issue strings only; remove fixed findings instead of preserving them as history.

## Documentation Completion Gate

Every task begins with `documentation.status` set to `pending`. The `not_required` status is allowed only for a local internal change and requires a concrete reason recorded in the registry. In all other cases, dispatch `kiki-historian` to update the documentation. When the historian returns, set `documentation.status` to `completed` and record the updated files in `updatedFiles`, or an empty list if no files changed. Completion is forbidden while documentation.status is `pending`.

## Role-Level Model Routing

Model selection is one model per Kiki role. Edit the `agents` map in `.agentic/kiki/routing.json`, then run `kiki routing` to sync those models into `.opencode/agents/kiki-*.md` frontmatter.

Example:

```json
{
  "agents": {
    "kiki-orchestrator": "openrouter/z-ai/glm-5.2",
    "kiki-brainstormer": "openrouter/z-ai/glm-5.2",
    "kiki-planner": "openrouter/z-ai/glm-5.2",
    "kiki-implementer": "deepseek/deepseek-v4-pro",
    "kiki-gui-designer": "openrouter/z-ai/glm-5.2",
    "kiki-reviewer": "openrouter/z-ai/glm-5.2",
    "kiki-escalation": "anthropic/claude-sonnet-5",
    "kiki-historian": "deepseek/deepseek-v4-pro"
  }
}
```

Use `kiki routing --check` in CI or before dispatching subagents to verify the OpenCode agent files match the central routing file.
