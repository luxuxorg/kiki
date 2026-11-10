# Plan Review — Kiki OpenCode 2 Migration (2026-11-09, re-review of amendment)

**Reviewer:** Kiki Reviewer (architect gate)
**Status:** Second review round. The first round (FAIL, 2 blockers) is preserved in summary below; the planner amended the plan and this round verifies the amendments plus absence of regressions.

**Artifacts reviewed:**
- `docs/superpowers/plans/2026-11-09-kiki-opencode2-migration-plan.md` (amended, 487 lines, all 14 tasks)
- `docs/superpowers/specs/2026-11-09-kiki-opencode2-migration-design.md` (approved; chapters 9/10 resolved: tag done/pushed, package-style plugin, OC2 pinned 2.2.6, subagent_depth 1)
- `.agentic/kiki/alignment.json`
- `.agentic/kiki/TASK_REGISTRY.json` (read-only context; not modified)

**Local sources inspected this round:** `src/cli/release-policy.ts` (`parseReleaseArgs`, `selectBaseline`, `decideVersion`/`nextVersion`, `prepareChangelog`, `readLockfileVersions`, `transformVersions`), `src/cli/commands/release.ts` (`prepareRelease`, `readTracked`, apply/dry-run reporting), `src/cli/release-gates.ts` (`runCandidateGates`, `testGateEnvironment`, gate structure), `src/cli/release-candidate.ts` (Git subcommand allowlist), `src/cli/index.ts` (`release` dispatch), `src/tui/index.ts`/`model-menu.ts` imports, `tsconfig.json`, `tests/cli/release*.test.ts` and `tests/integration/release-*.test.ts` (gate-env assertions), `tests/helpers/release-fixture.ts`. Upstream contract facts verified against tagged `anomalyco/opencode/v2.2.6` in round 1 remain valid (nothing in the amendment depends on new upstream claims).

## Verdict

```
Verdict: PASS
Blockers:
(none — both round-1 blockers resolved; details below)
```

## Round-1 blockers and their resolution

### Blocker 1 (Task 7 full-tree build gate) — RESOLVED

Round-1 finding: Task 2 removes `@opencode-ai/plugin`, but `src/tui/index.ts:1` (owned by Task 10, which transitively depends on Task 7) still type-imports it; Task 7's full-tree `npm run build`/`tsc --noEmit` could not pass as scheduled.

Amendment (plan lines 217–219, 276, 299, 466) — verified mechanically executable:
- Task 7's test step now requires only focused vitest suites (all must pass), with the real-binary portion explicitly deferred to Task 11.
- New scoped gate (line 218): typecheck and emit **only the server dependency closure** via a disposable `tsconfig.server.json` **extending the unchanged project tsconfig** (`files: [<checkout>/src/server/index.ts]`, `include: []`, inherited options/rootDir, `outDir` disposable). Verified semantics: child `files`+`include` override the base's `include`; `rootDir: "./src"` resolves from the base config's location (checkout), so all closure sources sit under it; emitted output goes only to the disposable dir. Imported dependencies remain in the compilation and must compile (`src/cli/config.ts`/`opencode-config.ts` are in the closure and contain no removed-SDK imports — only `src/tui/*` does). No tsconfig weakening, no stubs, no distributable emission from a failing build.
- Full-tree `tsc --noEmit` at Task 7 is **diagnostic only**: only recorded unported `src/tui/*` errors permitted; no `npm run build`, no partial distribution. The amendment also closes a secondary risk I had noted: generator fields still used by Task 8's install code are deleted with Task 8, not Task 7, avoiding extra backend type errors.
- Task 10 (line 276) is now the first mandatory full-tree-green gate (`tsc --noEmit`, `npm run build`, `npm run lint`, entrypoint resolution with the pinned SDK, exit 0, no exceptions); Task 11 (line 299) repeats it with "no interim allowances". Task 2 (lines 117–118) is consistent ("Task 10 is the first mandatory full-tree-green typecheck/build gate"). Schedule note at line 466 matches.
- Recursion of gate responsibility is sound: Task 7 releases on scoped green + explicit TUI deferral; Tasks 10/11 close all exceptions. The scoped gate does not weaken any global requirement — the full-tree build still must pass before actual packaged acceptance.

### Blocker 2 (Task 13 release dry-run acceptance) — RESOLVED

Round-1 finding: with the tree at 3.0.0 (Task 2), `prepareRelease` reads current from working-tree `package.json`, so baseline lookup for `release v3.0.0` fails and `decideVersion` yields ≥3.1.0 — "major candidate 3.0.0" was unreachable, risking a misleading green via a 3.1.0 candidate.

Amendment (plan lines 48, 74, 299, 312, 319–341, 480, 485, 487) — separates **ACTUAL_V3_VALIDATION** (unmodified 3.0.0 checkout/build/package bytes: Task 11 manifests + fresh audit) from **RELEASE_REHEARSAL** (a synthetic 2.4.0-versioned copy of the reviewed V3 source pushed through the unchanged release command with `--bump major --since e2bf396df5a14657f34f55c78b31819be10b9c05`, dry-run by **absence of `--apply`**), labels **FUTURE_RELEASE_AUTHORIZATION: NOT RUN**, and forbids policy changes.

Mechanical executability verified against the current tool, claim by claim:
- **Flags/semantics:** `--bump major` and `--since <ref>` exist and behave as asserted (`release-policy.ts:73–118, 98–103, 159–223`). From a 2.4.0 input, `decideVersion(2.4.0, commits, 'major')` → 3.0.0; log format matches the asserted `Version: 2.4.0 -> 3.0.0 (--bump major; ...)` and `Baseline: --since <ref>` (`commands/release.ts:613, 637`). Dry-run prints exactly `Applied: false (dry run; no checkout writes).` (`commands/release.ts:690`). The parser **rejects** `--dry-run` (`release-policy.ts:112` throws on unsupported arguments) — the amendment's note (line 48) is accurate and also fixes the original plan's own invalid `release --dry-run` command.
- **Version normalization set:** the plan's four-file normalization (line 336: `package.json.version`, lockfile root `version`, `packages[''].version`, anchored `KIKI_VERSION` → 2.4.0) is exactly what `transformVersions` enforces (`release-policy.ts:343–386`: all version sources must be equal pre-transform; exactly one anchored `export const KIKI_VERSION = '…'` at line 374). Normalizing the lockfile version fields (while leaving V3 dependency entries intact) also keeps the synthetic root's `npm ci` consistent — no dependency/lock mismatch.
- **CHANGELOG rules:** the plan's "exactly one nonempty `[Unreleased]` section, no pre-existing `[3.0.0]` target, prior 2.4.0 history kept" matches `prepareChangelog`'s contract exactly (`release-policy.ts:252–260`: exactly one `## [Unreleased]`, throws if `## [3.0.0]` exists; nonempty content used as-is, so an empty `e2bf396..HEAD` commit range also works — the rehearsal does not secretly require migration commits to exist).
- **Tracked files / history / index:** `readTracked` = `git ls-files -z` (`commands/release.ts:300–301`); the tool's Git surface is read-only `log`/`ls-files`/`status` (`release-candidate.ts:34, 50, 112`). The plan's construction — independent object copy or read-only alternate (preserving real e2bf396/HEAD history for the `--since..HEAD` query), private refs/index/worktree, and a **fixture-only index registered with the materialized manifest, asserted to equal `git ls-files`** — is executable with standard Git and the equality assertion forces the correct construction (exact manifest, no stale HEAD-tree entries leaking into the candidate). Honest fallback: report the rehearsal BLOCKED if Git objects/permissions prevent it; no mocked Git/gate successes. "No task includes an automatic commit" is respected (index registration is not a commit; staging in the development checkout is forbidden).
- **Six real gates:** `runCandidateGates` returns exactly `[build, test, typecheck, lint, security, invariants]` (`release-gates.ts:968`) — "all six real gates complete" is accurate; transforms run inside the candidate (`:902`), dist is rebuilt in the candidate (`:905`), so the rehearsal certifies the transformed 3.0.0 candidate incl. the new server artifact invariant end-to-end.
- **Recursion safety:** `testGateEnvironment` (`release-gates.ts:465–468`) strips `KIKI_RELEASE_TEST_*` from the candidate `npm test` environment (`:931`), and existing tests already assert the removal (`tests/cli/release-gates.test.ts:600–608`, `tests/cli/release.test.ts:638–709`). Gating the rehearsal behind `KIKI_RELEASE_TEST_OC2_REHEARSAL=1` therefore cannot recurse inside the candidate, and the opt-in pattern matches the established `KIKI_RELEASE_TEST_REAL_TSC` style. The rehearsal is run explicitly and "without skips" in Task 13, so Task 11's zero-skips acceptance is not contradicted (the rehearsal is not in Task 11's required list, and candidate-internal skips of binary-gated tests match the established release-test pattern).
- **Observing-runner regression:** `prepareRelease` is exported (`commands/release.ts:556`) and `release(args)` delegates to it with `process.cwd()` (`:743–747`), so an observing real process runner (delegating every command, capturing candidate artifact hashes between gate commands and the internal candidate disposal at `:717–731`) is mechanically feasible; asserting CLI/exported-function agreement is sound.
- **Negative assertions are mechanically accurate:** a 3.0.0 input with `--bump major` computes 4.0.0 (`nextVersion`), never labeled 3.0.0; parser rejects `--dry-run`; dry-run writes nothing to the checkout (verified against the tool's write paths — candidate temp only).
- **Does not certify synthetic as real:** Task 11 (line 299) records an actual input/dist/tarball digest manifest (including previously-untracked new files — closing the planner's honesty gap) and the reviewer rejects "substituted mock-only **or later synthetic-rehearsal** evidence for actual artifacts"; Task 12 (line 312) keeps three separately marked columns (ACTUAL_V3_VALIDATION / RELEASE_REHEARSAL / FUTURE_RELEASE_AUTHORIZATION) and a rehearsal PASS cannot fill the actual-artifact or actual-release columns; Task 13 (lines 339–341) states "matching source provenance does not make synthetic artifact hashes a certificate for live bytes", never copies the rehearsed candidate back, and requires a separately reviewed, explicitly user-authorized procedure before any eventual actual release. No policy/parser/candidate-isolation/gate-ordering/apply-semantics changes (line 328, 333: `release-policy.ts`/`commands/release.ts` untouched).
- **Evidence-invalidation discipline:** post-Task-11 source changes (including Task 13's own `release-gates.ts:45-51` artifact-invariant edit) invalidate affected actual evidence and trigger a rerun of Task 10/11 checks, real package/binary tests, and the audit for the final snapshot (lines 334, 466). Self-consistent, if deliberately costly — see observation 1 below.

## Regression and refinement check (no regressions found)

All four round-1 non-blocking refinements are adopted and correctly scoped:
1. **Background subagent dispatch** — new Task 11 bullet (line 295): one routing entry, parentID-bearing child, watchdog tracking after the parent goes idle, interruption/health record for a held background child under the same thresholds; explicitly "tests an existing V2 input, not a new dispatch workflow" — stays inside the no-new-features boundary. ✓
2. **V2 `$schema` URL** — Task 2 (line 116) pins the exact URL from tagged schema/docs (not inference); Task 3 (line 136) seeds new configs with it, tests the literal, and never replaces existing user `$schema` values. ✓
3. **Existing release flags named** — amendment note (line 48) and Task 13 use `--bump major`/`--since` explicitly, using policy-compliant existing mechanisms. ✓
4. **Terminal tool events** — Task 6 (line 193) now pins **both** `session.tool.success` and `session.tool.failed` keyed by id and treats `session.tool.progress` as ephemeral activity, matching the verified v2.2.6 event inventory. ✓

Other sections re-checked for regressions: Global Constraints, Review Focus (5 conditions), evidence/precedence section (with the new honest amendment note, line 48), file map (new `tests/integration/oc2-release-rehearsal.test.ts` row, line 74), Tasks 1, 3–6, 8–9, 10, 12, 14, machine appendix A–E, dependency schedule, and the self-review table are unchanged or only strengthened; dependency graph has no cycles, all references exist, parallel set {4, 6, 9} remains file-disjoint, and the new rehearsal test is owned solely by sequential Task 13. Task 10 gained `npm run lint` in the full-tree gate and Task 11 gained the actual-artifact manifest requirements — both tighten, neither conflicts. Tag/registry/log preservation rules intact (registry untouched by this review).

## Non-blocking observations (informational)

1. **Evidence-invalidation cost:** keeping the `KNOWN_DISTRIBUTABLE_OUTPUTS` server-entry addition in Task 13 (rather than folding it into Task 2, whose export contract tests already run on the same files) forces a re-run of the full Task 10/11 actual validation after Task 13's own edit. The plan handles this explicitly and conservatively (rerun mandated, line 334), so this is an efficiency note only — not a defect.
2. **Rehearsal environment dependencies:** the six gates include real `npm test`/audit inside the candidate; this requires the working environment the existing release tests already use (network for audit, synthetic npm/HOME/XDG roots). The opt-in env gate and the honest BLOCKED fallback make any environment shortfall a reported outcome, not a silent skip.
3. **Observing-runner capture point:** candidate artifact hashes must be captured while gates execute (the candidate is disposed inside `prepareRelease` at `commands/release.ts:717–731`); post-transform/post-build state is already final by the lint/security gates, so capture is feasible as the plan words it ("after gate commands before normal disposal").

## Remaining true user decisions (by design, not plan defects)

1. **Actual 3.0.0 release procedure and authorization** — deliberately unselected (FUTURE_RELEASE_AUTHORIZATION: NOT RUN). Before any actual release, the plan requires a separately reviewed, explicitly user-authorized procedure (release workspace, input version, commands, provenance comparison to the accepted actual V3 snapshot, fresh validation, any apply/copy-back). The rehearsal preference selects verification scope only.
2. **Standard phased execution authorizations** — V1_PROTECTED machine operations and freeze/detachment (Task 1), OC2 2.2.6 install (appendix B), live-write steps (Task 14), any network dependency acquisition, and any **new** audit exception if high/critical findings appear (the V1 exception is void for 3.0.0).
3. **Acceptance/switch decision at Task 14** — ACCEPT/SWITCH, RETAIN OC1, or ROLLBACK.

No product-design decision remains open in the plan itself; the plan's own statement (line 487) is consistent with this review's finding.

## Verification basis note

Round-1 upstream verification (tagged `anomalyco/opencode/v2.2.6`: plugin package exports incl. `./tui`, `Plugin.define`, `dialog.select` → `Promise<Value|undefined>`, host-owned `keymap.layer`, `palette`/`slash` command fields, `ctx.location`, `execute.before` payload, `SessionDomain` without `messages`/`abort`, full session-event inventory incl. `session.tool.success/failed/progress`) remains the basis for the API-contract tasks; the amendment introduces no new upstream claims.

## Review boundary

Architect plan re-review only. No product code, config, live settings, installs, commits, tags, pushes, registry edits, or machine operations were performed or authorized; no secret-bearing files were read (only public tagged upstream sources and non-secret repo files). This report is the only file written, to the permitted review location; the round-1 verdict is superseded by this round's PASS.
