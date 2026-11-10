# Task 5 review — one-time fail-closed V1→V2 migration transaction

Date: 2026-11-09
Reviewer: `kiki-reviewer` (independent spec + quality/security review)
Plan: `docs/superpowers/plans/2026-11-09-kiki-opencode2-migration-plan.md` (Task 5 + Global Constraints + Review Focus 2/3)
Spec: `docs/superpowers/specs/2026-11-09-kiki-opencode2-migration-design.md` (§6.4, §6.5, §7.1)
Contract: `docs/migrations/kiki-3-oc2-api-contract.md` (§§6–8)
Inputs reviewed: `/tmp/opencode/kiki-oc2-task5-report.md`, `/tmp/opencode/kiki-oc2-task5.diff` (1668 lines, read in full), plus the actual tree (`src/cli/oc2-migration.ts` 937 lines in full, `src/cli/opencode-config.ts`, `src/cli/oc2-permissions.ts`, `src/cli/oc2-paths.ts`, `src/cli/args.ts`, `src/cli/commands/migrate.ts`, `src/cli/index.ts` help hunk, `tests/cli/oc2-migration.test.ts`, `tests/cli/global-policy.test.ts`) and all five implementer logs.

## Verdicts (updated after fix round 1 — see §9)

- **Spec compliance: PASS**
- **Quality/security: PASS — round-1 blocker ADDRESSED** (real rollback coverage delivered, test-only; no regressions). The round-1 finding is preserved as §3; the scoped re-review is §9. Deferred observations in the round-1 notes remain non-gating and unchanged.

## 1. Verification I re-ran (not just read from the report)

| Check | Result | Report claim |
|---|---|---|
| `npx --no-install vitest run tests/cli/oc2-migration.test.ts tests/cli/oc2-permissions.test.ts tests/cli/init.test.ts tests/cli/config-health.test.ts tests/cli/model-settings.test.ts tests/cli/oc2-paths.test.ts` | 6 files / **87 passed** | 87/87 ✅ |
| `npx --no-install vitest run tests/cli/global-policy.test.ts` (implementer log) | **9 passed / 5 failed**; the 5 are `installGlobalFiles`/`resetProject` V1 singular-`agent` consumers (Task 8); both migration tests pass | ✅ |
| `npx --no-install vitest run tests/cli` (implementer log) | 28 files: 6 failed / 22 passed; 523 tests: 24 failed / 466 passed / 33 skipped; failing set `doctor`, `install`, `release`, `status`, `update`, `global-policy`(5) — identical to the Task 4 baseline, no new failures | ✅ |
| `npm run lint` | exit 0, clean | ✅ |
| `npx --no-install tsc --noEmit` | exit 2, **exactly the 15 known `src/tui/*` diagnostics** (2 module-resolution + 13 implicit-any/unknown), 0 non-TUI | ✅ |
| `npm audit` (see §7) | 0 high / 0 critical, 32 moderate | not reported by implementer — gap noted |
| `git log`/`git status --short` | HEAD still `e2bf396`; all Task 5 work uncommitted; modified/untracked set matches the report (plus pre-existing Task 2–4 files) | ✅ no commit/build/install |

RED log (`kiki-oc2-task5-red.log`) shows the module-not-found failure; note its timestamp postdates the green runs — see non-blocking note 6.

## 2. Spec compliance mapping (plan Task 5 bullets, §6.5, contract §6)

- **Interfaces exactly as pinned** (plan line 171): `MigrationOptions`/`MigrationReport`/`migrateOC1`; CLI `kiki migrate [--from] [--project] [--force]`, no `--project` = global; default source is `oc1GlobalDirectory()` (XDG_CONFIG_HOME or `~/.config` + `/opencode`, `OPENCODE_CONFIG_DIR` deliberately ignored) — "not the isolated env" satisfied; `migrateProject(project, global?)` delegates to the transaction and throws names-only details on nonzero exit. Strict parser rejects unknown flags, duplicates (`--force`/`--from`/`--project`), and value-less/`-`-prefixed values (tested).
- **Matrix (bullet 173)**: every Task 4 builder map through the shared translator (test 2); explicit `ask`; unknown action/value; malformed + duplicate native/legacy source and destination definitions; prototype keys (per-agent rejection via `translatePermissions`/`mergePermissionMaps` guards); provider/model with slash (`google-vertex-anthropic/org/claude` → `google-vertex`, `org/claude`); variant (string and object forms, separate key, `#` rejected); legacy renames `azure-cognitive-services→azure`, `google-vertex-anthropic→google-vertex` (migration-only, per shared-types rule); `model`→`agents.<id>.model`, `small_model`→`agents.title.model` (no top-level `title`, per contract §6); destination model/rule conflict; rerun/`--force`; global and project source/destination alias incl. symlink (canonical-path overlap refuses before any write). Source bytes+mtime unchanged; backups 0600 files / 0700 dirs with `manifest.json` and `.gitignore`; non-Kiki entries never migrated (asserted `agents.scientist` undefined); scientist reported by name only (`private prompt`, URL token, model strings all asserted absent from the report). **Exception: the "failed write" matrix item — see the blocker.**
- **Bullet 174**: rejected agents write neither model, permissions, nor files; their existing destination stays byte-identical (test 3 asserts the untouched `prompt`/model entry); exit nonzero; successful agents commit only after the complete preflight loop (all patches computed before backup/writes); no project cleanup and no marker on partial failure; a second attempt recognizes prior byte-identical writes without broadening (test 15 asserts the second run writes nothing new and re-reports the same rejection).
- **Bullet 176**: extraction is allowlisted (model/variant/permission(s)/agent names, top-level model/small_model/plugin only) with **no recursive source scan** (only `opencode.json`/`opencode.jsonc` at the source root); `provider`/`providers`/`auth`/`env` presence refuses the whole source before any extraction with a message that names no value, path, or key; invalid model/variant is a per-agent rejection, not a dropped assignment; destination-native equivalents are preserved byte-identically (`patchValue` JSON-equality short-circuit, test 6); conflicting user-owned values reject the agent with names-only reasons (global mode) — neither choice overwritten (test 5 asserts bytes unchanged and no value in the report).
- **Bullet 177**: writes are fully planned, then backed up, then atomically applied (`writeAtomic` temp+rename, mode-preserving), marker last; `restore()` reverses applied changes on any write/removal/marker error. Kiki plugin specs convert to the release package registration `"kiki"` (dev-checkout directory form is Task 8's, correctly not invented here); all other plugins/agents are reported by sanitized name only (`pluginName` strips URL userinfo/query; tested). Top-level source `permission` is merged per tool into each migrated Kiki agent (agent map overrides matching tools, top-level-first ordering so agent patterns win — V1 semantics), a native-permissions + top-level combination is rejected, and nothing ever writes destination top-level `permission(s)` (test 1 asserts `data.permission` undefined).
- **Bullet 178**: project mode applies destination override precedence field by field (documented ruling; a differing local source value is overridden, not reported as conflict); inherited-grant masking uses Task 4's `projectPermissionRules` with the same reference semantics the Task 4 review pinned (inherited deny/ask never relaxed; omitted grants narrowed to the local fallback); removal targets only Kiki-owned files (`.opencode/{agent,agents}/kiki-*.md`, `plugins/kiki.{ts,js}`, `routing.json`, legacy `agent`/`plugin` config entries) and only when `exitCode === 0`; unrelated.md, scientist.md, `TASK_REGISTRY.json`, and ancestor config are preserved (asserted); the OC1 source is never written. Marker `.agentic/kiki/migration.json` (project root, or destination config dir in global mode) records source/timestamp/version; existing marker refuses without `--force`; `--force` creates a fresh backup (tested) and leaves source bytes unchanged.
- **Contract §6/§8 pins**: native destinations are exactly `agents.<id>.model`/`agents.<id>.permissions`/top-level `model`/`agents.title.model`/`plugins`; ordered rule arrays; renames only during migration; new-file seed uses the exact pinned `$schema` URL `https://opencode.ai/config.json` and an existing user `$schema` is never replaced (path-targeted `patchValue`); no model defaults seeded anywhere.
- **Model-whole merge semantics** (Task 3 review nonblocking item 1): both `mergeSettings` and the migration's `mergeConfigSettings` replace a model object as one value across tiers; a higher tier cannot resurrect a lower tier's stale variant (tested for `mergeSettings` and enforced structurally in the migration tier merge).
- **Review Focus 2** (ordered effective deny/ask/allow through renaming/merging) and **3** (invalid agent alongside valid ones / conflicting destination: no rejected-agent writes, no destructive cleanup, no misleading marker) are concretely tested (tests 1–5, 15, 16 and the global-policy migration cases, all green).

## 3. BLOCKER (quality) — the rollback path is never exercised; the test that claims it is miswired

`tests/cli/oc2-migration.test.ts:326` ("restores already-written destination files when a later write fails") creates the marker path as a **directory** and comments "The marker path is a directory, so the config write succeeds and the marker rename fails." That is not what happens:

1. `globalMigration` appends the existing marker path to the backup list (`src/cli/oc2-migration.ts:629-631`: `if (existsSync(markerFile)) filesToBackup.push(markerFile)`).
2. `backup()` calls `readFileSync` on every entry (`oc2-migration.ts:372-374`). `readFileSync` on a directory throws `EISDIR` on Linux **before any `apply()` runs** (`oc2-migration.ts:656-663`).
3. The transaction therefore never reaches the write phase; `restore()` (`oc2-migration.ts:386-395`) is never executed by **any** test in the suite (the file contains zero `vi.spyOn`/`vi.mock`). The test degenerates into a duplicate of the previous backup-failure test (line 314) and passes only because nothing was ever written.

Consequences:

- Plan bullet 173 requires matrix coverage of "failed backup/write"; the failed-**write** half is not actually covered. Plan bullet 177's "restoration on I/O failure" is implemented but completely untested — `restore()` is dead code under the suite.
- The report's evidence claim (matrix item 9: "marker-write failure restores the config") is **unsupported**; the GREEN claim for that behavior is false as evidenced.
- This is the highest-risk behavior of the whole task (rollback of the destructive migration transaction), and this repo already sets the bar elsewhere: `tests/cli/release-apply.test.ts` (≈10 tests) and the `release-*-safety-spy` files inject fs failures and assert restoration for the release transaction. The migration transaction deserves the same.

Required fix (implementer's choice of mechanism, e.g. `vi.spyOn(fs, 'renameSync')` failing for the marker temp file after backup, or any other post-backup failure): the config apply must succeed, a later step must fail, and the test must assert the already-written destination file is restored byte-identically (and, for project mode, that removed files would be restored / no removal happened). Keep the current end-state assertions. Also correct the test comment and the report's matrix item 9 wording.

Not a blocker: the restore implementation itself reads correct on inspection (reversed order, content+mode restore, deletion of files the transaction created, mode-preserving `writeAtomic`). The blocker is the false coverage/evidence claim and the untested rollback path, which is exactly what this review was asked to check ("tests cover actual failure paths, not snapshots alone").

## 4. Security / secret boundary

- **No secret reads/copies/logs.** The only files read are `opencode.json(c)` of the explicit source dir, destination config tiers, project Kiki md/routing files — all synthetic tmpdir fixtures in tests. Nothing reads `auth.json`, `.env`, or provider values. No `console.log` of any config value; rejected reasons, manual lists, and CLI output are names-only (tests assert `sometimes`, the fake API key, `provider/private-model`, and the URL token never appear in reports, errors, or output).
- **Default real OC1 config is not opened "just to detect credentials", and tests never touch it.** The default source (`oc1GlobalDirectory()`) is read only as the spec-mandated extraction source (§6.5 "Reads the OC1 global config … explicitly *not* the OC2-isolated dir"), guarded by `assertSecretFree`, which refuses by top-level key presence before any extraction and without echoing. Destination/alias/marker guards (`guardGlobal`, `projectMigration`, `assertNotOC1Config`) are metadata-only (`oc2-paths.ts`, config files never opened there). The two `migrate([])` test cases stop at the source/destination overlap refusal before any source read (verified: both use tmp or metadata-only paths; the global-policy case runs under a stubbed XDG root).
- Backups are 0600 files in 0700 dirs (asserted), atomic writes preserve mode and use 0600 for new files, and a 0600 `.gitignore` covers the backup tree.
- Prototype-key safety: `FORBIDDEN_KEYS` checks in every merge/map path; JSON-own `__proto__` fixtures are rejected per agent without pollution (tested); `plainObject` rejects non-Object prototypes.
- Source immutability verified by bytes + mtime assertions in both modes; the OC1 global dir is never written.

## 5. Destination conflicts, precedence, and rulings

- Global mode rejects conflicting user-owned agent values (model or permissions) with names-only reasons and writes nothing for that agent; equivalent values are preserved byte-identically; a legacy-only destination entry that would need extension is rejected rather than lossy-converted.
- Project mode "destination override precedence" (documented ruling, matches bullet 178): destination-native values win field by field; legacy destination model/permissions are promoted into native `agents` entries and the legacy entries removed only on full success; legacy entries with unsupported extra fields are rejected (documented ruling; safe, lossless direction). Cost as documented: a differing project source value is overridden silently.
- `--force` rerun creates a new backup and rewrites the marker; source unchanged (tested).

## 6. Interim state honesty

- Task 8's `installGlobalFiles`/`resetProject` V1 consumers remain red exactly as before (5 in `global-policy`; plus `doctor`, `install`, `update`, `status`, `release` files) — same set as the Task 4 baseline; no Task 5 test was weakened to hide them, and Task 5's own migration assertions in `global-policy` are green.
- Full-tree typecheck remains exactly the 15 `src/tui/*` diagnostics (re-verified); 0 non-TUI diagnostics introduced. No build/dist produced.

## 7. Security scan (checklist item)

The report does not evidence a security-scan run — same reporting gap as Task 4. I ran `npm audit`: **0 high, 0 critical, 32 moderate** (vitest `@vitest/mocker` advisory, fix outside range; transitive `glob`/`minimatch`/`@npmcli/*` chains) — identical state to the Task 4-reviewed graph; Task 5 adds **no dependencies**. No high/critical finding exists to fix, so the gap is non-blocking, but future task reports must include the audit line. Fresh-graph audit disposition stays with Task 2's gate/release phase.

## 8. Parallelization / dependency check

Task 5 metadata: `risk: high`, `parallel: false`, `depends_on: ['Task 3', 'Task 4']` — satisfied (both reviews PASS; Task 4 owns the translator, masking helper, and fixture Task 5 consumes). No circular task chain; downstream joins (4+5→7 via Task 7's own deps, 4+5+7→8, 5+7+8+10→11) are correctly ordered. `parallel: false` means no same-file race with Task 4 on `tests/cli/global-policy.test.ts`. All referenced modules/exports exist (`oc2-permissions.ts`, `oc2-paths.ts`, `oc1-permission-templates.json`, `KIKI_VERSION`).

## Non-blocking notes / deferred observations

1. **Top-level source `permission` + a Kiki agent with no source definition**: such an agent is skipped entirely, so the user's top-level overrides are not represented for it in OC2 (it falls back to the Task 8 baseline file). Reachability is low — real OC1 installs define all eight `agent.kiki-*` entries — and every agent the transaction *does* touch accounts for the top-level map or is rejected. Suggest for Task 11/architect: reject or report when a top-level source permission exists alongside definition-less Kiki agents.
2. **Silently dropped top-level defaults in global mode**: if the destination already has a top-level `model` (or `agents.title.model`) differing from the source default/small_model, the source value is not migrated and not mentioned in `manual`/`rejected`. Safe direction (never overwrites, never seeds), but invisible to the user; consider reporting the skip.
3. **Circular import** `oc2-migration.ts` ↔ `opencode-config.ts` (`AGENT_NAMES`/types vs `migrateOC1`/`oc1GlobalDirectory`). Safe today because every cross-reference resolves at call time (lint and tests green), but fragile; consider moving shared types/`AGENT_NAMES` to a leaf module in a later task.
4. **Comment/code mismatch**: `mergeConfigSettings`'s doc comment says agent entries are "replaced as whole values", but the code field-merges agent entries (only `model` is whole-replaced — which is the actual intent). Align the comment.
5. **Backup accumulation**: global mode creates a fresh backup directory on every invocation even when nothing will change (no-op first run, `--force` reruns). Consistent with the plan's "back up then atomically apply" and the force expectation; a `changed`-check could reduce noise later.
6. **RED evidence ordering**: the RED log timestamp (17:57:09) postdates the GREEN runs (17:56:36), i.e. the module-absent RED state was reconstructed after the fact. Trivially valid for a new-module test, but record RED before GREEN going forward.
7. **File-list granularity**: Task 5 updated two migration assertions in `tests/cli/global-policy.test.ts`, which is Task 4's Files-line file. The updates are semantics-driven (native shapes, marker refusal, no-args-global now refuses on root overlap instead of a usage error — a *stronger* safety assertion), minimal, and honestly reported. Noted for the orchestrator as a plan file-list gap, no action required.
8. Task 11 remains owner of real-binary/packaged migration and wildcard evaluation; nothing here certifies those, and no live OC1/OC2 config or credential-bearing file was read by implementer or reviewer.

## 9. Fix round 1 re-review (scoped: §3 blocker + direct regressions only)

Date: 2026-11-09. Inputs: `/tmp/opencode/kiki-oc2-task5-fix1.diff` (137 lines, read in full), the appended report section (`/tmp/opencode/kiki-oc2-task5-report.md` §"Task 5 fix round 1"), the four fix logs, and the current tree.

### Blocker status: ADDRESSED

- **The fix is test-only and production is byte-identical** to the round-1-reviewed state: the diff touches only `tests/cli/oc2-migration.test.ts` (4 hunks), and `src/cli/oc2-migration.ts` still has every distinctive line at its round-1 position (`writeAtomic` temp cleanup :360, backup copy loop :373, `restore` reverse iteration :387, `filesToBackup.push(markerFile)` :630, global marker apply :659, project marker apply :921). No registry/product fixes, no builds, no live-config or secret operations.
- **The miswired fixture is replaced by a genuine post-backup, post-apply failure injection**: a `vi.hoisted` fault handle + `vi.mock('fs', …)` whose `renameSync` override throws **only** for the marker temp rename (`to === marker && from.endsWith('.tmp')`) and otherwise delegates. The hook fires *after* the config apply/removals, so the transaction's write phase genuinely runs before the failure — the exact code path round 1 showed was never reached.
- **Rollback is now proven, not assumed**:
  - Global test (`tests/cli/oc2-migration.test.ts:346`): `injected === true` asserted; `observedDuringFailure` (captured inside the hook) contains both the migrated `kiki-reviewer` entry and the preserved `theme` key — proving the config write completed before the marker failure; the destination config is then restored byte-identically (Buffer equality), no marker exists, source bytes unchanged, and the backup + `manifest.json` are retained.
  - New project test (`:533`): hook reached after config write and Kiki-file removals; rollback removes the **newly created** project config (asserted absent), restores the deleted agent md, plugin, and routing files byte-identically, leaves no marker, keeps the source unchanged, and the backup manifest contains all three removed files.
  - `restore()` is therefore no longer dead code under the suite; the round-1 "failed write" half of plan bullet 173's matrix is genuinely covered, and the report's corrected matrix item 9 now matches reality.
- **No test contamination**: the mock spreads `...actual` and overrides only `renameSync`; the hook is optional-chained (full delegation when unset), installed only inside the two rollback tests, matched only against the marker temp rename, and cleared in `afterEach` before `rmSync`. `vi.mock('fs')` matches the production import specifier (`'fs'` in `oc2-migration.ts`/`opencode-config.ts`); the test file's own `'node:fs'` operations delegate to the real module either way. The mock is file-scoped, so no other suite is affected.

### Verification I re-ran

| Check | Result | Report claim |
|---|---|---|
| `npx --no-install vitest run tests/cli/oc2-migration.test.ts tests/cli/oc2-permissions.test.ts tests/cli/init.test.ts tests/cli/config-health.test.ts tests/cli/model-settings.test.ts tests/cli/oc2-paths.test.ts` | 6 files / **88 passed** (87 round-1 tests unchanged in behavior + 1 new project rollback test; the global rollback test rewritten in place, now on the normal `force: false` path) | 88/88 ✅ |
| `npx --no-install vitest run tests/cli/global-policy.test.ts` | **9 passed / 5 failed** — the identical Task 8 `installGlobalFiles`/`resetProject` failure set; both migration tests green; no cross-file mock leakage | ✅ unchanged |
| `npm run lint` | exit 0, clean | ✅ |

### Honesty check

The report's fix section accepts the finding, corrects the old test comment/matrix wording, states production was not changed, and explicitly makes **no fake red claim** — correct, since a red phase would have required temporarily breaking `restore()`; the `fix1-red-green-attempt.log` records only the migration file's green run (21 tests) and no red is claimed. This also moots round-1 note 6 for this round.

### Verdicts (fix round 1)

- **Spec compliance: PASS** — production unchanged; round-1 spec mapping stands; the previously half-met "failed write" matrix item is now genuinely covered, completing plan bullet 173.
- **Quality/security: PASS** — blocker ADDRESSED; no direct regressions; no new findings within the scoped diff. Round-1 deferred observations (non-gating) are unchanged and out of scope here. Task 5 is complete from this reviewer's perspective; no commits/builds/install/global/secret operations were performed by implementer or reviewer.
