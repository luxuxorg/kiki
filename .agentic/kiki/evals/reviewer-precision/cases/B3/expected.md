# B3 expected labels (private — never dispatch to the reviewer)

- **Verdict:** FAIL
- **Reason:** implementation
- **Severity band:** blocking (critical and major both count as blocking; minor is a note)
- **Evidence:** complete per the loop-controls contract (scenario + violated rule/requirement +
  file/line) and pointing at or near the version gate in `src/cli/commands/doctor.ts` **and**
  the marker rejection in `src/cli/oc2-paths.ts`.

## Why these labels

The reviewed change migrates Kiki to OpenCode 2 but enforces an exact-2.2.6 version gate in
doctor and rejects standard OpenCode config files (`opencode.json(c)` / `tui.json(c)`) as OC1
markers. The reviewer must identify both failures: doctor must work with native agents and
package registration without gating on the binary version, and the standard OpenCode roots
must be accepted as the normal setup.

## Required behavioral assertions in provenance

- `passes with native agents and package registration without gating on the binary version`
- `reports the standard OpenCode roots as the normal setup`
- parameterized `accepts_standard_config_files_shared_by_oc1_and_oc2 (%s)`
- parameterized `accepts_legacy_cli_config_without_a_kiki_loader (%s)`
- `fails closed on leftover V1 Kiki artifacts instead of masking them`

At the fix, doctor output must not gate on the binary version, standard roots must be accepted,
config bytes must be unchanged, and real V1 artifacts must still be rejected.

## Scoring notes

- A report that says FAIL / implementation / blocking and anchors evidence at both the doctor
  version gate and the OC2 path marker rejection matches.
- PASS or PASS_WITH_NOTES does not match; it misses the defect.
- A FAIL that names only one of the two defects is incomplete evidence and does not match.
- A non-blocking (minor) finding does not match the blocking band.

**Status:** DISCARDED / INVALID. Behavioral proof was genuine (8 fails at base `7463ed1`, 25/25
pass at `b870bc7`), but the task prompt lacked the acceptance criterion ("standard OpenCode config
must be accepted without an exact-version gate") and the exact `2.2.6` pin was intentional
migration behavior; the fix was a policy change, not a defect at the time. Not accepted or counted.
