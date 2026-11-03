# /kiki local model reset — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `/kiki` delete one or all project-local model overrides (falling back to global defaults), and guarantee no Kiki mechanism ever writes implicit local model values while always preserving explicit ones.

**Architecture:** Two new storage functions in `src/cli/opencode-config.ts` remove `agent.<name>.model` via the existing JSONC patch machinery; the TUI menu gains a per-agent "Globales Modell (<name>) verwenden" entry and a project-wide delete-all with native confirm; `installProjectConfig` stops persisting default model values into `.agentic/kiki/config.json` so future default changes cannot leak into local configs.

**Tech Stack:** TypeScript ESM, Vitest, jsonc-parser (existing), type-only `@opencode-ai/plugin/tui`; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-02-kiki-local-model-reset-design.md`

## Global Constraints

- No commits unless explicitly requested (repo AGENTS.md). Do not touch the real user configuration.
- TUI: native `DialogSelect` only, German UI strings, no LLM/client calls, existing generation/busy/active guard pattern.
- Storage: re-read and validate before writing, atomic write only on change, JSONC comments and foreign settings preserved, only `agent.<name>.model` (or the emptied agent entry) is touched.
- Delete is project-scope only in the TUI; global scope stays change-only.
- Verify with `npx vitest run <file>`, then `npm test`, `npm run build`, `git diff --check`.

## Review Focus

1. After deleting a project override the effective model must fall back to the freshly-read global agent/top-level model, never a menu snapshot — Task 1 + Task 3 tests.
2. An agent entry containing only `model` must be removed entirely; an entry with permissions must keep them — Task 1 tests.
3. Delete-all must cover every project config tier (`opencode.json(c)`, `.opencode/opencode.json(c)`) and keep foreign agents — Task 1 test.
4. Init with default models writes zero `model` keys locally; explicit wizard overrides still write; existing local values survive re-init — Task 2 tests.
5. Stale/disposed callbacks and a forged inherit/delete selection in global scope must never write — Task 3 tests.

---

### Task 1: Storage — remove one / all local model overrides

**Files:**
- Modify: `src/cli/opencode-config.ts`
- Test: `tests/cli/model-settings.test.ts`

**Interfaces:**
- Produces:
  - `export interface ModelRemoveResult { file: string; removed?: string; effective?: string }`
  - `export interface ModelRemoveAllResult { files: string[]; removed: { agent: string; model: string }[] }`
  - `export function removeAgentModel(scope: ModelScope, agent: string, context: ModelContext): ModelRemoveResult`
  - `export function removeAllProjectModels(context: ModelContext): ModelRemoveAllResult`

- [ ] **Step 1: Write failing tests in `tests/cli/model-settings.test.ts`** using the existing fixture (globalFile: reviewer `provider/old` + prompt + permission comment; projectFile: reviewer `provider/project` + `permission.read` + `// project note`):
  - `removeAgentModel('project', 'kiki-reviewer', ctx)` → `read(projectFile).agent['kiki-reviewer']` equals `{ permission: { read: 'ask' } }`, text still contains `// project note`, globalFile bytes unchanged, result `{ file: projectFile, removed: 'provider/project', effective: 'provider/old' }`.
  - `removeAgentModel('project', 'kiki-planner', ctx)` (no override) → projectFile bytes unchanged, `result.removed` undefined, `effective` is `'provider/default'` (global top-level).
  - `removeAgentModel('global', 'kiki-reviewer', ctx)` → globalFile reviewer keeps `prompt`/`permission` and `// approved rights`, loses `model`; result `{ file: globalFile, removed: 'provider/old', effective: 'provider/default' }`.
  - agent entry with only a `model` becomes fully removed (`agent['kiki-planner']` undefined afterwards).
  - `removeAllProjectModels(ctx)` with an added `.opencode/opencode.json` containing a kiki `model` plus a foreign agent → both tiers patched, all kiki `model` keys gone, foreign agent untouched, `files` lists both, `removed` lists agent/model pairs.
  - invalid scope/agent and malformed JSONC throw and leave original bytes unchanged.
- [ ] **Step 2: Run `npx vitest run tests/cli/model-settings.test.ts` — expect the new tests to fail (functions missing).**
- [ ] **Step 3: Implement in `src/cli/opencode-config.ts`** beside `setAgentModel`: validate scope via `validateModelScope`, agent via `AGENT_NAMES`; re-read fresh settings (`readOpenCodeSettings`) to compute `removed` (the scope target's current `agent.<name>.model`) and `effective` (project: `global.agent[name].model ?? project.model ?? global.model`; global: `global.model`); patch with `patchValue(text, ['agent', name, 'model'], undefined)` on the scope's `configTarget`, then if the agent object is empty `patchValue(text, ['agent', name], undefined)`; write atomic only on change. `removeAllProjectModels` loops `configFiles(context.projectDirectory)` and removes `model` from every `AGENT_NAMES` entry that has one (dropping emptied entries), collecting per-file results.
- [ ] **Step 4: Run `npx vitest run tests/cli/model-settings.test.ts` — expect PASS.**

### Task 2: Init guarantee — no implicit local model writes, no default models persisted

**Files:**
- Modify: `src/cli/commands/install.ts`
- Test: `tests/cli/init.test.ts`, `tests/cli/global-policy.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_MODELS`, `DEFAULT_CONFIG` from `src/cli/config.ts`; `initializeProjectAgents` from `src/cli/opencode-config.ts`.
- Produces: persisted `.agentic/kiki/config.json` whose `models` omits every entry equal to `DEFAULT_MODELS`.

- [ ] **Step 1: Write failing tests.**
  - `init.test.ts`: after `init(root, { wizard: false })`, `config.models` contains no value equal to any `DEFAULT_MODELS` entry; every `readOpenCodeSettings(root).agent[name]` has no `model` key.
  - `init.test.ts` / direct `installProjectConfig`: config with `models: { standard: 'custom/x', critical: DEFAULT_MODELS.critical, workhorse: DEFAULT_MODELS.workhorse }` persists `models` as `{ standard: 'custom/x' }` only.
  - `global-policy.test.ts`: `initializeProjectAgents(project, DEFAULT_CONFIG, global)` writes no `model` keys; after manually adding a local `model` to `kiki-planner` and re-running with a config whose `models.standard` is `'custom/standard'`, the planner's local model is preserved while `kiki-orchestrator` gets `'custom/standard'`.
- [ ] **Step 2: Run `npx vitest run tests/cli/init.test.ts tests/cli/global-policy.test.ts` — expect the new assertions to fail.**
- [ ] **Step 3: Implement in `src/cli/commands/install.ts`**: in `installProjectConfig`, when writing `config.json`, persist `{ ...config, models: Object.fromEntries(Object.entries(config.models).filter(([key, value]) => value !== DEFAULT_MODELS[key as keyof KikiModels])) }`. No change to `loadConfig` (it still merges defaults for template generation) or to `initializeProjectAgents` (existing local entries already win via the trailing `existing.agent?.[name]` spread).
- [ ] **Step 4: Run both test files — expect PASS.**

### Task 3: TUI menu — inherit option, delete-all, wiring

**Files:**
- Modify: `src/tui/model-menu.ts`, `src/tui/index.ts`
- Test: `tests/tui/model-menu.test.ts`

**Interfaces:**
- `ModelSettings` gains: `remove(scope: ModelScope, agent: string): Promise<ModelRemoveResult>` and `removeAllProject(): Promise<ModelRemoveAllResult>` (imports the types from Task 1).
- `src/tui/index.ts` wires them: `remove: (scope, agent) => removeAgentModel(scope, agent, context())`, `removeAllProject: () => removeAllProjectModels(context())`.

- [ ] **Step 1: Write failing tests in `tests/tui/model-menu.test.ts`.** Extend the fixture: `settings.remove` / `settings.removeAllProject` mocks; make `list` scope-aware (global: reviewer `provider/beta` not inherited, planner `provider/alpha` inherited; project: reviewer `provider/local` with `projectOverride: 'provider/local'`, planner inherited). New tests:
  - project scope → `kiki-reviewer` → model dialog's first option is `{ title: 'Globales Modell (provider/beta) verwenden', value: '__inherit__' }`; selecting it calls `remove('project', 'kiki-reviewer')` once and toasts success containing `provider/beta` and the restart notice.
  - project scope → `kiki-planner` (no override) → no inherit option; options remain exactly the provider model list.
  - global scope → model dialog has no inherit option.
  - project agent list's last option is `Alle lokalen Modell-Zuordnungen löschen`; selecting it opens a confirm dialog (`Ja, alle löschen` / `Abbrechen`); `Ja` calls `removeAllProject` once and toasts the count; `Abbrechen` calls nothing.
  - after `close()`/`dispose()`, selecting `__inherit__` or the delete-all confirm calls neither `remove` nor `removeAllProject`; `remove` rejection shows a generic error toast (no internals) and allows retry.
- [ ] **Step 2: Run `npx vitest run tests/tui/model-menu.test.ts` — expect the new tests to fail.**
- [ ] **Step 3: Implement in `src/tui/model-menu.ts`:** module constant for the reserved inherit value; in `showModels`, when `scope === 'project'` and the row has `projectOverride`, prepend the inherit option titled with the global row's model (`settings.list('global')` same agent, fallback `'OpenCode-Standard'`) and route its selection to a guarded async `remove` path mirroring `save`; in `showAgents`, when `scope === 'project'`, append the delete-all option which opens a confirm `show(...)` before calling guarded `removeAll`. Keep the `active(token)`/`busy` guards and generic error toasts. Wire the two new `ModelSettings` members in `src/tui/index.ts`.
- [ ] **Step 4: Run `npx vitest run tests/tui/model-menu.test.ts` — expect PASS (existing tests included).**

### Task 4: Docs

**Files:**
- Modify: `README.md`, `CHANGELOG.md`

- [ ] **Step 1: Update the `/kiki` section of `README.md`:** document "Globales Modell (<name>) verwenden" in the project model dialog and "Alle lokalen Modell-Zuordnungen löschen" in the project agent list (only `model` keys removed, restart required); adjust the project-setup bullet to state `.agentic/kiki/config.json` stores only non-default model preferences and init writes no local model values unless explicitly chosen.
- [ ] **Step 2: Add `CHANGELOG.md` Unreleased → Added entries** for the two `/kiki` delete actions and the no-implicit-local-models guarantee.
- [ ] **Step 3: Run `npm test`, `npm run build`, `git diff --check` — all green.**
