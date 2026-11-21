# Managed Permission Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ownership-aware global updates and narrow, native-ask-gated project permission requests without creating another policy source.

**Architecture:** Extend the existing global install transaction with hash-only ownership evidence; implement project inspection and mutation around the unchanged `projectPermissionRules` validator. Keep JSONC writing in `opencode-config.ts`, command parsing/presentation in a new command module, and pure request planning separate from I/O.

**Tech Stack:** Existing TypeScript/Node ESM, `jsonc-parser`, Node crypto/fs, Vitest; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-20-managed-permission-requests-design.md`.

## Approval and review gate

Design approval is verified in `.agentic/kiki/TASK_REGISTRY.json`, task `managed-permission-requests`, `designApproval` (2026-11-20 explicit user approval). The user subsequently approved selected handwritten project-rule removal and explicitly confirmed “Ja, Schutz bleibt”. The spec now records that narrow clarification and authoritative approval; registry remains orchestrator-owned and unchanged.

**Product blocker resolved:** removal is not restricted to additive allows or claimed Kiki ownership. A uniquely selected handwritten entry may be removed, but mandatory masks/secret denies required by survivors cannot be removed or weakened. No global edits, implicit cleanup or project provenance store are authorized. Technical choices below implement this contract; architect review must precede implementation.

## Global Constraints

- All eight roles: `kiki-orchestrator`, `kiki-brainstormer`, `kiki-planner`, `kiki-implementer`, `kiki-gui-designer`, `kiki-reviewer`, `kiki-escalation`, `kiki-historian`.
- Exact shell resource/effect pairs, each emitted once per role after baseline `shell *` allow: `kiki permissions list` allow; `kiki permissions list *` allow; `kiki permissions check` allow; `kiki permissions check *` allow; `kiki permissions add` ask; `kiki permissions add *` ask; `kiki permissions remove` ask; `kiki permissions remove *` ask. No prefix-globs or literal pipe shorthand.
- Preserve routine shell allow, 18 publishing asks, force-push denies, role boundaries and secret protections. Orchestrator is **not** ask-by-default.
- `list`/`check`: “zero backup/state/log/config writes”; “permission rule metadata only, never file contents or provider secrets”.
- Mutations: “explicit apply only”; project scope only; CLI never edits global policy, prompts, or markdown. `projectPermissionRules` remains unchanged.
- No runtime hook/policy engine, audit log, project ledger/log, consent token, `PERMISSION_MISSING` schema, new dependencies, paid models/tests, automatic baseline promotion, project baseline mirrors, or immediate historical-catalog retirement.
- Ownership state: `~/.config/opencode/kiki/state.json` under the existing env-resolved global config root; versioned per-role hashes, no rules. Write after config verification; no atomic multi-file claim. Update never traverses project configs.
- Paths remain literal as written; only supported relative/absolute/prefix/worktree forms; reject `..` and unsupported wildcards. No reliable symlink-target or tamperproofness guarantee.
- Native ask is human consent enforcement, not CLI-verified consent. No `--auto` equivalence, token, wrappers, raw config edits, retries or workaround after rejection/`PERMISSION_BLOCKED`. Publishing-route approval remains separate.
- Never hardcode secrets; use parameterized database queries if any arise (none planned); never disclose internal stack traces in API responses or CLI output.
- This planning continuation edits only this plan and the explicitly authorized spec clarification/status; no source/registry/live-config edits, tests, builds, spike reruns, commits, publishing or nested delegation. Future commits/publishing require their own authorization.

## Review Focus

1. Crash after config verification but before state persistence: rerun must converge without treating arbitrary manual divergence as owned (Task 1).
2. Duplicate fields/tier ambiguity and comments inside permission arrays: refuse destructive interpretation; preserve surrounding JSONC (Tasks 1–3).
3. Credential-bearing malformed configs and exception text: emit sanitized metadata/errors, never offending source snippets or provider values (Task 2).
4. Concurrent replacement/creation of a selected config: abort before write; rollback must not clobber an unrelated concurrent change (Tasks 2–3).
5. Symlinked config destinations versus literal permission resources: reject global/project aliases while making no symlink-target capability claim (Task 2).

---

## File map and technical choices

- Create `src/cli/permission-ownership.ts`: pure hashing/state validation; extend `src/cli/opencode-config.ts:659-788` to integrate it with `installGlobalFiles`. Keep existing `classifyPermissionSources`, history catalog and bootstrap transaction. Hash ordered parsed field values using SHA-256 over `JSON.stringify(rules)`; array order matters, whitespace does not. This trades textual-edit detection for evidence of the actual permission field (§3A); JSONC byte checks remain separate.
- Crash protocol: after **all-role drift/ambiguity preflight**, byte recheck and successful existing backup/snapshot, invalidate old ownership evidence by unlinking `state.json` **before the first permission-field mutation**, then publish new hash evidence only after config verification and completion of the install transaction. This is invalidation, not an early write of new ownership evidence (§3A). A process interruption leaves unchanged valid evidence, absent evidence (the explicitly approved classifier-bootstrap path), or verified new evidence—never valid-looking old hashes for changed fields. Back up/snapshot state with the existing transaction; no pending journal, new ledger or rule store. On caught failure restore state last, only after config restoration verifies; otherwise leave evidence absent and report recovery required. Tradeoff: interruption temporarily loses ownership precision and uses the approved conservative fallback, rather than reinterpreting a present mismatch as stale. Retain exact prior generated shapes in the existing history catalog when generation changes, so ordinary untouched old/new and partially migrated sources bootstrap on rerun; unknown/manual ambiguity still halts. No power-loss durability or atomic multi-file claim.
- Create `src/cli/permission-requests.ts`: pure coverage and request planning, consuming ordered inherited rules and selected local rules. Reuse existing tier discovery/read validation; do not invent a native evaluator or policy engine. Conservative uncertainty is an error, not an allow.
- Modify `src/cli/opencode-config.ts`: expose focused read/write interfaces around private `patchAgents`, `backup`, `snapshotFiles`, `restoreFiles`, `writeAtomic`; avoid a general transaction-framework refactor. Existing infrastructure already supplies JSONC preservation and rollback (§2); additions are exact-byte preconditions and scoped verification.
- Create `src/cli/commands/permissions.ts`; modify `src/cli/index.ts` for dispatch/help. Keep strict permission argument parsing local rather than overloading migration's `parseScope`.
- Modify `src/cli/config.ts`: `shellRules`, shared permission-request prompt helper, all eight role template generators and workflow text. Deliver the same narrowly overriding fragment to existing installations through `nativeAgentContent` during normal backed-up update: append to the preserved body, never replace the user's body or unrelated frontmatter. Use a unique `## Kiki managed permission requests (v1)` heading; one exact existing fragment is a no-op, conflicting/duplicate managed headings fail preflight rather than overwrite. The fragment explicitly limits exceptions to older “no commands/no permission changes” wording; it grants no general command rights. Tradeoff: additive delivery avoids a prompt-ownership database and risky full-body refresh while retaining older prose alongside an explicit narrow override. This is generator/update delivery, never CLI markdown editing.
- Tests: create `tests/cli/permission-ownership.test.ts`, `tests/cli/permission-requests.test.ts`, `tests/cli/permissions-command.test.ts`; extend `tests/cli/install-transaction.test.ts`, `tests/cli/config-readonly-git.test.ts`, `tests/cli/loop-controls.test.ts`, `tests/cli/permission-consolidation.test.ts`. Extend existing `HISTORICAL_GENERATED_SEQUENCES` and `tests/fixtures/kiki-permission-history.json` with exact pre-change arrays derived from the inspected current generator (all eight roles), not guessed shapes. Update `README.md`, `CHANGELOG.md`; generate affected `dist/` only during authorized implementation.

### Task 1: Ownership evidence and convergent update

**Metadata:**
- risk: high
- parallel: false
- depends_on: []

**Files:** ownership module; global installer; ownership and install-transaction tests.

**Interfaces:** `hashPermissionField(rules: PermissionRule[]): string`; `parseOwnershipState(value: unknown): OwnershipState | undefined`; `OwnershipState = { version: 1; roles: Record<string, string> }`. Retain `installGlobalFiles(directory?: string, update?: boolean): void`.

- [ ] Write failing cases `owned_replace_and_second_run_byte_stable`, `manual_drift_all_roles_no_writes`, `missing_corrupt_unknown_version_bootstrap_preserves_customs`, `other_source_or_duplicate_field_not_hidden_by_hash`, and `crash_between_config_and_state_rerun`. Assert hashes only in state; no project reads/writes; drift report has role/recorded/current hashes, rule diff only when reconstructable. Simulate interruption without caught rollback before invalidation, after invalidation/before write, after each config mutation, after verify/before state, and after state rename; ordinary unmodified inputs converge to a byte-stable second rerun. Bootstrap fixtures include exact prior/current generated outputs, unknown allows and ambiguous denies; never assert automatic recovery for arbitrary manual ambiguity.
- [ ] Run `npx vitest run tests/cli/permission-ownership.test.ts tests/cli/install-transaction.test.ts tests/cli/permission-consolidation.test.ts`; expect new assertions to fail for absent ownership behavior, not fixture/setup errors.
- [ ] Extend preflight before any backups/writes: matching owned fields replace with fresh baseline; actual mismatches halt for all roles before partial mutation; missing/stale/corrupt state uses existing conservative classifier. Preserve baseline/custom bootstrap behavior and existing comment/duplicate-source safeguards; do not claim hashes reconstruct old rules.
- [ ] Implement the invalidation protocol above in `installGlobalFiles`; byte-check config and state snapshots before invalidation and each replacement. Do not invalidate evidence on no-op or failed preflight. Matching unchanged permissions with missing state still require a verified state-only bootstrap, not the current early return. A currently present valid state mismatch always halts before invalidation, even if current rules look generated. Pin pre-change arrays in the existing classifier catalog/fixture for crash fallback, with provenance to the current generator.
- [ ] Persist verified hashes with restrictive permissions via atomic single-file replacement after config verification and the other transaction operations; restore state last on caught failure. Avoid rewriting unchanged state; retain history catalog. Add fault injection for invalidation failure, state write/rename failure, config verification failure, and failed config rollback (old state must not be restored over unmatched config); verify backup modes and absence of temporary-file garbage.
- [ ] Rerun the focused command; expected all cases PASS, including repeated recovery and no-op update. Review this task independently; no commit without authorization.

### Task 2: Metadata-only inspection and narrow additions

**Metadata:**
- risk: high
- parallel: false
- depends_on: ['Task 1']

**Files:** request module, permissions command, CLI dispatcher, config I/O module; request/command tests.

**Interfaces:** `PermissionContext = { projectDirectory: string; globalConfigDirectory: string }`; `PermissionRow = { file: string; scope: 'global' | 'ancestor' | 'project'; agent: string; index: number; rule: PermissionRule }`; `inspectPermissions(context: PermissionContext): PermissionRow[]`; `protectProjectSurvivors(local: PermissionRule[], inherited: PermissionRule[]): PermissionResult`; `planPermissionAdd(local: PermissionRule[], inherited: PermissionRule[], grant: PermissionRule): PermissionResult`; `applyProjectPermissions(context: PermissionContext, file: string, agent: string, expected: Buffer | undefined, rules: PermissionRule[]): { changed: boolean; file: string }`; `permissions(args: string[]): Promise<number>`. Reuse existing exported `PermissionResult` and `PermissionRule`. The shared survivor helper is needed by add and remove to avoid conflicting protection assembly, not a new validator.

CLI syntax: `permissions list|check [--project <dir>] [--agent <name>]`; `permissions add <literal-resource> --agent <name> --action read|edit [--project <dir>] --apply`. Default project is cwd; no implicit agent/action, global mutation flag, shell grant, path widening or consent inference. Without `--apply`, show metadata proposal only. Unknown/duplicate options fail. Select the sole existing project config; multiple candidates are ambiguous and require `--file <project-config-path>`; absent target defaults to `<project>/opencode.jsonc`. `--file` is a target selector, never authorization for ancestor/global writes.

- [ ] Write failing cases `metadata_only_zero_fs_mutations_all_eight_roles`, `malformed_provider_config_no_disclosure`, `coverage_refuses_src_tests_redundancy`, `narrow_literal_add_only`, `validator_rejects_secrets_boundaries_publishing`, `unknown_target_action_agent_refused`, `symlink_alias_not_global_write`. Instrument all mutating fs calls as forbidden for inspection (including backup, state, mkdir, temp, chmod and log writes), not merely equal final bytes; assert sentinel provider values/source contents absent from stdout/stderr.
- [ ] Run `npx vitest run tests/cli/permission-requests.test.ts tests/cli/permissions-command.test.ts`; expect semantic RED.
- [ ] Implement inspection without install/init/migration helpers with side effects; project check reports conflicts without rewriting them. Project checks use current inherited metadata; never print provider/model/prompt settings. Use ordered, bounded coverage checks; already-covered requests refuse without writes (idempotent effect); uncertainty fails closed. Implement `protectProjectSurvivors`: pass allow grants through unchanged `projectPermissionRules`; validate bounded file read/edit asks using an allow-shaped copy solely to check scope/derive protections, never persist that copy. Already required inherited ask tuples are masks, not new grants. Other surviving asks fail closed (an ask can override a deny); surviving denies remain restrictive. Required suffix is the returned non-allow rules. Preserve survivors and append that suffix only when not already trailing; reject legacy baseline mirrors. Test unsafe surviving asks cannot override secrets, role boundaries or force-push denies. `planPermissionAdd` uses this helper after inserting the narrow grant.
- [ ] Implement project-only apply via existing backup→patch→verify→rollback primitives. Capture exact target bytes/existence at planning; recheck before backup and immediately before replacement; changed/deleted/newly-created target aborts. Verify only the selected role's permission field changed. Preserve models/providers/comments/other roles; refuse duplicate relevant keys and destructive inner-array comment loss. Roll back only transaction-owned postimages; if concurrent changes prevent safe restore, report recovery requirement, not success.
- [ ] Add tests `drift_before_write_zero_target_changes`, `missing_target_created_concurrently_abort`, `verify_failure_safe_rollback`, `jsonc_unrelated_bytes_and_modes_preserved`, `ambiguous_configs_no_write`, `symlink_resource_stays_literal_no_target_read`. Config alias checks reuse `canonicalPath`/`pathsOverlap`; resource tests document the accepted inability to enforce symlink targets. Never open granted files to inspect their contents.
- [ ] Rerun the focused command; expected PASS. Add dispatcher exit-code/help assertions; errors are sanitized, no raw parse dumps or stacks. Independently review before proceeding.

### Task 3: Selected-entry removal with mandatory protection

**Metadata:**
- risk: high
- parallel: false
- depends_on: ['Task 2']

**Files:** request/command modules, shared config apply interface, request/command tests.

**Interfaces:** reuse Task 2's metadata and apply interface; `planPermissionRemoval(local: PermissionRule[], inherited: PermissionRule[], index: number, expectedRule: PermissionRule): PermissionResult`. Selection binds exact file, role, original zero-based array index and tuple under the target-byte precondition, not a mutable display ordinal alone. CLI: `permissions remove --agent <name> --entry <index> --action <action> --resource <literal-resource> --effect allow|ask|deny [--project <dir>] [--file <project-config-path>] --apply`; omission of `--apply` only previews metadata. Removal accepts the selected entry's existing action/effect, not an arbitrary replacement or new action grant.

- [ ] Write failing tests `remove_selected_handwritten_allow_ask_deny`, `duplicate_tuple_only_selected_index_removed`, `survivors_preserved_without_provenance_claim`, `stale_index_or_tuple_zero_writes`, `global_or_inherited_selection_refused`, `required_mask_or_secret_deny_removal_refused`, `survivor_protection_last_match_preserved`, and `unsupported_surviving_allow_no_silent_cleanup`. Cover selected handwritten nonmandatory deny/ask (including removal of an unsupported selected ask), multiple survivors and duplicate tuples, final grant removal, inherited asks, secret read/edit denial, unsafe surviving asks, and native-ask rejection as a terminal prompt contract (no invented CLI consent check).
- [ ] Run `npx vitest run tests/cli/permission-requests.test.ts tests/cli/permissions-command.test.ts`; expect semantic RED.
- [ ] Implement selector and survivor planning: remove exactly the index/tuple candidate in memory and call Task 2's `protectProjectSurvivors`. Preserve supported unselected handwritten deny/ask entries verbatim/in order; do not infer ownership or treat all asks as harmless restrictions. If the selected tuple is in the derived protection still required for survivors, refuse before backup/write with a metadata-only explanation. Fail closed on unsupported survivors, malformed/ambiguous rules or legacy baseline mirrors; removal may eliminate a selected offending entry only when the survivors then validate.
- [ ] Preserve every unrelated survivor (including duplicate tuples); append the derived mandatory suffix after survivors unless it already is the exact trailing suffix, ensuring restrictive last-match behavior and stable reruns without deleting supposedly “generated” entries. Do not drop obsolete-looking masks on guessed provenance. If a redundant retained restriction makes the requested grant ineffective, report that metadata instead of deleting it. Use Task 2's JSONC transaction; verify selected-entry delta plus required protection only. The same grant-validation/protection assembly is used by add so it cannot erase handwritten restrictions.
- [ ] Rerun the same command; expect PASS. Independently review the removal boundary against the user clarification.

### Task 4: Generator rules, request prompts and final verification

**Metadata:**
- risk: high
- parallel: false
- depends_on: ['Task 1', 'Task 2', 'Task 3']

**Files:** `config.ts`, `opencode-config.ts` (`nativeAgentContent` and install preflight), generator/loop/installation tests, README/CHANGELOG, affected generated dist.

**Interfaces:** retain `generateAgentPermissions(config: KikiConfig): Record<string, PermissionRule[]>` and all eight existing template generators; export `withPermissionRequestPrompt(prompt: string): string` from `config.ts` for idempotent fragment insertion and conflict refusal; use it in every role generator and `nativeAgentContent`.

- [ ] Write failing generator assertions for the exact eight rules × eight roles above, ordering, no `addendum` prefix match, unchanged publishing/force-push controls. Write prompt assertions that every role, including coordination-only orchestrator and no-permission-change escalation, may only request validator-permitted rights for its own role through canonical native-ask CLI; no raw edits/global policy/self-authorization/wrappers, rejected ask stops. Existing “do not run commands/change permissions” language must explicitly accommodate this narrow exception, not contradict it.
- [ ] Run `npx vitest run tests/cli/config-readonly-git.test.ts tests/cli/loop-controls.test.ts tests/cli/install.test.ts`; expect semantic RED for new rules/contracts.
- [ ] Emit the rules in shared `shellRules`; reuse one narrow prompt fragment across all role generators and workflow. In `nativeAgentContent`, apply `withPermissionRequestPrompt` to the existing parsed prompt while preserving its original body as an exact prefix; the existing backup/verify transaction owns writing, not the permissions CLI. Preflight all fragments before any mutation.
- [ ] Add `fresh_and_existing_all_eight_roles_receive_exception`, `custom_body_and_frontmatter_preserved`, `fragment_second_update_no_diff`, `conflicting_or_duplicate_heading_no_writes`, and `fragment_write_failure_rolls_back` tests in installation/transaction tests. Assert all eight installed bodies contain exactly one fragment and existing customized prose remains intact. The fragment explicitly overrides only request-related prohibitions, preserves own-role/validator/native-ask requirements, and repeats terminal rejection/no-workaround rules. No live obedience/native-effective claim.
- [ ] Rerun focused tests; build once (`npm run build`) to regenerate dist; run `npm run lint`. Because this change crosses permission and installation infrastructure, run the broad suite once with `OPENCODE_TEST_BINARY=/home/lutz/.opencode/bin/opencode TMPDIR=/tmp/opencode npm test -- --no-file-parallelism --exclude tests/integration/oc2-permission-request-matcher.test.ts`; report skips, failures, environment limits and exact evidence, not a blanket native-security claim. The existing matcher/child spike is intentionally excluded to reuse its accepted evidence; do not present this as an unqualified full-suite run.
- [ ] Update README/CHANGELOG for CLI syntax, ownership/drift/bootstrap, approved removal behavior, managed-write-only security and accepted wrapper/symlink limits. No live `kiki update` or rollout here.
- [ ] Final reviewer checks spec coverage, recorded evidence, no disclosures/writes, generated output, guardrails and user removal clarification; reviewer does not rerun unchanged evidence.

## Evidence reuse and readiness

Reuse spec §5 and registry evidence honestly: prior OpenCode 2.3.2 isolated matcher+real-child run **2/2 EXIT 0 (~45s)**, 160 matcher decisions across all eight primary roles, one implementer child rejection/once-approval, accepted test-delta **PASS_WITH_NOTES**. No spike rerun is planned solely to reconfirm that evidence; a changed native boundary/harness must instead receive a reasoned verification decision. Production generator tests must compare emitted rules with those measured. No native visual consent, other child-role, argv-parser, wrapper-hardening or production zero-write proof is inherited from the spike.

Self-review: acceptance 1–3 → Task 1; 4–5 → Task 2; 6 → Task 3; 7 → Task 4; 8 → all tasks. File/interfaces grounded in current source; no implementation/check execution claimed. **Ready for architect review:** user-owned removal decision is resolved; crash invalidation/bootstrap and additive installed-prompt delivery are explicit machine-owned technical choices within the existing fallback, backup and request-exception scope. No unresolved product decision or implementation authorization is inferred from this planning continuation.
