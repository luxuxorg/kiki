# Gate summary template (copy to `results/<date>-gate-summary.md`)

**This file is a template, not a result.** No gate has been run, so every case is pending. Do
not fill this with predicted outcomes or aggregate scores.

| Case | Models run | At least one model failed the case? | Decision | Notes |
|---|---|---|---|---|
| B1 | `<model IDs>` | `<yes|no>` | `<keep|drop|pending>` | `<rule applied>` |
| B2 | `<model IDs>` | `<yes|no>` | `<keep|drop|pending>` | `<rule applied>` |
| B3 | `<model IDs>` | `<yes|no>` | `<keep|drop|pending>` | `<rule applied>` |
| C | `<model IDs>` | `<n/a|all-fail injected>` | `<keep|pending>` | `<control rule applied>` |

Decision rules: defect cases need behavioral proof plus mixed outcomes. If every model catches
the defect, the case is not discriminating: drop or demote it to smoke. If no model catches it
(all-fail), it is ambiguous/too hard: investigate once, then rerun or demote/discard. C stays
healthy when every model returns PASS or PASS_WITH_NOTES, and is investigated when no model
matches. Gate outcomes are never aggregated into a score, percentage, ranking or precision
figure.
