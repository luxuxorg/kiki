# Plan Review: Global Single-Source Permissions — REVISED (Rev 3, architect gate)

- **Date:** 2026-11-20 (Rev 3). Reviewer: kiki-reviewer (read-only; only this report edited).
- **Artifacts:** minimally revised spec §6/§7 + plan (post-code-review correction; user: "Ja, OK. So umsetzen.").
- **Supersedes Rev 2** (PASS_WITH_NOTES) and Rev 1 (FAIL user-decision), both condensed at end.

## Verdict (Rev 3): PASS — architect gate on the corrected plan

**Basis:** Verified the revision against the user-approved correction and the code-review blockers, reading both docs in full:
- Crash invariant corrected exactly as approved: catchable failure ⇒ full rollback (spec §6:98-99); rollback failure reports incomplete restoration + backup location + original error (§6:99; plan repair bullet `rollback_failure_reports_backup`); hard death before strip ⇒ old/status-quo markdown authoritative, not new baseline, per observed v2.3.2 ordering (§6:100-102; plan Task 2 step 7); death mid-strip ⇒ honest mixed per-agent states, **no** global "never weaker"/multi-file-atomicity claim (§6:104-106); rerun converges idempotently. No strip-first, no hook, no new component/dependency/scope decision anywhere.
- Classification now preflights **all** config + markdown sources before writes, "validation alone is not generated ownership" (plan Task 2 step 3); validated custom allows preserved/reported, custom denies/ambiguity halt before mutation; both injected tests `reread_mismatch_no_strip` and `rollback_failure_reports_backup` specified with exact injection semantics, completing — not replacing — the seven fault cases.
- Crash-window test renamed `crash_window_stale_markdown_remains_authoritative`; fixture must use recognized generated markdown (reachable post-preflight state — a correctness improvement, not a weakening); mixed per-agent pinning + rerun convergence required.
- Inner-array comments: preserve-or-halt fail-closed, pinned by `custom_jsonc_comments_survive`.
- One bounded builder fix round, final code re-review still gates batch LIVE (D3/D4, no commits/pushes); Tasks 1–4 not restarted.
Prior code-review blockers are addressed, not duplicated. No hidden weakening found; settled policy/boundary text unchanged.

**Note (cosmetic):** step 6's legacy test names (`strip_midway_failure_restores_originals`, `second_run_byte_stable`) vs the existing merged fixtures need naming harmonization during the fix round — behavior requirements are unaffected.

---

## Historical — Rev 2 (2026-11-20): PASS_WITH_NOTES (architect review of additive-clarification revision)

Boundary resolved to Kiki-managed write validation only (no runtime hook, manual external edits outside guarantees); conservative bounded path forms instead of a general glob solver; mask-suffix ordering verified mechanically; gates (real-binary matrix before batch LIVE) retained. Notes: focused-vs-full check coverage confirmable at whole-change review; mask set pinned by representative tests; historian doc edits stay bounded.

## Historical — Rev 1 (2026-11-20): FAIL — Reason: user-decision, Severity: major

"Cannot weaken global protection" was unsatisfiable for manually edited native configs within then-approved scope (no native file-level policy boundary in installed schema; SDK evaluate hook uninstalled; runtime component unapproved). Options reported; user chose Kiki-managed-write validation only with batch authorization. Rev 1's verified code/SDK evidence (oc2-permissions literal-key replay, config.ts broad fallbacks, SDK hook surface, native policies action namespace) remains the factual basis for later rounds.

*Rev 2's full verification detail (mechanics re-check, criteria table, three notes) is preserved in the file history of this session's earlier edit; the condensed record above carries its verdict and load-bearing conclusions.*

