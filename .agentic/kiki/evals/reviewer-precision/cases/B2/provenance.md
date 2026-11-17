# B2 provenance (private — never dispatch to the reviewer)

**One-sentence defect:** Candidate creation byte-copies outer Kiki `.bin` shims verbatim, so a
nested candidate's `.bin` entries delegate to the outer candidate's entrypoint and break inner
isolation.

- **Introduced by:** `054407b` (same commit as B1)
- **Base (= fix^):** `ff6ea6d`
- **Fix:** `65a7148` — "fix: regenerate pre-shimmed .bin entries against the
  candidate-local entrypoint"
- **Behavioral test:** `tests/integration/release-copied-deps.test.ts` —
  `regenerates a kiki .bin shim against the candidate-local entrypoint`
- **Evidence region:** shim handling in `src/cli/release-candidate.ts`

## Behavioral proof

**Status: RECORDED — genuine fail-at-base / pass-at-fix observed.** B2 was later **discarded**
after the gate was all-fail (see Gate below). The proof remains valid, and the case is kept as
historical evidence only. Source: `.superpowers/sdd/reviewer-eval-proof-B2.md`.

- **Base run (defect present):** `ff6ea6d` with only the fix's test diff overlaid
  (`git diff 65a7148^ 65a7148 -- tests/integration/release-copied-deps.test.ts`; 49 lines adding
  the `pre-shimmed dependency trees` block). No `src/` or `dist/` fix changes applied.
- **Command (base):**
  `npm test -- tests/integration/release-copied-deps.test.ts -t 'regenerates a kiki .bin shim against the candidate-local entrypoint'`
- **Base result:** exit `1`; 1 failed / 2 skipped. The failure is the candidate-local shim
  assertion at `tests/integration/release-copied-deps.test.ts:300`
  (`expect(shim).toContain(candidateRoot...)`): the received shim still targets
  `…/kiki-candidate-outer/node_modules/fake-pkg/cli.mjs`, the outer candidate's entrypoint. The
  next assertion (`expect(shim).not.toContain(outerCandidateRoot)`) rejects the same evidence.
- **Fix run:** clean detached tree at `65a7148`, same command and test title → exit `0`;
  1 passed / 2 skipped.
- **Environment:** historical dependency set installed inside the disposable worktrees (`npm ci`
  for `ff6ea6d`; `git diff ff6ea6d 65a7148 -- package.json package-lock.json` is empty). WSL2
  Linux 6.6.87.2-microsoft-standard-WSL2 x86_64; Node v24.22.1; npm 11.19.1; Git 2.43.0;
  Vitest 4.1.0; Vite 8.3.5; TypeScript 5.9.3; `@opencode-ai/plugin` 1.18.35; `@types/node`
  20.19.43; `jsonc-parser` 3.3.1; `yaml` 2.9.1.
- **Setup/dependency errors excluded:** none occurred. The base failure is the assertion, not
  import, compile or runtime setup.

## Artifact verification performed

- `git rev-parse 65a7148^` = `ff6ea6d4985ce368f49b6a1e9b53dda8acb3b780`; base is `ff6ea6d`.
- `input/case.patch` is byte-identical to `git diff 054407b^ 054407b -- src tests`; every path
  is under `src/` or `tests/`.
- At the base, the B2-relevant paths are unchanged from the introducer:
  `git diff --quiet 054407b ff6ea6d -- src/cli/release-candidate.ts tests/integration/release-copied-deps.test.ts`
  succeeds.
- On a clean detached worktree at `ff6ea6d`, reverse-applying the frozen patch excluding the
  two paths B1's fix touched (`src/cli/commands/release.ts`, `tests/cli/release.test.ts`)
  succeeds, confirming the rest of the introducing change is already in the base tree. Nothing
  is applied for review.
- The change under review is the introducer `054407b`, i.e. `HEAD~1` at this base.

## Gate

**Status: DISCARDED — all-fail on the actual reviewer set.** Behavioral proof above is genuine,
but no actual reviewer matched the expected FAIL. Per the gate's all-fail branch, a defect case
with genuine proof and no model catch is ambiguous/too hard: B2 is **discarded**, not demoted to
smoke/edge and not a metric. It is kept as historical evidence only and is not accepted or
counted. Expected labels and the frozen patch are unchanged.

| Reviewer model ID | Gate model? | Verdict | Matched expected | Case outcome |
|---|---|---|---|---|
| `mistral/mistral-large-latest` | yes | PASS_WITH_NOTES | no | model fails the case (miss) |
| `gpt/gpt-6.1-sol` | yes | PASS | no | model fails the case (miss) |
| `openrouter/z-ai/glm-5.3` | yes | PASS_WITH_NOTES | no | model fails the case (miss) |

- All three actual reviewer models missed the copied `.bin` shim defect: none returned the
  expected FAIL / implementation / blocking or evidence at `src/cli/release-candidate.ts`.
- With genuine proof but no mixed outcomes, the case cannot be kept as discriminating. No prompt
  amendment or gate rerun is recorded; B2 is discarded rather than rerun or demoted.
- The verdicts are recorded in `results/2026-11-13-gate-summary.md`. No separate verbatim B2 gate
  reports are retained in `results/2026-11-13-gate/`.
- Never aggregate gate outcomes into a precision figure.
