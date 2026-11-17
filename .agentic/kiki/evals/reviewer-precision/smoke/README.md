# Smoke / edge cases (non-metric)

These cases are **not metrics**. They are not scored, not gated, never counted in results and
never cited as coverage. They check only that replay works and that a structured report with one
verdict plus Reason / Severity / Evidence comes out.

| File | Origin | What it checks | Status |
|---|---|---|---|
| `case-a.md` | `/tmp/opencode/kiki-loop-probe/case-a.diff` | minor-only change → PASS_WITH_NOTES | input unavailable (native permission block) |
| `case-b.md` | `/tmp/opencode/kiki-loop-probe/case-b.diff` | wrong arithmetic + out-of-scope cache → FAIL | input unavailable (native permission block) |
| `1decc15.md` | fix `1decc15`, introducer `0c13814` | replay/report shape only; fix has no behavioral test | authored |
| `afa31c5.md` | fix `afa31c5`, introducer `10912e6` | replay/report shape only; fix test is form-only | authored |

Why the last two are smoke and not ground truth:

- `1decc15` fixed a plugin hook-registration defect, but the fix ships no test; nothing proves
  the defect behaviorally. The introducer is `0c13814`; `82bb29d` later mirrored the registration
  in the live plugin outside the `src`+`tests` restriction.
- `afa31c5` fixed an unvalidated `Object.assign` health-config merge, but its added test asserts
  only that a template string contains a function name — form, not behavior.

Documented examples of insufficient proof; they do not enter the precision set.

Excluded from this directory: `3e3749d` (docs-only, dropped — the `64f0ec7` control supersedes
it) and the 2026-11-09 routing incident (provider/protocol failure, not a diff review; future
routing-eval candidate).

A native `external_directory` permission block prevented reading the probe payloads in this
session. They are recorded as unavailable rather than reconstructed from memory.
