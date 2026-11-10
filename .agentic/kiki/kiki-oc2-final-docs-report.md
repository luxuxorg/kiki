# Kiki OC2 final documentation evidence report

Date: 2026-11-10
Status: **DONE — Task 12/13 documentation finalized from the Task 13 report and final
whole-branch review.** Overall documentation remains pending the user's Task 14 live
results and decision. No source, tests, dist, config, dependency, install, commit, tag,
push, subagent or registry change was made.

## 1. Inputs

- Final whole-branch review §7:
  `.agentic/reviews/2026-11-09-kiki-oc2-final-review.md`
- Task 13 report: `/tmp/opencode/kiki-oc2-task13-report.md`
- Actual final artifacts/manifests under `/tmp/opencode/kiki-oc2-task13-artifacts/`
- Rehearsal artifacts under `/tmp/opencode/kiki-oc2-rehearsal-artifacts/`
- Previous Task 12 acceptance/README/CHANGELOG/API contract/runbook

No live config, credential file, `.env`, `auth.json` or `opencode.jsonc` was read.

## 2. Updated documents

- `docs/migrations/kiki-3-oc2-acceptance.md` — final Task 13 certificate, fresh audit,
  rehearsal PASS, superseded Task 11 values, Task 14 NOT RUN, prompt-body baseline,
  same-model no-op, rollback, minimal Task 14 commands.
- `README.md` — final evidence status, prompt-body baseline, same-model no-op, final suite
  counts, fresh audit/rehearsal/release boundaries.
- `CHANGELOG.md` — final Task 13 evidence, completed fresh audit (0 high/critical, 32
  moderate, no exception), V1-equivalent prompt-body baseline.
- `docs/migrations/kiki-3-oc2-api-contract.md` — Task 13 final verification, final
  digests, rehearsal PASS and Task 14/actual-release limits.
- `docs/migrations/kiki-3-oc2-parallel.md` — final checkpoint matrix, validated Task 14
  human commands, sanitized-export migration reminder, baseline prompt-body semantics,
  same-model no-op, final evidence references.

## 3. Exact final evidence recorded

### ACTUAL_V3_VALIDATION — PASS (final snapshot)

| Item | Value |
|---|---|
| Tarball | `952be15086d93e9ff8a62d111f9155741ef2db4c3d8e82420a6a860c3f0aef37` (130 files, package 3.0.0, SDK 2.2.6) |
| Input manifest | `74bccc17017f60deb0c6f3a7f43957ca872e2a7d10a74fa9943998126c2f5789` (278 files; trackedGitOnly false; opencode.jsonc excluded unread; 12 retired paths) |
| Dist manifest | `f0da220cae0b5620fc085ca6bbcc1952242eccc79ffd7c79cf1054256033b5a6` (128 files) |
| Pack manifest | `14005d97f0b0dc7f01cc42f08e00cde9f9b8905b090c6732003d9cffe91bbc37` |
| Required real-binary run | 24/24, 0 failed, 0 skipped |
| Full suite with binary | 632 passed, 2 by-design opt-in skips, 0 failed |
| Full suite without binary | 620 passed, 14 skipped, 0 failed |
| tsc / lint / build | exit 0 / exit 0 / exit 0 |
| Fresh audit | 0 high, 0 critical, 32 moderate, 0 low, 0 info; 454 deps; no exception |
| Audit JSON | `e63210c6fef3ae457ad32ff86653750fc8df2ae8ab025b834df872cfd012443e` |

Actual server/TUI hashes: `dist/server/index.js`
`8083ca318962740d48677d65eefd481180861021f876b768cf7f0a186602236a`;
`dist/server/index.d.ts`
`172e00c946feff73b585b764471abc5705926e0496933951252b044bc4d428f1`;
`dist/tui/index.js`
`59e6bd78b424cd4defa986c656e5d3525eac5b66297332135a4736698f7a32a5`;
`dist/tui/index.d.ts`
`925ac6755119223ba22b52892037851d0d3c0bf311b02cfd75de71aea3290ce1`.

Task 11 post-GUI values (`edcae219…` tarball, `3533b42f…` input, `e17657a9…` dist,
`603f7a80…` pack) are recorded as historical/superseded, not current.

### RELEASE_REHEARSAL — PASS (synthetic)

Run8: 1 file / 1 test / 0 skipped, 348.81 s; log sha256
`66feaba10a5326f059be91aec55fd22bdef7b48e24a09064cdf35a52e4cbf1b0`.
Synthetic 2.4.0 inputs → 3.0.0; all six real gates passed; `Applied: false`; no remote
action; private Git object copy/index; original checkout and synthetic input tree
immutable; candidate server/TUI artifact hashes match actual. Rehearsal evidence hashes:
source manifest `2cc2e43a680e40beef982211b082ca468f78e28e97817ad5f0b9dd22be51d685`,
normalization `19b6c5ff0831ada3791b7bdd47a840302cc1e8cd671ae4d33026bb9ca778406b`,
CLI/exported logs `8691e9dbe15fcc4b4505945010289d4e828fe2dd9d4eb7682c5005c8c7f0bb43`,
observed calls `bfca7b3ee546e017e2858b4020af6c78cfa95df48d89b5d93c0b5dd85d023171`,
candidate evidence `771ade0924448494d62a54c0a406a792128fa880cfb541bcc1beb2c7808e4737`.

### Boundaries

- **FUTURE_RELEASE_AUTHORIZATION: NOT RUN.** No commit, tag, push, publish, apply, copy-back
  or release procedure authorization.
- **Task 14 human machine acceptance: NOT RUN.** User-reported setup: V1/V2 start, §5.3
  version/PATH/wrappers verified, V1 loader backup and `/kiki` menu passed. Live Kiki 3.0.0
  install/migration/provider login/dispatch//`kiki` save-removal/rollback drill are not
  claimed.
- Moderate audit findings are reported honestly and are non-blocking under the existing
  policy; no routine approval was added or requested.
- Native prompt-body regeneration with backup is the V1-equivalent baseline and adds no
  feature; config models/frontmatter permissions are preserved. A future ownership change
  for user-edited global bodies is a post-switch user request, not a migration blocker.
- `/kiki` inherited same-model selection is a documented conservative no-op; no urgent
  decision or code change.

## 4. Task 14 next commands documented

The runbook now gives human-run, actual-CLI steps:

```bash
kiki --help
kiki install
kiki init /path/to/scratch-project
kiki doctor /path/to/scratch-project
kiki migrate --from /path/to/sanitized-oc1-export
```

Then user-owned provider login in the OC2 TUI, one real orchestrator→subagent dispatch,
`/kiki` save/removal, V1 smoke, cleanup/rollback drill on a throwaway copy, and the explicit
ACCEPT/SWITCH, RETAIN OC1, or ROLLBACK decision. Migration `--from` must be a user-prepared
secret-free export; the agent must not read the live config.

## 5. Verification

```text
node dist/cli/index.js verify docs/migrations/kiki-3-oc2-parallel.md   -> exit 0
node dist/cli/index.js verify docs/migrations/kiki-3-oc2-api-contract.md -> exit 0
node dist/cli/index.js verify docs/migrations/kiki-3-oc2-acceptance.md -> exit 0
node dist/cli/index.js verify README.md                                -> exit 0
node dist/cli/index.js verify CHANGELOG.md                             -> exit 0
```

All reported “No placeholders found.” No full build was run. No live install, global config,
secret, npm/dependency, commit, tag, push, subagent or registry operation was performed.

## 6. Artifacts

- Final documentation diff: `/tmp/opencode/kiki-oc2-final-docs.diff`
- Final documentation report: `/tmp/opencode/kiki-oc2-final-docs-report.md` (allowed
  redirection copy; direct `/tmp` writes are blocked by the session edit policy)
- Source report: `.agentic/kiki/kiki-oc2-final-docs-report.md`

Overall documentation remains pending the user's Task 14 live results and explicit
decision.
