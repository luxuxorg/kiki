# Task 11 review — real-binary packaged integration, policy and isolation acceptance (+ GUI `/kiki` reachability fix)

Date: 2026-11-10
Reviewer: `kiki-reviewer` (independent gate)
Inputs: plan Task 11 + Global Constraints + Review Focus
(`docs/superpowers/plans/2026-11-09-kiki-opencode2-migration-plan.md`), Task 11 report
(`/tmp/opencode/kiki-oc2-task11-report.md`) + diff (`/tmp/opencode/kiki-oc2-task11.diff`, 2354 lines),
GUI-fix report (`/tmp/opencode/kiki-oc2-menu-global-fix-report.md`) + diff
(`/tmp/opencode/kiki-oc2-menu-global-fix.diff`, 51 lines), evidence manifests
(`/tmp/opencode/kiki-oc2-task11-artifacts/`, `/tmp/opencode/kiki-oc2-menu-global-fix-artifacts/`),
all cited logs, and the actual working tree. Prior reviews for Tasks 2–10 consulted for
deferred-observation triage.

No source fix, registry edit, global-config/credential read, install, commit, tag, push, or
release was performed by this review. Verification used only allowlisted read/test commands;
all test execution ran against disposable synthetic roots and the explicitly supplied raw binary.
Pre-existing dirty files (registry, routing log, earlier-task changes) preserved untouched.

## Verdict

- **Spec compliance: PASS** (conditional — final verification requirements below must be completed
  before/with Task 12/13; none require code changes)
- **Quality/security: PASS**

Task 11's real-binary acceptance substance is met on the current bytes: the GUI-owned PTY blocker
was fixed through the published `KeymapLayer.mode` contract with genuine TDD, the required
seven-suite integration command now passes **24/24 with 0 skips** against the real pinned 2.2.6
binary, and this reviewer independently re-ran the **full suite with the real binary post-fix:
43 files passed / 1 skipped (44), 628 tests passed / 1 skipped (629), 0 failed** (vitest 4.1.0,
2026-11-10 10:52, 85.8 s). The single skip is the by-design opt-in
`KIKI_RELEASE_TEST_OC2_REHEARSAL` gate (plan line 339), not a required-scenario skip.

## 1. Independently verified claims

| Claim | Reviewer verification |
|---|---|
| Binary probe: isolated HOME + all four XDG roots + explicit `OPENCODE_CONFIG_DIR`, version exactly 2.2.6 | `requireOC2Binary` (`tests/helpers/oc2-fixture.ts:82-108`) probes in a disposable root with a whitelisted child env; regex `^(?:opencode\s+v)?(\d+\.\d+\.\d+)$` compared to `OC2_VERSION = '2.2.6'`; anything else refuses. Child env whitelist confirmed: only PATH + synthetic roots/locales reach children — no inherited auth/provider/config variables |
| Required command pre-fix: 6 files pass / 1 fail, 23 pass / 1 fail / 0 skip | `/tmp/opencode/kiki-oc2-task11-required.log` reproduces exactly; the failure is the real PTY test with the genuine `No matching commands` screen for `/kiki` and real-binary footer `2.2.6` — authentic defect evidence, not a synthetic failure |
| Required command post-fix: 7 files / 24 tests / 0 failed / 0 skipped | `/tmp/opencode/kiki-oc2-menu-global-fix-required.log`: `Test Files 7 passed (7)`, `Tests 24 passed (24)`, 28.34 s. Test-count math verified against the suites (3+2+3+3+6+3+4 = 24) — no silent fixture substitution; all `skipIf(!hasOC2Binary())` suites ran under the binary |
| PTY menu: 3/3, zero LLM/provider requests | `/tmp/opencode/kiki-oc2-menu-global-fix-pty.log`: 3 passed, 12.23 s. The test's loopback provider returns 500 on any hit and asserts `requests.count === 0` (`tests/integration/kiki-tui.test.ts:136`) after all three flows — the assertion is meaningful because the fixture provider is the configured model backend for the menu's fixture models. Smoke script drives the real TUI with the German copy (`Modell ändern — global`, `gespeichert`, `zurückgesetzt`, `Alle lokalen Modell-Zuordnungen löschen?`) and proper teardown (SIGTERM→SIGKILL, fd close) |
| Full-tree gates | Reviewer re-ran on the current tree: `npx --no-install tsc --noEmit` → zero diagnostics; `npm run lint` → clean. Matches menu-fix logs (`-tsc.log` empty, `-build.log`/`-lint.log` script headers with no errors) |
| Full suite without binary: 616 passed / 13 skipped, exit 0 | `/tmp/opencode/kiki-oc2-task11-full-suite.log` matches |
| Full suite with binary: 626 / 1 skipped / 2 failed (pre-fix) | `/tmp/opencode/kiki-oc2-task11-full-suite-with-binary.log` matches exactly: PTY defect + `release-gates > blocks a dev-only high advisory despite NPM_CONFIG_OMIT=dev` 5000 ms timeout under parallel load |
| **Full suite with binary post-fix** | **Reviewer ran `OPENCODE_TEST_BINARY=/home/lutz/.opencode/bin/opencode npx --no-install vitest run`: 43 files passed / 1 skipped (44), 628 tests passed / 1 skipped (629), 0 failed.** This closes the report's §7 "final full-suite evidence" gap: the PTY defect is gone and the release-gates test passed under the same parallel load that produced the pre-fix timeout (confirming flakiness, not product failure) |
| Package/pack/consumer | `oc2-package.test.ts` verified in tree + diff: `npm pack --ignore-scripts` with a sanitized synthetic npm env (synthetic `npmrc`/globalrc/cache; user npm config never read), install `--omit=dev --ignore-scripts` into a disposable consumer; asserts production-only graph (no vitest/typescript in consumer, no `node_modules` inside the package dir), `kiki/server` import + `Host.resolve` from the consumer without the checkout on module resolution paths, and the real binary completing a fixture agent run with the packed plugin (`Packed package running`). Tarball excludes `tests/` and `.agentic/` |
| Watchdog (real, not mocked) | Foreground + background held child streams: provider-observed abort (`heldAborted() > 0`), `session export --sanitize --standalone` proving `info.parentID` + `info.outcome: 'interrupted'`, health log `watchdog-quiet`/`watchdog-abort` (`reason: 'stuck'`, child session id, agent)/`watchdog-abort-ok`, exactly one routing entry each. Background test additionally proves the parent answered before the cancellation notification (≥3 parent requests + cancelled-subagent notification), i.e., tracking continued after parent idle |
| Reload / duplicate registration | Two fixture plugin revisions: exactly one log entry per dispatch (2 total after reload), rev2 setup marker present (old subscription stopped), `kiki doctor` exits nonzero with `duplicate Kiki server plugin sources` |
| Routing format unchanged | Entry keys asserted exactly `['agent','model','timestamp']` (no domain/risk fields); `model: 'unknown'` matches the Task 7 logger contract for dispatch without explicit model; foreground and background identical shape |
| Policy is real evaluation, not shape-only | `opencode-global-agents` policy test: agent-file `edit:*:deny` precedes config `edit:src/**:allow` (index-ordered assertion), top-level `shell:*:ask` + `webfetch:*:deny` merged into every kiki agent; actual tool outcomes asserted — `src/allowed.txt` and `.worktree/allowed.txt` edits completed, `secret/denied.txt` edit errored with bytes unchanged, `shell` ask rejected in standalone run |
| Isolation / migration | All four OC1-shaped roots snapshot-digested before/after real `install` + `debug paths` + run — identical; OC2 fixture roots received activity (non-vacuous). Credential-bearing source refused before writes; presence-only credential check proven with an fs-patching `--require` child that throws on any `auth.json` read (`doctor` passes, sentinel bytes unchanged). Symlinked OC1 config alias refused by `assertOC2Target` and migration before writes. Project-tier: Kiki-only local files backed up and removed after success; rejected agent keeps files/destination/marker untouched; markerless rerun fails closed until `--force` fresh backup. Source bytes/modes byte-identical; 0700 backup dirs, 0600 manifests |
| Teardown, no leaks | No `/tmp/kiki-oc2-fixture-*` or `/tmp/kiki-oc2-package-*` roots remain — before this review and after the reviewer's own full-suite run. Fixture cleanup removes roots; provider `stop()` destroys tracked sockets; PTY fixture kills its child |
| Security scan | Implementer's secret scan claim (§4) independently spot-checked: no `sk-`/`ghp_`/`AKIA`/private-key patterns in the new/changed test files; only synthetic `fixture-placeholder` credentials and `DO-NOT-READ` sentinels. No secret-bearing file is read anywhere in the harness |

## 2. GUI `/kiki` reachability fix review

- Root cause matches the published V2 contract: `KeymapLayer.mode` defaults to `base`, which the
  prompt's slash completion cannot reach; the pre-fix PTY log's real `No matching commands` screen
  is authentic. Fix is exactly `mode: 'global'` in the `ctx.keymap.layer` factory
  (`src/tui/model-menu.ts:286-298`), plus a regression assertion `expect(f.layerMode).toBe('global')`
  in the existing command-registration test — 2 owned files, no UI redesign, no harness change.
- TDD is genuine: RED log shows the exact new assertion failing (`expected undefined to be 'global'`)
  before the source change; GREEN 23/23; focused rerun after `npm run build` 23/23.
- Real-binary evidence post-fix: PTY 3/3 (`kiki-tui.test.ts`), required seven suites 24/24/0-skip.
  The pre-fix §7 disposable-dist proof (`pty-with-gui-fix-transcript.txt`, 3 PASS lines) was a
  probe only and correctly did not modify repository source/dist; the in-repo fix plus rebuild
  supersedes it.
- `dist/tui/model-menu.js` contains `mode: 'global'` (line 268); build regenerated only the
  expected `dist/tui/model-menu.*` artifacts.

## 3. Review Focus coverage (Task 11-relevant cases)

1. **Symlink into OC1 root** (`oc2-isolation`): symlinked alias of the OC1 config root refused by
   both the path guard and migration before any write; OC1 file bytes unchanged. ✓
2. **Ordered permission overlap** (`opencode-global-agents`): deny-before-allow ordering asserted
   on the resolved rule list and proven by actual allow/deny/ask execution outcomes. ✓
5. **Watchdog cleanup/reload** (`oc2-watchdog`): old subscription stops on reload; exactly one
   routing entry per dispatch; duplicate registration diagnosed; real interrupts with outcome
   `interrupted` and health records; no post-cleanup resurrection observed in the real runs. ✓
   (Focus 3 was Task 5's gate and remains covered there; Focus 4 was Tasks 9/10's and is covered by
   the 23 unit tests + the now-green PTY.)

## 4. Checklist

- **Security scan:** implementer ran a secret scan over all new/changed files; reviewer
  independently spot-checked the new harness/test files — no findings. Credential boundary
  (presence-only checks, fs-patch spy, sanitized npm env, whitelisted child env) verified in code.
- **Linting compliance:** `npm run lint` exit 0 (implementer logs + reviewer re-run clean);
  no lint warnings in changed files. `tsc --noEmit` zero diagnostics (reviewer re-run).
- **Parallelization logic:** Task 11 `depends_on: ['Task 5','Task 7','Task 8','Task 10']` — all
  released (prior reviews PASS). No circular chains; all new helper/provider/interface references
  exist and resolve. Task 11's created/modified files match the plan's file map; the PTY fixture
  was touched only through the GUI owner (Task 10/11 boundary respected).

## 5. Findings

### 5.1 STALE ACTUAL_V3_VALIDATION digests (flagged; drives final verification requirements 1–3)

The Task 11 report §4's digest set describes the **pre-GUI-fix snapshot**:
tarball `2f2071…`, input manifest `d6a214e…`, dist manifest `d37df11e…` (128 files,
`dist/tui/model-menu.js` = `e844f3cb…`, 11078 bytes). The GUI fix changed
`src/tui/model-menu.ts`, `tests/tui/model-menu.test.ts`, and regenerated
`dist/tui/model-menu.*` — a post-Task-11 source change that per plan line 335 invalidates
affected actual evidence. The invalidation rerun **was** performed (build/tsc/lint, focused GUI
suite, real PTY, the required seven-suite command 24/24, and now the full suite with binary via
this review), and the package **was** repacked: `/tmp/opencode/kiki-oc2-menu-global-fix-artifacts/`
holds the current certificate — tarball sha256 `edcae219…`,
`dist/tui/model-menu.js` = `ebce6501…` (11257 bytes), `sdkVersion 2.2.6`, `packageVersion 3.0.0`
(generated 2026-11-10T09:48:15Z, i.e., inside the green required-suite run). However:

- No refreshed **input manifest** (source digests including the two GUI-fix files) exists for the
  post-fix snapshot; the old input manifest's `task11Files`/`untrackedV3Files` do not contain
  `src/tui/model-menu.ts` at all.
- The Task 11 report §4 still presents the old digests without a "superseded" marker.
- The GUI-fix report calls the new artifacts directory "disposable fixture output" — yet it holds
  the only fresh dist/tarball digest record for the current actual snapshot. Deleting it as
  disposable would leave the stale pre-fix digests as the sole record before Task 13's
  reconfirmation.

No dishonest claim was made anywhere (the chain of reports is accurate about what ran when), so
this is an evidence-record completion requirement, not a failed criterion.

### 5.2 Nonblocking observations

1. **Task-8-owned file edited in Task 11:** `src/cli/commands/doctor.ts` + `tests/cli/doctor.test.ts`
   (+ regenerated `dist/cli/commands/doctor.*`) are outside Task 11's Files list (file map assigns
   them to Task 8). The change (`normalizeVersion` accepting the real binary's `opencode v2.2.6`
   prefix as exactly 2.2.6) is small, transparently documented (report §9), unit-tested with a new
   regression, and serves Task 8's "exact observed OC2 version and mismatch" diagnostic honesty
   against the real binary. Accepted as a bounded in-task necessity; should have been called out as
   a Task-8-owned file amendment in the report header.
2. **release-gates 5 s default timeout flakiness:** one pre-fix full-suite run produced a 5000 ms
   timeout in `blocks a dev-only high advisory despite NPM_CONFIG_OMIT=dev` under parallel load
   with the 40 s PTY test; it passed alone (report claim, consistent) and passed in this review's
   post-fix full-suite run under the same parallel posture. Latent flakiness only — if it recurs,
   serialize or raise that single test's timeout in the release-owning task (Task 13 scope); no
   product failure. No dedicated log exists for the claimed standalone 73/73 run — the
   post-fix full-suite evidence now covers the concern.
3. **V1 `<config>/plugins/kiki.ts` marker:** isolation tests prove OC1 plugin files are untouched;
   duplicate/legacy V1 plugin handling was accepted in earlier reviews; nothing new for Task 11.
4. **`versionCache` in the fixture helper** maps binary→binary (trivial); harmless.

## 6. Deferred-observation triage (Task 3/6/8/9 + carried Task 4/10 items)

All triaged items are **bounded observations of existing accepted behavior** — none authorizes a
new feature (Global Constraint "No new features beyond equivalence" holds):

- **Task 3, item 1 (mergeSettings stale-variant merge):** RESOLVED earlier — Task 5 delivers
  whole-model replacement in both `mergeSettings` and migration tier merge (verified in the Task 5
  review). Closed; no Task 11 action.
- **Task 3, item 9 (variant stripping on menu re-save):** mitigated by Task 9's no-op guard on
  unchanged selections; residual semantics = Task 9 observation 1 (below). Accepted.
- **Task 3, items 2/3/8/11/12 (ancestor-validation ordering, lexical ancestor walk, whitespace
  IDs, `config.json` marker, EACCES companion test):** accepted bounded refinements; no
  real-behavior failure demonstrated; remain with their owning tasks. Not Task 11 blockers.
- **Task 6, observation 1 (discovery pagination cursor):** ADDRESSED in implementation — the
  adapter loops `cursor.next` with `limit: 100` and is unit-tested; Task 11's real fixtures
  discovered child sessions successfully. A real >100-children multi-page run was not constructed —
  accepted as a bounded real-binary gap (the primary `session.created` event path is unaffected);
  carried, not expanded. Do not build a synthetic >100-child binary scenario in Task 11.
- **Task 6, observation 2 (mid-abort-loop terminal window):** outcome-equivalent-or-better;
  optional one-line hardening only. Accepted.
- **Task 6, observations 4–7 (alias duplication, union shorthand, `usage.recorded`, `Math.imul`):**
  accepted as documented equivalence decisions. No action.
- **Task 8, observation 1 (install/update rewrites user-edited agent markdown bodies, with
  backup):** accepted as existing V1-equivalent "refresh prompts" semantics; explicitly **not**
  certified here as the final ownership decision — carried to the Task 13/14 owner/human gate.
  Bounded; no Task 11 change requested.
- **Task 8, observation 2 (dropped SemVer full-consumption meta-guard):** carried to the
  release-owning task (Task 13); not re-pinned in Task 11 (release-test scope). Accepted.
- **Task 8, observations 3–5 (legacy models section, stale tui.json silence, kiki-named plugin
  misclassification):** accepted informational/conservative-direction notes.
- **Task 9, observation 1 (inherited-row same-string selection is a no-op; toast wording):**
  conservative direction (fewer writes), matches the Task 3 "unchanged selections" ruling; the PTY
  scenario still does not exercise this path (it selects a different model). Accepted real
  behavior; carry to Task 14's human `/kiki` save/removal acceptance — do not add a new PTY
  scenario as a feature.
- **Task 9, observations 2–4:** resolved by construction (audit precedent; test-name nit; entrypoint
  ownership closed in Task 10).
- **Task 4 deferral (exhaustive per-template glob matrix):** Task 11 exercised real binary
  deny/allow/ask for secret, `src/**`, `.worktree/**`, and top-level appended rules; the exhaustive
  matrix correctly remains Task 4 fixture coverage. Accepted split.
- **Task 10, observations 1–5 (prose miscount, transitive PTY assertion, location-retraction
  wording, inherited-row pin, disposed host-peer fixture):** all accepted; the real-binary run is
  now the final authority and it is green.

## 7. Final verification requirements (conditions of this PASS)

1. **Refresh the ACTUAL_V3_VALIDATION digest record for the current post-fix snapshot before Task
   12 records Task 11's numbers:** regenerate the input manifest (source digests including
   `src/tui/model-menu.ts` and `tests/tui/model-menu.test.ts`) plus dist/tarball digests, or amend
   the Task 11 record to mark §4's digests **superseded by** the post-fix pack manifest
   (`edcae219…` tarball set). The `/tmp/opencode/kiki-oc2-menu-global-fix-artifacts/` pack manifest
   must be preserved (or its digests copied into a durable evidence record) — it is the current
   actual-package certificate, not disposable.
2. **Record a post-fix full-suite-with-binary run in the standing evidence** (this review's run:
   2026-11-10 10:52, `OPENCODE_TEST_BINARY=/home/lutz/.opencode/bin/opencode npx --no-install
   vitest run` → 43 files passed / 1 skipped (opt-in rehearsal gate), 628 passed / 1 skipped (629),
   0 failed), or rerun it under the implementer's own evidence; the standing record must not stop
   at the pre-fix 2-failure run.
3. **Task 13's "reconfirm Task 11's actual input/dist/tarball digests" must target the post-fix
   snapshot** and run the fresh audit on it (plan line 335 already mandates this after any
   post-Task-11 source change; the GUI fix is such a change and its rerun obligations are
   otherwise discharged).
4. **release-gates flakiness watch:** if the 5 s-default-timeout failure recurs in any future
   full-suite run, serialize that suite or raise the single test's timeout in the release-owning
   task; do not treat a load-induced timeout as a product regression without a failing assertion.
5. No further code changes are requested by this review; any later change to the validated source
   restarts requirement 1–3 per the plan's invalidation rule.

## 8. Boundary confirmation

This review performed no source fixes, no registry/routing-log edits, no builds beyond the
allowlisted verification commands, no installs, no live/default/global-config or credential reads,
no commits/tags/pushes, and no subagent dispatch. All reviewer test execution used the explicitly
supplied raw 2.2.6 binary against disposable synthetic HOME/XDG roots. The pre-existing dirty
working tree (earlier-task files, registry, routing log) is preserved as required. The reviewer's
full-suite run left only disposable pack artifacts under `/tmp` (fixture roots all cleaned).
