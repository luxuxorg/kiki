# Task 2 review — Kiki OpenCode 2 migration: published V2 contracts and package boundary

**Reviewer:** kiki-reviewer (independent, task-scoped)
**Date:** 2026-11-09
**Inputs reviewed:**

- Plan: `docs/superpowers/plans/2026-11-09-kiki-opencode2-migration-plan.md` — Task 2 + Global Constraints
- Spec: `docs/superpowers/specs/2026-11-09-kiki-opencode2-migration-design.md` (§3 verified facts, §6.1, §6.3, §7 testing)
- Implementer report: `/tmp/opencode/kiki-oc2-task2-report.md`
- Owned diff: `/tmp/opencode/kiki-oc2-task2.diff` (full read, including the complete lockfile churn)
- Working tree at `e2bf396` (branch `feat/global-kiki-updates`, tag `v2.4.0` present)
- Logs: RED/GREEN/release-gates/tsc-interim/lint/full-suite under `/tmp/opencode/kiki-oc2-task2-*.log`
- Synthetic npm evidence: `/tmp/opencode/kiki-npm/`

**Review method.** Read the full owned diff and the actual files; re-derived the lockfile
comparison against `git show HEAD:package-lock.json`; independently re-verified the pinned
public API against the installed `@opencode/plugin@2.2.6` type declarations, the served
`https://opencode.ai/config.json` schema, and tagged `anomalyco/opencode` `v2.2.6` sources;
re-ran the focused gates fresh (contract test, release-gates test, `tsc --noEmit`, lint).
No builds, no dist emission, no global config operations, no registry edits, no commits.
Frozen-V1 integrity is accepted from the Task 1 human smoke plus the implementer's
before/after hash evidence (`91fb29b837f4153c5307dee76245f800c06f1a5bbf624de4486fb21057fd1578`,
104 files, same before and after) as instructed; not recomputed by this reviewer.

---

## Verdict

**Spec compliance: PASS**
**Quality/security: PASS**

No blockers. Six non-blocking observations recorded at the end for Tasks 3–13.

---

## 1. Plan-checkbox verification (Task 2)

| Plan requirement | Evidence | Status |
|---|---|---|
| Failing contract tests first (RED) | `/tmp/opencode/kiki-oc2-task2-red.log`: 9 tests, 8 failed with exactly the expected assertions (`'2.4.0' to be '3.0.0'`, `undefined to be '2.2.6'`, `'1.18.35' to be undefined`, missing `./server` export, `[jsonc-parser,yaml]` vs 3-entry dep set, `Cannot find package '@opencode/plugin'`). The 1 pre-existing pass is the Node/dev-range test, which must not change — correct. | PASS |
| Version 3.0.0 in package.json + `KIKI_VERSION` | On disk: `package.json` `3.0.0`; `src/cli/config.ts:76` `KIKI_VERSION = '3.0.0'`. Asserted by test. | PASS |
| `@opencode/plugin` exact `2.2.6` in **dependencies**; no old SDK | On disk: `"@opencode/plugin": "2.2.6"` under `dependencies` (exact pin, no range); `@opencode-ai/plugin` absent from `package.json` devDeps, lock root deps/devDeps, and the entire lock graph. Asserted by tests. | PASS |
| `./server` + `./tui` exports with declaration paths | `./server` → `types: ./dist/server/index.d.ts`, `import: ./dist/server/index.js`; `./tui` unchanged; `files: ["dist/"]` intact; asserted verbatim by test. | PASS |
| Replace SDK, refresh lockfile, **no unrelated upgrades** | See §2 below — independently re-derived. | PASS |
| Record registry integrity, tagged provenance, engines, actual exports | `docs/migrations/kiki-3-oc2-api-contract.md` §1–§2: registry integrity `sha512-PbQD4aN8YJ8w3gM5L9h2msXppxEAUVj8Ejbaj6MMNb+99jPm7/XM+g2ugZomSNs1XXuab2IlrIKDgbiI49VfLw==` matches the installed/lock entry byte-for-byte; recomputed SHA-512/SHA-1 claims; repository `anomalyco/opencode` `packages/plugin` tag `v2.2.6`; engines: none declared; full published exports map recorded. | PASS |
| Pin exact interrupt args, child discovery/status/message access, subscription cancellation, fixture provider config, real commands replacing V1 `debug config` (do not assume it still exists) | Contract doc §3.3, §3.2, §6, §7. Independently verified against published types and tagged source — see §3. `debug config` was *verified to still exist* (captured tagged `commands.ts`/`config.mdx` evidence in `/tmp/opencode/kiki-npm/`), with the proper Task 11 caveat on output shapes. | PASS |
| Compile-only typed examples: tool hook, event union, interrupt, subscription disposal, TUI value dialogs/keymap, host resolution, skill roots; no `any`/`@ts-ignore`; no fake V1 API | `tests/cli/oc2-sdk-contract.test.ts` contains all seven categories. Full-file read: zero `any`, zero `@ts-ignore`/`@ts-expect-error`, no invented SDK members — every example compiles under `--strict` against the real installed SDK (the 10th test invokes the local `tsc`). Examples are exercised by the fresh green run. | PASS |
| Record `title`/`small_model` destination keys and exact V2 `$schema` URL (tagged, not inferred) | Contract doc §6: `small_model` → `agents.title.model`, no top-level `title`. **Independently verified verbatim** in tagged `v2.2.6` `packages/core/src/config/normalize.ts` (`legacyAgents.title = { model: migratedSmallModel, ...legacyAgents.title }`) and the served schema (`$id: https://opencode.ai/config.json`, live-fetched, full V2 key set). | PASS |
| Focused contract green + `tsc --noEmit` recorded as expected interim failure limited to unported `src/tui/*`; no tsconfig weakening, no stubs, no old SDK kept, no dist emission | Fresh reruns: contract 10/10; release-gates 74/74 (implementer log: 84 combined); `tsc --noEmit` = exactly 15 diagnostics, **all** in `src/tui/index.ts` + `src/tui/model-menu.ts` (the sanctioned interim gap owned by Task 10); `git diff` on `tsconfig.json`/`eslint.config.mjs` empty; old SDK gone; pre-existing `dist/` still contains `KIKI_VERSION='2.4.0'` (no emission; no `dist/server/`). | PASS |
| Node floor not silently changed; report instead of altering approved behavior | `engines.node` stays `>=18.0.0` (asserted by test); documented dev/lint range `^20.19.0 || ^22.13.0 || >=24` untouched (README/CHANGELOG unchanged); SDK itself declares no `engines`, so no CLI floor change is forced. Observation C records transitive-graph engines for Tasks 11/13. | PASS |
| `release-gates.test.ts` minimal update | Fixture-only: `dist/server/index.{js,d.ts}` added to the self-contained fixture list (NEXT='2.3.0', own fake tools) and `./server` added to the invariant candidate's exports — matching the new package boundary. Production `src/cli/release-gates.ts` **not** modified (empty `git diff`), which is correct: `distributableTargets()` already requires export-declared targets, so the fixture addition strengthens coverage without weakening anything, and the production allowlist edit stays Task 13's per the architect amendment. Full-suite log honestly shows `tests/cli/release.test.ts` suite-setup failure (same `src/tui/*` compile errors) — reported, not hidden, not a green-whole-suite claim. | PASS |
| Interfaces: exact `ServerContext` alias derivation + TUI `Plugin.Context` + documented client calls/CLI for Task 11 | Test derives `ServerContextFromDefine = Parameters<typeof Plugin.define>[0]['setup'] extends (ctx: infer C) => unknown ? C : never` and proves `≡ Plugin.Context` bidirectionally at compile time; downstream signature pins in contract doc §8. The eventual server module is Task 7's; the derivation and proof are pinned now, as the task intends. | PASS |

**Global constraints:** version 3.0.0 ✓; OC2 exactly 2.2.6 ✓ (exact pin); `subagent_depth` 1 and `update:"disable"` untouched (no machine-config writes in this task) ✓; no new features beyond equivalence ✓; no runtime agent registration/shims ✓; no secret-bearing file reads (see §4) ✓; V1 protection verified before/after per implementer evidence + user smoke ✓; Node floor and dev ranges unchanged ✓; fresh audit deferred to Task 13 per plan (not silently skipped — Observation B) ✓; no commits/tags/pushes/registry edits ✓.

## 2. Lockfile: no unrelated upgrades (independently re-derived)

Compared `git show HEAD:package-lock.json` (full dump) against the working-tree lock.

- **32 removed `"version"` lines total.** 2 are the authorized root `2.4.0 → 3.0.0` change (top-level + `packages[""]`). The remaining 30 belong to removed blocks:
  - **21 net removals** — exactly the retired old-SDK graph: `@opencode-ai/plugin` 1.18.35, `@opencode-ai/sdk` 1.18.35, `effect` 4.0.0-beta.83, `fast-check`, `find-my-way-ts`, `ini`@7 (root), `kubernetes-types`, `msgpackr`, `msgpackr-extract` + 6 platform binaries, `multipasta`, `node-gyp-build-optional-packages`, `pure-rand`, `toml`, `uuid`, `zod` 4.1.8.
  - **10 same-version re-adds** — npm classification/position changes only, identical versions and integrity hashes: `@rolldown/binding-{openharmony-arm64,win32-arm64-msvc,win32-x64-msvc}` 1.2.16, `@rolldown/pluginutils` 1.0.1, `@standard-schema/spec` 1.1.0 (dev → prod-reachable), `magic-string` 0.30.21, `minimatch` 3.1.5, `ms` 2.1.3 (dev → prod-reachable), `nanoid` 3.3.20 (dev → devOptional), `natural-compare` 1.4.0.
- **No version of any retained package changed.** Direct deps/devdeps byte-identical to HEAD (same resolved URLs and integrity): `jsonc-parser` 3.3.1, `yaml` 2.9.1, `@types/node` 20.19.43, `eslint` 9.39.4, `typescript` 5.9.3, `typescript-eslint` 8.62.0, `vitest` 4.1.0 (and the inspected eslint/vitest subgraph unchanged).
- Added entries are the new SDK runtime graph only (`@opencode/{ai,client,plugin,protocol,schema,util}@2.2.6`, `effect` 4.1.0, `@ai-sdk/provider` 3.0.8, `@aws-sdk`/`@npmcli`/`@opentelemetry`/`@sigstore`/`@tufjs` transitive sets).

The implementer's "275 added / 21 removed / only the root version changed" claim reproduces exactly under independent counting.

## 3. Pinned public API — independent verification

All spot-checked against **installed published** `@opencode/plugin@2.2.6` declarations
(`node_modules/@opencode/plugin/dist/**`), the published `@opencode/schema@2.2.6` `Config.Info`,
and tagged `v2.2.6` upstream sources; every contract-doc claim held:

- `Plugin.define(plugin: Plugin): Plugin`, `Plugin.Plugin = { id, setup }`, `Cleanup = () => Promise<void> | void`; `Plugin.Context` domain list matches doc §3 exactly (incl. `credential: Pick<...,"activate">`, `plugin: Pick<...,"list">`, deprecated `generate`).
- `ctx.tool.hook("execute.before", …)` event = `{ tool, sessionID, agent, messageID, id, input }`; returns `Promise<Registration>` with `dispose(): Promise<void>` — matches the typed example and doc.
- `ctx.event.subscribe({ types?, signal?, onActivity? }) → AsyncIterable<SelectedEvent<…>>`; payload keys in `.data`; V2 event union contains `session.created/deleted/idle/status`, `session.execution.*`, `session.step.*`, `session.text.*`, `session.reasoning.*`, `session.tool.*`, `session.usage.updated`, `session.skill.activated`, `session.shell.*`; OC1 names (`message.part.updated`, `message.updated`, `session.updated`, `session.error`) absent.
- **Interrupt correction verified:** `SessionInterruptInput = { readonly sessionID: string; readonly resume?: boolean }` → `Promise<SessionInterruptResponse>` — the spec's illustrative `interrupt({ path: { id } })` is indeed not the 2.2.6 signature; the implementer corrected it from published types exactly as the plan's authoritative-corrections note required.
- `SessionDomain = Pick<SessionApi, "list"|"create"|…|"interrupt"|"update"|"move"|"context"> & Pick<ExperimentalSessionApi, "wait"|"instructions"> & { hook }` — **no `messages`, no `abort`**, exactly as pinned. `SessionInfo.parentID?: Session.ID`; `SessionsResponse = { data, cursor }`.
- TUI: `dialog.select<Value>(…) → Promise<Value | undefined>`, `confirm → boolean|undefined`, `prompt → string|undefined`, `alert → void`; reactive `keymap.layer(factory: () => KeymapLayer): void` (removed on deactivation — so Task 9's "host owns disposal" is right); commands accept `palette?: true` and `slash: { name }`; `ctx.data.on` returns an unsubscribe.
- `Host.resolve({ directory }) → { server?, tui?, rpc?, gui? }`; `packageID`, `load` as documented.
- `Skill.Info = { id, name, description?, autoinvoke?, path, content }`; `ctx.skill.list()` used through its real return shape.
- Native config keys verified in published `@opencode/schema/dist/config.d.ts` and the served `https://opencode.ai/config.json`: ordered `permissions` rules `{action, resource, effect: allow|deny|ask}`, `agents.<id>` record with model object `{providerID, model, variant?}`, `plugins`, `providers`, `skills` paths, `update: "disable"`. Tagged `v1/config/migrate.ts` confirms action renames (`write|patch|apply_patch→edit`, `task→subagent`, `bash→shell`), first-`/` model split, provider-ID renames, and legacy provider `npm/options/api → package/settings`. Tagged `config/normalize.ts` confirms **`small_model` → `agents.title.model`** verbatim and OC2's **fail-open** normalization (skip + diagnostics), grounding Kiki's stricter fail-closed migration requirement.

**Conclusion:** the contract doc contains no invented APIs; every signature is real, published, and pinned. The gate for downstream signatures (Tasks 3–11) is satisfied.

## 4. Credentials and npm hygiene

- Diff touches only `package.json`, `package-lock.json`, `src/cli/config.ts` (line 76), `tests/cli/release-gates.test.ts`, plus the two new files. No credential file, no `.env`, no auth artifact anywhere in the diff.
- `npm install --ignore-scripts --no-audit --no-fund` ran under a fully synthetic environment (`HOME`, `NPM_CONFIG_USERCONFIG`, `NPM_CONFIG_GLOBALCONFIG`, cache/logs/prefix all under `/tmp/opencode/kiki-npm`); `user.npmrc`/`global.npmrc` there are empty (0 bytes). Presence-only checks confirmed: **no project `.npmrc`, no `~/.npmrc` exists** — no user npm credentials could have been consumed. `--no-audit` also avoided an unsanctioned implicit audit.
- Frozen-V1 inspection was limited to non-secret, explicitly granted files (loader `tui.js`, wrapper, frozen package metadata); no global OpenCode config or credential file was read. Consistent with the global constraint.

## 5. Pre-existing dirty state preserved

- `git status` matches the before-snapshot plus exactly the six owned paths. `.agentic/kiki/TASK_REGISTRY.json` and `opencode.jsonc` diffs are byte-identical to `/tmp/kiki-tracked-before.patch`. `routing_log.jsonl` differs only by one **appended** operational line (`12:35:47 kiki-reviewer` — the review dispatch itself; the V1 plugin's normal logging), with all pre-existing lines intact; nothing was cleaned (the plan forbids cleaning it). Untracked baseline (6 paths) intact; no `git clean`; no commits/tags/pushes.
- `src/cli/release-gates.ts`, `tsconfig.json`, `eslint.config.mjs` unmodified. Residual `@opencode-ai/plugin` string inside `OPENCODE_PACKAGE_JSON_TEMPLATE` (config.ts:709) is intentional and correctly deferred to Tasks 3/4/7 per the plan's line-scoped file map; it is inert (tsc/lint clean).

## 6. Lint / typecheck / security-scan checklist

- **Lint:** fresh `npm run lint` → exit 0, no output (matches implementer log). No lint issues in changed files.
- **Security scan:** `.agentic/kiki/config.json` is absent, so no project-specific `commands.security` exists. The plan-owned security scan for the V2 graph is the fresh `npm audit` with synthetic npm config, explicitly a **Task 13** gate ("INCOMPLETE audit blocks and cannot be excepted"); Task 2 neither ran nor needed it, the report does not claim it, and alignment guardrails (no hardcoded secrets, no new DB/HTTP surface) are respected by the diff. Recorded as deferred-to-owner, not a failure; flagged below as Observation B so Task 13 cannot be missed.

## 7. Rulings assessment (implementer decisions on the plan's behalf)

1. **release-gates fixture ruling** — sound. No repository-version expectation exists (fixtures use `NEXT = '2.3.0'`); the fixture additions exercise the new export boundary against unchanged production gate code whose `distributableTargets()` derives required outputs from `exports`. No gate weakened; production edit stays Task 13's.
2. **release.test.ts left red as interim consequence** — correct per the architect amendment; fixing it means either Task 10's TUI port or weakening a test, both out of scope. Honest, named, not hidden.
3. **Standalone strict `tsc` for typed examples with `moduleResolution: Bundler`** — reasonable; `tsconfig.json` untouched; matches Vitest/Vite resolution; the compile-only gate uses `--strict` and real SDK types.
4. **TUI entrypoint resolved, not executed** — sound; optional Solid peers are host-supplied, executing it in plain Node would test the host. Actual TUI execution belongs to Tasks 10/11.
5. **Clean-consumer graph resolution** tested via dependency classification + published-entrypoint resolution + installed pin (Observation A): the true packed-consumer test is Task 11's and impossible pre-build (plan forbids emitting dist from the failing tree).

## 8. Parallelization / dependency logic

Task 2 (`parallel: false`, `depends_on: [Task 1]`) correctly waited on Task 1 (`V1_PROTECTED`; frozen-loader detachment verified before any source/dependency change — hash same before/after this task). Its owned files do not overlap Task 3/4/6/9 parallel scopes (those own `src/cli/oc2-*`, `src/cli/config.ts` other lines, `src/server/watchdog*`, `src/tui/model-menu.ts`); the hard safety chain Task 1 → Task 2 → Task 3 is respected. No circular dependencies.

## 9. Non-blocking observations (for downstream tasks, not Task 2 defects)

1. **Clean-consumer resolution** (A): `tests/cli/oc2-sdk-contract.test.ts` proves classification and entrypoint resolvability inside the checkout; Task 11 must still perform the packed `npm pack` + production-only disposable-consumer install as planned. Already owned by Task 11 — keep it there.
2. **Fresh audit** (B): no `npm audit` has yet been run on the new V2 graph. Task 13 owns it with synthetic npm config; the 2026-11-04 V1 exception is void. Do not let this fall through when Task 13 evidence is assembled.
3. **Transitive engines vs. Node 18 CLI floor** (C): the SDK itself declares no engines and Kiki's CLI (`engines.node >=18.0.0`) does not import the SDK — only `./server`/`./tui` entrypoints do, which execute inside the OC2 host runtime. However, several SDK-graph transitives declare Node `>=20`/`>=22.19` engines (e.g. `@npmcli/*`, `@aws-sdk/*`, `@effect/platform-node`). npm only warns by default, so the floor is not "silently changed", but Tasks 11/13 should record this when documenting consumer requirements and audit reachability.
4. **Routing log append** (D): one operational line (`kiki-reviewer`, 12:35:47) was appended after the implementer's before-patch; this is normal V1 plugin behavior for dispatches (including this review), not a content edit. No action.
5. **`ServerContext` placement** (E): the alias derivation lives in the contract test until `src/server/index.ts` exists in Task 7; Task 7 must reuse it verbatim rather than re-deriving.
6. **`debug config` output shape** (F): its continued existence in 2.2.6 is verified, but the contract doc correctly requires Task 11 to verify output shapes against the actual pinned binary before relying on them.

## 10. Verification performed by this reviewer (fresh)

- `npx --no-install vitest run tests/cli/oc2-sdk-contract.test.ts` → **10/10 passed** (13:52)
- `npx --no-install vitest run tests/cli/release-gates.test.ts` → **74/74 passed**
- `npx --no-install tsc --noEmit` → **exit 2, 15 diagnostics, all under `src/tui/`** (permitted interim failure; nothing else)
- `npm run lint` → **exit 0**, no output
- Lockfile: full old/new comparison from `git show HEAD:package-lock.json`; net-21 removals and zero version changes confirmed
- API pins: cross-checked against installed SDK d.ts, served `https://opencode.ai/config.json`, tagged `v2.2.6` `config/normalize.ts` + `v1/config/migrate.ts`
- Not re-run (accepted as recorded evidence): full suite (`/tmp/opencode/kiki-oc2-task2-full-suite-after.log` read: 1 failed suite = `release.test.ts` beforeAll compile, 31 files/522 tests passed, 36 skipped — honestly not a green whole suite), RED log, frozen-V1 hash.

---

**Final assessment.** Task 2 is a faithful implementation of its plan slice: exact pins,
scoped edits, honest interim diagnostics, verified-not-inferred API pins, synthetic-only
credentials surface, preserved pre-existing work, and no gate weakening. The approved interim
`src/tui/*` failure is properly recorded as an interim failure, not a pass.

Spec compliance: **PASS** — every Task 2 checkbox and applicable global constraint is met.
Quality/security: **PASS** — no blockers; observations A–F assigned to their owning tasks.
