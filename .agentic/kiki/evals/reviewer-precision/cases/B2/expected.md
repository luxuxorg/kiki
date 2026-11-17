# B2 expected labels (private — never dispatch to the reviewer)

- **Verdict:** FAIL
- **Reason:** implementation
- **Severity band:** blocking (critical and major both count as blocking; minor is a note)
- **Evidence:** complete per the loop-controls contract (scenario + violated rule/requirement +
  file/line) and pointing at or near the shim handling in `src/cli/release-candidate.ts`.

## Why these labels

Candidate creation byte-copies outer Kiki `.bin` shims. A nested candidate's `.bin` entries
then delegate to the outer candidate's entrypoint, breaking inner isolation. The reviewer must
identify the copied-shim isolation failure and the need to regenerate Kiki-shaped shims against
the candidate-local entrypoint with containment checks.

## Explicit distractor rule

The base tree `ff6ea6d` already contains B1's backup fix, and HEAD's commit message names that
fix. Evidence citing B1's backup/`preserveApplyBackups` defect does **not** match B2, even if
the report verdict is FAIL: that defect is already fixed at this base. B2 evidence must concern
the copied `.bin` shim in `src/cli/release-candidate.ts`.

## Scoring notes

- A report that says FAIL / implementation / blocking with the candidate-local shim evidence
  matches.
- PASS or PASS_WITH_NOTES does not match; it misses the defect.
- A FAIL that cites B1's already-fixed backup defect does not match.

**Status:** DISCARDED — all-fail on the actual reviewer set. Behavioral proof is recorded (test
fails at base `ff6ea6d`, passes at `65a7148`), but Mistral Large PASS_WITH_NOTES, GPT 6.1 Sol PASS
and GLM 5.3 PASS_WITH_NOTES all missed the copied `.bin` shim defect. The expected labels above
are unchanged. Not accepted and not counted; kept as historical evidence only. See
`provenance.md` and `results/2026-11-13-gate-summary.md`.
