# Runbook Review — `docs/migrations/kiki-3-oc2-parallel.md` (Task 1 deliverable)

**Reviewer:** Kiki Reviewer (independent Task 1 gate per plan checkbox 4)
**Date:** 2026-11-09 (round 1) / 2026-11-09 (round 2, this revision)
**Artifacts reviewed:**
- `docs/migrations/kiki-3-oc2-parallel.md` (new; 775 lines round 1, 811 lines round 2 — the only file under review)
- Approved plan `docs/superpowers/plans/2026-11-09-kiki-opencode2-migration-plan.md` (Task 1, machine appendices A–E)
- Approved spec `docs/superpowers/specs/2026-11-09-kiki-opencode2-migration-design.md` (§§2, 3, 5)
- Prior plan review `.agentic/reviews/2026-11-09-kiki-opencode2-migration-plan-review.md` (context only)

## Verdict (round 2 — current)

```
Verdict: PASS
Blockers:
(none — round-1 blocker resolved; no regressions found; details below)
```

**Safe to hand §1 to the user: YES.** The first batch (§1.1–§1.9) was verified safe in
round 1, is unchanged except for the strengthened §1.8 failed-smoke recovery, and the
round-1 blocker is fully resolved. The human may start §1.1 in a clean OC1 shell.
`V1_PROTECTED` remains a human-only gate: all §1 commands are human-run and staged,
§1.9 is recorded in the human's own task notes, and Tasks 2–14, any V3 build, OC2
install and any default switch remain blocked until it is recorded.

## Round-1 verdict (superseded)

```
Verdict: FAIL
Blockers:
1. §5.5 "Restore the V1 TUI loader" restored the §1.9 pre-detachment backup
   (pointing at the moving development checkout), contradicting plan appendix E's
   explicit "keep `kiki-v1` and its detached TUI target" and unflagged in §6.
```

## Round-1 blocker resolution (verified this round)

- **Executable restore removed.** The `cp -p "$backup" "$loader"` block is gone. A
  mechanical scan confirms the only remaining `cp -p` operations are §1.7's backup
  creation (line 241) and §5.5's wrapper backup before repoint (line 663); no
  `pre-restore` artifact or restore path remains anywhere in the file.
- **§5.5 (lines 696–701)** now states: "*Keep the frozen V1 TUI target — do not restore
  the pre-detachment loader.*" The §1.7 backup is declared a **diagnostic artifact
  only**; default rollback must not copy it back; "There is no executable restore path
  in this runbook"; re-coupling would require a separate review after the development
  checkout is verifiably back at frozen 2.4.0. This matches my round-1 required fix and
  plan appendix E.
- **§5.5 verification block (lines 705–718)** checks the loader is a regular file, the
  frozen `kiki-v1/dist/tui/index.js` exists, the frozen target is present, and the
  moving-checkout target is rejected with `STOP`. The `grep -F` check is precise:
  `.../kiki/dist/tui/index.js` is not a substring of `.../kiki-v1/dist/tui/index.js`
  (`kiki` is followed by `/dist` vs `-v1/`). Failure instructs: stop, report, do not
  restore the backup, do not run OC1 against the development checkout.
- **Post-rollback re-verification added (lines 720–740)** — closes round-1 non-blocking
  observation 1: `hash -r`, `command -v`, version check, and a fresh `/kiki` menu smoke
  in `/tmp/kiki-v1-rollback-smoke` (no LLM request, cancel before saving), with the
  binary-swap alternative routed through the absolute binary path, and the result
  recorded alongside the original `V1_PROTECTED` evidence. This matches appendix E's
  "repeat version/PATH/V1 menu smoke checks".
- **§1.8 failed-smoke recovery strengthened (lines 323–325)** — the previous "restore
  the loader backup" instruction is replaced with: stop and report; do **not** restore
  the §1.7 pre-detachment backup; repair the frozen target via the §1.7 repoint steps;
  repeat the target check and the smoke; keep the backup for diagnosis only. Consistent
  with §6.10; no plan contradiction (appendix A prescribed no restore-on-failure).
- **§6 item 10 (lines 788–792)** records the reconciliation explicitly, citing plan
  appendix E's instruction to keep `kiki-v1` and its detached TUI target. The §6
  discipline ("recorded rather than silently changing approved behavior") is restored.
- **§7 (lines 810–811)** reviewer checklist extended: rollback keeps the frozen
  `kiki-v1` TUI target instead of restoring the moving-checkout loader. Verified
  satisfied by this review.

## Regression check (round 2) — no regressions found

Full re-read of the amended file, compared section by section against the round-1
revision:

| Section | Status |
|---|---|
| §1.1–§1.7 | Unchanged. Clean-shell check, collision/parent/symlink checks, read-only tag verification, worktree add, frozen-only build, wrapper creation/verification, loader backup + repoint — all identical to the approved round-1 state. |
| §1.8 | Only the failed-smoke paragraph changed (strengthened, see above). Metadata-only checks, TUI steps, `cli.json` baseline handling unchanged. |
| §1.9–§4 | Unchanged. `V1_PROTECTED` checklist, pass criteria, §2 rationale, §3 gate table, §4 development-checkout rules all intact. |
| §5.1–§5.4 | Unchanged. Accepted clarifications intact: OC2/`kiki` wrappers set `OPENCODE_CONFIG_DIR` **and** `XDG_CONFIG_HOME` (§5.2/§5.4); reviewed, pinned, downloaded installer instead of `curl \| bash` (§5.2); OC2 install/default steps unchanged. |
| §5.5 | Kiki-side rollback, preferred wrapper repoint (preserves OC2 binary), binary-swap alternative with collision checks and dangling-wrapper note — all unchanged apart from the blocker fix and added post-rollback verification. |
| §6 | Items 1–9 unchanged; item 10 added. |
| §7 | First five reviewer bullets unchanged; sixth extended as above. |

Round-1 determinations that remain standing:

- The three historian-flagged inconsistencies are **safer clarifications, not
  product-design deviations**, each recorded in §6: (1) `XDG_CONFIG_HOME` addition —
  factually grounded in `src/cli/opencode-config.ts:14-15` (V1 resolver ignores
  `OPENCODE_CONFIG_DIR`), machine-level only, Task 3 precedence unchanged; (2) reviewed
  pinned installer — preserves `2.2.6 --no-modify-path`, refuses unreviewed installs;
  (3) rollback preserves the OC2 binary — fixes the plan's destructive bare `mv`.
- First-batch §1 safety findings (round-1 table) all remain valid for the unchanged
  sections; §1.8's change strengthens, not weakens, the batch.

## Verification performed (read-only; within session permission rules)

Round 2:
- `node dist/cli/index.js verify docs/migrations/kiki-3-oc2-parallel.md` → exit 0,
  "No placeholders found" — reproduces §7's historian claim for the amended revision.
- Mechanical scan for restore paths (`$backup`, `cp -p`, `pre-v1-protect`,
  `pre-restore`) — only the two benign backup-creation sites remain (§1.7 line 241,
  §5.5 line 663).
- Full re-read of all 811 lines against the round-1 revision for the regression table
  above.

Round 1 (standing evidence):
- `git rev-parse 'v2.4.0^{commit}'` → `e2bf396df5a14657f34f55c78b31819be10b9c05`;
  `git rev-parse v2.4.0` → `92a7f1918e68afd29931818fb6c33efcff4e3f92` (annotated tag —
  object ≠ peeled commit), matching §1.3.
- `src/cli/opencode-config.ts:14-15` confirmed the §6.3 `XDG_CONFIG_HOME`-only claim.

## Non-blocking observations (for the historian / Task 12)

1. **Pre-existing, unchanged this round (binary-swap alternative, §5.5 lines 678–694):**
   after the swap, `~/.local/bin/opencode` still contains the §5.2 OC2-isolation
   exports while `~/.opencode/bin/opencode` is now the OC1 binary, so a later bare
   `opencode` would run OC1 against OC2 roots. The runbook flags the dangling
   `opencode-v1` wrapper and correctly routes the post-rollback version check and smoke
   through the absolute binary path for this option, but never explicitly instructs
   repointing or removing the OC2-flavored `opencode` wrapper before bare `opencode` is
   used again. Recommend one sentence in §5.5's swap paragraph at the next revision
   (Task 12 expands this appendix anyway). Not a blocker: non-preferred alternative,
   explicitly not-run appendix, partially mitigated, identical to the round-1-accepted
   text (no regression).
2. §5.2's `less "$installer"` deliberately forces an interactive review stop inside a
   copy-paste block; consider a one-line note so the human is not surprised by the pager.
3. §1.1's clean-shell check flags only values containing `opencode2`; acceptable given
   the canonical `~/.opencode2` layout and the plan's "pointing at OC2" wording;
   generalize if the machine layout ever changes.
4. §3's `V1_PROTECTED` blocks "Tasks 2–14" vs the plan's "Tasks 2–13" — strictly
   stronger; consistent with Task 14 depending on Task 1.

## Requested determinations (round 2)

- **Verdict:** PASS — round-1 blocker resolved exactly as required; no regressions;
  accepted clarifications intact; verifier green for the amended revision.
- **Safe to hand §1 to the user:** Yes, immediately. First instruction: in a clean OC1
  shell (no OC2 isolation exports), run the §1.1 clean-shell check and record
  `command -v opencode` plus the OC1 version, then proceed block by block through §1.9.
  §5 remains do-not-run until §1.9 is recorded and OC2 installation is separately
  authorized.
- **`V1_PROTECTED` human gate:** unchanged and human-only, as in round 1.

## Review boundary

Documentation review only, both rounds. No machine operations, scripts, builds,
installs, live config reads (secret or otherwise), commits, tags, pushes, registry
edits, or product changes; plan and runbook were not edited. Only this review file was
written, to the permitted review location. Round-2 review scope was the round-1
blocker and regressions, per instruction.
