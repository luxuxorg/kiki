# /kiki Model Menu Implementation Plan

> Execute natively in this session using executing-plans and test-driven-development.
> The user approved the written design and requested implementation. Do not commit,
> install into the real user configuration or restore unrelated working-tree changes.

**Goal:** `/kiki` opens native agent/model selection, defaulting to global changes.

**Architecture:** Reuse the CLI JSONC editor for narrow model reads/writes. A separate
TUI module registers the command and uses host-provided dialogs and model data.
Global install/update registers a stable loader in `tui.json(c)`; the existing
server plugin remains unchanged.

**Tech Stack:** TypeScript ESM, Vitest, existing jsonc-parser, type-only
`@opencode-ai/plugin/tui` from version 1.18.35; no JSX or new production dependency.

**Spec:** `docs/superpowers/specs/2026-11-02-kiki-model-menu-design.md`

## Global constraints

- One `/kiki` menu, only global/project model actions; global is selected by default.
- Native `DialogSelect`; no LLM calls, no active-chat model changes, no routing file.
- Only `agent.<name>.model` is changed; retain rights, comments and foreign settings.
- Keep project overrides when saving globally and explicitly report their precedence.
- Configuration changes require restarting OpenCode; do not promise hot reload.
- Preserve existing uncommitted global-policy work and user-deleted local copies.

## Review focus

1. Project override exists during global save: keep it and report it (storage/menu tests).
2. Config edited after opening the menu: re-read before narrow atomic write (storage test).
3. Escape/disposal or duplicate model callback: no accidental or repeated save (menu tests).
4. Empty/deprecated provider list: show no invalid choices and never write (menu tests).
5. Existing TUI JSONC/plugins/tuple options: preserve them and register Kiki once (install tests).

## Task 1: Native model settings

Files: `src/cli/opencode-config.ts`, `tests/cli/model-settings.test.ts`.

Interfaces:
- `ModelScope = 'global' | 'project'`.
- `ModelContext = { projectDirectory: string; globalConfigDirectory: string }`.
- `AgentModelRow = { name: string; model?: string; inherited: boolean; projectOverride?: string }`.
- `listAgentModels(scope: ModelScope, context: ModelContext): AgentModelRow[]`.
- `setAgentModel(scope: ModelScope, agent: string, model: string,
  availableModels: readonly string[], context: ModelContext): { file: string; projectOverride?: string }`.

- [x] Write tests using isolated global/project JSONC fixtures. Assert only the
  selected model changes, custom permission/comment survives, global save retains
  local `project/model`, a newly added foreign setting survives a stale-menu save,
  invalid agent/model/scope and malformed JSONC leave original bytes unchanged.
- [x] `npx vitest run tests/cli/model-settings.test.ts`: observe missing feature.
- [x] Add functions beside `patchAgents`; validate agent against `AGENT_NAMES` and
  model against the provided available IDs; read fresh settings before patching
  the selected model only. Global display uses global values; project display
  falls back to global agent/top-level model and marks inheritance.
- [x] Run focused tests and confirm pass.

## Task 2: Native menu

Files: `src/tui/model-menu.ts`, `src/tui/index.ts`, `tests/tui/model-menu.test.ts`.

Interfaces:
- `registerKikiMenu(api: TuiPluginApi, settings: ModelSettings): void`.
- `ModelSettings = { list(scope): AgentModelRow[]; save(scope, agent, model,
  availableModels): Promise<{ file: string; projectOverride?: string }> }`.
- Default TUI export `{ id: 'kiki', tui: TuiPlugin }`; use `api.state.path.config`
  for global config and worktree (directory when worktree is `/`) for project scope.

- [x] Test a minimal host API fixture: slashName `kiki`; default current `global`;
  selecting global → reviewer → available model calls save exactly once, with
  title `Modell ändern — global`. Project option calls save with `project`.
- [x] Add cancellation/disposal, double callback, save-error retry, current model,
  empty model list and deprecated-model tests. Assert no client LLM methods called.
- [x] `npx vitest run tests/tui/model-menu.test.ts`: observe expected failures.
- [x] Implement dialogs via `api.ui.dialog.replace(() => api.ui.DialogSelect(...))`.
  Register with `api.keymap.registerLayer`, namespace `palette`, slashName `kiki`.
  Offer valid host provider/model IDs with provider name and native filtering.
  Guard callbacks after closure/replacement/disposal and lock pending saves.
  Save success closes the dialog and toasts agent, model, scope, restart notice;
  global success also mentions a remaining project override. Failure toasts no
  raw config content and retains a usable model selection.
- [x] Run menu tests and `npm run build`; the SDK dependency is type-only.

## Task 3: Global installation and integration

Files: `src/cli/opencode-config.ts`, `tests/cli/tui-install.test.ts`,
`tests/integration/kiki-tui.test.ts`, README, CHANGELOG, package.json, dist output.

Interfaces: `installGlobalFiles` additionally installs `kiki/tui.js` (stable loader
re-exporting the packaged `dist/tui/index.js` default) and adds `./kiki/tui.js` to
global `tui.json` or the existing higher-precedence `tui.jsonc` only when absent.
The entrypoint remains outside auto-discovered server plugin directories.

- [x] Test preservation of theme, keybindings, foreign plugins and tuple options;
  repeat install/update and assert one resolved Kiki registration. Invalid TUI
  configuration must fail validation before any installation writes.
- [x] `npx vitest run tests/cli/tui-install.test.ts`: observe missing feature.
- [x] Prepare TUI JSONC edits before installation writes; use existing atomic JSONC
  utilities, stable loader path and a file URL to the installed package module.
  Preserve existing explicit plugin_enabled settings. Add `./tui` package export.
- [x] Update README with `/kiki` flow, global/project behavior, activation by
  `kiki update` + restart, and preservation of current-chat model and rights.
- [x] Run full `npm test`, `npm run build`, `git diff --check` and production audit.
- [x] Test the built loader in an isolated child process. Exercise the real
  OpenCode TUI in a fixture HOME/XDG with a PTY: type `/kiki`, open global action
  and agent selection, save a fixture model and exit; assert menus render without
  plugin failures and only the selected global model changed.
  Never load or print actual user configuration.
- [x] Request read-only code review, address correctness findings, then re-run
  affected checks and report activation commands. Keep changes uncommitted.

## Verification results

- `npm run build`: passed.
- `OPENCODE_TEST_BINARY=/home/lutz/.opencode/bin/opencode npm test`: 163 tests,
  22 files passed. Both real OpenCode 1.18.35 integration tests ran, including
  actual `/kiki` agent/model selection and a persisted global model change.
- PTY assertions use a small screen reader because OpenTUI emits incremental
  cursor-positioned updates rather than complete text frames.
- A follow-up native run also passed with a higher-precedence `tui.jsonc` plugin
  array, confirming that OpenCode retains the lower-tier Kiki plugin registration.
- `git diff --check`: passed. `npm audit --omit=dev`: zero vulnerabilities.
- Full development audit: 12 findings (baseline 8; additional 4 are transitive
  findings through the exact OpenCode SDK type-only dev dependency). No SDK code
  is imported by the shipped TUI runtime and no production dependency was added.
- Read-only code review: PASS, no blockers. Existing global-policy work and
  user-migrated local-file deletions were preserved; no live global install or commit.
- Activation: `kiki update`, restart OpenCode, then `/kiki`.
