# Permission Baseline Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. No nested delegation in this dispatch. Architect review precedes implementation; independent final review follows implementation. Neither gate is owner reapproval of this machine-owned plan.

**Goal:** Replace the generated 569-rule global baseline with the approved 74-entry baseline, protected by one shared secret policy fragment, without losing user configuration.

**Architecture:** Keep the accepted exact-tuple role reconciliation and existing verified install transaction. Generate small ordered role arrays plus top-level push/policy entries; identify the two new managed fragments using local JSONC comment boundaries, not ownership hashes or external state. Deliver behavioral restrictions through additive prompt changes, not route permissions.

**Tech Stack:** Existing TypeScript/Node ESM, `jsonc-parser`, YAML, Vitest, installed OpenCode 2.3.2; `tsc` regenerates tracked `dist`.

**Spec:** `docs/superpowers/specs/2026-11-23-permission-baseline-simplification-design.md` (read fully). The dispatch explicitly establishes owner approval after editorial revision; its stale “ENTWURF” status sentence does not reopen approval.

## Global Constraints

- “keine Sandbox, kein Wirkungs-Klassifizierer, kein neuer Befehls-Katalog, keine pauschalen Nachfragen, keine neue Maschinarie” (spec §3).
- “letzte Übereinstimmung gewinnt” (appendix A). Exact role arrays below are the generated defaults, not a cap on preserved customs.
- “Die Regeln aus Main gelten auch im Worktree.” must appear in every role prompt.
- No live global configuration writes, `kiki update`/install execution, commits, publishing, or dependency changes. Owner performs rollout after integration.
- Preserve the dirty tree, including the independently reviewed uncommitted reconciliation changes, deleted ownership module, generated outputs, tests, README/CHANGELOG and registry edits. Never reset/clean/stash them away.
- `.agentic/kiki/config.json` contains only `health.stuckThresholdMs: 600000`; it overrides no paths or commands for this work.
- Alignment: no hardcoded secrets; every database query parameterized; no internal stack traces in API responses. No database/API work is needed here; probes use placeholder paths/content only.
- `kiki permissions` remains project-only, native-ask protected, backed up, and behavior-compatible. Its existing managed prompt fragment remains last and unchanged.
- Documentation is **not** part of implementation. Historian updates README, CHANGELOG and `docs/migrations/kiki-3-oc2-api-contract.md` after final review (§5.6).

## Review Focus

1. Modified or partially deleted managed fragments must stop before any mutation and identify file/location plus expected/observed rules (Task 4).
2. User entries, even identical to a managed tuple, must not be stolen, deduplicated or reordered; comments inside user arrays survive (Task 4).
3. Defaults interleaved with custom allow/ask/deny tuples must retire by exact identity, without resurrecting state/whole-array ownership (Tasks 2–4).
4. Registration, write or reread failure must restore the entire original configuration and prompts, including both new top-level locations (Task 4).
5. Generator changes must not accidentally weaken project grant validation or silently refresh unrelated custom prompt text (Tasks 5–6).

## Decisions and file map

- **Keep existing catalog/classifier:** `src/cli/permission-consolidation.ts:4098–4120` already classifies individual exact old/new tuples and stable-deduplicates customs. Pin missing current sequences before changing emission; do not replace this accepted algorithm. Existing fixture provenance predates the managed-permission-request generator change, so current coverage cannot be assumed.
- **No replacement state:** JSONC boundary comments in the same global document are the smallest way to distinguish new Kiki fragments from identical user entries and detect edited managed lines (§2/§5.4). Use `/* kiki managed permissions begin */` / `/* kiki managed permissions end */` and corresponding `policies` markers **inside** their respective arrays. Compare parsed enclosed entries to canonical entries, including order and fields. This adds no OpenCode schema fields, sidecars, hashes, dependency or generic ownership framework. Removing both markers and all evidence is indistinguishable from first adoption; raw total hand-rewriting is the accepted residual risk (§4), not grounds to recreate a ledger.
- **Preserve user bytes:** use AST offsets and localized JSONC edits to append/move only the managed fragment; do not serialize entire top-level arrays. Existing whole-role-array comment-stop remains in force; new fragments must not impose it on unrelated user array comments.
- **Keep shared legacy helpers:** `splitSecretTail` also serves migration/project consumers. With a lean baseline it already returns `{prefix: baseline, tail: []}`. Do not remove it or change project secret-suffix emission just because global generation stops using secret permission tails. “Both levels” here concerns generated global top-level/role permission arrays; project CLI behavior is explicitly unchanged.
- Modify `src/cli/config.ts`: ordered role arrays, `generateGlobalPermissions(): PermissionRule[]`, `generateSecretPolicies(): PermissionRule[]` (policy entries have `action: 'tool.use'`, deny effect), minimal prompt helpers.
- Modify `src/cli/opencode-config.ts`: two marked top-level fragments, preflight/reread verification within the existing transaction, scoped existing-prompt migration.
- Modify `src/cli/permission-consolidation.ts` and `tests/fixtures/kiki-permission-history.json` only to pin missing proven current output.
- Modify affected generator/installer tests; create `tests/cli/permission-baseline-simplification.test.ts`, `tests/cli/managed-global-fragments.test.ts`, `tests/integration/oc2-baseline-policies.test.ts`, `tests/integration/oc2-baseline-worktree.test.ts`.
- Reuse `tests/helpers/oc2-fixture.ts` and `tests/integration/fixtures/oc2-provider.ts`; do not add a probe framework. `/tmp/opencode` harness contents were not accessible to this planning session; the repository harness is available and sufficient.
- Compatibility-only changes to `src/cli/permission-requests.ts` are allowed if needed to retain existing read-coverage behavior with lean inherited arrays (Task 6); no new CLI operations.
- Regenerate affected `dist/cli/*.{js,js.map,d.ts,d.ts.map}` using `npm run build`. Deleted `permission-ownership.*` stays deleted.

### Task 1: Establish baseline and resolve worktree matching before emission

**Metadata:**
- risk: medium
- parallel: false
- depends_on: []

**Files:** Create `tests/integration/oc2-baseline-worktree.test.ts`; reuse fixture helpers above.

**Interfaces:** Use `requireOC2Binary(): string`, `observedOC2Version(binary)` and `createOC2Fixture(binary)`; `fixture.runAsync(args, {cwd})` selects the session directory. Produce a recorded PASS/fallback decision for Tasks 3 and 7, not a runtime setting.

- [ ] Record `git status --short` and `git diff --stat`; save a pre-change diff outside tracked files if permitted. Record exact focused baseline results:
  `npm test -- tests/cli/permission-consolidation.test.ts tests/cli/permission-baseline-reconciliation.test.ts tests/cli/install-transaction.test.ts tests/cli/global-policy.test.ts tests/cli/permission-requests.test.ts tests/cli/permissions-command.test.ts tests/cli/project-permissions-bounded.test.ts`.
  Do not treat the existing dirty diff as this feature's changes.
- [ ] Write `worktree_cwd_resolves_role_territory`: construct only the proposed minimal `deny edit *` then `allow edit src/**` fixture rules. Create a throwaway repository/worktree-layout fixture, start a session rooted inside its worktree, and ask the **binary permission evaluator** about `src/control.ts` versus `docs/outside.md`. Expect allow/deny, respectively; record absolute and relative path inputs, session cwd, binary version and decision evidence. No actual read/edit/shell operation is executed. Reuse a decision-only harness, not the provider's normal tool-execution path.
- [ ] Run `OPENCODE_TEST_BINARY="$OC2_BINARY" npm test -- tests/integration/oc2-baseline-worktree.test.ts`, with `OC2_BINARY` set to the authorized absolute installed binary path. Require observed version `2.3.2`; fixture HOME/XDG/config/state/cache are isolated by the existing helper. Record a failure as evidence rather than changing the expected result to pass.
- [ ] If cwd resolution fails, test the approved `allow edit .worktrees/**` fallback against the actual resolved resource and require it to work. Task 3 then emits that single extra territory per role. No runtime detection flag, new mirror catalog or broader fallback. If neither route works, stop: required evidence is unavailable/contradictory; no rollout.

### Task 2: Pin the current generation before retiring defaults

**Metadata:**
- risk: medium
- parallel: false
- depends_on: ['Task 1']

**Files:** Modify `tests/cli/permission-consolidation.test.ts`, `tests/fixtures/kiki-permission-history.json`, `src/cli/permission-consolidation.ts` as necessary.

**Interfaces:** Keep `HISTORICAL_GENERATED_SEQUENCES: Record<string, PermissionRule[][]>` and `classifyPermissionSources(agent, baseline, sources): Classification` unchanged.

- [ ] Before editing `config.ts`, capture exact `generateAgentPermissions(DEFAULT_CONFIG)` arrays in the test fixture using the current source/build conventions. Assert their all-role sum is 569. Add `current_pre_simplification_generation_is_known`: every captured tuple for each role is in its historical membership union. Run `npm test -- tests/cli/permission-consolidation.test.ts`; expect red if coverage is incomplete.
- [ ] Append missing **exact ordered current sequences** to runtime catalog and fixture, retaining existing sequences and adding honest provenance: current working-tree generator, date, source revision and dirty-source status. Do not reconstruct from guessed patterns or normalize duplicates. If already fully covered, retain evidence and avoid redundant catalog expansion.
- [ ] Run the same test green; assert fixture/runtime catalog equality and total captured count. Pin captured output independently of future `generateAgentPermissions()` so the test still proves retirement after Task 3.

### Task 3: Emit the lean baseline and shared policies

**Metadata:**
- risk: high
- parallel: false
- depends_on: ['Task 2']

**Files:** Modify `src/cli/config.ts`, `tests/cli/config-readonly-git.test.ts`, `tests/cli/config-scrt-edit.test.ts`, `tests/cli/config-worktrees.test.ts`; create `tests/cli/permission-baseline-simplification.test.ts`.

**Interfaces:** Preserve `generateAgentPermissions(config: KikiConfig = DEFAULT_CONFIG): Record<string, PermissionRule[]>`. Add `generateGlobalPermissions(): PermissionRule[]` and `generateSecretPolicies(): PermissionRule[]`; installer/probes consume these exact outputs.

- [ ] Add `exact_lean_role_brackets`, using independently specified arrays, with this order for every role:
  allow shell `*`; ask shell `kiki permissions add *`; ask shell `kiki permissions remove *`; deny edit `*`; the following allow-edit territories in table order; finally ask shell `git push *`.

  | Role suffix | Territories | Count |
  |---|---|---|
  | orchestrator | `.agentic/kiki/TASK_REGISTRY.json`, `.superpowers/sdd/**` | 7 |
  | brainstormer, planner (each) | `docs/superpowers/**` | 6 |
  | implementer | `src/**`, `tests/**`, `.gitignore`, `.superpowers/sdd/**` | 9 |
  | gui-designer | `src/**`, `tests/**`, `.superpowers/sdd/**` | 8 |
  | reviewer, escalation (each) | `.agentic/reviews/*`, `.opencode/docs/reviews/*` | 7 |
  | historian | `docs/**`, `README*`, `CHANGELOG*`, `.agentic/**` | 9 |

  Preserve existing configured-path substitutions for retained path-derived territories; verify DEFAULT_CONFIG exactly matches this table. Do not add grants for separately configured decisions/knowledge/plans/specs.
- [ ] Add `shared_protection_exact_shape_and_total`: global permissions equals only `{action:'shell', resource:'git push *', effect:'ask'}`; policies equals the seven ordered `SECRET_GLOBS`, each with read then edit resource prefix, `action:'tool.use'`, `effect:'deny'`. Assert 59 + 1 + 14 = 74, no role duplicates, no read/route/secret permission entries. Under the measured fallback, insert `.worktrees/**` immediately before final push in every role and assert 67 + 1 + 14 = 82; the explicit fallback supersedes the normal nine-line cap (implementer/historian then have ten).
- [ ] Replace obsolete generator expectations: routine Git/list/check covered by shell `*`, only two permission-mutation asks, force push is ask not deny, publishing wrappers mechanically allowed, no mirrors/tmp/route grants. Test order directly; do not implement a new approximate runtime evaluator. Secret tests assert policy shape, not nonexistent role tails.
- [ ] Run red: `npm test -- tests/cli/permission-baseline-simplification.test.ts tests/cli/config-readonly-git.test.ts tests/cli/config-scrt-edit.test.ts tests/cli/config-worktrees.test.ts`.
- [ ] Implement the outputs in existing builders using one small shared bracket helper and existing path helpers. Delete now-unused publishing/force/read-only/route/mirror/secret-permission emission helpers/constants. Keep `SECRET_GLOBS` exported for unchanged validators. No new config option or abstraction layer.
- [ ] Repeat the command green. Existing tests depending on removed emission are updated in Tasks 4–6, not disabled.

### Task 4: Manage both top-level fragments in the existing transaction

**Metadata:**
- risk: high
- parallel: false
- depends_on: ['Task 3']

**Files:** Modify `src/cli/opencode-config.ts`, `tests/cli/install-transaction.test.ts`, `tests/cli/global-policy.test.ts`, `tests/cli/permission-baseline-reconciliation.test.ts`; create `tests/cli/managed-global-fragments.test.ts`.

**Interfaces:** Keep `installGlobalFiles(directory = globalDirectory(), update = false): void`. Add private `planManagedGlobalFragments(text: string, file: string): {text: string; permissions: PermissionRule[]; policies: PermissionRule[]}` for the two fixed locations only. It consumes Task 3's generators and returns expected whole arrays for reread verification; no file mutation/state.

- [ ] Add table-driven failing cases and run `npm test -- tests/cli/managed-global-fragments.test.ts`:
  - `append_preserves_user_prefix`: user shell `*` ask, `git status *` allow, `git diff *` allow, and an arbitrary user policies array (including additional policy fields) retain exact values/order/comments; append Kiki entries after them.
  - `identical_user_tuple_is_not_owned`: an unmarked user copy survives unchanged and a separately marked Kiki copy is appended; never globally deduplicate.
  - `recognize_noop_and_user_additions`: second update is byte-stable/no new backup; user entries appended after a managed block are preserved and the managed block moves behind them without duplicates.
  - `managed_drift_stops_with_evidence`: edit action/resource/effect, remove one statement, add a field, reorder managed statements, duplicate or partially remove markers. Expect file + location + expected/observed evidence, unchanged files, no backup/mutation. Whitespace/object-key reordering alone is not semantic drift.
  - `malformed_or_ambiguous_top_level_stops`: non-array permissions/policies, malformed JSONC, duplicate top-level permissions/policies keys or duplicate keys in managed entries fail before writes. User policy objects are not narrowed to Kiki's three-field schema.
- [ ] Implement the private planner with JSONC AST offsets/comment boundaries. If both markers absent, append the canonical marked fragment after all existing user items; if present, verify exact owned contents before relocating to the end. Leave user spans untouched, including comments and extra fields. Refuse malformed/unbalanced/duplicate markers; do not infer ownership from “looks like a secret/push” entries.
- [ ] Integrate planning into installer preflight before registration mutation and backup. Use the existing selected global target, not a new file. Preserve user top-level entries in other global documents; do not consolidate/delete them. Include top-level deltas in `needsChange`. After `registration.apply()`, patch role arrays then apply the preflight-approved fragment edits to freshly read target text so captured registration text cannot overwrite them. Verify both top-level arrays plus role arrays by reread **before** markdown writes/stripping. Retain all existing snapshots, backup protections, rollback and diagnostics.
- [ ] Keep role reconciliation exactly per-rule. With `splitSecretTail` now empty for lean output, target is canonical baseline followed by preserved customs. Do not move customs before the final push to invent stronger protection: the spec accepts manual overrides; only the generated role bracket promises its final push position.
- [ ] Add `current_retired_defaults_disappear_in_custom_mixed_arrays`: all eight captured Task 2 sequences interleaved/reordered/truncated with unknown allow/ask/deny customs across config and markdown. Assert retired-only tuples vanish, fresh defaults occur once, customs retain existing stable order and differing effects.
- [ ] Extend existing fault injection: failure after fragment write, incorrect policies reread, role reread failure, registration failure and mid-prompt failure restore original bytes/existence/modes for config and markdown. Backup includes original policies, restrictive modes remain, incomplete rollback points to backup recovery. No ownership state is read/written/backed up; preexisting state remains inert.
- [ ] Run green: `npm test -- tests/cli/managed-global-fragments.test.ts tests/cli/install-transaction.test.ts tests/cli/global-policy.test.ts tests/cli/permission-baseline-reconciliation.test.ts tests/cli/permission-consolidation.test.ts`.

### Task 5: Deliver minimal behavioral prompt changes on install and update

**Metadata:**
- risk: medium
- parallel: false
- depends_on: ['Task 4']

**Files:** Modify `src/cli/config.ts`, `src/cli/opencode-config.ts`, `tests/cli/permission-baseline-simplification.test.ts`, `tests/cli/install-transaction.test.ts`, `tests/cli/update.test.ts`.

**Interfaces:** Add `withBaselineBehaviorPrompt(prompt: string, agent: string): string` in `config.ts`, used for generated role prompts and by `nativeAgentContent` for existing prompts. Keep `withPermissionRequestPrompt(prompt)` and its exact fragment unchanged.

- [ ] Add failing `all_role_behavior_lines` assertions: exact approved worktree sentence; short explicitly labeled behavioral tool line; existing binding approval sentence minimally includes `Deploy`; unchanged managed permission-request fragment remains the exact tail.
- [ ] Use tool-line copy:
  - brainstormer/planner: `Verhaltensregel: Web-Recherche ist erlaubt; kein MCP, keine Delegation, kein Code Mode.`
  - orchestrator: `Verhaltensregel: Kein Web, kein MCP, kein Code Mode; Delegation nur an die sieben Kiki-Rollen.`
  - remaining roles: `Verhaltensregel: Kein Web, kein MCP, keine Delegation, kein Code Mode.`
  Preserve the orchestrator's existing named delegation boundary. Prefix the publish-consent text with `Behavioral rule:` and minimally change `publishing-route approval` to `publishing/Deploy-route approval`; do not weaken rejection/stop wording.
- [ ] Test existing custom prompt migration, CRLF and repeated update: unrelated prompt/frontmatter bytes/content remain, old exact publish-consent line is replaced only once, missing required copy is added, behavior additions appear once **before** the permission-request tail. A conflicting/duplicate managed behavior heading stops rather than overwrites, like the existing managed permission-request fragment.
- [ ] Run red: `npm test -- tests/cli/permission-baseline-simplification.test.ts tests/cli/install-transaction.test.ts tests/cli/update.test.ts`.
- [ ] Implement one small idempotent managed behavior section (`## Kiki baseline behavior (v1)`) plus targeted exact old-consent replacement. Do not replace existing entire prompts with baseline templates. Remove only obsolete generated claims that mechanical route/secret-tail rules still exist when refreshing known exact generator copy; preserve unrelated custom text. Add the section before the unchanged managed permission-request tail and keep the project-config pointer stable.
- [ ] Repeat the command green; assert prompt migration errors participate in preflight/rollback.

### Task 6: Preserve CLI behavior and update affected expectations honestly

**Metadata:**
- risk: medium
- parallel: false
- depends_on: ['Task 5']

**Files:** Tests `tests/cli/{permission-requests,permissions-command,project-permissions-bounded,oc2-permissions}.test.ts`, `tests/integration/{oc2-single-source,oc2-permission-request-matcher,oc2-security-boundaries}.test.ts`; compatibility-only `src/cli/permission-requests.ts` if needed.

**Interfaces:** All existing CLI exports/signatures unchanged. `projectPermissionRules(local, inherited)` continues producing its existing required project secret suffix; no policy writer or prompt writer is added to the CLI.

- [ ] Run `npm test -- tests/cli/permission-requests.test.ts tests/cli/permissions-command.test.ts tests/cli/project-permissions-bounded.test.ts tests/cli/oc2-permissions.test.ts` and record failures, distinguishing behavior regressions from assertions that accidentally use the global generator as an expected project suffix.
- [ ] Keep tested project behavior: literal resource validation, secrets/role boundary rejection, redundant read/edit detection, repeat add/remove, protected suffix, stale selection, symlink/global/ancestor write rejection, native asks and backup/rollback. Where an assertion says `implementer.slice(-7)`, replace that expected value with the **same seven explicit secret-deny tuples** it meant before; do not delete or weaken the assertion. Test with both pinned historical inherited arrays and final lean inherited arrays.
- [ ] Add/retain `read_redundancy_uses_native_default`: removal of `allow read *` must not turn an already-readable nonsecret file into a newly grantable permission. If needed, minimally adapt `planPermissionAdd`'s read-coverage check to account for native default allow when no read rule matches, while retaining explicit read ask/deny behavior and secret validation. Run red before that compatibility correction; do not introduce a policy evaluator.
- [ ] Update only baseline-dependent integration expectations: force push asks; no route denials; secrets bind through generated policies included in fixtures. Keep historical matcher measurement arrays/provenance where intentionally fixed, but distinguish them from final-generator tests. Update single-source assertions that formerly expected no top-level permissions.
- [ ] Run the CLI command green. If an existing CLI behavior cannot be preserved without changing approved scope/security intent, stop and report the concrete conflict rather than relaxing tests.

### Task 7: Gate final generator state with real policy decisions

**Metadata:**
- risk: high
- parallel: false
- depends_on: ['Task 6']

**Files:** Create `tests/integration/oc2-baseline-policies.test.ts`; finalize Task 1's worktree test. Reuse existing isolated fixture helpers.

**Interfaces:** Consume all three Task 3 generator outputs, not copied alternate rule arrays. Record binary path/version, case inputs, expected/actual decisions and exit status; no real tool operation is invoked.

- [ ] Build the policy decision battery against installed **2.3.2**, requiring no live configuration/credentials. For each role choose a placeholder secret inside its actual territory (e.g. implementer `src/.env.local`, planner `docs/superpowers/secret.txt`, orchestrator `.superpowers/sdd/key.pem`). Cover read/edit, all seven secret patterns, broad territory allows, later handwritten exact allows and persisted approvals. Expect deny with policy evidence (`Blocked by configuration policy`), not ask.
- [ ] Include an agent with no own rules; native `.env` ask without policies versus deny with generated policies; user top-level shell/status/diff entries and an arbitrary user policy alongside Kiki entries. Open controls: nonsecret territory edit allow/read allow, ordinary nonsecret read outside territory remains native-default allowed. No route-denial claim is made.
- [ ] Run `OPENCODE_TEST_BINARY="$OC2_BINARY" npm test -- tests/integration/oc2-baseline-policies.test.ts tests/integration/oc2-baseline-worktree.test.ts`. Require all asserted decisions and observed version 2.3.2. A missing binary or skipped suite is **not** a passed acceptance gate.
- [ ] Any policy deviation: stop, preserve evidence and report; do not proceed to rollout or invent role secret tails. Recheck final worktree generation; apply only the approved measured fallback from Task 1 if needed. Record actual 74 or 82 total and per-role counts.

### Task 8: Regenerate, self-verify and hand off without rollout

**Metadata:**
- risk: medium
- parallel: false
- depends_on: ['Task 7']

**Files:** Generated affected `dist/cli` outputs only; no documentation edits.

**Interfaces:** Produce implementation evidence and final-review handoff for the parent session; owner alone runs later update.

- [ ] Run `npm run build`; require exit 0. Inspect generated diff; never wipe `dist` or resurrect deleted ownership artifacts.
- [ ] Run `npm run lint`; record exit status and any baseline/new failures separately.
- [ ] Run `OPENCODE_TEST_BINARY="$OC2_BINARY" npm test -- --no-file-parallelism`; capture exact counts/status. Also run focused native gates:
  `OPENCODE_TEST_BINARY="$OC2_BINARY" npm test -- tests/integration/oc2-isolation.test.ts tests/integration/oc2-permission-request-matcher.test.ts tests/integration/oc2-single-source.test.ts tests/integration/oc2-security-boundaries.test.ts tests/integration/oc2-baseline-policies.test.ts tests/integration/oc2-baseline-worktree.test.ts`.
  Existing review evidence records the pre-existing `oc2-isolation`/`migrateOC1` failure at `tests/integration/oc2-isolation.test.ts:55:29`, reproduced at baseline `bb1acee` (`.agentic/reviews/2026-11-23-permission-baseline-reconciliation-final-review.md:27–28`). Report actual current results; do not assume that failure explains another failure or claim full green.
- [ ] Run `git diff --check` and `git status --short`; compare initial dirty-tree inventory. Review global entry counts, ordered brackets, catalog provenance, mixed retirement, fragment drift evidence, full-file rollback, unchanged CLI behavior and prompt minimality. No new dependencies, ownership-state consumers or global CLI write path.
- [ ] Hand off exact commands/results and probe evidence for final independent review. Historian subsequently updates README around line 239, CHANGELOG and API contract lines 247–248; preserve preexisting edits there. No execution of install/update, commit or publishing belongs to this plan.

## Rollback and stop notes

- Development rollback is selective reversal of **this implementation's** hunks against the captured starting dirty tree, never `git reset --hard`, broad checkout or regeneration from HEAD. Retain catalog capture/evidence when reporting a stopped probe.
- Fixture transactions restore snapshots and verify bytes/existence/modes; test backup recovery diagnostics when restoration fails. Never use these tests as authorization to touch the live global directory.
- Policy mismatch blocks delivery/rollout. Worktree mismatch activates only the approved fallback; unresolved fallback failure blocks delivery. A denied permission request is final: do not retry via another tool/path.
- Final integration remains uncommitted; owner decides rollout and runs `kiki update` themselves after review.

## Self-review

Coverage: spec §§2–4 and appendices A/B map to Tasks 3–6; acceptance 1/2 and appendix D map to Tasks 1/7; acceptance 3/4 map to Tasks 2–4/8; acceptance 5 maps to Task 6; acceptance 6 is the explicit post-review historian handoff. The fallback's 82 total necessarily permits ten lines in two roles and is the spec's stated conditional exception, not an invented scope change. Existing role customs stay preserved even if they override generated permission rules; secret policies remain independently binding.

No unresolved requirements contradiction found. The dispatch resolves the stale draft-status wording; inaccessible external probe files are not needed because isolated repository helpers exist. This plan adds no live action and requires no new owner decision.
