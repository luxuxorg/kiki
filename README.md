# Kiki — OpenCode Agent Orchestration

Kiki installs a global OpenCode plugin and eight role-based agents for the
Intake → Brainstorm → Plan → Architect Review → Implement → Review → Document →
Complete workflow. Project configuration is kept separate from Kiki updates.

## Installation and updates

Requires Node >= 18. From a checkout:

```bash
npm install
npm run build
npm install -g .
kiki install
```

Kiki installs into `$XDG_CONFIG_HOME/opencode`, or `~/.config/opencode` by default:

| Location | Contents |
|---|---|
| `opencode.json` / `opencode.jsonc` | Kiki `agent` definitions, including models and permissions |
| `kiki/prompts/` | Standard agent instructions |
| `kiki/agentic-workflow.md` | Workflow reference |
| `plugins/kiki.ts` | The single global routing logger and subagent watchdog |
| `tui.json` / `tui.jsonc` | Registration of the native `/kiki` menu |
| `kiki/tui.js` | Stable TUI loader pointing at the installed Kiki package |

To activate a newer Kiki version:

```bash
# First update the installed CLI package, or pull/build your linked checkout.
kiki update
# Restart OpenCode to load the updated plugin and agents.
```

`update` uses the version of the CLI being invoked; it does not download a release.
It updates Kiki's global prompts and plugin, preserves existing agent permissions
and model choices, and leaves project files and unrelated OpenCode settings alone.
`kiki update --global` is equivalent. `kiki install --force` remains accepted, but
does not reset approved permissions or models. JSONC comments are preserved.

## Using Kiki in OpenCode

Select **kiki-orchestrator** as the main agent and describe your task. It coordinates
design, planning, implementation, review and documentation.

To change a Kiki agent's model, use the native terminal menu:

```text
/kiki
  → Modell ändern — global           (default)
    → Select the agent
      → Search and select a model
        → Saved; restart OpenCode
```

Choose **Modell ändern — dieses Projekt** instead for a project-specific model.
The agent list shows current assignments and marks inherited models. The model
picker uses OpenCode's native searchable selection dialog and provider/model data.
It sends no LLM request and does not change your active chat's model.

Only the selected `agent.<name>.model` setting is saved. Permissions, prompts,
other settings and JSONC comments remain intact. A global change keeps existing
project overrides and tells you when one still takes precedence. Escape cancels
before model selection without saving.

To remove a project-local override, open **Modell ändern — dieses Projekt**, pick an
agent that has one, and choose **Globales Modell (<model>) verwenden** at the top of
the model list. The project agent list also ends with **Alle lokalen
Modell-Zuordnungen löschen**, which removes every local Kiki model override after a
confirmation. Both delete only the local `model` key — permissions, prompts, other
settings and comments stay intact — and the global model applies again. No delete is
offered in the global scope, since global values are the defaults themselves.

The menu is installed globally by `kiki install` / `kiki update` and requires an
OpenCode restart to become available. Its TUI API is tested with OpenCode 1.18.35.
It is a separate TUI extension; the background watchdog/logger stays unchanged.

## Project setup

```bash
kiki init .
# Equivalent: kiki install --project .
```

The wizard asks for project paths, commands and model preferences. It creates:

- `.agentic/kiki/config.json`: project paths, build/test/lint/security commands,
  watchdog settings and only explicitly chosen (non-default) model preferences.
- `.agentic/kiki/alignment.json`: project guardrails.
- `.agentic/kiki/TASK_REGISTRY.json`: workflow state.
- Agent-specific permissions and any non-default model preferences in the existing
  OpenCode project config, or a new `opencode.jsonc`.

Project init never writes implicit local model values: with default model choices no
`model` keys appear in the project config, so the global defaults apply. Local model
values exist only after an explicit choice (wizard, `/kiki`, manual edit) and are
preserved by every later init/update/migrate.

It creates **no local plugin or agent copies**. Reinitialization preserves existing
metadata, task state, permissions and models. Global agents read project paths and
commands from `.agentic/kiki/config.json`. Changes to that file's setup model
preferences do not change active models; use OpenCode configuration below.

## Models and permissions

OpenCode merges global and project `agent` settings. For example, a project's
`opencode.jsonc` can select a reviewer model and prohibit implementer edits.
Use `/kiki` for convenient model selection, or edit the native configuration directly:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "agent": {
    "kiki-reviewer": { "model": "openai/gpt-6.1-sol" },
    "kiki-implementer": { "permission": { "edit": "deny" } }
  }
}
```

Permission pattern maps are also merged: a local `"*": "deny"` alone does not
erase specific global allow rules. Init and migration mask inherited path grants
that are absent from the project's permission map. OpenCode evaluates the last
matching rule. Inherited denials are not relaxed by a broad local allow wildcard.
Bash permissions are separate from file-tool permissions; file
restrictions are not a shell sandbox.

`kiki routing` is retired and prints a read-only migration notice. Model selection
now has one source: native OpenCode configuration; there is no frontmatter sync.

For general project instructions use `AGENTS.md`. For an intentionally different
agent prompt, create `.opencode/agents/kiki-reviewer.md` (or another Kiki agent).
That prompt replaces the global prompt for this project and does not automatically
receive later global instruction updates. OpenCode merges fields; settings
explicitly present in the local Markdown frontmatter take precedence.

## Migrate existing projects once

```bash
kiki update                         # global JSON agents, preserving old rights/models
kiki migrate --project /path/to/project
# Restart OpenCode.
```

Global update first imports rights/models from old global Markdown agents and
removes those Markdown copies. Project migration imports local agent permissions
and models, supplements missing model selections from `.agentic/kiki/routing.json`,
then removes the old local Kiki agents, local plugin and routing file. Existing
JSON settings take precedence. Other agents and OpenCode settings remain intact.

This migration is for generated agents without custom prompt changes. Keep an
intentional custom Markdown agent separately and restore it afterwards if needed.
Originals are backed up before removal: globally under `kiki/backups/`, locally
under `.agentic/kiki/backups/`. Each backup has a manifest of original paths;
backup files have restrictive permissions and a Git ignore rule.

Malformed JSONC or agent frontmatter stops migration before old copies are removed.
The old `kiki update <project>` command is rejected with migration guidance rather
than silently regenerating templates. Help and invalid options never install files.

## Reset a project's agent customizations

```bash
kiki reset --project .
# Restart OpenCode to use the global agent defaults.
```

Reset backs up and removes Kiki agent entries from project OpenCode configuration,
local Kiki Markdown agents, a remaining local Kiki plugin, and legacy routing.json.
Other agents, provider settings, task registries, reviews and documentation remain.
Project path/command metadata, alignment and health settings also remain. Reset
restores **global agent models/rights/prompts**, not a total deletion of project data.
It does not repair an already running or stuck OpenCode session.

## Diagnostics

- `kiki status [path]`: global installation and effective JSON model selections;
  reports local Markdown overrides separately.
- `kiki doctor [path]`: checks global agents, prompt files, plugin, project commands
  and paths; reports legacy plugins/routing files that need migration.
- `kiki verify <file>`: checks Markdown for unfinished placeholders/checklist items.

## Agents

| Agent | Role |
|---|---|
| `kiki-orchestrator` | Coordinates the workflow and task registry |
| `kiki-brainstormer` | Explores requirements and writes design specs |
| `kiki-planner` | Writes implementation plans |
| `kiki-implementer` | Implements code and tests |
| `kiki-gui-designer` | Implements UI/UX work |
| `kiki-reviewer` | Reviews plans, code and security |
| `kiki-escalation` | Diagnoses failures |
| `kiki-historian` | Updates project documentation |

Agents load Superpowers skills for brainstorming, planning, implementation, TDD
and review. Role-based file permissions remain part of their global definitions;
project settings can adjust them without copying the agent instructions.

## Plugin

The global plugin is self-contained with no external runtime dependencies. It logs
`kiki-*` task dispatches to `.agentic/kiki/routing_log.jsonl` and runs the configurable
subagent watchdog, recording incidents in `.agentic/kiki/health_log.jsonl` by default.
It observes dispatches; OpenCode selects the configured models.

The process-wide dedup guard remains as a fallback if multiple **dedup-aware** copies
are loaded: first-loaded instance per project wins; differing versions produce a
diagnostic. Pre-dedup legacy copies cannot be suppressed by that guard; migrate
projects to remove them. Normal operation has only the global plugin.

## Development

```bash
npm test
npm run build
# Optional integration test against an installed OpenCode binary, using isolated fixtures:
OPENCODE_TEST_BINARY=/absolute/path/to/opencode npm test
```

The optional native tests use fixture HOME/XDG directories. The `/kiki` integration
test also requires Python 3 and a POSIX pseudo-terminal; it opens the real TUI,
selects an agent/model and checks the saved configuration without an LLM request.

Keep `KIKI_VERSION` in `src/cli/config.ts` synchronized with `package.json` on release.
The generated plugin stays dependency-free; JSONC/YAML parsing dependencies are
CLI-only. License: MIT.
