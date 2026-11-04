# Model-Slot Retirement, Doctor Skill Checks, Release Automation — Integrated Design

**Date:** 2026-11-03 — **Revision 3** (replaces the pending no-lint acceptance with concrete, user-authorized minimal lint tooling derived from the one-time, consumed read-only research of the /noema project; supersedes Revisions 0–2 of the same date. Noema must not be accessed again — its relevant findings are retained below.)
**Status:** User-approved spec and implementation plan. **2026-11-04 bounded amendment accepted:** development/lint Node `^20.19.0 || ^22.13.0 || >=24` due to the transitive dependency graph; runtime `engines.node` remains `>=18.0.0`, direct lint versions unchanged. The user authorized continuation ("accept and don't ask again"); no routine reapproval is required. This does not authorize commits or real-repo release execution.
**Package:** `model-retirement-release-doctor` (registry ids: `retire-model-slots`, `doctor-skill-compatibility`, `release-automation`)
**Related specs:** `2026-11-02-global-only-kiki-design.md`, `2026-11-02-kiki-model-menu-design.md`, `2026-11-02-kiki-local-model-reset-design.md`, `2026-11-02-global-project-plugin-dedup-design.md`
**Applies to:** Kiki v2.2.0, OpenCode 1.18.35, superpowers package 7.0.1 (observed)

**Approval history:** The user explicitly approved this spec and its implementation plan, including the packaging/sequencing approach and minimal lint tooling derived from the one-time, consumed read-only Noema research. Proposal labels below retain the design's decision history, not pending user-approval gates; the approved plan resolves builder defaults (including unused-vars error severity). On 2026-11-04 the user accepted the exact development/lint Node range above without changing runtime engines or direct lint versions, and authorized continuation without routine approval questions.

---

## 2026-11-04 amendment — approved security exception

**User approval (2026-11-04, verbatim):** 'Add known exception switch, then commit, refresh and rerun'. This approves the scope change to the completed package: a first-class release security-exception mechanism supersedes the prior “no exception option is delivered” clause. This docs-only amendment performs no commit, refresh or rerun; it changes only this spec and its existing plan in `/home/lutz/lprojekte/kiki`. The implementer syncs the worktree later.

**Motivating case:** the existing acceptance-report exception records **4 high vulnerabilities in the `@opencode-ai/plugin` type-only graph**; this is not a clean audit or permission to skip evidence.

- Add `--security-exception <reason>` in dry-run and apply alike. The reason must be a non-empty string; reject missing, empty and duplicate values consistently with other options.
- The exception changes **only the high/critical block decision**. Audit still runs, all counts are still reported, and low/moderate remain nonblocking. Apply is allowed only if every other requirement passes.
- **INCOMPLETE always fails closed**, even with an exception: unavailable/malformed audit, exit other than 0/1, signal or spawn failure. Missing or invalid evidence can never be excepted.
- For an excepted high/critical result, use honest wording, e.g. `security: passed with approved exception (N high, M critical; reason: <reason>)`, never a clean `security: passed`. Print the supplied reason in the gate line, report header and final manual-next-steps output.
- Without the flag, behavior and output remain **byte-identical to the reviewed tool**, including blocking high/critical findings.
- Required tests: parser accept/reject matrix; passes-with-exception wording and apply allowed; every INCOMPLETE class plus exception still fails; byte-identical no-flag regression; reason present in gate line, report header and final manual next steps. The plan's amendment assigns this implementation/test work.
- README/CHANGELOG updates belong to the **historian's step**, not this amendment. No code, registry, README/CHANGELOG, Noema or secret access is included here.

## Context (verified in code and registry)

At the original design inspection, all three registry tasks were in `brainstorm` phase; the previous combined draft had failed its builder check. This is historical context, not a current registry-status claim. The user has selected **incremental implementation of a single package** (implementation increments, NOT commits or release execution), in the order **retirement → doctor → release**, with one shared final review/docs pass. No separate releases are authorized.

### Model-slot machinery to retire (WS1)

- `KikiModels` interface (`src/cli/config.ts:21`), `DEFAULT_MODELS` (`:66`), `DEFAULT_CONFIG.models` (`:102`), `KikiConfig.models` (`:48`).
- `DEFAULT_ROUTING_TABLE` (`:115`); its only consumer is `writeAgenticFiles` (`:798`), which also writes `routing.json` — **dead code in `src/`** (only tests import it).
- `writeOpencodeFiles` (`:769`) — **dead code in `src/`** (only tests import it) since the global-only rework.
- Agent templates embed `model: ${config.models.standard|critical|workhorse}` in frontmatter at `config.ts:321, 370, 389, 422, 458, 471, 501, 526`.
- `loadConfig` merges `models` (`:161`); wizard prompts for the three slots (`src/cli/commands/init.ts:105-107, 139-143`); `persistableConfig` strips default models before persisting (`src/cli/commands/install.ts:10-16`).
- `initializeProjectAgents` writes project `model` overrides when a wizard choice differs from baseline (`src/cli/opencode-config.ts:362`).
- `installGlobalFiles` already preserves existing user models/permissions on update (`opencode-config.ts:313-321`) — kept exactly.
- The `/kiki` TUI menu, `setAgentModel`/`removeAgentModel`/`removeAllProjectModels` are the native model surface and stay unchanged.
- `kiki migrate` imports legacy `routing.json` models into OpenCode config — explicit legacy-data ingestion, stays.
- `src/core/routing-table.ts` and its `src/index.ts` re-exports are the public API (`package.json` `exports["."]`); not named for deletion, stays.

### Doctor today (WS2 baseline)

`src/cli/commands/doctor.ts`: `✓/✗` checks for global agents, per-agent models, prompt files, plugin, workflow, duplicate local plugins, legacy `routing.json`, project config paths/commands. Failures exit 1. No warning level, no skill checks.

### Skills today (verified on this machine)

- Agent templates require: `brainstorming`, `writing-plans`, `executing-plans`, `test-driven-development`, `systematic-debugging`, `receiving-code-review`/`requesting-code-review` (superpowers), plus `ui-ux-pro-max` (gui-designer; user-level, not superpowers).
- **Actual disk layout** (verified, not assumed): `($XDG_CACHE_HOME|~/.cache)/opencode/packages/superpowers@git+https:/github.com/obra/superpowers.git/node_modules/superpowers/skills/<name>/SKILL.md` — i.e. the `packages/` child directory name embeds a git URL with a colon (`superpowers@git+https:`), followed by **nested path segments** (`github.com/obra/superpowers.git`) whose final component carries a `.git` suffix, then `node_modules/<pkg>/skills/`. Naive single-level globs (`packages/*/node_modules/*/skills/`) do **not** match this layout.
- User skills live at `~/.opencode/skills/<name>/SKILL.md`.
- `SKILL.md` frontmatter has `name` and `description` — **no per-skill version**. The only version signal is the superpowers `package.json` `version` (`7.0.1` observed).
- Registration is done by superpowers' own OpenCode plugin at runtime; there is **no out-of-process API** to ask a running OpenCode which skills it registered.

### Release today (WS3 baseline)

- Version sources: `package.json` (2.2.0), `package-lock.json` (root `version` at line 3 + `packages[""].version` at line 9 — exactly two fields, verified), `KIKI_VERSION` in `src/cli/config.ts:90`. Unit test `tests/cli/plugin-template.test.ts:93` pins `KIKI_VERSION === package.json.version`.
- `dist/` is **committed** (release commit `8f44a8d` touched it); `.npmignore` ships `dist/` only. Install is GitHub-based (`npm install -g github:luxuxorg/kiki` or a checkout). A release = a version-synced, dist-regenerated, changelog-updated state of the repo.
- Conventional commits throughout (`feat:`, `fix:`, `docs:`, `test:`, `build:`, `chore:`, `merge:`). Last release subject: `feat: release v2.2.0 with global-only installation and native /kiki menu`.
- `CHANGELOG.md`: Keep-a-Changelog, `## [Unreleased]` on top, `## [X.Y.Z] — YYYY-MM-DD` (em dash).
- **No git tags**, no CI, no npm publish.
- **Tooling (inspected):** `package.json` scripts are `build` (tsc), `test` (vitest run), `test:watch`, `cli` — **there is no `lint` script and no linter dependency or config anywhere in the repo today**. devDependencies: `@opencode-ai/plugin`, `@types/node`, `typescript`, `vitest`. The security convention across the codebase (`DEFAULT_CONFIG.commands.security`) is `npm audit`. (This revision adds user-authorized minimal lint tooling — see Lint Foundation.)
- **Mutation-prone tests exist:** `tests/integration/routing-pipeline.test.ts:51` deletes `.agentic/routing_log.jsonl` relative to cwd; several tests write to `tmp/` relative to cwd. Any release validation that runs the suite must therefore control cwd.

## Intent and Why

1. **WS1 (first):** finish the 2.2.0 "native model selection" move — stop shipping any model-slot abstraction (no seeding, no wizard prompts, no persistence, no dead routing artifacts), so native OpenCode configuration plus `/kiki` is the *only* model source.
2. **WS2 (second):** surface skill drift (missing/renamed/version-unknown) as **warnings**, with honest statements of what doctor can and cannot know; no vendoring/namespacing of upstream skills.
3. **WS3 (third):** a deterministic, guarded **local** release prepare/validate command with candidate-based isolation: every transformed artifact and every gate (build/test/lint/security/invariants) runs against a transformed **candidate copy outside the checkout**; the checkout itself is never used as a testbed, and nothing remote is ever executed by the tool.

## Goals

- **WS1:** no model values seeded into generated agents or OpenCode settings by any Kiki path; no wizard model prompts; `models` no longer a persisted/loaded concept (existing files tolerated, never rewritten); `DEFAULT_ROUTING_TABLE`/`writeAgenticFiles`/`writeOpencodeFiles` deleted with test coverage relocated; install/update print the `/kiki` hint; existing user models and permissions survive updates unchanged.
- **WS2:** doctor verifies required skill files are present on disk with expected names, reports the observed superpowers package version against the version Kiki was tested with, all as warnings that never change the exit code, and states its presence-vs-registration limitation honestly.
- **WS3:** `kiki release` defaults to a fully validating, fully non-mutating dry-run; `--apply` additionally copies the validated candidate into the checkout with rollback-on-failure; deterministic changelog generation **and** validation; conventional-commit semver inference; explicit `--since` fallback failing closed; zero git mutations and zero remote operations in every mode.
- **Package:** three implementation increments (WS1 → WS2 → WS3), each leaving the suite green; one shared final review + historian docs. **No commits, tags, or release execution are part of this package** (see Authorization Boundary).

## Non-Goals

- No changes to `/kiki` TUI, `setAgentModel`/remove paths, `kiki migrate`/`reset`, `status`.
- No removal of `src/core/routing-table.ts` or public exports (possible follow-up; would force a major bump).
- No doctor skill auto-install/vendoring/namespacing; no claim of registration or live availability.
- No CI release workflow, no npm publish, no automatic git operations of any kind, no real-repo release run.

## Anti-Goals

- Any second model-config source surviving the retirement.
- Kiki copying/forking superpowers skills.
- Any release path that can commit, tag, push, or publish.
- Any release-path test/build/lint/security execution inside the real checkout.
- Modifying the task registry or user OpenCode settings from any of the three workstreams.

## Approaches Considered and Selection

**Packaging/sequencing — user-selected in conversation:**

- A. Three separate designs/releases. — Rejected by the user: one integrated handoff, no separate releases.
- B. **One integrated design, one package, three implementation increments in fixed order (WS1 → WS2 → WS3), one shared final review/docs. — SELECTED by the user.** (Implementation increments are units of verified work; whether/when they become commits is the orchestrator's call, outside this design.)
- C. Big-bang (all three at once). — Rejected: user chose incremental; each step stays green and reviewable.

**WS1:** full removal (matches the registry task text) vs. partial removal (rejected: leaves a second model source) vs. also removing the public routing-table exports (rejected: not named by the task; would force a major bump). **Full removal of the named internals.**

**WS2:** filesystem scan (selected) vs. vendoring/namespacing (rejected by task text) vs. querying a live OpenCode registry (rejected: no out-of-process API). Scan must be layout-aware and bounded (below).

**WS3:**

- Full automation (tag/push/publish) — rejected by explicit user constraint.
- CI/GitHub-Actions workflow — rejected: no CI exists; installs come from the default branch; remote actions excluded.
- **Dry-run-by-default with explicit `--apply` (selected as proposed default).** The previous draft made prepare the default with an opt-out `--dry-run`. The escalation directs the safe default: validation-only unless the user explicitly asks for writes. This is a **proposed CLI contract**, justified by failure asymmetry — an accidental prepare mutates the checkout and requires manual rollback, while an accidental dry-run costs only time. Veto-able at approval (see Proposals #12).
- **Candidate-based validation (selected over in-checkout validation).** In-checkout validation (previous draft) runs the suite in the real repo, where `routing-pipeline.test.ts` deletes `.agentic/routing_log.jsonl` and tests write `tmp/` — mutation of the user's working tree during what claims to be a "dry run". Candidate isolation contains all such mutations in a temp directory.

---

## Workstream 1 — Model-Slot Retirement

### Removals

1. **Agent templates** (`src/cli/config.ts`): delete the `model: ${config.models.*}` line from all 8 frontmatters. `baselineAgents()` then yields settings without `model`; `installGlobalFiles` no longer seeds models; `initializeProjectAgents` has no model diff to write.
2. **Wizard** (`src/cli/commands/init.ts`): remove the `--- Models ---` prompt block and the `models` field of the constructed config.
3. **Config types** (`src/cli/config.ts`): delete `KikiModels`, `DEFAULT_MODELS`, `KikiConfig.models`, `DEFAULT_CONFIG.models`.
4. **Persistence** (`src/cli/commands/install.ts`): delete `persistableConfig`; `installProjectConfig` writes the config as-is (no `models` key anymore). Existing on-disk `config.json` files are **never rewritten for this**.
5. **Graceful load** (`loadConfig`): strip a legacy `models` key alongside the already-stripped `riskMatrix`, so old files load fine and their `models` section is inert (ignored, not deleted, not consumed).
6. **Project seeding** (`src/cli/opencode-config.ts` `initializeProjectAgents`): remove the model-diff spread (`:362`); the function then writes only permissions and merges existing entries — existing project `model` keys survive via `...(existing.agent?.[name] || {})` untouched.
7. **Dead code** (`src/cli/config.ts`): delete `DEFAULT_ROUTING_TABLE`, `writeAgenticFiles`, `writeOpencodeFiles` (no production callers; test coverage relocated, below).
8. **CLI help** (`src/cli/index.ts`): doctor help line drops "models" ("Validate config, paths, agent files, and skills").

### Behavior after retirement

- **Fresh install:** agents have no `model` key anywhere; OpenCode resolves each agent's model from its top-level/default model. Intended state.
- **Update:** `installGlobalFiles` unchanged — previously-seeded or user-chosen `agent.<name>.model` values are user data and preserved exactly (registry requirement). Kiki does not attempt to distinguish seeded from chosen models; removing either would violate the preserve requirement.
- **Legacy configs:** a `config.json` containing `models` loads silently; values ignored. Doctor notes this informationally, never fails on it.

### Doctor model-check adjustment (required by retirement)

Doctor today fails any agent without a resolvable model string; a fresh post-retirement install would fail out of the box. Change the per-agent model check to **informational pass**: `✓ agent <name> model — <model>` when explicit/inherited (`agent.model ?? project.model ?? global.model`), else `✓ agent <name> model — inherits OpenCode default; set via /kiki`. Never fails; invalid model *values* are still caught upstream by `readSettings`/`validateAgent`, which throw on empty/blank models.

**[PROPOSAL]** Model presence becomes informational rather than a failure. Alternative (fail when nothing resolves anywhere) rejected: OpenCode itself surfaces a missing model loudly at dispatch; doctor failing every fresh install is a false alarm.

### Install/update hint (final acceptance step)

`installGlobalFiles` prints one extra line after its current output (covers `install` and `update`):

```
Agent models: set them with the /kiki command in OpenCode (or edit agent.<name>.model in opencode.json).
```

Exact wording left to the builder; tests assert a stable substring (`/kiki` in the hint).

### What deliberately stays

- `src/core/routing-table.ts`, its tests, its `src/index.ts` exports (public API).
- `kiki migrate`, `kiki routing` (notice), `status`, the `/kiki` TUI, the plugin's routing logger (`model` field in `routing_log.jsonl` comes from the dispatch payload, not slots), `KikiHealthConfig`, the watchdog.

---

## Workstream 2 — Doctor Skill Checks

### Required skills (source of truth: current agent templates)

```
REQUIRED_SKILLS = ['brainstorming', 'writing-plans', 'executing-plans',
  'test-driven-development', 'systematic-debugging',
  'receiving-code-review', 'requesting-code-review', 'ui-ux-pro-max']
```

**[PROPOSAL]** `ui-ux-pro-max` included (the gui-designer template hard-requires it) even though it is not a superpowers skill; the task's "required Superpowers skills" is read as "the skills Kiki agents require". Strictly-superpowers scope would drop the last entry — veto-able.

**[PROPOSAL]** `receiving-code-review` and `requesting-code-review` stay separate required entries (the reviewer loads one of the two per run, "as appropriate"); warn per missing name.

### Discovery — layout-aware, bounded, symlink-safe (read-only)

Doctor scans these roots for `<name>/SKILL.md`:

1. Project: `<project>/.opencode/skills/`
2. User (legacy): `~/.opencode/skills/`
3. User (XDG): `($XDG_CONFIG_HOME|~/.config)/opencode/skills/`
4. Package cache: `($XDG_CACHE_HOME|~/.cache)/opencode/packages/` — **not** a flat glob. The verified layout nests (`packages/superpowers@git+https:/github.com/obra/superpowers.git/node_modules/superpowers/skills/…`), so this root uses a **bounded depth-first walk**: from `packages/`, descend at most a fixed depth (proposal: 8 levels), skip `node_modules` interiors except the pattern `node_modules/<pkg>/skills/<name>/SKILL.md`, `realpath()` each candidate directory, keep a visited-set of resolved paths to skip symlink cycles, skip unreadable entries silently-counted. Malformed or partial package trees are skipped, not fatal.

A skill counts as **present on disk** if any root yields a `SKILL.md` whose frontmatter `name` equals the expected name **or** whose directory name equals it (frontmatter parsed with the existing `yaml` CLI dependency; unreadable frontmatter falls back to directory name and is reported as name-drift).

### Presence vs registration vs live availability — the honest boundary

Doctor can verify **disk presence only**. It cannot verify that OpenCode registered the skills (registration happens inside the running OpenCode via the superpowers plugin) nor that they are live in any session. Doctor output and README state this explicitly:

```
Skill checks verify files on disk; they cannot confirm OpenCode plugin
registration or live availability in a running session.
```

**[PROPOSAL]** This limitation is printed once in doctor output (info line), not per skill.

### Checks (warnings never affect the exit code)

- **Missing on disk:** `! skill <name> — not found on disk; install the superpowers OpenCode package (or place it in ~/.opencode/skills)`.
- **Name drift:** found via directory name but frontmatter `name` differs → `! skill <name> — name drift: frontmatter says '<x>'`. Report, never fix.
- **Version observation (no floor, no compatibility claim):** `TESTED_SUPERPOWERS_VERSION = '7.0.1'` — the version Kiki's agent templates were last verified against (observed fact, not a support floor). If a required superpowers skill was found in a package-cache root, read that package's `package.json` `version`:
  - equal to tested → `✓ superpowers <v> (matches tested version)`;
  - any difference — **higher or lower** — → `! observed superpowers <v>; Kiki agents were tested against <tested> — re-verify skill behavior after any superpowers change`;
  - missing/malformed version → `! superpowers version unknown (unreadable package.json)`;
  - prerelease-suffixed version → same warning plus the suffix is echoed verbatim.
  None of these claim compatibility or incompatibility; they state observation and testing history only. **No `>=` floor exists anywhere.**
- **Multiple copies** (e.g. user copy + package copy): first found wins for the check; duplicates get an info line, not a warning (duplicates are legal).

### Doctor output gains a warning level

`check()` gains a `warn` variant (`! label — detail`), counted separately; summary `N passed, M warnings, K failed`; warnings never set the exit code. WS1's informational model note reuses the pass line, so WS1 and WS2 stay independent.

**[PROPOSAL]** One info line when `<project>/.agentic/kiki/config.json` contains a legacy `models` section: "legacy models section present; ignored — models are configured via /kiki or OpenCode config".

---

## Lint Foundation — bounded step before release validation (user-authorized)

The user authorized borrowing lint tooling from the /noema project and granted one-time access; read-only scoped research was completed at `/home/lutz/lprojekte/noema`. **That access is consumed — Noema must not be accessed again.** The findings relevant to Kiki are retained here for the planner.

### Retained research findings (from the consumed Noema access)

- Noema uses an **ESLint flat ESM config** built on **typescript-eslint `configs.recommended`**, with `no-explicit-any` **off** and `no-unused-vars` configured to ignore `^_`-prefixed args/vars/caughtErrors (set to warn in Noema).
- Noema's versions: `eslint ^9.39.4` (resolved 9.39.4); `typescript-eslint` resolved 8.62.0 — but there it arrives **transitively via Next**. **Kiki must declare `typescript-eslint` directly**; no reliance on transitive package imports. No React/Next dependencies come along.
- Peer constraints: ESLint 8.57/9/10; TypeScript `>=4.8.4 <6.1.0`. Kiki runs TS 5.9.3 with ESM NodeNext — compatible.
- **Engines (accepted amendment, 2026-11-04):** The original direct-ESLint-only floor was insufficient for the transitive dependency graph. The accepted **development/lint-only** Node range is exactly `^20.19.0 || ^22.13.0 || >=24`, minimum 20.19.0; Node 21 and 23 are excluded, so this must not be simplified to blanket `>=20.19.0`. Document the exact range in the README development section. Kiki's runtime `engines.node` remains `>=18.0.0` — **do not change it**, or the direct lint dependency versions, as part of this amendment.

### Kiki's minimal lint introduction (src-only, non-type-aware)

- **devDependencies added:** `eslint ^9.39.4` and `typescript-eslint ^8.62.0` (exact availability/compatibility re-verified at implementation time); lockfile updated as part of this step.
- **Config:** flat ESM `eslint.config.*` using typescript-eslint `configs.recommended` (non-type-aware), `no-explicit-any` **off**, `@typescript-eslint/no-unused-vars` ignoring `^_`-prefixed args/vars/caughtErrors. Ignores: generated `dist/`, `node_modules/`, `.worktrees/`, `tmp/`, `coverage/`, `.agentic/`.
- **Lint script:** `eslint "src/**/*.ts"` — **src-only**; the typecheck gate remains a separate, also source-only gate. No lint-vs-typecheck conflation, and no lint-success claims about tests (tests remain covered by Vitest).
- **Severity:** **[PROPOSAL — explicit]** either `no-unused-vars` at **error** severity, or warn (mirroring Noema) with `--max-warnings 0` in the script. Default proposal: **error** (simplest gate semantics; identical blocking behavior; no flag coupling). Veto-able at approval.
- **Bounded scope:** only the minimal fixes this rule set requires in `src/**` for the gate to pass; **no broad cleanup or stylistic refactoring of unrelated source**.

This step is user-approved, including the tooling choice and its Noema origin; the approved plan selects error severity. The accepted Node-range amendment changes only development/lint documentation, not runtime engines or direct lint versions.

---

## Workstream 3 — Release Automation

### Authorization boundary (explicit, from escalation)

This package delivers **code and fixture-repo tests only**. The implementation increments must **not** run `kiki release` (any mode) against the real kiki repository. Producing an actual 2.3.0 release state is a separate, explicit user authorization outside this design. Likewise, no increment requires or authorizes commits, tags, or pushes.

### Command surface

```
kiki release [--apply] [--bump auto|major|minor|patch] [--since <ref>] [--security-exception <reason>]
```

- **Default mode is dry-run** (validation-only; zero checkout writes). `--apply` additionally copies the validated candidate into the checkout with rollback-on-failure. There is no separate `--dry-run` flag; dry-run is the default. (CLI-contract change vs. the previous draft — see Proposal #12.)
- `--bump auto` is the default. Hand-rolled parsing consistent with `args.ts`; no new dependencies.
- Runs only inside the Kiki source repo (guardrail: `package.json` `name === "kiki"` and `src/cli/config.ts` present); refuses elsewhere with exit 1.

### The transformed candidate (core isolation mechanism)

Every transformed artifact and every gate runs against a **candidate copy outside the checkout**, in `mkdtemp` under the OS temp dir. The checkout is read for inputs and written only by the final, guarded `--apply` copy-back.

**Candidate construction:**

1. Copy **tracked working-tree files** (`git ls-files -z` → byte-copy each path, preserving relative paths) into the candidate. `.git` is not copied. **Untracked and ignored files are deliberately not copied** — they are not part of the release state. (Their preservation in the *checkout* is asserted by tests, below.)
2. **Dependencies — candidate-owned copy, not a source symlink.** A symlinked `node_modules` is **not** read-only isolation: `tsc --noEmit` writes nothing there, but `vitest` and any node tooling may write caches, lock-adjacent state, or `node_modules/.cache` through the symlink into the **user's real tree**, and `npx` may download into it. The candidate therefore owns its dependency tree:
   - Byte-copy the checkout's `node_modules` into `candidate/node_modules` **once per candidate** (the smallest safe approach; no dedup/hardlink cleverness). The candidate's gates cannot write into the checkout through it.
   - **Writable npm state is redirected to the candidate/temp:** `npm_config_cache` (and npm log/tmp state) point at a temp dir owned by the run, so no gate writes cache into the user's home.
   - **No `npx` download fallback:** the typecheck gate invokes the local `tsc` binary only (`node_modules/.bin/tsc` or `node <resolve>tsc`); a missing local binary fails closed. `npx` (which fetches from the registry on absence) is never used by any gate.
   - The exact copy mechanics (streaming, error handling, partial-copy cleanup) are the planner's; the design fixes only: **copy, never symlink; caches redirected; no network tool fallback; fixture tests assert the source `node_modules` is byte-preserved** by the whole pipeline (see Test Strategy).
   - **Writable outputs inside the candidate are real candidate directories:** `dist/`, `tmp/`, `.agentic/` are created there by the gates — never symlinked anywhere.
3. Apply transforms **to the candidate copies only**:
   - `package.json`: version → new (parse/stringify, 2-space, key order preserved).
   - `package-lock.json`: root `version` + `packages[""].version` — the only two version fields (verified); byte-stable otherwise.
   - `src/cli/config.ts`: `export const KIKI_VERSION = '<new>';` exact-line replace.
   - `CHANGELOG.md`: see Changelog generation & validation below.
4. **Build:** `tsc` with cwd = candidate emits a real `candidate/dist/` (the committed-dist equivalent).

### Gates (run against the candidate, cwd = candidate, in both modes)

- **Test gate:** the repo's test command (`npm test` / vitest) with cwd = candidate. Mutating tests stay contained: `routing-pipeline.test.ts` deletes `candidate/.agentic/routing_log.jsonl`; suite-wide `tmp/` writes land in `candidate/tmp/`. **The real checkout's `.agentic/routing_log.jsonl`, `tmp/`, and everything else are never touched** — this is the fix for the mutation-prone-test problem the escalation flagged.
- **Typecheck gate (named honestly; not "lint"):** `tsc --noEmit -p <candidate>/tsconfig.json` using the **local typescript devDependency binary only** (no `npx`). The repo's `tsconfig.json` covers `src/` and **excludes `tests/`** — the gate is a source type-verification, reported as "typecheck: passed (src/)".
- **Lint gate:** `eslint "src/**/*.ts"` with cwd = candidate, using the **locally installed ESLint binary from the candidate's copied `node_modules`** — no `npx`, no downloads. The candidate carries the tracked flat config and the updated lockfile, so the gate is self-contained and its scope matches the repo's config exactly. No lint claims beyond `src/**` (tests are covered by the test gate via Vitest; type coverage by the typecheck gate).
- **Security gate — `npm audit`, network explicitly permitted and scoped:** this audit is the **one deliberate network query** the release tool performs, and it is explicitly **not** a "remote release action" — it reads advisory data; it never tags, pushes, publishes, or mutates anything remote. The no-remote rule (Authorization Boundary) refers to release actions on the repo/npm, not this read-only advisory lookup. Mechanics: `npm audit` with cwd = candidate against the candidate lockfile, with **all writable npm state (cache, logs, tmp) redirected to a temp dir owned by the run** (never the user's `~/.npm`, never the checkout).
  - **Audit unavailable (offline/registry error) → fail closed**: the run exits 1 with a report line **"security: INCOMPLETE — npm audit unavailable (<reason>)"**. It is never silently skipped and never reported as passed; incomplete verification is a hard stop by default.
  - **Vulnerability policy:** any **high or critical** vulnerability in the audit **blocks** the release unless `--security-exception <reason>` records the approved exception under the 2026-11-04 amendment. Without the flag, retain the reviewed block behavior/output (`blocked: N high/critical vulnerabilities; no exception approved`). Low/moderate are reported but do not block; INCOMPLETE is never excepted.
  - `--omit=dev` vs. full-tree audit is a planner choice if a production-only posture is preferred.
- **Invariant checks (post-transform, post-build):** `KIKI_VERSION === package.json.version === lockfile both fields === <new>`; emitted `dist/` output contains the new version string (the generated plugin's `KIKI_PLUGIN_VERSION` consistency); changelog new heading `## [<new>] — <date>` present with a fresh empty `## [Unreleased]` above it; **changed-file allowlist**: the set of candidate paths differing bytewise from their pre-transform snapshot is exactly `{package.json, package-lock.json, src/cli/config.ts, CHANGELOG.md, dist/**}` — computed by byte-compare against the snapshot, not by git (the candidate has no `.git`).

### Release baseline (exact-match, fail closed)

- The baseline commit is the **newest commit whose subject matches `release v?<current version>`** — an exact match against the *current* version (e.g. `release v2.2.0`), not any release-like subject. This anchors the range to the version actually being shipped.
- **No such commit → fail closed** with an instruction to pass an explicit `--since <ref>`. `--since <ref>` overrides discovery and defines the range as `<ref>..HEAD` (git-log read only).
- Ambiguity (multiple matching subjects) resolves to the newest match deterministically; the chosen baseline is printed. If the newest match does not look like the immediate predecessor of HEAD's history (e.g. matches on an unrelated branch), the tool does not guess further — it prints the chosen baseline for the human to eyeball.

### Conventional-commit parsing (standard, scoped, full bodies)

- Range subjects **and bodies** are parsed per the Conventional Commits spec: subject `type(scope)!: description`; body footers `BREAKING CHANGE: …` and the spec-recognized `BREAKING-CHANGE: …` alias.
- Rules: any `!` or breaking footer → major; else any `feat` → minor; else any `fix` or `perf` → patch; else fail closed ("nothing release-worthy since <baseline>; use --bump to force"). `--bump` overrides inference. New version must be strictly greater than current (monotonic guardrail).
- Merge commits and non-conventional subjects are ignored for inference but counted and reported. **[PROPOSAL]** hand-rolled minimal parser following the spec (no new dependency); its rules are unit-tested against fixture commit lists including `!`, both footer spellings, scoped types, and non-conventional subjects.

### Changelog — deterministic generation AND validation (both mandatory)

The registry requires generate **and** validate; both are in the pipeline, no opt-out:

1. **Validation:** `## [Unreleased]` heading must exist; the section must be non-empty and free of TODO/TBD placeholders **after** generation.
2. **Generation (deterministic):** if `[Unreleased]` is empty, append draft bullets generated from the commit range — grouped `### Added` (feat), `### Changed` (refactor/perf/other conventional), `### Fixed` (fix), each bullet `- <description> (scope)` derived deterministically from subject text; identical range ⇒ identical bytes. Existing human-authored content is never rewritten, only appended-to.
3. **Rename:** `## [Unreleased]` → `## [<new>] — <today YYYY-MM-DD>`; fresh empty `## [Unreleased]` inserted above.

### Report (both modes)

Version decision + triggering rule; chosen baseline + range size; per-gate results; per-file before→after preview; manual next-steps block (never executed): `git add …`, `git commit -m "feat: release vX.Y.Z …"`, optional `git tag`, optional `git push`. When supplied, print the security-exception reason in the report header, security gate line and final manual-next-steps output per the amendment. Both modes end with a line stating that Kiki performed **no** commit/tag/push/publish.

### `--apply` copy-back and rollback/failure semantics

Only after the candidate passes every gate:

0. **Dist collision scan (before any write).** A clean `git status --porcelain` does **not** reveal ignored files inside `dist/`, and the candidate contains only `git ls-files`-tracked paths — so a wholesale `dist/` replacement could silently delete files the release never shipped (ignored or untracked files living under `dist/`). Before writing:
   - Enumerate the checkout's `dist/` tree (if it exists) with full metadata and compare against the tracked set: any file under the checkout's `dist/` that is **untracked or ignored** (not in `git ls-files`) is a **collision**.
   - **Policy (fail-closed default):** any collision → **refuse to apply**, exit 1, listing the colliding paths and instructing the user to move or explicitly integrate them. Preserving non-release files by merging (copy candidate files over, keep unknowns) is the alternative — **[PROPOSAL: refuse, not merge]**, because a release tree containing files the release did not build is a false release state; refusal is the smallest honest semantics. Veto-able at approval.
   - The dry-run mode reports the same scan result (collision present → dry-run reports "apply would refuse: N colliding files"), so the user learns before ever applying.
1. **Snapshot:** copy the current bytes of the four target files, and byte-copy the **entire checkout `dist/` tree** (not an enumeration — a full byte copy) into a backup temp dir (sibling of the candidate; location listed in the report). With step 0's scan, the checkout `dist/` is exactly the tracked release tree, so this snapshot is complete.
2. **Write:** copy the four transformed files from the candidate into the checkout (atomic per-file writes, in the manner of `writeAtomic`); then replace `dist/` wholesale (delete the old tree, copy the candidate's built `dist/`).
3. **Failure at any point — including copy failures:** restore every snapshotted file byte-for-byte from the backup; restore the `dist/` tree byte-for-byte (full-tree restore from the snapshot, including recreating files the write step had already deleted and deleting anything it had newly created); report the failure and the backup location. The checkout returns to its pre-apply byte-state. Untracked and ignored files outside the write set were never touched (asserted by isolation tests).
4. **Post-apply byte verification — with rollback on its failure:** after the write, byte-compare **every** checkout target against the candidate: the four files and **every file of the new `dist/` tree** (full byte walk, both directions: nothing missing, nothing extra, every byte equal). Any mismatch → **rollback** (step 3, using the snapshot) → exit 1 with the mismatch and backup location. A partial or corrupted apply never remains in the checkout. (The previous draft's "re-read the four files" is replaced by this full byte verification; a mismatch is no longer merely reported — it triggers rollback.)

`--apply` requires a clean tree upfront (`git status --porcelain` empty) so the rollback contract is well-defined; dry-run tolerates a dirty tree but reports it and labels the preview accordingly.

### Dry-run contract ("truly non-mutating")

- No checkout file is written; no git state changes (only `git log`/`git ls-files`/`git status` reads).
- Validation is still real and complete: full candidate pipeline — transforms, build, test suite, typecheck gate, lint gate, security gate, invariants — all inside the temp candidate, which is removed afterwards.
- Output: the exact preview `--apply` would produce, plus the manual next-steps block.

### Determinism

Same commit range + same changelog state + same tracked tree + same date ⇒ byte-identical outputs in both modes. Only environmental input is the release date (documented). No network except the read-only `npm audit` query.

---

## Sequencing and Integration (implementation increments, not commits)

1. **Increment 1 — WS1 retirement:** all removals, doctor model-check adjustment, install/update `/kiki` hint, relocated tests. Suite green.
2. **Increment 2 — WS2 doctor skills:** warn level, layout-aware bounded discovery, presence/name/version-observation checks, honest limitation note. Suite green.
3. **Increment 3 — Lint foundation (bounded, user-authorized):** devDeps + lockfile update, flat config, src-only lint script, minimal `src/**` fixes only where the new rule set requires; README development-section note for the exact Node `^20.19.0 || ^22.13.0 || >=24` development/lint requirement; runtime `engines.node` unchanged at `>=18.0.0`. Suite green; the new lint gate passes.
4. **Increment 4 — WS3 release command:** CLI, candidate pipeline, gates (now including lint), changelog generation+validation, baseline matching, apply/rollback. Suite green against fixture repos.
5. **Shared close-out:** one integrated review of the whole package; historian updates README + CHANGELOG per the documentation-completion gate; the orchestrator advances the registry.

The retirement → doctor → release ordering is preserved; the lint foundation is a bounded prerequisite step that enters between doctor and release so the release gates can include lint from the start. **No increment includes running the release tool on the real repo, committing, tagging, or publishing; those actions still require separate authorization.** Spec/plan approval and the bounded Node-range amendment are already accepted; do not reopen routine approvals.

WS1 and WS2 both touch `doctor.ts` but are independent (WS1 reuses the pass line; WS2 adds the warn level). The release increment is last so its own versioned artifacts are released once, later, under separate authorization.

## Proposals and Builder Defaults (historical labels; spec and plan now user-approved)

The entries retain their original proposal wording as decision history, not outstanding approval requests. The approved plan selects error severity and full-tree audit; item 7 incorporates the accepted development/lint Node-range amendment.

1. **[PROPOSAL]** WS1: doctor's per-agent model check becomes informational, never failing.
2. **[PROPOSAL]** WS1: legacy `models` sections are ignored on load, left on disk, reported informationally by doctor.
3. **[PROPOSAL]** WS2: `ui-ux-pro-max` in `REQUIRED_SKILLS` despite not being a superpowers skill.
4. **[PROPOSAL]** WS2: all skill findings — including *missing* — are warnings; exit code unaffected.
5. **[PROPOSAL]** WS2: `TESTED_SUPERPOWERS_VERSION = '7.0.1'` as an observation/testing statement only — **no support floor**, no `>=` semantics anywhere; any difference (either direction), unknown, malformed, or prerelease version yields a warning that claims neither compatibility nor breakage.
6. **[PROPOSAL]** WS2: package-cache walk depth bound of 8 with realpath cycle-skip; duplicates reported as info.
7. **[USER-APPROVED]** Lint tooling is introduced per the Lint Foundation section — user-authorized via the one-time, consumed Noema research: devDeps `eslint ^9.39.4` + `typescript-eslint ^8.62.0` (declared directly, no transitive reliance), flat ESM config on typescript-eslint `configs.recommended` (non-type-aware), `no-explicit-any` off, `^_`-prefixed unused args/vars/caughtErrors ignored, src-only script `eslint "src/**/*.ts"`, ignores for `dist/`/`node_modules/`/`.worktrees/`/`tmp/`/`coverage/`/`.agentic/`. The approved plan selects `no-unused-vars` at **error**, rather than Noema-style warn + `--max-warnings 0`. The typecheck gate stays named typecheck (source-only, `tsconfig` excludes `tests/`); the lint gate runs the locally installed ESLint binary only, never `npx`; runtime `engines.node` stays `>=18.0.0`. The accepted development/lint Node range is exactly `^20.19.0 || ^22.13.0 || >=24` due to the transitive graph (minimum 20.19.0; Node 21/23 excluded), with direct lint versions unchanged. No broad cleanup of unrelated source.
8. **[PROPOSAL]** WS3: `npm audit` as the security gate — the **single explicitly permitted network query**, a read-only advisory lookup explicitly distinguished from prohibited remote *release* actions (no tag/push/publish anywhere); writable npm cache/log state redirected to a temp dir owned by the run; **audit unavailability fails closed** as reported incomplete verification (exit 1, "security: INCOMPLETE"), never skipped and never counted as passed; **high/critical vulnerabilities block** the release, overridable only by a separately approved exception recorded in the report. `--omit=dev` vs. full tree is a planner choice.
9. **[PROPOSAL]** WS3: hand-rolled standard Conventional Commits parser (subject + body footers, both `BREAKING CHANGE`/`BREAKING-CHANGE` spellings); no new dependency.
10. **[PROPOSAL]** WS3: changelog generation is mandatory-in-pipeline (registry requires generate **and** validate); grouped deterministic bullets; existing content appended-to only.
11. **[PROPOSAL]** WS3: candidate construction copies tracked working-tree files only; **`node_modules` is a candidate-owned byte copy, never a source symlink** (a symlink is not read-only isolation — writable tool state would flow through it into the user's tree); npm cache/log state redirects to temp; **no `npx` or any download fallback in any gate**; writable outputs inside the candidate are real candidate directories. Fixture tests assert the **source `node_modules` is preserved byte-for-byte** by the entire pipeline.
12. **[PROPOSAL — CLI contract change, justified]** Default mode is dry-run; `--apply` is required for any checkout write. Previous draft had prepare-default with opt-out dry-run. Justification: failure asymmetry — an accidental prepare mutates the checkout and demands manual rollback, an accidental dry-run costs time only. The escalation also recommends this as the safe default. Reversible at approval (a `--dry-run`/prepare-default spelling changes nothing else in the design).
13. **[PROPOSAL]** WS3: baseline = newest exact `release v?<current>` subject; none → fail closed requiring `--since`; chosen baseline always printed for human eyeballing.
14. **[PROPOSAL]** WS3: tests run once, in the candidate, pre-copy-back (the bump changes one string constant, re-verified by the invariants and post-apply verify).
15. **[PROPOSAL]** WS3: pre-apply **dist collision scan** — untracked/ignored files under the checkout's `dist/` (invisible to a clean `git status`) cause **refusal to apply** (exit 1, paths listed; dry-run reports the would-be refusal), rather than a merge/preserve policy; snapshot is a full byte copy of `dist/`; **post-apply verification is a full bidirectional byte comparison** of the four files and the entire `dist/` tree, whose failure — like any copy failure — **triggers rollback**. Refusal-over-merge chosen because a release tree containing files the release did not build is a false release state; veto-able at approval.

## Test Strategy

**WS1:** `plugin-template.test.ts`: all 8 `parseAgent(template).settings` have no `model` key; existing scope/version/dedup assertions unchanged. `init.test.ts`: init writes no `model` keys; `config.json` has no `models` section; existing `config.json` with legacy `models` loads and is byte-unchanged on re-init; wizard fixture asserts no model prompts. `global-policy.test.ts`: `initializeProjectAgents` never writes `model`; permission-masking kept; existing-local-models-survive kept. `watchdog-plugin-syntax.test.ts`: the two `writeOpencodeFiles` tests rewritten to write `generateAllTemplates(DEFAULT_CONFIG, <scope>).plugin` to a temp dir directly (on-disk assertions kept: watchdog present, scope stamp, `Symbol.for('kiki.plugin')`); the two `tsc --noEmit` tests already use templates directly and stay. `doctor.test.ts`: fresh install with zero configured models passes. New: `installGlobalFiles` output contains the `/kiki` hint. Regression test: `DEFAULT_MODELS|KikiModels|DEFAULT_ROUTING_TABLE|writeAgenticFiles|writeOpencodeFiles` no longer exported from `src/cli/config.ts`.

**WS2:** fixture skill trees in tmp dirs (stubbed `HOME`, `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`), including a **realistic nested package-cache fixture** (`packages/superpowers@git+https:/github.com/x/superpowers.git/node_modules/superpowers/skills/…`) and a symlinked/cyclic variant: all present → no warnings; missing → warning + exit 0; renamed frontmatter → name-drift warning; version equal/different/missing/malformed/prerelease → the corresponding observation lines; empty and unreadable roots handled; limitation info line present.

**WS3:**
- Pure units: bump inference from fixture commit lists (`!`, both footer spellings, scoped types, non-conventional subjects, `--bump` override, monotonicity); changelog generation determinism (same range ⇒ byte-identical) and validation; version-field sync transforms (fixture lockfiles, byte-diff assertions on exactly the two fields); baseline matching (exact current-version match, newest-match selection, none → fail closed).
- **Isolation tests (escalation-mandated):** in a fixture repo containing tracked + untracked + ignored files and a sentinel `.agentic/routing_log.jsonl`: dry-run leaves **every** checkout file byte-identical (hash before/after), including the sentinel and untracked/ignored files; **the fixture's source `node_modules` is byte-identical before/after the whole pipeline** (candidate-owned-copy invariant); no npm cache/log state written under the fixture's home; the candidate dir is removed afterwards; gates demonstrably ran (candidate-only artifacts observed during execution, e.g. via injected runner spies); the typecheck gate invokes the local tsc binary only and the lint gate the candidate's local ESLint binary only (injected missing-binary → fail closed, proving no `npx` fallback in either gate).
- Command tests on a fixture "kiki repo" (minimal package.json + `src/cli/config.ts` + CHANGELOG + real temp git repo with scripted conventional commits and a prior `release v0.1.0` subject): dry-run = preview + manual block, zero mutation; `--apply` = allowed file set exactly, full post-apply byte verification passes; **apply rollback**: injected mid-copy failure restores all four files byte-for-byte, restores the `dist/` tree byte-for-byte (recreates deleted, removes created), leaves untracked/ignored untouched, report names the backup dir; **ignored-in-dist sentinel fixture**: an ignored file placed under `dist/` causes pre-apply refusal (apply mode, exit 1, path listed) and a would-refuse report in dry-run; **post-apply verification failure fixture**: an injected post-apply tamper (mismatched byte) triggers rollback and exit 1, checkout restored; **audit unavailability fixture** (injected offline error) → exit 1 with "security: INCOMPLETE"; **high/critical vuln fixture** (injected audit result) → blocked, exit 1, no exception; guardrail failures (dirty tree in apply mode, empty `[Unreleased]` after generation, no release-worthy commits, no baseline without `--since`, outside a kiki repo) exit 1 with the right message; changelog generation appends without touching existing content.
- Runners (tsc/npm) injected in units; one opt-in real-tsc integration test (skip pattern mirroring `OPENCODE_TEST_BINARY`). Code-path assertion: release module's git usage is allowlisted to `log`, `ls-files`, `status` (read-only), enforced by a wrapper tested in units.

## Acceptance Criteria

**WS1**
1. No `src/` path seeds `model` values into agents or OpenCode settings; agent template frontmatter has no `model` key.
2. Wizard asks no model questions; init writes no `models` key; existing files with `models` load and survive untouched.
3. `kiki update` preserves existing user agent models and permissions.
4. `kiki install`/`kiki update` print the `/kiki` hint.
5. `DEFAULT_ROUTING_TABLE`, `writeAgenticFiles`, `writeOpencodeFiles`, `KikiModels`, `DEFAULT_MODELS` gone; coverage relocated/retired; public `src/index.ts` exports unchanged.
6. Doctor passes on a fresh install with no models configured anywhere.

**WS2**
7. Doctor scans all four roots (nested package-cache layout included), reports per-skill results, warns on missing/name-drift/version-observation; warnings never set the exit code; summary reports warnings separately.
8. Version reporting makes no compatibility claim in either direction; unknown/malformed/prerelease are warnings, not crashes; no floor constant exists.
9. Doctor states its presence-vs-registration/live-availability limitation and performs no writes anywhere.

**WS3**
10. Dry-run (default): candidate fully transformed, built, tested, typechecked, audited, invariant-checked — checkout byte-identical before/after **including the source `node_modules`**, no git mutation, no npm state written outside temp, preview + manual block printed.
11. `--apply`: validated candidate copied back with snapshot/rollback; **untracked/ignored files under `dist/` cause pre-apply refusal** (and a would-refuse dry-run report) rather than deletion; copy failures and post-apply **full bidirectional byte verification** failures both trigger byte-for-byte rollback of the four files and the entire `dist/` tree; untracked/ignored files outside the write set untouched.
12. Baseline: newest exact `release v?<current>` match; none → fail closed with explicit `--since` guidance; chosen baseline printed.
13. Semver inference: standard conventional parsing of subjects and bodies (`!`, `BREAKING CHANGE:`, `BREAKING-CHANGE:`); fails closed on nothing-release-worthy; monotonic.
14. Changelog: deterministic generation from the range when `[Unreleased]` is empty (never rewrites existing content) **and** validation (non-empty, placeholder-free, correctly renamed/dated, fresh `[Unreleased]` inserted) — both mandatory.
**Lint foundation**
15. devDeps `eslint ^9.39.4` + `typescript-eslint ^8.62.0` (declared directly), flat ESM config, src-only lint script per the Lint Foundation section; lockfile updated; the gate passes on `src/**` after only minimal required fixes; runtime `engines.node` unchanged at `>=18.0.0`; README documents the exact development/lint Node range `^20.19.0 || ^22.13.0 || >=24` (minimum 20.19.0; Node 21/23 excluded, not blanket `>=20.19.0`); direct lint versions unchanged by this amendment; no broad cleanup of unrelated source.

**WS3 (continued)**
16. The release gates are: typecheck (local `tsc` binary, source-only, named typecheck), **lint (locally installed ESLint binary from the candidate's copied `node_modules`, no `npx`/downloads, config and lockfile carried in the candidate)**, and security — `npm audit` against the candidate with npm state redirected to temp; **audit unavailability fails closed as reported incomplete verification; high/critical vulnerabilities block** absent a separately approved exception. No lint claims beyond `src/**`; no lint-success claims about tests.
17. No code path commits, tags, pushes, or publishes; no release run against the real repo occurs in this package.

**Package**
18. `npm test`, `npm run build`, generated-plugin `tsc` check, and the new lint gate green at each increment and at the end; historian updates README/CHANGELOG; registry untouched by implementers.

## Risks and Assumptions

- **OpenCode resolves a default model** when no `model` key is set — basis for the informational doctor check; if it ever hard-failed, fresh installs would surface it in OpenCode itself. Verified behaviorally in this repo (agents run with commented-out models).
- **Skill-root layout is convention, not contract**; the bounded walk plus warnings-only semantics degrades to noise, never breakage, if upstream changes it.
- **`npm audit` needs network** (the single explicitly permitted, read-only advisory query — distinct from prohibited remote release actions). **Unavailable audit fails closed**: exit 1 with "security: INCOMPLETE — npm audit unavailable (<reason>)"; it is never skipped or reported as passed. High/critical vulnerabilities block absent a separately approved exception.
- **Lockfile re-serialization:** parse/stringify (2-space) expected byte-stable except the two version fields; fixture tests assert the byte-diff scope; a human still reviews the final diff.
- **Candidate fidelity:** the candidate contains tracked working-tree files only; if a release depends on untracked files, that is by definition not a releasable state, and `--apply`'s clean-tree requirement catches it.
- **Removals are non-public** (not reachable via `package.json` `exports`): minor bump defensible; inference (`feat:` → minor) yields `2.3.0` when a real release is later authorized; `--bump major` exists if hygiene preferences differ.
- **Seeded-model legacy:** users seeded by ≤2.2.0 keep those values as user-owned settings (required by "preserve existing user models"); hint + README tell them `/kiki` owns models now.
- **Lint tooling provenance and version drift:** the ESLint/typescript-eslint versions and config shape are recorded from the consumed one-time Noema research (which must not be re-accessed). Exact availability and peer compatibility (`TS >=4.8.4 <6.1.0`, ESLint 8.57/9/10) are re-verified at implementation time against Kiki's TS 5.9.3 / ESM NodeNext; `typescript-eslint` is declared directly, never relied on transitively. The user accepted **development/lint Node `^20.19.0 || ^22.13.0 || >=24`** because the transitive graph requires more than the original direct-package-only floor. Minimum 20.19.0 does not include Node 21/23; do not replace the range with blanket `>=20.19.0`. Runtime `engines.node` stays `>=18.0.0` and direct lint versions stay unchanged; convergence would require a separate decision.

## File-Level Change Summary

- **WS1:** `src/cli/config.ts` (remove `KikiModels`, `DEFAULT_MODELS`, `models` field, `DEFAULT_ROUTING_TABLE`, `writeAgenticFiles`, `writeOpencodeFiles`, 8 frontmatter `model:` lines; `loadConfig` models-strip), `src/cli/commands/init.ts`, `src/cli/commands/install.ts`, `src/cli/opencode-config.ts`, `src/cli/commands/doctor.ts`, `src/cli/index.ts`. Tests: `init.test.ts`, `global-policy.test.ts`, `plugin-template.test.ts`, `watchdog-plugin-syntax.test.ts`, `doctor.test.ts`, `update.test.ts`.
- **WS2:** `src/cli/commands/doctor.ts` (warn level, `REQUIRED_SKILLS`, `TESTED_SUPERPOWERS_VERSION`, bounded discovery, checks, limitation note), new `tests/cli/doctor-skills.test.ts`.
- **Lint foundation:** `package.json` (devDeps `eslint ^9.39.4` + `typescript-eslint ^8.62.0`, new `lint` script), `package-lock.json` (updated), new flat ESM `eslint.config.*` (src-only scope, recommended rules, `no-explicit-any` off, `^_`-prefixed unused ignores, ignores for `dist/`/`node_modules/`/`.worktrees/`/`tmp/`/`coverage/`/`.agentic/`), minimal `src/**` fixes the rule set requires (no broad cleanup), README development-section note for the exact Node `^20.19.0 || ^22.13.0 || >=24` development/lint requirement. Runtime `engines.node` remains `>=18.0.0`; the docs-only amendment does not change direct lint versions or package files.
- **WS3:** new `src/cli/commands/release.ts` + pure helper module (e.g. `src/cli/release-lib.ts`: parsing, inference, changelog, version-sync transforms, candidate builder), `src/cli/index.ts` wiring; new tests (units, isolation tests, fixture-repo command tests, rollback tests).
- **Docs (historian, final pass):** README (models, doctor, release sections), CHANGELOG.

## Open Questions

None blocking. The user has approved the spec, plan and bounded development/lint Node-range amendment; no routine approval question remains. Historical proposals/defaults above are resolved by the approved plan: no superpowers support-version floor, explicit `--since` fallback, standard conventional parsing, dry-run default with explicit `--apply`. Separate authorization boundaries for commits and actual releases remain unchanged.

## Left to the Planner / Builder

TDD slicing within each increment; exact message wording; test file placement; helper-module split; fixture details (nested package-cache tree, cyclic symlinks, fixture git histories); `npm audit` variant; changelog bullet format details.
