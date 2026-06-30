# Global Kiki Installation Design Spec

**Date:** 2026-06-30  
**Status:** Draft — pending review  
**Related:** Kiki v2.1.0, OpenCode plugin system v1.15.13

\---

## Problem Statement

Kiki is currently a per-project framework. Every new project requires running `kiki init`, which scaffolds `.opencode/agents/`, `.opencode/plugins/`, and `.agentic/` directories. This creates friction:

* Users must remember to run `kiki init` in every project
* Agent definitions are duplicated across projects
* Plugin updates require running `kiki update` in every project
* There is no concept of a "baseline" Kiki setup that Just Works everywhere

**Goal:** Make Kiki available OpenCode-wide — installed once globally, active in every project, with per-project overrides for configuration and selective agent customization.

\---

## Design Overview

### Philosophy

* **Global by default:** After one installation, Kiki works in any OpenCode project
* **Per-project override:** Projects can customize routing, guardrails, and individual agents
* **Backward compatible:** Existing `.agentic/` root files continue working
* **Minimal per-project footprint:** `kiki init` only creates `.agentic/kiki/` config files

### Directory Structure

```
# GLOBAL (one-time install)
\~/.config/opencode/
├── agents/
│   ├── kiki-orchestrator.md      # mode: primary
│   ├── kiki-brainstormer.md      # mode: subagent
│   ├── kiki-planner.md
│   ├── kiki-implementer.md
│   ├── kiki-reviewer.md
│   ├── kiki-escalation.md
│   └── kiki-historian.md
├── plugins/
│   └── kiki.ts                   # model routing plugin
└── kiki/
    └── defaults/
        ├── routing.json          # baseline routing table
        └── alignment.json        # baseline guardrails

# PER-PROJECT (lightweight init)
<project-root>/
├── .agentic/
│   └── kiki/
│       ├── config.json           # project paths, commands, models
│       ├── routing.json          # project routing overrides
│       ├── alignment.json        # project guardrails
│       ├── TASK\_REGISTRY.json    # task tracking
│       └── reviews/              # review output
│
├── .opencode/
│   └── agents/                   # OPTIONAL per-project overrides
│       └── kiki-reviewer.md      # shadows global reviewer
│
└── src/                          # project source
```

### CLI Changes

#### Unified `kiki install` Command

Replaces the separate `kiki init` and `kiki update` commands with a single `install` command.

```bash
# Global install (default) — installs to \~/.config/opencode/
kiki install

# Per-project install (legacy behavior) — scaffolds .agentic/kiki/ in <path>
kiki install --project ./my-project

# Update global installation to latest version
kiki install --global --force

# Update per-project config in current directory
kiki install --project . --force
```

**Behavior:**

|Command|Action|
|-|-|
|`kiki install`|Installs agents, plugin, and defaults to `\~/.config/opencode/`|
|`kiki install --project <path>`|Creates `.agentic/kiki/` in `<path>`, runs wizard for config|
|`kiki install --global`|Alias for `kiki install` (explicit global)|
|`kiki install --force`|Overwrites existing files (for updates)|
|`kiki install --project <path> --force`|Overwrites existing `.agentic/kiki/` files|

**Backward compatibility:**

* `kiki init \[path]` is preserved as an alias for `kiki install --project \[path]`
* `kiki update \[path]` is preserved as an alias for `kiki install --project \[path] --force`



\---

## Detailed Design

### 1\. Global Installation Target

The global installation copies files to OpenCode's standard configuration directories:

* **Agents:** `\~/.config/opencode/agents/`
* **Plugins:** `\~/.config/opencode/plugins/`
* **Defaults:** `\~/.config/opencode/kiki/defaults/`

OpenCode automatically loads global plugins and agents for all projects. No per-project configuration is required for the plugin to function.

### 2\. Per-Project Configuration

When `kiki install --project <path>` is run, it creates:

```
.agentic/kiki/
├── config.json          # project-specific paths, commands, models
├── routing.json         # empty or pre-filled with global defaults
├── alignment.json       # empty or pre-filled with global defaults
└── TASK\_REGISTRY.json   # {"tasks": \[]}
```

The wizard asks for:

* Project name
* Language (typescript/python/other)
* Source/tests/docs directories
* Build/test/lint/security commands
* Standard and critical models

If `--force` is passed, existing files are smart-merged (preserving user changes, adding new keys).

### 3\. Plugin Path Resolution

The plugin resolves configuration files in this order:

|File|Priority 1|Priority 2|Priority 3|
|-|-|-|-|
|`config.json`|`.agentic/kiki/`|`.agentic/` (legacy)|`\~/.config/opencode/kiki/defaults/`|
|`routing.json`|`.agentic/kiki/`|`.agentic/` (legacy)|`\~/.config/opencode/kiki/defaults/`|
|`alignment.json`|`.agentic/kiki/`|`.agentic/` (legacy)|`\~/.config/opencode/kiki/defaults/`|
|`TASK\_REGISTRY.json`|`.agentic/kiki/`|`.agentic/` (legacy)|create new|

**Resolution logic:**

1. Check `.agentic/kiki/<file>` — if exists, use it
2. Check `.agentic/<file>` — if exists, use it (legacy fallback)
3. Check `\~/.config/opencode/kiki/defaults/<file>` — if exists, use it
4. For `config.json`: use hardcoded `DEFAULT\_CONFIG`
5. For `routing.json`: use hardcoded `DEFAULT\_ROUTING\_TABLE`
6. For `alignment.json`: use hardcoded `DEFAULT\_ALIGNMENT`
7. For `TASK\_REGISTRY.json`: create `{"tasks": \[]}`

### 4\. Routing Table Merge

When both project and global routing tables exist, they are merged:

```typescript
function mergeRoutingTables(
  project: StaticRoutingTable | null,
  global: StaticRoutingTable | null
): StaticRoutingTable {
  const result: StaticRoutingTable = { rules: {} };

  // Start with global rules
  if (global) {
    Object.assign(result.rules, global.rules);
  }

  // Project rules override global
  if (project) {
    Object.assign(result.rules, project.rules);
  }

  return result;
}
```

This means:

* A project's `routing.json` only needs to contain rules it wants to override
* Global defaults fill in the gaps
* Users can delete rules from their project routing to fall back to global

### 5\. Agent Override Mechanism

OpenCode's native agent loading follows this priority:

1. `\~/.config/opencode/agents/<name>.md` (global)
2. `.opencode/agents/<name>.md` (project-local)

A project can override any Kiki subagent by placing a file with the same name in `.opencode/agents/`:

```bash
# Global reviewer is used by default
\~/.config/opencode/agents/kiki-reviewer.md

# Project-specific reviewer overrides global
./my-project/.opencode/agents/kiki-reviewer.md
```

This requires no plugin code — it's OpenCode's built-in behavior.

### 6\. Per-Project Reviews Directory

Review output goes to `.agentic/kiki/reviews/`:

```
.agentic/kiki/
└── reviews/
    ├── 2026-06-30-feature-x-review.md
    └── 2026-06-30-security-audit.md
```

The plugin creates this directory on first use.

\---

## Implementation Plan

### Phase 1: Refactor Path Constants

* Extract all hardcoded `.agentic/` paths into a configurable resolver
* Add `AGENTIC\_KIKI\_DIR = '.agentic/kiki/'` constant
* Add `GLOBAL\_KIKI\_DIR = '\~/.config/opencode/kiki/defaults/'` constant
* Update `ROUTING\_PATH` default to `.agentic/kiki/routing.json`

### Phase 2: Implement Path Resolver

```typescript
function resolveKikiFile(
  filename: string,
  projectRoot: string
): string {
  // Priority 1: .agentic/kiki/
  const kikiPath = join(projectRoot, '.agentic', 'kiki', filename);
  if (existsSync(kikiPath)) return kikiPath;

  // Priority 2: .agentic/ (legacy)
  const legacyPath = join(projectRoot, '.agentic', filename);
  if (existsSync(legacyPath)) return legacyPath;

  // Priority 3: global defaults
  const globalPath = join(homedir(), '.config', 'opencode', 'kiki', 'defaults', filename);
  if (existsSync(globalPath)) return globalPath;

  // Fallback: return kiki path (will be created)
  return kikiPath;
}
```

### Phase 3: Update CLI Commands

* Rename `init.ts` command to `install.ts`
* Add `--project <path>` flag (default: no flag = global install)
* Add `--force` flag for overwriting
* Add `--global` flag (explicit global, no-op if no project flag)
* Preserve `init` and `update` as aliases for backward compatibility
* `status` command updated to show global vs project state

### Phase 4: Update Plugin

* Plugin reads config from resolved path (`.agentic/kiki/` or `.agentic/` or global)
* Plugin merges routing tables (project overrides global)
* Plugin creates `.agentic/kiki/reviews/` on first review
* Plugin logs which source it's using (project, legacy, global)

### Phase 5: Update Template Generators

* `generatePluginTemplate()` updated to use new path resolution
* All file paths in generated templates use `.agentic/kiki/`
* Remove generation of `.opencode/` files from `generateAllTemplates()`
* `.opencode/` scaffolding only happens for `--project` installs

### Phase 6: Migration Support

* On first run of new plugin in a project with legacy `.agentic/` root files:

  * Log a warning: "Legacy .agentic/ files detected. Run `kiki install --project .` to migrate."
  * Continue working with legacy paths (backward compatibility)
* `kiki install --project .` migrates existing files:

  * Move `.agentic/routing.json` → `.agentic/kiki/routing.json`
  * Move `.agentic/config.json` → `.agentic/kiki/config.json`
  * Move `.agentic/alignment.json` → `.agentic/kiki/alignment.json`
  * Move `.agentic/TASK\_REGISTRY.json` → `.agentic/kiki/TASK\_REGISTRY.json`
  * Create `.agentic/kiki/reviews/` directory
  * Leave old files in place (or delete after successful migration)

### Phase 7: Testing

* Test global install on clean system
* Test project install in directory without `.agentic/`
* Test project install in directory with legacy `.agentic/`
* Test plugin behavior with no project config (global defaults only)
* Test plugin behavior with project config (overrides)
* Test routing merge logic
* Test backward compatibility (legacy paths still work)

\---

## Success Criteria

1. **One-command global setup:** `kiki install` makes Kiki available in all OpenCode projects
2. **Zero-config projects:** A new project with no `.agentic/` gets Kiki routing from global defaults
3. **Per-project overrides work:** `kiki install --project .` creates `.agentic/kiki/` with project-specific config
4. **Agent overrides work:** Dropping a `.opencode/agents/kiki-reviewer.md` shadows the global agent
5. **Backward compatibility:** Existing projects with `.agentic/` root files continue working
6. **No model hardcoding:** Routing table is the single source of truth for model selection

\---

## Open Questions

1. **Should global install auto-detect and warn about existing per-project `.opencode/` files?**

   * If a project has its own `.opencode/agents/kiki-\*.md`, they will shadow global agents.
   * Should `kiki install --global` detect this and warn the user?
2. **Should `kiki install --project` also scaffold `.opencode/agents/` with symlinks to global?**

   * This would make per-project overrides more discoverable.
   * Or should it remain empty, relying on OpenCode's global fallback?
3. **How should `kiki status` display the current configuration source?**

   * Show a tree: global defaults → project overrides → active rules
   * Or just show a summary: "Using global defaults + 3 project overrides"

\---

## Appendix: Full File Listing

### Files Changed

|File|Change|
|-|-|
|`src/cli/index.ts`|Add `install` command, keep `init`/`update` as aliases|
|`src/cli/commands/install.ts`|New unified install command (replaces init.ts)|
|`src/cli/commands/init.ts`|Deprecated, becomes alias wrapper|
|`src/cli/commands/update.ts`|Deprecated, becomes alias wrapper|
|`src/cli/commands/status.ts`|Updated to show global + project state|
|`src/cli/config.ts`|Update path constants, add global defaults generation|
|`src/core/routing-table.ts`|Add `mergeRoutingTables()`, update `ROUTING\_PATH`|
|`.opencode/plugins/kiki.ts`|Update path resolution, add merge logic|
|`tests/integration/routing-pipeline.test.ts`|Update test paths|
|`tests/cli/init.test.ts`|Update to test `install --project`|
|`README.md`|Update documentation|

### New Files

|File|Purpose|
|-|-|
|`src/core/path-resolver.ts`|`resolveKikiFile()` and related helpers|
|`tests/core/path-resolver.test.ts`|Unit tests for path resolution|
|`tests/cli/install.test.ts`|Tests for unified install command|
|`docs/superpowers/specs/2026-06-30-global-kiki-install-design.md`|This spec|

### Deleted/Renamed Files

|Old|New|
|-|-|
|`src/cli/commands/init.ts`|Renamed to `install.ts`|
|`src/cli/commands/update.ts`|Renamed to alias wrapper|



