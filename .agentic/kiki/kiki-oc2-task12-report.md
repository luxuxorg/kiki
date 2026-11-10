# Kiki OC2 Task 12 report — historian documentation and operational rollback guide

Date: 2026-11-10
Status: **DONE** (documentation only). Historical Task 12 baseline.

**Superseded evidence status:** Task 13 subsequently passed actual validation and the
synthetic release rehearsal. The current evidence is in
`docs/migrations/kiki-3-oc2-acceptance.md` and
`.agentic/kiki/kiki-oc2-final-docs-report.md`. Task 14 human machine acceptance remains
NOT RUN. The Task 12 statements below describe the earlier baseline only.

## 1. Scope and boundary

Implemented only the Task 12 documentation changes:

- `README.md` (rewritten for the actual Kiki 3.0.0 / OC2 usage surface)
- `CHANGELOG.md` (Keep a Changelog entries under `[Unreleased]`)
- `docs/migrations/kiki-3-oc2-parallel.md` (human-run runbook corrections)
- `docs/migrations/kiki-3-oc2-api-contract.md` (current CLI surface and Task 11 verification boundary)
- `docs/migrations/kiki-3-oc2-acceptance.md` (new acceptance/evidence matrix)

No source, test, model/permission, build, release, registry or live-machine behavior was
changed. No live global config, auth file, `.env` or provider configuration was read. No
install, migration, provider login, commit, tag, push, subagent dispatch or registry edit
was performed. Pre-existing dirty files were preserved.

## 2. Inputs consumed

- Task 12, Global Constraints and spec:
  `docs/superpowers/plans/2026-11-09-kiki-opencode2-migration-plan.md`,
  `docs/superpowers/specs/2026-11-09-kiki-opencode2-migration-design.md`
- Current CLI/help and command behavior from `src/cli/index.ts`, `src/cli/args.ts`,
  command handlers, `src/cli/opencode-config.ts`, `src/cli/oc2-migration.ts`,
  `src/cli/oc2-registration.ts`, and `package.json`
- `.agentic/reviews/2026-11-09-kiki-oc2-task11-review.md`
- `/tmp/opencode/kiki-oc2-task11-report.md`, especially the §10 POST-FIX certificate
- Current README/CHANGELOG/API contract/runbook

## 3. Documentation outcomes

### README

Documented only the actual CLI/package surface: exact OpenCode `2.2.6` and
`@opencode/plugin@2.2.6` pins, package `./server`/`./tui` exports,
`experimental.subagent_depth: 1`, `update: "disable"`, the five OC2 isolation variables,
`opencode` → OC2 and `opencode-v1` → OC1, native `agents.<id>.model` objects and ordered
`permissions` rules, no default model seeding, project init/reset behavior, safe
sanitized-export migration, diagnostics, release validation, and automated-versus-live
status limits.

The README does not assume a published `kiki@3.0.0`, a GitHub install target, a global
`npm install` path or a public uninstall command. It labels the current checkout form as
the validated local form and the release registration form as conditional on an actually
available, separately authorized candidate.

### CHANGELOG

Added Keep a Changelog sections under `[Unreleased]`:

- Added: OC2-only 3.0.0 port, exact pins, native agents, fail-closed migration, runbook and
  acceptance evidence.
- Changed: V2 config format, install/update ownership, routing retirement, parallel
  wrappers.
- Removed: V1 runtime plugin/dedup surface and model seeding.
- Security: fresh V3 audit required; the old V1 exception is void; credentials remain
  metadata-only.

### Parallel runbook

Applied the requested corrections:

- Preserved the corrected **Bash** installer invocation (not `sh`).
- Documented all **five** isolation variables: `OPENCODE_CONFIG_DIR`,
  `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`, `XDG_STATE_HOME`.
- Kept `opencode` → OC2 and `opencode-v1` → OC1, with the OC1 fallback for real Kiki work
  until Task 14.
- Replaced the old “not needed yet” framing with the human-reported stage: V1/V2 setup and
  §5.3 verification are reported complete, while live Kiki 3.0.0 install, migration,
  provider login and Task 14 acceptance remain not done.
- Added the sanitized-export migration procedure and its fail-closed per-agent/rejection,
  partial-success, marker/`--force` and backup behavior; scientist/non-Kiki agents remain
  manual/deferred.
- Explicitly requires removing or repointing the OC2 wrapper **before** any bare OC1
  binary swap; preserves the OC2 binary as `opencode-v2`.
- Keeps the frozen V1 TUI loader target and states that the old backup is diagnostic only,
  never a restore of the moving checkout.

### API contract

Kept the pinned 2.2.6 contract and added the current actual Kiki CLI command surface plus
a Task 11 verification/limits section. It records the post-fix 24/24 required run, the
628-pass/1 by-design-skip full suite, tarball/input/dist digests and package-consumer
evidence as automated ACTUAL_V3_VALIDATION only. It explicitly does not claim a published
package, live install, migration, login or human acceptance.

### Acceptance document

Created `docs/migrations/kiki-3-oc2-acceptance.md` with separate status rows:

| Evidence set | Status |
|---|---|
| ACTUAL_V3_VALIDATION | PASS (automated; fresh security audit pending Task 13) |
| RELEASE_REHEARSAL | NOT RUN |
| FUTURE_RELEASE_AUTHORIZATION | NOT RUN |

Additional Task 13/14 gates are separately marked NOT RUN: fresh audit, live Kiki 3.0.0
install, live migration, provider login and human machine acceptance. The document records
the current post-fix digests, the user-reported V1/V2 setup checkpoints, the superseded
pre-fix historical values, the open prompt-body ownership question, and the rollback
summary.

The user-reported checkpoints are marked as user-reported, not independently re-run:
V1 loader backup and `/kiki` menu passed; §5.3 separation checks passed; V1/V2 start
successfully; version/PATH/wrappers verified. No live Kiki 3.0.0 installation, live
migration, provider login or Task 14 acceptance is inferred.

## 4. Verification

Documentation verifier run read-only on every changed document:

```text
node dist/cli/index.js verify docs/migrations/kiki-3-oc2-parallel.md
  -> No placeholders found. (exit 0)
node dist/cli/index.js verify docs/migrations/kiki-3-oc2-api-contract.md
  -> No placeholders found. (exit 0)
node dist/cli/index.js verify docs/migrations/kiki-3-oc2-acceptance.md
  -> No placeholders found. (exit 0)
node dist/cli/index.js verify README.md
  -> No placeholders found. (exit 0)
node dist/cli/index.js verify CHANGELOG.md
  -> No placeholders found. (exit 0)
```

The verifier reads only the named file; no build was run and no live config was touched.
A synthetic-environment-prefixed invocation is blocked by the repository's bash
allowlist (only `node dist/cli/index.js verify*` is allowed for this command shape), so the
run used the allowed read-only form. This does not read global config or credentials.

Manual checks performed:

- Relative Markdown links in README, runbook, API contract and acceptance resolve to
  existing files.
- Current command names/flags were checked against `src/cli/index.ts` and the command
  handlers. No command invocation was executed (the docs-verifier allowlist does not
  permit running CLI help).
- No code, model, build, install, registry, commit, tag, push or live operation occurred.

## 5. Task-only diff and evidence

- Task-only documentation diff: `/tmp/opencode/kiki-oc2-task12.diff`
- It contains the tracked README/CHANGELOG diff and the current full-file diffs for the
  three `docs/migrations/` documents. Those three files are untracked in this checkout, so
  their diff is necessarily against `/dev/null`; only Task 12 files are included.
- Report path note: this report is stored in `.agentic/kiki/kiki-oc2-task12-report.md`
  because the session edit policy denies direct writes outside the project documentation
  and `.agentic` paths. A copy at `/tmp/opencode/kiki-oc2-task12-report.md` is produced
  with the allowed `git diff` redirection; it is a unified-diff view of this same report.

## 6. Remaining gates / true user decision

No new user decision is requested by Task 12. The following remain unapproved and
unperformed:

- Task 13 fresh V3 security audit and isolated release rehearsal.
- Any actual release authorization, commit, tag, push or publish.
- Live Kiki 3.0.0 installation/migration/provider login.
- Task 14 ACCEPT/SWITCH, RETAIN OC1, or ROLLBACK decision.

Documentation is complete for this task but must be updated again after Task 13 and
Task 14 final evidence.
