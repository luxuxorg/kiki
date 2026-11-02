# Global + Project Plugin Deduplication — Design Spec

**Date:** 2026-11-02
**Status:** Draft — pending user review
**Related task:** `docs/tasks/2026-11-02-global-project-plugin-dedup.md`
**Related specs:** `2026-06-30-global-kiki-install-design.md`, `2026-08-18-kiki-subagent-watchdog-design.md`
**Applies to:** Kiki v2.1.0, OpenCode plugin system v1.15.13

---

## Context

Kiki can be installed at two scopes:

- **Global:** `kiki install [--force]` writes `~/.config/opencode/plugins/kiki.ts` (and global agents/defaults).
- **Project:** `kiki init [path]` / `kiki update [path]` writes `<project>/.opencode/plugins/kiki.ts` via `writeOpencodeFiles()`.

OpenCode loads plugins from four locations in this order:

1. Global config plugins (`~/.config/opencode/opencode.json`)
2. Project config plugins (`opencode.json`)
3. Global plugin directory (`~/.config/opencode/plugins/`)
4. Project plugin directory (`.opencode/plugins/`)

OpenCode does **not** deduplicate plugins by name. When both a global and a project Kiki install exist, the generated `kiki.ts` is loaded twice in the same OpenCode process. Every hook runs twice. Observed consequences (from the task doc):

- `task` dispatches to `kiki-*` subagents append **two** entries to `.agentic/kiki/routing_log.jsonl`, 1–3 ms apart.
- Both plugin instances start their own watchdog `setInterval`, scanning the same sessions and producing duplicate `watchdog-quiet` / `watchdog-abort` entries in `.agentic/kiki/health_log.jsonl` and duplicate `client.session.abort` calls for the same session.

The generated plugin is produced by `generatePluginTemplate()` in `src/cli/config.ts` and is byte-identical for both scopes. It is self-contained (only `fs`/`path` imports plus the inlined `WATCHDOG_SOURCE`), valid TypeScript under non-strict `tsc`, and contains zero runtime dependencies.

## Goals

1. Exactly **one** effective Kiki plugin instance per OpenCode process per project directory, regardless of how many plugin copies OpenCode loads.
2. Exactly **one** routing log entry per `task` dispatch to a `kiki-*` subagent.
3. Exactly **one** watchdog interval, one health-log writer, and one abort path per incident.
4. Works correctly for all three configurations: global-only, project-only, both-installed.
5. Deterministic, documented precedence when both copies are loaded. Preferred default (per task doc): the **global** copy is canonical.
6. A visible diagnostic when the two loaded copies differ in version; never silently run an older implementation without surfacing it.
7. Existing single-install users see no behavior change.
8. The generated plugin remains self-contained (zero runtime deps), valid TypeScript, and `kiki init` / `kiki update` / `kiki install` remain idempotent.
9. No changes to OpenCode core.

## Non-Goals

- Removing or discouraging project-level installs.
- Changing watchdog detection logic, thresholds, or escalation behavior.
- Deduplicating OpenCode agents (agents already shadow correctly per scope).
- Cross-process coordination (each OpenCode process is independent; `globalThis` does not span processes).
- Fixing the pre-existing unref'd-interval-survives-reload behavior of the watchdog (out of scope; the dedup design does not make it worse and explicitly avoids relying on teardown).

## Current Architecture

### Generated plugin (`generatePluginTemplate()`, `src/cli/config.ts:532`)

The template is a backtick-delimited string that emits:

- `import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs'`
- `import { join, dirname } from 'path'`
- The inlined `WATCHDOG_SOURCE` (a self-contained ES5 `createWatchdog(deps)` factory).
- `const DEFAULT_HEALTH = {...}` baked from `DEFAULT_HEALTH`.
- Helpers: `isPositiveInt`, `sanitizeHealth`, `loadHealthConfig(directory)`, `RoutingLogEntry`.
- `export default function KikiPlugin({ client, directory })` which:
  1. Resolves `root = directory || process.cwd()`.
  2. Loads health config from `<root>/.agentic/kiki/config.json`.
  3. Creates and **starts** the watchdog (`watchdog.start()`; interval is `unref`'d).
  4. Returns hooks:
     - `'tool.execute.before'` — if `input.tool === 'task'` and `subagent_type` starts with `kiki-`, appends a `RoutingLogEntry` to `join(process.cwd(), '.agentic/kiki/routing_log.jsonl')`.
     - `event` — forwards to `watchdog.handleEvent(event)`.

There is no version constant, no scope marker, and no ownership guard. Both the global and project copies execute this body verbatim.

### Wiring

- `installGlobal()` (`src/cli/commands/install.ts:40`) calls `generateAllTemplates(DEFAULT_CONFIG)` and writes `templates.plugin` to `~/.config/opencode/plugins/kiki.ts`.
- `writeOpencodeFiles(targetPath, config)` (`src/cli/config.ts:742`) calls `generateAllTemplates(config)` and writes `templates.plugin` to `<project>/.opencode/plugins/kiki.ts`.
- `update()` (`src/cli/commands/update.ts:13`) calls `writeOpencodeFiles(targetPath, config)`.
- `generateAllTemplates(config)` (`src/cli/config.ts:725`) delegates to `generatePluginTemplate()` with no arguments.

### Watchdog

`createWatchdog` (inlined from `src/plugin/watchdog-source.ts`) holds its own `sessions` Map and a single `setInterval` started by `start()`. `start()` is idempotent within one instance (`if (interval) return`) but not across instances. The interval is `unref`'d so it never keeps the process alive; there is no teardown hook and `stop()` is unused by design.

### Tests

- `tests/cli/plugin-template.test.ts` asserts template contents (watchdog inlined, health baked, hooks present, no backticks/`${` in `WATCHDOG_SOURCE`).
- `tests/integration/watchdog-plugin-syntax.test.ts` runs `tsc --noEmit` (non-strict) on the generated plugin file and asserts `writeOpencodeFiles` produces a watchdog-enabled plugin on disk.

## Proposed Design

### Core mechanism: runtime ownership via a `globalThis` sentinel

Add a process-wide ownership registry on `globalThis`, keyed by **resolved project root**. The first plugin instance to load for a given root becomes the **owner** and runs the watchdog + routing logger. Any subsequent instance for the same root becomes a **non-owner** and registers no-op hooks (optionally emitting a diagnostic first).

This is chosen over install-time skip (see Alternatives) because:

- Installs can be added or removed independently at any time; install-time coordination cannot guarantee runtime consistency.
- It is robust to manual file copies, symlinks, and partial installs.
- OpenCode's documented load order (global plugins before project plugins) makes "first-loaded wins" equivalent to "global wins" deterministically — satisfying the task's preferred precedence without cross-scope coordination.

### Identity key

The registry is stored at `globalThis[Symbol.for('kiki.plugin')]` as a plain object mapping `root → OwnershipRecord`. Using `Symbol.for` (rather than a unique symbol) ensures both plugin copies — even if loaded as separate module instances — address the same registry slot.

The **root** used as the key is `path.resolve(directory || process.cwd())`. Rationale:

- Both the global and project plugin instances receive the same `directory` (the project root) from OpenCode in the documented model, and both share `process.cwd()` (evidence: both currently write to the project's `routing_log.jsonl`).
- Keying by the resolved root matches the watchdog's existing notion of "the project" (it operates on `directory`).
- `path.resolve` normalizes trailing slashes, relative segments, and symlinks enough for the single-process case; perfect canonicalization across mounts is out of scope.

If `directory` is falsy, fall back to `process.cwd()`; both resolve to the same absolute path in OpenCode's usage.

### Precedence and scope identification

The generated plugin will embed two new constants:

- `KIKI_PLUGIN_VERSION` — the Kiki version that produced this plugin file.
- `KIKI_PLUGIN_SCOPE` — `'global'` or `'project'`, baked at generation time.

`generatePluginTemplate()` gains a parameter so the generator can stamp the scope:

```ts
generatePluginTemplate(opts: { scope: 'global' | 'project'; version: string }): string
```

`generateAllTemplates(config, scope, version?)` threads the scope through; `writeOpencodeFiles(targetPath, config, scope = 'project')` defaults to project scope (its only existing caller path); `installGlobal()` passes `'global'`. Defaults preserve backward compatibility for existing tests that call `generatePluginTemplate()` with no arguments (default scope `'project'`, default version `KIKI_VERSION`).

**Precedence rule:** first-loaded instance wins. Because OpenCode loads global plugins before project plugins, the global instance acquires ownership and the project instance yields. This is deterministic given the documented load order. The scope is recorded in the `OwnershipRecord` for diagnostics; if OpenCode ever changes its load order, exactly-one-owner still holds — only which scope wins changes. This trade-off is acceptable and documented.

### Version source

Add `export const KIKI_VERSION = '2.1.0'` to `src/cli/config.ts`, maintained alongside `package.json` (the release checklist must update both). This is preferred over reading `package.json` at runtime because the published package ships only `dist/` (per `package.json` `"files": ["dist/"]`), so a globally installed CLI cannot reliably read its own `package.json`.

The generator bakes `KIKI_VERSION` into the template as a string literal:

```ts
const KIKI_PLUGIN_VERSION = '2.1.0';
const KIKI_PLUGIN_SCOPE = 'global'; // or 'project'
```

### Ownership record shape

```ts
interface OwnershipRecord {
  root: string;           // resolved project root used as the registry key
  scope: 'global' | 'project';
  version: string;        // KIKI_PLUGIN_VERSION of the owner
  startedAt: number;      // Date.now() at acquisition, for diagnostics
}
```

### Acquire / yield flow

```ts
const KIKI_OWNERSHIP_KEY = Symbol.for('kiki.plugin');

function acquireOwnership(root: string): OwnershipRecord | null {
  const registry: Record<string, OwnershipRecord> =
    (globalThis as any)[KIKI_OWNERSHIP_KEY] || {};
  if (registry[root]) return null;            // already owned
  const record: OwnershipRecord = {
    root,
    scope: KIKI_PLUGIN_SCOPE,
    version: KIKI_PLUGIN_VERSION,
    startedAt: Date.now(),
  };
  registry[root] = record;
  (globalThis as any)[KIKI_OWNERSHIP_KEY] = registry;
  return record;
}

function getOwner(root: string): OwnershipRecord | undefined {
  const registry: Record<string, OwnershipRecord> =
    (globalThis as any)[KIKI_OWNERSHIP_KEY] || {};
  return registry[root];
}
```

### Version-mismatch diagnostic

When a non-owner instance loads and the owner's `version` differs from its own `KIKI_PLUGIN_VERSION`, it emits a best-effort diagnostic to three channels (each in its own `try/catch`):

1. `console.warn(...)` — visible in OpenCode's process logs.
2. A `health_log.jsonl` entry at `<directory>/.agentic/kiki/health_log.jsonl` with `event: 'plugin-dedup-version-mismatch'`, `ownerScope`, `ownerVersion`, `thisScope`, `thisVersion`.
3. `client.app.log({ body: { service: 'kiki-plugin', level: 'warn', message: 'plugin-dedup-version-mismatch', extra: {...} } })` — the same channel the watchdog already uses as a fallback.

The message tells the user how to realign: run `kiki install --force` (to refresh the global copy) and/or `kiki update <project>` (to refresh the project copy).

When versions **match**, the non-owner yields silently (no diagnostic) — the common case where both installs are current.

The diagnostic functions and acquire/yield logic are inlined directly into the generated plugin template (keeping it self-contained). Because the template is a backtick-delimited literal, the inlined code must avoid backticks and `${` sequences; string concatenation with single quotes is used for the diagnostic message (mirroring the constraint already enforced on `WATCHDOG_SOURCE`).

### Default export structure

```ts
export default function KikiPlugin({ client, directory }: { client: any; directory: string }) {
  const root = path.resolve(directory || process.cwd());

  // --- ownership gate ---
  const ownership = acquireOwnership(root);
  if (!ownership) {
    const owner = getOwner(root);
    if (owner && owner.version !== KIKI_PLUGIN_VERSION) {
      reportVersionMismatch(root, owner, client, directory);
    }
    // Non-owner: register no-op hooks with the same shape, so the plugin
    // contract is stable and OpenCode never sees a missing hook name.
    return {
      'tool.execute.before': async (_input: any, _output: any) => {},
      event: async (_args: { event: any }) => {}
    };
  }

  // --- owner path (unchanged behavior) ---
  const health = loadHealthConfig(root);
  const watchdog = createWatchdog({ client, directory: root, config: health, now: () => Date.now() });
  watchdog.start();

  return {
    'tool.execute.before': async (input: any, output: any) => {
      if (input.tool !== 'task') return;
      const subagentType = output.args?.subagent_type ?? '';
      if (!subagentType.startsWith('kiki-')) return;
      const logPath = join(process.cwd(), '.agentic', 'kiki', 'routing_log.jsonl');
      const dir = dirname(logPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const entry: RoutingLogEntry = {
        timestamp: new Date().toISOString(),
        agent: subagentType,
        model: output.args?.model ?? 'unknown',
      };
      appendFileSync(logPath, JSON.stringify(entry) + '\n');
    },
    event: async ({ event }: { event: any }) => {
      watchdog.handleEvent(event);
    }
  };
}
```

### Ownership boundaries (routing logger AND watchdog)

Both the routing logger and the watchdog are guarded by the **same** ownership decision because they both live behind the ownership gate in the default export. The non-owner returns before `createWatchdog` is ever called and before the real `tool.execute.before` hook is registered. There is no path where one is owned and the other is not.

### Lifecycle robustness

- **Multiple projects per process:** the registry is keyed by resolved root, so each project gets its own owner. (OpenCode typically runs one project per process; the design handles the multi-project case correctly regardless.)
- **Plugin reload within a process:** the `Symbol.for` registry persists across module reloads. A reloaded instance sees the existing owner and yields, preventing a second watchdog interval. The original owner's interval and hooks continue to run (this is the pre-existing, documented "load-once, unref'd, no teardown" behavior — the dedup design does not change it and does not depend on tearing it down).
- **Stale sentinels across processes:** not a concern. `globalThis` is per-process; a fresh OpenCode process starts with an empty registry.
- **Non-owner hook shape:** the non-owner returns no-op implementations of `'tool.execute.before'` and `event`. Returning `{}` would also work, but returning no-op hooks keeps the plugin's contract identical across owner/non-owner and makes the behavior explicit and testable.
- **Shutdown cleanup:** unchanged. The watchdog interval is `unref`'d and dies with the process; no explicit `stop()` is required, matching the existing comment in the template.

## Alternatives Considered

### A. Install-time skip: do not generate a project plugin when a global install is detected

- **Pros:** zero runtime cost; no inlined dedup code.
- **Cons:** installs can be added/removed later in either order; a project plugin generated before a global install would still duplicate; manual copies/symlinks bypass the check; requires `installGlobal`/`init`/`update` to probe `~/.config/opencode/plugins/kiki.ts` and coordinate. Brittle.
- **Decision:** rejected as the primary mechanism. The runtime guard handles every ordering and every copy path. (An optional install-time *warning* — "a global Kiki plugin also exists; the runtime will deduplicate" — is a possible future enhancement but not required by the task.)

### B. Newer-version-wins instead of first-loaded-wins

- **Pros:** always runs the latest code when versions differ.
- **Cons:** requires reliable semver comparison inlined into a self-contained plugin; introduces a takeover path where the owner must be stopped and replaced mid-process (teardown complexity the watchdog explicitly avoids); load order would no longer guarantee global-canonical. The task only asks for a diagnostic on mismatch, not for picking the newer copy.
- **Decision:** rejected. First-loaded-wins (global canonical) plus a diagnostic satisfies the requirement deterministically.

### C. Key the registry by `process.cwd()` instead of `directory`

- **Pros:** matches the routing log's identity exactly.
- **Cons:** the watchdog keys on `directory`; if OpenCode ever passed different `directory` values to the two instances while sharing cwd, the watchdog would still double-start. In the documented model `directory === cwd === project root` for both instances, so the two keys are equivalent.
- **Decision:** key by `path.resolve(directory || process.cwd())` for consistency with the watchdog's notion of "the project". Documented assumption: in OpenCode's model both instances receive the same `directory` (the project root).

### D. Diagnostic-only hooks for the non-owner (instead of no-op hooks)

- **Pros:** lets the non-owner log every dispatch it *would* have served.
- **Cons:** reintroduces per-dispatch work for the non-owner, risks new log noise, and provides no functional benefit beyond the one-time version-mismatch diagnostic already emitted at load.
- **Decision:** rejected. The non-owner emits its diagnostic once at load and then stays silent.

## Edge Cases

- **Both copies, identical versions (common case):** non-owner yields silently; one routing log line per dispatch; one watchdog interval. ✓
- **Both copies, different versions:** non-owner emits the mismatch diagnostic (console + health_log + app.log) and yields. Owner runs normally. ✓
- **Global only:** owner acquires; full behavior. ✓
- **Project only:** owner acquires; full behavior. ✓
- **OpenCode reloads plugins within a process:** registry persists; reloaded instance yields. No second interval. The original owner's hooks/interval continue (pre-existing behavior). ✓
- **Multiple projects in one process (hypothetical):** each root gets its own owner; no cross-project interference. ✓
- **`directory` falsy:** falls back to `process.cwd()`; both instances see the same value. ✓
- **`globalThis[Symbol.for('kiki.plugin')]` somehow pre-set to a non-object:** `acquireOwnership` treats falsy/missing as empty registry; a non-object truthy value would throw on `registry[root]` — wrap the read in `try/catch` and treat failure as empty registry, to be defensive. (Documented; the implementer should add this guard.)
- **Health log directory not writable:** diagnostic `appendFileSync` is in `try/catch`; `console.warn` and `client.app.log` still fire. ✓
- **`client` undefined for the non-owner (unlikely):** `client.app.log` call is in `try/catch` with optional chaining; `console.warn` + health_log still fire. ✓
- **Version constant drift:** `KIKI_VERSION` in `config.ts` must match `package.json`. Release checklist item added below.

## Test Strategy

### Unit tests (`tests/cli/plugin-template.test.ts`, extended)

- `generatePluginTemplate({ scope: 'project', version: KIKI_VERSION })` contains `KIKI_PLUGIN_SCOPE = 'project'` and `KIKI_PLUGIN_VERSION = '<KIKI_VERSION>'`.
- `generatePluginTemplate({ scope: 'global', version: KIKI_VERSION })` contains `KIKI_PLUGIN_SCOPE = 'global'`.
- `generatePluginTemplate()` (no args) defaults to scope `'project'` and `KIKI_VERSION` (backward compat).
- Template contains `Symbol.for('kiki.plugin')`, `acquireOwnership`, `getOwner`, `reportVersionMismatch`.
- Template still contains the existing watchdog + routing-logger wiring (existing assertions unchanged).
- The inlined dedup code contains no backticks and no `${` sequences (mirror the existing `WATCHDOG_SOURCE` assertion), so it cannot break the outer template literal.

### Unit tests (new file, e.g. `tests/cli/plugin-dedup.test.ts`)

Use Node's `vm` module (or `await import` of a written temp file) to load the generated plugin default export into a context with a controllable `globalThis`. Between cases, clear `globalThis[Symbol.for('kiki.plugin')]`.

- **Single load (global only):** invoke `KikiPlugin({ client, directory })` once; assert the returned `tool.execute.before` hook, when called with a `task`/`kiki-*` payload, appends exactly one line to `routing_log.jsonl`. Assert a watchdog interval was started (mock `createWatchdog` via a spy on `setInterval`, or assert on a counter).
- **Single load (project only):** same as above with scope `'project'`.
- **Double load (global + project, same root, same version):** invoke `KikiPlugin` twice with the same `directory`. Assert the second call returns no-op hooks. Assert only one `routing_log.jsonl` line is appended when both instances' `tool.execute.before` hooks are invoked. Assert `setInterval` was called exactly once. Assert no diagnostic is emitted.
- **Double load, version mismatch:** first call with version `'2.1.0'`, second call with version `'2.0.0'` (use the `version` parameter to generate two different templates, or stub `KIKI_PLUGIN_VERSION`). Assert the second call writes a `plugin-dedup-version-mismatch` entry to `health_log.jsonl` and calls `console.warn`. Assert the second call still returns no-op hooks.
- **Different roots:** two loads with different `directory` values both acquire ownership; both start their own watchdog; both write to their own routing log. Confirms multi-project isolation.

### Integration test (`tests/integration/watchdog-plugin-syntax.test.ts`, extended)

- The existing `tsc --noEmit` (non-strict) check must still pass on the generated plugin (the inlined dedup code must be syntactically valid TS).
- Add a case that generates both a `'global'` and a `'project'` plugin file, writes them to a temp dir, and type-checks both.

### Real-world verification (from the task doc)

- In a project with both installs: dispatch a `kiki-*` task; confirm `routing_log.jsonl` grows by exactly one line.
- Trigger a quiet/looping subagent; confirm `health_log.jsonl` contains exactly one entry per incident and only one abort is attempted.

## Acceptance Criteria

1. `generatePluginTemplate()` accepts `{ scope, version }` and stamps both into the generated file; `generateAllTemplates(config, scope, version?)` and `writeOpencodeFiles(targetPath, config, scope = 'project')` thread the scope through; `installGlobal()` passes `'global'`.
2. The generated plugin acquires ownership via `globalThis[Symbol.for('kiki.plugin')]` keyed by resolved root; the first load for a root owns the watchdog and routing logger; subsequent loads for the same root return no-op hooks.
3. In the both-installed configuration with identical versions, exactly one routing log line is appended per `task` dispatch and exactly one watchdog interval is running.
4. In the both-installed configuration with differing versions, the non-owner emits a `plugin-dedup-version-mismatch` diagnostic to `console.warn`, `health_log.jsonl`, and `client.app.log` (best-effort), then yields.
5. Global-only and project-only configurations behave exactly as before (single owner, full hooks).
6. `kiki init`, `kiki update`, and `kiki install --force` remain idempotent.
7. The generated plugin remains self-contained (only `fs`/`path` imports + inlined watchdog), valid TypeScript under the existing non-strict `tsc --noEmit` check, and free of backticks/`${` in inlined code.
8. `npm test`, `npm run build`, the generated-plugin `tsc` check, and `kiki doctor` all pass.
9. `KIKI_VERSION` is added to `src/cli/config.ts` and matches `package.json`; a release-checklist note is added to keep them in sync.

## Risks

- **Assumption: OpenCode passes the same `directory` to both plugin instances.** Evidence (shared `routing_log.jsonl` writes) strongly supports this, but it is not contractually documented by OpenCode. If it ever changes, dedup by `directory` could fail. Mitigation: the diagnostic and the "exactly one owner per root" property still hold; only the cross-scope dedup would weaken. Documented as an assumption; the implementer should verify against a real both-installed project during implementation.
- **Assumption: OpenCode loads global plugins before project plugins.** This is documented in the task doc and matches observed behavior. If it changes, precedence flips to project-canonical but the dedup still works. Acceptable.
- **Version constant drift.** `KIKI_VERSION` in `config.ts` can drift from `package.json` if a release forgets to update both. Mitigation: a release-checklist note and (optionally, future work) a unit test that asserts `KIKI_VERSION` equals the version read from `package.json` at test time (tests have filesystem access to the repo root, unlike a globally installed CLI).
- **Inlined-code template-literal safety.** Any backtick or `${` accidentally introduced into the inlined dedup code will break the outer template literal. Mitigation: a unit test asserts the dedup code region contains no backticks/`${`, mirroring the existing `WATCHDOG_SOURCE` assertion.
- **`globalThis` pollution.** Adding a `Symbol.for` key is intentional and shared across Kiki copies. It is namespaced (`'kiki.plugin'`) and contains only serializable diagnostic data. No cleanup is needed across processes (each process starts fresh).
- **Non-owner hooks and future hook names.** If OpenCode introduces new hook names that the Kiki plugin should implement, the non-owner's no-op hook set must be updated in lockstep. Mitigation: the non-owner returns the same hook names as the owner; any new hook added to the owner must be mirrored as a no-op in the non-owner branch. The implementer should add a code comment making this requirement explicit.

## File-Level Change Summary (for the planner)

- **`src/cli/config.ts`**
  - Add `export const KIKI_VERSION = '2.1.0';` (matching `package.json`).
  - Change `generatePluginTemplate(): string` → `generatePluginTemplate(opts: { scope?: 'global' | 'project'; version?: string } = {}): string`. Default scope `'project'`, default version `KIKI_VERSION`.
  - Inline `KIKI_PLUGIN_VERSION` and `KIKI_PLUGIN_SCOPE` constants, the `KIKI_OWNERSHIP_KEY` symbol, `acquireOwnership`, `getOwner`, and `reportVersionMismatch` into the template.
  - Wrap the existing default-export body in the ownership gate; add the no-op-hook return for the non-owner path.
  - Change `generateAllTemplates(config: KikiConfig)` → `generateAllTemplates(config: KikiConfig, scope: 'global' | 'project' = 'project', version: string = KIKI_VERSION): GeneratedTemplates`.
  - Change `writeOpencodeFiles(targetPath, config)` → `writeOpencodeFiles(targetPath, config, scope: 'global' | 'project' = 'project')`.
- **`src/cli/commands/install.ts`**
  - `installGlobal()` calls `generateAllTemplates(DEFAULT_CONFIG, 'global')`.
  - `installProject()` unchanged (does not generate the plugin file).
- **`src/cli/commands/update.ts`**
  - `update()` calls `writeOpencodeFiles(targetPath, config)` — unchanged (default scope `'project'` is correct).
- **`tests/cli/plugin-template.test.ts`**
  - Extend with scope/version assertions and dedup-code presence assertions; add the no-backticks/`${` assertion for the inlined dedup region.
- **`tests/cli/plugin-dedup.test.ts` (new)**
  - VM/shared-`globalThis` tests for the three configurations plus version mismatch and multi-root isolation.
- **`tests/integration/watchdog-plugin-syntax.test.ts`**
  - Add a `tsc --noEmit` case for the `'global'`-scoped generated plugin.
- **`docs/` (release checklist / DECISIONS)**
  - Note that `KIKI_VERSION` in `src/cli/config.ts` must be updated alongside `package.json` on every release. (Location to be chosen by the planner; likely `docs/DECISIONS.md` or the repo README release section.)

## Open Questions for the Planner / Human

None blocking. The design resolves every decision the task doc raises. The two runtime assumptions above (OpenCode's `directory` argument and load order) are documented and should be confirmed against a real both-installed project during implementation; if either is violated, the dedup still produces exactly one owner per root but the precedence or dedup scope may need revisiting.
