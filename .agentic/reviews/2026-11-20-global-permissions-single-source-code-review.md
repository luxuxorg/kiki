# Code Review #1: Global Single-Source Permissions Implementation (whole-change)

- **Date:** 2026-11-20. Reviewer: kiki-reviewer (read-only; only this report written).
- **Under review:** builder diff (session evidence: 13 focused CLI files 153 pass; build/lint 0; extra full `npm test` w/o env 846 pass/20 skip/4 fail = missing-binary fixtures; isolated real v2.3.2 `/home/lutz/.opencode/bin/opencode`: `oc2-single-source` + `opencode-global-agents` 7 pass, `security_shape_precedence` 1 pass/4 scenarios skipped; diffcheck 0) vs approved plan + spec.
- **Method:** read actual diff/source (config.ts, opencode-config.ts, oc2-permissions.ts, oc2-migration.ts, permission-consolidation.ts, install-transaction.test.ts, oc2-single-source.test.ts, security-boundaries header); no tests/probes rerun, no source/config changes, no delegation.

## Verdict: FAIL

Implementation quality is high and the builder's evidence is honest — but LIVE stays blocked for one spec-rooted reason and two implementation-rooted reasons.

### Blocking items

**1. Crash-window premise disproven — Reason: spec, Severity: major.**
Spec §6 (`…design.md:97-101`) claims the crash window is safe because fresh config `*`-anchors make stale markdown "dead weight" (window = new baseline). The mandated isolated-binary gate (spec §3:46-48) proved the opposite on v2.3.2: file-agent markdown rules append **after** the config array, so the window evaluates as the stale markdown (`tests/integration/oc2-single-source.test.ts:136-141` records this verbatim as a LIVE stop; rerun converges, :144-157). The builder implemented the approved ordering faithfully and correctly halted LIVE per the spec's own contradiction gate — root cause is the spec's false premise (inherited from the 2026-11-09 record "config appended after markdown", now contradicted by the actual binary), **not** the implementation. The test's *name* still encodes the dead premise (`crash_window_equals_new_config` asserting stale-wins) — rename during correction.

**2. Markdown permission rules silently dropped, not classified/imported — Reason: implementation, Severity: major.**
`collectAgentSources` feeds only config files as sources (`opencode-config.ts:573-577`), and markdown `permissions` are validated then voided (`:592-596`, comment: "The global config is the only source of recorded customs this round"); `classifyPermissionSources` never sees them (`:634`). This violates spec §6:89-96 ("No automatic drops… deduplicated … across all sources (markdown + config)") and plan Task 1 ("then the single existing role markdown"). A markdown-only custom rule — especially a deny — is removed with no halt and no verbatim report entry: fail-open for unenumerated states. No loss occurs for the enumerated live state (all live markdown sets are catalog-legacy/fresh-baseline per the 2026-11-19 spec review), but the approved fail-closed property is simply not implemented. Fix is bounded: pass markdown rules as the trailing `PermissionSource`; the classifier already preserves customs and halts on custom denies/ambiguity — add two tests (markdown-only custom allow preserved; markdown custom deny halts).

**3. Plan-mandated injected failure tests absent — Reason: implementation, Severity: major.**
Plan Task 2 step 6 required seven injected-fault tests. Five exist with real fs-fault injection (`tests/cli/install-transaction.test.ts`: backup, strip-midway rollback, registration, crash+second-run byte-stable). Missing everywhere in `tests/`: `reread_mismatch_no_strip` and `rollback_failure_reports_backup`. The untested branches are load-bearing: readback verification (`opencode-config.ts:707-714`) is the persist-before-strip invariant, and rollback-failure reporting (`:724-729`) is the crash-recovery contract of a risk:high transaction. Per review contract, a missing plan-mandated check for this delta blocks.

### Builder admissions — ruled

- **Markdown customs stripped, not imported:** concrete requirement violation — **blocking** (item 2).
- **Comments inside replaced permissions arrays lost:** concrete deviation from plan Task 2 step 5 (which explicitly warned wholesale `patchAgents` replacement loses inner comments); `custom_jsonc_comments_survive` was never written. **Minor → note**: no actual loss in the planned batch (the real global config has no existing permission arrays to hold comments); fix via offset-preserving edits or halt-on-inner-comment before LIVE.
- **No independent RED for new tests:** process note; honestly disclosed; tests exist and pass.

### Non-blocking notes

- `security_shape_precedence` 1 pass/4 scenarios skipped is pre-existing-file evidence with the file's own skip-honesty design (`oc2-security-boundaries.test.ts:26-38`); not load-bearing for this delta — all four new acceptance tests passed.
- `external_directory` accepted forms include broad `/tmp/**` — inventoried pre-existing Noema grants preserved as-is, not new policy.
- Docs/`watchdog.ts`/`opencode.jsonc` modifications are pre-existing prior-round dirty state (read-only-git, watchdog-empty-reasoning rounds; mirror/model-removal state) — preserved as required; historian claim updates (plan Task 4 step 7) are authorized.
- Reviewer cannot verify "no live writes/no backups" on external directories (prior `external_directory` denials respected; no alternate access attempted) — accepted on the builder's record.

### Verified positives (evidence-based)

Bounded validator (`oc2-permissions.ts:103-245`): allow-only read/edit plus inventoried `external_directory` tmp forms; literal/dir-prefix paths; wildcard/traversal rejection; secret-path rejection; explicit role-boundary crossing rejection; emitted order additions → overlapping asks → secret denies, so additions grant meaningful rights past the global `edit *` fallback while secret descendants stay denied — **proven on the real binary** (`oc2-single-source.test.ts:227-236`: ordinary edit completed, `scripts/.env`/`src/.env` denied, publishing ask with zero stub invocation, routine shell completed). Transaction: registration → patch arrays → readback verify → strip → strip-verify → removals, snapshot rollback (`opencode-config.ts:699-734`); classifier fail-closed for config sources (`permission-consolidation.ts:114-172`, custom-deny blocker, conflict blocker, incomplete-shape blocker). Init validation-only (`:744-749`). Manual-override limit documented, not promised (`:244-261`). No models/prompt bytes touched; no commits/pushes.

## Plan-correction guidance (blocker 1 — within approved scope, no weaker guarantee, no new user boundary decision)

The already-approved scope **can** absorb the proven semantics without any relaxed boundary:

1. **Correct the spec/plan text, not the boundary:** rewrite the §6 crash-window paragraph to the proven invariant — *catchable failure ⇒ full rollback to the pre-update state (strip-failure test proves byte restoration); hard process death inside the sub-second window between config persistence and markdown strip ⇒ the pre-update effective policy remains authoritative (stale markdown wins — proven v2.3.2), i.e., the system runs exactly the status-quo policy, never a newly-weakened one; the next `kiki update` run converges idempotently (proven). No atomic multi-file write is claimed or needed.*
2. **Keep persistence-before-strip.** Do **not** reorder to strip-first: a strip-first crash window would leave agents with no rules (no-match ⇒ ask), transposing the protected secret **denies** into interactive asks — that is an automatically relaxed security boundary and is rejected.
3. **Do not add a startup/runtime consistency check:** that is new runtime behavior outside the user's no-hook boundary; it is not required by the corrected invariant.
4. **Add a preflight gate:** before the first write, require every live markdown permission set to classify fully as generated (the classifier already exists); any unknown markdown rule halts *pre-write*, making the window provably policy-identical to the status quo. (Subsumed by the item-2 fix once markdown becomes a classification source.)
5. **Rename** `crash_window_equals_new_config` to pin reality (e.g., `crash_window_stale_markdown_remains_authoritative`).

## Required implementation fixes (blockers 2–3) before re-review

(a) Markdown as classification source + the two markdown-custom tests; (b) the two missing injected failure tests (readback mismatch → no strip; rollback failure → names backup directory + original error); (c) minor: inner-array comment preservation or halt-on-comment. Then rerun the focused suite + isolated matrix on the final state (recorded evidence only); the batch-approved LIVE rollout remains gated behind the corrected plan, a whole-change re-review, and the existing per-target inventories/backups/readback/stop-on-ambiguity gates. No publishing, commits, or pushes at any point.

---

# Rev 2 — Final code re-review after the sole fix round (2026-11-20)

Reviewer: kiki-reviewer (read-only; only this report edited). Method: read the actual fix-round code and tests against Rev 1's three blockers and the architect-approved Rev 3 plan; judged the builder's recorded evidence (RED 8 pass/4 fail → transaction file 12 pass; focused 13 files 159 pass; build/lint EXIT 0; real v2.3.2 `oc2-single-source` 4 pass + `opencode-global-agents` 3 pass; diffcheck 0; no live writes); no tests rerun, no probes, no delegation.

## Verdict (Rev 2): PASS_WITH_NOTES

**Basis — all three Rev 1 blockers verifiably fixed:**
1. **Markdown as classification source (was: silent drop):** `collectAgentSources` now pushes native markdown `permissions` (`opencode-config.ts:629`) and translated legacy `permission` maps (`:631-633`) as trailing sources; classification runs for every agent before any write. Tests pin the semantics: `markdown_only_custom_allow_preserved` (persisted once, deduped, positioned before the final seven secret denies — `rules.slice(-7)` equals canonical tail; prompt body bytes unchanged), `translated_legacy_markdown_custom_allow_preserved`, and `markdown_custom_deny_halts_before_write` (throws `/custom deny/i`; every tracked file byte-identical; no new backup → halt truly before mutation).
2. **Injected failure tests (were: missing):** `reread_mismatch_no_strip` — afterRename hook tampers the persisted config; asserts injection fired, strip never started, markdown and config restored to pre-update bytes. `rollback_failure_reports_backup` — injected strip failure + injected restore failure; message asserts "rollback was incomplete", `kiki/backups`, and both original errors. `strip_midway_failure_restores_originals` renamed/retained with full byte restoration. All twelve transaction cases present in `tests/cli/install-transaction.test.ts` with real fs-fault delegation.
3. **Crash-window correction (was: false spec premise):** test renamed `crash_window_stale_markdown_remains_authoritative`; uses recognized canonical generated markdown (reachable post-preflight state, per the approved correction); pins on the real v2.3.2 binary that stale markdown stays authoritative before strip, mixed per-agent interruption state pinned per agent without whole-install equivalence claims, and rerun converges idempotently with no new backups.
4. **Comments note resolved fail-closed:** string-aware `hasInnerArrayComments` (`:572-579`) + refusal before write ("comments inside an existing permissions array would be lost. Move them outside the array", `:729-731`), pinned by `custom_jsonc_comments_survive`.

## Notes (non-blocking; one is load-bearing for LIVE)

1. **Historical catalog is empty and live convergence remains unresolved — preserved, not waived.** `HISTORICAL_GENERATED_SEQUENCES = {}` (`permission-consolidation.ts:36`); `tests/fixtures/kiki-permission-history.json` exists with the honest note "Empty until a historical shape has exact content and provenance; unknown rules stay custom and block on deny." This follows plan Task 1 step 4 literally ("pin only when exact content/provenance is available; missing evidence is a blocker, never reconstructed from review counts") — the builder refused to reconstruct the inventoried stale V1 shapes from the review record's rule summaries, which is the conservative, plan-compliant choice, not a defect. **Consequence: batch LIVE is NOT executable to completion.** The live global markdowns (stale V1-era cores plus 2026-11-19 patches, per spec §3) are noncanonical; with an empty catalog their deny rules classify as custom-denied/ambiguous blockers, so LIVE step 1 (`kiki update`) and the Noema classification steps will **halt at preflight before any write** with verbatim evidence. This halt is the designed fail-closed behavior, safe in direction (no writes, no weakening), but it blocks the approved rollout's convergence. Unblocking requires exactly one of: (a) pinning the inventoried shapes into the tracked catalog from exact evidenced content — the recorded /tmp backup corpus (spec review: brainstormer 21-rule core, lines 4-67, with provenance) if still accessible and content-verified — a bounded Task 1 step 4 completion and a **required LIVE input, not optional churn**; or (b) an explicit user decision to resolve each halting stale set manually (which conflicts with the batch's no-per-file-questions authorization and is not pre-approved). This review grants no release readiness for LIVE convergence from canonical synthetic fixtures alone; the synthetic suites prove the machinery, not the live-shape recognition.
2. Cosmetic/process: crash-window and crash-recovery fixtures necessarily use synthetic canonical markdown; fine for machinery proof (see note 1 for the live-shape gap). No independent RED was possible for the two fault tests against already-correct branches for some cases (builder disclosed 8 pass/4 fail RED); recorded honestly.

## LIVE executability (explicit)

**Not executable to completion now.** The safe preflight blocker, exactly: on the live batch, `kiki update` preflight will throw "Refusing to update permissions; manual resolution required" listing the unrecognized live markdown rules (custom denies/ambiguous generated shapes) before any mutation; Noema config classification will halt the same way. No live activation is claimed or performed by this review; LIVE remains gated behind note 1's resolution and the whole-change review. No commits, pushes, or publishing at any point.
