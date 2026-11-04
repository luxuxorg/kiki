# Kiki — OpenCode Agent Orchestration

Kiki installs a global OpenCode plugin and eight role-based agents for the
Intake → Brainstorm → Plan → Architect Review → Implement → Review → Document →
Complete workflow. Project configuration is kept separate from Kiki updates.

## Installation and updates

Requires Node >= 18 at runtime. From a checkout:

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

The wizard asks for project paths and build/test/lint/security commands. It creates:

- `.agentic/kiki/config.json`: project paths, build/test/lint/security commands and
  watchdog settings.
- `.agentic/kiki/alignment.json`: project guardrails.
- `.agentic/kiki/TASK_REGISTRY.json`: workflow state.
- Agent-specific permissions in the existing OpenCode project config, or a new
  `opencode.jsonc`.

The wizard asks no model questions, and fresh project setup writes no `model` keys.
Agents inherit the OpenCode default unless a model is chosen explicitly with `/kiki`
or by editing native configuration. Existing local model values are user data and are
preserved by init, update and migrate. A legacy `models` section in
`.agentic/kiki/config.json` is still tolerated and ignored, but is never rewritten or
used to seed agents; setup is no longer a model source.

It creates **no local plugin or agent copies**. Reinitialization preserves existing
metadata, task state, permissions and models. Global agents read project paths and
commands from `.agentic/kiki/config.json`.

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
now has one source: native OpenCode configuration; there is no frontmatter sync or
setup-time model slot.

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

## Release validation

`kiki release` prepares and validates a local release without performing one. It runs
only in a Kiki source checkout and reads git history only through `git log`,
`git ls-files` and `git status`; it never commits, tags, pushes or publishes.

```bash
kiki release                 # dry run: validate only; no checkout writes
kiki release --apply         # copy a fully validated candidate back
kiki release --bump minor    # auto (default), major, minor or patch
kiki release --since <ref>   # explicit baseline; range is <ref>..HEAD
kiki release --security-exception <reason>  # approve high/critical findings
kiki release --help
```

The default is a dry run. `--apply` is required for any checkout write and additionally
requires a clean working tree. The candidate release tree is built in a temporary
directory outside the checkout from tracked working-tree files only; untracked and
ignored files are not part of the release. The local `node_modules` tree is byte-copied
separately so gates run without touching or symlinking the source dependencies; npm
cache/log/tmp state is redirected to run-owned temporary paths. Local development
dependencies must already be installed — gates never use `npx` or download tooling.

Every gate runs against that candidate: `tsc` build, the Vitest test suite, a separate
source-only `tsc --noEmit` typecheck, source-only ESLint, a full-tree `npm audit`
including dev/optional/peer dependencies, and release invariants (version fields,
generated plugin version, changelog headings, allowlisted changed files). The audit is
the only network query. It fails closed with `security: INCOMPLETE — npm audit
unavailable (<reason>)` when the registry or advisory data is unavailable, the audit
output is malformed, or the audit subprocess fails; incomplete results can never be
excepted. Without `--security-exception`, any high or critical vulnerability blocks
the release, while low and moderate findings are reported only. `--security-exception
<reason>` requires a non-empty reason and changes only that high/critical block
decision when the audit produced complete evidence: the audit still runs, all counts
are still reported, and low/moderate behavior is unchanged. An excepted result reports
`security: passed with approved exception (N high, M critical; reason: …)` — never a
clean pass — and the reason appears in the gate line, the report header and the
manual-next-steps block. The option was added for the 4 high advisories in the
`@opencode-ai/plugin` type-only import graph (accepted 2026-11-04).

The baseline is the newest commit whose subject contains an exact `release v<current>`
match. If none exists, the command fails closed and asks for `--since <ref>`; an
explicit `--since` defines `<ref>..HEAD`. Conventional commit subjects and bodies
infer the semver bump (`!` or a breaking footer is major, `feat` is minor, `fix`/`perf`
is patch); `--bump` overrides inference, and a non-increasing or non-release-worthy
range fails closed.

Changelog generation is deterministic and mandatory: an empty `[Unreleased]` section is
filled from the commit range, then renamed to a dated heading with a fresh empty
`[Unreleased]` above it. Existing human-authored content is never rewritten.

Before `--apply`, any untracked or ignored file under `dist/` causes a collision refusal
(a dry run reports that apply would refuse). Apply snapshots the four version/changelog
files and the entire `dist/` tree, writes the candidate back, then verifies every byte in
both directions; any write or verification failure restores the snapshot and reports the
retained backup location. A failed apply never leaves a partial release behind. Both
modes print manual `git add`/`git commit`/tag/push next steps but never execute them.

Dependency `.bin` links are rewritten as candidate-owned POSIX `/bin/sh` shims.
Node-shebang (or `.js`/`.mjs`/`.cjs`) entrypoints run through the current Node binary
with the candidate-local entrypoint; recognized native ELF executables are executed
directly. Other linked executables are rejected. This is a POSIX-only shim mechanism,
not a general Windows launcher.

These examples document the command; do not run them against this repository unless a
release is explicitly authorized.

## Diagnostics

- `kiki status [path]`: global installation and effective JSON model selections;
  reports local Markdown overrides separately.
- `kiki doctor [path]`: checks global agents, prompt files, plugin, project commands
  and paths; reports legacy plugins/routing files that need migration. Agent model
  presence is informational: it shows the resolved model or inherited OpenCode
  default (set via `/kiki`) and never fails a fresh install. Required skills are
  checked as files on disk across project `.opencode/skills`, legacy
  `~/.opencode/skills`, XDG config `opencode/skills`, and the XDG cache superpowers
  package layout. Missing skills, name drift, duplicate copies and superpowers
  versions are warnings/info; they never change the exit code. The observed
  superpowers version is compared with the version Kiki was tested against
  (`7.0.1`) as an observation only, not a support floor. Skill presence on disk does
  not confirm OpenCode plugin registration or live session availability. A legacy
  `models` config section is reported informationally and ignored.
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

Runtime use requires Node `>=18.0.0` (`package.json` `engines.node`, unchanged).

Development and lint require Node **`^20.19.0 || ^22.13.0 || >=24`** because of the
transitive lint dependency graph. This is not a blanket `>=20.19.0`: Node 21 and 23 are
excluded. The lint packages are development-only; direct lint dependency versions are
unchanged.

```bash
npm test
npm run lint
npm run build
# Source-only typecheck, separate from lint (tsconfig excludes tests):
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
# Optional integration test against an installed OpenCode binary, using isolated fixtures:
OPENCODE_TEST_BINARY=/absolute/path/to/opencode npm test
```

`npm run lint` runs `eslint "src/**/*.ts"` and `npm run build` compiles `src/`. Lint and
typecheck cover source only; tests are covered by Vitest, not by the lint or typecheck
gates.

The optional native tests use fixture HOME/XDG directories. The `/kiki` integration
test also requires Python 3 and a POSIX pseudo-terminal; it opens the real TUI,
selects an agent/model and checks the saved configuration without an LLM request.

Keep `KIKI_VERSION` in `src/cli/config.ts` synchronized with `package.json` on release.
The generated plugin stays dependency-free; JSONC/YAML parsing dependencies are
CLI-only. License: MIT.
