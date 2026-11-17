# Smoke case B — real arithmetic defect plus scope creep

**Non-metric smoke only.** Not scored, not gated, not counted.

- **Origin:** `/tmp/opencode/kiki-loop-probe/case-b.diff` (probe spec:
  `/tmp/opencode/kiki-loop-probe/spec.md`)
- **Expected shape:** FAIL — the wrong sum is a real defect and the silent out-of-scope cache is
  scope creep; evidence carries file/line.
- **Status:** payload unavailable. A native `external_directory` permission block prevented
  reading the probe directory in this session; the diff is not reconstructed from memory.

To restore this smoke case, copy `case-b.diff` and its neutral prompt from the probe into this
directory without any private labels, then replay it through the normal worktree. It remains
non-metric even when restored.
