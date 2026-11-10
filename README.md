# Kiki — OpenCode 2 Agent Orchestration

Kiki 3.0.0 is the OpenCode 2 (OC2) release of Kiki. It installs native OC2 agent
definitions and a package-style server/TUI plugin for the Intake → Brainstorm → Plan →
Architect Review → Implement → Review → Document → Complete workflow. Project
configuration is kept separate from Kiki updates.

Kiki 3.0.0 targets OpenCode **exactly 2.2.6** and is OC2-only. Kiki 2.4.0 remains the
frozen OC1 fallback; the two generations use separate binaries, wrappers, config, data,
cache and state roots.

**Status:** 3.0.0 accepted for release by the user on 2026-11-10, after live OC2/V1
startup and `/kiki` smoke checks. Automated **ACTUAL_V3_VALIDATION** and the synthetic
**RELEASE_REHEARSAL** passed, including an audit with 0 high/critical and 32 moderate
findings and no exception. Live model migration, provider login and the optional
rollback drill are user-owned; unreported checks are not claimed. See
[`docs/migrations/kiki-3-oc2-acceptance.md`](docs/migrations/kiki-3-oc2-acceptance.md).

## Requirements

- Runtime Node `>=18.0.0`.
- OpenCode exactly `2.2.6` for the Kiki 3.0.0 server and TUI entrypoints.
- Runtime dependency `@opencode/plugin@2.2.6` (exact pin). The package exports
  `./server`, `./tui` and `.` and ships `dist/`.
- `experimental.subagent_depth: 1` and `update: "disable"` in the isolated OC2
  configuration.
- For the parallel machine setup, `opencode` resolves to the isolated OC2 wrapper and
  `opencode-v1` to the retained OC1 binary. The OC2 wrapper sets all five isolation
  variables together: `OPENCODE_CONFIG_DIR`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`,
  `XDG_CACHE_HOME` and `XDG_STATE_HOME`. `OPENCODE_CONFIG_DIR` overrides the config
  root only; data, cache and state still follow their XDG roots. The OC1 wrappers
  (`opencode-v1`, `kiki-v1`) inherit a clean OC1 environment and set none of them.

Until the human switches real work, the OC1 fallback remains `opencode-v1` plus
`kiki-v1`. Do not run fallback commands from a shell that exports OC2 roots.

## Installation and updates

From a built checkout, the validated local form is:

```bash
npm ci
npm run build
node dist/cli/index.js install
```

Run Kiki through the isolated OC2 wrapper so it resolves the OC2 config directory
(`~/.opencode2/config/opencode`), or provide the same five variables explicitly.
`kiki install` writes the eight native agent Markdown files, the workflow reference and
the package registrations, backs up existing Kiki-owned targets, and asks for an
OpenCode restart.

Use this form only for an actual checkout or local package you have built and reviewed.
Do not assume that a published `kiki@3.0.0` package, an `npm install -g` path or a GitHub
install target is available. The release registration form
(`opencode plugin add kiki@<version>`) is valid only when a validated candidate package
is actually available and a release has been separately authorized.

To refresh a global installation:

```bash
kiki update
# equivalent: kiki update --global
# Restart OpenCode to load the updated files.
```

`update` changes only the global installation and never project files. It regenerates
the Kiki-owned native agent Markdown bodies from the installed Kiki version and backs up
the previous files. Existing config-level models and existing frontmatter permissions
are preserved. `kiki install --force` is accepted for reinstallation but does not reset
approved permissions or models.

**Prompt-body baseline:** Kiki-owned global agent Markdown bodies are refreshed by
`kiki install`/`kiki update` from the installed Kiki version, with the previous files
backed up. Config models and existing frontmatter permissions are preserved. This is the
V1-equivalent baseline and adds no new feature. If you later want user-edited global prompt
bodies preserved across updates, request that as a separate post-switch ownership change;
it is not a migration blocker. Project overrides are separate: a project file such as
`.opencode/agents/kiki-reviewer.md` replaces the global prompt for that project and does
not receive later global prompt updates.

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
The agent list shows current assignments and marks inherited models. The picker uses
OpenCode's native searchable selection dialog and provider/model data. It sends no LLM
request and does not change the active chat's model.

Only the selected `agents.<name>.model` object is saved. Permissions, prompts, other
settings and JSONC comments remain intact. A global change keeps existing project
overrides and tells you when one still takes precedence. Escape cancels before model
selection without saving. Selecting the already-effective inherited model is a
conservative no-op: no model write occurs and the existing toast text is unchanged. That
behavior is documented and is not an urgent decision; it can be observed during the
Task 14 save/removal drill.

To remove a project-local override, open **Modell ändern — dieses Projekt**, pick an
agent that has one, and choose **Globales Modell (<model>) verwenden** at the top of the
model list. The project agent list also ends with **Alle lokalen
Modell-Zuordnungen löschen**, which removes every local Kiki model override after a
confirmation. Both delete only the local `model` key — permissions, prompts, other
settings and comments stay intact — and the global model applies again. No delete is
offered in the global scope, since global values are the defaults themselves.

The menu is registered globally through the OC2 `cli.json` plugin list by
`kiki install` / `kiki update` and requires an OpenCode restart. It is tested against
OpenCode 2.2.6. It is a separate TUI entrypoint; the server routing/watchdog plugin stays
unchanged.

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
- Native Kiki `agents.<id>` permission rules in the existing OpenCode project config,
  or a new `opencode.jsonc`.

The wizard asks no model questions and fresh project setup writes no `model` keys.
Agents inherit the OpenCode default unless a model is chosen explicitly with `/kiki` or
by editing native configuration. Existing local model values are user data and are
preserved by init, update and migrate. A legacy `models` section in
`.agentic/kiki/config.json` is tolerated and ignored, but is never rewritten or used to
seed agents; setup is not a model source.

It creates **no local plugin or agent copies**. Reinitialization preserves existing
metadata, task state, permissions and models. Global agents read project paths and
commands from `.agentic/kiki/config.json`.

## Models and permissions

OpenCode merges global and project `agents` settings. Models are objects, and Kiki
permissions are ordered rule arrays. For example, a project `opencode.jsonc` can select
a reviewer model and prohibit implementer edits:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "agents": {
    "kiki-reviewer": {
      "model": { "providerID": "openai", "model": "gpt-6.1-sol" }
    },
    "kiki-implementer": {
      "permissions": [
        { "action": "edit", "resource": "**", "effect": "deny" }
      ]
    }
  }
}
```

Kiki 3.0.0 writes only `agents.<id>.model` and Kiki-owned permission additions.
It never writes top-level `permissions`: OC2 appends those to every agent and would
broaden them. Rules are evaluated in order and later matching rules win. Inherited
denials are not relaxed by a broad local allow wildcard. Bash/shell permissions are
separate from file-tool permissions; file restrictions are not a shell sandbox.

`kiki routing` is retired and prints a read-only migration notice. Model selection has
one source: native OpenCode configuration; there is no frontmatter sync or setup-time
model slot.

For general project instructions use `AGENTS.md`. For an intentionally different agent
prompt, create `.opencode/agents/kiki-reviewer.md` (or another Kiki agent). That prompt
replaces the global prompt for this project and does not automatically receive later
global instruction updates. OpenCode merges fields; settings explicitly present in the
local Markdown frontmatter take precedence.

## Migrate from OC1 once

Migration reads a **secret-free OC1 export**, never a live credential-bearing
configuration. Create the sanitized export yourself and pass it with `--from`. Do not
copy or point migration at `.env`, `auth.json`, provider configuration or any file that
contains credentials.

```bash
kiki install       # fresh OC2 installation; use kiki update for an existing install
kiki migrate --from /path/to/sanitized-oc1-config
# Restart OpenCode.
```

Global migration converts eligible Kiki `agent`/`agents` models and permission maps into
native `agents.<id>.model` objects and ordered `permissions` arrays. The OC1 source is
read-only and remains byte-identical. A source containing `provider`, `providers`, `auth`
or `env` is refused before any write. Per-agent conflicts or untranslatable permissions
are reported with a reason; successfully translated agents may still be written, the
command exits non-zero, and no migration marker is written. Correct or remove the
rejected input and rerun.

Project migration additionally extracts local Kiki agent permissions/models and legacy
`routing.json` selections. It removes only redundant Kiki local files, and only when
every eligible agent succeeds; on any rejection it writes no marker and removes no local
files. Non-Kiki agents and the user-owned `scientist` agent are reported by name for
manual handling and are not migrated. The scientist audit/port remains deferred.

A successful migration writes `.agentic/kiki/migration.json` (source, timestamp and Kiki
version) in the destination/project. A later run fails closed at that marker. `--force`
reruns with a fresh backup. Backups live under `kiki/backups/` globally or
`.agentic/kiki/backups/` in a project, use a restrictive mode, and include a manifest of
original paths; the backup directory is Git-ignored. Other agents, providers, project
metadata and unrelated settings remain untouched.

Provider login is user-owned and is not copied from OC1. Kiki only checks credential
presence by metadata for `doctor` and prints instructions; it never reads, copies or
prints credential values.

## Reset a project's agent customizations

```bash
kiki reset --project .
# Restart OpenCode to use the global agent defaults.
```

Reset backs up and removes Kiki agent entries from project OpenCode configuration,
local Kiki Markdown agents, a remaining local Kiki plugin, and legacy `routing.json`.
Other agents, provider settings, task registries, reviews and documentation remain.
Project path/command metadata, alignment and health settings also remain. Reset restores
**global agent models, permissions and prompts**, not a total deletion of project data.
It does not repair an already running or stuck OpenCode session.

## Diagnostics

- `kiki status [path]`: global OC2 installation, effective `agents.<id>.model` values,
  and project overrides.
- `kiki doctor [path]`: checks the OC2 root isolation, observed OC2 version (expects
  exactly `2.2.6`), native agent files and modes, prompt files, one server plugin
  registration, one `cli.json` TUI registration, project commands/paths and skills.
  Agent model presence is informational: it shows the resolved model or inherited
  OpenCode default and never fails a fresh install. Credential status is
  presence/metadata only. Required skills are checked as files on disk; missing skills,
  name drift, duplicate copies and superpowers versions are warnings/info and never
  change the exit code. Skill presence does not confirm live plugin registration.
- `kiki verify <file>`: checks Markdown for unfinished markers or checklist items.

## Release validation

`kiki release` prepares and validates a local release without performing one. It runs
only in a Kiki source checkout and reads Git history only through `git log`,
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
requires a clean working tree. The candidate tree is built outside the checkout from
tracked working-tree files only; untracked and ignored files are not part of the release.
The local `node_modules` tree is byte-copied separately so gates run without touching or
symlinking source dependencies; npm cache/log/tmp state is redirected to run-owned
temporary paths. Local development dependencies must already be installed — gates never
use `npx` or download tooling.

Every gate runs against that candidate: `tsc` build, the Vitest test suite, a separate
source-only `tsc --noEmit` typecheck, source-only ESLint, a full-tree `npm audit`
including dev/optional/peer dependencies, and release invariants (version fields,
generated plugin version, changelog headings, allowlisted changed files). The audit is
the only network query. It fails closed with
`security: INCOMPLETE — npm audit unavailable (<reason>)` when the registry or advisory
data is unavailable, the audit output is malformed, or the audit subprocess fails;
incomplete results can never be excepted.

Without `--security-exception`, any high or critical vulnerability blocks the release,
while low and moderate findings are reported only. `--security-exception <reason>`
requires a non-empty reason and changes only that high/critical block decision when the
audit produced complete evidence: the audit still runs, all counts are still reported,
and low/moderate behavior is unchanged. An excepted result reports
`security: passed with approved exception (N high, M critical; reason: …)` — never a
clean pass.

The 2026-11-04 exception for the retired `@opencode-ai/plugin@1.18.35` graph does **not**
apply to Kiki 3.0.0. The final fresh audit on the actual `@opencode/plugin@2.2.6` graph
reported **0 high, 0 critical, 32 moderate, 0 low, 0 info** with no exception. The 32
moderate findings are non-blocking under the existing gate policy and are reported
honestly; no routine approval is added. The synthetic 2.4.0→3.0.0 **RELEASE_REHEARSAL**
passed with all six gates and no `--apply`. The user subsequently authorized the 3.0.0
commit, tag, push and GitHub Release. Because the development tree is already 3.0.0,
that release uses fresh validation of the current version rather than running an
additional version bump or copying the synthetic rehearsal back.

The baseline is the newest commit whose subject contains an exact `release v<current>`
match. If none exists, the command fails closed and asks for `--since <ref>`; an explicit
`--since` defines `<ref>..HEAD`. Conventional commit subjects and bodies infer the
semver bump (`!` or a breaking footer is major, `feat` is minor, `fix`/`perf` is patch);
`--bump` overrides inference, and a non-increasing or non-release-worthy range fails
closed.

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

The eight agents load Superpowers skills for brainstorming, planning, implementation, TDD
and review. Role-based baseline permissions live in their native Markdown frontmatter;
config `agents.<id>.permissions` additions are appended and later rules win.

## Plugin

The `kiki` package provides two OC2 entrypoints:

- `./server`: a package-style plugin that logs `kiki-*` task dispatches to
  `.agentic/kiki/routing_log.jsonl` and runs the configurable subagent watchdog,
  recording incidents in `.agentic/kiki/health_log.jsonl` by default. It observes
  dispatches; OpenCode selects the configured models. The routing entry format remains
  `{ timestamp, agent, model }`, with `model: "unknown"` when no explicit model is
  passed. Setup owns its subscriptions/intervals and returns a cleanup function awaited
  on unload/reload. The OC1 `globalThis` dedup shim is not used; `doctor` diagnoses
  duplicate Kiki server registrations instead.
- `./tui`: the native `/kiki` menu.

Server registration is `plugins` in the global `opencode.json`/`opencode.jsonc`; TUI
registration is `plugins` in the global `cli.json`/`cli.jsonc`. A development checkout
registers its absolute package directory; a release uses the package name once such a
candidate is available.

## Development

Runtime use requires Node `>=18.0.0` (`package.json` `engines.node`). Development and
lint require Node **`^20.19.0 || ^22.13.0 || >=24`** because of the lint dependency graph;
Node 21 and 23 are excluded. The lint packages are development-only.

```bash
npm test
npm run lint
npm run build
# Source-only typecheck, separate from lint (tsconfig excludes tests):
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
# Optional integration tests against an installed OpenCode 2.2.6 binary:
OPENCODE_TEST_BINARY=/absolute/path/to/opencode npm test
```

`npm run lint` runs `eslint "src/**/*.ts"` and `npm run build` compiles `src/`. Lint and
typecheck cover source only; tests are covered by Vitest, not by the lint or typecheck
gates.

The optional native tests use disposable HOME and all XDG roots plus an explicit
`OPENCODE_CONFIG_DIR`; child processes receive a whitelisted environment and never
inherit live auth/provider/config values. The binary must report exactly `2.2.6`.
The `/kiki` integration test also requires Python 3 and a POSIX pseudo-terminal; it opens
the real TUI, exercises the menu with the German copy, and asserts zero provider
requests.

The final Task 13 snapshot recorded 24/24 required real-binary integration tests with zero
skips, and 632 passed / 2 by-design opt-in skips / 0 failed in the full suite with the
binary. That is automated evidence only; Task 14 human machine acceptance and any actual
release remain not run. See the acceptance document for the current gate state.

Keep `KIKI_VERSION` in `src/cli/config.ts` synchronized with `package.json` on release.
License: MIT.
