# Kiki Hard Reset — Back to Three Pillars

**Date:** 2026-07-01
**Status:** Approved (pending spec review)

## Motivation

Kiki grew beyond its original purpose. It was built for three reasons:

1. Enable sub-agents with different models.
2. Have better documentation scaffolding.
3. Have more checks (plan review, linting, tests).

All process smartness was always meant to come from Superpowers skills. Over time Kiki accumulated dynamic domain/risk routing, a task-locking stabilizer, legacy compatibility layers, a task registry system, and complex plugin fallback logic. This made Kiki a second process system that competes with Superpowers instead of a thin harness around it.

This reset strips Kiki back to its original product boundary.

## Product Definition

> Kiki is an OpenCode safety harness for Superpowers: it installs disciplined subagents with role-specific models, project documentation, and preflight checks, while Superpowers supplies the actual engineering workflow.

### Two Usage Modes

- **Lightweight mode:** Talk to the main OpenCode assistant directly. It loads Superpowers skills inline and does the work. Good for single-file fixes, small features, quick tasks, exploration.
- **Kiki mode:** Dispatch `@kiki-orchestrator`. It enforces the full pipeline: intake → brainstorm → plan → plan-review → implement → implementation-review → document → complete, with role-specific models and doctor checks. Good for multi-file features, architectural changes, anything risky.

The orchestrator is a mode switch, not a mandatory coordinator. Kiki's other agents are only dispatched by the orchestrator.

## The Three Pillars

### Pillar 1 — Model Routing

One role, one model. No dynamic domain/risk classification in the plugin.

`StaticRoutingTable` becomes:

```typescript
interface StaticRoutingTable {
  agents: Record<string, string>;
}
```

No `rules` map. No `skill:domain` keys. No `critical` override.

`routing-table.ts` simplifies to:
- `loadRoutingTable(path)` — read JSON
- `saveRoutingTable(path, table)` — write JSON
- `lookupAgentModel(table, agentName)` — return `table.agents[agentName]` or null
- `mergeRoutingTables(project, global)` — merge `agents` maps only

`routing.ts` stays as-is: syncs `agents` map into `.opencode/agents/kiki-*.md` frontmatter.

The plugin becomes a thin logger (~20 lines):
- On `tool.execute.before` for `task` tool
- If `subagent_type` starts with `kiki-`
- Append a routing decision entry to `.agentic/routing_log.jsonl`
- Return (no model injection — frontmatter is source of truth)

### Pillar 2 — Documentation Scaffolding

`config.ts` keeps:
- `KikiConfig`, `KikiPaths`, `KikiModels`, `DEFAULT_PATHS`, `DEFAULT_MODELS`, `DEFAULT_ALIGNMENT`
- `generateAgentTemplate()`, `generatePluginTemplate()`, `generateWorkflowTemplate()`
- `loadConfig()`, `writeOpencodeFiles()`, `writeAgenticFiles()`, `ensurePathExists()`
- `DEFAULT_ROUTING_TABLE` — simplified to `agents` map only

`init.ts` keeps:
- Wizard, path setup, config/routing/alignment generation
- Drops legacy `.agentic/` writes and `migrateLegacyConfig`

`install.ts` keeps:
- Global install (agents + plugin + defaults)
- Project install (wizard + write config/routing/alignment)
- Drops `migrateLegacyConfig`

`update.ts` keeps:
- Regenerate `.opencode/` files from config
- Drops dual-layout merge machinery (`mergeConfigSources`, `mergeRoutingSection`, `smartMerge`)

### Pillar 3 — Safety Checks

`doctor.ts` keeps:
- Config field validation
- Paths existence checks
- Models non-empty validation
- Routing `agents` map presence + non-empty models
- Expected agent files present
- Orchestrator "no permission block" safety check
- Drops TASK_REGISTRY schema checks and deprecated-field validation

`routing.ts --check` stays as-is: verifies frontmatter matches `routing.json` without writing.

`verify.ts` stays as-is: scans files for placeholders (TBD/TODO/FIXME/etc.) and exits 1 on match.

`status.ts` keeps:
- Global install state
- Project state (modern layout only)
- Routing agents summary
- Drops TASK_REGISTRY counts and legacy layout detection

## Agent Roster

Agents are thin Superpowers wrappers. Each loads the relevant skill and follows it exactly.

| Agent | Role | Superpowers Skills |
|---|---|---|
| `kiki-orchestrator` | Pipeline + dispatch | `agentic-workflow.md` (generated) |
| `kiki-brainstormer` | Design specs | `brainstorming` |
| `kiki-planner` | Implementation plans | `writing-plans` |
| `kiki-implementer` | Backend/logic code | `executing-plans` + `test-driven-development` + `systematic-debugging` |
| `kiki-gui-designer` | UI/UX design + implementation | `ui-ux-pro-max` + `executing-plans` + `test-driven-development` + `systematic-debugging` |
| `kiki-reviewer` | Code/plan review | `requesting-code-review` / `receiving-code-review` |
| `kiki-historian` | Docs + changelog | — |
| `kiki-escalation` | Diagnose failures | `systematic-debugging` |

### Orchestrator Dispatch Rules

The orchestrator decides which specialist to dispatch based on task type:

- UI/frontend/visual/layout/component/design task → `@kiki-gui-designer`
- Backend/logic/data/tooling task → `@kiki-implementer`
- Design/spec phase → `@kiki-brainstormer`
- Planning phase → `@kiki-planner`
- Review phase → `@kiki-reviewer`
- Documentation phase → `@kiki-historian`
- Failure diagnosis → `@kiki-escalation`

This classification lives in the orchestrator prompt, not in plugin code.

### Agent Prompt Patterns

**`kiki-orchestrator`:**
> You are the Kiki Orchestrator. You are COORDINATION-ONLY. You do not write code. You dispatch specialist agents via the `task` tool and enforce the pipeline in `.opencode/docs/agentic-workflow.md`. Agent models come from `.agentic/kiki/routing.json` after `kiki routing` syncs them into OpenCode agent frontmatter.

**`kiki-implementer`:**
> You are the Kiki Implementer. Load the `executing-plans`, `test-driven-development`, and `systematic-debugging` skills. Follow them exactly. Implement tasks from the approved plan. Write tests first. Debug systematically before claiming work is complete. Verify before claiming completion.

**`kiki-gui-designer`:**
> You are the Kiki GUI Designer. You own UI/UX design and implementation end-to-end. Load the `ui-ux-pro-max` skill for design intelligence, the `executing-plans` skill for plan execution discipline, the `test-driven-development` skill for implementation, and the `systematic-debugging` skill for when things break. Follow all four exactly. Produce both design direction and working frontend code. Do not split visual work from implementation.

## What Gets Removed

### Core modules deleted entirely:
- `src/core/domain-classifier.ts` + tests
- `src/core/risk-classifier.ts` + tests
- `src/core/stabilizer.ts` + tests
- `src/core/path-resolver.ts` + tests

### Types removed from `src/types.ts`:
- `Domain`, `Risk`, `TaskStatus`, `TaskRegistryEntry`
- `riskMatrix` from `KikiConfig`
- `critical` from `StaticRoutingRule`
- `domain`/`risk` from `RoutingLogEntry`
- `rules` skill×domain matrix from `StaticRoutingTable` (keep only `agents`)

### CLI behavior removed:
- Legacy `.agentic/` root fallback everywhere
- `migrateLegacyConfig` in install.ts
- Dual-layout writes in update.ts and init.ts legacy branch
- TASK_REGISTRY reads in status.ts and doctor.ts
- Deprecated-field schema checks in doctor.ts

### Plugin logic removed:
- `SUBAGENT_TYPE_TO_SKILL` + `classifyDomain`
- `classifyRisk` + `riskMatrix` reading
- `loadStabilizerState` / `getLockedModel` / `lockTaskModel`
- `findFallbackModel` 3-tier fallback
- `resolveKikiFile` legacy path probing
- Inline duplication of core modules inside `generatePluginTemplate()` in `config.ts` (the function stays, but its content becomes the thin logger template)

### Test files deleted:
- `tests/core/domain-classifier.test.ts`
- `tests/core/risk-classifier.test.ts`
- `tests/core/stabilizer.test.ts`
- `tests/core/path-resolver.test.ts`

### Test files updated (not deleted):
- `tests/types.test.ts` — remove stripped types
- `tests/core/routing-table.test.ts` — simplify to `agents` map only
- `tests/integration/routing-pipeline.test.ts` — simplify to role-based lookup + logging
- `tests/cli/status.test.ts` — drop registry counts and legacy detection
- `tests/cli/update.test.ts` — drop dual-layout merge tests
- `tests/cli/init.test.ts` — drop legacy branch tests
- `tests/cli/routing.test.ts` — stays as-is
- `tests/cli/doctor.test.ts` — drop registry schema tests
- `tests/cli/install.test.ts` — drop migration tests
- `tests/cli/verify.test.ts` — stays as-is

## Migration Impact

This is a breaking change for existing Kiki projects (e.g., noema).

- `routing.json` `rules` map is tolerated but ignored. Only `agents` map is used.
- `.agentic/routing_log.jsonl` format changes (no `domain`/`risk` fields).
- TASK_REGISTRY.json is no longer validated or read by Kiki.
- Legacy `.agentic/` root files are no longer supported.

Migration steps for existing projects:
1. Run `kiki update` to regenerate slim `.opencode/` files.
2. Remove `.agentic/TASK_REGISTRY.json` if it exists (or leave it; Kiki ignores it).
3. Remove legacy `.agentic/config.json` / `.agentic/routing.json` if they exist at root level.

## Success Criteria

- Kiki source is significantly smaller and simpler.
- No dynamic domain/risk/stabilizer logic remains.
- Plugin is ~20 lines (thin logger only).
- All process discipline comes from Superpowers skills loaded by agents.
- `kiki routing`, `kiki doctor`, `kiki verify` work on slim config.
- `kiki install` and `kiki init` produce clean modern-layout projects.
- All tests pass.
- noema validates cleanly with the slim CLI.
