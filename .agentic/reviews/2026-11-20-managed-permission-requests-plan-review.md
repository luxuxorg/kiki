# Managed Permission Requests — Architect Plan Review (first review)

- **Date:** 2026-11-20 · **Reviewer scope:** architect review of the plan only; no tests/builds/spikes rerun, no implementation, no live-config/registry/spec/plan edits.
- **Artifact:** `docs/superpowers/plans/2026-11-20-managed-permission-requests-plan.md`
- **Compared against:** user-approved spec `docs/superpowers/specs/2026-11-20-managed-permission-requests-design.md` (approved 2026-11-20 per registry; removal clarification "selected handwritten project rules may be removed; mandatory protection remains — 'Ja, Schutz bleibt'"), registry task `managed-permission-requests` (`.agentic/kiki/TASK_REGISTRY.json`, phase `architect_review`), guardrails in `.agentic/kiki/alignment.json`, and current source at HEAD.

## Verdict: PASS_WITH_NOTES

## Basis

Read the full plan, the full approved spec, the registry task record (designApproval + progress), alignment guardrails, and the current source the plan's file map and interfaces cite. Verified every structural claim against the repo: transaction, validator, classifier, generator, dispatcher, exported types, fixtures, test files, dependency set, absence of prior ownership state and of any `permissions` command. Traced all 8 spec acceptance checks into named task tests. Critically analyzed the two planner-reported technical choices (crash invalidation protocol; installed-prompt fragment delivery) for drift-detection bypass and security-intent alteration. Checked scope creep, proportionality/necessity, task structure, and evidence honesty.

## Grounding verified (plan claim → current source)

- `installGlobalFiles` transaction, backup→snapshot→try/verify→rollback: `src/cli/opencode-config.ts:659-791`; `patchAgents` `:251`, `backup` `:445-455`, `snapshotFiles`/`restoreFiles` `:524-551`, `writeAtomic` `:226` (all private — the plan's "expose focused interfaces" is accurate), `nativeAgentContent` `:486-507`, no-op early return `:736-740` (the gap the plan's "state-only bootstrap, not the current early return" correctly closes).
- Shell envelope: `src/cli/config.ts:192-243` — 18 publishing asks (`:192-211`), 5 force-push denies (`:217-223`), `shellRules` `:231-243`; orchestrator gets plain `shellRules()` at `:488` — "not ask-by-default" is carried correctly into the plan.
- Validator `projectPermissionRules`: `src/cli/oc2-permissions.ts:103-233` — additions-only (`:214`), secret denies (`:137-142`), inherited-ask masks (`:130-135`), bounded path forms incl. `..` rejection (`:158-176`). Plan keeps it unchanged and reuses it via `protectProjectSurvivors` — "not a new validator" is accurate.
- Classifier/catalog: `classifyPermissionSources` `src/cli/permission-consolidation.ts:435`, `HISTORICAL_GENERATED_SEQUENCES` `:36`, fixture `tests/fixtures/kiki-permission-history.json` — the pre-change-shape pinning the plan requires is implementable in the existing multi-sequence structure.
- Exported types the plan reuses exist: `PermissionRule` (`opencode-config.ts:29`), `PermissionResult` (`oc2-permissions.ts:4`), `canonicalPath`/`pathsOverlap` (`oc2-paths.ts:35,54`), `generateAgentPermissions` (`config.ts:499`).
- Absence claims accurate: no ownership state in `src/` (grep → comments only); no `permissions` command in `src/cli/commands/`; dispatch switch at `src/cli/index.ts:18`.
- No new dependencies: `jsonc-parser` ^3.3.1 and `vitest` 4.1.0 already in `package.json`. All referenced test files exist; spike harness is exactly 418 lines as the spec records.

## Critical verification 1 — crash/invalidation protocol does not bypass drift detection

Plan (File map, crash protocol): *"invalidate old ownership evidence by unlinking `state.json` before the first permission-field mutation, then publish new hash evidence only after config verification… A process interruption leaves unchanged valid evidence, absent evidence (the explicitly approved classifier-bootstrap path), or verified new evidence—never valid-looking old hashes for changed fields."*

Verified sound:
- **Drift halts precede invalidation.** All-role drift/ambiguity preflight runs first; Task 1: *"actual mismatches halt for all roles before partial mutation"* and *"A currently present valid state mismatch always halts before invalidation, even if current rules look generated"* — the laundered-drift case (config diverged into a generated-looking shape) cannot be legitimized by the protocol.
- **The invariant holds by ordering, not by luck:** unlink before first mutation; new hashes only after verification. No intermediate state pairs changed config bytes with valid-looking old hashes.
- **Interruption degrades to the user-approved fallback, not a weaker one:** absent state → the existing conservative classifier bootstrap (spec §3A, nothing guessed or deleted; customs preserved, ambiguity halts) — exactly today's protection level. Retaining pre-change generated shapes in the history catalog (plan line 46/51, pinned from the inspected generator, not guessed) makes old, new and partially migrated installs converge on rerun.
- **Caught-failure ordering is the safe direction:** state restored last, only after config restoration verifies; on failed config rollback, evidence is left absent with a reported recovery requirement — old hashes can never describe an unrolled-back config. Fault-injection tests cover every interruption window, including *"failed config rollback (old state must not be restored over unmatched config)"*.
- **No-op and failed preflight never invalidate** — evidence is preserved; and matching permissions with missing state still establish state (verified state-only bootstrap), strengthening rather than weakening future drift detection.

Residual (accepted, explicit in plan): each interruption temporarily costs that install hash-level ownership precision until a successful rerun; state is evidence, not tamperproof (spec §7 non-goal). Both are stated, not hidden.

## Critical verification 2 — installed-prompt fragment does not alter approved security intent

Plan (File map, config.ts bullet): *"append to the preserved body, never replace the user's body or unrelated frontmatter… one exact existing fragment is a no-op, conflicting/duplicate managed headings fail preflight rather than overwrite… This is generator/update delivery, never CLI markdown editing."*

Verified consistent with the approved intent:
- The narrow request exception itself is spec-approved (§3B: *"Role prompts gain a narrow request exception: any agent, orchestrator included…"*). Without prompt delivery to existing installs, the approved feature would be inert there; delivery via the reviewed generator + backed-up update transaction is the spec's mandated route for prompt/rules changes — the permissions CLI still never edits prompts or markdown (plan line 25).
- Preserving the original body as an exact prefix and refusing conflicting/duplicate managed headings replicates the drift-halt philosophy for prose: no silent overwrite of user customization; exact fragment → no-op gives idempotent zero-diff reruns; preflight of all fragments happens before any mutation.
- The fragment grants no general command rights, limits the exception to the older "no commands/no permission changes" wording, and repeats terminal rejection/no-workaround rules plus own-role/validator/native-ask requirements (Task 4) — the managed-writes-only intent is restated, not weakened; the only permission broadening is the user-approved request (not grant) path, gated by the validator and the native human ask.

## Critical verification 3 — removal contract matches the user clarification

Spec §3B + plan Task 3 implement exactly "selected handwritten entries removable; mandatory protection remains": selection binds file+role+zero-based index+tuple under a byte precondition (`stale_index_or_tuple_zero_writes`); handwritten allow/ask/deny entries removable including a selected unsupported ask; mandatory masks/secret denies recomputed for survivors via `protectProjectSurvivors`; a selected entry still required for survivor protection is refused before any write; unrelated survivors (incl. duplicate tuples) preserved verbatim/in order; unsupported survivors, ambiguity and legacy baseline mirrors fail closed; derived protective suffix appended as trailing rules so last-match protection holds; no provenance inference, no project ledger, no global edits (`global_or_inherited_selection_refused`). Net: removal capability widens exactly as the user approved; protections cannot be weakened by it.

## Spec coverage, proportionality, structure, guardrails

- **Coverage:** AC1-3 → Task 1 tests (`owned_replace_and_second_run_byte_stable`, `manual_drift_all_roles_no_writes`, `missing_corrupt_unknown_version_bootstrap_preserves_customs`); AC4-5 → Task 2 (`metadata_only_zero_fs_mutations_all_eight_roles`, `validator_rejects_secrets_boundaries_publishing`, TOCTOU/drift-abort tests); AC6 → Task 3 (`remove_selected_handwritten_allow_ask_deny`, `required_mask_or_secret_deny_removal_refused`, `survivor_protection_last_match_preserved`); AC7 → Task 4 generator assertions (8 rules × 8 roles, ordering, no `addendum` prefix match); AC8 → Global Constraints + per-task constraints. Non-goals (§7) carried verbatim into plan lines 26-31.
- **Necessity/proportionality:** `state.json` is hash-only, stores no rules, is not a second policy source; the spec §3A argument for it is concrete (classifier alone cannot distinguish kiki's older outputs from user edits → ambiguous halts + drift preserved as customs), with unique value, coupling cost and delete-to-restore-current-behavior stated. The CLI reuses the unchanged validator and existing transaction primitives; three new modules are cohesive; no new deps; no framework refactor. Test matrix is proportionate to high-risk permission infrastructure. Smallest-sufficient-change satisfied.
- **Task structure:** all tasks `parallel: false`, linear `depends_on` chain (2→1, 3→2, 4→1,2,3), no circularity, all references exist, no same-file concurrent edits. Correct sequencing for shared files (`opencode-config.ts`, tests).
- **Guardrails/alignment:** all three alignment.json guardrails restated (plan line 30); sanitized errors/no stack traces asserted in tests (`malformed_provider_config_no_disclosure`, "no raw parse dumps or stacks"); test provider values are sentinels, not real secrets; no DB queries planned. No certification claims.
- **Evidence honesty:** spike evidence (2/2 EXIT 0 ~45s, 160/160 decisions, real-child reject/approve) is reused with explicit exclusions — no native visual consent, wrapper-hardening, other child roles, argv-parser or production zero-write claim inherited; the prior test-delta PASS_WITH_NOTES is not presented as architect approval; Task 4's broad suite run is framed as evidence-reporting, not a blanket native-security claim, with the matcher excluded for reasoned reuse.
- **Scope creep:** none found. State invalidation, prompt-fragment delivery, `--file` disambiguation and index-bound selection are implementable realizations of approved scope, each conservative (fail-closed). No wrappers, tokens, ledgers, audit logs, models, deps, or global-policy CLI edits.

## Notes (non-blocking; for implementer, not blockers)

1. **Citation imprecision:** plan cites `src/cli/opencode-config.ts:659-788`; the function actually spans 659-791. Trivial.
2. **Interruption degradation window:** every mid-update interruption drops that install to classifier-level drift detection until a successful rerun re-establishes state. Explicitly accepted (plan line 46); implementers should keep the unlink→publish window as short as the protocol allows and never widen it with extra I/O between.
3. **`add` surface narrower than the validator:** CLI exposes only `--action read|edit`, while `projectPermissionRules` also admits `external_directory` /tmp forms. Intentionally conservative asymmetry; Task 4's README update should state it so users are not surprised by hand-addable forms the CLI refuses.
4. **No advisory file locking:** concurrent CLI invocations on one project config are handled by exact-byte prechecks, immediate-before-write rechecks and fail-closed aborts, not locks. Acceptable for a human-driven local CLI; revisit if usage patterns change.
5. **Fragment versioning has no forward story:** a future fragment-content change will trip the duplicate-heading refusal on v1-carrying installs (a safe halt, not corruption) unless a v1→v2 transition is planned. Out of current scope; record it as future work.
6. **Tamperproofness:** state.json is evidence, not tamper-evidence; a party able to edit it can edit the config anyway — matches spec §7's explicit non-goal. Implementers must not claim tamperproofness in README/CHANGELOG.

## Conclusion

The plan is implementable from the verified current source, covers all eight acceptance checks, stays inside the approved scope and guardrails, and its two riskiest technical choices — evidence invalidation before mutation with post-verify hash publication, and idempotent additive prompt-fragment delivery — preserve drift detection and the approved security intent rather than bypassing them. Approved to proceed to implementation under the stated constraints.
