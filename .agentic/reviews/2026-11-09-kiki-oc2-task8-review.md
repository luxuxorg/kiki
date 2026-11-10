# Task 8 review — install/update/project lifecycle and OC2 diagnostics

Date: 2026-11-09
Reviewer: `kiki-reviewer`
Inputs: `/tmp/opencode/kiki-oc2-task8-report.md`, `/tmp/opencode/kiki-oc2-task8.diff` (17 files, +1508/−1019), plan `docs/superpowers/plans/2026-11-09-kiki-opencode2-migration-plan.md` (Task 8, Global Constraints), spec `docs/superpowers/specs/2026-11-09-kiki-opencode2-migration-design.md`, contract `docs/migrations/kiki-3-oc2-api-contract.md` §5–§8.

## Verdict: PASS

## What was reviewed

Read the full task-owned diff (not only the summary): new `src/cli/oc2-registration.ts` + test, and modifications to `oc2-paths.ts`, `opencode-config.ts`, `doctor-skills.ts`, `commands/{doctor,status,routing}.ts`, `index.ts` and the eight CLI test files. Compared against plan Task 8 acceptance items (plan lines 222–240) and Global Constraints (lines 13–26).

## Independently verified evidence

- `npm run lint` → exit 0 (re-run by reviewer).
- `npm audit` → 0 high, 0 critical, 32 moderate; matches the referenced unchanged Task 7 graph. Task 8 diff touches no `package.json`/`package-lock.json`, so no fresh audit was required.
- Focused suites re-run by reviewer: `npx --no-install vitest run tests/cli/{oc2-registration,install,update,tui-install,doctor,status,routing,global-policy,init,doctor-skills}.test.ts` → **10 files passed, 110/110 tests passed**.
- `npx --no-install tsc --noEmit` → exit 2 with exactly 15 diagnostics, all in `src/tui/{index,model-menu}.ts`; zero backend/CLI/test errors — exactly the Task 2/7 interim deferral owned by Task 10.
- `git status --porcelain`: no `dist` emission, no commit/tag/push, no registry edit; pre-existing Task 2–7 dirty files and frozen V1 evidence preserved.

## Checklist findings

- **Preflight validation before writes**: `installGlobalFiles` guards (`assertNotOC1Config`), then parses/validates every global tier (`readSettings`) and both registration targets (`readConfig`, plugin-entry validation) before the first `writeAtomic`/`unlinkSync`. `prepareRegistration` throws on duplicate/conflicting/malformed configs with nothing written (test-confirmed). `resetProject` validates all tiers and computes all patches before backup/write. PASS.
- **Permission-absence preservation**: `nativeAgentContent` deletes `model` from frontmatter, and deletes baseline `permissions` when an existing definition deliberately omits both `permissions` and legacy `permission` — no baseline regrants; legacy `permission` maps are translated fail-closed (`translatePermissions`, duplicate native+legacy refused). No top-level `permissions` writes anywhere; tests assert `config(global).permissions` stays undefined. PASS.
- **Guard boundary**: `allowKnownV1Artifacts` only suppresses the marker failure when the target does **not** overlap the machine default; overlap-with-markers and `hasConfigFile` refusals are unchanged. Default (no-option) callers keep the old strict behavior, so Task 5/3 migration guards are unaffected. PASS.
- **Backup/rollback metadata**: backups 0700 dir / 0600 files+manifest, `.gitignore` 0600; only changed/existing files backed up; `writeAtomic` preserves existing modes or 0600 for new. No provider/config values printed in messages (names/paths only). PASS.
- **Fail-closed doctor**: root-guard failure prints the metadata failure and returns **before** `readOpenCodeSettings`/any config parse (credential-bearing default config never parsed); credentials checked with `existsSync` only — the directory-at-`auth.json` fixture proves no read. PASS.
- **Registration ownership**: `prepareRegistration` appends at array tail (JSONC comments inside entries preserved), refuses duplicates/conflicts, idempotent (second planning yields `files: []`); `removeKikiRegistration` strips only Kiki entries, backs up first, second removal is a no-op, unrelated entries/tuples/comments survive. Dev/release spec forms match contract §7 (`currentPackageSpec`: absolute checkout dir vs package name under `node_modules`). PASS.
- **Stale V1 cleanup, Kiki-owned only**: removals limited to `kiki/tui.js`, `kiki/prompts/*`, `plugin(s)/kiki.ts(js)`, singular legacy `agent/<name>.md` — all backed up first; unrelated files untouched. PASS.
- **Reset ancestor safety**: only project + `.opencode` tiers patched; ancestor `opencode.json` verified untouched by test. Native and legacy (`agent`/`agents`) Kiki keys cleared, unrelated agents/theme/task data retained. PASS.
- **Skill roots**: V1 package cache (`<cache>/opencode/packages/...`) no longer scanned or treated as live evidence; URL-cache entries use `<cache>/skills/...` with `SKILL.md` or `<name>.md`; explicit config `skills` paths (local/`~`/absolute) scanned with `packageRootFor` gating version observation. No phantom V1 cache skills. PASS.
- **Honest diagnostics**: exact observed version (test seam `observeVersion`, default runs real `opencode --version`), mismatch/absence reported as warnings, root/env disagreement diagnosed, duplicate server sources and missing `cli.json` fatal, disk-only caveat printed once, status shape preserved, routing copy names `agents.<id>.model`. PASS.
- **Tests not weakened**: previously-red lifecycle suites are green on the new native layout with new failure-path fixtures (malformed tiers, guard refusal, duplicates, mode mismatch, ancestor safety, credential directory). Removed doctor-skills cases (see observations 1–2) all exercised the **unchanged** `parseVersion`/SemVer code and the deleted V1 cache traversal; no failure path of changed code is hidden.
- **Parallelization/scope**: Task 8 is sequential (`depends_on: 4,5,7` — all released); no `src/tui/*` or GUI files touched; GUI remains deferred to Tasks 9/10; full-suite claim (`565 passed | 36 skipped`, only the release suite's interim tsc at setup) is consistent with the reviewer's focused + typecheck evidence.

## Blockers

None.

## Deferred observations (non-blocking)

1. `nativeAgentContent` always rewrites an existing native agent file's markdown body to the current template + project-config pointer on install/update (frontmatter settings/models/permissions are preserved). A user-customized prompt body is replaced, though the prior file is backed up first. This matches the V1 "refresh prompts" semantics and the plan's emphasis on permissions/model preservation, but Task 11/13 may want to confirm that body replacement is the intended ownership boundary for user-edited native agent files.
2. `tests/cli/doctor-skills.test.ts` drops the source-text assertion for the full-consumption version validator (`matchesEntire`) and the trailing-terminator SemVer matrix. The implementation of `parseVersion` is unchanged in this diff, so no regression path is hidden, but the meta-guard against future loosening of full-consumption matching is gone; consider re-pinning it in Task 11's acceptance.
3. `doctor` no longer reports a legacy Kiki `models` section (old `reportLegacyModels`) informationally. The section was already inert, so this is a diagnostic reduction, not a behavior hole.
4. Legacy `tui.json`/`tui.jsonc` files are neither removed by update nor diagnosed by doctor (a leftover file is silently accepted since no loader references it). Harmless, but a one-line "stale V1 TUI config" observation could be added.
5. `isKikiPluginEntry` classifies any plugin spec whose basename is `kiki.ts`/`kiki.js`/`kiki@*` as Kiki for removal/duplicate diagnostics. A user's unrelated plugin at such a path would be misclassified; conservative direction (refusal/removal limited to Kiki-named specs) and low practical risk.

## Boundary confirmation

No source fix, registry edit, `dist` build, live/default/global-config edit, credential read, install, commit, tag or push was performed by this review. All verification used the project's allowlisted read/test commands on synthetic `mkdtemp` fixtures only.