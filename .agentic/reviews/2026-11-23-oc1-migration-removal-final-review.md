# Final Review: OC1/V1 Migration Removal (Round 2, owner-directed)

- **Verdict:** PASS_WITH_NOTES
- **Date:** 2026-11-23 · **Reviewer:** kiki-reviewer (round 2, scoped strictly to the OC1-removal delta)
- **Artifact:** working tree `/home/lutz/lprojekte/kiki` at HEAD `8c71efe7c147fa39b925627772ca28bfb681ffb5` + dirty. The tree also carries the round-1-passed permission-baseline-simplification work (`.agentic/reviews/2026-11-23-permission-baseline-simplification-final-review.md`); per scope, only the OC1-removal delta was reviewed — round-1-attributable hunks (`state.json`/ownership remnants, canonical-array assertions, `generateGlobalPermissions`/`generateSecretPolicies` emissions) were classified, not re-reviewed.
- **Compared against:** owner directive (verbatim): *„Ist die OC1 Migration immer noch im Code? Ich hatte schon lange gesagt, dass nur noch OC2 nötig ist!"* — no separate spec/plan exists for this round; the round-1 review's note 5 explicitly scheduled it as a separate owner-directed round. Alignment guardrails (`.agentic/kiki/alignment.json`), builder's registry evidence (`.agentic/kiki/TASK_REGISTRY.json` progress entry).

## Basis

Builder's greps independently reproduced; every claimed file delta read hunk-by-hunk (`index.ts`, `args.ts`, `doctor.ts`, `routing.ts`, `status.ts`, `config.ts` round-2 hunks; `global-policy.test.ts`, `oc2-isolation.test.ts`, `update.test.ts`); deleted-file line counts and symbol-consumer sweep checked against HEAD; dist verified by content grep, timestamps and a live `--help` smoke; focused 3-file/18-test set re-run locally (16 passed, 2 env-gated skips, exit 0); full native suite, build and lint judged as recorded with arithmetic reconciliation, not re-run. No commits (HEAD unchanged), no live config writes, no publishing.

### 1. Removal complete and clean — verified

- `grep -E 'oc2-migration|migrateOC1|migrateProject|parseMigrationArgs|oc1GlobalDirectory|kiki migrate|commands/migrate' -r src tests` → **0 matches**. Case-insensitive `migrat` in src → single hit `src/cli/config.ts:368`, which is the generic `NECESSITY_CRITERIA` coupling-cost vocabulary ("migration/removal path"), byte-identical to HEAD — not a command reference.
- `src/cli/index.ts`: migrate import, `case 'migrate'` dispatch, and help line all deleted (diff is exactly those three hunks). `args.ts`: `MigrationArgs` + `parseMigrationArgs` (34 lines) deleted; no orphan help/args remain — live `node dist/cli/index.js --help` shows no migrate entry and matches src help verbatim.
- No orphaned marker logic: `migration.json` → 0 references in src and dist. Consumer sweep of everything the deleted module imported (`assertNotOC1Config`, `projectPermissionRules`, `translatePermissions`, `splitSecretTail`, `assertOC2Target`, `hasOC1Markers`): every symbol retains live consumers; no dead exports.
- Fixture `tests/fixtures/oc1-permission-templates.json` kept with live consumer `tests/cli/oc2-permissions.test.ts:39` — correct keep.
- Repo-wide sweep: remaining `oc2-migration|kiki migrate|migrateOC1` references exist only in immutable history (docs/superpowers plans/specs, docs/migrations, review artifacts, eval case patches, registry log), git-ignored scratch (`tmp/`, `.superpowers/sdd/`), and the declared-pending README/CHANGELOG. No code, test, or build-input references.

### 2. No test weakened — verified

- `tests/integration/oc2-isolation.test.ts`: the two remaining tests are **byte-identical to HEAD** (diff contains only migration-block deletion + describe rename to 'synthetic OC1/OC2 root isolation'): the doctor credential-presence test with its read-attempt guard patch, and the four-OC1-root isolation test with per-scope snapshot comparisons and the non-vacuity check (`existsSync(fixture.config)`). Imports trimmed exactly (no dead, no missing — the file collects cleanly under vitest). The 4 removed tests exercised `migrateOC1` — deleted code; deleting them is sound, not a hidden failure.
- `tests/cli/global-policy.test.ts` (14→11 tests): the 3 removed tests were migration-only (`migrateProject` duplicates/malformed-input/invalid-permission). Mixed tests retain all reset coverage: broken-JSONC `resetProject` throws with the legacy file intact (`tests/cli/global-policy.test.ts:183-190`); help/missing-scope rejection with no writes before the explicit scoped command, reset cleanup (plugin removed, agent model undefined) at `:192-204`; reset backup count at `:96`; tier-clearing at `:205`. The plugin-removed assertion now follows `reset` directly — marginally **stronger** for reset than before.
- `tests/cli/update.test.ts`: expectation change `/migrate/` → `/unsupported argument/` exactly tracks the `args.ts:15` rewording; the behavioral core — rejection **before** any write (`existsSync(global)).toBe(false)`) — is retained (`tests/cli/update.test.ts:61-64`).
- Test-count arithmetic reconciles exactly: round-1 recorded 945 pass/2 skip/68 files → round-2 records 916/2/67. Removed: 22 tests in deleted `oc2-migration.test.ts` (counted at HEAD) + 4 migration tests in `oc2-isolation` + 3 migration-only in `global-policy` = 29; files 68−1=67; both env-gated skips constant and are precisely the two surviving `oc2-isolation` binary-gated tests.

### 3. Dist regenerated and consistent — verified

- All dist artifacts uniformly stamped 16:53, after the last src edit (16:52–16:53) — consistent with a from-scratch rebuild. `grep -i 'migrate|oc2-migration' -r dist/` → 0 matches (exit 1); no `oc2-migration.*`/`commands/migrate.*` anywhere; `dist/cli/commands/` has no migrate artifacts. Dist content matches the reworded src verbatim (`dist/cli/args.js:20`, `commands/doctor.js:152`, `commands/status.js:44`, `commands/routing.js:3`). Live CLI smoke confirms.

### 4. KISS — verified as pure deletion

11 tracked deleted files alone account for 2,767 deletions vs HEAD; every other round-2 hunk is a deletion or a one-line message rewording (args/doctor/routing/status/index/config). No new logic, no new exports, no new dependency (package files untouched), no flags, no abstractions. The only additions are literal advice strings pointing to manual `agents.<id>.model` configuration. Smallest-sufficient-change satisfied by construction.

### 5. Ruling 5 (kept boundary) — defensible, borderline flagged

- **Legacy singular-agent handling** (`src/cli/opencode-config.ts:462-464, 986-1015, 1079`): an in-place upgrade shim inside install/update — reads kiki's own legacy `agent/<name>.md` inside the OC2 config root as a permission-classification source, writes native `agents/<name>.md`, removes the singular file. It is **not** a cross-root OC1 import; without it, upgrades of existing installs would halt on `Duplicate local agent definitions` (`:989`) or keep conflicting stale files. It does handle OC1-format data (`translatePermissions` of `permission` maps), so a maximal reading of „nur noch OC2" could also demand its removal — **borderline, noted for the owner**; the implementer's choice to keep, disclose and flag rather than silently expand removal either way is the correct process, and this reviewer does not expand it either.
- **Legacy routing.json diagnostic** (`doctor.ts:150-152`, `status.ts:42`, `routing.ts:3-5`): detection + manual-removal advice only, no import. Clearly defensible — removing detection would leave a stale legacy file silently ignored.
- The retained OC1 references in src are all **enforcement of** "only OC2", not migration: `assertNotOC1Config`/`OC1_MARKER_FILES` (`src/cli/oc2-paths.ts:58-129`) refuse OC1-shaped territory before writes (the machinery the surviving isolation test verifies), `staleV1Files` (`opencode-config.ts:474-480`) removes stale V1 kiki artifacts, and `server/watchdog.ts:42` merely documents an intentionally absent OC1 surface.

### 6–8. Evidence honesty, inventory, no side effects — verified

- Focused 3 files/18 tests reproduced locally: 16 passed, 2 env-gated skips, exit 0. `git diff --check` reproduced clean. CLI smoke reproduced. Full suite/build/lint accepted as recorded with exact arithmetic reconciliation and the fresh, content-verified dist as build corroboration. Registry evidence matches the observed tree in every independently checkable detail; no dishonest reporting found.
- Untracked inventory (16 entries) identical to round-1's documented set (7 reviews, 2 plans, 1 spec, 5 new test files, `opencode.jsonc`); the user's `opencode.jsonc` untouched (mtime 15:50, before the round-2 window). No user files lost.
- No commits (HEAD still `8c71efe`), no live config writes (only sanctioned registry append at 17:01), no publishing.

### Alignment

Guardrails: no secrets in the delta (deletions and placeholder-free advice strings), no database queries, no API stack traces. OWASP/SOC 2 treated as context only; no certification claim anywhere in the delta.

## Notes (non-blocking)

1. **Ruling-5 borderline for the owner:** the install-time singular-agent conversion (`agent/*.md` → `agents/*.md`, incl. OC1-style `permission` translation) and the routing.json diagnostics are kept as outside the migrate-command scope. Defensible as in-place self-upgrade/detection-only machinery, but if the owner's „nur noch OC2" is intended maximally, a small follow-up owner-directed round could remove the singular-agent shim too (it currently has one test: `tests/cli/global-policy.test.ts:71-97`). No action demanded here.
2. **Stale comment word:** `tests/cli/permission-consolidation.test.ts:203-204` — "stays for migration/project consumers" (authored round 1); migration consumers are now gone, project/install consumers remain (`splitSecretTail` used by `installGlobalFiles`, `opencode-config.ts:1064`). Cosmetic.
3. **Pending historian work (expected, by design):** README (`:640-665` "Migrate from OC1 once"), CHANGELOG and the docs/migrations API contract still document `kiki migrate`; removal there is the already-scheduled historian round after this verdict, intentionally outside this review's and the implementer's scope. Historical plans/specs/reviews keep their references as immutable records.
4. **Full-suite/build/lint accepted as recorded**, spot-corroborated (focused 18 tests re-run, dist content/timestamps verified, arithmetic reconciliation exact); the −3157 net-line stat is the builder's in-session arithmetic against the never-committed round-1 state and is corroborated in direction and magnitude (−2,767 from tracked deleted files vs HEAD alone), though not byte-exactly reproducible — immaterial to the verdict.

## Conclusion

The owner-directed removal is complete, clean and minimal: the OC1 migration command, its implementation, its tests and its built artifacts are gone with zero residue in code, tests, help, args or dist; nothing survivable was weakened — the surviving tests are byte-identical or marginally stronger; the two disclosed boundary keeps are defensible enforcement/upgrade machinery with the borderline flagged for the owner rather than silently resolved. Net deletion honors KISS. No blocking findings.
