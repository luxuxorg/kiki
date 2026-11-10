# Task 10 review — V2 TUI entrypoint, safe setup and packaged PTY interaction

Date: 2026-11-09
Reviewer: `kiki-reviewer` (independent spec + quality/security review)

Inputs reviewed:

- `/tmp/opencode/kiki-oc2-task10-report.md`, `/tmp/opencode/kiki-oc2-task10.diff` (700 lines, read in full — exactly the four task-owned files, matching the on-disk tree for every file I opened).
- Plan `docs/superpowers/plans/2026-11-09-kiki-opencode2-migration-plan.md` (Task 10, lines 261–278; Global Constraints, lines 13–26; Review Focus 4, line 33; Task 11 lines 280–300 for the prereq chain; Task 13 lines 320+ for the release-test ownership).
- Spec `docs/superpowers/specs/2026-11-09-kiki-opencode2-migration-design.md` §6.3, §6.7, §7.1 (+ §6.4 for the config-dir/guard context).
- Contract `docs/migrations/kiki-3-oc2-api-contract.md` §2, §4, §5, §8.
- Actual tree: `src/tui/index.ts` (116 lines), `tests/tui/setup.test.ts` (225 lines), `tests/integration/kiki-tui.test.ts`, `tests/integration/fixtures/kiki-tui-smoke.py` (151 lines), `src/tui/model-menu.ts`, `src/cli/oc2-paths.ts`, `src/cli/opencode-config.ts` (shared-function signatures), `src/cli/release-gates.ts` + `tests/cli/release.test.ts` (full-suite failure diagnosis), `dist/tui/index.js`, `dist/server/index.js`, `package.json`, installed `@opencode/plugin@2.2.6` (`dist/tui/solid.js` peer-import check).
- Prior reviews: Tasks 2–9 all PASS (Task 9's deferred item 4 made `src/tui/index.ts` Task 10's; Task 7 §7 documents the release-gate removal).
- Evidence logs in `/tmp/opencode/`: red/green/integration/tsc/build/lint/full-suite, dist before/after inventories.

## Verdicts

- **Spec compliance: PASS**
- **Quality/security: PASS**

**Partial acceptance, stated explicitly:** Task 10's four owned files are accepted as complete and correct. Two acceptance
boundaries remain **NOT VERIFIED / NOT GREEN** and must not be recorded as passed — both are Task 11 prerequisites owned by
others, exactly as the plan's last Task 10 bullet prescribes ("Missing binary is explicitly NOT VERIFIED, not a green GUI
acceptance"):

1. **Actual-binary packaged `/kiki` PTY acceptance: NOT VERIFIED.** `OPENCODE_TEST_BINARY` is unset; no isolated OC2 2.2.6
   binary exists (the only installed binary is OC1 1.19.5, checked metadata-only). The PTY scenario was ported and
   syntax-checked but never executed. No PTY transcript exists; none was fabricated. Task 11 requires an explicitly supplied
   exact-2.2.6 binary and **zero skips** — that gate is unmet until then.
2. **Full `npm test` green: blocked by a pre-existing backend defect, not by Task 10 code** (determination in §5): the stale
   `release-gate-check.mjs` expectation in `tests/cli/release.test.ts:726`. Task 10's own mandatory gate (full-tree
   `tsc --noEmit` / `npm run build` / `npm run lint` all exit 0) **is green** — independently re-verified by this reviewer.
   Task 11's stricter gate (`npm test` exit 0) cannot pass until the backend owner fixes that stale test.

## 1. Independent verification re-run by this reviewer

| Check | Result | Report claim |
|---|---|---|
| `npx --no-install vitest run tests/tui/setup.test.ts tests/tui/model-menu.test.ts tests/integration/kiki-tui.test.ts` | 3 files / **33 passed, 1 skipped** (8 setup + 23 model-menu + 2 always-run integration; the skip is the binary-gated PTY test) | 31 + 2/1 ✅ |
| `npx --no-install tsc --noEmit` (full tree) | **exit 0, zero diagnostics** — the Task 2/7 TUI exception is closed; the release suite's former suite-setup tsc failure is gone | ✅ |
| `npm run lint` | **exit 0**, no warnings/errors in changed files | ✅ |
| `npx --no-install vitest run tests/cli/release.test.ts` (scoped failure confirmation) | **1 failed / 32 passed** at exactly line 726: `expect(pluginCalls).toHaveLength(1)` → received `[]` (0 calls to `release-gate-check.mjs`) | ✅ same signature as full-suite log |
| `npm audit --json --include=dev --include=optional --include=peer` (reviewer-run; Task 10 changed no manifest) | **0 high / 0 critical / 32 moderate** — byte-identical posture to the Task 7/8/9-reviewed graph (vitest/@vitest/mocker, glob/minimatch, `@npmcli/*` via `@opencode/util`, typescript-eslint; all dev/transitive tooling) | ✅ no high/critical findings to fix or report |
| `git log` / `git status` | HEAD still `e2bf396`, **no commits/tags/pushes**; dirty set = pre-existing Task 2–9 files + the four Task 10 files + generated `dist` from the authorized build; `routing_log.jsonl`/`TASK_REGISTRY.json` pre-existing/orchestrator-owned, untouched by the task diff | ✅ |
| Dist inventory diff (`git diff --no-index` before/after) | **32 new files** (16× `dist/cli/oc2-{migration,paths,permissions,registration}.*` + 16× `dist/server/{index,routing-logger,watchdog,watchdog-events}.*`), **40 modified tracked files** (exactly the git-status M set), **0 removed**, 8 stale `dist/plugin/*` retained | ✅ except the report's prose count (see observation 1) |
| `python3 -m py_compile` PTY fixture (implementer log) | exit 0 | ✅ (fixture also read in full; compiles trivially) |
| Full suite | **not re-run** (per instruction, evidence reuse): log shows `1 failed | 613 passed | 3 skipped (617)`, single failure reproduced scoped above; skips = PTY (kiki-tui), `opencode-global-agents` (both `OPENCODE_TEST_BINARY`-gated) + the opt-in `release-real-build` gate — consistent with the no-binary state and prior baselines | ✅ |

`npm run build` was not re-run by the reviewer: the emitted tree already on disk is consistent with the green `tsc --noEmit`
(same compiler, `build: tsc`), the build log is clean, and the dist inventories reconcile; re-emitting would change nothing.

## 2. Spec conformance (plan Task 10, spec §6.3/§6.7/§7.1, contract §2/§4/§5/§8)

- **Entrypoint shape (plan line 272, contract §4/§8.1):** default export `Plugin.define({ id: 'kiki', setup })` from
  `@opencode/plugin/tui`; no V1 surface anywhere (`@opencode-ai`, `api.state.path`, `TuiPluginModule`, `registerLayer`,
  `dialog.replace` — grep-verified absent from `src/tui`). Emitted `dist/tui/index.js` matches the source exactly and
  imports `@opencode/plugin/tui` at runtime (runtime dependency per contract §2 — verified in `package.json`:
  `@opencode/plugin: 2.2.6` exact pin in `dependencies`; `./server`/`./tui` exports and `bin.kiki` match contract §2 verbatim). PASS.
- **ModelContext from Task 3 roots + verified V2 location (plan line 272):** `buildModelContext` composes
  `resolveOC2Roots` + `assertOC2Target` (root-overlap refusal, OC1 marker/machine-default credential-boundary refusal —
  strict mode, no `allowKnownV1Artifacts`), canonicalizes the config root, preflight-checks writability, parses global
  config through the shared `readOpenCodeSettings(dir, true)`, requires host `ctx.location.directory` (contract §4:
  `location?` optional — absence throws `LocationNotReadyError`), refuses nonexistent/non-directory/aliasing/overlapping
  project dirs, and parses the project config through the shared reader. The shared-function signatures all match
  (`readOpenCodeSettings(directory, global=false)`, `listAgentModels(scope, context)`, etc.). PASS.
- **Shared model functions + Task 9 cleanup (plan line 272):** `ModelSettings` is delegated to `listAgentModels`/
  `setAgentModel`/`removeAgentModel`/`removeAllProjectModels` (no GUI reimplementation of config logic); `setup` returns
  `registerKikiMenu(ctx, settings)`'s cleanup (Task 9's exact `registerKikiMenu(ctx, settings): () => void` contract). PASS.
- **Setup tests (plan line 274):** genuine RED (`/tmp/opencode/kiki-oc2-task10-red.log`: 8/8 failed with
  `setup is not a function` against the old V1 entrypoint — the V2 surface did not exist), then GREEN. The 8-test matrix
  covers every named case: writable/parseable registers the menu; unresolved location safely delays (menu registered,
  `/kiki` shows the loading toast, no dialog, no write); overlapping/unwritable/malformed global/malformed project/aliasing
  project each show the one clear German error toast and register **no** layer (the `registered` getter proves
  `registerKikiMenu` was never reached); "no dependence on V1 state.path or lifecycle" is proven by a fixture that simply
  has no such surface. "Not-ready data" (collections missing with a location present) is covered in the same focused run by
  Task 9's `hostReady` tests — the plan's focused command is the pair. PASS.
- **Preflight safety (spec §6.7, user focus):** `assertWritableDirectory` performs metadata-only checks
  (exists/stat/access) — it never creates, reads or truncates; the write-free setup is **asserted** by a byte snapshot of
  config+project before vs. after `setup`+cleanup in the first test. Errors surface as one generic German toast
  (`SETUP_ERROR_MESSAGE`) that never contains a path, config value, parser detail or stack — asserted, including a
  `not.toContain(f.root)` leak check. Project writability is not preflighted; the ruling (§7, item 3) correctly documents
  that the shared save/remove paths fail closed at write time (Task 3's validate-before-write), which is the spec's
  requirement for the *config dir* only. PASS.
- **Not-ready/cancel semantics (Review Focus 4):** setup registers the menu even without a location (safe delay); the
  Task 9 `hostReady` guard (`location` + both `provider`/`model` collections) keeps `/kiki` from opening any flow;
  cancellation/staleness/double-dispatch/busy-guard remain owned and tested by Task 9's menu (23 tests green in this
  focused run). A location that disappears mid-flow makes the lazy `modelContext()` throw inside the menu's try/catch —
  fail-closed with a generic toast, no write. Zero LLM/chat mutations: `ctx.client` and `ctx.ui.model` are throwing
  proxies in the fixture and nothing in the flow path touches them. PASS.
- **Installed package entrypoint resolution with host peers (plan line 277, contract §2/§5):** integration test 1 calls
  the real installed `Host.resolve({ directory: <checkout> })` and asserts `server`/`tui` resolve to
  `dist/server/index.js`/`dist/tui/index.js` (both exist) — re-verified green here. The `vi.mock` ruling's factual basis is
  independently confirmed: installed `@opencode/plugin/dist/tui/solid.js` eagerly `import`s `solid-js` (host-provided
  optional peer, not a Kiki dependency), so a plain-Node import of the real TUI module without a host peer cannot work in
  the checkout — the report's synthetic host-peer fixture (since disposed) covered exactly that gap; its load-bearing
  claims are re-verified statically (peer import) and via `Host.resolve`, and the emitted default export
  (`Plugin.define({id:'kiki', setup})`) is directly inspectable in both dist entrypoints. Final runtime acceptance stays
  with Task 11's real binary. PASS.
- **PTY port (plan line 276, spec §6.7, contract §4/§8.5):** see §4. PASS as *authored*; execution NOT VERIFIED (§6).
- **Full-tree gate (plan line 277):** tsc/build/lint exit 0 with no TUI exceptions left — re-verified (§1). Both built
  entrypoints resolve with the installed pinned SDK — verified. No shared compiler settings weakened, no V1 dependency
  restored (`package.json`/`package-lock.json` in the dirty set are pre-existing Task 2 changes, untouched by this task's
  four files). PASS.

## 3. Source/test scope and boundary compliance

- **Exactly four files** in the task diff: `src/tui/index.ts`, `tests/tui/setup.test.ts` (new),
  `tests/integration/kiki-tui.test.ts`, `tests/integration/fixtures/kiki-tui-smoke.py` — matches the plan's Task 10 file
  list and `git status`. No backend/CLI/release source or test edited; no hand-edit of any `dist` file.
- All fixtures are `mkdtemp`-isolated with explicit `env`/`home` parameters; the setup tests never touch the real
  `process.env`/`~`. No `.env`, `auth.json` or credential-bearing machine config read anywhere in the flow (metadata-only
  guards in `oc2-paths.ts`; config parsed only through the shared reader — the sanctioned path, same as the CLI).
- No binary installed/executed, no live config run (the 1.19.5 finding is a metadata-only `--version` check, correctly
  not used for acceptance), no dependency install/update, no commit/tag/push, no registry edit, no subagent dispatch.
- **Stale `dist` artifacts correctly escalated, not bypassed:** the 8 tracked
  `dist/plugin/{dedup-source,watchdog-source}.{js,js.map,d.ts,d.ts.map}` files (sources deleted in Task 7; `tsc` never
  deletes outputs) were inventoried and flagged for backend-owned cleanup instead of being hand-deleted by the GUI role.
  Verified present on disk; refusing the out-of-role deletion and the shell bypass is the **correct** behavior. This is a
  hygiene item for the backend owner (see §6, item 3), also relevant to Task 11's generated-dist manifest.

## 4. PTY scenario realism audit (no fabricated assertions; provider counter zero)

Every string the scenario waits for maps to a real string in the ported code or the OC2 startup screen — checked
string-by-string against `src/tui/model-menu.ts`:

- `"Modell ändern — global"` / `DOWN` → `"Modell ändern — dieses Projekt"` — the scope dialog options (default `global`).
- `"Kiki-Agent auswählen — global/dieses Projekt"` — agent-flow dialog titles.
- `"Modell (global)"` / `"Modell (dieses Projekt)"` — substring of `${agent} — Modell (${label(scope)})`.
- `"Globales Modell"` — the INHERIT entry `Globales Modell (<model>) verwenden`, which `model-menu` only offers when
  `row.projectOverride !== undefined` — so this step simultaneously proves the project override **survived the global
  save** (the plan's "local override retention", asserted transitively).
- `"Alle lokalen"` / `"Alle lokalen Modell-Zuordnungen löschen?"` — remove-all option and native confirm title.
- `"gespeichert"` / `"zurückgesetzt"` — success toast titles (`Kiki-Modell gespeichert`, `Kiki-Modell zurückgesetzt`,
  `Kiki-Modelle zurückgesetzt`).
- Startup wait (`Fix a TODO`/`What is the tech stack`/`Fix broken tests`) — the real OC2 empty-state screen; if 2.2.6 shows
  something else, the test **fails**, it cannot silently pass. Same for every dialog-interaction assumption
  (type-to-filter + `ENTER`, `DOWN` to the second option, `ENTER` on the confirm dialog): each is realistic for the native
  dialog and can only fail, not fabricate success. Ruling 4 honestly flags the confirm-key mapping as the risk Task 11
  will surface.

The PTY test's assertions are equally real: `--version` must be exactly `2.2.6` (refuses anything else — the Task 11
harness requirement is pre-built); global save must produce
`agents['kiki-reviewer'].model = { providerID: 'kiki-fixture', model: 'fixture-model' }` (native V2 object shape);
`keep-global-comment`/`keep-project-comment` must survive (JSONC comment retention); both project overrides must be gone
after the two removal flows; and the loopback provider server (native `providers` shape per contract §6, synthetic
placeholder key, 127.0.0.1 only) that **fails any request with a 500 and counts it** must show `requests.count === 0` —
a genuine zero-provider-request guard for menu use. Isolated env mirrors the Task 11 `createOC2Fixture` contract (all four
XDG roots + explicit `OPENCODE_CONFIG_DIR`, whitelisted child env, no inherited auth/provider vars).

## 5. Full-suite failure: Task 10 code defect or downstream backend fix?

**Determination: NOT a Task 10 defect. A downstream backend/release-test fix is required before Task 11.**

Evidence chain (all independently verified):

1. Task 10's diff touches exactly the four GUI files; `src/cli/release-gates.ts` and `tests/cli/release.test.ts` are not
   among them. `tests/cli/release.test.ts` is **unchanged from HEAD**.
2. `git diff HEAD -- src/cli/release-gates.ts` shows the working tree removed `checkGeneratedPlugin()` — the only caller
   of the `release-gate-check.mjs` script — together with the retired V1 generated-plugin machinery. That removal was
   Task 7's reviewed-and-PASSed coupled edit ("Remove obsolete generator fields/consumers together", plan line 220; Task 7
   review §7 explicitly ruled the stamp check consumed a retired artifact and its removal was necessary, with no
   weakening).
3. Until Task 10, this stale expectation was **masked**: the release suite failed during its own suite-setup
   `tsc -p tsconfig.json` (unported V1 `src/tui/index.ts`), so all 33 cases were skipped (documented in the Task 9
   review, line 18). Task 10's full-tree green unmasked the suite; the single failing case now runs and fails at line 726
   because the runner records **zero** `release-gate-check.mjs` calls (the gate no longer exists). My scoped re-run
   reproduces the identical signature; the other 32 release cases pass.
4. The fix — removing/adapting the stale `release-gate-check.mjs` stub (line 205) and expectations (lines 720–726) to the
   post-Task-7 six-gate set — belongs to the backend/release owner (plan: "backend fixes return to implementer"; Task 13
   owns the release-gate/release-test updates). Restoring the gate would contradict Task 7's approved removal.
5. Sequencing: Task 10's own mandatory gate (tsc/build/lint) is green, so Task 10 is releasable per its definition. But
   **Task 11 requires `npm test` exit 0 with no interim allowances** — so the backend fix must land before (or with)
   Task 11's start. The GUI implementer correctly reported instead of self-fixing out of role.

## 6. Task 11 prerequisites and handoffs (recorded for the orchestrator)

1. **OC2 2.2.6 test binary** — `OPENCODE_TEST_BINARY` must be explicitly supplied (human-owned install per the machine
   appendix; the only installed binary is OC1 1.19.5). Until then: PTY acceptance and `opencode-global-agents` integration
   are **NOT VERIFIED**; Task 11's "zero skips" requirement is unmet. Never record these as green.
2. **Backend release-test fix (blocker for Task 11's `npm test` gate)** — update `tests/cli/release.test.ts` to the
   post-Task-7 gate set (remove the stale `release-gate-check.mjs` stub/expectation); the same inert `pluginVersion`
   plumbing in `tests/cli/release-gates.test.ts` noted by the Task 7 review (item 2) can be pruned in the same backend
   change. Not a Task 10 defect; Task 13's scoped release-test work covers the durable fix.
3. **Backend dist cleanup (hygiene before Task 11's generated-dist manifest)** — remove the 8 stale tracked
   `dist/plugin/{dedup-source,watchdog-source}.*` artifacts whose sources were deleted in Task 7, in a backend-owned
   change (git-visible deletion of tracked files). Task 11's dist manifest must not bless them as current outputs.

## 7. Rulings assessment (all four accepted)

1. `vi.mock('@opencode/plugin/tui')` in setup tests — basis verified (eager `solid-js` peer import in the installed
   package); the tests still typecheck against the real SDK types (type-only import, full-tree tsc green), the real
   module is exercised by `Host.resolve` + the synthetic-import evidence, and Task 11 runs the real binary. No production
   impact.
2. Unresolved location delays instead of failing — matches Task 9's safe not-ready behavior and the plan's wording
   ("safely delays/refuses"); the menu is registered but write-inert until the host reports location + collections.
3. Project-writability deferred to the shared save/remove error paths — spec §6.7 requires the fail-closed toast for the
   *resolved config dir* (preflighted); project write failures fail closed at write time with no partial write (Task 3
   validate-before-write). Cost-if-wrong statement is accurate.
4. Remove-all confirmation lives in the unexecuted PTY scenario — correctly labeled NOT VERIFIED; Task 11 surfaces any
   native confirm-key mismatch.

## 8. Non-blocking observations

1. **Report prose miscount:** "New generated files: 28" — the actual inventory diff (and the report's own enumeration:
   8 modules × 4 files) is **32**. The enumeration is correct; only the headline number is off. Cosmetic.
2. **PTY "local override retention" is asserted transitively** (the INHERIT entry's existence proves the override survived
   the global save). A direct mid-run project-file snapshot would be marginally stronger if Task 11 wants it; the end-state
   assertions plus Task 3/9 unit coverage make this adequate.
3. **Mid-flow location retraction edge:** if the host retracts `ctx.location` between `/kiki` start and a settings call,
   the lazy `modelContext()` throws `LocationNotReadyError` inside the menu's catch and shows the generic read-error
   toast rather than the loading toast. Fail-closed, generic, no write — only the message wording differs in this
   pathological path. Theoretical; no action required.
4. **Task 9 deferred item 1 (inherited-row same-string no-op)** is not exercised by the PTY scenario (the global save
   selects a model different from the effective one). Remains open for Task 11 to pin if desired.
5. **Synthetic host-peer fixture disposed:** the report's plain-Node import evidence (`server`/`tui` → `{id:'kiki',
   setup: function}` with a `solid-js` stub) is no longer on disk. Its substance is independently re-verified (§2); Task
   11's real-binary run is the final authority. Future reports should keep such fixtures or inline the transcript.

## 9. Parallelization / dependency check (checklist)

Task 10 metadata: `risk: high`, `parallel: false`, `depends_on: ['Task 8', 'Task 9']` — both released (Task 8 PASS,
Task 9 PASS). No circular chain. File ownership is exactly the plan's Task 10 set and disjoint from every other task's
owned files (`src/tui/model-menu.ts` and its test remain Task 9's; Task 11 may touch `kiki-tui-smoke.py` "only through
GUI owner" — respected). All referenced interfaces exist and are live-verified: `registerKikiMenu(ctx, settings)` /
`ModelSettings` (Task 9), `resolveOC2Roots`/`assertOC2Target`/`canonicalPath`/`pathsOverlap` (Task 3),
`readOpenCodeSettings`/model functions (Task 3 shared), `Plugin.define`/`Plugin.Context`/`Host.resolve` (installed
`@opencode/plugin@2.2.6`, contract §2/§4/§5). Sequential order is correct: the Task 9 menu contract and Task 8 registration
predate this task; Task 11 is correctly blocked on the three handoffs in §6.

## 10. Boundary confirmation

This review performed no source fix, no `dist` edit/deletion, no binary install/execution, no live/default/global-config
or credential read, no commit/tag/push/registry edit. Verification used only allowlisted commands (`npx --no-install
vitest run` focused, `npx --no-install tsc --noEmit`, `npm run lint`, `npm audit --json`, read-only git inspection and
`git diff --no-index` on the evidence inventories) plus file reads of synthetic fixtures/logs. The full suite was not
repeated; its single failure was reproduced scoped instead, per the evidence-reuse instruction.

## Final statement

**Task 10 is accepted: spec PASS, quality PASS.** The Task 2/7 full-tree TUI exception is closed (tsc/build/lint green,
independently re-verified) and both built entrypoints resolve with the installed pinned SDK. PTY/actual-binary acceptance
is explicitly **NOT VERIFIED** and must never be recorded as green; the full suite's single failure is a pre-existing
backend release-test defect (Task 7's reviewed gate removal vs. a HEAD-era stale expectation), not a Task 10 code defect,
and — together with the missing 2.2.6 binary and the stale `dist/plugin` cleanup — forms the three-item handoff the
backend owner/orchestrator must clear before Task 11 can meet its stricter zero-skip, `npm test`-green gates.
