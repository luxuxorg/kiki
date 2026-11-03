# Global-only Kiki Implementation Plan

> Execute inline using executing-plans and test-driven-development. No commits
> beyond the explicitly requested initial Dedup checkpoint without another request.

**Goal:** One global runtime and native project-level OpenCode settings.

**Architecture:** A focused OpenCode configuration module parses legacy YAML,
patches JSONC agent keys, and handles migration/reset. Existing template generators
remain the baseline prompt source. Commands use the new module rather than
writing project Markdown/plugin copies.

**Tech Stack:** TypeScript, Vitest, jsonc-parser, yaml; dependency-free generated plugin.

## Tasks

1. Configuration module (`src/cli/opencode-config.ts`, tests in
   `tests/cli/global-policy.test.ts`). risk: medium; parallel: false; depends_on: [].
   - [x] Write migration tests for preservation, idempotency and malformed YAML/JSONC.
   - [x] Run `npx vitest run tests/cli/global-policy.test.ts` and observe missing behavior.
   - [x] Implement parseAgent, read/patch config, global install, project migration/reset.
   - [x] Re-run focused tests. Assert original file backups and unrelated keys preserved.

2. Commands (`install.ts`, `init.ts`, `update.ts`, `index.ts`, new `migrate.ts`,
   `reset.ts`). risk: medium; parallel: false; depends_on: [1].
   - [x] Replace obsolete install/update/init expectations with global-policy tests.
   - [x] Run focused CLI tests and observe expected failures.
   - [x] Route global update to global installation; project init to metadata and JSON
     settings only; strict argument validation; migrate/reset explicit project scope.
   - [x] Retire routing sync with a read-only migration message; update prompt references.
   - [x] Run all CLI tests; retain old template safety coverage as generator tests.

3. Diagnostics and docs (`doctor.ts`, `status.ts`, README, CHANGELOG).
   risk: low; parallel: false; depends_on: [2].
   - [x] Update tests to expect JSON agents and native model selection.
   - [x] Adapt doctor/status to global agents plus local config; report legacy copies.
   - [x] Document install/update/migrate/reset and local Markdown customization.
   - [x] `npm test`, `npm run build`, `git diff --check`.
   - [x] Isolated OpenCode resolution check with fixture config only; do not read or
     dump real credential-bearing configuration. Preserve existing working-tree changes.

## Review

The design is approved in the conversation. Main risk is merge order: use JSON
globally and locally, remove old global Markdown definitions after permissions
are captured. Tests must exercise JSONC preservation and old-copy removal. Live
installation/migration of user projects is an explicit separate action.

## Execution results

- Initial Dedup checkpoint committed at user request as `1afd608`; this implementation
  remains uncommitted on `feat/global-kiki-updates`.
- Build passed. Full suite with `OPENCODE_TEST_BINARY` pointing at OpenCode 1.18.35:
  134 tests in 18 files passed, including generated-plugin TypeScript checks.
- Real OpenCode resolution verified global prompts and project permissions/models,
  then verified migrated `backend/**: allow` and `src/**: deny` after a global update.
- Read-only code review: PASS. Follow-up regression coverage also preserves explicitly
  inherited global permissions/models and comments within agent permission objects.
  Additional coverage prevents broad local wildcards from relaxing inherited denials.
- `npm audit --omit=dev`: zero vulnerabilities. `git diff --check`: clean.
- Actual global installation and this checkout's local agent/plugin copies were not
  migrated; use `kiki update`, then `kiki migrate --project .`, followed by an OpenCode restart.
