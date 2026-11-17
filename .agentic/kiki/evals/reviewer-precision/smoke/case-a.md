# Smoke case A — minor-only change

**Non-metric smoke only.** Not scored, not gated, not counted.

- **Origin:** `/tmp/opencode/kiki-loop-probe/case-a.diff` (probe spec:
  `/tmp/opencode/kiki-loop-probe/spec.md`)
- **Expected shape:** PASS_WITH_NOTES with non-blocking notes.
- **Status:** payload unavailable. A native `external_directory` permission block prevented
  reading the probe directory in this session; the diff is not reconstructed from memory.

To restore this smoke case, copy `case-a.diff` and its neutral prompt from the probe into this
directory without any private labels, then replay it through the normal worktree. It remains
non-metric even when restored.
