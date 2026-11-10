# Task 3 review — V2 path guard and shared native config/model operations

Date: 2026-11-09
Reviewer: `kiki-reviewer` (independent gate)
Inputs reviewed: plan Task 3 + Global Constraints/Review Focus
(`docs/superpowers/plans/2026-11-09-kiki-opencode2-migration-plan.md`), approved spec §3/§6.4
(`docs/superpowers/specs/2026-11-09-kiki-opencode2-migration-design.md`), Task 2 API contract
(`docs/migrations/kiki-3-oc2-api-contract.md`), implementer report
(`/tmp/opencode/kiki-oc2-task3-report.md`), owned diff (`/tmp/opencode/kiki-oc2-task3.diff`),
and the actual working tree (`src/cli/oc2-paths.ts`, `src/cli/opencode-config.ts`,
`tests/cli/oc2-paths.test.ts`, `tests/cli/model-settings.test.ts`, evidence logs in
`/tmp/opencode/`). No source/registry/config edits, builds, installs, or credential reads
performed by this review; all pre-existing dirty files preserved untouched.

## Verdict

- **Spec compliance: FAIL** (2 blockers, both small and local to Task 3's own new code/tests)
- **Quality/security: PASS** (no quality or security blockers; nonblocking items listed below)

## Independently verified claims

| Report claim | Reviewer verification |
|---|---|
| Focused tests 36/36 green | `npx --no-install vitest run tests/cli/oc2-paths.test.ts tests/cli/model-settings.test.ts` → 2 files, 36 tests passed (re-run by reviewer) |
| Red state = missing module + 14 V1-schema failures | `/tmp/opencode/kiki-oc2-task3-red.log` consistent; see nonblocking item 5 for one caveat |
| `npm run lint` exit 0 | Re-run by reviewer — clean |
| `tsc --noEmit` exactly 15 diagnostics, all `src/tui/*` | Re-run by reviewer — identical 15, all `src/tui/index.ts` / `src/tui/model-menu.ts` (permitted Task 2/10 interim) |
| Broader CLI suite: 7 failed files / 33 failed tests, all legacy singular-`agent` consumers | `/tmp/opencode/kiki-oc2-task3-cli-suite.log` summary matches exactly (26 files, 488 tests, 33/422/33); failures are `install`, `init`, `global-policy`, `doctor`, `status`, `update` (below Task 3's line range, Tasks 4/5/8 deliverables) plus the known Task 2 `release.test.ts` tui-compile `beforeAll` failure. No test was weakened or edited to accommodate them — scoped boundary accepted |
| Only the 4 owned files changed; dirty files preserved | `git status`/`git diff --stat`: dirty set = pre-existing Task 2/registry/routing-log/amendment files (`package.json`, `package-lock.json`, `src/cli/config.ts`, `tests/cli/release-gates.test.ts`, `opencode.jsonc` permission amendment, `TASK_REGISTRY.json`, `routing_log.jsonl`, untracked docs/reviews) + exactly the 4 Task 3 files. Spot-checked `package.json`/`config.ts`/`release-gates.test.ts`/`opencode.jsonc` hunks against Task 2's owned diff/plan amendment — pure pre-existing content, no Task 3 contamination. Note: the report's cited rollback snapshots are missing (nonblocking item 6) |

Spec items verified compliant (evidence in code/tests):

- `resolveOC2Roots` / `assertOC2Target` signatures exact; upstream env semantics correct
  (`OPENCODE_CONFIG_DIR` overrides config root only; XDG roots get the `opencode` suffix;
  empty-string env falls through); explicit precedence tested (`resolves_all_four_roots`).
- `ModelSelection`, `PermissionRule`, `parseModelID(id, variant?)`, `formatModelID`,
  `discoverConfigTiers` exported with exact plan shapes; first-`/` split preserves the model
  path (`vendor/org/model` → `{providerID:'vendor',model:'org/model'}`, tested); `#` rejected;
  variant separate. Preserved signatures/row/result interfaces of `globalDirectory`,
  `readSettings`, `readOpenCodeSettings`, `listAgentModels`, `setAgentModel`,
  `removeAgentModel`, `removeAllProjectModels` (string model IDs, German copy intact).
- `config.json` removed from all candidates and asserted ignored; correct four project
  candidates in low-to-high order; ancestor tiers outermost→innermost; global scope skips
  double counting.
- Guards: all four model mutators and the reader guard explicit `ModelContext` directories
  (`assertContextTargets`) before any read/write; overlapping scopes refused; symlinked
  aliases into OC1 roots refused (Review Focus 1 covered, both `OPENCODE_CONFIG_DIR` and
  `XDG_CONFIG_HOME` aliases tested); nearest-existing-parent realpath canonicalization for
  absent destinations tested; guard errors are fixed strings without values/paths/stack
  traces, and the test asserts a synthetic marker secret is not echoed and bytes are
  unchanged on refusal.
- Native validation: `agents.<id>.model` object shape (legacy string tolerated read-only),
  `permissions` ordered rule arrays with exact `allow|deny|ask` effects, forbidden-key
  rejection recursing through arrays; `constructor`/`__proto__` inside permission arrays
  rejected before any write with bytes unchanged (both tested).
- JSONC: comments and unrelated settings/permissions/prompt preserved on save/remove
  (asserted structurally and via surviving in-array comments); new files seeded with the
  Task 2 pinned `$schema` URL and the literal is tested; existing user `$schema` preserved
  (tested); `writeAtomic` (temp+rename, mode-preserving, 0600 default) unchanged.
- Tier semantics: effective display chain `project ?? ancestor ?? global` agent model, then
  top-level default in the same tier order — matches merged-config semantics; removals touch
  only the selected scope's own files; ancestor file byte-identical after project removal
  with `removed: undefined`, `effective: 'ancestor/base'`
  (`reports_ancestor_inheritance_without_deleting_parent`); all project files validated
  before `removeAllProjectModels` writes; save re-reads config so concurrent unrelated edits
  survive (tested).
- `formatModelID` variant omission is plan-conformant (UI rows retain existing variant-less
  string IDs; the SDK's `#variant` string form is a tool-input format, not the config-native
  object Kiki writes) and no loss occurs on save/remove within those semantics: saves write
  exactly the parsed selection, removals delete the whole `model` leaf, and whole-leaf
  replacement prevents stale variants. See nonblocking item 9 for the residual variant case.
- Security posture: marker checks are metadata-only (no config parsing anywhere in the
  guard — the credential boundary is respected in code); reviewer-run `npm audit`: 0
  high/critical, 32 moderate (vitest dev chain + npm-cli transitive chains via
  `@opencode/util`). Task 3 adds no dependency surface (package files untouched by this
  task); formal fresh-audit disposition remains Task 13's gate per plan.
- Parallelization: Task 3 `depends_on: ['Task 2']`, non-parallel; file ownership disjoint
  from Tasks 4/6/9; no circular dependencies.

## Blockers (spec compliance)

1. **Missing mandated fail-closed refusal when OC1 markers cannot be verified without
   reading a possibly credential-bearing config.**
   Evidence: `src/cli/oc2-paths.ts:58-82` (`hasOC1Markers` checks only
   `plugins/kiki.{ts,js}`, `tui.json(c)`, `kiki/tui.js`, `kiki/prompts/`) and
   `src/cli/oc2-paths.ts:105-110` / `src/cli/opencode-config.ts:262-265`
   (`hasOC1Markers(config) || (pathsOverlap(config, machineDefault) && hasOC1Markers(machineDefault))`).
   Plan Task 3 bullet 3: "guard machine-default OC1 markers by metadata first. If marker
   inspection would require a credential-bearing config, **refuse and request a
   user-created secret-free export** rather than inspect it." Spec §6.4 lists "singular
   `agent.kiki-*` entries" among the V1 markers, and spec §2 anti-goals forbid Kiki 3.0.0
   touching OC1's global config "including by accident". Current behavior: when the resolved
   config dir is/overlaps the machine default and contains `opencode.json(c)` but no file
   markers, the guard **proceeds** — the singular-agent marker case is neither detected nor
   refused, and no code path or message anywhere requests a secret-free export. Concrete
   scenario: unset env, `~/.config/opencode/opencode.json` containing `agent.kiki-*` entries
   but no Kiki-generated files → Kiki 3.0.0 writes `agents.*` into OC1's live config. The
   implementer's ruling 1 documents the narrowing but reads the plan as permission to skip
   the check; the plan text prescribes refusal (the "request a user-created secret-free
   export" clause only makes operational sense if the run is refused until verification).
   Required fix (local, breaks zero existing green tests — verified against all current
   guard tests): in the machine-default clause, also refuse — with the secret-free-export
   message — when `machineDefault` contains `opencode.json`/`opencode.jsonc` (existence
   check only, still no parsing) but has no file markers; isolated roots and marker-free
   non-default dirs are unaffected. Add a test pinning refusal for
   machine-default + config-file-present + no-file-markers, and acceptance for an empty
   machine default.
2. **Required "read-only" no-change assertion is absent, and the report overstates coverage.**
   Plan Task 3 bullet 1 requires asserting "no file changes on malformed/read-only input".
   Malformed is covered (three tests across save/remove). **Read-only is covered nowhere**:
   no chmod/read-only test exists in `tests/cli/oc2-paths.test.ts` (7 tests) or
   `tests/cli/model-settings.test.ts` (29 tests), and none existed in the pre-task file
   (`git show HEAD:tests/cli/model-settings.test.ts` — no such test was removed or modified).
   The report's green section nevertheless lists "malformed/read-only" among covered cases
   (`/tmp/opencode/kiki-oc2-task3-report.md`, GREEN bullet list) — inaccurate. Note for the
   fix: a read-only-**directory** test passes today (`writeAtomic`'s temp-file creation
   fails, original bytes untouched), while a read-only-**file** test would not (rename
   replaces a 444 file, preserving its mode — pre-existing V1 `writeAtomic` behavior the
   plan separately mandates keeping). Add the directory-level test and, if file-level
   semantics are intended to differ, record that as an explicit ruling rather than leaving
   the plan assertion silently unmet.

## Nonblocking items

1. `mergeSettings` (`src/cli/opencode-config.ts:76-83`) deep-merges the `model` object
   field-wise across files within one tier group: a higher file's variant-less
   `agents.<id>.model` merged over a lower file's variant-bearing one yields a stale-variant
   selection — contradicting ruling 6's rationale at the merge layer. Invisible in current
   consumers (`formatModelID` omits variant), but Task 5's equivalence preservation must not
   rely on `tierSettings` merging; consider whole-model replacement in `mergeSettings`.
2. `removeAgentModel` (`src/cli/opencode-config.ts:365`) reads/validates ancestor tiers
   only after the removal writes; a malformed ancestor file surfaces an error after a
   completed, correct removal. No unintended writes; UX wart only.
3. `discoverConfigTiers`' ancestor walk is lexical (`resolve`, no symlink
   canonicalization) and the global-dir skip compares un-canonicalized paths — a symlinked
   ancestor aliasing the global dir could double-count global files (harmless idempotent
   merge) or the walk could miss real-path ancestors of a symlinked project. Corner case.
4. Comments placed inside a replaced `model` object are dropped on whole-leaf replacement
   (unusual placement; comments elsewhere are preserved and tested).
5. Red-state evidence predates the final test file: the red log shows 28 model-settings
   tests while the final file has 29 — `refuses explicit directories that alias a V1 install
   or overlap` is absent from the red failure list and cannot have passed against the
   unguarded old code, so it was added after the red snapshot (minor TDD deviation for one
   test; the test itself is present and green).
6. Report integrity: the cited rollback snapshots `/tmp/kiki-tracked-before.patch` and
   `/tmp/kiki-untracked-before.txt` do not exist anywhere under `/tmp`; byte-for-byte
   rollback verification is therefore not reproducible as claimed. Preservation was
   substantively re-verified by this review via git state and hunk comparison (table above).
7. Retained V1 `validateAgent` read-only validation (`src/cli/opencode-config.ts:64-74`) may
   reject legacy-`agent`-keyed configs OC2 itself accepts (e.g., object model inside the
   singular key) — fail-closed direction, acceptable; revisit during Task 5 migration.
8. `parseModelID` accepts inner whitespace in pieces (`'pro vider/model'`); the plan only
   requires rejecting empty pieces and embedded `#`, and menu inputs are gated by
   `availableModels`, so impact is minimal.
9. Variant persistence: the preserved string-ID UI means `setAgentModel` can never write a
   variant, so re-saving an agent whose config carries a variant (from migration or manual
   edit) drops it — deliberate per rulings 2/6 and consistent with the plan's frozen UI
   shape. Task 9's menu should avoid no-op rewrites of unchanged selections so it does not
   silently strip variants while displaying identical rows.
10. Interim-tree risk (scoped boundary, not a Task 3 defect): until Tasks 5/8, the unported
    lower consumers (`installGlobalFiles`, `initializeProjectAgents`, `migrateProject`,
    `resetProject`) call the now-V2 `patchAgents` without guards. Their tests fail as
    documented and the plan forbids live use before the gates; nothing for Task 3 to change.

## Conclusion

The implementation is disciplined, well-tested and boundary-clean; the guard architecture,
tier precedence, JSONC preservation and prototype hardening all meet the plan and the Task 2
contract, and every verification claim I re-ran reproduced exactly. The two blockers are
small, local gaps against explicit plan sentences in Task 3's own deliverable — the
fail-closed refusal for the metadata-insufficient OC1-marker case (the core safety guard of
this migration) and the missing read-only no-change assertion (plus its report overclaim).
Both are fixable within Task 3's file ownership without touching any other task's scope;
downstream Tasks 4/6/9 should not start until they are resolved and re-reviewed.

---

# Fix round 1 re-review (scoped)

Date: 2026-11-09. Inputs: `/tmp/opencode/kiki-oc2-task3-fix1.diff`, appended
`/tmp/opencode/kiki-oc2-task3-report.md`, fix evidence logs in `/tmp/opencode/`, and the
actual working tree. Scope limited to the fix diff and the two prior blockers; no broad
re-review of untouched code. No source/registry/install/build/credential changes made by
this review; all pre-existing dirty files preserved (git status re-verified — dirty set
identical to round 1 plus this review file; registry/routing-log remain orchestrator-owned,
registry update deferred as recorded).

## Verdict

- **Spec compliance: PASS**
- **Quality/security: PASS**

## Prior blocker dispositions

1. **Fail-closed refusal for metadata-insufficient machine-default OC1 case: ADDRESSED.**
   `src/cli/oc2-paths.ts:86-108` adds a shared exported `assertNotOC1Config(target, home)`
   used by both gates — `assertOC2Target` (env/root, `oc2-paths.ts:131`) and
   `assertContextTargets` (explicit context, `src/cli/opencode-config.ts:262`) — removing the
   duplicated inline logic. `hasConfigFile` is `existsSync`-only (the config file is never
   opened — credential boundary intact). When the canonical target is/contains/is-contained-by
   the machine default and that default holds `opencode.json`/`opencode.jsonc` without file
   markers, the guard refuses with the secret-free-export message; empty/absent machine
   default is accepted; file markers keep the original refusal; isolated roots are
   unaffected (sibling paths don't trigger `pathsOverlap`). New tests
   (`refuses_machine_default_config_file_without_file_markers` × both filenames — refusal,
   synthetic secret and model value not echoed, bytes unchanged, isolated root still passes;
   `accepts_an_empty_machine_default` — absent and empty both pass) match the round-1
   prescription exactly, with coherent red evidence against the pre-fix source
   (`fix1-red.log`: 2 failed, both "expected undefined to be an instance of Error" = guard
   proceeded pre-fix).
2. **Read-only no-change assertion: ADDRESSED.**
   `rejects_unwritable_destination_directory_without_changing_existing_files`
   (`tests/cli/model-settings.test.ts:52-69`) makes the destination config-directory path a
   regular file so `writeAtomic`'s `mkdirSync` fails deterministically (`EEXIST`/`ENOTDIR`)
   even when the suite runs as root (chmod-only fixtures are root-bypassed — sound,
   documented rationale). It asserts the mutation throws, existing bytes are unchanged, the
   parent listing is unchanged (no stray temp files), and no config file is created —
   outcome-level assertions matching the plan's "no file changes on … read-only input".
   The file-level ruling (mode-0444 file replaced by temp+rename with mode preserved —
   pre-existing V1 `writeAtomic` behavior intentionally kept) is now documented explicitly,
   and the earlier report's inaccurate "malformed/read-only" coverage claim is corrected.
   **EACCES judgment:** the plan sentence asserts an outcome, not an errno. The covered
   outcome class (unwritable/unusable destination directory → throw + zero file changes) is
   genuinely established; the specific `writeFileSync(temp)` EACCES throw site (chmod-555
   directory) is a different line with structurally identical safety (open fails before the
   temp exists, the `finally` skips unlink, no rename is reached). I therefore accept this
   as satisfying the plan and record the EACCES-specific variant as a recommended nonblocking
   addition (item 12 below), not a gap.

## Fix-only regression check

- Fix touches only the four owned files; no test was weakened; no downstream task's files
  modified (git status re-verified).
- The `assertContextTargets` refusal message gained the wrapper-hint parenthetical (now
  consistent across both gates); the existing test regex still matches.
- `hasOC1Markers` import removed from `opencode-config.ts` (no unused import — lint clean).
- Double canonicalization of the config root in `assertOC2Target` (`assertNotOC1Config`
  re-canonicalizes an already-canonical path) is idempotent and harmless.
- New export `assertNotOC1Config` adds no interface conflict and is reusable by Tasks 8/10.
- Reviewer re-ran all verification: focused `npx --no-install vitest run
  tests/cli/oc2-paths.test.ts tests/cli/model-settings.test.ts` → **40/40 passed**;
  `npm run lint` → clean; `npx --no-install tsc --noEmit` → identical 15 diagnostics, all
  `src/tui/*` (permitted interim, none in owned files); `npx --no-install vitest run
  tests/cli` → 26 files, **7 failed / 19 passed; 493 tests: 33 failed / 427 passed /
  33 skipped** with the failed-file set identical to the pre-fix run (`doctor`,
  `global-policy`, `init`, `install`, `status`, `update` legacy singular-`agent` consumers
  plus the Task 2 `release` interim compile) — zero regressions from the fix.

Arithmetic footnote: the suite total rose 488 → 493 (+5), not +4: the original cli-suite
snapshot (14:02) predates the 29th model-settings guard test (round-1 nonblocking item 5);
4 fix tests + that 1 test account for the delta. The fix report's "only delta is the four
new passing Task 3 tests" is imprecise against its own 488 baseline but substantively
correct — same failed files, same failure count, no weakened tests.

## Nonblocking items (fix round)

11. `CONFIG_FILES` (`src/cli/oc2-paths.ts:66`) excludes `config.json` — a filename only V1
    ever used (contract: "V1's `config.json` is gone"), which could equally hold singular
    `agent.kiki-*` entries. The guard refuses on `opencode.json(c)` (which may even be
    OC2-native) while accepting a `config.json`-only machine default — an internal
    evidence-strength inconsistency. One-line addition closes it. Residual risk is contrived
    (hand-rolled ancient config, no file markers) and Kiki 3.0.0 never reads `config.json`,
    so this is a refinement, not a re-opening of blocker 1.
12. Recommended EACCES-specific companion test (e.g. `it.skipIf(process.getuid?.() === 0)`
    with a chmod-555 config directory holding an existing config file): pins the
    `writeFileSync(temp)` failure line and asserts existing config bytes unchanged — the
    file-as-dir fixture cannot assert the latter (a file cannot contain a config file).
    Safety is structurally guaranteed today; this is coverage hardening.
13. Fix-report wording (488→493 delta attribution) — see arithmetic footnote above; no
    action required beyond awareness for future suite-delta accounting.

## Re-review conclusion

Both prior blockers are addressed within Task 3's file ownership, exactly per the round-1
prescriptions, with red evidence, no test weakening, and zero regressions (all verification
re-run independently by the reviewer). Round-1 nonblocking items 1-10 remain open and
unchanged; items 11-13 are new from this fix round. **Task 3 is released: spec PASS,
quality PASS. Downstream Tasks 4/6/9 may start.**
