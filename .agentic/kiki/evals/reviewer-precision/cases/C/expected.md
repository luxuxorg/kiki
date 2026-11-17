# C (control) expected labels (private — never dispatch to the reviewer)

- **Verdict:** PASS **or** PASS_WITH_NOTES both acceptable
- **Reason:** n/a on a pass
- **Severity band:** no blocking finding. Any critical or major finding is a false positive.
- **Evidence:** n/a for a pass; a FAIL must be investigated as a possible false positive.

## Why these labels

`64f0ec7` adds bounded loop controls and reviewer governance (code plus generated agent
prompts) on top of `00b9f2a`. Ground truth is weaker than the defect cases: the full suite is
green at `64f0ec7` and no later commit touching its files is known. This is absence of known
defect, not behavioral proof of correctness.

## Scoring notes

- PASS or PASS_WITH_NOTES matches.
- A FAIL, or any critical/major finding, is a false positive pending investigation: either
  `64f0ec7` contains a real defect the suite misses, or the task prompt misleads.
- Do not infer defect absence from a green suite beyond what it supports.

**Status:** authored; suite evidence and the two-model gate are still required before this
case is accepted.
