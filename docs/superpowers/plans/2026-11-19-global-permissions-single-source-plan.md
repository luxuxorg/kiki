# Global Single-Source Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. One builder executes the four sequential tasks after architect review, then one whole-change review; no redundant per-task reviews or repeated user approvals. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Converge Kiki permissions into one global baseline while preserving models and allowing only safe project file/folder additions.

**Architecture:** Keep `src/cli/config.ts` builders authoritative; persist baseline arrays only at global `agents.<name>.permissions`. Markdown is permission-free, init is metadata-only, migration extracts genuine additions. Runtime protection against arbitrary project edits is not supplied by these persistence changes.

**Tech Stack:** TypeScript, Vitest, existing `jsonc-parser`/`yaml`, existing OC2 isolated-binary harness; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-19-global-permissions-single-source-design.md` (original approval plus explicit additive-only clarification).

**Status:** Implemented, reviewed and batch rollout completed 2026-11-20. Global and project cleanup verified with 223 assertions and 113 live permission decisions; no runtime hook, commits or publishing. Backup/evidence: `/tmp/opencode/kiki-permission-rollout-20261120-nD9g27/`. Review history and detailed outcomes remain in the task registry and referenced review reports.

**Approved review correction:** after `.agentic/reviews/2026-11-20-global-permissions-single-source-code-review.md`, user approved the corrected spec invariant (“Ja, OK. So umsetzen.”). Independent architect review of this revision is required before the original builder's one bounded fix round; final code re-review still precedes LIVE. Do not restart completed Tasks 1–4.

## Global Constraints

- “no new CLI command; no OpenCode changes; no commits in this phase.”
- “No model edits, no unrelated key edits, no broadening.”
- Baseline only in global config; no `permissions` or legacy `permission` in emitted/installed markdown.
- Project permission changes are additive file/folder grants only, never shell/alternate-tool grants or protected-policy relaxation; models are independent.
- Seven specialists have exactly the three explicit read-only Git grants; orchestrator has none. This means explicit grants, not denial of commands otherwise covered by existing `shell *` allow.
- Preserve both `.worktree/**` and `.worktrees/**`, 18 publishing asks, 5 force-push denies, all role restrictions, and the final 7 secret-edit denies for all 8 roles.
- Preserve all existing dirty/untracked state, including the legacy-comparison scoping filter in `tests/cli/oc2-permissions.test.ts`; do not revert models or edit real project configs during code work.
- Never hardcode secrets; parameterize every database query; never expose internal stack traces in API responses. This change needs no database/API implementation.
- No commits, pushes, publishing, dependency/package-directory cleanup, installation, or environment-based redirects of live operations. Bounded LIVE update/cleanup is user-authorized only after the checks below.

## Resolved boundary and bounded implementation

Evidence:
- `src/cli/oc2-permissions.ts:96-130` keys locals by literal action/resource, then appends every inherited mask. It copies baseline policy into projects and can append `edit *` deny after a new `scripts/**` allow, defeating the intended addition. Existing tests (`tests/cli/oc2-permissions.test.ts:688-713`) do not prove arbitrary glob safety.
- Distinct keys overlap: `edit scripts/** allow` matches `scripts/.env`; `edit src/special.ts allow` crosses the planner/reviewer's explicit `src/** deny`. Rejecting every intersection with `edit * deny` instead rejects all useful new edit rights.
- Native rules use last match, not deny-always semantics; wildcards `*`/`?` have no subtraction operator. See https://opencode.ai/docs/permissions (Matching, Agents); config precedence: https://opencode.ai/docs/config (Locations). These are documentation evidence, not validation of the installed binary.
- Historical source record `docs/superpowers/specs/2026-11-09-kiki-opencode2-migration-design.md:105-114` records config permissions appended after markdown and config transforms after user plugins.
- Installed SDK `node_modules/@opencode/plugin/dist/promise/permission.d.ts:7-21` exposes `PermissionEvaluation { agent?, action, resources, effect, message? }` and `permission.hook("evaluate", ...)`. Existing `src/server/index.ts:130-241` starts logging/watchdog/diagnostics, not enforcement; `watchdog-events.ts` observes approval events, not synchronous permission evaluation.

**User decision recorded:** validate Kiki-generated/config-written additions only; no runtime hook, no generic policy engine. Arbitrary manual edits outside Kiki are not policed and native overrides remain possible. This resolves the user-decision FAIL in `.agentic/reviews/2026-11-20-global-permissions-single-source-plan-review.md`; do not request another boundary decision.

Correct the existing helper, not OpenCode: support normalized literal file paths and a literal directory prefix with terminal `/**`; reject arbitrary action globs, embedded `?`/`*`, traversal/normalization ambiguities and unsupported aliases unless an exact inventoried historical form is recognized. Recognize Noema's `**/tmp/opencode/**` only as that bounded historical form, not general wildcard syntax.

Distinguish broad `edit *` fallback from explicit protected scopes. Reject additions crossing explicit role boundaries; match normalized path segments/prefixes, including absolute paths and both worktree spellings. For accepted directory grants, append only relevant protected file deny/ask masks (secret descendants included), preserving their effective order; never append the broad fallback, inherited grants, shell rules or a full baseline mirror. These minimal safety masks constrain the addition, are not project-customizable grants, and must be recognized on rerun. Do not claim masks stop later manual overrides.

Tradeoff: pure allow-only directory rules cannot exclude future secret descendants under native last-match semantics. A small file-protection suffix reuses the existing helper mechanism without copying a whole baseline or adding a runtime engine; bounded supported forms keep overlap checks auditable. Unknown forms or conflicting customs stop/report rather than widen or drop them.

## File map and necessity

- `src/cli/config.ts`: existing builders; export canonical arrays independently of markdown rendering.
- `src/cli/permission-consolidation.ts` (new): pure historical ownership classification and ordered dedup/reporting shared by installer/migration; not a second evaluator/runtime policy engine.
- `src/cli/opencode-config.ts`: JSONC patching, global transaction, prompt stripping/preservation, init validation; retain reset behavior.
- `src/cli/oc2-migration.ts`: integrate classifier with existing V1 translation and rollback; stop baseline mirroring.
- `tests/fixtures/oc1-permission-templates.json`: existing immutable V1 provenance; reuse without rewriting to fit output.
- `tests/fixtures/kiki-permission-history.json` (new): small secret-free catalog of additional evidenced generated shapes, with role/revision/provenance; no runtime `/tmp` reads.
- Focused tests below own fixture assertions; `tests/integration/oc2-single-source.test.ts` (new) owns real-binary acceptance.

Tradeoffs: retain JSONC patch/atomic-write/backup tooling rather than add a persistence format or transaction framework (spec §§4/6). Tracked history fixtures necessarily couple recognition to releases, but avoid dropping customs or retaining obsolete generated denies (review §Basis, note 3). Extend the catalog when retiring generated rules; unknown rules stay custom and appear verbatim. Exact historical sequence/context, not isolated tuple membership, establishes ownership; catalog collisions without provenance halt.

The production historical catalog lives as constants in `permission-consolidation.ts`, compiled into `dist`; tracked JSON fixtures pin those values in tests. Do not make packaged runtime depend on `tests/` (package ships only `dist/`, `package.json:19-21`) or ephemeral backups.

## Review Focus

1. Generated-looking user rules and incomplete historical arrays: ambiguous ownership halts before writes (Task 1).
2. Broad directory additions containing future secret files or role-protected descendants: emitted safety masks protect secrets; explicit role-boundary crossings/ambiguous forms are rejected (Tasks 3–4).
3. Two global config files plus prepared registration text: no stale write may erase newly persisted arrays (Task 2).
4. Failure after config verification or halfway through markdown stripping: rollback or recover without policy loss, preserve bytes/modes (Tasks 2–4).
5. User prompt tweaks, CRLF frontmatter, duplicate YAML keys and comments inside custom JSONC rules: preserve or halt, never silently normalize ambiguity away (Tasks 1–2).

---

### Task 1: Separate canonical rules and conservatively classify ownership

**Metadata:**
- risk: high
- parallel: false
- depends_on: []

**Files:** Modify `src/cli/config.ts`, `src/cli/opencode-config.ts` (`baselineAgents`), `tests/cli/oc2-permissions.test.ts`; create `src/cli/permission-consolidation.ts`, `tests/cli/permission-consolidation.test.ts`, `tests/fixtures/kiki-permission-history.json`. Extend `tests/cli/config-readonly-git.test.ts`, `tests/cli/config-worktrees.test.ts`, `tests/cli/config-scrt-edit.test.ts` where needed.

**Interfaces:**
- Export `generateAgentPermissions(config: KikiConfig = DEFAULT_CONFIG): Record<string, PermissionRule[]>` from `config.ts`; use type-only `PermissionRule` imports to avoid runtime cycles.
- Keep `baselineAgents(config?: KikiConfig)`'s existing return shape for consumers, attaching canonical arrays internally; all `generate*Template(config)` markdown outputs omit permission keys.
- New module exports `PermissionSource = { file: string; rules: PermissionRule[] }`, `ClassifiedRule = { file: string; rule: PermissionRule; kind: 'generated' | 'custom' | 'ambiguous' }`, `Classification = { entries: ClassifiedRule[]; customs: PermissionRule[]; blockers: string[] }`.
- Export `classifyPermissionSources(agent: string, baseline: PermissionRule[], sources: PermissionSource[]): Classification`; pure, no writes. Source order: discovered config file order, then the single existing role markdown; exact tuple dedup keeps first custom occurrence.

- [ ] **1. Write failing tests:** `canonical_rules_without_markdown_permissions`, `unknown_and_partial_shapes_are_custom_or_blocked`, `historical_sequence_not_tuple_membership`, `stable_crash_recovery_custom_dedup`, `custom_deny_and_conflicting_tail_halt`. Assert unknown deny appears verbatim and blocks; no source changes.
  Core assertions: `expect(parseAgent(generatePlannerTemplate(DEFAULT_CONFIG), 'planner').settings).not.toHaveProperty('permissions')`; also assert absence of `permission`, `expect(generateAgentPermissions()['kiki-planner']).toEqual(baselineAgents()['kiki-planner'].settings.permissions)`, and exact three Git rules/last seven edit denies against existing pinned constants.
- [ ] **2. Run RED:** `npx vitest run tests/cli/permission-consolidation.test.ts tests/cli/oc2-permissions.test.ts`; expect missing export/old markdown-layout failures.
- [ ] **3. Implement canonical export and prompt-only rendering** using existing eight builders unchanged. Legacy translation comparisons consume canonical arrays, retaining the pre-existing scoping filter rather than erasing it.
- [ ] **4. Implement classification** against fresh arrays and evidenced tracked sequences; reuse existing V1 fixture. Pin additional historical patches only when exact content/provenance is available; missing evidence is a blocker, never reconstructed from review counts. Duplicate permission formats/YAML keys, unidentified ordering and generated/custom collisions are ambiguity.
- [ ] **5. Run GREEN:** previous command plus `npx vitest run tests/cli/config-readonly-git.test.ts tests/cli/config-worktrees.test.ts tests/cli/config-scrt-edit.test.ts`. Assert all eight canonical arrays preserve exact policy; every generated markdown lacks both permission keys.

### Task 2: Make install/update a verified global transaction

**Metadata:**
- risk: high
- parallel: false
- depends_on: ['Task 1']

**Files:** Modify `src/cli/opencode-config.ts:410-564`, `tests/cli/install.test.ts`, `tests/cli/update.test.ts`, `tests/cli/global-policy.test.ts`; test existing `tests/cli/oc2-registration.test.ts`.

**Interfaces:** Retain `installGlobalFiles(directory = globalDirectory(), update = false): void` and CLI wiring. Consume Task 1 classification. Use existing `patchAgents(file, agents, remove?)`, `writeAtomic`, `backup`, `readSettings`; no new CLI dry-run command. Pre-write console report lists each source/rule/classification and proposed preservation/replacement verbatim; blocked classifications throw before mutation.

- [ ] **1. Write failing tests:** `fresh_install_single_source`, `update_replaces_owned_not_custom`, `config_verified_before_any_strip`, `registration_cannot_overwrite_permissions`, `two_global_files_no_stale_shadow`, `custom_jsonc_comments_survive`, `custom_prompt_crlf_preserved`, `ambiguous_yaml_no_write`.
  Pin `expect(readSettings(globalFile).agents[name].permissions).toEqual(expectedRules)` and, on injected verification failure, `expect(readFileSync(agentFile, 'utf8')).toBe(originalMarkdown)` for all eight roles; registration still occurs exactly once.
- [ ] **2. Run RED:** `npx vitest run tests/cli/install.test.ts tests/cli/update.test.ts tests/cli/global-policy.test.ts tests/cli/oc2-registration.test.ts`; expect old markdown permissions/frozen-array assertions to expose old behavior.
- [ ] **3. Implement preflight/report/backup:** validate every tier and role before writes; classify all sources; back up config, registration targets, markdowns and exact existing removal targets. Reject custom denies/conflicts without a bypass flag; stop with exact evidence instead of silently widening/dropping. No routine per-step user approval.
  Include native markdown arrays and successfully translated legacy markdown maps as trailing `PermissionSource` entries in `collectAgentSources(directory, name)`; validation alone is not generated ownership. Preflight every agent before any write; replace only proven generated rules, validate/preserve/report custom allows from either source, halt custom denies/ambiguity before mutation.
- [ ] **4. Implement persistence-before-strip:** apply prepared registration before patching arrays, so captured server-config text cannot overwrite them; patch fresh config and reread exact expected arrays before touching markdown. Final array is baseline excluding last seven secret-edit denies, stable safe customs, then those exact seven denies. Conflicting customs halt, not reorder into a weaker policy.
- [ ] **5. Preserve custom JSONC rule nodes/comments** with existing parser offsets/edit primitives when arrays change; `patchAgents` replacing an array wholesale alone does not preserve inner comments. Preserve unrelated settings/models and every existing markdown prompt/description/mode; this permission round strips permission fields only, with no prompt refresh.
- [ ] **6. Add failure tests:** `backup_failure_no_mutation`, `reread_mismatch_no_strip`, `strip_midway_failure_restores_originals`, `registration_failure_rolls_back`, `rollback_failure_reports_backup`, `crash_after_config_write_recovers`, `second_run_byte_stable`. Inject fs faults with Vitest spies, not production fault flags; include created-file removal and original modes.
- [ ] **7. Implement bounded rollback** using in-memory original bytes/existence/modes plus existing backup manifests (reuse `oc2-migration.ts:379-410` pattern). Verify after strip; catchable failures restore touched targets, report incomplete rollback accurately. Hard death before stripping leaves old markdown/status-quo rules authoritative in the validated fixture, not the new baseline; death during stripping may leave mixed per-agent policy. Test these actual states without a blanket “never weaker” claim. No multi-file atomicity, strip-first change or runtime hook. No-op runs create no new backups.
- [ ] **8. Run GREEN:** repeat Step 2 command. Assert byte/mode stability on rerun including crash-recovery duplicate customs, no partial strip on verification failure, and untouched top-level `permissions`/`policies`.

**Current bounded repair (Task 2, original builder; code changes only after architect review):**
- [ ] Add RED regressions in `tests/cli/install-transaction.test.ts`: `markdown_only_custom_allow_preserved` (validated rule reported and persisted once; prompt/model unchanged), `markdown_custom_deny_halts_before_write` (verbatim blocker; all targets untouched); exercise both native/translated legacy sources.
- [ ] Complete the existing seven transaction/fault cases, not a new suite: add `reread_mismatch_no_strip` (inject a post-persist reread mismatch, assert strip never starts and originals are restored) and `rollback_failure_reports_backup` (inject primary failure plus restoration failure, assert backup path, incomplete status and original error). Retain the other five cases from Step 6; byte-stability remains a distinct assertion even if sharing a fixture.
- [ ] Run `npx vitest run tests/cli/install-transaction.test.ts` RED, then minimally fix `collectAgentSources`/existing transaction branches in `src/cli/opencode-config.ts`; no new component. Preserve inner-array comments, or halt before writing when a replacement would lose them, and pin that behavior with `custom_jsonc_comments_survive`.
- [ ] Rename/update the existing crash-window fixture as specified in Task 4; use recognized generated markdown, not an unclassified `edit * allow`. Add partially stripped per-agent observations and rerun convergence; do not assert whole-install policy equivalence without proving each agent's old/generated and new rules.
- [ ] Run the same focused CLI checks and isolated matrix on the final fix state, plus build once/lint once; give recorded evidence to final code re-review before any LIVE operation. No repeated discovery, full-suite retry or per-task review.

### Task 3: Metadata-only init and additive-only migration; retain reset

**Metadata:**
- risk: high
- parallel: false
- depends_on: ['Task 1', 'Task 2']

**Files:** Modify `src/cli/opencode-config.ts` (`initializeProjectAgents`), `src/cli/oc2-migration.ts`, `src/cli/oc2-permissions.ts`; extend `tests/cli/init.test.ts`, `tests/cli/oc2-migration.test.ts`, `tests/cli/global-policy.test.ts`, `tests/cli/oc2-permissions.test.ts`.

**Interfaces:** Preserve `initializeProjectAgents(project: string, config: KikiConfig, directory?: string): void`, now validation-only; `installProjectConfig(target, config)` writes metadata only. Preserve `migrateOC1(options: MigrationOptions): MigrationReport` and `resetProject(project: string): void`. Change `projectPermissionRules(local: PermissionRule[], inherited: PermissionRule[]): PermissionResult` in `oc2-permissions.ts` to return validated additions plus minimal file-protection masks, or `{ ok: false, reason }`; update all callers and tests.

**Helper contract:** accept only file actions `read`/`edit` with effect `allow`; preserve separately inventoried existing narrow `external_directory` tmp grants, not new alternate-tool grants. Remove proven generated input/masks before validating customs. No blanket `edit *`, shell, execute, MCP, delegation or action-wildcard additions. Preserve baseline role denies and asks through bounded checks/masks; unsupported existing rules fail without cleanup. No runtime behavior is added.

- [ ] **1. Write failing tests:** `init_no_native_config_writes` (including existing custom paths), `reinit_existing_config_bytes_unchanged`, `migration_generated_baseline_removed_only_after_verify`, `migration_preserves_models_and_genuine_paths`, `migration_rejects_unknown_v1_aliases_without_cleanup`.
- [ ] **2. Run RED:** `npx vitest run tests/cli/init.test.ts tests/cli/oc2-migration.test.ts tests/cli/global-policy.test.ts tests/cli/oc2-permissions.test.ts`; expect generated mirrors/old masking behavior.
- [ ] **3. Add security regression tests** for `scripts/**` ordinary additions versus `scripts/.env`/`scripts/key.pem`, planner/reviewer `src/special.ts`, implementer `docs/superpowers/x.md`, exact `.env`, wildcard actions, `shell git push* allow`, `execute`, MCP and delegation grants. Assert directory additions work, secret descendants remain denied, explicit-role crossings and unsupported forms fail; output has no full baseline mirror. Cover relative/absolute and both worktree spellings, rerun safety-mask recognition, asks, supported Noema tmp patterns, and rejected traversal.
- [ ] **4. Implement validation-only init and classification-based migration**; retain fail-closed V1 alias translation, source/destination guards, backup/rollback and model handling. Remove generated portions only when ownership is proven; retain reportable genuine file grants. Unsafe/ambiguous existing customs halt/report without deletion, including legacy shell grants. Do not silently convert source restrictions into permissive additions.
- [ ] **5. Verify persistence before local markdown deletion**, extending project and global migration paths where they touch role permissions. Global migration must converge to Task 1 canonical baseline plus safe customs, not import a historical full baseline as authoritative. Readback failure leaves local source intact.
- [ ] **6. Add/run reset regressions:** existing Kiki entries/local files removed only with backup; non-Kiki config, metadata and global arrays unchanged; malformed config causes zero writes. Run Step 2 command to GREEN. No behavioral reset rewrite or broad package cleanup.

### Task 4: Real-binary acceptance, review and batch-approved rollout

**Metadata:**
- risk: high
- parallel: false
- depends_on: ['Task 1', 'Task 2', 'Task 3']

**Files:** Create `tests/integration/oc2-single-source.test.ts`; reuse `tests/helpers/oc2-fixture.ts` and `tests/integration/fixtures/oc2-provider.ts`. Update existing integration consumers only where generation no longer embeds permissions.

**Interfaces:** Reuse `requireOC2Binary(): string`, `observedOC2Version(binary?): string | undefined`, `createOC2Fixture(binary?): OC2Fixture`, `fixture.runAsync(args, options)`, `fixture.runCli(args, options)`. No alternate runtime evaluator as acceptance evidence.

- [ ] **1. Locate prerequisite normally:** inspect `command -v opencode`, resolve the returned installation path through authorized filesystem reads and distinguish a launcher from the actual installed binary. If unavailable/inaccessible, request its authorized absolute path and stop; no install, wrapper substitution or config-root environment trick. No discovery/probe is run during planning.
- [ ] **2. Write RED acceptance tests:** `markdown_config_project_precedence`, `crash_window_stale_markdown_remains_authoritative`, `all_roles_policy_decisions`, `kiki_written_additions_preserve_protected_policy`, `manual_native_override_limit_documented`. Rename the existing crash test and remove its obsolete LIVE-stop commentary: measured stale-markdown precedence is now the approved invariant, not expected new-baseline precedence. Pin old rules before strip, canonical rules after completion, mixed per-agent interruption states and idempotent rerun. Manual override case records native limits, not immunity.
- [ ] **3. Run isolated RED/GREEN:** after authorization and path resolution, run `OPENCODE_TEST_BINARY="<authorized-absolute-binary>" npx vitest run tests/integration/oc2-single-source.test.ts`. This variable selects the test binary only; HOME/XDG isolation is the existing harness, not a live-route redirect. Record observed version; missing binary/skips never count as PASS.
- [ ] **4. Pin the matrix:** stale markdown versus fresh config before/after stripping, global versus project agent arrays, both conflict directions, no-match ask, every role's ordinary scoped writes and both worktree spellings, secret descendants, publishing ask and force deny. Verify three explicit Git grants for specialists and their absence for orchestrator separately from broad shell behavior.
- [ ] **5. Keep execution bounded:** use loopback fixture provider and harmless local controls; publishing/force tests stop at ask/deny decisions, with zero publishing-stub invocations and no network publishing. Never approve a publish prompt to make a test pass. Runtime/precedence contradictions stop rollout, not prompt policy workarounds.
- [ ] **6. Run checks once per final work state:** `npm run build`, `npm run lint`; reuse focused Task 1–3 tests and the isolated matrix rather than automatically repeating the full suite. Expand only on concrete shared-regression evidence. Record exact scope/status/failures, preserve unrelated dirty state, and stop on unresolved failures; no new dependency/security tooling. Build `dist` normally only during implementation.
- [ ] **7. Review once:** after architect review and one sequential builder run, whole-change/security reviewer assesses recorded checks without redundant task reviews/retests. Confirm no model/prompt changes, publishing or commits. If existing README/CHANGELOG claims are stale, historian updates only those claims, including the managed-write limitation.
- [ ] **8. Execute LIVE batch below** after local tests, isolated binary matrix and whole-change review pass. Existing user authorization covers the listed operations; retain inventories/backups/readback/dedup/rollback checks. No new routine approval questions.

## LIVE rollout — user batch-approved, technical gates remain

User: “Und auch die Änderungen an noema bitte direkt umsetzen, ohne alles einzeln von mir abfragen.” This authorizes in-scope global update, Kiki project cleanup and bounded Noema/D3 work after checks, not publishing/commits/pushes, policy expansion or unrelated cleanup. Stop on permission denial without retry/workaround; ambiguity/failure stops with exact evidence.

1. **Global update:** record exact target inventory and verbatim classification dry-run, then run `kiki update`. Back up global config/markdowns, verify arrays then strip and verify. Any custom deny/conflict or changed inventory halts; no extra routine user question.
2. **Kiki local cleanup:** JSONC edit removes only proven generated mirrors in `opencode.jsonc`; compare `git show HEAD:opencode.jsonc` with current dirty bytes as verification canon, not restoration instructions. Preserve current model state/comments/customs and all unrelated dirty changes.
3. **Noema bounded steps:** inventory root `/home/lutz/lprojekte/noema/opencode.json(c)`, `.worktree/voice-concierge/opencode.json(c)` and both account-signup worktree configs and `.opencode/agents/kiki-*.md`. Apply Task 3 helper to genuine permission additions, remove only proven baseline copies, preserve all model assignments and unrelated fields. Re-verify the 16 expected generated markdowns byte-identical against recognized fixture/provenance immediately before deletion; matching each other alone is insufficient. Differences halt; no filename-based bulk deletion.
4. Preserve genuine implementer `scripts/**`, `package.json`, `package-lock.json`, `/tmp/opencode/**`, `**/tmp/opencode/**`, existing narrow `external_directory` tmp allows and models. Use minimal helper safety masks for directory grants and verify protected decisions; do not preserve a shell blanket allow. Do not silently drop unsupported existing forms.
5. **D3:** restore implementer edits for `.worktree/voice-concierge/scripts/voice/cleanup.ts` and `.worktree/voice-concierge/cron.json`: root has the two relative entries; voice config has those plus `/home/lutz/lprojekte/noema/.worktree/voice-concierge/scripts/voice/cleanup.ts` and `/home/lutz/lprojekte/noema/.worktree/voice-concierge/cron.json`. Record exact edits before write; do not lose absolute entries through substring cleanup. Keep the voice config if removing it would lose this arrangement.
6. **D4:** keep current global implementer/gui routine shell envelope, publishing asks and force denies; never restore Noema `bash: allow`. No dependency, model syntax, `node_modules` or other housekeeping cleanup. For every changed target: dry-run/inventory → backup → JSONC patch → readback → source removal only after verification → second-run zero-diff check. Preserve prompt/model bytes; no generic cleanup script/framework.

## Self-review and handoff

Coverage checked: spec §§2/4 → Tasks 1–3; §5 → Tasks 1/4; §6 → Tasks 1/2/3; §7 → Tasks 3/4; §§8–9 → Task 4 LIVE batch. Review notes on dedup, unknown denies, crash window, tracked provenance and binary prerequisite are included. Types/signatures align; tasks are sequential and share one builder context and final review.

The review's user-decision blocker is resolved: Kiki-write validation only; arbitrary manual native overrides remain possible and no runtime hook is delivered. Remaining technical gates are architect review, focused local checks, actual binary acceptance and final review, then the already authorized bounded LIVE batch. No tests/build/probes, implementation or live changes were performed by this planning revision; only spec and plan were edited.

Self-review of this correction: replaces the disproven crash premise, includes all markdown sources, keeps seven required transaction/fault cases with the two missing injections explicit, and preserves persist/verify-before-strip. No new runtime behavior or blanket mixed-state safety guarantee. Independent architect review must pass before the fix resumes.
