# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- Subagent watchdog in the generated OpenCode plugin: automatically detects hung subagent sessions (no message parts or token growth for `health.stuckThresholdMs`, default 5 min), output/tool loops (3 identical repetitions), and sessions exceeding `health.absoluteMaxMs` (default 60 min), then aborts them so the orchestrator's retry/escalation flow resumes without manual intervention. Incidents are logged to `.agentic/kiki/health_log.jsonl`. Configurable via the new `health` section in `.agentic/kiki/config.json`.
- **Plugin deduplication:** when both a global and a project Kiki install are loaded by OpenCode in the same process, the generated plugin now self-deduplicates via a `globalThis[Symbol.for('kiki.plugin')]` ownership registry keyed by resolved project root. The first-loaded instance owns the watchdog and routing logger; later instances for the same root register no-op hooks. OpenCode loads global plugins before project plugins, so the global copy is canonical when both are installed. This guarantees exactly one `routing_log.jsonl` line per `kiki-*` dispatch and exactly one watchdog interval/health entry per incident. When the loaded copies differ in version, the non-owner emits a one-time `plugin-dedup-version-mismatch` diagnostic to `console.warn`, `.agentic/kiki/health_log.jsonl`, and `client.app.log`, with remediation via `kiki install --force` and/or `kiki update <project>`.
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
