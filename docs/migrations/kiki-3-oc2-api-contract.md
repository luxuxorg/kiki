# Kiki 3.0.0 / OpenCode 2.2.6 API contract

Status: **pinned for Tasks 3–11** (Task 2 deliverable; Task 12 documentation update).
All facts below were verified on 2026-11-09 against the **published**
`@opencode/plugin@2.2.6` tarball and its declared dependencies, with tagged upstream
source (`anomalyco/opencode` tag `v2.2.6`) used only to cross-check migrations, config
normalization, CLI commands and skill discovery. Nothing here is inferred from OC1
types. Task 11 exercised the pinned package and real 2.2.6 binary, and Task 13 revalidated
the final snapshot and completed the synthetic release rehearsal; this document still
records the contract, not a claim that Kiki 3.0.0 is live-installed or migrated on the
machine.

## 1. Package provenance and integrity

| Field | Verified value |
|---|---|
| Package | `@opencode/plugin@2.2.6` (exact pin, runtime dependency) |
| Registry tarball | `https://registry.npmjs.org/@opencode/plugin/-/plugin-2.2.6.tgz` |
| `dist.shasum` | `141485c8487d861984b549dfbdd9c668347117e0` |
| Registry `dist.integrity` | `sha512-PbQD4aN8YJ8w3gM5L9h2msXppxEAUVj8Ejbaj6MMNb+99jPm7/XM+g2ugZomSNs1XXuab2IlrIKDgbiI49VfLw==` |
| Recomputed tarball integrity | `sha512-PbQD4aN8YJ8w3gM5L9h2msXppxEAUVj8Ejbaj6MMNb+99jPm7/XM+g2ugZomSNs1XXuab2IlrIKDgbiI49VfLw==` (matches) |
| Recomputed tarball SHA-1 | `141485c8487d861984b549dfbdd9c668347117e0` (matches) |
| Tarball size / files | 97,718 bytes / 166 files |
| Repository | `git+https://github.com/anomalyco/opencode.git`, directory `packages/plugin` |
| License | MIT |
| `engines` | **none declared**; Kiki keeps its own runtime floor `node >= 18.0.0` |

Registry npm metadata does not expose a `gitHead`; provenance is the registry tarball
identity above plus the repository/tag cross-check. The published tarball is the
authority for types; tagged source was used only where noted.

Runtime dependency closure (exact pins): `effect@4.1.0`, `@ai-sdk/provider@3.0.8`,
`@opencode/{ai,util,client,schema,protocol}@2.2.6`. Optional peers (host-provided):
`@opencode/theme`, `@opentui/core`, `@opentui/solid`, `electron`, `solid-js`, `vite`,
`vite-plugin-solid`.

The retired `@opencode-ai/plugin@1.18.35` and its graph are absent from the manifest and
lockfile after Task 2. `@opencode/client` is **not** a Kiki direct dependency; use the
types re-exported through `@opencode/plugin` rather than importing a transitive package.

## 2. Package exports and entrypoints

Published `@opencode/plugin@2.2.6` exports:

- `.` → `dist/promise/index.js` / `.d.ts`
- `./tui` → `dist/tui/index.js` / `.d.ts`
- `./host` → `dist/host.js` / `.d.ts`
- `./effect`, `./runtime`, `./gui/*` (GUI entries are experimental; Kiki does not use them)
- `./*` wildcard → `dist/*.js` / `.d.ts`

Kiki 3.0.0 package exports (this task):

- `./server` → `dist/server/index.js`, types `dist/server/index.d.ts`
- `./tui` → `dist/tui/index.js`, types `dist/tui/index.d.ts`
- `.` → `dist/index.js`, types `dist/index.d.ts`
- `bin.kiki` → `dist/cli/index.js`; package `files` ships `dist/`

The server/TUI entrypoints import `@opencode/plugin` at runtime, so it is a **runtime
dependency**, not a devDependency. The TUI entrypoint resolves without executing host
Solid bindings in a plain Node process; OC2 supplies the optional Solid peers.

## 3. Server plugin contract (`@opencode/plugin`)

```ts
import { Plugin } from '@opencode/plugin'

const plugin: Plugin.Plugin = Plugin.define({
  id: 'kiki',
  setup: async (ctx) => {
    // register hooks/subscriptions
    return () => {
      // awaited by OC2 on unload/replace
    }
  },
})
```

- `Plugin.define(plugin: Plugin): Plugin` is an identity/typing helper.
- `Plugin.Plugin = { readonly id: string; readonly setup: (context: Plugin.Context) => Promise<Plugin.Cleanup | void> | Plugin.Cleanup | void }`.
- `Plugin.Cleanup = () => Promise<void> | void`; OC2 awaits cleanup on unload/reload.
- `Plugin.Context` aliases (Task 2 produces the server module using these):
  ```ts
  type ServerContext = Parameters<typeof Plugin.define>[0]['setup'] extends
    (ctx: infer C) => unknown ? C : never
  ```
- Context domains present: `app`, `location`, `options`, `agent`, `aisdk`, `command`,
  `credential` (activate only), `event`, `experimental` (terminal read, generate,
  artifact), `integration`, `mcp`, `model`, `generate` (deprecated), `permission`,
  `plugin` (list only), `provider`, `reference`, `rpc`, `session`, `shell`, `skill`,
  `storage`, `tool`, `vcs`, `websearch`, `worktree`.
- There is **no OC1 compatibility surface**: no `ctx.client`-style mutable V1 adapter, no
  `registration.dispose()` ownership shim, no `globalThis` dedup.

### 3.1 Tool hook (routing logger)

```ts
const registration = await ctx.tool.hook('execute.before', (event) => {
  // event.tool: string
  // event.sessionID: Session.ID
  // event.agent: Agent.ID
  // event.messageID: SessionMessage.ID
  // event.id: Tool.CallID
  // event.input: unknown   (mutable tool input; cast/narrow by tool name)
})
await registration.dispose()
```

- Subagent tool name is `subagent` (not `task`). Input fields:
  `{ agent, description, prompt, model?: "providerID/modelID[#variant]", sessionID?, background? }`.
- Routing log fields remain `{ timestamp, agent: event.input.agent, model: event.input.model ?? 'unknown' }`.

### 3.2 Events and subscription cancellation

```ts
const iterator = ctx.event.subscribe({
  types: ['session.status', 'session.idle', 'session.created'],
  signal, // AbortSignal cancels the iterator
})[Symbol.asyncIterator]()
```

- `ctx.event.subscribe(options?)` returns `AsyncIterable<SelectedEvent<OpenCodeEvent, Type>>`.
- `SubscribeOptions = { types?: readonly Type[]; signal?: AbortSignal; onActivity?: () => void }`.
- Cancellation: pass an `AbortSignal` and/or call `iterator.return()`; cleanup is owned by
  the plugin's returned cleanup. No global timer/state.
- Payloads live in **`.data`**, not OC1 `.properties`. Events also carry
  `{ id, created, type, metadata?, location? }`; durable events carry `durable`.
- V2 event names that replace the OC1 watchdog inventory (all verified in the published
  client union):
  - `session.created` → `data.sessionID`, `data.parentID?`, `data.agent?`, `data.model?`
  - `session.deleted` → `data.sessionID`
  - `session.idle` → `data.sessionID`
  - `session.status` → `data.sessionID`, `data.status.type` (`idle | retry | ...`)
  - `session.execution.started|succeeded|failed|interrupted`
  - `session.step.started|streamed|ended|failed`
  - `session.text.started|delta|ended`
  - `session.reasoning.started|delta|ended`
  - `session.tool.input.started|delta|ended`, `session.tool.called|progress|success|failed`
  - `session.usage.updated`, `session.skill.activated`, `session.shell.started|ended`
- OC1 names (`message.part.updated`, `message.updated`, `session.updated`,
  `session.error`) do not exist in the V2 union and must not be subscribed to.

### 3.3 Session API (child discovery, status, interrupt)

Published `ctx.session` is `Pick<SessionApi, ...>` and exposes:
`list`, `create`, `get`, `remove`, `switchAgent`, `switchModel`, `prompt`, `generate`,
`command`, `compact`, `synthetic`, `interrupt`, `update`, `move`, `context`, plus
`experimental.wait` and `instructions`, and `hook`.

- **Interrupt signature (exact):**
  ```ts
  ctx.session.interrupt({ sessionID: string, resume?: boolean })
  // => Promise<SessionInterruptResponse>
  ```
  The illustrative `interrupt({ path: { id } })` from the design draft is **not** the
  2.2.6 signature.
- **Child discovery:** `const page = await ctx.session.list()` returns
  `{ data: SessionInfo[], cursor }`; filter `SessionInfo.parentID !== undefined`. There is
  no `ctx.session.children`.
- **Status/activity:** derive from the event stream above, not `ctx.session.messages` or
  `ctx.session.status`; **neither `ctx.session.messages` nor `ctx.session.abort` exists**.
  `session.status` and `session.idle` events carry `data.sessionID` and status.
- Raw `client.session.message.*` exists on the low-level client but is **not** exposed on
  the plugin `ctx.session` domain; do not reach through private modules.

## 4. TUI plugin contract (`@opencode/plugin/tui`)

```ts
import { Plugin } from '@opencode/plugin/tui'

const plugin: Plugin.Definition = Plugin.define({
  id: 'kiki',
  setup: (ctx) => {
    return () => {}
  },
})
```

- `Plugin.define(plugin: Plugin.Definition): Plugin.Definition`.
- `Plugin.Context` fields: `options`, `location?`, `app`, `renderer`, `client`, `data`,
  `attention`, `theme`, `themeMode`, `markdown`, `keymap`, `storage`, `ui`.
- `ui.dialog`:
  - `select<Value>(options): Promise<Value | undefined>` — resolves the selected **value**
    (or `undefined` on cancel), not an option/callback.
  - `confirm(options): Promise<boolean | undefined>`
  - `prompt(options): Promise<string | undefined>`
  - `alert(options): Promise<void>`
  - `show/set/clear` for custom render dialogs.
- `keymap.layer(factory: () => KeymapLayer): void`; commands support
  `{ id?, title?, description?, group?, enabled?, bind?, palette?: true, slash?: { name, aliases?, arguments? }, suggested?, run(input?, event?) }`.
  `keymap.mode.push(mode)` returns a cleanup.
- `data.on<Type>(type, handler): () => void` (unsubscribe), `data.listen`, and reactive
  `data.session`, `data.project`, `data.location`, `data.shell` collections.
- `storage.store(key, { initial })` (durable) and `storage.memory(key, { initial })`
  (ephemeral) return `[Store, mutate]`.
- The V1 TUI API (`api.state.path.config`, `api.ui.dialog.replace`, `api.ui.DialogSelect`,
  `api.keymap.registerLayer`, `@opencode-ai/plugin/tui` `TuiPluginModule`) does **not**
  exist in V2.

## 5. Host resolution and skill source roots

### Host resolution (`@opencode/plugin/host`)

```ts
import { Host } from '@opencode/plugin/host'
const entrypoints: Host.Entrypoints = Host.resolve({ directory: '/path/to/plugin' })
// => { server?, tui?, rpc?, gui? }
```

- Local directory targets whose `package.json` has `name` and `exports` resolve through
  those exports (like a published package); otherwise conventional root files are used.
- `Host.packageID({ directory })` returns the package name, or the directory basename.
- `Host.load(entrypoint)` dynamic-imports the entrypoint.

### Skill source roots (v2.2.6)

- For every config directory, OC2 scans `skill/` and `skills/` subdirectories
  (`packages/core/src/config/plugin/skill.ts`).
- Config `skills` is an array of paths; `~/` expands from the global home, other relative
  paths resolve from the location directory.
- Remote skill indexes are cached under `global.cache/skills/<hash>/<skill-name>/` with
  `SKILL.md` (or `<name>.md`) as the entry file.
- Plugin `ctx.skill.list()` returns `{ location, data: Skill.Info[] }`; `Skill.Info` has
  `{ id, name, description?, autoinvoke?, path, content }`. `path` is the source root/file
  to surface in diagnostics. `ctx.skill.transform` can add/update/remove skills.

## 6. V2 native config contract

- Schema URL for newly authored files: **`https://opencode.ai/config.json`**.
  Never replace an existing user `$schema` value.
- File names: global `opencode.json` / `opencode.jsonc`; project tiers add ancestor
  `opencode.json(c)` plus `.opencode/opencode.json(c)`. V1 `config.json` is gone.
- Native keys (published `@opencode/schema/config`):
  - `agents.<id>.model = { providerID, model, variant? }` (singular `agent` is V1 and is
    normalized into `agents`).
  - `agents.<id>.permissions` is an **ordered rule array** of
    `{ action, resource, effect: 'allow' | 'deny' | 'ask' }`; later rules win. V1
    `permission` maps are normalized; action renames are `write|patch|apply_patch → edit`,
    `task → subagent`, `bash → shell`.
  - `plugins` is an array of package specs or `{ package, options }`; V1 `plugin` list is
    migrated. TUI-only plugins are configured separately in `<global config>/cli.json`.
  - `providers` is the native provider map; V1 `provider` entries are normalized into it.
    Native entries use `package`, `name`, `env`, `models`, `settings` (settings is a
    struct with arbitrary provider options); legacy entries use `npm` and `options`.
  - `small_model` (V1) is normalized to **`agents.title.model`**. There is no top-level
    `title` key; `title` is the built-in agent entry under `agents.title`. Do not seed
    model defaults; user models are preserved.
- `plugins`/`permissions`/`agents` are the only Kiki-owned native destinations. Kiki never
  writes top-level `permissions` (OC2 appends those to every agent and would broaden).

### Fixture provider (deterministic loopback)

The verified 2.2.6 normalization accepts the legacy provider shape and converts it:
```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "kiki-fixture": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Kiki fixture",
      "options": { "baseURL": "http://127.0.0.1:<port>/v1" },
      "models": { "fixture-model": { "name": "Fixture model" } }
    }
  }
}
```
The native equivalent is `providers.<id>` with `package` instead of `npm` and the endpoint
under `settings`. Task 6/11 fixtures must use a loopback URL and synthetic credentials only;
never a live user provider or secret-bearing config.

## 7. Verified CLI commands (tagged `packages/cli/src/commands/commands.ts`)

`opencode debug config` **still exists** in 2.2.6 ("List configuration sources"), so the
V1 command is not removed; verify against the actual pinned binary in Task 11 before
relying on its output shape.

| Command | Verified purpose |
|---|---|
| `opencode --version` | binary version (expect `2.2.6`) |
| `opencode debug config` | list configuration sources |
| `opencode debug agents` | list all agents |
| `opencode debug paths [db\|home\|data\|config\|cache\|state\|tmp\|bin\|log\|repos]` | global paths |
| `opencode plugin add <npm-or-git-spec>` | install plugin and add to global configuration |
| `opencode plugin list [--builtin]` | list plugins |
| `opencode plugin check [target]` | check package plugins for updates |
| `opencode plugin update [target]` | update package plugins |
| `opencode plugin remove <package>` | remove a plugin from global configuration |
| `opencode models` | list available models |
| `opencode auth list` / `auth login` / `auth logout` | user-owned credentials; Kiki must never read them |
| `opencode reload` | reload configuration |
| `opencode service start\|restart\|status\|stop` | background server lifecycle |

Registration forms for Kiki 3.0.0:
- release: `plugins: ["kiki"]` in `opencode.json(c)` and `cli.json`; `opencode plugin add kiki@<version>`.
- dev checkout: absolute directory entry `plugins: ["/home/lutz/lprojekte/kiki"]` (the
  local directory's `package.json` exports resolve like a published package).

The current Kiki CLI surface documented by the actual `src/cli/index.ts` dispatcher is:

| Command | Current behavior |
|---|---|
| `kiki install` | Install global native agent files and package registration |
| `kiki install --project <path>` | Scaffold project `.agentic/kiki/` metadata and project agent permissions |
| `kiki init [path]` | Same project setup through the wizard |
| `kiki update [--global]` | Refresh the global installation; project files untouched |
| `kiki migrate [--from <dir>] [--project <path>] [--force]` | Import OC1 models/permissions into OC2 (global by default) |
| `kiki reset --project <path>` | Remove project Kiki agent overrides after backup |
| `kiki status [path]` | Show global/project configuration and effective model objects |
| `kiki doctor [path]` | Check OC2 roots/version, native agents, plugin/TUI registration, project commands and skills |
| `kiki routing` | Retired read-only notice; use `agents.<id>.model` |
| `kiki verify <file>` | Check Markdown for unfinished markers |
| `kiki release [options]` | Validate (default) or apply a local release candidate |

`kiki install`/`kiki update` derive the registration spec from the running package:
a checkout registers its absolute directory and a package under `node_modules` registers
the package name. Do not assume a published `kiki@3.0.0` package or a GitHub install
target exists. The release registration form is valid only when a validated candidate
package is actually available and a release is separately authorized.

## 8. Downstream signature pins (what Tasks 3–11 must not re-invent)

1. `ServerContext` = `Parameters<typeof Plugin.define>[0]['setup']` context; TUI uses
   `Plugin.Context` from `@opencode/plugin/tui`.
2. `ctx.tool.hook('execute.before', cb)` returns `Promise<{ dispose(): Promise<void> }>`.
3. `ctx.event.subscribe({ types?, signal? })` returns an async iterable of events with
   payloads in `.data`; cancellation via signal or `iterator.return()`.
4. `ctx.session.interrupt({ sessionID, resume? })`; child discovery via `session.list()`
   and `parentID`; no `messages`, no `abort`.
5. TUI `dialog.select<Value>` resolves a value or `undefined`; keymap layers are reactive
   and removed on plugin deactivation.
6. Host entrypoints resolve through `Host.resolve({ directory })`; TUI optional peers are
   host-provided.
7. Skill roots are `<config-dir>/skill/` and `<config-dir>/skills/`, plus config `skills`
   paths and the global cache index.
8. New config files use `https://opencode.ai/config.json`; model assignments are
   `agents.<id>.model`; permissions are ordered rule arrays.
9. `@opencode/plugin@2.2.6` stays an exact runtime dependency; `@opencode-ai/plugin` stays
   removed; runtime Node floor stays `>=18`.

## 9. Task 13 final verification and current usage limits

Task 13 exercised these pins against the real `opencode v2.2.6` binary and the packaged
final snapshot:

- The required seven-suite real-binary command passed **24/24 tests, 0 failures, 0
  skipped**.
- The full suite with the binary passed **632 tests, 2 by-design opt-in skips, 0 failed**.
- The final packed candidate was `kiki-3.0.0.tgz` (130 files, package `3.0.0`, SDK
  `2.2.6`, sha256 `952be15086d93e9ff8a62d111f9155741ef2db4c3d8e82420a6a860c3f0aef37`),
  with input manifest `74bccc17017f60deb0c6f3a7f43957ca872e2a7d10a74fa9943998126c2f5789`,
  dist manifest `f0da220cae0b5620fc085ca6bbcc1952242eccc79ffd7c79cf1054256033b5a6` and
  pack manifest `14005d97f0b0dc7f01cc42f08e00cde9f9b8905b090c6732003d9cffe91bbc37`.
- The fresh audit reported **0 high, 0 critical, 32 moderate, 0 low, 0 info** over 454
  dependencies with no security exception; the existing gate policy treats moderate
  findings as non-blocking.
- The real PTY `/kiki` menu passed with zero provider requests.
- The real package loaded from a disposable production-only consumer without the checkout
  on module-resolution paths, and the real binary completed a fixture agent run.

The isolated synthetic 2.4.0→3.0.0 **RELEASE_REHEARSAL** also passed: all six release
gates, `Applied: false`, no remote action, and candidate server/TUI artifact hashes match
the actual final artifact hashes exactly. The rehearsal is not release authorization.

These are automated **ACTUAL_V3_VALIDATION** and rehearsal results. The user subsequently
reported that the live OC2 `/kiki` menu works and accepted 3.0.0 for commit, release and
push on 2026-11-10. This does not claim npm publication, provider login, live model
migration or an unreported rollback drill. See
[`kiki-3-oc2-acceptance.md`](./kiki-3-oc2-acceptance.md).
