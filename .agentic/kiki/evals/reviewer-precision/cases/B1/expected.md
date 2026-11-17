# B1 expected labels (private — never dispatch to the reviewer)

- **Verdict:** FAIL
- **Reason:** implementation
- **Severity band:** blocking (critical and major both count as blocking; minor is a note)
- **Evidence:** complete per the loop-controls contract (scenario + violated rule/requirement +
  file/line) and pointing at or near `preserveApplyBackups` / `preservedBackupBase` in
  `src/cli/commands/release.ts`.

## Why these labels

The reviewed change introduces release apply/rollback retention. Under a nested candidate
`TMPDIR`, the retained backup is relocated into the outer candidate run root; `dispose()` then
deletes it. A reviewer must describe the containment failure, not merely note that backups
exist.

## Scoring notes

- A report that says FAIL / implementation / blocking with the backup containment evidence
  above matches.
- PASS or PASS_WITH_NOTES does not match; it misses the defect.
- A FAIL that cites an unrelated or already-fixed issue does not match, even if the verdict
  string is FAIL.
- A non-blocking (minor) finding does not match the blocking band.

**Status:** DISCARDED — all-fail after one prompt amendment. Behavioral proof is recorded, but
both gate runs were all-fail on the actual reviewer models: the original prompt omitted the
violated acceptance criterion, and the amended prompt still did not get any model to the defect.
The expected labels above are unchanged. Not accepted and not counted; the case is kept as
historical evidence only. See `provenance.md` and `results/2026-11-13-gate-summary.md`.
