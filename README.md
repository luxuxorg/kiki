# Kiki v2.0.0 — OpenCode Agent Orchestration

Kiki is a CLI tool and OpenCode plugin that adds a disciplined, multi-agent development pipeline to any project. It scaffolds a set of role-based subagents (orchestrator, brainstormer, planner, implementer, reviewer, etc.) and routes each one to the best model for its domain and risk level — all from static configuration, with no runtime model guessing.

## Installation

Install directly from GitHub (one-liner):

```bash
curl -sL https://github.com/luxuxorg/kiki/archive/main.tar.gz | tar xz -C /tmp && npm install -g /tmp/kiki-main
```

Or clone and install locally:

```bash
git clone https://github.com/luxuxorg/kiki.git
cd kiki
npm install && npm install -g .
```

> **Note:** `npm install -g github:luxuxorg/kiki` does not work due to a bug in npm 11's git dependency preparation (creates broken symlinks). Use one of the methods above.

Requires **Node >= 18**.

## CLI Commands

### `kiki init [path]`

Scaffolds a Kiki installation in the given directory (defaults to `.`). Starts an **interactive wizard** that asks about:

- Project name, language, source/tests/docs paths
- Changelog, decisions, and knowledge base paths (with option to create them)
- Standard and critical models
- Build, test, and lint commands

Creates two directories:

| Directory | Contents |
|---|---|
| `.agentic/` | `config.json`, `alignment.json`, `routing.json`, `TASK_REGISTRY.json` |
| `.opencode/` | `agents/` (7 subagents), `plugins/kiki.ts`, `package.json`, `docs/agentic-workflow.md` |

To skip the wizard and use defaults:

```bash
# Not yet implemented — always uses wizard
```

### `kiki update [path]`

Updates an existing Kiki installation:

- **Overwrites** `.opencode/` templates fresh (agents, plugin, workflow docs) — regenerated from your `config.json` paths
- **Smart-merges** `.agentic/routing.json`, `config.json`, `alignment.json` — preserves user overrides, adds new defaults, removes stale keys
- **Never touches** `TASK_REGISTRY.json`

### `kiki doctor [path]`

Validates a Kiki installation:

- Config fields (projectName, commands, paths customized)
- All paths exist
- Models are set
- Routing rules are valid
- Agent files are present
- Orchestrator has no `permission:` blocks (OpenCode safety check)

Reports pass/fail for each check and exits with code 1 if anything is broken.

### `kiki status`

Prints a summary of the task registry and current routing configuration.

### `kiki verify <file>`

Scans a markdown file for unfinished work: `TODO`, `TBD`, `placeholder`, unchecked checklist items, and other placeholders.

## Configuration Files

All in `.agentic/`:

### `config.json` — Project configuration

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
  },
  "paths": {
    "source": "src/",
    "tests": "tests/",
    "docs": "docs/",
    "superpowers": "docs/superpowers/",
    "specs": "docs/superpowers/specs/",
    "plans": "docs/superpowers/plans/",
    "changelog": "CHANGELOG.md",
    "readme": "README.md",
    "decisions": ".opencode/docs/decisions.md",
    "knowledge": "docs/knowledge/",
    "taskRegistry": ".agentic/TASK_REGISTRY.json"
  },
  "models": {
    "standard": "moonshotai/kimi-k2.6",
    "critical": "anthropic/claude-sonnet-4.6"
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
| `kiki-historian` | Maintains `README.md`, `CHANGELOG.md`, decisions, knowledge base, and project docs |

### Delegate Mode

The orchestrator is **coordination-only** — enforced through its prompt. It does not write code, edit files, or run commands. Its sole job is dispatching the correct subagent via the `task` tool.

### Parallel Task Execution

The orchestrator can dispatch independent tasks in parallel using **wave-based execution**:

- Tasks include metadata: `risk` ('low' | 'medium' | 'high'), `parallel` (boolean), and `depends_on` (string[])
- The planner defines these fields in each task's **Metadata** subsection
- The orchestrator groups tasks into waves: Wave 0 has no dependencies, Wave N waits for all `depends_on` tasks to complete
- Tasks with `parallel: true` run concurrently in the same wave; `parallel: false` tasks run alone
- Circular dependencies are detected and fall back to sequential execution

The reviewer validates parallelization logic: no circular dependencies, all `depends_on` references exist, parallel tasks don't modify the same files, and sequential tasks are properly isolated.

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
