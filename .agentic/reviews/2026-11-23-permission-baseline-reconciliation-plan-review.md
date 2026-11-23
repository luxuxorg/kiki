# Architect Review: Permission Baseline Reconciliation Plan

- **Verdict:** PASS_WITH_NOTES
- **Date:** 2026-11-23
- **Artifact:** `docs/superpowers/plans/2026-11-23-permission-baseline-reconciliation-plan.md`
- **Compared against:** approved conversational spec (user, "go!"), `.agentic/kiki/alignment.json` guardrails, `.agentic/kiki/TASK_REGISTRY.json:4–16`, and current repository reality (code read directly, not planner leads).

## Basis

Every load-bearing plan claim was verified against the actual repository:

- **Mixed-array bug is real and the plan's diagnosis is correct.** `classifySource` (`src/cli/permission-consolidation.ts:4096–4124`) first tries whole-array equality against `HISTORICAL_GENERATED_SEQUENCES` (line 4104), then a current-baseline prefix pointer (4111–4118). Retired defaults interleaved with customs fail both paths and are misclassified as customs. `keyOf` (4056–4058) already provides the exact `(action, resource, effect)` identity the plan reuses. The blockers to remove are exactly at 4147–4156 (incomplete/ambiguous), 4165–4171 (custom deny), 4173–4183 (conflicting effects), 4185–4187 (out-of-order).
- **Hash/state machinery and its only consumer.** `src/cli/opencode-config.ts:740–1002` holds `sameOwnershipState` (740), `driftReport` (748), the `ownedHash` branch (791–829), state read (781–782), invalidation (934), publication (962–969) and state-last restore branches (987–997). Grep confirms `permission-ownership.js` is imported only by `opencode-config.ts` (line 24); `classifyPermissionSources` is consumed only there in production. The plan's "delete the entire module" is sound. `oc2-migration.ts` uses only `splitSecretTail`, which the plan keeps.
- **Historical data reuse is grounded.** `HISTORICAL_GENERATED_SEQUENCES: Record<string, PermissionRule[][]>` exists (`permission-consolidation.ts:41`) with per-role recorded sequences; the pinned fixture `tests/fixtures/kiki-permission-history.json` exists; the fixture equality test (`permission-consolidation.test.ts:87`) the plan retains exists, as do the all-role coverage (94) and exact secret-tail test (131). The old contradictory tests the plan replaces also exist: "treats unknown and partial generated shapes as custom or blocked" (54), "does not infer ownership from an isolated generated tuple" (62), "blocks custom denies and conflicting custom tails verbatim" (73), "altered historical shapes and custom denies still block" (116).
- **Transaction safeguards named for retention exist.** `backup` (`opencode-config.ts:454`), `snapshotFiles` (543), `restoreFiles` (554), and the safeguard tests in `install-transaction.test.ts` (`markdown_custom_deny_halts_before_write` at 176, backup failure 217, mid-strip rollback 227, reread-mismatch 249, failed rollback diagnostics 276, registration failure 301, crash-rerun 312, fragment no-op 380, comment preservation 196). State `rmSync` bootstrap lines the plan removes exist in `install-transaction.test.ts` (139, 165, 180, 233, 255, 280, 325, 351), `global-policy.test.ts:62`, `update.test.ts:85`. Restrictive-mode/no-temp-garbage assertions exist in `permission-ownership.test.ts:291`.
- **Deliverables and boundaries.** Exactly four `dist/cli/permission-ownership.*` outputs exist; `AGENT_NAMES` has eight roles; all compatibility suites named in Task 2 (`permissions-command`, `permission-requests`, `project-permissions-bounded`, `oc2-permissions`) and the Task 3 integration gates (`oc2-isolation`, `oc2-permission-request-matcher`) exist. The historical manual-override boundary is quoted accurately (`2026-11-19-global-permissions-single-source-design.md:128–134`).

## Spec conformance

- Baseline-as-membership, not full-array ownership: Task 1 replaces whole-array/prefix-pointer classification with one exact-key set from historical sequences plus fresh baseline — satisfies "identical known defaults treated as defaults no intent reconstruction" and "remove known retired defaults even in custom-mixed arrays".
- All-effect unknown-custom preservation (allow/ask/deny), stable encounter order, dedup across config/markdown: Tasks 1–2 tests cover it; the old deny/effect blockers are correctly identified as superseded reconciliation contract, not guardrails.
- State removal without replacement: delete `permission-ownership.ts` wholesale, no hash gate, drift, publication, invalidation, state snapshots or state-only rollback; existing state file inert. No replacement state/provenance/collision feature anywhere in the plan.
- Kept protections: fresh prefix + customs + final secret-edit tail ordering (tail last, so last-match semantics keep secret denies effective — same order as today at 827/841); backup-before-mutation, verify-by-reread before strip, mode restoration, registration-first ordering; generator safeguards explicitly untouched; project-only permission CLI untouched with an explicit compatibility test gate and a "do not relax" instruction.
- Task decomposition is strictly sequential (T1→T2→T3, no cycles, no parallel tasks touching shared files), each test file exists, and evidence requirements are honest (native gate recorded as unverified if no authorized binary; skips reported separately).

## KISS / simplification confirmation

Net deletion: `SourceClassification`, `classifySource`, pointer/matched/complete/sawGenerated counters, `ambiguous` kind, four blocker categories, the dual owned/unowned installer branch, drift reports, state read/write/verify/publish/invalidate, and a whole module plus its four dist outputs. Reuse of the existing catalog, identity helper, dedup and tail splitter; one classification path; dedup moved to a single `stableCustoms` call inside classification (removing today's double dedup at 4162 + 827/841). No new helpers, dependencies, persistence, evaluator or wrapper. No scope creep: file map is exactly the two modified sources, one deleted module, affected tests, tracked dist and post-code historian docs; no live operations, registry or analysis edits authorized.

## Alignment guardrails

`.agentic/kiki/alignment.json` (no hardcoded secrets / parameterized queries / no stack-trace leaks): none implicated — plan adds no secret material, no database access, no API responses, and quotes the guardrails correctly. OWASP/SOC 2 treated as context only; the plan makes no certification claim.

## Notes (non-blocking)

1. **Transient cross-file break between Tasks 1 and 2.** Task 1 changes `Classification` while `opencode-config.ts` still references `classification.blockers`/dual branches; the per-file vitest run can go green while the installer is type/runtime-broken. The plan discloses this and sequences the installer fix in Task 2 before the build gate; the implementer must not insert a full build/typecheck gate between Tasks 1 and 2.
2. **Historical catalog coupling is retained by design.** Future generator default changes will need new provenance-verified `HISTORICAL_GENERATED_SEQUENCES` entries before those defaults can be retired later. This is a pre-existing property of the spec's exact-identity approach (the alternative — pattern-invented identities — is correctly forbidden); reusing the frozen catalog as-is is the KISS-correct choice, but the maintenance property survives this change.
3. **Behavioral widening check passed:** removing the custom-deny/drift halts converts refusals into successful consolidated writes, but output content stays `[fresh prefix, preserved customs, fresh tail]` — same bounded shape as today; the hash gate previously only *blocked* writes, so its removal adds no permission. `markdown_custom_deny_halts_before_write` correctly flips to assert preserved-deny + verified strip.
4. **`state_is_inert` fs instrumentation** (spy asserting no read/write/unlink/rename of the legacy path, absent from backup manifests) is test-only and bounded to the existing harness; acceptable, but the final review should confirm no production fs shims were introduced.

## Conclusion

The plan is accurate against repository reality, satisfies every element of the approved conversational spec, is a genuine net simplification, preserves mandatory protections and project-only boundaries, and contains no scope creep. Proceed to implementation; final independent code review follows.
