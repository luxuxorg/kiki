# Gate report template (copy to `results/<date>-gate/<case>-<model-slug>.md`)

**This file is a template, not a result.** No gate run has been recorded in this directory yet.

- **Case:** `<B1|B2|B3|C>`
- **Base SHA:** `<base-sha>`
- **Gate date:** `<YYYY-MM-DD>`
- **Reviewer model ID:** `<full model id>`
- **Reviewer prompt version:** `<version>`
- **Fresh session:** `<yes>`
- **Input-only payload:** `<yes>`
- **Worktree:** `/tmp/opencode/rp-eval/<id>`

## Verdict and match decision

- **Reviewer verdict:** `<PASS|PASS_WITH_NOTES|FAIL>`
- **Matches expected labels:** `<yes|no>`
- **Evidence pointer:** `<file:line or region>`

## Verbatim report

```text
<paste the reviewer report verbatim>
```

## Private notes (never sent to the reviewer)

`<author observations, leakage checks, worktree cleanup>`
