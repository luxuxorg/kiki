# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [3.0.1] — 2026-11-11

### Fixed
- **Standard OpenCode config directory:** OpenCode 1 and OpenCode 2 both use
  `~/.config/opencode`, so Kiki no longer treats the presence of
  `opencode.json(c)` there as proof of a V1 Kiki installation. The guard now
  keys only on V1-specific Kiki files (`plugins/kiki.*`, `kiki/tui.js`,
  `kiki/prompts/`); a generic `tui.json(c)` is no longer a marker.
  `kiki install`/`update` may back up and remove stale artifacts in the
  standard directory. No wrapper or XDG overrides are required.
- **No OpenCode binary version gate:** `kiki doctor` no longer probes
  `opencode --version` or warns when the installed OpenCode is newer than
  `2.2.6`. Kiki targets OpenCode V2; `2.2.6` remains the validated baseline,
  not a runtime requirement.

## [3.0.0] — 2026-11-10

### Added
- **Kiki 3.0.0 OC2-only port:** support for OpenCode exactly 2.2.6 with the exact runtime dependency `@opencode/plugin@2.2.6`; package exports `./server`, `./tui` and `.`.
- **Native OC2 agent files:** eight Kiki agent Markdown definitions with `mode`, ordered `permissions` rules and package-style server/TUI registration. `experimental.subagent_depth` remains `1` in the isolated machine configuration.
- **Fail-closed OC1 migration:** `kiki migrate [--from <sanitized-dir>] [--project <path>] [--force]` translates OC1 models/permissions into native `agents.<id>.model` objects and ordered rule arrays. The source is read-only; credential-bearing sources are refused; per-agent rejections are reported; successful runs write a marker and `--force` creates a fresh backup.
- **Parallel OC1/OC2 runbook and acceptance evidence:** user-operated wrapper/root isolation, rollback guidance, and separate ACTUAL_V3_VALIDATION, RELEASE_REHEARSAL and FUTURE_RELEASE_AUTHORIZATION status reporting.
- **Task 13 final acceptance evidence:** actual final-snapshot tarball `952be150…` (input manifest `74bccc17…`, dist `f0da220c…`, pack manifest `14005d97…`), 24/24 required real-binary tests with zero skips, 632-pass/2-by-design-skip full suite, fresh audit 0 high/critical/32 moderate with no exception, and a PASS synthetic 2.4.0→3.0.0 release rehearsal with no apply.

### Changed
- **Configuration format:** V2 native `agents.<id>.model` objects, ordered `permissions` arrays, and `plugins` lists replace V1 `agent`/`permission`/`plugin` shapes. Kiki never writes top-level `permissions`.
- **Install/update ownership:** `kiki install`/`kiki update` write Kiki-owned native agent Markdown files and back up existing targets before writing. User models and existing frontmatter permissions are preserved. Regenerating the Kiki-owned prompt body is the V1-equivalent baseline; preserving user edits to those global bodies would be a separate post-switch ownership change, not a migration blocker.
- **Routing:** `kiki routing` is retired and prints a read-only migration notice; models are configured only in native OpenCode configuration.
- **Parallel wrappers:** the isolated OC2 wrapper sets `OPENCODE_CONFIG_DIR` plus all four XDG roots; `opencode` targets OC2 and `opencode-v1` targets the retained OC1 binary. The frozen V1 TUI loader target stays detached from the moving development checkout.

### Removed
- **OC1 plugin runtime:** the generated V1 plugin source, OC1 compatibility adapter and `globalThis` dedup shim are retired for the OC2 package plugin.
- **V1 config keys and model seeding:** fresh setup writes no model values and does not use `.agentic/kiki/config.json` as a model source.

### Security
- **Fresh audit completed:** the 2026-11-04 exception for the retired `@opencode-ai/plugin@1.18.35` graph does not apply to Kiki 3.0.0. The final audit of the actual `@opencode/plugin@2.2.6` graph reported 0 high, 0 critical, 32 moderate, 0 low and 0 info across 454 dependencies, with no exception supplied. The moderate findings are non-blocking under the existing gate policy. The user accepted 3.0.0 and authorized commit, release and push on 2026-11-10.
- Credential handling remains metadata-only; Kiki does not read, copy or print `.env`, `auth.json` or provider credentials. Provider login is user-owned.

## [2.4.0] — 2026-11-09
### Added
- support role-scoped permissions in project worktrees

## [2.3.0] — 2026-11-04

### Added
- **Release security exception:** `kiki release --security-exception <reason>` requires a non-empty reason and changes only the high/critical block decision when the audit produced complete evidence. The audit still runs and all counts are still reported; low/moderate behavior and no-flag output remain unchanged. INCOMPLETE audits (unavailable, malformed or subprocess failure) still fail closed and can never be excepted. An excepted result reports `security: passed with approved exception (N high, M critical; reason: …)`, never a clean pass, with the reason in the gate line, report header and manual-next-steps block. Motivated by 4 high advisories in the `@opencode-ai/plugin` type-only import graph (accepted 2026-11-04).
- **Safe local release preparation (`kiki release`):** dry-run by default, with `--apply`, `--bump auto|major|minor|patch`, `--since <ref>` and help. A tracked-only candidate is built outside the checkout with byte-copied dependencies; build, Vitest, source typecheck, source lint, full-tree `npm audit` and release invariants run only in that candidate. Includes deterministic changelog generation and validation, exact-version baseline discovery with `--since` fallback, dist collision refusal, backup/rollback and full post-apply byte verification. It never commits, tags, pushes, publishes or runs remote release actions.
- **Doctor skill observations:** required skills are discovered across project, user, XDG config and the nested superpowers package-cache layout. Missing skills, name drift and duplicate copies are reported; the observed superpowers version is compared with the tested `7.0.1` observation without a support floor. All skill findings are warnings/info and never change the exit code; doctor states that it verifies disk presence only.
- **Source-only lint foundation:** `npm run lint` runs flat-config ESLint on `src/**/*.ts`; source typecheck remains a separate `tsc --noEmit` gate, and tests remain covered by Vitest. Development/lint requires Node `^20.19.0 || ^22.13.0 || >=24` (minimum 20.19.0, Node 21/23 excluded) due to the transitive graph; runtime `engines.node` remains `>=18.0.0`.

### Changed
- **Model-slot retirement:** init asks no model questions and no Kiki path seeds model values; fresh installs inherit OpenCode defaults. Existing agent model values and permissions remain preserved by install/update/migrate. Legacy `models` sections are tolerated, ignored on load, never rewritten and reported informationally by doctor; install/update print the `/kiki` model-selection hint.
- **Doctor model reporting:** agent model presence is informational, showing the resolved model or inherited OpenCode default (set via `/kiki`); a fresh install with no configured models no longer fails.

## [2.2.0] — 2026-11-03

### Changed
- **Global-only installation:** Kiki agents now use native OpenCode JSON configuration with global prompt files and one global plugin. `kiki update` refreshes the global installation while preserving approved permissions, model choices, unrelated OpenCode settings and all project files. Project init creates metadata and JSON agent settings instead of local runtime copies.
- **Native model selection:** configure `agent.<name>.model` in global/project OpenCode configuration. `kiki routing` now prints a read-only retirement notice; doctor/status use native JSON configuration.

### Added
- **Native `/kiki` menu:** select global model changes (default) or project-specific changes, choose a Kiki agent, then search OpenCode's available models in a native dialog. Saves only the chosen model in OpenCode JSON/JSONC, preserving permissions and comments; reports existing project overrides. Installed globally through a separate TUI loader, with real OpenCode 1.18.35 terminal integration coverage.
- **Local model reset via `/kiki`:** in the project scope, an agent with a local override offers "Globales Modell (<model>) verwenden" to delete just that local `model` key, and the agent list offers "Alle lokalen Modell-Zuordnungen löschen" (with confirmation) to remove all local Kiki model overrides across every project config tier; global models apply again after an OpenCode restart. No delete is offered in the global scope.
- **No implicit local model values:** `kiki init --project` writes local `agent.<name>.model` keys only for explicit non-default choices, and `.agentic/kiki/config.json` now persists only non-default model preferences, so built-in default changes cannot leak into project configs later. Local model values added via `/kiki` or file edits are always preserved by init/update/migrate.
- `kiki migrate --project <path>` extracts old agent permissions/models, imports legacy routing selections, backs up originals and removes redundant local agents/plugins. Global updates similarly migrate old global Markdown agents.
- `kiki reset --project <path>` resets Kiki agent overrides to global defaults while preserving unrelated configuration, tasks, reviews and project metadata.
- Global/project configuration edits preserve JSONC comments; help and invalid installation/update arguments do not write files. Integration coverage verifies global prompts with local rights/models against OpenCode using an isolated home directory.

- Subagent watchdog in the generated OpenCode plugin: automatically detects hung subagent sessions (no message parts or token growth for `health.stuckThresholdMs`, default 5 min), output/tool loops (3 identical repetitions), and sessions exceeding `health.absoluteMaxMs` (default 60 min), then aborts them so the orchestrator's retry/escalation flow resumes without manual intervention. Incidents are logged to `.agentic/kiki/health_log.jsonl`. Configurable via the new `health` section in `.agentic/kiki/config.json`.
- **Plugin deduplication fallback:** dedup-aware copies share ownership through `globalThis[Symbol.for('kiki.plugin')]` keyed by project root. First-loaded wins; later copies yield and diagnose version differences. Pre-dedup copies must be removed using project migration; normal operation now uses one global plugin.
- **Release checklist:** `KIKI_VERSION` in `src/cli/config.ts` (baked into the generated plugin as `KIKI_PLUGIN_VERSION`) must be updated alongside `package.json` on every release. A unit test asserts they match at test time.

## [2.1.0] — 2026-06-23

### Added
- **Security command** (`commands.security`) — default `npm audit`, configurable per project, validated by `kiki doctor`
- **Rollback safety** in implementer template — records pre-implementation state and safely reverts tracked changes and newly created untracked files without touching existing user files
- **Implementation Summary** in implementer template — short handoff summary for reviewer and historian
- **Reviewer verdict format** — `PASS/FAIL` with numbered blockers instead of verbose prose reviews

### Changed
- **Reduced token consumption** — agent prompts streamlined by removing redundant footers and compressing instructions (approx. 21% fewer characters in agent templates)
- **Init wizard** now asks for security command alongside build, test, and lint
- **Doctor** validates `commands.lint` and `commands.security`

## [2.0.0] — 2026-06-18

### Added
- **Interactive setup wizard** (`kiki init`) — asks about paths, models, changelog, decisions, knowledge base, build commands
- **Config-driven scaffolding** — all agent templates are generated from `.agentic/config.json` paths and models
- **Paths configuration** — `source`, `tests`, `docs`, `superpowers`, `changelog`, `readme`, `decisions`, `knowledge`, `taskRegistry`
- **Models configuration** — `standard` and `critical` model settings
- **`kiki doctor`** — validates config, paths, models, routing, agent files, and orchestrator safety
- **Explicit read/write permissions** for all subagents (brainstormer, planner, implementer, reviewer, historian)
- **Parallel task execution** with wave-based dispatch
- **Per-task metadata** — `risk`, `parallel`, `depends_on` fields in planner templates
- **Reviewer parallelization validation** — checks circular dependencies, file conflicts, dependency chains
- **Auto-build on install** — `prepare` script runs `tsc` during `npm install`

### Changed
- **Installation** — now works directly from GitHub: `npm install -g github:luxuxorg/kiki`
- **Agent templates** — regenerated from config instead of hardcoded strings
- **Historian** — now manages decisions and knowledge base if configured
- **Orchestrator** — no `permission:` blocks (OpenCode crash prevention for `mode: primary`)
- **Reviewer bash permissions** — restricted to `git diff*`/`git log*` only
- **Plugin** — self-contained with zero external dependencies

### Removed
- **prepublishOnly** script — was causing race conditions during GitHub install
- **dist/ from git tracking** — built automatically on install via `prepare`
- **Benchmark-cache and pricing modules** — simplified to static routing only

## [1.0.0] — 2026-06-12

### Added
- Initial release with 7 subagents (orchestrator, brainstormer, planner, implementer, reviewer, escalation, historian)
- Static routing table with skill+domain+risk model selection
- Smart-merge update command
- Verification command for TBDs/TODOs
- Self-contained OpenCode plugin
