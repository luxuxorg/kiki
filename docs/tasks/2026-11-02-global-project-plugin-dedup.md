# Task: Prevent duplicate Kiki plugin instances when global and project installs coexist

## Context

Kiki supports two installation scopes:

- **Global:** `kiki install` writes `~/.config/opencode/plugins/kiki.ts`.
- **Project:** `kiki init [path]` / `kiki update [path]` writes `<project>/.opencode/plugins/kiki.ts`.

OpenCode automatically loads both plugin directories and runs **all** hooks from all loaded plugins. According to the OpenCode plugin docs, the load order is:

1. Global config (`~/.config/opencode/opencode.json`)
2. Project config (`opencode.json`)
3. Global plugin directory (`~/.config/opencode/plugins/`)
4. Project plugin directory (`.opencode/plugins/`)

Local plugins are not deduplicated by OpenCode. When both a global and a project Kiki install exist, the generated plugin runs twice in the same OpenCode process.

## Observed problem

In a project that has both installs, every `task` dispatch to a `kiki-*` subagent appended **two** entries to `.agentic/kiki/routing_log.jsonl`, 1–3 ms apart. The two plugin files were byte-identical.

Example evidence from a real project:

```jsonl
{"timestamp":"2026-07-02T07:24:52.960Z","agent":"kiki-planner","model":"unknown"}
{"timestamp":"2026-07-02T07:24:52.962Z","agent":"kiki-planner","model":"unknown"}
{"timestamp":"2026-07-02T07:30:40.634Z","agent":"kiki-implementer","model":"unknown"}
{"timestamp":"2026-07-02T07:30:40.635Z","agent":"kiki-implementer","model":"unknown"}
{"timestamp":"2026-07-02T07:37:16.031Z","agent":"kiki-reviewer","model":"unknown"}
{"timestamp":"2026-07-02T07:37:16.033Z","agent":"kiki-reviewer","model":"unknown"}
```

With the watchdog enabled, both instances also start their own intervals and scan the same sessions, which can produce duplicate `watchdog-quiet` / `watchdog-abort` entries in `.agentic/kiki/health_log.jsonl` and duplicate abort requests for the same session.

## Reproduction

1. Install globally: `kiki install --force`.
2. In a test project: `kiki init` or `kiki update .`, which creates `.opencode/plugins/kiki.ts`.
3. Start OpenCode in that project.
4. Dispatch a `kiki-*` subagent via the `task` tool.
5. Inspect `.agentic/kiki/routing_log.jsonl`; it grows by two lines per dispatch.
6. Optional: set a short `health.stuckThresholdMs` in `.agentic/kiki/config.json`, trigger a quiet or looping subagent, and observe duplicate health entries and abort attempts.

## Desired behavior

- Exactly **one** watchdog instance runs per OpenCode process/project, regardless of how many Kiki plugin copies are loaded.
- Exactly **one** routing log entry is written per `task` dispatch.
- Works with: global only, project only, and both installed.
- Existing projects keep working without manual cleanup; no duplicate intervals, logs, or aborts.
- Precedence when both copies exist must be deterministic and documented. Preferred default: the global plugin is canonical when both are present, matching OpenCode's load order and the "install once globally" model. The design may choose otherwise if justified.
- If the two copies differ in version, do not silently run an older implementation without a diagnostic. Prefer a warning or documented version-selection rule.
- No changes to OpenCode core. The generated plugin must remain self-contained with zero external runtime dependencies.
- The generated plugin must remain valid TypeScript, and `kiki init` / `kiki update` must remain idempotent.

## Suggested approach (not binding)

- Add a process-wide sentinel/registry on `globalThis`, e.g. `Symbol.for('kiki.plugin')`, keyed by project directory.
- The first loaded instance owns the watchdog and routing logger; later instances return empty hooks or only emit a diagnostic.
- Alternatively, skip generating the project plugin when a global plugin is detected at install time. Runtime dedup is more robust because global/project installs can be added or removed later.
- Let the brainstorming/design phase choose and justify the approach.

## Relevant code

- `src/cli/config.ts` — `generatePluginTemplate()`, `generateAllTemplates()`, `writeOpencodeFiles()`.
- `src/cli/commands/install.ts` — `installGlobal()`, `installProject()`.
- `src/cli/commands/update.ts` — project update path.
- `src/plugin/watchdog-source.ts` — inlined watchdog implementation.
- `tests/cli/plugin-template.test.ts`, `tests/integration/watchdog-plugin-syntax.test.ts` — existing plugin tests.

## Tests / acceptance criteria

- Unit test: load the generated plugin twice in the same process/VM with a shared `globalThis`; assert the watchdog starts once and one routing log entry is appended.
- Integration test: simulate global + project plugin copies loaded together; assert exactly one log line per dispatch.
- Cover all three cases: global only, project only, both.
- Health logging produces one entry per incident, and no orphan intervals remain.
- Run `npm test`, `npm run build`, the generated-plugin `tsc` check, and `kiki doctor` successfully.

## Out of scope

- Duplicate agents. OpenCode project agents already shadow global agents; this task is specifically about the plugin.
- Changing watchdog detection logic, thresholds, or escalation behavior.
- Removing project-level installs entirely.

## Real-world verification

After the fix, in a project with both installs:

- Dispatch a `kiki-*` task and confirm `.agentic/kiki/routing_log.jsonl` grows by exactly one line.
- Trigger a quiet or looping subagent and confirm `.agentic/kiki/health_log.jsonl` contains exactly one entry per incident.

## Reporter notes

The reporter's setup uses the global Kiki install as the canonical source; the project-local plugin in the `scientist` repo has been removed. A future `kiki update` in that repo will recreate `.opencode/plugins/kiki.ts` until this fix ships, so it can be used as a real-world test project.
