# Task 12 review — historian documentation and operational rollback guide

Date: 2026-11-10
Reviewer: `kiki-reviewer` (independent gate)
Inputs: plan Task 12 + Global Constraints
(`docs/superpowers/plans/2026-11-09-kiki-opencode2-migration-plan.md`), Task 12 report
(`/tmp/opencode/kiki-oc2-task12-report.md`, stored at
`.agentic/kiki/kiki-oc2-task12-report.md`) + diff (`/tmp/opencode/kiki-oc2-task12.diff`,
2053 lines), Task 11 report §10 POST-FIX certificate
(`/tmp/opencode/kiki-oc2-task11-report.md`), Task 11 review
(`.agentic/reviews/2026-11-09-kiki-oc2-task11-review.md`, final verification
requirements 1–5), runbook review round 2
(`.agentic/reviews/2026-11-09-kiki-oc2-parallel-runbook-review.md`), evidence artifacts
(`/tmp/opencode/kiki-oc2-menu-global-fix-artifacts/`,
`/tmp/opencode/kiki-oc2-task11-postfix-artifacts/`), the actual working tree, the actual
CLI source (`src/cli/index.ts`, `src/cli/args.ts`, `src/cli/oc2-migration.ts`,
`src/cli/opencode-config.ts`, command handlers) and `package.json`.

No docs fix, source fix, build, install, registry edit, live-config/credential read,
commit, tag, push or release was performed by this review. Verification used only
allowlisted read-only commands (`git status/log/diff`, `node dist/cli/index.js verify`
on the existing dist, `npm run lint`); no source rebuild occurred. Pre-existing dirty
files (registry, routing log, earlier-task changes) were preserved untouched.

## Verdict

- **Spec compliance: PASS**
- **Quality/operational correctness: PASS**

```
Verdict: PASS
Blockers:
(none)
```

## 1. Task boundary and diff authenticity

- The task-only diff contains exactly the five Task 12 files: `README.md`,
  `CHANGELOG.md`, `docs/migrations/kiki-3-oc2-parallel.md`,
  `docs/migrations/kiki-3-oc2-api-contract.md` (existing but untracked, therefore
  diffed against `/dev/null`) and the new
  `docs/migrations/kiki-3-oc2-acceptance.md`. No source, test, dist, registry or
  routing-log file appears in the diff.
- Working-tree authenticity verified: `git diff HEAD --stat` reproduces the diff's
  line counts exactly (CHANGELOG +20; README 150 deletions/217 insertions; runbook
  927 lines; API contract 359 lines; acceptance 219 lines). Direct reads of the
  actual files (README in full; runbook §5.5–§5.7 region) match the diff content
  byte-for-byte in the sampled regions.
- No new commits: HEAD is still `e2bf396` (`feat: release v2.4.0`); `docs/migrations/`
  and `.agentic/kiki/kiki-oc2-task12-report.md` are untracked, consistent with the
  report's description. Task 12 performed no code fix, docs fix beyond its own
  deliverables, global-config read, secret read, install, build, registry edit or
  commit — confirmed by the diff scope and git state.

## 2. Verification re-run by this reviewer

- `node dist/cli/index.js verify` on all five changed documents (existing dist, no
  rebuild): **"No placeholders found." for all five, exit 0** — reproduces the
  report's §4 claims. The report's note that a synthetic-env-prefixed invocation is
  blocked by the bash allowlist is accurate (this reviewer faces the same allowlist);
  the deviation is immaterial because the verifier reads only the named file.
- `npm run lint` exit 0 on the current tree (Task 12 changed no `.ts` file; lint
  covers `src/**/*.ts` only; the tree's green Task 10/11 state is unchanged by
  markdown edits).
- Secret scan over the five changed documents: no `sk-`/`ghp_`/`AKIA`/private-key/
  api-key/password/token patterns; only public digests, the public SDK registry
  integrity hash, and the synthetic loopback fixture example (`127.0.0.1`).
- Relative Markdown links in README, runbook, API contract and acceptance all resolve
  to existing files.

## 3. Literal commands and rollback paths (plan checkbox 4 cross-check)

Every documented Kiki command exists in the actual CLI dispatcher/args source:

| Documented claim | Verified against |
|---|---|
| `kiki install` / `install --project <path>` / `install --force` (tolerated no-op) | `src/cli/index.ts`, `src/cli/args.ts` `parseScope` (`--force` explicitly skipped, never resets anything) |
| `kiki init [path]`, `kiki update [--global]` | `index.ts`, `install.ts`/`init.ts`/`update.ts` |
| `kiki migrate [--from <dir>] [--project <path>] [--force]` (strict parser, duplicate/missing-arg rejection) | `args.ts` `parseMigrationArgs` |
| `kiki reset --project <path>` | `reset.ts`, `parseScope` |
| `kiki status [path]`, `kiki doctor [path]`, `kiki verify <file>` | `index.ts` dispatcher |
| `kiki routing` retired read-only notice ("configure agents.<id>.model") | `routing.ts` |
| `kiki release` dry-run default, `--apply`, `--bump auto\|major\|minor\|patch`, `--since <ref>`, `--security-exception <reason>`, INCOMPLETE fail-closed, 2026-11-04 exception void | `commands/release.ts` usage/lines 68–72, 586–627; README/CHANGELOG wording matches |
| Package surface: version `3.0.0`, `@opencode/plugin` exact `2.2.6` in dependencies, `./server`/`./tui`/`.` exports, `bin.kiki`, `engines.node >=18`, `files: dist/` | `package.json` |
| Migration safety: source read-only; refusal on `provider`/`providers`/`auth`/`env` before any write; marker `.agentic/kiki/migration.json`; rerun fails closed, `--force` fresh backup; **no marker unless every eligible agent succeeds** (partial success exits non-zero, removes no project files); backups 0700/0600 with manifest + gitignore; per-agent names-only rejection; scientist/non-Kiki reported, not migrated | `oc2-migration.ts` lines 139, 364–365, 412–413, 538–540, 630–659, 730–732, 895–921 |
| Install/update: backs up to `kiki/backups` (manifest + `.gitignore`, restrictive modes), "Restart OpenCode" message, existing frontmatter settings preserved while the body regenerates from baseline, **model never in frontmatter** (no seeding), stale V1 files removed | `opencode-config.ts` `installGlobalFiles`/`nativeAgentContent`/`backup` (lines 433–542) |

Runbook machine commands checked literally: §1 tag checks are read-only and expect the
verified tag object/peeled target; §1.7 loader backup preserves mode via `stat`/`chmod`
and repoints to `kiki-v1`; §5.2 downloads the installer to a file and runs it with
**`bash`, not `sh`** (`bash /tmp/opencode-v2-install-2.2.6.sh --version 2.2.6
--no-modify-path`), explicitly forbids unreviewed `curl | bash`, creates the isolated
`opencode.jsonc` with `update: "disable"` and `experimental.subagent_depth: 1`;
§5.3 matches plan appendix C incl. the runtime-subdir caveat.

## 4. Five-variable isolation, wrapper fallback/rollback, TUI non-recouple

- **All five isolation variables** (`OPENCODE_CONFIG_DIR`, `XDG_CONFIG_HOME`,
  `XDG_DATA_HOME`, `XDG_CACHE_HOME`, `XDG_STATE_HOME`) are set in both the OC2 wrapper
  (§5.2) and the future `kiki` wrapper (§5.4); OC1 wrappers (`opencode-v1`, `kiki-v1`)
  deliberately inherit a clean environment and set none. README Requirements and
  CHANGELOG state the same. The §6.3 reconciliation (V1 resolver reads
  `XDG_CONFIG_HOME` only — confirmed by `oc1GlobalDirectory()` in
  `oc2-migration.ts:61-63`) justifies the addition beyond the plan's appendix examples,
  as already accepted in the runbook round-2 review.
- **Rollback cannot overwrite OC2:** the preferred path is a non-destructive wrapper
  repoint (OC2 binary stays at `~/.opencode/bin/opencode`); the binary-swap
  alternative explicitly forbids the plan's bare `mv opencode-v1 → opencode`, moves
  V2 to `opencode-v2` only after `test ! -e`/`! -L` collision checks, and — closing
  runbook-review non-blocking observation 1 — now mandates **removing or repointing
  the OC2 wrapper before any bare swap**, with the dangling `opencode-v1` wrapper
  called out for deliberate review and `hash -r` included.
- **No old-TUI recouple:** the §1.7 pre-detachment loader backup is declared
  diagnostic-only with no executable restore path anywhere in the runbook; rollback
  verifies the frozen `kiki-v1` target instead. The `grep -F` pair is precise
  (`.../kiki/dist/...` is not a substring of `.../kiki-v1/dist/...`). §6 item 10 and
  acceptance §8 record the same discipline.
- No unsupported uninstall CLI is introduced anywhere; Kiki-side rollback is
  manifest-scoped to known V3 artifacts.

## 5. Acceptance matrix and claim honesty

- The acceptance matrix keeps **ACTUAL_V3_VALIDATION (PASS, automated; fresh audit
  pending Task 13)**, **RELEASE_REHEARSAL (NOT RUN)** and
  **FUTURE_RELEASE_AUTHORIZATION (NOT RUN)** separate, with the additional
  fresh-audit / live-install / live-migration / provider-login / Task-14 gates each
  **NOT RUN**, and explicit statements that a future rehearsal PASS cannot fill the
  actual-artifact, live-machine or actual-release columns. No overall-green, security
  certification or public-npm-availability claim exists in any of the five documents
  (README and API contract explicitly warn against assuming a published `kiki@3.0.0`).
- User-reported checkpoints (V1 detachment + loader backup, `/kiki` smoke, §5.3
  version/PATH/wrapper checks, both V1/V2 start) are clearly labeled user-reported and
  not independently re-run; no live Kiki 3.0.0 install, migration or login is inferred
  from them. This matches the user's confirmed stage exactly.
- The open **prompt-body ownership** decision is documented as unresolved in README,
  CHANGELOG, runbook §6.12 and acceptance §7, alongside the accurate mechanics
  (bodies regenerate with backup; config models and existing frontmatter permissions
  preserved — verified against `nativeAgentContent`/`installGlobalFiles`).

## 6. Task 11 conditions and post-fix provenance

Task 11 review requirements 1–3 (conditions of that PASS) are discharged in the
documentation record:

1. **Post-fix digests recorded:** acceptance §2 and API contract §9 carry the current
   post-GUI-fix certificate — pack manifest `603f7a80…`, tarball
   `edcae219ee2913bcbc62322d817b20f823fd4f9d92a60dfbc194aba7c0776782` (130 files,
   package 3.0.0, SDK 2.2.6), input manifest
   `3533b42fe80993d944ec32aedbdc65cf4937c9a6931de685ef62968185c38aca`
   (`trackedGitOnly: false`, includes `src/tui/model-menu.ts` and
   `tests/tui/model-menu.test.ts` — verified in the manifest file), dist manifest
   `e17657a9587802ecb3f4e2b95173b58cfd9f16b63192909d5b7307a3dc151480` (128 files,
   digest confirmed inside the manifest), `dist/tui/model-menu.js` `ebce6501…`/11257 B,
   post-fix task diff `2049a118…`. Pre-fix values are marked **superseded/historical**
   in a dedicated subsection. All values match Task 11 report §10 and the preserved
   artifacts (`/tmp/opencode/kiki-oc2-menu-global-fix-artifacts/` still holds the
   tarball + pack manifest; `pack-manifest.json` read directly: `tarballSha256`
   `edcae219…`, `packageVersion 3.0.0`, `sdkVersion 2.2.6`; the independent
   reproduction artifacts also still exist). In-repo digest recording satisfies the
   "preserved or copied into a durable evidence record" requirement.
2. **Post-fix full-suite standing evidence recorded:** 24/24 required (0 skips) and
   628 passed / 1 by-design opt-in rehearsal skip / 0 failed appear in README,
   acceptance §2 and API contract §9.
3. **Task 13 target pinned to the post-fix snapshot:** acceptance §2.3 states Task 13
   must reconfirm the current post-fix digests and audit that snapshot; the pre-fix
   values are explicitly barred as a baseline.

## 7. Checklist

- **Security scan:** no secret patterns in the changed documents; no live config,
  credential, `.env` or auth content embedded anywhere; migration docs recommend only
  sanitized `--from` exports and forbid copying credentials (README, runbook §5.5,
  acceptance §6). Verifier runs are read-only.
- **Linting compliance:** `npm run lint` exit 0 on the current tree; Task 12 changed
  no lintable file; no warnings/errors remain in changed files.
- **Parallelization logic:** Task 12 `depends_on: ['Task 11']` — released with PASS.
  No circular chains. Task 12's five files are disjoint from Task 13's pending scope
  (`src/cli/release-gates.ts`, `tests/integration/oc2-release-rehearsal.test.ts`,
  acceptance update) and from Task 14's acceptance-only update; the Task 12 → 13 → 14
  ordering is preserved, and the acceptance doc correctly defers its own finalization
  to those tasks.

## 8. Non-blocking observations

1. **README migration example retains `kiki update` before `kiki migrate --from`**
   (carried over from the old V1 flow, where `update` itself performed the global
   import). In V3 the line merely refreshes the global installation first — harmless
   and arguably the right order, but slightly redundant next to runbook §5.5, which
   omits it. Cosmetic only; no behavioral or safety impact.
2. **`less "$installer"`** still stops inside a copy-paste block (§5.2), but the added
   inline comment ("Human review: inspect the downloaded file…") now flags the pause,
   partially addressing runbook-review observation 2. Fine as-is.
3. **§1.1 clean-shell check** still flags only values containing `opencode2` (plus any
   set `OPENCODE_CONFIG_DIR`); accepted in the round-2 runbook review for the
   canonical machine layout and unchanged here. Generalize only if the layout ever
   changes.
4. The acceptance doc references `/tmp/opencode` artifact paths that are
   machine-local; because their digests are recorded in-repo, provenance survives
   `/tmp` cleanup. Task 13's reconfirmation should re-derive them from the tree as
   planned.

## 9. Conclusion

Task 12's documentation deliverables are complete, accurate against the actual CLI
surface and preserved evidence, honest about pending gates, and safe in every
literal machine command and rollback path. The Task 11 review's documentation-side
conditions are satisfied; Task 13 (fresh audit + isolated release rehearsal) and
Task 14 (human machine acceptance) remain explicitly NOT RUN and must update the
acceptance document with their final evidence before it is treated as the final
acceptance record.

**Documentation completion may be recorded; no further action is requested of the
historian for this task.**

## 10. Review boundary

This review performed no source or documentation fixes, no builds beyond allowlisted
lint, no installs, no live/default/global-config or credential reads, no
commits/tags/pushes, no registry edits and no subagent dispatch. Only this review
file was written, to the permitted review location.

---

# Addendum — scoped final-documentation completion review (2026-11-10)

Scope: the historian's post-Task-13 final evidence update only —
`/tmp/opencode/kiki-oc2-final-docs.diff` (2214 lines) + report
(`/tmp/opencode/kiki-oc2-final-docs-report.md`,
`.agentic/kiki/kiki-oc2-final-docs-report.md`), reviewed against final whole-branch
review §7 completion condition 1
(`.agentic/reviews/2026-11-09-kiki-oc2-final-review.md`) and the Task 13 report
(`/tmp/opencode/kiki-oc2-task13-report.md`). Documentation-only scope held: the diff
contains exactly the five Task 12 documents (README, CHANGELOG, runbook, API
contract, acceptance); HEAD remains `e2bf396` (no commits); working tree matches the
diff byte-for-byte (stat: CHANGELOG +21, README 379 changed, runbook 996 / API
contract 367 / acceptance 291 lines). No source fix, build, test run, global-config or
credential read, registry edit or commit by the historian or by this review.

## A1. Verification performed (read-only; verifier against existing dist)

- `node dist/cli/index.js verify` on all five final documents → "No placeholders
  found.", exit 0 each — reproduces the final-docs report §5.
- **Final actual hashes confirmed consistent across docs, Task 13 report §4.2, final
  review §7, and the artifacts read directly:** tarball
  `952be15086d93e9ff8a62d111f9155741ef2db4c3d8e82420a6a860c3f0aef37` (130 files,
  package 3.0.0, SDK 2.2.6 — `pack-manifest.json` `tarballSha256` read directly),
  input manifest `74bccc17017f60deb0c6f3a7f43957ca872e2a7d10a74fa9943998126c2f5789`,
  dist `f0da220cae0b5620fc085ca6bbcc1952242eccc79ffd7c79cf1054256033b5a6` (128
  files, confirmed inside the input manifest), pack manifest
  `14005d97f0b0dc7f01cc42f08e00cde9f9b8905b090c6732003d9cffe91bbc37`. The manifest's
  counts reconcile exactly: 278 hashed = 214 tracked − 12 retired-missing − 1
  excluded live-config (`opencode.jsonc`, excluded unread) + 77 untracked; all
  components are recorded in the acceptance row.
- **Test/audit/rehearsal numbers match the Task 13 report and evidence:** required
  24/24 / 0 failed / **0 skipped**; full suite with binary **632 passed / 2
  by-design opt-in skips / 0 failed** (both skips named: rehearsal gate + opt-in
  real-TSC release test); 620/14 without binary; tsc/lint/build exit 0; fresh audit
  **0 high, 0 critical, 32 moderate, 0 low, 0 info / 454 deps / no exception** —
  `kiki-oc2-task13-audit-summary.txt` read directly and matches verbatim; audit JSON
  digest `e63210c6…` recorded; actual server/TUI artifact hashes
  (`8083ca31…`/`172e00c9…`/`59e6bd78…`/`925ac675…`) match the Task 13 report and the
  final review's three-artifact cross-check; rehearsal run8 1/1/0, 348.81 s, log
  `66feaba1…`, all six gates, `Applied: false`, candidate hashes match actual, all
  six rehearsal artifact files present, evidence digests
  (`2cc2e43a…`/`19b6c5ff…`/`8691e9db…`/`bfca7b3e…`/`771ade09…`) match.
- **Stale-claim scan (grep over the five final docs):** no "pending Task 13", "Task
  13 owns", "remain Task 13" or 628-as-current anywhere; the Task 11 post-GUI
  digests (`edcae219…`, `3533b42f…`, `e17657a9…`, `603f7a80…`) appear **only** in
  acceptance §2.2 "Superseded Task 11 certificates — historical only", with the
  explicit supersession and the docs-only-exemption rule matching final review §7
  item 3. Secret-pattern scan over the changed docs: clean.
- **Boundaries:** FUTURE_RELEASE_AUTHORIZATION and Task 14 human machine acceptance
  remain **NOT RUN** in every document (matrix, additional-gates table, README
  status, runbook §3/§5.7, conclusions); the rehearsal is labeled synthetic and "not
  release authorization"; no actual-release, security-certification or
  public-npm-availability claim exists; user-reported checkpoints remain
  user-reported (V1/V2 start, §5.3 checks, loader backup, `/kiki` smoke) with live
  install/migration/provider login/Task 14 all **not done**.
- **Ownership/no-phantom-question framing:** prompt-body regeneration is documented
  as the V1-equivalent baseline (backup kept; config models and frontmatter
  permissions preserved), "adds no new feature", "**not a migration blocker**", with
  preservation of user-edited global bodies presented as a separate **post-switch
  ownership change for the user to request** — no new-behavior approval is claimed,
  and the final review's human questions 1/4 are neither silently resolved nor
  turned into blockers. The `/kiki` inherited same-model no-op is documented
  conservative behavior to observe in the Task 14 drill. The investigated
  "update privilege" phantom item does not appear in any user-facing document.
- **Machine-command additions** (runbook §5.4 retitled "for Task 14", §5.7 checklist,
  acceptance §5.1 minimal sequence): every literal command exists in the actual CLI
  (`kiki --help`, `install`, `init`, `doctor`, `migrate --from`) and is staged,
  human-run, live-write-authorization-gated; the five-variable wrapper, bash
  installer, wrapper-before-swap rollback, `opencode-v2` preservation and frozen
  `kiki-v1` TUI target discipline are all preserved unchanged from the approved
  Task 12 text. The final README also resolves this review's non-blocking
  observation 1 (`kiki update` → `kiki install` with the update note).

## A2. Verdict (scoped addendum)

All final-review §7 item 1 recording requirements are met: the final Task 13
certificate, superseded Task 11 values, RELEASE_REHEARSAL (synthetic, no apply),
fresh-audit result and honest NOT-RUN boundaries are recorded accurately across the
five documents, with no contradictory pending-Task-13 wording left behind.

- **Spec compliance (final docs completion): PASS**
- **Quality/accuracy (final docs completion): PASS**

```
Verdict: PASS
Blockers:
(none)
```

Remaining (unchanged, correctly documented): orchestrator registry completion per
final review §7 item 2; Task 14 human execution and the ACCEPT/SWITCH, RETAIN OC1 or
ROLLBACK decision; FUTURE_RELEASE_AUTHORIZATION. This addendum performed no source
or documentation fixes, no builds beyond the verifier's existing-dist use, no
installs, no live-config or credential reads, no commits, tags, pushes or registry
edits; only this review file was appended to.
