# Release-expectation-fix review — pre-Task-11 backend repair of `tests/cli/release.test.ts`

Date: 2026-11-09
Reviewer: `kiki-reviewer` (independent scoped spec + quality review)

Inputs reviewed:

- `/tmp/opencode/kiki-oc2-release-expectation-fix.diff` (+6/−3, read in full) and
  `/tmp/opencode/kiki-oc2-release-expectation-fix-report.md` (read in full).
- Actual tree: `tests/cli/release.test.ts` (1329 lines, read in full — working-tree `git diff HEAD` for the file is
  byte-identical to the task diff, same blob hashes `0398297..3b83fde`, hunks `@@ -202,7 +202,6 @@` and
  `@@ -717,13 +716,17 @@`; the file's entire delta vs HEAD is this task's edit), production baseline
  `src/cli/release-gates.ts` (896 lines, read in full).
- Mandating review: `.agentic/reviews/2026-11-09-kiki-oc2-task10-review.md` (§5 determination, §6 item 2 blocker).
- Corroborating reviews: Task 7 review (§ ruling: `checkGeneratedPlugin()` stamp-check removal is the reviewed,
  no-weakening baseline), plan review (line 46: `runCandidateGates` returns exactly the six gates),
  Task 2 review (`.agentic/kiki/config.json` absent → no project-specific security command).
- Evidence logs: red/green/fulltest/tsc/lint under `/tmp/opencode/kiki-oc2-release-*.log`.

## Verdict: PASS

The fix is the exact repair the Task 10 review mandated, scoped to one file, evidence-genuine, and it
**strengthens** rather than weakens the release-test invariant. Task 11's `npm test` blocker from Task 10 review §6
item 2 is cleared; the other two Task 11 handoffs (2.2.6 binary, stale `dist/plugin` cleanup) remain open and are
correctly **not** claimed green by this report.

## 1. Independent verification re-run by this reviewer

| Check | Result | Report claim |
|---|---|---|
| `npx --no-install vitest run tests/cli/release.test.ts` | **1 file / 33 passed (33), exit 0** — independently re-run | green 33/33 ✅ |
| `npx --no-install tsc --noEmit` | **exit 0, zero diagnostics** (no output) — independently re-run | tsc 0 ✅ |
| `npm run lint` | **exit 0, no findings** (project lint = `eslint "src/**/*.ts"`) — independently re-run | lint clean ✅ |
| `npm audit --json --include=dev --include=optional --include=peer` (reviewer-run; diff changes no manifest) | **0 high / 0 critical / 32 moderate** — byte-identical posture to the Task 7–10-reviewed graph (vitest/@vitest/mocker, glob/minimatch, `@npmcli/*` via `@opencode/util`, typescript-eslint; all dev/transitive tooling) | no audit line in report (see obs. 1); no high/critical exists to fix ✅ |
| Full suite | **not re-run** per instruction; log assessed: `39 passed / 2 skipped` files, **614 passed / 3 skipped (617)** — totals identical to the Task 10-era run (613+1 failed+3 skipped = 617): exactly the one stale test flipped fail→pass, zero tests added/removed | 614/617 ✅ |
| `git status` / `git log` | HEAD still `e2bf396`, no commits/tags/pushes; the only delta to the file set vs the Task 10 review's recorded status is `M tests/cli/release.test.ts`; all prior Task 2–10 dirty files preserved | boundary ✅ |
| RED log authenticity | `1 failed / 32 passed (33)` at exactly old line 726 `expect(pluginCalls).toHaveLength(1)` → `expected [] to have a length of 1 but got +0`; line numbers in the stack (724/725/726) match the pre-change file layout; signature identical to the Task 10 review's scoped reproduction | genuine RED ✅ |

## 2. Correct baseline (Task 7) — confirmed against production

`src/cli/release-gates.ts` on disk: `GateResult['name']` is exactly `'build' | 'test' | 'typecheck' | 'lint' |
'security' | 'invariants'` (line 26); `runCandidateGates()` returns exactly `[build, test, typecheck, lint,
security, invariants]` (line 884); security spawns `npm audit`, invariants is in-process (`checkInvariants` spawns
nothing). A repo-wide grep finds **no** `release-gate-check.mjs` in any `src/` or production file — the only
occurrences are the two inert out-of-scope test stubs (see obs. 2) and this task's new zero-call assertion. The
test's new expectation (`retiredPluginGateCalls` length 0) is the only expectation consistent with the reviewed
production baseline; restoring the old `1` would require un-reviewing Task 7's approved removal.

## 3. Coverage retained / strengthened — no lost assertions, no hidden failures

- **Stub removal is safe and strengthening:** the deleted `createRunner` branch
  (`if (tool.endsWith('release-gate-check.mjs')) return ok(...)`) was dead — production never spawns that
  subprocess post-Task 7. With it gone, any hypothetical re-introduction falls through to the runner's
  `throw new Error('unexpected subprocess: …')` (test line 214), so a restored gate now fails **loudly** instead
  of being silently satisfied by a stub.
- **Assertion changed, not deleted:** the filter predicate is byte-identical
  (`.endsWith('release-gate-check.mjs')`); only the variable name (`pluginCalls` → `retiredPluginGateCalls`) and
  the expected count (`1` → `0`) changed, with a comment recording the Task 7 rationale. The inverted count is a
  durable regression guard against silent restoration — defense in depth on top of the throw path.
- **All other coverage intact** (verified line-by-line in the full file): six-gate name/status arrays (651–666);
  build/typecheck/lint exactly-one call-shapes (710–728); `npm test` call-shape, candidate-only cwd and
  `KIKI_RELEASE_TEST_REAL_TSC` stripping (703–708); audit args, `NODE_ENV=development` and `npm_config_*` env
  allowlist (731–753); git subcommand allowlist shapes (688–701); candidate-only cwd for all non-git calls
  (755–758); no `npx`/`npm install|exec|add` (759–760); checkout immutability (`expectSourceUnchanged`,
  `expectNoCandidateState`); the full fail-closed matrix (failing gate, missing tsc/eslint, offline/unknown-status
  audit INCOMPLETE, high/critical block, dev-only block with env sanitization, exception flows, apply/rollback/
  backup/corrupted-backup cases) — all untouched.
- **No collateral test impact:** no other test in the file can reach the deleted stub branch; the 33/33 targeted
  and 614/617 full results confirm no other suite regressed.

## 4. Checklist

- **Security scan:** no `.agentic/kiki/config.json` exists (confirmed absent), so the established default
  (`npm audit`) applies; reviewer-run audit shows **0 high / 0 critical** — no findings to fix or report. The
  tests-only diff adds no dependency, network, or credential surface and retains all security assertions.
- **Linting compliance:** `npm run lint` clean (reviewer-re-run). Note the changed file is a *test* file, which the
  project's documented gates deliberately exclude (`tsconfig` and `eslint` scope are `src/**` only; README: "tests
  are covered by Vitest, not by the lint or typecheck"). The gates that actually cover this file — targeted vitest
  and the full suite — are green.
- **Parallelization/dependency logic:** single-file sequential repair with no task-graph additions; no circular
  `depends_on`, all referenced files/interfaces exist, no parallel task touches `tests/cli/release.test.ts`
  (Task 13's future release-test work is sequential and disjoint). Ordering is correct: this repair was a
  prerequisite of Task 11's `npm test`-green gate and follows the Task 10 review's mandate.

## 5. Non-blocking observations

1. The report omits an explicit `npm audit` line (recurring note from the Task 4/5/6 reviews). Mitigated here: the
   diff touches no manifest and the reviewer-run audit is byte-identical to the already-reviewed posture
   (0 high / 0 critical / 32 moderate).
2. Residual dead `release-gate-check.mjs` stubs remain in `tests/cli/release-gates.test.ts:193` and
   `tests/integration/release-real-build.test.ts:150` (verified: neither asserts a call count; the latter file is
   opt-in-skipped). Correctly left out of this task's `release.test.ts`-only scope; prune together with the inert
   `pluginVersion` plumbing in the Task 13 backend release-test change, as both the report and the Task 7/10
   reviews recommend.
3. The 8 stale tracked `dist/plugin/{dedup-source,watchdog-source}.*` artifacts and the missing 2.2.6 test binary
   remain the other two open Task 11 handoffs — this report correctly escalates/records them instead of bypassing
   (no dist edit, no install, no fabricated acceptance).

## 6. Boundary confirmation

This review performed no code fix, no dist edit/deletion, no install/binary execution, no live/default/global
config or credential read, no commit/tag/push/registry edit, and no subagent dispatch. Verification used only
allowlisted commands (targeted `npx --no-install vitest run`, `npx --no-install tsc --noEmit`, `npm run lint`,
`npm audit --json`, read-only git inspection) plus file reads. The full suite was not re-run, per the
evidence-reuse instruction; its log was assessed and reconciled against the Task 10 baseline (617 = 617, exact
one-test flip). The diff's claimed sha256 was not recomputed (hash command not allowlisted); content authenticity
was instead verified byte-for-byte via the working-tree `git diff HEAD` comparison.

## Final statement

**PASS.** The +6/−3 change is a faithful, minimal, well-evidenced repair of the stale release expectation that
Task 7's reviewed gate removal made inevitable: the dead stub is gone (turning silent satisfaction into a loud
failure), the retired-gate zero-call invariant is now explicit, the six-gate production baseline is asserted
unchanged, and no security, invariant, or error coverage was lost — RED (1/32, line 726) → GREEN (33/33, reviewer
reproduced) with full-suite 614/617, tsc 0, lint 0. Task 10 review §6 item 2 (backend release-test fix blocking
Task 11's `npm test` gate) is resolved; the 2.2.6 binary and stale-dist handoffs remain open for Task 11 and are
honestly recorded as NOT VERIFIED.
