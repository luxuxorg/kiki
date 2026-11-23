# Final Review: OC1 Legacy Residue Removal (Round 3, owner-directed)

- **Verdict:** PASS_WITH_NOTES
- **Date:** 2026-11-23 · **Reviewer:** kiki-reviewer (first and only review round, scoped strictly to the round-3 removal delta)
- **Artifact:** working tree `/home/lutz/lprojekte/kiki` at HEAD `8c71efe` + dirty. The dirty tree carries the already-reviewed reconciliation, baseline-simplification and migrate-removal rounds; per scope only the round-3 (`oc1-legacy-residue-removal`) delta was reviewed — earlier-round hunks (`permission-ownership`/state machinery, managed fragments/lean baseline, migrate command) were re-attributed, not re-reviewed.
- **Compared against:** owner premise (verbatim): *„Nein, die sollte auch raus. Es gibt aktuell keine OC1 Installationen mehr und es wird auch keine mehr geben."* — all OC1-era residue goes; task surface as dispatched; `.agentic/kiki/alignment.json` guardrails; builder's registry evidence (`.agentic/kiki/TASK_REGISTRY.json` progress entry); prior review artifacts, esp. `.agentic/reviews/2026-11-23-oc1-migration-removal-final-review.md` (whose note 1 scheduled exactly this round).

## Basis

Every claimed removal item was located in the actual diff and read hunk-by-hunk; round attribution done against the three prior reviews' documented file/hunk maps. Residue greps independently reproduced (`oc1|OC1`, `routing.json`, `routing-table|RoutingTable|loadRouting`, `migration.json`, `translatePermissions|KNOWN_ACTIONS|ACTION_ALIASES|validateLegacy*|hasOC1Markers|assertNotOC1Config|OC1_MARKER|singularAgent|staleV1Files|kiki/tui.js|kiki/prompts` across src/tests/dist: 0 functional hits). Deleted files' HEAD contents checked against surviving consumers. Test removal arithmetic reconciled case-by-case and exactly (−32). Spot-verified locally without re-running the 6-minute suite: 9 round-3-affected test files re-run (106 passed; oc2-isolation's 2 tests reproduce as the exact 2 env-gated skips), `npm run lint` exit 0, `git diff --check` clean, `kiki --help`/`kiki routing` (exit 1) and an isolated-temp-root CLI smoke (install/status/update/init/permissions exit 0; no writes to default XDG locations), dist↔src file correspondence exact, dist timestamps uniform (140 files @17:31 > last src edit 17:23), untracked inventory reproduced (17 entries). Full-suite/build/audit claims judged as recorded with corroboration per the evidence-reuse rule (package files untouched). No commits (HEAD `8c71efe` unchanged), no live config writes (user `opencode.jsonc` mtime 15:50, pre-round), no publishing.

### 1. Removal surface — complete and clean (verified)

- **Singular-agent shim** (`src/cli/opencode-config.ts`): `singularAgentFile`, `AgentFileState.singularFile`, `collectAgentSources` singular fallback/duplicate check, `nativeAgentContent`'s duplicate native/legacy check, `duplicateConfigKeys`'s `'agent'` section, and the install-time singular removals are all gone; `resetProject` now resets only `agents` + `.opencode/agents/*.md`.
- **V1 permission-map translation** (`src/cli/oc2-permissions.ts`): `translatePermissions`/`translateValue`/`canonical`/`KNOWN_ACTIONS`/`ACTION_ALIASES`/`EFFECTS` (80 lines) deleted; zero consumers remain.
- **Legacy validation/reads**: `validateLegacyPermissions`/`validateLegacyAgent` and the `readSettings` `data.agent` block deleted; doctor's `legacyAgents` merge deleted; `parseAgent`'s `settings.permission` shape check and the defensive `delete settings.permission` strips remain as disclosed keeps.
- **V1 artifact cleanup**: `pluginFiles`/`promptFiles`/`staleV1Files`/`removeStaleDirectory` deleted; `installGlobalFiles` has no `removals` array and no `kiki/prompts` dir cleanup.
- **OC1 marker guard**: `OC1_MARKER_FILES`/`hasOC1Markers`/`OC1GuardOptions`/`assertNotOC1Config` deleted from `oc2-paths.ts`; every call site gone (`opencode-config.ts` install/init/reset/assertContextTargets, `oc2-registration.ts` `guard()`, `doctor.ts`, `tui/index.ts`); `assertOC2Target(roots)` retains the **root-overlap validation** with its full test coverage (direct + nested + symlinked-parent canonicalization).
- **Legacy routing.json detection**: removed from `status.ts` and `doctor.ts`; the `kiki routing` command, its dispatch/help entries, `src/core/routing-table.ts` and all six public exports (`loadRoutingTable`, `saveRoutingTable`, `lookupAgentModel`, `mergeRoutingTables`, `setRoutingPath`, `ROUTING_PATH`, type `StaticRoutingTable`) removed from `src/index.ts`/`src/types.ts`; no in-repo consumer remains (grep 0 across src/tests); `kiki routing` now prints usage with **exit 1** (reproduced).
- **V1 project config fallback** (`.agentic/config.json`): removed from `loadConfig` (`config.ts`), `stats.ts:534`, `doctor.ts:150`; `PROJECT_CONFIG_POINTER` dropped the "not routing.json" clause; watchdog OC1 comment removed.
- **Tests deleted**: `routing.test.ts` (1), `core/routing-table.test.ts` (10), `fixtures/oc1-permission-templates.json` (with `customConfig` inlined byte-faithfully into `oc2-permissions.test.ts`). Remaining `routing.json` mentions in tests are absence guards (see note 4).

### 2. No weakened remaining tests — verified

- **`oc2-isolation.test.ts` rewrite is real, not a hollow rename.** The XDG-default-location test plants a sentinel per default root, snapshots each tree (path+sha256+mode+size via `snapshotTree`), runs `kiki install` plus a real OC2 `run` under the fixture's XDG/`OPENCODE_CONFIG_DIR` overrides, asserts exit 0 + expected model output, then requires all four default trees byte/mode-identical. Non-vacuity: any misdirected write changes a digest; a no-op run fails the status/output assertions; `existsSync(fixture.config)` proves activity happened in the overridden roots. The credential-presence test keeps its fs-patch read-attempt trap and digest check.
- **Inlined `customConfig` is byte-identical** to the fixture's object (projectName/commands/all 12 path keys/all 7 health keys), and the prompt-render test it served still runs **both** `default` and `custom` variants with the same orchestrator/skill-loading assertions. The deleted tests (`translatePermissions` unit matrix, `template_rule_matrix`) exercised only deleted code.
- All other round-3 test adjustments keep original behavioral intent: doctor's duplicate-plugin-source test **kept** (the retained `autoDiscoveredKikiPlugins` diagnostic); reset test retains preservation/backup-count assertions and adds an explicit agents-md removal check; model-settings keeps overlap refusal with the no-file-change guard; oc2-paths keeps resolution/canonicalization/overlap/isolation coverage including the symlinked-ancestor path.

### 3. Kept items genuinely non-OC1 — verified

- `LEGACY_PERMISSION_BLOCK_PROMPT` is Kiki-3's own previous generated consent line (round-1 prompt-upgrade mechanism; `config.ts:254`), unrelated to OC1.
- "Legacy-baseline-mirror" (`permission-requests.ts:285`) is Kiki-3's own pinned-baseline vocabulary, current behavior.
- `resolveOC2Roots`/`canonicalPath`/`pathsOverlap`/`assertOC2Target` overlap validation: current OC2 functionality with retained tests.
- `autoDiscoveredKikiPlugins`: read-only diagnostics for files the **current OC2 platform auto-loads** (`plugin|plugins/kiki.ts|kiki.js`) — doctor's duplicate-source fail and status's installed-check; the doctor test exercising it is kept. Not inert OC1 detection (unlike routing.json). Wording nit in note 1.
- Defensive `delete settings.permission` strips: byte hygiene in markdown rewrite; cannot resurrect behavior.

### 4. Dist consistent — verified

Uniform rebuild (all 140 dist files 17:31, after last src edit 17:23); `dist/core/` gone; no `routing|migrate|oc2-migration|permission-ownership` artifacts; 0 `oc1|OC1` hits and no routing-table/routing-command content in dist; dist↔src file set exactly corresponds; `dist/index.js` is now type-only (`export {}`) matching `src/index.ts`; CLI smoke executes the new code.

### 5. Breaking-export removal — legitimate under the premise

The package's `.` export entry publicly exposed the routing-table surface; removing it is a **breaking change for external consumers** (registry discloses this honestly). Under the owner premise — no OC1 installations exist or ever will — the API existed solely for the OC1 routing.json concept and has zero in-repo consumers (verified 0 references). Removal is the KISS-correct choice; keeping dead public API would contradict the round's purpose. Version remains 3.1.1 (publishing is owner-run; version decision is the owner's/historian's) — see note 3.

### 6. Builder evidence — honest and corroborated

Test-count arithmetic **exactly reproduced**: 916 − (1 routing + 10 routing-table + 6 translation + 1 singular-agent + 2 doctor + 7 oc2-paths + 2 install + 1 types + 1 init.each case + 1 legacy-config-fallback) = 916 − 32 = 884. Spot-runs green (9 affected files, 106 passed; the 2 env-gated skips are precisely oc2-isolation's binary-gated tests, reproduced as skipped). Lint exit 0 reproduced (also corroborates no dead imports). `git diff --check` clean reproduced. Audit claim accepted via evidence reuse: `package.json`/`package-lock.json` byte-identical to the previously recorded 32-moderate/0-high state. Untracked inventory (17) reproduced exactly. No dishonest reporting found; my one divergent smoke result (doctor exit 1) traced to pre-existing repo facts (see note 5), not the delta.

### 7. Accepted prior work and docs — not damaged

README/CHANGELOG/API-contract mtimes (17:13–17:14) predate the round-3 window (17:20–17:31): this round did not touch them; their diffs are the prior historian rounds' accepted work. Remaining routing/migrate/routing.json/migration.json references in docs are the **expected stale** set scheduled for the historian touch-up (README ~:323/:674/:879, CHANGELOG ~:118-120 + immutable historical entries, API-contract :316) — not failed on, per the accepted sequencing. The round-2 stale comment (`permission-consolidation.test.ts` "migration/project consumers") was reworded to "install/project consumers" — prior note resolved.

### 8. No side effects — verified

HEAD unchanged (`8c71efe`), no commits/stashes, no live config writes (smoke under `mkdtemp` roots only; default XDG locations untouched — verified), user's root `opencode.jsonc` untouched (mtime 15:50), no publishing, only the sanctioned registry append.

### Alignment

No hardcoded secrets in added lines (placeholder sentinels only), no database queries, no API stack traces (removed OC1 guard's old no-echo property is moot; retained error messages are one-liners). OWASP/SOC 2 treated as context only — no certification claim in the delta.

## Notes (non-blocking)

1. **`autoDiscoveredKikiPlugins` docstring** (`src/cli/oc2-registration.ts:147-150`) still labels the detected files "Auto-discovered **V1** source files". The keep is legitimate (current OC2 auto-loads these paths; doctor's duplicate-source test at `tests/cli/doctor.test.ts:173-186` depends on it), but the wording could drop the V1 label in a future doc pass. Cosmetic.
2. **Last legacy-permission trace:** `parseAgent` (`src/cli/opencode-config.ts:395`) still shape-validates a legacy `permission` map alongside the kept defensive deletes; and the `describe('ordered native permission translation')` title in `oc2-permissions.test.ts:221` outlives the deleted translation. Both fail closed / cosmetic only; a maximal-residue future pass could tidy them.
3. **Semver implication:** removing the public routing-table surface is breaking for any external consumer of `kiki`'s `.` export (package `main` still `dist/index.js`, now type-only). Registry discloses it; CHANGELOG's current "breaking" entry covers `kiki migrate` only — the historian touch-up should record the routing API removal as breaking too (and the owner may wish a major version when they next publish).
4. **Retained negative guards:** two routing.json absence assertions (`tests/cli/init.test.ts:20`, `tests/cli/model-settings.test.ts:187`) and the legacy-config-path negative test (`tests/plugin/usage-diagnostics.test.ts:512-527`) are unchanged-from-HEAD canaries asserting Kiki never writes/reads the OC1 paths — they now actively enforce the owner premise; keeping them is sound.
5. **Doctor smoke divergence explained:** my `kiki doctor` run against the repo working dir exits 1 because this repo's own `.agentic/kiki/config.json` lacks `projectName` and `docs/DECISIONS.md` is absent — pre-existing repo facts. Doctor ran fully with correct new output (roots check intact, no OC1 language); the builder's isolated-root claim is consistent with an initialized temp project and no delta-caused failure exists.
6. **Full native suite (884 pass / 2 env-gated skips / exit 0) and build accepted as recorded**, spot-corroborated (9 affected files re-run green, exact −32 arithmetic, uniform fresh dist, lint/diff-check/help/routing smokes reproduced); npm audit accepted via proven-irrelevant delta (dependency files untouched). Registry prose "12 other test files adjusted" is a counting nuance (my attribution: 10 adjusted + 1 helper comment + 3 deleted); every hunk was verified individually regardless.

## Conclusion

The owner-directed residue removal is complete and clean: every OC1-era mechanism in the claimed surface is verifiably gone from src, tests and dist, with zero residue by independent grep; what remains is current-platform functionality with retained, real coverage; the two critical rewrites (XDG-default isolation test, inlined customConfig) are genuine and non-vacuous, not hollow renames; the breaking-export removal is the correct consequence of the owner premise with no remaining in-repo consumers, honestly disclosed; the −32 suite arithmetic reconciles exactly and the builder's evidence is corroborated in every independently checkable detail. Pure deletion honors KISS; no commits, live writes or publishing. No blocking findings.
