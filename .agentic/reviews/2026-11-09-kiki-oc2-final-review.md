# Final whole-branch review — Kiki OC2 migration (Task 13 + whole-migration gate)

Date: 2026-11-10
Reviewer: `kiki-reviewer` (independent final spec + quality/security gate)

Inputs reviewed:

- Task 13 report `/tmp/opencode/kiki-oc2-task13-report.md` (121 lines, read in full) and
  task diff `/tmp/opencode/kiki-oc2-task13.diff` (950 lines, read in full — every hunk).
- Actual uncommitted working tree vs HEAD `e2bf396df5a14657f34f55c78b31819be10b9c05`
  (verified `git rev-parse HEAD`; `git status`; `git diff --stat HEAD`). Product diff =
  `src/**`, `tests/**`, `package.json`, `package-lock.json`, `dist/**`, `CHANGELOG.md`,
  `README.md`, untracked `src/cli/oc2-*.ts`, `src/server/**`, `tests/**`, `docs/migrations/**`,
  plan/spec. Excluded from product scope and **never read** by this review:
  `.agentic/kiki/TASK_REGISTRY.json`, `.agentic/kiki/routing_log.jsonl` (orchestrator/runtime),
  and `opencode.jsonc` (user-private project agent permission/model config; potentially
  credential-bearing context). No credential-bearing or live config file was opened.
- Production sources the Task 13 diff touches plus its full dependency closure:
  `src/cli/release-gates.ts` (898 lines, full), `src/cli/oc2-registration.ts` (261, full),
  `src/cli/release-policy.ts` (426, full), `src/cli/commands/release.ts` (748, full),
  `src/cli/release-candidate.ts` (739, full), `tests/helpers/release-fixture.ts` (353, full),
  `src/cli/oc2-paths.ts` (canonicalPath), `src/cli/commands/doctor.ts` (registration checks),
  on-disk `tests/integration/oc2-release-rehearsal.test.ts`, `tests/cli/release-gates.test.ts`,
  `tests/cli/oc2-registration.test.ts`, `tests/cli/doctor.test.ts`, `tests/cli/{install,tui-install,update,global-policy}.test.ts`
  (produced-spec coverage), `CHANGELOG.md`, `docs/migrations/kiki-3-oc2-acceptance.md`.
- Plan `docs/superpowers/plans/2026-11-09-kiki-opencode2-migration-plan.md` (Task 13 +
  Global Constraints + dependency schedule + self-review table, full), spec
  `docs/superpowers/specs/2026-11-09-kiki-opencode2-migration-design.md` (full), and all
  prior per-task reviews `.agentic/reviews/2026-11-09-kiki-oc2-task*-review.md` plus the
  runbook round-2, plan, release-expectation-fix and protocol-failure reviews.
- Evidence artifacts: `/tmp/opencode/kiki-oc2-task13-artifacts/` (input manifest, pack
  manifest, tarball), `/tmp/opencode/kiki-oc2-task13-rehearsal-artifacts/` (all six files),
  `kiki-oc2-task13-{tsc,lint,build,full-suite,full-suite-with-binary,required}.log`,
  `kiki-oc2-task13-audit-summary.txt`, `kiki-oc2-task13-actual-audit.json`,
  `kiki-task13-rehearsal-run8.log` and the red/iteration logs.

This review performed **no** source/config fix, no build, no install, no live/default/global
config or credential read, no commit/tag/push/registry edit, and no subagent dispatch.
Heavy rehearsal/full-suite runs were **not** duplicated: the recorded passing logs were
verified for internal consistency and cross-artifact agreement instead, per the
evidence-reuse instruction; no specific claim required a fresh heavy rerun.

## Verdicts

- **Task 13 spec compliance: PASS**
- **Task 13 quality/security: PASS**
- **Whole-branch (Tasks 1–13) final review: PASS** — with required completion conditions
  (§7) that are recording/orchestration steps, not code defects, and the honest NOT-RUN
  boundaries below.

```
Verdict: PASS
Blockers: (none)
```

Explicitly **not** certified by this review: human machine acceptance (Task 14 — live
install/migrate/provider login/dispatch//`kiki` save/rollback drill — NOT RUN), any actual
3.0.0 release (`FUTURE_RELEASE_AUTHORIZATION: NOT RUN`), and any live-machine result. The
user-reported `V1_PROTECTED`/OC2-V1-start checkpoints remain user-reported evidence, exactly
as the acceptance document records. A rehearsal PASS is not release authorization.

## 1. Task 13 independently verified claims

| Claim | Reviewer verification |
|---|---|
| HEAD unchanged, no committed implementation | `git rev-parse HEAD` = `e2bf396df5a14657f34f55c78b31819be10b9c05`; entire migration is tracked-modified + untracked; no commits/tags/pushes |
| `tsc --noEmit` 0 / `npm run lint` 0 / `npm run build` 0 | Logs read directly: `kiki-oc2-task13-tsc.log` empty; lint/build logs contain script headers with zero diagnostics |
| Full suite no binary: 40 files / 620 passed / 14 skipped / 0 failed | Log verified: `Test Files 40 passed \| 5 skipped (45)`, `Tests 620 passed \| 14 skipped (634)` |
| Full suite with real binary: 43 / 632 passed / 2 skipped / 0 failed | Log verified: `Test Files 43 passed \| 2 skipped (45)`, `Tests 632 passed \| 2 skipped (634)`; both skips are the by-design opt-in `KIKI_RELEASE_TEST_OC2_REHEARSAL` and opt-in real-TSC release tests. Count arithmetic reconciles exactly with the Task 11 post-fix baseline (628+4 new passing tests, 629+5 total): no silent test removal |
| Required 7 suites, real binary: 24/24, 0 failed, 0 skipped | Log verified: `Test Files 7 passed (7)`, `Tests 24 passed (24)` |
| Fresh audit: exit 1, 0 high/critical, 32 moderate, 454 deps, no exception | `kiki-oc2-task13-audit-summary.txt` read in full: `high 0, critical 0, moderate 32, low 0, info 0`; prod 299/dev 120/opt 30/peer 6 = 454; per-package paths/severities/fix-availability recorded; SDK lock integrity `sha512-PbQD4aN8…` identical to the Task 2/11/12-verified pin. Gate parser accepts 0/1; the 2026-11-04 V1 exception was not used, and the new `does not apply an implicit security exception to a V2 high advisory` test pins that it cannot leak in |
| Input manifest 74bccc17…: 278 files, trackedGitOnly false, opencode.jsonc excluded unread, 12 retired paths | Read directly: `schemaVersion 1`, `evidenceSet ACTUAL_V3_VALIDATION`, baseline/head `e2bf396`, package `3.0.0`, `@opencode/plugin 2.2.6` exact, `./server`/`./tui`/`.` exports + declaration paths, `bin.kiki`, `engines.node >=18.0.0`, `trackedCount 214 / untrackedCount 77 / fileCount 278`, `retiredTrackedMissing` = exactly the 12 deleted V1 source/test/dist files, `excludedLiveConfigPaths: ["opencode.jsonc"]` |
| Tarball 952be150…, 130 files, package 3.0.0, SDK 2.2.6 | `pack-manifest.json` read: `tarballSha256 952be15086d93e9ff8a62d111f9155741ef2db4c3d8e82420a6a860c3f0aef37`, `packageVersion 3.0.0`, `sdkVersion 2.2.6`; 128 dist files + `package.json` + `README.md` = 130; **no** `tests/`, `src/`, `.agentic/`, or stale `dist/plugin/` entries |
| Actual server/TUI dist hashes match rehearsal candidate hashes exactly | Cross-checked byte-for-byte across three independent recorded artifacts: input manifest, pack manifest, and rehearsal `candidate-evidence.json` all carry `dist/server/index.js 8083ca31…2236a`, `dist/server/index.d.ts 172e00c9…28f1`, `dist/tui/index.js 59e6bd78…32a5`, `dist/tui/index.d.ts 925ac675…0ce1`. Because the candidate dist was rebuilt by real `tsc` inside the disposable synthetic copy, this also corroborates source identity between the actual snapshot and the rehearsal input |
| Rehearsal run: 1 file / 1 test / 0 skipped, 348.81 s | `kiki-task13-rehearsal-run8.log` verified |
| CLI run output | `cli-release.log` read in full: `Baseline: --since e2bf396…`, `Version: 2.4.0 -> 3.0.0 (--bump major; ignored 0)`, all six gates passed, security `passed (0 high/critical; low: 0, moderate: 32…)`, `Applied: false (dry run; no checkout writes).`, `Kiki performed no commit/tag/push/publish.` `exported-release.log` is content-identical (same recorded digest) |
| Real runner, no mocks | `observed-calls.json` read in full: real git `ls-files`/`status`/`log --format… e2bf396..HEAD` in the synthetic root; real candidate-local `node …/node_modules/typescript/bin/tsc -p tsconfig.json` and `--noEmit`; real `npm test`; real candidate-local `eslint`; real `npm audit` — every command status 0 except audit (1). `fixtureRunner` confirmed in `tests/helpers/release-fixture.ts` to be a genuine `execFile` child-process runner; the rehearsal wraps it to *observe*, delegating every call |
| Candidate evidence captured before disposal | Capture hook fires on the `npm audit` gate call (5th of 6) with `options.cwd` = candidate root (`runSecurityGate` → `createAuditInvocation` sets `cwd: rootReal`); disposal happens after `prepareRelease` returns (`commands/release.ts` candidate.dispose) — the plan's "after gate commands before normal disposal" is implemented exactly |
| Recursion guard, no bypass | `testGateEnvironment` strips every `KIKI_RELEASE_TEST_*` key from the candidate `npm test` env (`release-gates.ts:464-470`, pre-existing); the test asserts the stripped env on the observed `npm test` call, so the nested suite skips the opt-in rehearsal — asserted, not assumed. Build/typecheck/lint/audit gates spawn no vitest, so no other recursion path exists |
| Version negative guards | `parseReleaseArgs(['--dry-run'])` throws `unsupported argument` (verified in `release-policy.ts:112`); `decideVersion('3.0.0', [], 'major')` → `4.0.0` via `nextVersion`'s strict-greater check — a 3.0.0 input can never produce a "3.0.0 release". `argv.apply` is false and `argv.securityException` undefined for the rehearsal invocation |
| Server JS/DTS invariant additions don't weaken old isolation | `KNOWN_DISTRIBUTABLE_OUTPUTS` gains exactly the two planned paths; `addDistributableTarget` still rejects absolute/traversal/non-`dist/` targets; `RELEASE_ARTIFACT_PREFIX` stays `dist/`; `REQUIRED_TRANSFORMED_FILES` unchanged; candidate byte-copy, symlink/`.bin` isolation (`release-candidate.ts`) and all safety-spy tests are untouched except the mirrored fixture list. The additions are strictly strengthening (missing server outputs now fail invariants even when package entrypoint fields are absent — new red→green tests on disk) |
| Synthetic provenance, no fake commits | Test verified in code: object copy (read-only `cpSync` of `.git/objects`) + `git init` + `update-ref refs/heads/oc2-rehearsal e2bf396` + private index via `git add -A`; `git log -1` = baseline, `rev-list --count` equals the checkout's, staged `ls-files` equals the materialized manifest, deleted tracked files recorded as deletions, `node_modules` copied only after staging. The development checkout's `.git/index`/refs/HEAD and `src/`/`dist/` hashed before/after and asserted unchanged; synthetic input tree asserted byte-identical after the dry run; `releaseTempRoots()` empty after disposal. The real repo's git was only read |
| Normalization: 3 byte-changed files + CHANGELOG validated no-op | `normalization.json` verified (changed = package.json, package-lock.json, src/cli/config.ts; inputs = the four release inputs; changelog unreleasedCount 1 / nonempty / no `[3.0.0]`). Actual `CHANGELOG.md` read: exactly one nonempty `## [Unreleased]`, no `[3.0.0]` heading — the four-input check is satisfied as a validated no-op, honestly reported as ruling 3 |
| No handcrafted dist | `dist/cli/release-gates.js` diff content is exactly the tsc-regenerated two-line addition; `npm run build` log clean; regenerated `oc2-registration.*` hashes (46d562f6…, 7f4928b1…) appear identically in the actual-tree manifests and the rehearsal candidate's dist manifest |

**Evidence-integrity boundary (stated honestly):** binary digests were cross-checked across
every recorded artifact for exact agreement, but were not independently recomputed by this
reviewer — no hash command is in the session allowlist (same constraint prior reviews
recorded). Internal consistency is strong: manifest ↔ pack-manifest ↔ candidate-evidence
agreement on the same digests, rehearsal candidate rebuilt from copied source reproducing
the actual dist hashes, and the working-tree file set matching the report/diff exactly.

## 2. Task 13 rulings beyond the plan's literal file list — assessed

1. **`src/cli/oc2-registration.ts` active-package recognition (production change).**
   The plan's Task 13 Files line names only `src/cli/release-gates.ts` (plus tests/docs),
   but the mandated rehearsal cannot pass its real candidate `npm test` gate without this
   change: the release candidate root is always `<runRoot>/candidate`, and the old
   name/basename-only `isKikiPluginEntry` did not recognize a checkout whose basename is not
   `kiki`, so doctor/install/update recognition failed inside the candidate. The red
   rehearsal runs exposed this with real gates, no mocks.
   **Identity/conflict-scope assessment: CORRECT, not an arbitrary self-recognition.** The
   new clause fires only when the entry is an *absolute path* that canonicalizes
   (`canonicalPath` = nearest-existing-parent realpath resolution, `oc2-paths.ts:35-50`) to
   the *same directory* as the running package. It is inert for package-managed installs
   (`currentPackageSpec()` returns the package name under `node_modules`, and a non-absolute
   spec never matches). It cannot collide with a different package (different real path) and
   a symlink to the kiki package root *is* the kiki package. It makes install/update
   idempotency, duplicate/conflict refusal (`sources.length > 1`, `samePackageSpec`
   mismatch) and `removeKikiRegistration` self-consistent for the package's own
   registration — previously removal would silently spare a candidate-named dev
   registration. The pre-existing conservative basename heuristics (Task 8 review
   observation 5) are unchanged, not broadened. No release policy, parser, candidate
   isolation, gate ordering or apply semantics were touched (`release-policy.ts` and
   `commands/release.ts` are absent from the task diff). Focused regression test added
   (`recognizes the active package path even when its directory basename is not kiki`).
   **Accepted as a necessary, minimal, transparently reported in-task ruling.** The plan's
   own fallback for rehearsal blockers ("report BLOCKED, do not replace history/runners with
   successful mocks") made this the only honest path to a green rehearsal.
2. **`tests/cli/doctor.test.ts` registers the package-name form.** Test-only. Verified that
   the produced absolute `currentPackageSpec()` registration form remains pinned elsewhere:
   `install.test.ts`, `tui-install.test.ts`, `update.test.ts` and `global-policy.test.ts`
   all assert the exact `currentPackageSpec()` entries in `opencode.jsonc`/`cli.json`
   (grep-verified, seven assertion sites), so doctor's setup change does not orphan the
   dev-spec coverage. With the production fix in place the overwrite is
   belt-and-suspenders; it does not weaken doctor's registered/duplicate assertions.
   **Accepted.**
3. **Transient `opencode.jsonc` read during early rehearsal iterations (security note).**
   The tracked root `opencode.jsonc` is the user's project agent-permission/model file, not
   a credential store, but the live-config boundary the copier should have had from the
   start was absent in early iterations: the file was read and copied into disposable
   `/tmp` rehearsal trees (never printed, committed, copied back, or persisted as evidence
   content; only path/digest metadata existed there). The final copier excludes live config
   basenames (`opencode.json(c)`, `cli.json(c)`, `auth.json`) plus secret-bearing basenames
   **by metadata before any `lstat`/read** (code order verified in
   `copyReviewedSource`), the final run's manifests record
   `excludedLiveConfigPaths: ["opencode.jsonc"]` with the path absent from the file list
   (verified in `source-manifest.json` and the input manifest), and the test asserts the
   exclusion and that no manifest path is live-config- or secret-named. **Remediation
   verified in final code and final artifacts; process lapse honestly reported.** No secret
   value was recorded anywhere in the final evidence. Early-iteration logs remain under
   `/tmp/opencode` as history and are not part of the certificate.
4. **CHANGELOG four-file normalization as validated no-op** — verified (see §1 table);
   the plan's intent (only release inputs touched; CHANGELOG in the required pre-state) is
   fully met; the letter is satisfied as a four-input check with three byte-changes,
   recorded with the evidence to prove it. **Accepted.**

## 3. Task 11 review conditions — discharged

1. Refreshed ACTUAL_V3_VALIDATION digest record for the current snapshot: **done** — the
   Task 13 certificate (input manifest `74bccc17…`, dist manifest `f0da220c…`/128 files,
   tarball `952be150…`, pack manifest `14005d97…`) supersedes the Task 11 post-fix set
   (`edcae219…`/`3533b42f…`/`603f7a80…`), which is retained and reconfirmed as history
   (report §4.2; artifacts still present).
2. Post-fix full-suite-with-binary standing evidence: **done and superseded** — 632/2/0 on
   the final snapshot.
3. Task 13 reconfirmation targets the final snapshot with the fresh audit: **done** —
   Task 13's own source edits triggered the plan-line-335 invalidation rule and the full
   Task 10/11-equivalent checks were rerun on the final tree (tsc/lint/build, both full
   suites, required 24/24, real pack, audit).
4. release-gates 5 s flakiness watch: no recurrence in any Task 13 run.
5. No further code changes requested; any later change restarts 1–3 — the historical
   artifacts remain intact for that comparison.

## 4. Whole-branch review (Tasks 1–13, uncommitted tree vs `e2bf396`)

- **Dependency/parallelization logic:** hard chain architect review → Task 1 (`V1_PROTECTED`,
  user-reported) → 2 → 3 → {4, 6, 9 parallel, disjoint source ownership} → 5 → 7 → 8 → 10 →
  11 → 12 → 13 is fully released with per-task PASS reviews on file; Task 14 correctly
  waits on {1, 11, 12, 13}. No circular `depends_on`; all referenced modules/exports exist
  and were live-verified in the rehearsal (real `tsc`/`npm test` against the packaged
  closure). Task 13's files are disjoint from Task 14's acceptance-only update.
- **Global constraints held** (verified per-task previously and spot-checked here): version
  3.0.0 + `KIKI_VERSION = '3.0.0'` (verified in `src/cli/config.ts:74`) and
  `@opencode/plugin@2.2.6` exact with unchanged lock integrity; `engines.node >=18` and the
  dev/lint range unchanged; no model seeding (models only in `agents.<id>.model`); no
  top-level `permissions` ever written; JSONC/permissions/user settings preservation;
  fail-closed OC1 guards and migration; no V1 security-exception reuse (fresh audit, no
  exception supplied); German TUI copy preserved; no new features beyond equivalence — the
  only production behavior changes are the migration's reviewed equivalence port plus the
  two Task 13 items assessed in §2.
- **Scope check of the actual tree:** tracked product diff + untracked V3 files match the
  plan's file map; `src/plugin/{watchdog,dedup}-source.ts`, their 8 tracked dist outputs
  and the 2 obsolete dedup tests are gone (git-status D entries + manifest
  `retiredTrackedMissing` + tarball free of `dist/plugin/`) — **stale V1 packaging dist is
  fully retired**. Pre-existing dirty files (registry, routing log, user `opencode.jsonc`)
  are preserved untouched and are not part of the product diff.
- **Review Focus conditions (plan §Review Focus):** all five verified green in prior
  reviews — symlink-into-OC1 refusal (Tasks 3/11), ordered permission overlap (Tasks 4/5/11
  incl. real-binary evaluation), invalid-agent/conflicting-destination transaction (Task 5),
  stale menu promise/cancellation (Tasks 9/10/11 PTY), watchdog cleanup races (Tasks 6/7/11
  incl. real interrupts and reload).
- **Documentation:** Task 12's five documents verified accurate at their baseline; the
  acceptance matrix keeps the three evidence sets separate and honest — and still records
  Task 13 items as pending, which is now superseded by fact but not yet by text (§7 item 1).

## 5. Deferred-item triage (previous reviews → final disposition)

1. **Source top-level `permission` with a definition-less Kiki agent (Task 5 obs. 1):**
   still open as designed behavior. Conservative direction only — the untouched agent gets
   the Task 8 baseline file (narrower than V1-with-top-level-overrides), every agent the
   transaction touches accounts for the top-level map or is rejected, and real OC1 Kiki
   installs define all eight agents (verified install layout, spec §3), so reachability is
   nil for the planned live migration. **Accepted as bounded; recommend** any future
   migration-owning change *reports* (not just silently skips) definition-less Kiki agents
   when a top-level permission exists. Related Task 5 obs. 2 (silently skipped top-level
   model defaults in global mode) — same safe-direction, accepted.
2. **Model variant merges/no-op:** Task 3 obs. 1 (stale-variant tier merge) **resolved** by
   Task 5's whole-model replacement. Residual Task 9 obs. 1 (inherited-row same-string
   selection is a no-op with a "gespeichert" toast; fewer writes, conservative) —
   **accepted**; the intended semantics should be confirmed during Task 14's human
   `/kiki` save/removal drill (human question 4).
3. **Ancestor validation / tier canonicalization (Task 3 obs. 2/3/11/12):** accepted
   bounded refinements (post-removal ancestor validation ordering, lexical ancestor walk,
   `config.json` not in the OC2 candidate list, EACCES companion test). No demonstrated
   real-behavior failure; Task 11's real-binary tier/migration runs were green. Remain
   with their owning code for any future change; **not** migration blockers.
4. **Native prompt-body ownership on install/update (Task 8 obs. 1):** bodies regenerate
   from the baseline template on `kiki install/update` (frontmatter models/permissions
   preserved; backup first) — V1-equivalent semantics, explicitly **not** certified as the
   final ownership decision by any review. Documented as open in CHANGELOG, README, runbook
   §6.12 and acceptance §7. **Genuine open human decision** (human question 1).
5. **Dropped SemVer full-consumption meta-guard (Task 8 obs. 2):** Task 13 did not re-pin
   the `matchesEntire`/trailing-terminator test matrix; justification verified — no owning
   test failed, `parseVersion` is unchanged across the migration, and Task 11 added a
   `normalizeVersion` regression for the observed-version check. **Accepted as a bounded
   test-coverage gap owned by the next doctor/release-test-touching change** (restore the
   source-text assertion or an equivalent behavioral pin then). Not an acceptance
   criterion for this migration.
6. **Duplicate/kiki-named plugin basename misclassification (Task 8 obs. 5):** unchanged
   conservative heuristics; Task 13's exact-identity clause (§2.1) does **not** broaden
   them. Accepted, low practical risk.
7. **"Update privilege / grant absence":** no deferred review item exists under this exact
   title anywhere in the review record (searched all reviews/reports/docs). The
   substantiated adjacent facts, all verified: (a) the apply/update privilege was
   deliberately **absent** throughout Task 13 — the rehearsal ran with no `--apply`
   (asserted `Applied: false`; `--apply` remains future-owned and the session rules even
   deny it), and no copy-back occurred; (b) the OC2 self-update privilege is deliberately
   disabled in the isolated machine config (`update: "disable"` before first launch,
   runbook §5.2 line 600) — human-applied at machine setup, which is part of the NOT-RUN
   machine steps; (c) package-plugin updates are user-owned (`opencode plugin add
   kiki@3.0.0`), never automated by Kiki; (d) the earlier missing project permission
   grants for tracked-dist cleanup were explicitly user-authorized, consumed, and the
   cleanup is verified complete. If the user meant a different specific item, it is not in
   the written record and should be named (see human question 5).
8. **Stale V1 packaging dist all gone:** **verified resolved** (§4 scope check).
9. **Other carried, accepted items** (unchanged, no action): Task 6 discovery
   >100-children pagination gap (implementation loops the cursor; real fixtures
   discovered children), Task 6 equivalence decisions, Task 8 obs. 3/4 (legacy models
   section, stale `tui.json` silence), Task 9 obs. 2/3, Task 10 obs. 1–5, Task 11 §5.2
   (Task-8-owned doctor files edited in Task 11 with regression; fixture `versionCache`),
   Task 12 obs. 1–4 (README `kiki update` ordering nit, pager note, clean-shell check
   scope, /tmp-path references with in-repo digests), Task 3 obs. 4–10, Task 2 obs. 1–6
   (Task 11/13 discharged the clean-consumer and fresh-audit items).

## 6. Checklist

- **Security scan:** implementer ran the default security command (`npm audit --json
  --include=dev --include=optional --include=peer`; no `.agentic/kiki/config.json` exists)
  on the actual final graph with synthetic npm configuration that cannot consume user
  credentials (synthetic HOME/XDG, empty 0600 user/global npmrc, stripped
  `npm_config_*`/token vars, refusal on root `.npmrc`): **0 high, 0 critical, 32 moderate**,
  exit 1 with a complete payload (expected, non-blocking). No high/critical finding exists
  to fix or except. Reviewer secret-scan of the Task 13 diff/artifacts: only synthetic
  fixtures, `rehearsal@example.invalid`, public digests.
- **Linting compliance:** `npm run lint` exit 0 (log clean), `tsc --noEmit` exit 0 (empty
  log); no lint warnings or errors remain in changed files.
- **Parallelization logic:** no circular `depends_on`; all references exist; parallel task
  source ownership disjoint; Task 13 sequential after 11+12, before Task 14. ✓

## 7. Required completion conditions (not blockers; recording/orchestration steps)

1. **Historian final evidence update:** record Task 13's results in
   `docs/migrations/kiki-3-oc2-acceptance.md` (+ CHANGELOG/README evidence sections):
   ACTUAL_V3_VALIDATION PASS on the final snapshot with the new certificate
   (input manifest `74bccc17…`, dist manifest `f0da220c…`, tarball `952be150…`, pack
   manifest `14005d97…`, tsc/lint/build 0, 632/2/0 with binary, 24/24 required, fresh
   audit 0 high/critical/32 moderate/no exception), marking the Task 11 post-fix digests
   superseded by the Task 13 edits; RELEASE_REHEARSAL PASS (synthetic, run8, no apply);
   FUTURE_RELEASE_AUTHORIZATION remains NOT RUN. The plan's Task 13 file list includes
   "update acceptance report" — the implementer correctly left historian-owned docs to the
   historian (report §7); until this update the standing document still says "pending
   Task 13", which is stale relative to fact.
2. **Orchestrator registry:** record Task 13 completion only after item 1, per the plan's
   documentation-completion rule; Task 14 remains blocked on human execution.
3. **Any further source change** (including the historian's docs-only edits are exempt)
   restarts the actual-evidence obligations per plan line 335; the rehearsal never
   substitutes for them.

## 8. True human questions (for Task 14 / release decision)

1. **Prompt-body ownership (open decision, documented everywhere):** should user edits to
   Kiki-owned global agent prompt *bodies* survive `kiki install/update`? Current behavior:
   bodies regenerate from the baseline template (backup kept; frontmatter models/permissions
   preserved). V1-equivalent, but the final ownership boundary is yours to confirm or
   change post-switch.
2. **Audit posture:** 0 high/critical, 32 moderate (dev/transitive tooling chains plus one
   prod-transitive moderate via `@opencode/plugin → @opencode/util`; "fix" would require
   leaving the pinned 2.2.6). Confirm you accept the 32-moderate posture for 3.0.0 with no
   exception (the gate already treats it as non-blocking).
3. **Task 14 machine acceptance (all NOT RUN):** live isolated `kiki install`, sanitized
   `--from` migration, `kiki doctor`, one real orchestrator→subagent dispatch, `/kiki`
   save/removal, V1 smoke, rollback drill, provider login, and the `update: "disable"` /
   isolation-variable verification — followed by your explicit ACCEPT/SWITCH, RETAIN OC1,
   or ROLLBACK decision.
4. **`/kiki` inherited-row no-op semantics:** selecting the currently-effective (inherited)
   model string writes nothing (fewer writes; toast still says "gespeichert"). Confirm this
   is the intended UX during the Task 14 drill.
5. **"Update privilege grant absence":** if this named a specific deferred item beyond the
   three verified facts in §5.7 (no `--apply` privilege granted; `update: "disable"` pin at
   machine setup; user-owned `opencode plugin add`), please identify it — no such titled
   item exists in the written review record.
6. **Eventual actual release:** FUTURE_RELEASE_AUTHORIZATION remains NOT RUN. Before any
   real 3.0.0 release, the plan requires a separately reviewed, explicitly user-authorized
   procedure (release workspace/input version, exact commands, provenance comparison against
   the accepted final snapshot, fresh full validation, any apply/copy-back). Nothing in
   Task 13 selects or authorizes it.

## 9. Review boundary

Read-only review plus writing this one file to the permitted review location. No source,
test, dist, config, registry, routing-log or documentation edits; no builds; no installs;
 no binary execution; no live/default/global config or credential reads (`opencode.jsonc`
never opened); no commits, tags, pushes, registry or npm actions; no subagent dispatch.
Verification used the allowlisted read commands (`git rev-parse/status/diff/log/ls-files`),
direct file reads of the tree and `/tmp/opencode` evidence, and the recorded logs; heavy
rehearsal and suite runs were intentionally not duplicated.
