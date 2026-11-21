# Managed Permission Requests — Design

Date: 2026-11-20 · Status: **APPROVED by the user on 2026-11-20**, recorded in `.agentic/kiki/TASK_REGISTRY.json`
(`managed-permission-requests.designApproval`). Removal clarification also explicitly approved: selected handwritten
project rules may be removed; mandatory protection remains (“Ja, Schutz bleibt”). Next: plan → architect review (§8).

## 1. Intent

bb1acee landed the single-source architecture (all 8 roles' permissions in global `~/.config/opencode/opencode.json(c)`
`agents.<name>.permissions`; JSONC-preserving transaction; additions-only project tier). Three gaps remain:
(a) `kiki update` recognizes its own past output only by content-shape catalog — manual divergence is silently preserved
as "customs" or halts as ambiguous; (b) project permission changes and agent permission requests are raw hand-edits —
unvalidated, unbacked, bypassable; (c) the new `kiki permissions` command rules needed verification against the actual
binary — measured in §5 (the known publishing-ask subset was tested earlier; this spike covers only the new rules, no
blanket envelope claim). User goal (KISS): clean, convergent `kiki update`, no persistent garbage.

## 2. Current state (bounded evidence)

- Shell envelope, ALL 8 roles incl. orchestrator: routine `shell *` allow → 18 publishing asks → force-push denies
  (`src/cli/config.ts:192-243`; orchestrator gets plain `shellRules()` at `:488`). Prior claim "orchestrator
  ask-by-default" is **FALSE** — do not propagate.
- Transaction: backup → `patchAgents` write → verify → rollback (`src/cli/opencode-config.ts:251,445-453,750-782`).
  Project-tier validator: additions only, masks + secret suffix, fail-closed (`src/cli/oc2-permissions.ts:103-233`).
  Recognition: `classifyPermissionSources` + pinned shapes (`src/cli/permission-consolidation.ts:36-357,435-493`).
- No ownership state exists (grep `state.json|kiki/state|ownership` over `src/` → comments only); no `kiki permissions`
  command (`src/cli/commands/`); no audit log (user has not approved one — omitted).

## 3. Approach

**Chosen:** (A) global ownership evidence + (B) a permissions CLI on the existing validator. **Rejected:** runtime hook/policy
engine (user chose managed-writes only), project baseline mirrors (proven drift), agent raw config edits (unvalidated).

### A. Ownership evidence — `~/.config/opencode/kiki/state.json`

Versioned per-role hashes of the exact `agents.<name>.permissions` field kiki last wrote — evidence only, no rules stored, never a second policy source. On update: preflight re-hash; unmodified owned field → replace with fresh baseline + rewrite hash; mismatch (manual divergence) → halt with a per-role drift report (recorded vs current hash; rule-level diff only where existing evidence reconstructs it), never overwrite; absent/stale/corrupt state → conservative legacy bootstrap via the existing content classifier, nothing guessed or deleted. State is written after config verify; config+state is two files — **no atomic multi-file claim**; the crash window converges on rerun. Null alternative (classifier alone, already safe) cannot distinguish kiki's older outputs from user edits — they halt as "ambiguous" and owned-field drift is silently preserved as customs; the state record removes both failure modes (its unique value). Coupling cost: hash scheme + format version track builder output; corrupt state degrades to bootstrap; deleting the file restores today's behavior. The historical catalog retires only once state bootstrap is proven on real installs — no immediate removal promised. Project configs are never traversed or rewritten by update; handwritten project additions are user-owned immutable data; conflicts are reported at project check/init/migrate.

“Immutable” above means immutable to update; the explicitly selected project CLI removal approved in §3B is permitted.

### B. `kiki permissions list|check|add|remove` — project scope only

- `list`/`check`: genuinely read-only — zero backup/state/log/config writes. Output is permission rule metadata only,
  never file contents or provider secrets; may print global metadata for all 8 roles subject to the post-implementation
  no-disclosure/zero-write proof (§6.4).
- `add`/`remove`: explicit apply only; reuse the JSONC backup→write→verify→rollback machinery and `projectPermissionRules`
  unchanged. First check existing scoped coverage — minimal justified grant, refuse redundant ones; unknown/ambiguous
  target/action/agent/path → stop. TOCTOU: exact-target byte precheck, re-read immediately before write, drift → abort.
- `add`: validator enforces secrets/role-boundary/publishing protection (masks + secret suffix). New dirs under existing
  `src/**`/`tests/**` need no grant; outside-baseline requests get a narrow file/dir grant + explicit approval request;
  a repeated common pattern is proposed as a reviewed global baseline change separately, never auto-promoted.
- The CLI never edits global policy, prompts, or markdown. New global ASK shell patterns — including the generator ask
  patterns — flow only through the reviewed Kiki generator + `kiki update`, never through this command.
- Generator command rules (all 8 roles incl. orchestrator, emitted via update, appended after the baseline `shell *` allow
  so last-match wins): `kiki permissions list`, `list *`, `check`, `check *` = allow (read-only, metadata-only output);
  `add`, `add *`, `remove`, `remove *` = ask — exact bare + space-wildcard only, no prefix-glob (so `addendum` cannot
  match), and any `|` is prose shorthand, not regex. Measured (§5): bare/flag/target/compound forms hit allow/ask; leading
  global flag, absolute path, `sh -c` and node wrappers measured allow — LIMIT, no bypassproof promise. User accepts this
  canonical literal command boundary as-is: no wrapper-hardening engine, only a trivial fix if one is discovered (none
  implemented).
- `remove`: deletes the explicitly selected project entry (Kiki-written or user-handwritten, not only additive allows)
  under an approved ask; recomputes masks + secret suffix for survivors; never deletes unrelated rules automatically.
  Mandatory protective masks/secret denies must not be weakened; a selected entry still required for survivor protection
  cannot be removed. Project provenance remains indistinguishable: selection, not guessed ownership, authorizes removal;
  no new project ledger/log is invented. This clarification is explicitly user-approved (“Ja, Schutz bleibt”).
- Paths: relative + absolute + the validator's supported canonical forms only (literal paths, `dir/**` prefixes,
  `.worktree(s)/**/...`); no `..`, no other wildcard syntax. Rules stay literal as written; reliable symlink-target
  detection is TO VERIFY — no capability claimed yet.
- Approval semantics: an ask is OpenCode's native human prompt — the CLI validates shape, not consent, stores nothing about approval (no runtime token); human enforcement is the native ask plus the no-workaround rule, not a hard guarantee. Role prompts gain a narrow request exception: any agent, orchestrator included, may request additional file/dir rights for its own role via the gated CLI when the role validator permits and a human approves the ask; narrow role protections (secrets, boundaries) are unchanged. Never permitted: self-authorization without ask, global policy edits, raw config edits or wrappers. Rejected ask or true `PERMISSION_BLOCKED` stops without retry/workaround; the approved-request workflow does not repeal the terminal no-retry rule.

## 4. Remaining unverified (gaps are not turned into guarantees)

Backend mechanics are now proven by the child spike (§5): a real child's ask reaches the permission API under the child's sessionID; rejection yields a child error with no execution; approval executes exactly once; the parent resumes. Remaining is the human visual UI only: the fixture plugin observes backend events in the root process, which is not proof of a TUI root visual prompt or human acceptance — one real human-UI smoke stays optional, only if the user wants it (no paid-model call permission exists yet). Child-evidence scope: one actual `kiki-implementer` child (depth 1) plus the earlier all-8 primary-role probes — no claim about the other roles as children. The matcher test's default-vs-`--auto` discriminator remains inference (and `--auto` is not human approval). The exact argv/resource parse stays uninspected (resources measured as exact strings); `list`/`check` zero-write awaits production tests (the public CLI does not exist); wrapper LIMITs stay a no-workaround behavior constraint, not OS security. A generation helper alone proves no native effective behavior.

## 5. Spike results (measured; harness `tests/integration/oc2-permission-request-matcher.test.ts`, 418 lines)

Actual OpenCode 2.3.2, isolated existing fixture, deterministic loopback provider, no paid models; allowed tool calls run a harmless fixture stub (`exit 0`) — only the permission decision string is measured; the force-push deny control never executes. Recorded run: `OPENCODE_TEST_BINARY=/home/lutz/.opencode/bin/opencode TMPDIR=/tmp/opencode npx vitest run tests/integration/oc2-permission-request-matcher.test.ts` — exit 0, 2/2 tests, ~45s (matcher ~38s, child ~7s); earlier harness-correction failures are recorded honestly (observational spike, not product-regression TDD). Tally verified from the harness source: 20 cases × 8 roles = 160 decisions, outcomes identical across all 8 roles — 6 allow base cases (bare/flag `list`, bare/target `check`, routine `echo` control, `addendum` no-false-positive); 6 bare/flag/target mutations + `add && list` assert ask; `list && add` and `cd && add` measured ask through the actual shell tool (exact argv/resource parse not inspected); 4 LIMIT forms measured allow (leading global flag, absolute executable, `sh -c` wrapper, node wrapper); 1 deny control (`git push --force`). Scope: the new command rules only — the known publishing-ask subset was tested earlier; no temp config mutation outside the fixture.

Child spike: actual primary `kiki-orchestrator` dispatches a real `kiki-implementer` child (depth 1, native subagent tool) under the deterministic loopback provider; a fixture stub marks execution, and an event-subscriber fixture plugin answers the pending ask via the supported `permission.reply` API — no `--auto`. Measured per case: exactly 1 `permission.asked`, sessionID = child, action `shell`, resource `kiki permissions add src/x.ts`; the child's parentID matches the root agent, validated via sanitized session exports; root `session.created` is absent (subscription race) — linkage comes from the exports, no invented event row. `reject` → child permission-rejected error, no marker, parent finishes; `once` → completed, marker exactly 1. Backend events visible at the root process are not TUI/human-acceptance proof (§4).

## 6. Acceptance checks

1. `kiki update` on unmodified owned fields: replaces, rewrites state (hashes only), zero diffs on rerun.
2. Manual divergence: halts with per-role drift report (recorded vs current hash; rule diff only if reconstructable), no overwrite.
3. Absent/corrupt state: legacy classifier bootstrap; nothing unrecognized deleted.
4. `list`/`check`: metadata-only output; zero writes proven post-implementation.
5. `add`: validator-clean, project-scope apply (masks + secret suffix), backup, idempotent; violations refused; global
   policy untouched.
6. `remove`: only the explicitly selected project entry deleted under approved ask, including handwritten rules;
   mandatory masks/secret protection retained or recomputed for survivors without weakening; unrelated rules preserved;
   no inferred provenance or global edits.
7. Generator emits the 8 exact command rules for all 8 roles (§5-measured); remaining §4 unknowns stay unclaimed until
   separately proven and block features depending on them.
8. No new deps/runtime hook/audit log/models/ledger/consent token; CLI never edits global policy.

## 7. Non-goals / guardrails

No runtime hook or policy engine; no audit log/retention engine/budget/runners/new deps/paid tests/models; no project
ledger/log; no consent token or `PERMISSION_MISSING` schema; no md permissions; no auto-promotion; no tamperproofness,
symlink, or native-effective claims; arbitrary manual native edits stay outside the guarantee (accepted residual risk).
Guardrails: no hardcoded secrets, no internal stack traces in CLI output, parameterized queries wherever storage is touched.

## 8. Handoff (compact, self-contained)

Baseline: bb1acee implements the approved 2026-11-19 spec (`docs/superpowers/specs/2026-11-19-global-permissions-single-source-design.md`). Key files: `src/cli/config.ts:192-243,488` (envelope; orchestrator NOT ask-by-default), `src/cli/oc2-permissions.ts:103-233` (validator), `src/cli/permission-consolidation.ts` (legacy classifier + catalog), `src/cli/opencode-config.ts:251,445-453,750-782` (patch/backup/transaction); spike harness `tests/integration/oc2-permission-request-matcher.test.ts` (§5). Spike complete: 2/2 harness tests — 160/160 matcher decisions identical across all 8 roles, plus the real-child ask/reject/approve case (§5); backend rejection/approval proven, residual unknowns §4 (human visual UI acceptance only, argv parse, list/check production zero-write, accepted wrapper LIMITs). User approval and removal clarification are recorded above. Next: writing-plans → architect review → authorized implementation, starting from the registry task + this spec + the harness; optional one real human-UI smoke only if the user wants it (no paid-model call permission yet). No further test runs or new asks in the author session. Ownership-state absent/corrupt bootstrap and the accepted symlink limitations remain implementation/test concerns; removal follows the approved selected-entry/protection contract (§3B), with no invented project state. Never: audit log, runtime hook, project ledger, consent token, immediate history-catalog removal, raw config edits, auto-promotion, paid models without separate approval. The "SDK hook" finding (no provenance, mutable sequence) is not to be re-investigated. State+CLI remains a minimal design to validate, not a claim of completed production verification.
