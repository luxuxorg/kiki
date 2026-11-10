# Kiki 3.0.0 / OpenCode 2 Acceptance and Evidence

**Document status:** release handoff, 2026-11-10. Task 13 and the whole-branch review
PASS. The user reported successful live OC2/V1 startup and a working OC2 `/kiki` menu,
then accepted 3.0.0 and explicitly requested commit, release and push. Unreported live
migration, provider login, dispatch and rollback checks are not claimed. The historical
automated certificates below remain distinct from the fresh release verification record.

Final gates:

- Task 13 report: `/tmp/opencode/kiki-oc2-task13-report.md`
- Final whole-branch review: `.agentic/reviews/2026-11-09-kiki-oc2-final-review.md`
  (PASS; §7 requires this historian evidence update)

Related documents:

- [Migration design](../superpowers/specs/2026-11-09-kiki-opencode2-migration-design.md)
- [Implementation plan](../superpowers/plans/2026-11-09-kiki-opencode2-migration-plan.md)
- [Parallel machine runbook](./kiki-3-oc2-parallel.md)
- [Pinned API/CLI contract](./kiki-3-oc2-api-contract.md)
- [Project README](../../README.md)

## 1. Acceptance matrix

The three evidence sets are independent. The rehearsal PASS does not fill the
actual-release column, and automated evidence is not a human-run machine result.

| Evidence set | Status | Scope | Current evidence |
|---|---|---|---|
| **ACTUAL_V3_VALIDATION** | **PASS (automated, final snapshot)** | Reviewed V3 3.0.0 checkout/build/package bytes, real 2.2.6 binary, required and full suites, fresh audit | Task 13 certificate below: tarball `952be150…`, input manifest `74bccc17…`, dist `f0da220c…`, pack manifest `14005d97…`; 632/2/0 with binary; 24/24 required; audit 0 high/critical, 32 moderate, no exception |
| **RELEASE_REHEARSAL** | **PASS (synthetic)** | Independent 2.4.0-versioned copy of reviewed V3 source through the unchanged release path with `--bump major --since e2bf396…` and no `--apply` | Task 13 run8: 1/1 test, 0 skipped, 348.81 s; all six gates passed; `Applied: false`; candidate artifact hashes match actual |
| **FUTURE_RELEASE_AUTHORIZATION** | **AUTHORIZED** | Commit the existing validated 3.0.0 tree, annotate `v3.0.0`, push the current branch and tag, create a GitHub Release | User request: “OK, seems we're done with v3.0.0. commit, release, push”; no version bump, synthetic copy-back or npm publication |

Additional gates:

| Gate | Status | Notes |
|---|---|---|
| Fresh V3 security audit | **PASS for the existing gate policy** | Actual final graph: 0 high, 0 critical, 32 moderate, 0 low, 0 info; 454 dependencies; no exception supplied. Moderate findings are reported honestly and are non-blocking under the already-approved policy; no routine approval is added. |
| Live Kiki 3.0.0 installation | **USER-REPORTED SMOKE PASS** | User reports that the OC2 `/kiki` TUI works; installation was human-operated. |
| Live OC1→OC2 migration | **NOT RUN** | No live migration or credential export is claimed. |
| Provider login / credential validation | **NOT RUN / user-owned** | Credentials remain user-owned; Kiki must never read or print their values. |
| Task 14 human machine acceptance | **ACCEPTED BY USER** | Release acceptance follows live startup/menu smoke; unreported dispatch, save/removal, model migration and rollback drills are not claimed. |
| Actual 3.0.0 release | **AUTHORIZED; FRESH VERIFICATION PASS** | Current-version build/test/audit/package validation passed; delivery is recorded by the `v3.0.0` tag and GitHub Release. |

## 2. ACTUAL_V3_VALIDATION — final snapshot

Task 13 source edits (release-gate server-artifact invariants and active-package
registration recognition) invalidated the Task 11 post-GUI bytes. The final snapshot is the
current reviewed working tree at baseline `e2bf396df5a14657f34f55c78b31819be10b9c05`.

| Item | Final value |
|---|---|
| Input manifest | `/tmp/opencode/kiki-oc2-task13-artifacts/task13-input-manifest.json` — sha256 `74bccc17017f60deb0c6f3a7f43957ca872e2a7d10a74fa9943998126c2f5789`; 278 files (214 tracked, 77 untracked); `trackedGitOnly: false`; `opencode.jsonc` excluded without reading; 12 retired tracked paths recorded |
| Dist manifest | 128 files; digest `f0da220cae0b5620fc085ca6bbcc1952242eccc79ffd7c79cf1054256033b5a6` |
| Packed tarball | `/tmp/opencode/kiki-oc2-task13-artifacts/kiki-3.0.0.tgz` — sha256 `952be15086d93e9ff8a62d111f9155741ef2db4c3d8e82420a6a860c3f0aef37`; 130 files; package `3.0.0`; SDK `2.2.6` |
| Pack manifest | `/tmp/opencode/kiki-oc2-task13-artifacts/pack-manifest.json` — sha256 `14005d97f0b0dc7f01cc42f08e00cde9f9b8905b090c6732003d9cffe91bbc37` |
| SDK lock | `@opencode/plugin@2.2.6`; integrity `sha512-PbQD4aN8YJ8w3gM5L9h2msXppxEAUVj8Ejbaj6MMNb+99jPm7/XM+g2ugZomSNs1XXuab2IlrIKDgbiI49VfLw==` |
| Required real-binary command | 7 files passed; **24/24 tests passed, 0 failed, 0 skipped** |
| Full suite with binary | 43 files passed / 2 skipped; **632 passed, 2 by-design opt-in skips, 0 failed** |
| Full suite without binary | 40 files passed / 5 skipped; 620 passed, 14 skipped, 0 failed |
| Full-tree gates | `tsc --noEmit` exit 0; `npm run lint` exit 0; `npm run build` exit 0 |
| Fresh audit | `npm audit --json --include=dev --include=optional --include=peer` exit 1 with complete payload; **0 high, 0 critical, 32 moderate, 0 low, 0 info**; 454 deps; no security exception |
| Audit JSON | `/tmp/opencode/kiki-oc2-task13-actual-audit.json` — sha256 `e63210c6fef3ae457ad32ff86653750fc8df2ae8ab025b834df872cfd012443e` |
| Actual server/TUI artifacts | `dist/server/index.js` `8083ca318962740d48677d65eefd481180861021f876b768cf7f0a186602236a`; `dist/server/index.d.ts` `172e00c946feff73b585b764471abc5705926e0496933951252b044bc4d428f1`; `dist/tui/index.js` `59e6bd78b424cd4defa986c656e5d3525eac5b66297332135a4736698f7a32a5`; `dist/tui/index.d.ts` `925ac6755119223ba22b52892037851d0d3c0bf311b02cfd75de71aea3290ce1` |

The two binary-suite skips are the by-design opt-in `KIKI_RELEASE_TEST_OC2_REHEARSAL` test
and the opt-in real-TSC release test. The required seven-suite run has zero skips.

### 2.1 What the automated evidence covers

- Required real-binary integration with **zero required skips**, including the native
  `/kiki` PTY menu and zero-provider-request assertion.
- Eight native agents/modes, orchestrator selectability, global/project model precedence,
  and actual allow/deny/ask permission evaluation.
- Foreground and background `subagent` dispatch, unchanged routing entry format, real
  watchdog interruption with health records, reload ownership and duplicate-registration
  diagnosis.
- Real packaged-consumer load and fixture run without the checkout on module resolution.
- Fixture migration/isolation: source immutability, credential-bearing source refusal,
  symlink overlap refusal, fail-closed marker/force behavior, backups, and zero OC2 writes
  under all four synthetic OC1 roots.
- Final audit on the actual dependency graph under synthetic npm/XDG roots with no user
  credential or npm config read.

### 2.2 Superseded Task 11 certificates — historical only

The Task 11 post-GUI set is retained for history but is **not** the final certificate:

- tarball `edcae219ee2913bcbc62322d817b20f823fd4f9d92a60dfbc194aba7c0776782`
- input manifest `3533b42fe80993d944ec32aedbdc65cf4937c9a6931de685ef62968185c38aca`
- dist manifest `e17657a9587802ecb3f4e2b95173b58cfd9f16b63192909d5b7307a3dc151480`
- pack manifest `603f7a80ce14f13fecad97791afd73322a10aa0241cd7dad8fd1d21402afde38`

The earlier pre-GUI-fix values are also historical. Task 13's final inputs, dist and tarball
above supersede them for actual validation. Any later source change restarts the
actual-evidence obligations; documentation-only changes are exempt.

## 3. RELEASE_REHEARSAL — PASS (synthetic)

Command:

```bash
KIKI_RELEASE_TEST_OC2_REHEARSAL=1 \
KIKI_RELEASE_REHEARSAL_ARTIFACTS_DIR=/tmp/opencode/kiki-oc2-task13-rehearsal-artifacts \
npx --no-install vitest run tests/integration/oc2-release-rehearsal.test.ts
```

Result: **1 file passed, 1 test passed, 0 skipped; 348.81 s**. Run log sha256
`66feaba10a5326f059be91aec55fd22bdef7b48e24a09064cdf35a52e4cbf1b0`.

- Synthetic provenance: final reviewed source copied to a disposable root; independent Git
  object copy plus private `git init`/index/`update-ref`; **no commit created**. The original
  checkout's HEAD, refs, index and source/dist hashes were asserted unchanged.
- Input normalization: only `package.json`, `package-lock.json` and
  `src/cli/config.ts` changed to `2.4.0`; `CHANGELOG.md` was included as a validated no-op
  input (one nonempty `[Unreleased]`, no `[3.0.0]` target).
- CLI dry run: `Version: 2.4.0 -> 3.0.0 (--bump major; ignored 0)`, all six gates passed
  (`build`, `test`, `typecheck`, `lint`, `security`, `invariants`),
  `Applied: false (dry run; no checkout writes)`. No remote action or copy-back occurred.
- Exported `prepareRelease` run delegated real subprocesses (real `tsc`, `npm test`,
  `tsc --noEmit`, `eslint`, `npm audit`; no mocked gate successes). Audit exit 1 carried the
  same 32 moderate findings and was accepted by the existing gate parser.
- Candidate artifacts `dist/server/index.js`, `dist/server/index.d.ts`,
  `dist/tui/index.js` and `dist/tui/index.d.ts` match the actual final hashes exactly.
- Negative guards: `--dry-run` is rejected by the parser; a 3.0.0 input with `--bump major`
  computes 4.0.0, never 3.0.0; no security exception is implicitly supplied.
- The synthetic input tree was byte-identical after the dry run; disposable candidate roots
  were removed. No candidate bytes were copied back or retained.

Rehearsal evidence:

| Artifact | sha256 |
|---|---|
| `source-manifest.json` | `2cc2e43a680e40beef982211b082ca468f78e28e97817ad5f0b9dd22be51d685` |
| `normalization.json` | `19b6c5ff0831ada3791b7bdd47a840302cc1e8cd671ae4d33026bb9ca778406b` |
| `cli-release.log` / `exported-release.log` | `8691e9dbe15fcc4b4505945010289d4e828fe2dd9d4eb7682c5005c8c7f0bb43` |
| `observed-calls.json` | `bfca7b3ee546e017e2858b4020af6c78cfa95df48d89b5d93c0b5dd85d023171` |
| `candidate-evidence.json` | `771ade0924448494d62a54c0a406a792128fa880cfb541bcc1beb2c7808e4737` |

The rehearsal demonstrates the release-preparation path on synthetic 2.4.0 inputs. It does
not certify live bytes, does not authorize a release and is not an actual-release record.

## 4. Release authorization and current-version procedure

On 2026-11-10 the user accepted 3.0.0 and requested “commit, release, push”. The release
workspace is the existing `feat/global-kiki-updates` checkout at version 3.0.0. Its
reviewed source and exact SDK dependency remain unchanged; only release documentation,
the dated changelog heading and task records are finalized.

Release procedure:

1. Run fresh build, lint, typecheck and full tests with the real isolated OC2 2.2.6 binary;
   require all seven integration suites with zero skips and a complete current audit.
2. Verify package/lock/source/dist versions, native server/TUI exports, absence of retired
   V1 artifacts and package contents; produce a fresh tarball and SHA-256 receipt.
3. Inspect and stage the intended product, test, generated distribution, migration docs,
   project permission amendments and task/review records. Do not include secrets.
4. Commit as `feat!: release v3.0.0 for OpenCode 2`; create annotated tag `v3.0.0` at
   that commit; push `feat/global-kiki-updates` and `v3.0.0` to `origin`.
5. Create the GitHub Release at `v3.0.0`, attach the verified package tarball and checksum,
   and verify the remote branch/tag targets and published release metadata.

This does not merge `main`, publish to npm, invoke another version bump, apply a synthetic
candidate, reset/clean the checkout or change live installations. The existing local
`kiki release` command always increments its input version; it is therefore not used to
re-release the already-3.0.0 development tree as 3.0.0.

### 4.1 Fresh release verification — 2026-11-10

The release was revalidated after finalizing the dated changelog and acceptance text.
This receipt supersedes the historical development tarball for release delivery; the
server/TUI entrypoint SHA-256 values remain identical to §2.

| Check | Release result |
|---|---|
| OpenCode | Real isolated binary `opencode v2.2.6` |
| Build / lint / typecheck | All exit 0 |
| Full test suite | 632 passed, 2 intentional opt-in skips, 0 failures |
| Required integration | All seven suites passed, 24 tests, 0 skips |
| Audit | Complete result: 0 high, 0 critical, 32 moderate, no exception |
| Package | `kiki-3.0.0.tgz`, 130 files; native server/TUI exports present, retired V1 artifacts absent |
| Package SHA-256 | `f1d48009674451e952ffaac58f096693d649fc2925f2dd607435182950fda649` |
| Local receipt | `/tmp/opencode/kiki-v3-release-gTGyIZ/receipt.json` |
| Release URL | `https://github.com/luxuxorg/kiki/releases/tag/v3.0.0` |

The two skipped checks are opt-in release tests already exercised by the Task 13
rehearsal; none of the required live-binary integration checks were skipped. No source
changes were made during this release finalization. Release assets include the tarball
and `SHA256SUMS`; the GitHub tag/release metadata records actual publication.

## 5. Machine checkpoints and Task 14 — user acceptance

The historian did not run live machine commands and did not read live global configs,
credentials, `.env` or `auth.json`. The following setup results are **user-reported**:

| Checkpoint | Reported state |
|---|---|
| V1 detachment and loader backup | Passed; frozen `kiki-v1` target and `/kiki` menu smoke recorded |
| OC2 installation and §5.3 separation | Passed; V1 and V2 start successfully; version, PATH and wrappers verified |
| `opencode` / `opencode-v1` | `opencode` targets isolated OC2; `opencode-v1` targets retained OC1 |
| OC2 pin | Exactly `2.2.6` |
| Kiki 3.0.0 live install/menu smoke | **User reports `/kiki` works in OC2** |
| Live migration | **Not reported** |
| Provider login | **Not done by Kiki / user-owned** |
| Task 14 acceptance | **User accepted 3.0.0 for release on 2026-11-10** |

The frozen OC1 fallback (`opencode-v1` + `kiki-v1`) remains available. Primary-agent
selection uses OC2's `/agents` or `Shift+Tab`; `/kiki` changes model assignments, not the
active agent or `default_agent`. The selection issue was not reproducible in a fresh
OC2 terminal; no configuration or product behavior was changed for it.

### 5.1 Minimal user-run Task 14 sequence

These commands are **human-run and staged**, not agent-run. They require the user's explicit
live-write authorization. The detailed safety text is in the runbook §5.4–§5.7.

```bash
# 1. Create/review the isolated Kiki wrapper (all five variables; do not overwrite blindly)
test ! -e /home/lutz/.local/bin/kiki
umask 022
cat > /home/lutz/.local/bin/kiki <<'EOF'
#!/bin/sh
export OPENCODE_CONFIG_DIR="$HOME/.opencode2/config/opencode"
export XDG_CONFIG_HOME="$HOME/.opencode2/config"
export XDG_DATA_HOME="$HOME/.opencode2/data"
export XDG_CACHE_HOME="$HOME/.opencode2/cache"
export XDG_STATE_HOME="$HOME/.opencode2/state"
exec node /home/lutz/lprojekte/kiki/dist/cli/index.js "$@"
EOF
chmod 0755 /home/lutz/.local/bin/kiki
hash -r

# 2. Confirm the actual CLI and install the global Kiki 3.0.0 files
kiki --help
kiki install
kiki init /path/to/scratch-project        # interactive wizard; asks no model questions
kiki doctor /path/to/scratch-project

# 3. Migrate only from a user-prepared secret-free export (never the live config)
kiki migrate --from /path/to/sanitized-oc1-export
kiki doctor /path/to/scratch-project
```

Then, in the user-owned TUI/scratch project:

1. Log in to providers inside the isolated OC2 TUI. Kiki never reads or copies credentials.
2. Run one real `kiki-orchestrator` → `subagent` dispatch in a scratch project.
3. Exercise `/kiki` save and removal, including the inherited same-model no-op observation.
4. Run the V1 smoke with `opencode-v1` + `kiki-v1` in a separate scratch project.
5. Rehearse Kiki cleanup and wrapper rollback on a throwaway OC2 config copy; do not delete
   working databases or `~/.opencode2`.
6. Confirm the OC2 `update: "disable"` and `experimental.subagent_depth: 1` settings and the
   five isolation variables without sharing config contents.
7. Record non-secret results and choose **ACCEPT/SWITCH**, **RETAIN OC1**, or **ROLLBACK**.

Do not assume a published `kiki@3.0.0`, a public uninstall command or a GitHub install
target. The development checkout form is the validated local form; release registration is
valid only when a validated candidate is actually available.

## 6. Migration and credential safety

- Migration reads a **human-prepared sanitized export** passed with `--from`. Live
  credential-bearing configuration is refused before any write when it contains
  `provider`, `providers`, `auth` or `env`. The agent must not read the live config to
  create this export.
- The OC1 source is read-only and must remain byte-identical. Global migration writes only
  the isolated OC2 destination; project migration writes only the named project and removes
  only redundant Kiki local files after full success.
- Per-agent conflicts and untranslatable permissions fail closed with a reason. Successful
  agents may already have been written (partial success), but the command exits non-zero,
  writes no migration marker and removes no project Kiki files. Rerun after correcting the
  input.
- A successful run writes `.agentic/kiki/migration.json` (source, timestamp, Kiki version).
  A rerun fails closed at the marker; `--force` creates a fresh backup first.
- Backups use restrictive modes with a path manifest and Git ignore rule. Non-Kiki agents
  and the user-owned `scientist` agent are reported by name for manual migration; the
  scientist audit/port remains deferred.
- Provider login is user-owned and is never copied from OC1. Kiki does not read, copy or
  print `.env`, `auth.json` or provider credentials; `doctor` reports presence only.

## 7. Native prompt bodies — baseline behavior, not a blocker

Kiki 3.0.0 owns the eight global native agent Markdown files. `kiki install`/`kiki update`
regenerate the Kiki-owned prompt body from the installed Kiki version and back up the
previous files. Config models and existing frontmatter permissions are preserved.

This is the V1-equivalent baseline behavior; it adds no new feature and does not block the
migration. If the user later wants user-edited global prompt bodies preserved, that is a
post-switch ownership change to request separately. Project-local agent Markdown overrides
remain separate and replace the global prompt for that project only.

The `/kiki` inherited same-model selection is a conservative no-op (no write; toast text
unchanged). It is documented behavior, not an urgent decision; it may be observed during the
Task 14 save/removal drill.

## 8. Kiki-side and machine rollback summary

### Kiki-side cleanup

Remove only known V3 Kiki artifacts using the backup manifest: Kiki `agents/kiki-*.md`,
Kiki entries in the OC2 `plugins` lists and `cli.json`, and only the documented Kiki-owned
workflow/prompt files. Preserve V1, V2, unrelated config, project data, reviews and task
metadata. There is no supported public uninstall command; do not invent one.

### Machine rollback

- Preferred: keep the OC2 executable at `~/.opencode/bin/opencode`, back up the current
  `/home/lutz/.local/bin/opencode` wrapper, and repoint that wrapper to
  `~/.opencode/bin/opencode-v1`. This is non-destructive and reversible.
- Alternative binary swap: **first** remove or repoint the OC2 wrapper, then move
  `~/.opencode/bin/opencode` to `~/.opencode/bin/opencode-v2` and move
  `~/.opencode/bin/opencode-v1` to `~/.opencode/bin/opencode`. Never overwrite the OC2
  executable, and keep `opencode-v2` for diagnosis or return.
- Keep the frozen V1 TUI loader target
  `file:///home/lutz/lprojekte/kiki-v1/dist/tui/index.js`. The pre-detachment loader backup
  is diagnostic only; never restore a loader pointing at the moving development checkout.
- Keep `~/.opencode2` during an acceptance drill. Deleting it is a separate destructive
  decision that requires backing up user-owned sessions and credentials.
- Re-run version/PATH checks and the OC1 `/kiki` menu smoke after the chosen rollback.

## 9. Current conclusion

**ACTUAL_V3_VALIDATION** PASS on the final Task 13 snapshot, including a fresh audit with
0 high/critical and 32 moderate findings and no exception. **RELEASE_REHEARSAL** PASS on the
independent synthetic 2.4.0→3.0.0 run with no apply. The user subsequently accepted 3.0.0
for release; commit, tag, current-branch push and a GitHub Release are authorized under
§4. Unreported machine drills remain explicitly unverified. Task 12/13 documentation
and the release-acceptance record are complete.
