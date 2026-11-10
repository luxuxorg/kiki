# Task 4 review — equivalent agent templates, ordered permissions, delegation text

Date: 2026-11-09
Reviewer: `kiki-reviewer` (independent spec + quality/security review)
Plan: `docs/superpowers/plans/2026-11-09-kiki-opencode2-migration-plan.md` (Task 4 + Global Constraints)
Spec: `docs/superpowers/specs/2026-11-09-kiki-opencode2-migration-design.md` (§3, §6.2, §6.5, §6.6, §7.1)
Inputs reviewed: `/tmp/opencode/kiki-oc2-task4-report.md`, `/tmp/opencode/kiki-oc2-task4.diff` (1202 lines, read in full), plus the actual tree (`src/cli/config.ts`, `src/cli/oc2-permissions.ts`, `src/cli/opencode-config.ts`, `tests/cli/oc2-permissions.test.ts`, `tests/cli/init.test.ts`, `tests/cli/global-policy.test.ts`, `tests/fixtures/oc1-permission-templates.json`) and the frozen v1 checkout (`/home/lutz/lprojekte/kiki-v1/dist/cli/config.js`).

## Verdicts

- **Spec compliance: PASS**
- **Quality/security: PASS**
- Blockers: none. Non-blocking notes are listed at the end and none gate Task 5 (which depends on Task 4).

## 1. Verification I re-ran (not just read from the report)

| Check | Result | Report claim |
|---|---|---|
| `npx --no-install vitest run tests/cli/oc2-permissions.test.ts tests/cli/init.test.ts tests/cli/config-health.test.ts` | 3 files / **27 passed** | 27/27 ✅ |
| `npm run lint` | exit 0, clean | ✅ |
| `npx --no-install tsc --noEmit` | exit 2, **exactly the 15 known `src/tui/*` diagnostics** (2 module-resolution + 13 implicit-any/unknown), no new diagnostics | ✅ |
| `npx --no-install vitest run tests/cli` | **27 files: 6 failed / 21 passed; 503 tests: 28 failed / 442 passed / 33 skipped**; failing files `doctor`, `global-policy` (9), `install`, `release` (suite-level tsc), `status`, `update` | ✅ identical |
| `npm audit` (see §7) | 0 high / 0 critical, 32 moderate | not reported by implementer — gap noted |
| `git status --short` | modified set matches report exactly (Task 2/3 pre-existing files + Task 4 files; new untracked only Task 2/3/4 artifacts) | ✅ |
| Frozen checkout spot check | `kiki-v1/dist/cli/config.js:107` contains the V1 broad-read builder incl. `"**/id_rsa*": deny`, matching the fixture's `broadRead` block; fixture provenance claim is credible | ✅ |

RED-phase logs (`/tmp/opencode/kiki-oc2-task4-red.log`, `-init-red.log`) were not independently re-run (irreversible by nature); the RED state described (module-not-found, V1-schema assertion failures) is consistent with the named test conversion shown in the diff.

## 2. Translator semantics (`src/cli/oc2-permissions.ts`) — spec equivalence

Reviewed against plan Task 4 step 3 and spec §3/§6.5:

- **Ordered translation**: per-action scalar → `resource:'*'`; map → rules in `Object.entries` (YAML/JSONC insertion) order; alias-group iteration preserves first-occurrence action order. Matches "ordered scalar → `resource:'*'` and map → entry-order rule translation".
- **Renames** `write|patch|apply_patch→edit`, `task→subagent`, `bash→shell` exactly as spec §3 verifies OC2 itself does; known passthrough actions include `read`, `edit`, `webfetch`, `external_directory` and the other V1 tool keys. `doom_loop` looks unusual but is a **verified V1 OpenCode permission action** (documented in this repo's own frozen watchdog design spec, `permission.doom_loop`), so its inclusion is correct, not a guess.
- **Fail-closed**: `null`, non-plain-object (prototype-checked via `Object.getPrototypeOf`), invalid effects, `__proto__`/`constructor`/`prototype` keys, empty resources, non-string effect values, and unknown actions all return `{ok:false}`; reasons name actions only, never resource strings or config values (test asserts the reason never contains the probe value `sometimes`). Satisfies "Unknown keys, malformed values … are failures, never guessed" and the reviewer constraint that errors never include config values.
- **Alias collisions**: multiple V1 keys collapsing onto one native action are accepted only with canonicalized-identical rule sets; otherwise `Conflicting permission aliases for action: <action>`. Tests cover map-vs-map, wildcard-vs-map, and equivalent-alias dedup. This is stricter than OC2's fail-open normalizer — correct per Global Constraints ("Never drop untranslatable permission rules or default them to `allow`").
- **`undefined` → empty rules**: permission absence is intentional inheritance (plan Task 4 step 4 "Preserve permission absence as intentional inheritance").
- One nuance verified harmless: the V1 historian builder has a duplicate YAML key `"docs/**": allow` in the frozen fixture; parse-time dedup (identical effects, last-wins both allow) makes V1 and native outcomes identical, and the native array contains the pattern once.

## 3. Masking semantics (`projectPermissionRules` + minimal `initializeProjectAgents`)

The core question the orchestrator asked: **no relaxation, no unintended overrestriction**. Line-by-line comparison against V1's `projectPermissions` (still present at `opencode-config.ts:509` for Task 5's `migrateProject`):

- **Omitted inherited grants** → local action fallback (last local `*` rule for the action, else `ask`). Inherited `allow` → fallback, inherited `ask` → `ask` only if fallback is `allow` else fallback, inherited `deny` → `deny`. This is **operation-for-operation identical** to V1's `projectPermissions` masking (`inherited === 'deny' ? 'deny' : inherited === 'ask' && fallback === 'allow' ? 'ask' : fallback`), restated for ordered arrays. **No relaxation**: inherited deny/ask never become allow; an inherited allow is never broadened beyond the local default (it is narrowed to it).
- **Same-resource local allow vs inherited deny/ask** → an explicit `deny`/`ask` mask is appended after the local rules, so the inherited deny/ask survives under OC2's verified "later rules win" semantics (spec §3, config-level permissions appended, later rules win). This is a deliberate, plan-mandated divergence from V1's project-map-replaces-global behavior: the plan says masking must "narrow omitted inherited grants **without relaxing inherited deny/ask**", and the named test pins exactly this (`project_rules_do_not_restore_inherited_grants`, including the same-resource `/tmp/**` ask and `tmp/**` deny survival). Security direction is the safe one and protects user-owned global denies (§6.2 "user permission additions … preserved"). Template-level V1↔V2 equivalence is unaffected because V1 templates never produce same-resource local-vs-inherited effect conflicts (verified: default-config local ≡ baseline; custom-path globs are disjoint resources).
- **Runtime ordering correctness**: in OC2, effective rules = agent-file rules + global config additions + project config rules, later wins. `initializeProjectAgents` masks against `baseline[name].settings.permissions` **plus** global `agents.<name>.permissions` concatenated — i.e., the exact runtime inherited set. V1's either/or fallback (`global || baseline`) was less accurate; this is an improvement, not a behavior regression. Existing local user settings still spread last, so user project-local `permissions`/models survive re-init byte-for-byte (global-policy tests assert both).
- **Orchestrator**: no local permissions → no `agents.kiki-orchestrator` entry written at all → intentional inheritance preserved (asserted in `native_agent_modes`).
- **No top-level `permissions` written anywhere** (Global Constraints): only `agents.<id>.permissions` via `patchAgents`.

## 4. Native templates, prompts, workflow — spec §6.2/§6.6

- `renderPermissions` emits a native `permissions:` rule array (`- action / resource / effect`) into the eight templates' frontmatter; orchestrator `mode: primary`, seven roles `mode: subagent`, no `model` key anywhere (native frontmatter or `baselineAgents` settings — asserted in `native_agent_modes` and in both init tests). **No model seeding** (Global Constraints).
- Builder arrays preserve V1 order exactly (read `*` allow then the seven secret denies; deny-first edit grants; historian's final src/test/worktree denies at the end; reviewer's read-only shape; implementer's `/tmp/**`,`tmp/**`,`.worktree/**` grants; existing shell command patterns). Verified against the frozen fixture blocks and the diff hunk for each of the five builders.
- **Prompt equivalence**: `prompt_body_only_changes_delegation` compares all 8 roles × both configs against frozen v2.4.0 bodies after (a) filtering exactly the three approved orchestrator addition lines (agent ID + 3–5-word `description`; optional `model`/`sessionID`; nested-dispatch prohibition with `experimental.subagent_depth` 1) and (b) normalizing only `` `task` ``/`` `subagent` `` and `subagent_type`→`agent`. The additions match §6.6 word-for-word; nothing else changed (the workflow's §5/§6 text and model-routing example now use `agents.<id>.model` + the native model object, asserted in `workflow_uses_v2_delegation_and_config_keys`).
- **Generator Task 7 consumers preserved**: `generateAllTemplates` still returns `plugin`/`packageJson`/`gitignore` (`config.ts:744-762`); `release-gates.ts` generated-plugin check and legacy `installGlobalFiles` untouched. Plan says these fields go only with Task 7 consumers — respected.

## 5. Fixture independence, provenance, breadth

- `tests/fixtures/oc1-permission-templates.json` is static frozen data (source noted: `e2bf396` v2.4.0 `dist/cli/config.js`), carries a do-not-edit warning, and was **not** derived from live config. Secret-free: contains only generated permission globs and prompt text; no credentials, tokens, or user config values. Spot-verified against the frozen checkout.
- The matrix (`template_rule_matrix_preserves_effective_policy`) is **independent**: it derives the expected side by running the *new* translator over the *frozen* V1 permission maps, then compares effective last-match outcomes against the generated native rules across ~45 probe resources per action (secret files `.env`/`.env.local`/`config/.env`/`secret.txt`/`credentials.json`/`key.pem`/`id_rsa`/`id_rsa.pub`/`src/secret.ts`, worktree paths, custom-path variants `backend/`, `spec/`, `documentation/`, `knowledge/`, `HISTORY.md`, `ABOUT.md`, `/tmp`, `tmp`, `outside/`, shell commands incl. `rm -rf /`) **plus every original resource pattern from each builder**, and asserts every original pattern survives in the native array. It also covers both default and custom-path configs and all five builders through the role→builder mapping (planner→brainstormer, guiDesigner→implementer — matches V1 sharing).
- The user's named concerns are each concretely asserted: global wildcard deny survival (`read protected/** deny` in global-policy integration test), local path allow masking (`edit outside/**` narrowed to deny; custom-path allows intact), secret denies (broad probes per role), and `project_rules_do_not_restore_inherited_grants` covering inherited allow/ask/deny × overlapping local allows.
- Glob evaluation in tests is an emulator applied identically to both sides — self-consistent for equivalence; real-binary wildcard semantics are explicitly deferred to Task 11 by the plan, and this review does not count the emulator as binary validation (see notes).

## 6. Honest scope judgment on red/downstream failures

- **No required Task 4 test is silently accepted red**: the plan-named test files (`oc2-permissions`, `init`, `config-health`) are fully green; `global-policy` was improved from 12→9 failures with the three project-init/masking cases now passing (verified in the suite run). The remaining 9 are `installGlobalFiles`/`migrateProject`/`resetProject` consumers — owned by Tasks 5/7/8 (verified: all 9 failure messages point at V1 `agent`/`permission` shapes or the legacy migrate guard). `doctor`/`install`/`status`/`update` are Task 8's singular-`agent` consumers; `release` is the known Task 2 interim TUI-compile failure. **Lifecycle is not green and was not claimed green** — correct per the plan's task-sized gates.
- **`initializeProjectAgents` minimal port is justified**: Task 4's own steps require `tests/cli/init.test.ts` and `tests/cli/global-policy.test.ts` green (both are Task 4-modified files whose assertions were converted to native shapes), which is impossible without porting that one function to `agents`/`permissions`. The port is confined to `initializeProjectAgents` (`opencode-config.ts:526-542`); all other lifecycle functions are deliberately unchanged for Tasks 5/7/8, matching the join schedule. Note: `src/cli/opencode-config.ts` was not listed in Task 4's Files line — see non-blocking note 2.
- No product fixes beyond plan scope, no global settings writes, no auth/config reads, no installs/builds/commits/registry changes (git status confirms the expected file set only; no `dist/` produced).

## 7. Security scan (checklist item)

The report does **not** evidence a `commands.security` run — a reporting gap. I ran `npm audit` myself: **0 high, 0 critical**, 32 moderate (vitest `@vitest/mocker` traversal advisory with no in-range fix; transitive `glob`/`minimatch`/`@npmcli/*` chain under `@opencode/plugin`→`@opencode/util`; all pre-existing in the Task 2/3-reviewed graph). No high/critical finding exists to fix or report, so this gap is non-blocking, but the implementer should include the audit line in future task reports (and the fresh-graph audit disposition belongs to the release phase per §6.1).

Secret hygiene in the changed code is sound: no I/O in `oc2-permissions.ts`, fail-closed reasons never echo resources/values, fixtures are generated template text only, and no credential-bearing file was read (fixture generation used the frozen secret-free checkout).

## 8. Parallelization / dependency check

`depends_on: ['Task 3']` only — satisfied (Task 3 review PASS). Task 4's modified files (`src/cli/config.ts`, `oc2-permissions.ts`, three test files, fixture) are disjoint from parallel-window Tasks 6 (`src/server/*`) and 9 (`src/tui/*`); no circular chain; downstream joins Task 4→5, 4+6→7, 4+5+7→8 are correctly ordered. `PermissionRule` shared type exists from Task 3 (`opencode-config.ts:22`) and all new references resolve.

## Non-blocking notes

1. **Security-scan evidence missing from the report** (see §7). Reviewer-verified: no high/critical. Future reports must include the `commands.security` result.
2. **File-list granularity**: Task 4's plan Files line omits `src/cli/opencode-config.ts`, yet the `initializeProjectAgents` port was required to satisfy Task 4's own test gates. The change is minimal, honestly reported, and consistent with the Task 4 interface bullets (baselineAgents/init masking); noting the plan-file-list gap for the orchestrator, no code change requested.
3. **Interim deferrals, correctly tracked**: glob-wildcard semantics against the real OC2 binary (Task 11), `installGlobalFiles`/`migrate`/`reset`/`doctor`/`status`/`install`/`update` V1 consumers (Tasks 5/7/8), TUI compile errors (Task 10). None may be closed silently later; Task 11 has no exceptions.
4. Inherited `ask` with local fallback `deny` is narrowed to `deny` (matches V1 masking exactly) — intentional, documented here so Task 5's migration review uses the same reference semantics.
