# Kiki OpenCode 2 Migration — Design (Kiki 3.0.0, OC2-only)

Date: 2026-11-09
Status: awaiting human design approval
Scope owner: kiki-brainstormer (this document); no product code, no commits, no tags, no installs in this phase.

## 1. Intent and why

Kiki 2.4.0 targets OpenCode 1 (OC1, npm `opencode-ai`, 1.x line). OpenCode 2 (OC2, GitHub
`anomalyco/opencode`, npm `@opencode/*`) is a new generation with a different plugin API,
config schema, agent model, and TUI API. The goal is:

1. **Freeze** Kiki 2.4.0 (commit `e2bf396`, branch `feat/global-kiki-updates`) as the OC1
   fallback, and keep it working unchanged.
2. **Develop Kiki 3.0.0 for OC2 only** — no dual-API support inside one Kiki version.
3. Run **OC1 and OC2 in parallel on this machine** with fully separate binaries, config,
   data, cache, and state; `opencode` → OC2 (default), `opencode-v1` → retained OC1.
   Separate Kiki installations per target so no collisions.
4. Until the port works, all Kiki work continues on OC1 via the frozen fallback.

Approach chosen by the user (settled upstream of this document): frozen V1 + V2-only
development, not dual compatibility.

## 2. Goals, non-goals, anti-goals

**Goals**
- Port to OC2 with behavioral equivalence: server plugin (routing logger + subagent
  watchdog), eight agents with the same prompts/permissions semantics, native `/kiki` TUI
  and its registration, config readers/writers/reset/migrate/diagnostics, and the
  task→subagent delegation prompts.
- One-time native V2 config migration that preserves user model assignments and permission
  semantics, and **fails closed** on untranslatable permissions — never silently broadens.
- Parallel OC1/OC2 machine setup with exact install commands, version/isolation
  verification, and rollback.
- Tests against the actual pinned OC2 binary and the actual packaged Kiki artifacts.

**Non-goals (explicitly deferred until after the switch)**
- New eval infrastructure, improvement loops, small unrelated agent tweaks, and the
  scientist audit/port.
- Any new Kiki features beyond equivalence.
- Dual API support in one Kiki version (excluded by decision).

**Anti-goals (failure even if technically working)**
- OC2 writing into OC1's `~/.config/opencode` or `~/.local/share/opencode` (collisions,
  database corruption — both generations use the same XDG app name `opencode`).
- The official OC2 installer overwriting the OC1 binary at `~/.opencode/bin/opencode`
  without a prior rename.
- Kiki 3.0.0 reading, copying, or printing secret-bearing files (`~/.config/opencode/.env`,
  `auth.json`, credentials). Credential setup in OC2 is user-owned.
- Migration dropping permission rules or widening them to `allow` on any translation doubt.
- Kiki 3.0.0 touching OC1's global config, prompts, plugin, or TUI registration —
  including by accident through environment misconfiguration (guarded per §6.4).

## 3. Verified facts (authoritative sources, 2026-11-09)

All version facts re-verified from tagged upstream sources, not summaries:

| Fact | Value | Source |
|---|---|---|
| OC2 latest stable release | **v2.2.6** (published 2026-11-06) | GitHub `anomalyco/opencode` releases, tag `v2.2.6` |
| OC2 plugin SDK | **`@opencode/plugin@2.2.6`** (npm `latest`) | registry.npmjs.org; built from `anomalyco/opencode` `packages/plugin` |
| OC1 npm line | `opencode-ai@1.19.5` (latest) | registry.npmjs.org |
| Kiki release state | `e2bf396` "feat: release v2.4.0" = HEAD of `feat/global-kiki-updates`; **no `v2.4.0` git tag exists** (only `v2.3.0` is tagged) | `git log --decorate` |
| OC1 binary on this machine | `/home/lutz/.opencode/bin/opencode` (installer layout); not in `~/.local/bin`; version not yet verified | directory listings |
| OC1 Kiki install method | checkout-driven: CLI via npx `file:` link (`~/.npm/_npx/…` → `../../lprojekte/kiki`); global files generated in `~/.config/opencode` (`kiki/prompts/`, `kiki/tui.js` → `file:///home/lutz/lprojekte/kiki/dist/tui/index.js`, `plugins/kiki.ts`, `opencode.json`, `tui.json`); `agents/scientist.md` is a user-owned file; `.env` present and never read | file reads (non-secret files only) |
| OC2 global paths | XDG-derived with app name `opencode`: config `XDG_CONFIG_HOME/opencode`, data `XDG_DATA_HOME/opencode`, cache `XDG_CACHE_HOME/opencode`, state `XDG_STATE_HOME/opencode`; **`OPENCODE_CONFIG_DIR` env overrides config dir only** | `packages/util/src/global.ts`, `global-roots.ts` @ v2.2.6 |
| OC2 installer target | `$HOME/.opencode/bin/opencode` — **same path as the installed OC1 binary**; also writes an `opencode2` shim; supports `--version`, `--binary`, `--no-modify-path` | repo-root `install` @ v2.2.6 |

### OC2 API facts that shape the port (all @ tag v2.2.6)

- **Plugin definition**: `Plugin.define({ id, setup: async (ctx) => { …; return cleanup } })`
  (`packages/plugin/src/README.md`, `promise/plugin.ts`). Setup returns a cleanup function;
  OpenCode awaits it on unload/replace. Reload is revision-based: changed plugins are
  unloaded (cleanup awaited) and re-loaded (`packages/core/src/plugin.ts`).
- **Context domains**: `ctx.tool`, `ctx.session`, `ctx.event`, `ctx.agent`, `ctx.command`,
  `ctx.skill`, `ctx.model`, `ctx.provider`, `ctx.permission`, `ctx.storage`, …
  (`promise/plugin.ts` Context).
- **Tool hooks**: `ctx.tool.hook("execute.before", event)` with
  `{ tool, sessionID, agent, messageID, id, input }` — `input` is the mutable tool input
  (`promise/tool.ts`).
- **Subagent tool**: name is **`subagent`** (not `task`). Input:
  `{ agent: <agent id>, description (3–5 words), prompt, model?: "providerID/modelID[#variant]", sessionID?, background? }`
  (`core/src/tool/plugin/subagent.ts`). Subagent permission action is `subagent` with
  **agent IDs as resources**; depth default 1 (`experimental.subagent_depth`).
- **Session**: `session.interrupt` (replaces V1 `abort`); also `list/get/messages/
  synthetic/wait/…` (`promise/session.ts`).
- **Events**: `ctx.event.subscribe(options?)` returns an async iterable of
  `OpenCodeEvent`s; event payloads live in **`.data`**, not `.properties`
  (`promise/event.ts`; `.data` usage verified in `core/src/config.ts`).
- **Config schema V2** (`core/src/config/normalize.ts` + `v1/config/migrate.ts`):
  - `agent` (V1 singular) → normalized to **`agents`** (plural map of
    `ConfigAgent.Info`: `{ model: {providerID, model, variant?}, request, system,
    description, mode, hidden, color, steps, disabled, permissions }`).
  - `permission` (V1 tool-keyed maps) → **`permissions`**: ordered array of
    `{ action, resource, effect }` rules. Action renames: `write|patch|apply_patch→edit`,
    `task→subagent`, `bash→shell`; others pass through.
  - `plugin` (V1 list) → **`plugins`** list of package specs or
    `{ package, options }`.
  - Malformed values are skipped with diagnostics — OC2 normalizes fail-open; Kiki's own
    migration must therefore be stricter (fail closed).
- **Config discovery** (`core/src/config/discovery.ts`): global config dir file names are
  **`opencode.json`/`opencode.jsonc`** (V1's `config.json` is gone); project tiers are
  ancestor `opencode.json(c)` **plus** `.opencode/` directories, where
  `.opencode/opencode.json(c)` also loads. Config dirs are watched and hot-reload.
- **Agents from files** (`core/src/config/plugin/agent.ts`): agent Markdown files are
  discovered via `{agent,agents}/**/*.md` and `{mode,modes}/*.md` inside every config
  directory. Files with native V2 keys (`system`, `permissions`, `request`, `disabled`)
  are read as **V2-native agent files** (frontmatter = ConfigAgent fields minus `system`,
  body = `system` prompt). Config `agents.<id>` entries and file agents merge field-wise;
  **config-level `agents.<id>.permissions` are appended** to the agent's existing rules
  (later rules win); model from config replaces the agent's model.
- **Plugin ordering** (`core/src/plugin/internal.ts`): internal `pre` plugins (built-in
  agents, tools) → **user plugins** → internal `post` plugins (config-sourced agents,
  compatibility, policy). Config agents always apply after user-plugin transforms.
- **Plugins config/discovery** (docs `/docs/plugins/`, verified in
  `core/src/plugin/source-directory.ts`): `plugins` entries accept package names,
  versions, local **directories** (single files are skipped for configured entries), and
  `file://` paths. Raw `.ts`/`.js` files and immediate package directories are
  auto-discovered from `.opencode/plugins/` (project) and `<global config>/plugins/`.
  **TUI-only plugins are configured separately in `cli.json`**
  (`<global config>/cli.json`, schema `plugins` list). OC2 itself migrates V1 `tui.json` →
  `cli.json` atomically on first access (`packages/cli/src/config/migrate.ts`).
- **TUI plugin API** (`packages/plugin/src/tui/plugin.ts`, `context.ts`):
  `define({ id, setup(ctx) => cleanup })`; Promise dialogs (`ui.dialog.select/alert/
  confirm/prompt`), `ui.toast.show`, reactive `keymap.layer(factory)` with commands
  supporting `palette: true` and **slash commands** (`slash: { name }`), client data via
  `ctx.data`, event subscription via `ctx.data.on(type, handler)`.
  The V1 TUI API (`api.state.path.config`, `api.ui.dialog.replace`, `api.ui.DialogSelect`,
  `api.keymap.registerLayer`, `@opencode-ai/plugin/tui` `TuiPluginModule`) **does not exist
  in V2**.
- **Kiki watchdog's OC1 event names** (`session.created/updated/idle/deleted/error`,
  `message.part.updated`, `message.updated`, `session.status`) must be re-mapped to the
  V2 `OpenCodeEvent` inventory; exact V2 event-type names and payload fields are to be
  enumerated from the installed `@opencode/plugin@2.2.6` / `@opencode/client` types at
  implementation time and pinned by tests.

## 4. Approaches considered

**A. One Kiki, dual API (rejected by user decision).** Detect runtime generation and load
OC1 or OC2 code paths. Rejected upstream: doubles the test surface and blocks clean
major-version semantics.

**B. Kiki 3.0.0 as OC2-only port, agents authored as V2-native agent Markdown files in
the OC2 config dir; plugin shipped as a package-style plugin. (Recommended and chosen.)**
Mirrors today's proven layout (prompts as files, models in config, one plugin), matches
what OC2 natively consumes, and keeps failure modes equivalent (agents exist even if the
plugin fails to load).

**C. Agents registered at runtime by the Kiki plugin via `ctx.agent.transform`, config
holds only overrides.** Technically supported (config agents apply after user plugins),
but if the plugin fails to load, all Kiki agents vanish — a failure-mode regression vs.
today. Rejected for the agent part; the plugin still uses transforms for nothing
agent-related.

**D. Generated self-contained plugin file(s) in `<oc2-config>/plugins/` (direct port of
today's generator).** Rejected for the plugin part: raw discovered `.ts` files'
module resolution for `@opencode/plugin` imports from the config dir is not a
documented, verified path; package-style plugins are the documented, update-managed
mechanism. (See §6.3.)

## 5. Machine setup design (Phase 0/1 — user-executed, agent never runs these)

### 5.1 Freeze OC1 as fallback

```bash
# Verify and record the OC1 version (user runs; output recorded in task notes)
~/.opencode/bin/opencode --version

# Freeze the binary under its new name (OC2 installer writes 'opencode', never
# touches 'opencode-v1'; it only removes an 'opencode2' shim, which does not exist)
mv ~/.opencode/bin/opencode ~/.opencode/bin/opencode-v1
```

- Kiki 2.4.0 source is frozen at `e2bf396` (HEAD of `feat/global-kiki-updates`). The
  tree is clean except one runtime-noise line in the tracked
  `.agentic/kiki/routing_log.jsonl` — commit or revert that line before tagging so the
  freeze is exactly the release commit.
- **Authorization required (separate):** create annotated git tag `v2.4.0` at `e2bf396`
  to make the freeze addressable. No tag is created by this design work.
- Kiki CLI fallback: the frozen 2.4.0 must **not** live in the same checkout that moves
  on to 3.0.0 development. Materialize it once (user-run):
  ```bash
  git -C /home/lutz/lprojekte/kiki worktree add /home/lutz/lprojekte/kiki-v1 e2bf396
  cd /home/lutz/lprojekte/kiki-v1 && npm install && npm run build
  cat > ~/.local/bin/kiki-v1 <<'EOF'
  #!/bin/sh
  exec node /home/lutz/lprojekte/kiki-v1/dist/cli/index.js "$@"
  EOF
  chmod +x ~/.local/bin/kiki-v1
  ```
  The wrapper uses the inherited (default) environment: Kiki 2.4.0 resolves its global
  dir as `XDG_CONFIG_HOME || ~/.config` + `/opencode`, so a clean environment keeps it
  pointing at OC1's `~/.config/opencode`.

### 5.2 Install OC2 pinned, isolated

```bash
# 0. PATH pre-check BEFORE creating any wrapper: if a bare 'opencode' resolves to
#    ~/.opencode/bin today (OC1's install dir), ensure ~/.local/bin comes BEFORE it in
#    PATH ordering, or remove the ~/.opencode/bin PATH entry from the shell rc —
#    otherwise the raw OC2 binary would shadow the isolation wrapper.
command -v opencode; echo "$PATH"

# 1. Install OC2 v2.2.6 exactly (installer writes ~/.opencode/bin/opencode;
#    OC1 is now safe under opencode-v1)
curl -fsSL https://opencode.ai/v2/install | bash -s -- --version 2.2.6

# 2. Private XDG roots for OC2 (all four; OC2 appends /opencode to each)
mkdir -p ~/.opencode2/{config,data,cache,state}

# 3. Wrapper: ~/.local/bin/opencode  (~/.local/bin already exists on this machine)
cat > ~/.local/bin/opencode <<'EOF'
#!/bin/sh
export OPENCODE_CONFIG_DIR="$HOME/.opencode2/config/opencode"
export XDG_DATA_HOME="$HOME/.opencode2/data"
export XDG_CACHE_HOME="$HOME/.opencode2/cache"
export XDG_STATE_HOME="$HOME/.opencode2/state"
exec "$HOME/.opencode/bin/opencode" "$@"
EOF
chmod +x ~/.local/bin/opencode

# 4. OC1 passthrough wrapper: ~/.local/bin/opencode-v1
cat > ~/.local/bin/opencode-v1 <<'EOF'
#!/bin/sh
exec "$HOME/.opencode/bin/opencode-v1" "$@"
EOF
chmod +x ~/.local/bin/opencode-v1

# 5. Pin OC2 against self-updates while Kiki targets exactly 2.2.6
#    (set `update: "disable"` in ~/.opencode2/config/opencode/opencode.jsonc
#    once it exists, or create it first run; see §5.4)
```

**Why this isolation mechanism**: verified in §3 — OC2 reads config/data/cache/state from
the XDG variables (all suffixed `opencode`), and `OPENCODE_CONFIG_DIR` overrides config
only. OC1 uses the same default XDG paths, so *without* this wrapper both generations
would collide on `~/.config/opencode` (plugins auto-discovery would load the OC1 Kiki
plugin into OC2), `~/.local/share/opencode` (both write a sqlite database → corruption
risk), and `~/.cache/opencode`/`~/.local/state/opencode`. The wrapper makes every OC2
invocation — TUI, CLI, server — use private roots. `opencode-v1` runs with the inherited
(default) environment, so OC1 behavior is bit-for-bit unchanged.

### 5.3 Verification (all must pass before any Kiki-OC2 work)

```bash
opencode --version          # expect: 2.2.6
opencode-v1 --version        # expect: the recorded OC1 version
command -v opencode; command -v opencode-v1   # both resolve in ~/.local/bin first
opencode service paths 2>/dev/null || true    # if available; else check dirs after first run
ls ~/.opencode2/config/opencode 2>/dev/null    # OC2-only files appear here after first run
ls ~/.config/opencode                          # OC1 tree unchanged; no cli.json/OC2 db created
ls ~/.local/share/opencode                     # OC1 data unchanged; no new OC2-written files
```

Additional isolation checks after first OC2 run: `~/.opencode2/data/opencode/` contains
OC2's database/auth; `~/.local/share/opencode/` mtime unchanged; no `cli.json` appears in
`~/.config/opencode` (the OC2 tui.json→cli.json migration runs inside the isolated
config dir, never OC1's).

### 5.4 Credentials (user-owned, never read/copied by Kiki)

- OC1 credentials (`~/.local/share/opencode/auth.json`, `~/.config/opencode/.env`) stay
  untouched and are never read by any Kiki command.
- **OC2 does not inherit OC1's `.env` or credentials**: under the isolated wrapper OC2
  never loads OC1's config dir, so the user re-authenticates providers inside the OC2
  TUI (`opencode` → auth login / provider connect) and re-declares any env-based
  provider settings through OC2's own credential store. Credentials land in
  `~/.opencode2/data/opencode/`. Kiki 3.0.0 only *checks* presence (doctor) and prints
  instructions; it never copies or prints values.
- Synthetic fixtures with fake credentials are used for all Kiki tests.

### 5.5 Rollback (machine level)

1. `rm ~/.local/bin/opencode ~/.local/bin/opencode-v1`
2. `mv ~/.opencode/bin/opencode-v1 ~/.opencode/bin/opencode`
3. Optionally remove `~/.opencode2/` (contains only OC2 state; no user project data).
4. OC1 config/data were never written by OC2 (per §5.3 checks), so no restore needed;
   verify with the §5.3 commands.
Rollback of the *Kiki* side is per §7.5. During the entire port, Kiki work on real tasks
runs on OC1 (`opencode-v1` + `kiki-v1`) — if OC2 work breaks, nothing else is affected.

## 6. Kiki 3.0.0 design (OC2-only)

### 6.1 Versioning and dependencies

- Version `3.0.0` (`package.json` + `KIKI_VERSION` in `src/cli/config.ts`, both gates
  already enforce sync). Major bump: config schema authoring, plugin API, TUI API, and
  machine setup all break compatibility.
- Dev/type dependency: **`@opencode/plugin@2.2.6` exact pin** (replaces
  `@opencode-ai/plugin@1.18.35`). The generated plugin no longer needs to stay free of
  SDK imports; it uses `Plugin.define` types directly.
- **Security gate is fresh**: the 2026-11-04 approved exception covered 4 high advisories
  in the `@opencode-ai/plugin@1.18.35` graph. The registry tripwire fired — `@opencode`
  2.x is published — so **the old exception is void for 3.0.0**. `kiki release` audit
  gates run against the new graph (`@opencode/plugin@2.2.6` depends on `effect@4.1.0`,
  `@ai-sdk/provider@3.0.8`, `@opencode/{ai,util,client,schema,protocol}@2.2.6`; no
  zod/toml pins). A new audit + (if needed) a new explicitly-approved exception is part
  of the release phase.
- Runtime `engines.node >= 18` for the CLI stays (OC2 itself is a self-contained binary).

### 6.2 Agents: V2-native agent Markdown files

Layout in the OC2 config dir (`~/.opencode2/config/opencode/`):

```
agents/kiki-orchestrator.md   … kiki-historian.md   (8 files)
  frontmatter: description, mode (primary|subagent), permissions (rules array)
  body: the system prompt (unchanged text from 2.4.0, incl. project-config pointer)
opencode.jsonc                agents.<id>.model objects; user permission additions;
                              unrelated user settings untouched (JSONC-preserving)
```

- The eight prompt bodies are byte-equivalent to 2.4.0's templates except for the
  delegation-tool wording changes (§6.6). They live as files (like today's
  `kiki/prompts/`), are discovered natively by OC2, and survive plugin failures.
- Model assignments live **only** in config (`agents.<id>.model = {providerID, model,
  variant?}`), written by `/kiki` and preserved by install/update/migrate — same
  ownership rules as 2.4.0.
- `kiki-orchestrator` is `mode: primary`; the seven others are `mode: subagent`
  (V2 refuses `subagent` dispatch to `primary` agents).
- Permission templates in `src/cli/config.ts` are re-authored as rule arrays using the
  verified renames (`edit`, `read`, `shell` (from `bash`), `subagent` (from `task`),
  `webfetch`, `external_directory`). Rule order preserves V1 per-tool intent;
  later rules override earlier ones. The existing `.worktree/**` globs, deny-first
  structure, and secret-file denies (`*.env*`, `*secret*`, `*.pem`, …) carry over as
  resource globs.
- Kiki 3.0.0 never writes top-level `permissions` (config-level global rules are
  appended to *every* agent by OC2 — verified — and would broaden).

### 6.3 Plugin: package-style plugin with `Plugin.define`

- The `kiki` package gains a server entrypoint export
  (`"./server": { "import": "./dist/server/index.js" }`) and a TUI entrypoint
  (`"./tui"`). Plugin shape:
  ```ts
  import { Plugin } from "@opencode/plugin"
  export default Plugin.define({
    id: "kiki",
    setup: async (ctx) => {
      const stop = startRoutingLogger(ctx)   // ctx.tool.hook("execute.before")
      const watchdog = createWatchdog(ctx)   // ctx.event.subscribe + session.interrupt
      return () => { stop(); watchdog.stop() }  // cleanup ownership: OC2 awaits this
    },
  })
  ```
- **Routing logger**: `ctx.tool.hook("execute.before", e => …)` where `e.tool ===
  "subagent"`; logs `{ timestamp, agent: e.input.agent, model: e.input.model ?? "unknown" }`
  to `.agentic/kiki/routing_log.jsonl` (project root from `ctx.location`). Same log
  format as 2.4.0.
- **Watchdog**: subscribes via `ctx.event.subscribe()`; tracks child sessions
  (`parentID` set); activity detection from message/part/token events (`.data` shape);
  aborts via `session.interrupt({ path: { id } })`; health log format and
  `.agentic/kiki/config.json` `health` section unchanged. Event-type mapping is pinned
  by unit tests against real SDK types plus one live trip test against the real binary.
- **Dedup guard dropped**: OC2's plugin registry dies on duplicate plugin IDs and owns
  unload/reload (cleanup awaited) — the `globalThis` ownership shim solved an OC1
  problem that no longer exists. Doctor gains a check that only one `kiki` server
  plugin source is configured.
- **Reload ownership**: all state (interval, subscriptions) is created in `setup` and
  released in the returned cleanup; nothing global. `registration.dispose()` not needed.
- **Installation/registration**: `kiki install` (OC2 mode) writes the agent files,
  then registers the plugin:
  - release form: `"plugins": ["kiki"]` in `opencode.json(c)` (server) and `"plugins":
    ["kiki"]` in `cli.json` (TUI); `opencode plugin add kiki@<version>` (or
    `opencode plugin add github:luxuxorg/kiki` — the installer spec supports npm and
    Git targets, matching the current install-from-GitHub distribution) manages the
    package install/update.
  - dev form (checkout): absolute-path directory entry `"plugins":
    ["/home/lutz/lprojekte/kiki"]` — verified supported (a local directory whose
    package.json maps exports resolves like the published package). The checkout's
    node_modules provides `@opencode/plugin`.
  - Config-dir `package.json`/`node_modules` pinning (the V1 pattern) is not used.

### 6.4 Config readers/writers (V2 schema)

`src/cli/opencode-config.ts` port:

- Global dir resolution mirrors OC2 exactly: `OPENCODE_CONFIG_DIR` ?? `XDG_CONFIG_HOME
  ?? ~/.config` + `/opencode` (config only; data/cache/state are OC2's own business).
  For day-to-day use a `kiki` wrapper mirrors the `opencode` wrapper's env and execs the
  3.0.0 CLI, so plain `kiki` invocations target OC2's config dir:
  ```bash
  cat > ~/.local/bin/kiki <<'EOF'
  #!/bin/sh
  export OPENCODE_CONFIG_DIR="$HOME/.opencode2/config/opencode"
  export XDG_DATA_HOME="$HOME/.opencode2/data"
  export XDG_CACHE_HOME="$HOME/.opencode2/cache"
  export XDG_STATE_HOME="$HOME/.opencode2/state"
  exec node /home/lutz/lprojekte/kiki/dist/cli/index.js "$@"
  EOF
  chmod +x ~/.local/bin/kiki
  ```
- **Fail-closed OC1 guardrail**: if the resolved global config dir is the machine default
  `~/.config/opencode` (i.e. no OC2 env is set) and that directory contains an OC1 Kiki
  installation (V1 markers: `plugins/kiki.ts`, `tui.json`, singular `agent.kiki-*`
  entries), Kiki 3.0.0 commands **refuse to run** and print the wrapper instructions.
  This makes it impossible for 3.0.0 to write V2-shaped files into OC1's live config by
  accident (and symmetrically, `kiki-v1` under a clean environment can never write into
  OC2's isolated dir).
- `readSettings`/config-file candidates: global `[opencode.json, opencode.jsonc]`
  (drop `config.json`); project `[opencode.json, opencode.jsonc, .opencode/opencode.json,
  .opencode/opencode.jsonc]` plus ancestor-tier awareness for status/reset reporting.
- Agent entries are read/written under **`agents.<id>`** with the V2 field shapes
  (model selection object; permissions rules array). Atomic writes, JSONC
  comment preservation, prototype-key rejection, and validate-before-write all carry
  over unchanged.
- `kiki doctor`: OC2-target checks — OC2 version (observation, tested against 2.2.6),
  isolation invariants (OC2 dirs do not equal OC1's), agent files present and parse as
  native V2, `agents.<id>.model` presence informational, plugin registered once,
  `cli.json` TUI registration, skills roots (re-verify V2 skill locations during
  implementation), project paths/commands unchanged; existing exit-code semantics.
- `kiki status`: same output shape, adapted field names/paths.
- `kiki reset --project`: removes Kiki `agents.<id>` entries across all project config
  tiers, Kiki agent md files in project `.opencode/agent|agents/`, backups first —
  parity with 2.4.0 semantics.
- `kiki routing`: retirement notice text updated (native config is `agents.<id>.model`).

### 6.5 One-time V2 config migration (`kiki migrate`)

Reads the **OC1 global config** (`~/.config/opencode/opencode.json(c)` — default
resolution, explicitly *not* the OC2-isolated dir; optional `--from <dir>` for custom
setups) and writes into the **OC2 config dir**. Backup-then-write with the existing
manifest+0600 backup machinery; nothing is deleted from OC1.

- `agent.<name>.model: "provider/model"` → `agents.<name>.model = { providerID, model }`
  (variant only if a V1 `variant` key exists and parses). Preserve every assignment;
  `title`/`small_model` handling follows OC2's own `modelSelection` semantics.
- `agent.<name>.permission` maps → rules arrays via the verified rename table. **Fail
  closed**: an agent whose permissions cannot be translated 1:1 (unknown tool key, value
  that is not `allow|deny|ask`, unparseable entry) is **not migrated** — the command
  reports the agent and reason, exits non-zero, and writes nothing for that agent.
  Never `allow`-default, never dropped rules.
- Also migrated: `plugin` entries referencing Kiki (converted to `plugins` entries);
  user's non-Kiki `agent` entries are reported but not migrated (their own OC2 compat
  path is OC2's normalization; the user's `agents/scientist.md` is flagged with a
  manual-copy instruction, since Kiki does not own it).
- Project-level migration (`--project <path>`): same translation for project config
  tiers; parity with 2.4.0's project migrate (extract, backup, remove redundant copies).
- Migration is one-time: a marker (`.agentic/kiki/migration.json` recording source dir,
  timestamp, version) prevents accidental re-runs; `--force` re-runs with fresh backup.

### 6.6 Delegation prompts and workflow doc

- All agent/workflow text updated: `task` tool → `subagent` tool; `subagent_type` →
  `agent`; `description` (3–5 word label) required per dispatch; `model`/`sessionID`
  follow-ups available. Orchestrator dispatch table (§Dispatch Rules) is otherwise
  unchanged.
- The generated workflow document (`agentic-workflow.md`) keeps its structure, with the
  V2 config key names (`agents.<id>.model`, `plugins`).

### 6.7 `/kiki` TUI port

- TUI entrypoint module satisfies the V2 `TuiPlugin` definition
  (`define({ id, setup })` returning cleanup; registered via `cli.json`).
- Menu structure, scopes (global/project), inherited/override display, single-model
  removal, remove-all-local with confirmation, German strings, toast texts, and
  no-LLM-request guarantees are ported 1:1.
- Mechanically: `api.ui.dialog.replace(() => api.ui.DialogSelect(...))` →
  `await ctx.ui.dialog.select(options)` (Promise), `api.keymap.registerLayer` →
  `ctx.keymap.layer` with a command carrying `palette: true` and
  `slash: { name: "kiki" }` (native `/kiki`), `api.ui.toast` → `ctx.ui.toast.show`,
  model/provider list from `ctx.data.location.model/provider` collections.
- Config write target: same `opencode-config.ts` functions as the CLI (shared module);
  the config dir is resolved identically (env-mirrored). Config-dir resolution no longer
  comes from `api.state.path.config` (absent in V2); `kiki doctor` gains an
  env-consistency check, and the TUI setup fails closed with a clear toast if the
  resolved config dir is not writable/parseable — preserving today's safe-failure
  behavior.
- Writes only `agents.<id>.model`; permissions and unrelated keys never touched.

## 7. Testing and verification plan

### 7.1 Unit (Vitest, existing layout)

- Config readers/writers against V2 shapes: `agents` map, rules arrays, JSONC/comment
  preservation, atomic writes, prototype rejection, forbidden-key checks.
- Migration translation matrix: every V1 permission-map pattern used by Kiki templates
  plus adversarial fixtures (unknown tool key, malformed value, `ask` effects, worktree
  globs, `.env` denials) — fail-closed assertions.
- Watchdog logger logic with synthetic V2-shaped events (same loop/loop/hash detection
  tests, adapted data accessors); plugin cleanup idempotence.
- Plugin template test: generated/checked-in server plugin parses and type-checks
  against `@opencode/plugin@2.2.6`; agent md files parse as native V2 frontmatter.

### 7.2 Integration against the real OC2 binary (pattern: existing
`tests/integration/opencode-global-agents.test.ts`, `kiki-tui.test.ts`)

- Isolated fixture HOME + XDG roots (tmp dirs), synthetic credentials.
- With `OPENCODE_TEST_BINARY`-style env pointing at the pinned v2.2.6 binary:
  - `kiki install` produces a config dir that OC2 loads: all 8 agents visible
    (correct modes, models from config), orchestrator selectable.
  - A synthetic subagent dispatch (no LLM — scripted/fake provider or the existing
    no-LLM technique used by the current TUI test) produces the routing_log entry.
  - Watchdog: a synthetic stuck child session is interrupted within test-scaled
    thresholds; health log written.
  - `/kiki` pty test: open real TUI, select agent/model, verify `agents.<id>.model`
    written and preserved comments (python3 pty pattern as today).
  - Migration on a fixture OC1 config copy: models/permissions land correctly; OC1
    fixture dir untouched; fail-closed fixtures abort with report.
- One test asserts isolation invariants: OC2 run writes nothing under the fixture's
  OC1-shaped dirs.

### 7.3 Release gates

- `kiki release` (dry-run first; apply/tag/push only under separate authorization):
  all existing gates plus fresh `npm audit` on the new dependency graph; expected
  baseline commit `e2bf396` ("release v2.4.0") → major bump to 3.0.0.

### 7.4 Machine acceptance (user-run, checklist in plan)

- §5.3 verification; doctor all-green under OC2 env; one real orchestrator→subagent
  dispatch on a scratch project; `/kiki` model save; rollback drill on a throwaway copy
  of the OC2 config dir.

### 7.5 Rollback (Kiki side)

- Kiki 3.0.0 is never installed over OC1's global files: it only writes OC2-isolated
  paths (plus project `.agentic/` data, unchanged format). Uninstalling = remove OC2
  config-dir Kiki files (`agents/kiki-*.md`, plugin entry, `cli.json` entry) with the
  same backup/manifest flow as 2.4.0. The frozen 2.4.0 + OC1 remain functional
  throughout, so a failed switch costs nothing but time.

## 8. Phases (proposed registry entry mirrors this)

- **Phase 0 — Freeze & fallback (no product code; machine steps user-run).**
  Verify OC1 version; rename binary; clean the routing-log line; create the frozen 2.4.0
  worktree and `kiki-v1` wrapper; record fallback commands; (authorized) tag `v2.4.0`
  at `e2bf396`.
- **Phase 1 — Parallel OC2 install (machine steps user-run).**
  Pinned OC2 v2.2.6 install; XDG isolation wrappers; §5.3 verification; user
  credential login; `update: "disable"` pin. Exit: both generations verified isolated.
- **Phase 2 — Kiki 3.0.0 core (code).**
  `@opencode/plugin@2.2.6` dev pin; V2 config readers/writers; agent md authoring;
  server plugin (logger + watchdog, cleanup ownership); migration command; doctor/status.
  Unit + fixture integration tests green. Fresh audit result recorded.
- **Phase 3 — TUI + install flows (code).**
  `/kiki` V2 port + `cli.json` registration; `install`/`update` OC2 flows; project
  init/reset parity; pty integration test.
- **Phase 4 — Verification & release prep.**
  Full gate suite on candidate; machine acceptance checklist; `kiki release` dry-run
  for 3.0.0. Switch of default Kiki workflow to OC2 only after user acceptance; actual
  release/commit/tag/push under separate authorization.

Deferred (not in these phases): eval infrastructure, improvement loops, unrelated agent
tweaks, scientist audit/port.

## 9. Decisions I made (my calls, confirm on review)

1. **Agent authoring = V2-native agent md files in the OC2 config dir** (not
   plugin-registered, not inlined into opencode.json): preserves today's layout,
   failure modes, and keeps user config small. Verified config agents merge over file
   agents, so `agents.<id>.model` in config stays authoritative.
2. **Plugin = package-style plugin** (server + tui entrypoints; `plugins` list entry;
   dev via absolute-path directory): documented mechanism, native update story, correct
   module resolution for `@opencode/plugin`; the V1-style "generated single .ts file in
   plugins/" is not a verified path for SDK imports.
3. **Dedup guard dropped for OC2** — OC2's plugin registry provides the guarantees it
   emulated.
4. **Migration fail-closed policy**: refuse the agent on any untranslatable permission;
   never widen; marker prevents silent re-runs.
5. **Isolation via wrapper-set XDG roots + `OPENCODE_CONFIG_DIR`**; Kiki CLI mirrors the
   same resolution order (§6.4) instead of inventing its own env var, and refuses to run
   when a bare environment would point it at OC1's live config (fail-closed OC1
   guardrail, §6.4).
6. **German TUI strings and all user-visible texts preserved** (behavioral equivalence).
7. Node runtime `>=18` unchanged; dev/lint range unchanged unless the new SDK forces a
   bump (verify in Phase 2; note if it does).

## 10. Blocking questions / authorizations needed

1. **Authorization (separate, per task rules):** create annotated tag `v2.4.0` at
   `e2bf396` as part of Phase 0 (this design does not create it).
2. **Confirm plugin packaging choice** (§6.3 / decision 2): package-style plugin vs the
   legacy generated-file approach. Recommended: package-style. This changes `kiki
   install`/`update` UX for OC2, so it needs your sign-off.
3. **OC2 update policy**: pin OC2 to exactly 2.2.6 (`update: "disable"`) while Kiki
   targets it — confirm, or state the cadence you want.
4. (Minor, confirmable in plan) `experimental.subagent_depth` stays at default 1; Kiki's
   rules already forbid nested dispatch. Raise it only if you want escalation agents
   able to re-dispatch.

## 11. Left to the builder (planner/implementation)

- Exact V2 event-type enumeration for the watchdog from the installed SDK types
  (§3, last bullet) with pinned tests.
- Final rule-by-rule permission template translation table (§6.2) — mechanical, but
  every pattern from the five permission builders must appear in the migration matrix
  tests.
- V2 skill-location set for doctor (skill discovery differs slightly from V1; verify
  against v2.2.6 `SkillDiscovery`).
- Whether `kiki release` guardrails need a new allowlisted-file entry (dist server/tui
  entrypoints are inside existing `dist/`; no change expected).
- Concrete `install` command surface: settled as environment-driven with the §6.4
  fail-closed guardrail (no `--opencode2` flag tree); the builder designs the exact
  refusal diagnostics and doctor messages.

## 12. Registry impact (proposed, not applied)

Proposed new task entry for `.agentic/kiki/TASK_REGISTRY.json` (orchestrator applies;
this document does not modify the registry):

```json
{
  "id": "kiki-opencode2-migration",
  "description": "Freeze Kiki 2.4.0 (e2bf396) as OC1 fallback; develop Kiki 3.0.0 for OC2 v2.2.6 only: Plugin.define server plugin (routing logger + watchdog with cleanup ownership), V2-native agent files, config readers/writers, one-time fail-closed V1->V2 config migration, /kiki TUI port, parallel isolated OC1/OC2 machine setup with verification and rollback.",
  "status": "pending",
  "phase": "brainstorm",
  "failures": 0,
  "spec": "docs/superpowers/specs/2026-11-09-kiki-opencode2-migration-design.md",
  "plan": null,
  "reviewNotes": [],
  "documentation": { "status": "pending", "reason": "Human design approval pending before planning.", "updatedFiles": [] }
}
```
