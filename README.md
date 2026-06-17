# Kiki — Static-Routing Dev Pipeline for OpenCode

Kiki is a CLI tool and OpenCode plugin that adds a disciplined, multi-agent development pipeline to any project. It scaffolds a set of role-based subagents (orchestrator, brainstormer, planner, implementer, reviewer, etc.) and routes each one to the best model for its domain and risk level — all from static configuration, with no runtime model guessing.

## Installation

```bash
git clone https://github.com/luxuxorg/kiki.git
cd kiki
npm install && npm run build && npm link
```

Requires **Node >= 18**.

## CLI Commands

### `kiki init [path]`

Scaffolds a Kiki installation in the given directory (defaults to `.`). Creates two directories:

| Directory | Contents |
|---|---|
| `.agentic/` | `config.json`, `alignment.json`, `routing.json`, `TASK_REGISTRY.json` |
| `.opencode/` | `agents/` (7 subagents), `plugins/kiki.ts`, `package.json`, `docs/agentic-workflow.md` |

### `kiki update [path]`

Updates an existing Kiki installation:

- **Overwrites** `.opencode/` templates fresh (agents, plugin, workflow docs)
- **Smart-merges** `.agentic/routing.json`, `config.json`, `alignment.json` — preserves user overrides, adds new defaults, removes stale keys
- **Never touches** `TASK_REGISTRY.json`

### `kiki status`

Prints a summary of the task registry and current routing configuration.

### `kiki verify <file>`

Scans a markdown file for unfinished work: `TODO`, `TBD`, `placeholder`, unchecked checklist items, and other placeholders.

## Configuration Files

All in `.agentic/`:

### `config.json` — Project metadata and risk paths

```json
{
  "projectName": "my-project",
  "language": "typescript",
  "commands": {
    "build": "npm run build",
    "test": "npm test",
    "lint": "npm run lint"
  },
  "riskMatrix": {
    "highRiskPaths": ["src/auth/", "src/db/schema.ts"],
    "criticalRiskPaths": ["src/security/", "migrations/"]
  }
}
```

### `routing.json` — Static model routing table

Maps `skill:domain` pairs to model IDs, with an optional critical-risk override:

```json
{
  "rules": {
    "brainstorming:gui": { "standard": "anthropic/claude-sonnet-4.6" },
    "brainstorming:security": {
      "standard": "deepseek/deepseek-v4-pro",
      "critical": "anthropic/claude-sonnet-4.6"
    }
  }
}
```

### `alignment.json` — Guardrails and compliance standards

```json
{
  "guardrails": [
    "No hardcoded secrets in source code",
    "All database queries must use parameterized statements"
  ],
  "compliance": ["OWASP Top 10", "SOC 2 Type II"]
}
```

### `TASK_REGISTRY.json` — Task tracking

Created by `kiki init`, updated by the orchestrator as tasks move through the pipeline.

## Subagents

Seven role-based subagents live in `.opencode/agents/`:

| Agent | Role |
|---|---|
| `kiki-orchestrator` | **Coordination-only.** Dispatches subagents via the `task` tool. Never writes code, edits files, or runs commands. Follows an 8-step pipeline: Intake → Brainstorm → Plan → Architect Review → Implement → Review → Document → Complete |
| `kiki-brainstormer` | Produces design specs using the superpowers brainstorming skill. Writes to `docs/superpowers/specs/` |
| `kiki-planner` | Writes implementation plans using the superpowers writing-plans skill. Writes to `docs/superpowers/plans/` |
| `kiki-implementer` | Implements code per the approved plan using executing-plans + test-driven-development (TDD) |
| `kiki-reviewer` | Read-only code and security review against the approved plan |
| `kiki-escalation` | Diagnoses pipeline failures and recommends: Redesign, Split, or Stop |
| `kiki-historian` | Maintains `README.md`, `CHANGELOG.md`, and project docs |

### Delegate Mode

The orchestrator is **coordination-only** — enforced through its prompt. It does not write code, edit files, or run commands. Its sole job is dispatching the correct subagent via the `task` tool.

## Kiki Plugin

The plugin at `.opencode/plugins/kiki.ts` is self-contained (zero external dependencies). It:

- Intercepts `task` tool calls for Kiki subagent types
- Routes each subagent to the correct model based on `skill + domain + risk`
- Uses static routing from `.agentic/routing.json`
- Logs routing decisions to `.agentic/routing_log.jsonl`

## Smart-Merge on Update

`kiki update` merges the three config files intelligently:

- **Preserves** any user-modified values as overrides
- **Adds** new default keys and routing rules that don't exist locally
- **Removes** keys and rules no longer present in the defaults

This means you can customize your routing table, guardrails, and project config without losing those changes when Kiki itself updates.

## Superpowers Integration

Kiki relies on superpowers skills loaded at runtime by the subagents:

- `brainstorming` — design exploration
- `writing-plans` — implementation planning
- `executing-plans` — structured implementation
- `test-driven-development` — TDD workflow
- `requesting-code-review` / `receiving-code-review` — review gates

## Tech Stack

- **Language:** TypeScript, compiled to JavaScript in `dist/`
- **Tests:** Vitest (63 tests across CLI, core, integration)
- **Runtime:** Node >= 18
- **License:** MIT
