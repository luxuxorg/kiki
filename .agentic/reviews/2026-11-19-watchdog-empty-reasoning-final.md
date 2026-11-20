# Review: watchdog empty/whitespace reasoning fix (final)

Date: 2026-11-19 · Reviewer: Kiki Reviewer (independent, no reruns)
Scope reviewed: actual diffs of `src/server/watchdog.ts` (+13), `tests/plugin/watchdog.test.ts` (+81), `dist/server/watchdog.js` (+13) + `.js.map`/`.d.ts.map` rebuilds. No other file touched by this fix.

## Verdict: PASS_WITH_NOTES

## Basis

Checked the diff against the user-authorized fix requirements (empty/whitespace text/reasoning never counts as content-loop evidence; empty replacement clears prior ring evidence; later nonempty deltas and true nonempty repetition still work; no grace-threshold/permission/live changes), the active guardrails in `.agentic/kiki/alignment.json` (no secrets, no unparameterized DB queries, no stack-trace leaks — all satisfied; OWASP/SOC 2 treated as context only), and the builder's recorded evidence (judged, not rerun).

### Requirement coverage (code evidence)

1. **Empty/whitespace never loop evidence** — `src/server/watchdog.ts:269-276`: guard on `normalize(next).length === 0` returns before `recordRing`, using the *same* `normalize` as `hashText` (:144-149, :151-159), so guard and hash semantics cannot diverge. Applies to the accumulated text, not raw `event.text`.
2. **Empty replacement clears prior evidence** — `removeRing(state.partEntries, event.key)` (:274, helper :181-184) removes the earlier entry for that key; `state.texts` still stores the emptied accumulated value (:261), so later appends rebuild from empty. Pinned by tests: `clears earlier content when a replacement has no text` (a skip-only implementation would leave three `same` hashes and false-abort) and `still detects repeated text built by deltas after empty replacements`.
3. **Later nonempty deltas still work** — replace/append mapping `next = mode === 'append' ? previous + event.text : event.text` (:260) is untouched; appends after an empty replace accumulate and record correctly (both delta tests).
4. **True nonempty repetition still works** — `recordRing`/`tailAllSame`/`evaluate` unchanged; `still flags repeated nonempty reasoning parts after 60s` covers normalize-equivalent variants (`'repeat me'` / `'  REPEAT   me '`).
5. **No scope regressions** — diff is purely additive in two hunks; no threshold constants, permission logic (`permissionAsked/Replied`), lifecycle (`start/stop`), or event shapes touched. Tool ring (`recordTool`/`toolEntries`) untouched and still exercised (distinct tools in the empty-parts test prevent a tool-loop confound). No exported API change (`dist/server/watchdog.d.ts` unmodified). Dist JS mirrors the src change exactly; maps regenerated.

### Evidence assessment (recorded, not rerun)

- **RED→GREEN**: `npx vitest run tests/plugin/watchdog.test.ts` → RED 1 fail/56 pass, GREEN 57/57. Independently verified: pre-fix, `hashText('')` is a constant, so the four empty parts in the first new test produce four identical ring hashes → `tailAllSame(3)` → false content-loop abort — exactly that test fails, and I reconstructed the other four new tests as passing pre-fix, matching the recorded "1 fail 56 pass" precisely. GREEN 57/57 covers the entire changed module's suite (regression coverage within scope). Consistent and honest.
- **`npm run build` EXIT 0** — consistent with the dist diff (only the fix's hunks; no unrelated leakage into `dist/server/watchdog.js`).
- **`npx eslint src/server/watchdog.ts` EXIT 0** — covers the changed src file.
- No full-suite claim made — acceptable for this isolated private-logic delta; see Notes.
- No live activation claim; registry progress confirms no rollout/commit. Unrelated dirty permission/spec/docs/registry changes preserved (grep of their diffs shows no watchdog-fix leakage; only this task's registry bookkeeping).

### Necessity

Smallest sufficient change: a guard reusing the existing shared `normalize` + a 4-line private helper mirroring `recordRing`. No new dependencies, persistence, or exported surface. Unique value: encrypted/empty reasoning parts no longer false-abort children while genuine repetition detection is retained (RED proves the bug, GREEN the fix).

## Notes (non-blocking)

1. Lint evidence covers `src/server/watchdog.ts` only; the +81-line test file has no recorded lint run. Minor gap.
2. No full suite run (not claimed). Justified for this narrow fix — no exported API changed, the focused run covers all 57 watchdog tests, and a full run would conflate the unrelated in-progress permissions work. If desired, run the full suite at integration time.
3. CHANGELOG Unreleased entry and any doc staleness are explicitly deferred to the historian per task framing; the historical Aug watchdog spec omission is not treated as a mandate to rewrite the historical spec. Not a code-review blocker.
4. Design observation: `removeRing` can join previously non-adjacent identical hashes at the ring tail (e.g. `[a, b, a]` → remove `b` → `[a, a]`). The remaining entries are still genuine content evidence, ring-size eviction already had the same joining property, and with the default `loopRepeatCount: 3` this cannot fabricate a loop from cleared items. Sound; no action needed.
