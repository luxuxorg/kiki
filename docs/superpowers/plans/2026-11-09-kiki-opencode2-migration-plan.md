# Kiki OpenCode 2 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Kiki 3.0.0 for OpenCode exactly 2.2.6 with equivalent agents, routing/watchdog, native `/kiki`, fail-closed configuration migration, and a separately preserved Kiki 2.4.0/OC1 fallback.

**Architecture:** Native V2 agent Markdown files own prompts and baseline permission rules; native config owns user models and permission additions. A package-style server plugin owns routing/watchdog setup and cleanup, and a separate package TUI entrypoint uses shared config operations. User-operated wrappers isolate both generations; automated tests use only disposable roots and packaged artifacts.

**Tech Stack:** TypeScript ESM, Node CLI >=18.0.0, Vitest 4.1.0, jsonc-parser, yaml, `@opencode/plugin@2.2.6`, pinned OC2 2.2.6 binary, Python 3 PTY tests.

**Spec:** `docs/superpowers/specs/2026-11-09-kiki-opencode2-migration-design.md` (read all chapters together with this plan).

## Global Constraints

- Version `3.0.0`; OC2 exactly `2.2.6`; `experimental.subagent_depth` remains `1`; `update: "disable"` in the isolated machine config.
- Frozen V1 + V2-only development, not dual compatibility. No new features beyond equivalence.
- Package-style plugin, native V2 agent files, no runtime agent registration, no OC1 global ownership/dedup shim.
- Model assignments live **only** in config (`agents.<id>.model = {providerID, model, variant?}`). Never seed model defaults.
- Kiki 3.0.0 never writes top-level `permissions`. Never drop untranslatable permission rules or default them to `allow`.
- Preserve JSONC comments, unrelated settings, user models, approved permissions, project metadata, and existing German TUI copy.
- No reading, copying, or printing secret-bearing files, including credential-bearing OpenCode configs. Use synthetic fixtures; user owns provider login/setup. Presence checks use metadata only.
- `opencode` → isolated OC2; `opencode-v1` → retained OC1. Fully separate config/data/cache/state and Kiki installations. Protect V1 before any source/dist/dependency changes.
- Runtime `engines.node >= 18` stays; development/lint range stays `^20.19.0 || ^22.13.0 || >=24` unless a verified SDK incompatibility is escalated, not silently changed.
- Fresh V2 dependency audit required. The 2026-11-04 V1 exception is void for 3.0.0.
- Scientist audit/port, eval infrastructure, improvement loops, unrelated agent changes, and permission redesign are deferred.
- This is a plan-only deliverable. No execution, installs, live/default/config edits, commits, tags, pushes, releases, or registry edits are authorized here. Execution needs architect review against `.agentic/kiki/alignment.json` and subsequent authorization.

## Review Focus

1. An isolation variable points through a symlink into an OC1 root: refuse before any write; test in Tasks 3 and 11.
2. Ordered V1 permissions overlap after action renaming or global/project merging: preserve effective deny/ask/allow, not merely array contents; test in Tasks 4, 5, and 11.
3. A migration encounters one invalid agent alongside valid ones or a conflicting destination: no rejected agent writes, destructive cleanup, or misleading completion marker; test in Task 5.
4. A menu promise resolves after cancellation, unload, provider disappearance, or a second invocation: no stale mutation, duplicate save, or LLM request; test in Tasks 9 and 10.
5. Watchdog cleanup races an idle subscription, interrupted child, or asynchronous discovery: cleanup terminates, no post-cleanup writes/interrupts, reload owns exactly one interval/subscription; test in Tasks 6, 7, and 11.

---

## Evidence, precedence, and execution boundaries

- Execution-location amendment approved by the user: use the current `/home/lutz/lprojekte/kiki` development checkout on `feat/global-kiki-updates`; do not switch to `main` or create an implementation worktree. The separate frozen `kiki-v1` checkout in Task 1 is still required to detach the installed OC1 loader before any V3 build. Project-local agent permissions are amended for the named root tooling files, implementer-owned migration evidence, reviewer verification commands, and read-only Git inspection; restart OpenCode before relying on these grants. This permission amendment does not authorize product implementation or human machine operations by itself.
- Inspected on 2026-11-09: HEAD `e2bf396`, branch `feat/global-kiki-updates`, local `v2.4.0` decoration; tracked diff contains existing registry and routing-log changes. No project `AGENTS.md` found; `.agentic/kiki/config.json` absent. Use package scripts below, not invented project command overrides.
- Alignment requires no hardcoded secrets, parameterized database queries, no internal stack traces in API responses; compliance headings are OWASP Top 10 and SOC 2 Type II. This port adds no direct database queries or new public HTTP API. Review fixture servers/error output for leakage and document evidence, not a new compliance certification.
- Spec's status, missing-tag claim, clean-tree instruction, and chapter 10 questions are superseded by explicit user approval. Freeze tag is **DONE**, created/pushed per user: tag object `92a7f1918e68afd29931818fb6c33efcff4e3f92`, peeled target `e2bf396df5a14657f34f55c78b31819be10b9c05`. Do not recreate/push it or clean the routing log. Registry push notes are stale; orchestrator alone reconciles them.
- Installed V1 currently references this checkout's `dist/tui/index.js`; merely creating `kiki-v1` does not detach that loader. Task 1 explicitly repoints the loader before any build.
- Read-only upstream checks used tagged `anomalyco/opencode/v2.2.6`: `packages/plugin/{package.json,src/promise/{index,plugin,event,session}.ts,src/tui/{index,plugin,context}.ts,src/host.ts}`, `packages/schema/src/session-event.ts`, `packages/core/src/{v1/config/migrate,config/plugin/skill,skill/discovery,plugin/source-directory}.ts`.
- Important authoritative corrections to illustrative spec snippets: TUI import is `import { Plugin } from '@opencode/plugin/tui'`, then `Plugin.define`; `dialog.select` resolves a **value or undefined**, not an option/callback. V2 event types are not the OC1 inventory. Promise `ctx.session` does not expose OC1 `messages` or `abort`. Task 2 must pin exact query/interrupt signatures from published client types before implementing adapters; do not force V1 shapes with `any`.
- No installed package/binary was changed or tested while planning. Git status was disallowed by this planner's shell policy; `git diff --stat` and `git log` were available. Untracked-file completeness is not claimed. Do not bypass permission restrictions.
- This is one coordinated migration plan because config ownership, packaging and machine isolation share acceptance gates. Separate task/review boundaries permit parallel work without independently shipping incompatible partial ports.
- Amendment after architect review `.agentic/reviews/2026-11-09-kiki-opencode2-migration-plan-review.md`: interim backend checks do not certify the full tree before Task 10; Task 13 separates actual 3.0.0 artifact validation from a synthetic 2.4.0→3.0.0 release rehearsal. This follows the user's requested rehearsal preference, not approval to release. Verified existing tooling: `prepareRelease` reads current package version; `decideVersion` always increments it; `--bump major` and `--since <ref>` already exist. There is **no `--dry-run` flag**: omit `--apply` for dry-run. Do not change release policy/parser or roll back the development checkout's version to work around this.

## File and interface map

Existing boundaries remain unless listed here; do not broadly restructure `config.ts` or release automation.

| File(s) | Responsibility / owner |
|---|---|
| `docs/migrations/kiki-3-oc2-parallel.md` | machine runbook, historian; Task 1 establishes safety instructions first |
| `docs/migrations/kiki-3-oc2-api-contract.md` | pinned upstream/public-package evidence and verified CLI/API invocation contract |
| `src/cli/oc2-paths.ts` (new) | pure root resolution and fail-closed filesystem/OC1 guards |
| `src/cli/opencode-config.ts` | existing public config/model/install/project APIs, V2 JSONC authoring |
| `src/cli/oc2-permissions.ts` (new) | ordered translation and project permission masking, no I/O |
| `src/cli/oc2-migration.ts` (new) | allowlisted V1 extraction, migration transaction/report/marker |
| `src/cli/oc2-registration.ts` (new) | shared server/cli.json package registration planning and removal |
| `src/cli/config.ts` | eight templates, native permissions, workflow and version; remove obsolete generated server code |
| `src/server/{index,routing-logger,watchdog,watchdog-events}.ts` (new) | package entrypoint, logger, unchanged watchdog algorithm, SDK event adapter |
| `src/plugin/{watchdog-source,dedup-source}.ts` | retire V1 source-string machinery after parity tests relocate |
| `src/tui/{index,model-menu}.ts` | separate GUI-designer-owned V2 setup and native menu port |
| `src/cli/commands/{install,update,init,migrate,reset,doctor,status,routing}.ts`, `src/cli/{index,args,doctor-skills}.ts` | backend command plumbing/diagnostics, preserve existing command behavior otherwise |
| `package.json`, `package-lock.json`, `src/cli/release-gates.ts` | version, exact SDK runtime dependency, server export, packaged artifact invariant |
| `tests/cli/oc2-{paths,permissions,migration,registration}.test.ts` (new) | focused fixture safety/ownership matrices |
| `tests/plugin/{watchdog,routing-logger,watchdog-events,server-lifecycle}.test.ts` | V2 typed logic and lifecycle tests (last three new) |
| `tests/helpers/oc2-fixture.ts`, `tests/integration/fixtures/oc2-provider.ts` (new) | isolated child environment, loopback deterministic provider and request counters |
| `tests/integration/{opencode-global-agents,kiki-tui,routing-pipeline,watchdog-plugin-syntax}.test.ts` | port existing actual-binary tests to packaged V2 artifacts |
| `tests/integration/{oc2-isolation,oc2-watchdog,oc2-package}.test.ts` (new) | actual binary isolation, live interrupt, clean package consumer |
| `tests/integration/oc2-release-rehearsal.test.ts` (new) | opt-in real release rehearsal with separate synthetic provenance; no release-policy changes |
| `tests/integration/fixtures/kiki-tui-smoke.py` | actual `/kiki` PTY scenario, GUI designer |
| `docs/migrations/kiki-3-oc2-acceptance.md`, `README.md`, `CHANGELOG.md` | independently maintained historian evidence and user docs |

**Shared types to define in Task 3:** `ModelSelection = { providerID: string; model: string; variant?: string }`; `PermissionRule = { action: string; resource: string; effect: 'allow'|'deny'|'ask' }`. Native settings use objects/rules; UI rows and save inputs retain existing string IDs through explicit `parseModelID(id: string, variant?: string): ModelSelection` and `formatModelID(model: ModelSelection): string` conversions. Split at the first `/`, preserve remaining model path, reject empty pieces or embedded `#`; variant is separate. Apply upstream legacy provider-ID renames only during migration.

**Shared review policy:** Every task ends with a fresh `kiki-reviewer` gate against its tests, spec, and alignment. Reviewers do not implement their own fixes. Orchestrator records results, failures, and dependencies; after two failures follow existing escalation rules. No task includes an automatic commit. If separately authorized later, stage only its reviewed files after status/diff/log inspection; never include pre-existing registry, routing log, docs, or secrets inadvertently.

## Task 1: Protect frozen V1 and document the user-operated parallel setup

**Metadata:**
- risk: high
- parallel: false
- depends_on: []

**Owner:** `kiki-historian` for runbook; human for all machine operations. Architect approval precedes execution of any task.

**Files:** Create `docs/migrations/kiki-3-oc2-parallel.md`. No product or live-user file edits by the agent.

**Interfaces:** Consumes the already completed freeze tag and spec §5. Produces a human-recorded `V1_PROTECTED`/`OC2_ISOLATED` checkpoint with OC1 version, wrapper resolution, frozen CLI and loader targets, and rollback evidence. Tasks 2–13 must not change/build the development checkout until `V1_PROTECTED`; actual-binary tests additionally require an explicitly provided isolated test binary.

- [ ] Write the runbook in the exact order in the machine appendix below; make collision/existing-path checks mandatory, include the V1 TUI loader detachment, and label every command **human-run, not authorized by this plan**.
- [ ] Review a synthetic path walkthrough: existing `opencode-v1`, existing worktree, existing wrapper, inherited OC2 variables, and `~/.local/bin` shadowed on PATH must each stop rather than overwrite or run OC1 against OC2 roots.
- [ ] Human, only after separate authorization, performs freeze/detachment and records OC1 smoke results. If deferred, stop all implementation at this gate; documentation/review may continue.
- [ ] Independent reviewer checks the documented ordering and confirms no tag recreation, cleanup/revert, secret copying, or live default switch is embedded in an automated task.

## Task 2: Lock the published V2 contracts and package boundary

**Metadata:**
- risk: high
- parallel: false
- depends_on: ['Task 1']

**Owner:** `kiki-implementer`.

**Files:** Modify `package.json`, `package-lock.json`, `src/cli/config.ts:76`; create `docs/migrations/kiki-3-oc2-api-contract.md`, `tests/cli/oc2-sdk-contract.test.ts`; minimally update `tests/cli/release-gates.test.ts` for version expectations.

**Interfaces:** Produces exact SDK context aliases `ServerContext = Parameters<typeof Plugin.define>[0]['setup'] extends (ctx: infer C) => unknown ? C : never` in the eventual server module and equivalent TUI `Plugin.Context`, plus documented actual client calls/CLI commands for Task 11. No fake V1 compatibility API.

- [ ] Add failing contract tests: package version and `KIKI_VERSION` equal `3.0.0`; dependency `@opencode/plugin` equals `2.2.6` in **dependencies** (server/TUI import it at runtime); no old `@opencode-ai/plugin`; `./server` and `./tui` exports target `dist/server/index.js` and `dist/tui/index.js`, with declaration paths. Published graph must resolve in a clean consumer without development dependencies.
- [ ] Run `npx --no-install vitest run tests/cli/oc2-sdk-contract.test.ts`; expect failure on old version/dependency/exports.
- [ ] After execution authorization, replace SDK and refresh lockfile without unrelated dependency upgrades. Record registry package integrity, tagged-source provenance, engine requirements and actual exports. Inspect tagged `plugin/src/host.ts`, schema config/discovery, client public event/API types and CLI help; pin exact interrupt arguments, child discovery/status/message access, event subscription cancellation, fixture provider config, and real commands replacing V1 `debug config`. Do not assume that command still exists.
- [ ] Add compile-only typed examples consumed by contract tests for tool hook, event union, interrupt, subscription disposal, TUI value-return dialogs/keymap, package host resolution and skill source roots. No `any` or `@ts-ignore` to bridge missing APIs. Record `title` and `small_model` native destination keys and the exact V2 `$schema` URL for newly authored `opencode.jsonc` from tagged config schema/docs, not inference; Task 3 must use that URL for new files and preserve existing user `$schema` values.
- [ ] Run focused contract test and `npx --no-install tsc --noEmit`; contract tests must pass. Record full-tree diagnostics as an **expected interim failure**, limited to still-unported `src/tui/*` imports/calls and their direct migration consequences; any other error blocks the task. Do not keep the old SDK, add stubs, weaken tsconfig, or emit distributable artifacts from a failing build. Stop if SDK forces a CLI Node floor change, lacks required equivalent APIs, or cannot resolve package entries: report evidence to architect instead of altering approved behavior.
- [ ] Independent contract review is the gate for every downstream signature. Task 10 is the first mandatory full-tree-green typecheck/build gate; Task 11 repeats it for actual packaged acceptance. An interim failure is not a build/package/release pass.

## Task 3: V2 path guard and shared native config/model operations

**Metadata:**
- risk: high
- parallel: false
- depends_on: ['Task 2']

**Owner:** `kiki-implementer`.

**Files:** Create `src/cli/oc2-paths.ts`, `tests/cli/oc2-paths.test.ts`; modify `src/cli/opencode-config.ts:14-235`, `tests/cli/model-settings.test.ts`.

**Interfaces:** Export `resolveOC2Roots(env: NodeJS.ProcessEnv, home: string): { config: string; data: string; cache: string; state: string }`, `assertOC2Target(roots: ReturnType<typeof resolveOC2Roots>, home: string): void`; export shared types/converters above from `opencode-config.ts`. Preserve signatures of `globalDirectory`, `readSettings`, `readOpenCodeSettings`, `listAgentModels`, `setAgentModel`, `removeAgentModel`, `removeAllProjectModels`, and their existing UI row/result interfaces (string model IDs). Add `discoverConfigTiers(project: string, global: string): { file: string; scope: 'global'|'ancestor'|'project'; directory: string }[]` in low-to-high upstream precedence.

- [ ] Add failing tests `resolves_all_four_roots`, `refuses_oc1_markers_before_writes`, `rejects_aliases_into_oc1_roots`, `model_object_roundtrip`, `preserves_jsonc_and_permissions`, `rejects_prototype_keys_inside_arrays`, `reports_ancestor_inheritance_without_deleting_parent`. Assert explicit env precedence, native object shapes, no `config.json`, correct four project candidates, nearest existing-parent realpath for absent destinations, and no file changes on malformed/read-only input. Model fixture `vendor/org/model` becomes `{providerID:'vendor',model:'org/model'}`.
- [ ] Run `npx --no-install vitest run tests/cli/oc2-paths.test.ts tests/cli/model-settings.test.ts`; expect red V1-schema assertions.
- [ ] Implement root resolution matching upstream (`OPENCODE_CONFIG_DIR` overrides only config); guard machine-default OC1 markers by metadata first. If marker inspection would require a credential-bearing config, refuse and request a user-created secret-free export rather than inspect it. Guard all mutators and TUI setup, including explicit parameters, symlinks and accidental overlapping roots. Doctor may report guard failure read-only.
- [ ] Port JSONC validation/patching to `agents` and V2 shapes; recurse forbidden-key validation through arrays. Seed new configs with Task 2's pinned V2 `$schema` URL and test that literal; never replace an existing user `$schema`. Keep atomic mode-preserving writes. Validate all affected tiers before multi-file removals; only remove selected project's local keys, not ancestor-owned config. Use discovered ancestor tiers for effective model/status display. Re-read on save so unrelated concurrent edits survive.
- [ ] Run focused tests; expect all pass and fixture byte snapshots of unrelated/OC1 files unchanged. Reviewer specifically checks inherited precedence and that errors never include config values or stack traces.

## Task 4: Equivalent agent templates, ordered permissions and delegation text

**Metadata:**
- risk: high
- parallel: true
- depends_on: ['Task 3']

**Owner:** `kiki-implementer`.

**Files:** Create `src/cli/oc2-permissions.ts`, `tests/cli/oc2-permissions.test.ts`, `tests/fixtures/oc1-permission-templates.json`; modify `src/cli/config.ts:144-525,623-752`, `tests/cli/{global-policy,init,config-health}.test.ts`.

**Interfaces:** Export `translatePermissions(input: unknown): { ok: true; rules: PermissionRule[] } | { ok: false; reason: string }` and `projectPermissionRules(local: PermissionRule[], inherited: PermissionRule[]): PermissionRule[]`. `baselineAgents(config?: KikiConfig)` continues returning name → `{settings,prompt}`, now settings has native `permissions`/`mode`, no model. `generateAllTemplates` retains agent/workflow entries; obsolete plugin/package template fields are removed only with Task 7 consumers.

- [ ] Capture frozen, secret-free generated template fixtures from `v2.4.0` (not live config), including all five permission builders and broad-read helper. Add failing `template_rule_matrix_preserves_effective_policy`, `native_agent_modes`, `prompt_body_only_changes_delegation`, `project_rules_do_not_restore_inherited_grants` tests. Evaluate allow/deny/ask for every original resource pattern plus overlapping wildcard/secret/worktree/custom-path cases.
- [ ] Run `npx --no-install vitest run tests/cli/oc2-permissions.test.ts tests/cli/global-policy.test.ts`; expect V1 mapping/native-frontmatter failures.
- [ ] Implement ordered scalar → `resource:'*'` and map → entry-order rule translation: `write|patch|apply_patch→edit`, `task→subagent`, `bash→shell`; unchanged known actions `read`, `edit`, `webfetch`, `external_directory` and other explicitly verified V1 tools. Unknown keys, malformed values, and action-alias collisions whose effective V1 behavior cannot be represented are failures, never guessed. Test wildcard semantics separately against the actual binary in Task 11.
- [ ] Rewrite permission builders as native rule arrays preserving exact ordered resources: read `*` allow followed by `.env*`, `**/.env*`, `**/*secret*`, `**/*credential*`, `**/*.pem`, `**/*.key`, `**/id_rsa*` denies; role-specific edit deny-first/path grants; historian final source/test denies; existing shell command patterns and `/tmp/**`, `tmp/**`, `.worktree/**` grants. Preserve permission absence as intentional inheritance. Project masking must narrow omitted inherited grants without relaxing inherited deny/ask.
- [ ] Keep eight prompts byte-equivalent after normalizing only approved `task→subagent`, `subagent_type→agent`, native config keys, required 3–5-word `description`, optional model/sessionID follow-ups and existing project-config pointer. Orchestrator primary, seven subagents; dispatch table unchanged, nested dispatch forbidden.
- [ ] Run focused tests and `npx --no-install vitest run tests/cli/init.test.ts tests/cli/config-health.test.ts`; reviewer checks fixture completeness against each original builder, not just snapshots.

## Task 5: One-time fail-closed V1→V2 migration transaction

**Metadata:**
- risk: high
- parallel: false
- depends_on: ['Task 3', 'Task 4']

**Owner:** `kiki-implementer`.

**Files:** Create `src/cli/oc2-migration.ts`, `tests/cli/oc2-migration.test.ts`; modify `src/cli/commands/migrate.ts`, `src/cli/{args,index,opencode-config}.ts` migration sections.

**Interfaces:** `MigrationOptions = { from?: string; project?: string; force: boolean; destination: string }`; `MigrationReport = { migrated: string[]; rejected: {agent:string;reason:string}[]; manual: string[]; marker?: string; exitCode: 0|1 }`; `migrateOC1(options: MigrationOptions): MigrationReport`. CLI `kiki migrate [--from <dir>] [--project <path>] [--force]`; no `--project` means global. Default source is OC1 default global dir, not isolated env. Existing `migrateProject(project, global?)` delegates to this transaction for project mode.

- [ ] Add failing matrix tests: every Task 4 map, explicit ask, unknown action/value, malformed/duplicate native/legacy definitions, prototype keys, aliases and rule precedence, provider/model with slash, variant, legacy provider-ID renames, title/small-model conversions, destination model/rule conflict, failed backup/write, rerun/force, and global/project source/destination alias. Assert global OC1 source byte/mtime unchanged, backups 0600 and dirs 0700 with manifest, non-Kiki entries never migrated, user scientist file only reported by name.
- [ ] Add `invalid_agent_never_gets_baseline_grants` and `partial_failure_has_no_completion_marker`: if an agent is rejected, neither its model nor permissions nor files are written; existing destination for it stays unchanged; exit nonzero. Successfully migrated independent agents may commit only after complete preflight; no project cleanup on a partially failed transaction. No completion marker until every eligible agent succeeds. A second attempt recognizes byte-identical prior successful writes without broadening them.
- [ ] Run `npx --no-install vitest run tests/cli/oc2-migration.test.ts`; expect missing transaction failure.
- [ ] Implement allowlisted extraction from **secret-free** source configs only; do not copy provider/auth/env data or recursively scan source directories. Credential-bearing source config requires user-sanitized export via `--from`; do not inspect it to discover values. Invalid model/variant is a rejected agent, not dropped assignment. Preserve destination-native assignments/rules if equivalent; conflicting user-owned values reject that agent with a names-only diagnostic rather than overwrite either choice.
- [ ] Plan all writes, validate them, back up then atomically apply with restoration on I/O failure. Convert Kiki-only plugin references to chosen package registration; report all other plugins/agents without copying. Existing top-level source permissions that affect Kiki must be accounted for in effective per-agent rules or cause rejection; never silently ignore them or write destination top-level permissions.
- [ ] Implement project-tier extraction with destination override precedence, inherited-grant masking, backup and removal of redundant **Kiki-only** local files only after success. Global source is always read-only. Write `.agentic/kiki/migration.json` under target project (or destination config for global mode), with source dir, timestamp, version; existing marker refuses unless `--force`, which creates new backups. Reject unknown/duplicate CLI flags and missing arguments.
- [ ] Run focused matrix plus `tests/cli/global-policy.test.ts`; reviewer checks effective policies, marker scope, conflict behavior, secret boundary and source immutability.

## Task 6: Typed watchdog engine and V2 event adapter

**Metadata:**
- risk: high
- parallel: true
- depends_on: ['Task 2', 'Task 3']

**Owner:** `kiki-implementer`.

**Files:** Create `src/server/{watchdog,watchdog-events}.ts`, `tests/plugin/watchdog-events.test.ts`; port `tests/plugin/watchdog.test.ts` from source-string harness to typed engine. Keep original source file until Task 7 removes generator consumers.

**Interfaces:** `WatchdogEvent` discriminated union: `child` (id,parentID,agent?), `running` (id), `finished` (id), `text` (id,key,text,mode:'append'|'replace'), `tool` (id,key,name,input), `tokens` (id,counters); `decodeWatchdogEvent(event: OpenCodeEvent): WatchdogEvent[]` is stateless; the per-setup engine owns text accumulation. `createWatchdog(deps: {config: KikiHealthConfig; directory: string; now:()=>number; interrupt:(id:string)=>Promise<void>; discover:()=>Promise<WatchdogEvent[]>; writeHealth:(level:string,entry:Record<string,unknown>)=>void}): {handle(event:WatchdogEvent):void; start():void; stop():Promise<void>}`. Counter fields retain original input/output/reasoning/cacheRead/cacheWrite semantics.

- [ ] Add failing typed event fixtures using actual client union, `satisfies`/extracted event types, not cast OC1 payloads. Pin `.data.sessionID` and creation's direct `.data.parentID` (not `.info`); map `session.execution.started` to running; succeeded/failed/interrupted/deleted to finish; text/reasoning started/delta/ended keyed by assistantMessageID+ordinal; tool input/called events and both `session.tool.success` and `session.tool.failed` keyed by id. Pin `session.tool.progress` as ephemeral activity, not a new completed tool/ring item. Test step-ended/usage-updated token observations using verified counter shapes. Record agent selection changes and child discovery. Ignore irrelevant events without refreshing activity.
- [ ] Run `npx --no-install vitest run tests/plugin/watchdog.test.ts tests/plugin/watchdog-events.test.ts`; expect missing typed adapter failure.
- [ ] Move the existing algorithm, thresholds, content normalization/hash/rings, tool signature, grace/absolute/silence timers, watchAllSubagents behavior and health log fields unchanged. Accumulate deltas to replace the same logical ring item rather than count fragments as repeats. Preserve root-session exclusion and stop on terminal execution, including failures.
- [ ] Add fake-clock tests for exact thresholds, repeated logical content/tools vs streaming fragments, token increments, discovery of existing children, interrupted/rejected interrupt, log failure, late discovery, stop-before-start and double stop. Assert at most one interrupt per child and none after awaited stop.
- [ ] Implement the Task 2 public-client discovery/status adapter (not OC1 `session.messages`), subscription cancellation, and bounded shutdown of idle iterators; no global state or timing rewrites. Sanitize logged failures, never emit raw upstream errors/config/provider data.
- [ ] Run focused tests; reviewer compares original watchdog outcomes and confirms no leaked interval, blocked cleanup, or renewed idle child after terminal events.

## Task 7: Package server setup, routing logger and lifecycle

**Metadata:**
- risk: medium
- parallel: false
- depends_on: ['Task 4', 'Task 6']

**Owner:** `kiki-implementer`.

**Files:** Create `src/server/{index,routing-logger}.ts`, `tests/plugin/{routing-logger,server-lifecycle}.test.ts`; modify `src/cli/config.ts` generator consumers, `tests/cli/plugin-template.test.ts`, `tests/integration/watchdog-plugin-syntax.test.ts`; remove `src/plugin/{watchdog-source,dedup-source}.ts` and obsolete V1-only dedup tests after replacing their safety coverage.

**Interfaces:** Default export `Plugin.define({id:'kiki',setup(ctx)})`; `startRoutingLogger(ctx: ServerContext): () => void`; setup returns an awaited idempotent cleanup releasing logger hooks, event iterator and watchdog. `ServerContext` derives from actual SDK as Task 2 specifies.

- [ ] Add failing logger assertion: subagent input `{agent:'kiki-reviewer',description:'Review migration safety'}` appends only `{timestamp,agent:'kiki-reviewer',model:'unknown'}`; explicit model retained; unrelated tools ignored; input unchanged; root comes from verified `ctx.location` field. Never log description/prompt/credentials.
- [ ] Add lifecycle tests: setup→event→cleanup→setup produces one active logger/watchdog; duplicate setup is OC2 registry's responsibility; partial setup failure releases acquired resources; repeated cleanup safe; pending stream/discovery cannot resurrect work.
- [ ] Run `npx --no-install vitest run tests/plugin/routing-logger.test.ts tests/plugin/server-lifecycle.test.ts`; expect missing server module failure.
- [ ] Implement hooks with actual SDK disposers, health settings loaded only from project `.agentic/kiki/config.json`, existing defaults/sanitization and log formats. Drop globalThis dedup and generated plugin strings, not their intended one-source diagnostic requirement. Keep agents independent of plugin success.
- [ ] Run `npx --no-install vitest run tests/plugin/routing-logger.test.ts tests/plugin/server-lifecycle.test.ts tests/plugin/watchdog.test.ts tests/plugin/watchdog-events.test.ts tests/cli/plugin-template.test.ts tests/integration/watchdog-plugin-syntax.test.ts`. Interim template/syntax checks must load/typecheck the server dependency closure, not require a full package build or claim real packaged/binary acceptance. All these scoped tests must pass; the real-binary portion remains explicitly deferred to Task 11.
- [ ] Typecheck and emit **only the server dependency closure** using a disposable tsconfig extending the unchanged project tsconfig: absolute `files: [<checkout>/src/server/index.ts]`, `include: []`, inherited compiler options/rootDir, and `outDir: <disposable>/dist`. Run `npx --no-install tsc --project <disposable>/tsconfig.server.json --noEmit`, then the same command without `--noEmit`; expect zero errors and server JS/declarations in disposable output only. Dependencies imported by that entrypoint remain included and must compile; never exclude an imported file to hide an error. Reviewer verifies SDK imports, no V1 server imports, awaited cleanup and declared export target names. Actual package export resolution remains a Task 10/11 check, not an interim certificate.
- [ ] Run `npx --no-install tsc --noEmit` on the full tree as a **diagnostic only**: until Task 10, only recorded unported `src/tui/*` errors are permitted; report them without claiming green or running `npm run build` to emit a partial distribution. Remove obsolete generator fields/consumers together; defer final deletion of any field still used by Task 8's install code until Task 8, rather than introducing additional backend type errors. Reviewer releases Task 7 on scoped green plus this explicit TUI deferral. Task 10 must close the deferral; Task 11 repeats full-tree checks with no exceptions.

## Task 8: Install/update/project lifecycle and OC2 diagnostics

**Metadata:**
- risk: high
- parallel: false
- depends_on: ['Task 4', 'Task 5', 'Task 7']

**Owner:** `kiki-implementer` (all registration/config/tooling, not GUI).

**Files:** Create `src/cli/oc2-registration.ts`, `tests/cli/oc2-registration.test.ts`; modify `src/cli/opencode-config.ts:268-407`, `src/cli/commands/{install,update,init,reset,doctor,status,routing}.ts`, `src/cli/{index,doctor-skills}.ts`, existing corresponding CLI tests including `tui-install.test.ts` and `doctor-skills.test.ts`.

**Interfaces:** `prepareRegistration(directory: string, packageSpec: string): { files: string[]; apply(): void }`; `removeKikiRegistration(directory: string): void` removes only known Kiki entries using existing backup flow. Existing `installGlobalFiles(directory?,update?)`, `initializeProjectAgents(project,config,directory?)`, `resetProject(project)` keep call signatures. Installation source is current package root absolute directory in checkout/dev mode; release form uses `kiki` with user-run `opencode plugin add kiki@3.0.0` (Git form only after verified candidate availability).

- [ ] Add failing install/update/reset tests: eight native `agents/kiki-*.md`, no model in frontmatter, existing native permission additions/models byte-preserved, no V1 generated plugin/prompts loader, once-only `plugins` server registration and `cli.json` TUI registration, no config-dir package.json/node_modules pinning. Repeated install/update is idempotent. Malformed tiers/backups/guard failure write nothing.
- [ ] Add diagnostic tests: exact observed OC2 version and mismatch; root overlap/env inconsistency; native agent parse/modes; optional model informational; duplicate local/global/package server source fatal; missing cli.json registration; credentials existence only, zero file reads; status shape preserved; retirement copy points to `agents.<id>.model`; reset backs up before deleting local Kiki entries/files and leaves ancestor/unrelated files untouched.
- [ ] Run `npx --no-install vitest run tests/cli/oc2-registration.test.ts tests/cli/install.test.ts tests/cli/update.test.ts tests/cli/tui-install.test.ts tests/cli/doctor.test.ts`; expect old-layout failures.
- [ ] Implement install plan validation before writes, existing 0600 backup manifest flow, agent files plus workflow and package registration. Preserve deliberate absence of permissions on existing agents; do not reintroduce file baseline grants when a user intentionally inherits. Model/rule arrays must not be merged as unordered objects. Never rewrite top-level permissions or unrelated plugin entries. Detect duplicate sources and refuse conflicting registrations rather than silently deleting user entries.
- [ ] Adapt init/project masking/reset and all status/help/routing text; support OC2-only rollback cleanup through `removeKikiRegistration` plus manifest-owned agent files, not a new unapproved public uninstall feature. Re-verify skills via config-entry `skill/` and `skills/` directories plus explicit `skills` local paths and isolated URL cache sources; distinguish disk-only observations from actually discoverable roots. Do not mark a V1 package-cache skill live in OC2 solely because it exists.
- [ ] Run focused tests plus `npx --no-install vitest run tests/cli/global-policy.test.ts tests/cli/init.test.ts tests/cli/status.test.ts tests/cli/routing.test.ts tests/cli/doctor-skills.test.ts`; reviewer checks update permission ownership and backup/rollback across all tiers.

## Task 9: Port native `/kiki` menu interactions (GUI only)

**Metadata:**
- risk: medium
- parallel: true
- depends_on: ['Task 3']

**Owner:** `kiki-gui-designer`, not backend implementer.

**Files:** Modify `src/tui/model-menu.ts`, `tests/tui/model-menu.test.ts`.

**Interfaces:** Keep exported `ModelSettings` list/save/remove/removeAllProject contract unchanged; replace `registerKikiMenu` with `registerKikiMenu(ctx: Plugin.Context, settings: ModelSettings): () => void` returning own stale-promise cleanup. Host owns disposal of `ctx.keymap.layer`; do not invent a registration disposer.

- [ ] Add failing V2 mock tests: native dialog `select` resolves string/undefined; command has `id:'kiki.menu'`, `palette:true`, `slash:{name:'kiki'}`; both scopes, inherited/override display, provider/model sorting/filter parity, global save override hint, single local removal, remove-all confirmation, exact current German menu/toast copy and duration 8000.
- [ ] Add delayed promise/cancel/unload/double-dispatch/provider-removal/malformed-config tests. Assert exactly zero `ctx.client` prompt/generate calls and zero active-chat model mutations, no write after stale completion, and only selected `agents.<id>.model` changes through ModelSettings.
- [ ] Run `npx --no-install vitest run tests/tui/model-menu.test.ts`; expect old callback API failures.
- [ ] Implement sequential awaited dialogs, one active flow token and busy guard, fresh availability validation, `ctx.data.location.model/provider` collections with safe not-ready behavior, and `ctx.ui.toast.show`. Preserve current search/menu order/labels; no visual redesign or new model policy. Promise dialogs return values, not option objects.
- [ ] Run focused tests; independent reviewer checks all existing UX cases were ported rather than removed and confirms backend config is not reimplemented in GUI code.

## Task 10: V2 TUI entrypoint, safe setup and packaged PTY interaction

**Metadata:**
- risk: high
- parallel: false
- depends_on: ['Task 8', 'Task 9']

**Owner:** `kiki-gui-designer` for entrypoint/PTY; backend fixes return to implementer.

**Files:** Modify `src/tui/index.ts`, `tests/integration/kiki-tui.test.ts`, `tests/integration/fixtures/kiki-tui-smoke.py`; create `tests/tui/setup.test.ts`.

**Interfaces:** Default export `Plugin.define({id:'kiki',setup(ctx)})` from `@opencode/plugin/tui`; setup builds `ModelContext` from Task 3 root resolution and verified V2 location directory, uses existing shared model functions, returns Task 9 cleanup.

- [ ] Add failing setup tests: writable/parseable isolated config registers menu; unresolved location/not-ready data safely delays/refuses; overlapping/unwritable/malformed root shows clear German error toast and registers no writable flow. No dependence on V1 `api.state.path.config` or lifecycle APIs.
- [ ] Run `npx --no-install vitest run tests/tui/setup.test.ts tests/tui/model-menu.test.ts`; expect old entrypoint failure.
- [ ] Implement setup with fail-closed shared guards and no secret reads. Port PTY scenario to actual V2 slash command, package `cli.json` registration and value dialogs. Assert config object write/comment retention, local override retention/removal confirmation, and provider request counter **zero** during menu use.
- [ ] Run `npx --no-install tsc --noEmit`, `npm run build`, and `npm run lint` on the **entire actual V3 source tree**; expect exit 0 for all, with no Task 2/7 TUI exceptions left. Verify both built package entrypoints resolve with the installed pinned SDK. Any backend failure returns to implementer; do not weaken shared compiler settings or restore the V1 dependency. Task 11 cannot start on a partial build.
- [ ] Run unit tests and actual packaged PTY test via Task 11 harness after binary prerequisites exist. Missing binary is explicitly NOT VERIFIED, not a green GUI acceptance. Reviewer sees PTY transcript with synthetic content only.

## Task 11: Real-binary packaged integration, policy and isolation acceptance

**Metadata:**
- risk: high
- parallel: false
- depends_on: ['Task 5', 'Task 7', 'Task 8', 'Task 10']

**Owner:** `kiki-implementer`; PTY ownership remains GUI designer, independent reviewer owns acceptance.

**Files:** Create helper/provider/new integration files in file map; modify existing integration tests listed there and `tests/integration/fixtures/kiki-tui-smoke.py` only through GUI owner.

**Interfaces:** `createOC2Fixture(binary: string): { root:string; env:NodeJS.ProcessEnv; project:string; config:string; cleanup():Promise<void> }` creates fixture HOME and **all** XDG roots plus explicit OPENCODE_CONFIG_DIR; whitelist child env instead of inheriting auth/provider/config variables. `startFixtureProvider(): Promise<{baseURL:string; requests:()=>number; stop():Promise<void>}>` uses loopback scripted responses/held child stream, not external LLM calls. `OPENCODE_TEST_BINARY` supplied explicitly; harness refuses version other than exactly 2.2.6.

- [ ] Write failing real tests before porting fixture plumbing. Pack candidate with `npm pack --ignore-scripts --pack-destination <fixture-artifacts-dir>` and install into a disposable consumer with production dependencies only. Test dev absolute-directory registration **and** packed consumer registration through OC2 Host; imports must resolve without checkout node_modules. Network dependency acquisition, if needed, requires execution approval and must not read credential-bearing npm config.
- [ ] With the Task 2 verified CLI/client commands, assert all eight native agents/modes, orchestrator selectable, global/project model precedence, actual allow/deny/ask evaluation for secret/worktree/custom path policies, file agents still discoverable if server plugin deliberately fails. Test config permissions appended after file rules and global rules appended to every agent; do not rely only on JSON shape.
- [ ] Script one orchestrator response that calls real `subagent` with 3–5-word description; child fixture response completes; assert exactly one log entry of unchanged format. Use a held child provider stream and shortened fixture health thresholds to trip real watchdog; assert actual `session.execution.interrupted` and health-abort record, not just a mocked interrupt call. Record no external provider traffic.
- [ ] Repeat scripted dispatch with `background: true`: assert exactly one routing entry, a parentID-bearing child, continued watchdog tracking after the parent returns idle, and interruption/health record for a held background child under the same thresholds. Dispatch mode must not change logging format or child-watch policy; this tests an existing V2 input, not a new dispatch workflow.
- [ ] Test cleanup/reload by replacing a fixture plugin revision, verifying old subscription/interval stops and next dispatch logs once. Duplicate server registration must be diagnosed. Port packaged `/kiki` PTY test from Task 10 and enforce zero provider requests for menu interactions.
- [ ] Run fixture global migration and project-tier migration including fail-closed cases, force/rerun, backups and rollback; snapshot only synthetic OC1 tree, excluding no files, before/after OC2 activity. Assert zero OC2 writes in all fixture OC1 config/data/cache/state roots. Test symlink root overlap denial and credential presence checks with spies that fail on credential reads.
- [ ] Run `OPENCODE_TEST_BINARY=<absolute-user-supplied-2.2.6-binary> npx --no-install vitest run tests/integration/opencode-global-agents.test.ts tests/integration/routing-pipeline.test.ts tests/integration/watchdog-plugin-syntax.test.ts tests/integration/kiki-tui.test.ts tests/integration/oc2-isolation.test.ts tests/integration/oc2-watchdog.test.ts tests/integration/oc2-package.test.ts`. Expect all required scenarios pass, **zero skips**; fixtures cleaned after termination, no children/listeners left.
- [ ] Run `npm test`, `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build` against the actual V3 source snapshot; all must exit 0 with no interim allowances. Record a secret-free input manifest (paths/digests, versions, SDK lock integrity), generated dist manifest and packed tarball digest for **ACTUAL_V3_VALIDATION**; hash the pack inputs before/after validation and confirm no source change. New V3 source/test files must be present in this manifest, not silently omitted because untracked. Reviewer rejects any substituted mock-only or later synthetic-rehearsal evidence for actual artifacts. If scripted dispatch or watchdog trip cannot be achieved with pinned upstream APIs, report a blocker; do not weaken acceptance to syntax checks.

## Task 12: Historian documentation and operational rollback guide

**Metadata:**
- risk: medium
- parallel: false
- depends_on: ['Task 11']

**Owner:** `kiki-historian`, independently reviewed; documentation is required, not optional.

**Files:** Modify `README.md`, `CHANGELOG.md`, `docs/migrations/kiki-3-oc2-parallel.md`, `docs/migrations/kiki-3-oc2-api-contract.md`; create `docs/migrations/kiki-3-oc2-acceptance.md`.

**Interfaces:** Consumes tested commands, actual binary/package results and user checkpoints. Produces usage/migration/rollback instructions and an acceptance table distinguishing ACTUAL_V3_VALIDATION, RELEASE_REHEARSAL, and FUTURE_RELEASE_AUTHORIZATION, each separately marked PASS, BLOCKED, or NOT RUN, plus user-run machine results (no implied live machine success). A rehearsal PASS cannot fill the actual-artifact or actual-release columns.

- [ ] Review docs against actual CLI help and package manifest: exact OC2/SDK pins, no V1 default examples in V3 instructions, install/update/dev/package variants, V2 model/rule keys, no model seeding, preserved user permissions, project init/reset/migrate behavior and German UX.
- [ ] Document safe sanitized `--from` migration, source immutability, per-agent rejection/partial rerun behavior, marker location/force backups, user-owned scientist/manual non-Kiki migration and provider login. Do not recommend copying `.env`, auth or provider configs.
- [ ] Expand machine appendix into checked commands and explicit rollback of wrappers plus OC2-only Kiki artifacts using backup manifests; preserve V1 and project data, do not add an unsupported uninstall CLI. Version pin prevents unattended update drift.
- [ ] Record coverage and commands from Task 11, fresh audit status from Task 13 when available, and machine checklist from Task 14 without claiming those pending gates passed. Run `node dist/cli/index.js verify docs/migrations/kiki-3-oc2-parallel.md` and `node dist/cli/index.js verify docs/migrations/kiki-3-oc2-api-contract.md` against synthetic env; expect no unresolved placeholders in final runbook. Reviewer cross-checks all literal commands and rollback paths; orchestrator records documentation completion only after final evidence update.

## Task 13: Actual V3 security validation and isolated 2.4.0→3.0.0 release rehearsal

**Metadata:**
- risk: high
- parallel: false
- depends_on: ['Task 11', 'Task 12']

**Owner:** `kiki-implementer`; independent `kiki-reviewer` security/release gate, historian records findings.

**Files:** Modify `src/cli/release-gates.ts:45-51` only for the existing planned server artifact invariant; extend `tests/integration/oc2-release-rehearsal.test.ts` (new) and existing release gate tests, using `tests/helpers/release-fixture.ts`; update acceptance report. No changes to release version policy, argument parser, candidate isolation, gate ordering or apply semantics. No automatic release application.

**Interfaces:** Produces two independently identified evidence sets: **ACTUAL_V3_VALIDATION** for unmodified 3.0.0 checkout/build/package bytes (Task 11 plus fresh audit), and **RELEASE_REHEARSAL** for an explicitly synthetic 2.4.0-versioned copy of the reviewed V3 source passed through the unchanged release command with `--bump major --since e2bf396df5a14657f34f55c78b31819be10b9c05` and **no `--apply`**. Existing `GateResult` interface/exit semantics unchanged. New server JS/d.ts join known distributable outputs; dist prefix allowlist stays scoped. Rehearsal does not certify live artifacts or authorize their release.

- [ ] Add failing release artifact tests: missing `dist/server/index.js`/`.d.ts` fails invariants; packed server/TUI dependency closure resolves; versions remain synchronized; V1 exception cannot authorize V2 findings. Preserve existing byte-copy candidate, symlink/.bin isolation and dry-run safety-spy tests.
- [ ] Run focused release tests red, implement only the previously scoped artifact-invariant additions, then run them green. Do **not** change `src/cli/release-policy.ts` or `src/cli/commands/release.ts` to allow releasing the current version. Verified limitation: from the actual 3.0.0 tree, default baseline lookup currently lacks `release v3.0.0`; even with `--since`, explicit major yields 4.0.0, never 3.0.0. Do not run a newer-version dry-run as evidence for 3.0.0 or fabricate history/commits. Dry-run is the existing default; `--dry-run` is rejected by the existing parser.
- [ ] Reconfirm Task 11's actual input/dist/tarball digests, then run `npm audit --json --include=dev --include=optional --include=peer` on the **actual V3 dependency graph**, with synthetic npm configuration that cannot consume user credentials. Record package paths/severity/runtime reachability and result tied to its unchanged lock integrity. High/critical findings require a **new explicit user exception**; an INCOMPLETE audit blocks and **cannot** be excepted under existing policy. No dependency/audit bypass. Any post-Task-11 source/dependency change, including artifact-invariant edits, invalidates affected actual evidence: rerun full Task 10/11 checks, real package/binary tests, and audit for the final snapshot.
- [ ] Add `rehearses_major_from_synthetic_2_4_without_source_writes`: materialize an independent secret-free snapshot of final reviewed **V3 source**, including new files, under a disposable root, with private Git metadata/index. Preserve actual e2bf396 and reviewed HEAD objects/history for the real `--since <ref>..HEAD` query, using an independent local object copy or read-only object alternate; never share writable refs/index/worktree, copy credentials/config, invent commits or stage anything in the development checkout. Register the materialized manifest in the **fixture-only index** so the existing tracked-files candidate copier includes every new file; assert `git ls-files` matches it. If unavailable Git objects/permissions prevent this, report the rehearsal BLOCKED, do not replace history/runners with successful mocks. Set HOME/XDG/npm paths to synthetic roots and use local isolated dependencies as existing release fixtures do; no provider credentials.
- [ ] Normalize **only this synthetic copy's release inputs**: `package.json.version`, lockfile root version and `packages[''].version`, and the anchored `KIKI_VERSION` become `2.4.0` while V3 source, exports, SDK/dependency lock entries and tests remain intact. Keep CHANGELOG's prior 2.4.0/history; put the reviewed V3 notes in exactly one nonempty `[Unreleased]` section with no pre-existing `[3.0.0]` target. Record the exact four-file normalization diff separately from the actual snapshot; reject unrelated differences. Do not copy frozen V1 source or V1 lockfile to achieve this. Bootstrap the rehearsal CLI in the disposable root; it identifies its input as 2.4.0 solely to exercise the existing transform.
- [ ] From that synthetic root run `node dist/cli/index.js release --bump major --since e2bf396df5a14657f34f55c78b31819be10b9c05` (dry-run by **absence of `--apply`**). Assert baseline is that explicit ref, `Version: 2.4.0 -> 3.0.0 (--bump major; ...)`, all six real gates complete, candidate invariants certify 3.0.0 source/dist versions and server/TUI artifacts, and `Applied: false`. For candidate inspection in the automated regression, call existing `prepareRelease(rehearsalRoot, parseReleaseArgs(['--bump','major','--since',baseline]), deps)` with an observing **real process runner**: delegate every command, preserve exact results, and capture candidate artifact hashes after gate commands before normal disposal. No product cleanup changes or mocked Git/gate successes. Assert CLI invocation and exported-function result agree on next version, gate results and no apply.
- [ ] Gate the expensive rehearsal test with `KIKI_RELEASE_TEST_OC2_REHEARSAL=1`, using the existing `testGateEnvironment` removal of `KIKI_RELEASE_TEST_*` inside nested candidate test runs; assert that removal and no recursive rehearsal launch. Do not change the gate environment or suppress unrelated tests. Run `KIKI_RELEASE_TEST_OC2_REHEARSAL=1 npx --no-install vitest run tests/integration/oc2-release-rehearsal.test.ts` red→green; the outer rehearsal must run without skips. Include negative assertions: an input already at 3.0.0 computes 4.0.0 for `--bump major`, never labels it 3.0.0; parser rejects `--dry-run`; original checkout source/dist/index/refs and synthetic input tree are unchanged after dry-run (ignoring fixture-owned logs). No rehearsal executes during planning.
- [ ] Run full existing release tests, including safety spies, real-build/copied-deps tests, without relaxing them for rehearsal. Record real log, input normalization diff, provenance/digests, audit result and transformed-candidate manifest as **RELEASE_REHEARSAL**, distinct from Task 11's actual tarball/dist and actual audit. Require both evidence sets independently; matching source provenance does not make synthetic artifact hashes a certificate for live bytes. Never copy the rehearsed candidate back to the checkout or publish it.
- [ ] Independent whole-branch review checks alignment, spec coverage, actual packaged/binary/audit evidence, rehearsal evidence, documentation and dirty-file preservation. **Faithfulness assessment:** this rehearsal satisfies spec §§7.3/8's release-preparation intent (real unchanged gates, e2bf396 baseline, 2.4.0→3.0.0 major transform) while retaining §6.1's actual V3 identity. It does not satisfy an actual release/copy-back gate; label that **FUTURE_RELEASE_AUTHORIZATION: NOT RUN**. The user's rehearsal preference selects verification scope only, not a release-policy change.
- [ ] Before any eventual actual release, obtain a separately reviewed and explicitly user-authorized procedure defining the release workspace/input version, exact commands, provenance/equivalence comparison to the accepted actual V3 snapshot, fresh full candidate/artifact/binary/audit validation and any permitted apply/copy-back. Do not downgrade/reset/clean the development checkout, apply the rehearsal, increment to 4.0.0, or infer authorization for commits/tags/push/publish. Release-policy changes, if later proposed, need a separate decision; no actual release procedure is silently selected here. Until then report release preparation complete only if both evidence sets pass, **actual release not performed**.

## Task 14: Human machine acceptance and explicit switch/rollback decision

**Metadata:**
- risk: high
- parallel: false
- depends_on: ['Task 1', 'Task 11', 'Task 12', 'Task 13']

**Owner:** human executes; historian records non-secret results; independent reviewer verifies evidence, orchestrator owns completion registry.

**Files:** Update only `docs/migrations/kiki-3-oc2-acceptance.md` with provided observations; no agent live-machine edits.

**Interfaces:** Human decides ACCEPT/SWITCH, RETAIN OC1, or ROLLBACK. `opencode` binary default may already be OC2 from authorized setup, but Kiki real-task workflow remains `opencode-v1` + `kiki-v1` until this decision.

- [ ] Human repeats version/PATH/four-root isolation checks, verifies frozen CLI and V1 TUI loader no longer depend on development dist, and performs user-owned provider login. Agent never reads credentials or logs their values.
- [ ] Human, only after live-write authorization and confirming configs are secret-free or using sanitized exports, runs isolated `kiki install`, `kiki migrate [--from <sanitized-dir>]`, `kiki doctor <scratch-project>`, one real orchestrator→subagent dispatch, `/kiki` save/removal, and a V1 smoke run in a separate scratch project. Record versions/paths/check outcomes only, not provider configuration.
- [ ] Human rehearses Kiki cleanup/restore on a throwaway OC2 config copy, plus wrapper rollback commands without deleting working databases. Verify OC1 still runs recorded version and frozen Kiki, and no OC2 cli.json appeared in OC1 config. Do not delete `~/.opencode2` in an acceptance drill.
- [ ] Reviewer compares all automated and machine evidence; historian updates docs; user explicitly chooses whether to switch real Kiki tasks to OC2. Orchestrator alone updates registry and documentation status. Missing machine evidence, audit approval or architect acceptance remains an explicit incomplete gate, never assumed success.

## Machine appendix — commands to publish and have the human run, not execute now

These commands target the approved `/home/lutz` installer layout. Before any creation, human checks each parent with `ls -ld`, checks intended targets do not exist, records current command resolution, and stops on unexpected paths. Do not print full environments or inspect configs to extract keys. Commands are staged, **not an unattended script**. The final runbook must reconcile any changed machine layout before the human proceeds.

### A. Protect V1 before development edits

In a clean shell (no `OPENCODE_CONFIG_DIR`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`, or `XDG_STATE_HOME` pointing at OC2):

```bash
command -v opencode
/home/lutz/.opencode/bin/opencode --version
ls -ld /home/lutz/lprojekte /home/lutz/.local/bin /home/lutz/.opencode/bin
test ! -e /home/lutz/lprojekte/kiki-v1
git -C /home/lutz/lprojekte/kiki worktree add --detach /home/lutz/lprojekte/kiki-v1 e2bf396df5a14657f34f55c78b31819be10b9c05
```

Human next runs `npm ci` and `npm run build` **in `/home/lutz/lprojekte/kiki-v1`**, not the moving checkout. Supply registry setup themselves if needed; agents must not access credential-bearing npm config. Create `~/.local/bin/kiki-v1` only after checking it does not exist:

```sh
#!/bin/sh
exec node /home/lutz/lprojekte/kiki-v1/dist/cli/index.js "$@"
```

Human makes it executable. Crucially, before any V3 build, back up the existing **non-secret loader file only** `~/.config/opencode/kiki/tui.js` to a new, non-overwriting backup and replace its checkout target with:

```js
export { default } from 'file:///home/lutz/lprojekte/kiki-v1/dist/tui/index.js';
```

Do not run V3 against the OC1 config. Existing generated OC1 plugin and prompts remain unchanged. Human checks the old checkout-driven CLI invocation is no longer used for real work, verifies the loader target and V1 `/kiki`, then records `V1_PROTECTED`. Restart V1 after detachment; merely repointing the CLI is insufficient.

### B. Install OC2 only after explicit human authorization

Stop if retained binary name already exists. Record OC1 version, then:

```bash
test ! -e /home/lutz/.opencode/bin/opencode-v1
mv /home/lutz/.opencode/bin/opencode /home/lutz/.opencode/bin/opencode-v1
curl -fsSL https://opencode.ai/v2/install | bash -s -- --version 2.2.6 --no-modify-path
mkdir -p /home/lutz/.opencode2/config/opencode /home/lutz/.opencode2/data /home/lutz/.opencode2/cache /home/lutz/.opencode2/state
```

Using `--no-modify-path` avoids installer shell-rc changes; human ensures `~/.local/bin` precedes `~/.opencode/bin` and checks for aliases/functions, then refreshes shell command cache. Create the `~/.local/bin/opencode` wrapper (never overwrite an existing wrapper without user review):

```sh
#!/bin/sh
export OPENCODE_CONFIG_DIR="$HOME/.opencode2/config/opencode"
export XDG_DATA_HOME="$HOME/.opencode2/data"
export XDG_CACHE_HOME="$HOME/.opencode2/cache"
export XDG_STATE_HOME="$HOME/.opencode2/state"
exec "$HOME/.opencode/bin/opencode" "$@"
```

Create `~/.local/bin/opencode-v1` in a **clean inherited OC1 environment**:

```sh
#!/bin/sh
exec "$HOME/.opencode/bin/opencode-v1" "$@"
```

Human marks wrappers executable. Never invoke fallback commands from a shell exporting OC2 roots. Do not globally export OC2 isolation variables in shell startup files. `kiki-v1` likewise inherits a clean OC1 environment.

Before first OC2 launch human creates a new isolated `~/.opencode2/config/opencode/opencode.jsonc` containing `{"update":"disable","experimental":{"subagent_depth":1}}` (merge themselves if already present; never overwrite user config). Login is user-owned and not copied from OC1.

### C. Verify separation before fixture/product work

```bash
command -v opencode
command -v opencode-v1
opencode --version
opencode-v1 --version
ls -ld /home/lutz/.opencode2/config/opencode /home/lutz/.opencode2/data/opencode /home/lutz/.opencode2/cache/opencode /home/lutz/.opencode2/state/opencode
test ! -e /home/lutz/.config/opencode/cli.json
```

Expected wrapper paths both in `/home/lutz/.local/bin`; exact OC2 `2.2.6`, OC1 recorded version. Some runtime dirs appear only after first authorized launch. Use the Task 2 verified service-path command, if available; an unsupported command is not proof of isolation. Human records metadata before/after first OC2 run for OC1 config/data/cache/state, without reading contents (especially auth/.env); verify no new OC2 artifacts/DB there. If a pre-existing cli.json exists, record baseline rather than assume absence. Automated Task 11 byte-snapshot proof applies only to synthetic fixtures.

### D. Activate development Kiki only after fixture gates

Create `~/.local/bin/kiki` with the same four exports as `opencode`, ending with:

```sh
exec node /home/lutz/lprojekte/kiki/dist/cli/index.js "$@"
```

Verify this wrapper, not old `npx file:`/global Kiki, resolves first. Explicit user live-write authorization is required for `kiki install`, migration and model saves. Checkout registration points to `/home/lutz/lprojekte/kiki` in both native plugin lists; release package installation uses verified `opencode plugin add kiki@3.0.0` only when such candidate is available, not an assumed published release.

### E. Rollback (human chooses; do not run automatically)

Restore/remove only known OC2 Kiki agent files and plugin-list entries with backup/manifest validation; do not remove unrelated config or project data. To revert machine default, after verifying wrapper identities and retained binary availability:

```bash
rm /home/lutz/.local/bin/opencode /home/lutz/.local/bin/opencode-v1
mv /home/lutz/.opencode/bin/opencode-v1 /home/lutz/.opencode/bin/opencode
```

Restore previous wrappers from human-owned backups if they existed, remove/restore only the known V3 `kiki` wrapper, keep `kiki-v1` and its detached TUI target, refresh shell command cache, repeat version/PATH/V1 menu smoke checks. Keep OC2 state for diagnosis; optional deletion is a separate destructive user choice after backing up user-owned sessions/credentials, never part of the drill. No freeze-tag operations or V1 database restores are needed if isolation passed.

## Dependency and review schedule

- Hard safety chain: architect review → Task 1 (`V1_PROTECTED`) → Task 2 → Task 3.
- Parallel after Task 3: Task 4 (agents/permissions), Task 6 (watchdog), Task 9 (GUI menu); disjoint source ownership. Keep model/config shared-interface changes in Task 3, not concurrent edits.
- Backend join: Task 4 → Task 5; Tasks 4+6 → Task 7; Tasks 4+5+7 → Task 8.
- GUI join: Tasks 8+9 → Task 10; GUI designer owns only menu/entrypoint/PTY changes, backend implementer owns registration and shared config.
- Final chain: Tasks 5+7+8+10 → Task 11 → Task 12 → Task 13 → Task 14; task-sized independent reviews precede each dependency release, plus whole-branch review at Task 13.
- Task 7's server-only compiler gate is not a full-tree build; Tasks 10 and 11 require full-tree green. Task 13 artifact edits trigger renewed actual validation before its isolated release rehearsal; the rehearsal is never a substitute for that validation or permission to release.
- Human installation/default changes and credential login are never delegated to backend or GUI agents. No machine acceptance claim based solely on fixture tests.

## Self-review: spec coverage and remaining execution gates

| Approved requirement | Tasks / evidence |
|---|---|
| §§1–5 freeze, parallel binaries/Kiki, all roots, commands/login/rollback | 1, machine appendix, 11, 14; completed tag explicitly excluded |
| §6.1 exact versions, Node floor, new security gate | 2, 13 |
| §6.2 native files, eight modes/prompts, permission order/model ownership | 3, 4, 8, 11 |
| §6.3 package server/TUI, routing, watchdog, cleanup, no dedup shim | 2, 6, 7, 8, 10, 11 |
| §6.4 roots, OC1 guard, all tiers, JSONC/atomic/prototype checks, doctor/status/reset/routing | 3, 8, 11 |
| §6.5 model/variant/title/small-model translation, fail-closed permissions, Kiki plugin/project migration, marker/backup/force | 4, 5, 11 |
| §§6.6–6.7 delegation equivalence and native German `/kiki`/no-LLM | 4, 9, 10, 11 |
| §7 unit, actual binary/package, migration/isolation, release and human acceptance | 3–14; full-tree green 10/11; actual V3 validation and isolated release rehearsal separately evidenced in 13; actual release separately authorized, no required integration skips accepted |
| §§8–10 phases and all approved decisions | dependency schedule; no resolved questions reopened |
| §11 builder details: events, permission matrix, skills, release allowlist, refusal UX | 2, 4, 6, 8, 13 |
| §12 registry ownership; historian required | orchestrator only; Task 12/14 docs |

Self-review performed, including architect-review amendments: all chapters mapped; shared native types vs string UI IDs made explicit; signatures consistent across task consumers; five Review Focus conditions assigned concrete tests; no implementation bodies substituted for tasks. Task 7 no longer promises a full build before Task 10; Tasks 10/11 close all interim exceptions. Task 13 uses existing `--bump major`/`--since` semantics and default dry-run, labels synthetic evidence separately, and leaves actual release approval/procedure future-owned. Four nonblocking refinements are assigned: background dispatch (11), new-config V2 schema URL (2/3), existing release flags (13), explicit tool success/failed/progress events (6). Scope remains one migration with independently reviewable units, not a redesign.

**No additional product-design decision needed for the requested rehearsal-only amendment.** Actual release procedure/authorization remains deliberately unselected and outside this migration's release-preparation acceptance; do not mark the release itself complete. Execution gates, not assumed facts: architect re-review; authorization and proof of V1 detachment; availability of published SDK and exact test binary; Task 2 signature/engine/CLI verification; feasible actual-binary scripted dispatch/watchdog trip; secret-free migration inputs; fresh audit disposition; real Git history/objects and isolated manifest for the release rehearsal; independent final actual V3 artifact validation; human machine acceptance. If any cannot be satisfied faithfully, stop and report the specific blocker and evidence. Do not lower Node support, broaden permissions, normalize via OC2's fail-open migrator, reuse the V1 security exception, or substitute mocks/live user credentials to get green.
