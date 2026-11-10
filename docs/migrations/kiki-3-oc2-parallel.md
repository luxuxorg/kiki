# Kiki 3.0.0 / OpenCode 2 Parallel Migration — Runbook

**Document status:** Task 13 final-evidence revision of the Task 1 runbook. No command
below was run by the documentation agent. Every command is **human-run, staged, and not
authorized by the plan by itself**. The user reports that the §1 V1 detachment, loader
backup and `/kiki` menu smoke passed, that the §5.3 OC1/OC2 version, PATH and wrapper
separation checks passed, and that V1 and V2 start successfully. Task 13 actual validation
and the synthetic release rehearsal PASS; FUTURE_RELEASE_AUTHORIZATION and Task 14 human
machine acceptance are **not run**. Kiki 3.0.0 itself is **not** live-installed or
migrated, and provider login remains user-owned. See
[`kiki-3-oc2-acceptance.md`](./kiki-3-oc2-acceptance.md) for the evidence status.

**Hard gate:** On a fresh machine, do not start Task 2, build V3, switch the machine
default, or install OC2 until the human has completed §1 and recorded `V1_PROTECTED`
using the §1.9 checklist. The V1 TUI loader repoint in §1.7 is the only live-config edit
authorized by that batch. On the current machine the human reports this gate satisfied;
that is a prerequisite report, not Task 14 machine acceptance or proof of a live Kiki
3.0.0 installation.

**First action:** On a fresh machine, run §1 before anything else. On the current
machine, use §5.3 to re-confirm the existing separation before any further live action.
§5 is human-run reference material for the stage that has now been reached; it is no
longer a "not needed yet" appendix. Do not run destructive rollback or cleanup commands
as a drill on the working machine.

**First batch at a glance:**

| Stage | Action | Section | Human-reported state |
|---|---|---|---|
| 1 | Clean-shell, version, parent, symlink, collision and tag checks | §1.1–§1.3 | passed |
| 2 | Create `/home/lutz/lprojekte/kiki-v1` at `e2bf396…` | §1.4 | passed |
| 3 | Run `npm ci` and `npm run build` only in the frozen checkout | §1.5 | passed |
| 4 | Create the `~/.local/bin/kiki-v1` wrapper | §1.6 | passed |
| 5 | Back up and repoint the non-secret OC1 TUI loader | §1.7 | backup recorded, target frozen |
| 6 | Restart OC1, smoke `/kiki`, and record `V1_PROTECTED` | §1.8–§1.9 | menu passed |

## Document control

| Item | Value |
|---|---|
| Approved spec | `docs/superpowers/specs/2026-11-09-kiki-opencode2-migration-design.md` |
| Approved plan | `docs/superpowers/plans/2026-11-09-kiki-opencode2-migration-plan.md` (Tasks 1 and 12) |
| Development checkout | `/home/lutz/lprojekte/kiki` on `feat/global-kiki-updates` |
| Development-worktree decision | Use the current checkout; do **not** create an implementation worktree |
| Frozen fallback checkout | `/home/lutz/lprojekte/kiki-v1` (separate worktree, required) |
| Freeze tag | `v2.4.0` already created and pushed; verified peeled target `e2bf396df5a14657f34f55c78b31819be10b9c05` |
| OC2 pin | Exactly `2.2.6`; Kiki runtime SDK `@opencode/plugin@2.2.6` |
| Delegation depth | `experimental.subagent_depth: 1` |
| Plugin packaging | Package-style plugin (`./server` and `./tui` exports); no public package availability is assumed |
| Machine default | `opencode` → isolated OC2; `opencode-v1` → retained OC1 |
| Runtime roots | Config, data, cache and state all separate between OC1 and OC2; OC2 wrapper sets `OPENCODE_CONFIG_DIR` plus all four XDG roots |
| Deferred | Scientist audit/port, eval infrastructure, improvement loops, unrelated agent work |
| Current stage | Human reports V1/V2 setup and §5.3 separation checks complete; Task 13 actual validation and synthetic rehearsal PASS; Kiki 3.0.0 live install/migration/provider login and Task 14 are not done |
| Current release action | None. Do not commit, tag, push, publish, or modify the registry from this runbook. |

## 1. Protect V1 — minimal first batch (machine appendix A)

The user reports this batch complete on the current machine. The instructions remain the
required re-run/audit procedure on a fresh machine and the source of the recorded
`V1_PROTECTED` evidence. They protect the installed OC1 TUI and CLI from a future V3
build. Run each block in a clean shell that you normally use for OC1, inspect every
output, and stop on any unexpected path. Do not paste the blocks into one unattended
script.

### 1.1 Confirm a clean OC1 shell and inspect the current machine

The shell must not export OC2 isolation variables. This check prints variable names,
not their values.

```bash
bash -c '
  bad=0
  for name in OPENCODE_CONFIG_DIR XDG_CONFIG_HOME XDG_DATA_HOME XDG_CACHE_HOME XDG_STATE_HOME; do
    value="${!name-}"
    case "$value" in
      *opencode2*) printf "STOP: %s points at OC2\n" "$name"; bad=1 ;;
    esac
  done
  if [ -n "${OPENCODE_CONFIG_DIR-}" ]; then
    printf "STOP: OPENCODE_CONFIG_DIR is set; use a clean OC1 shell\n"
    bad=1
  fi
  [ "$bad" -eq 0 ] && printf "clean for OC1\n"
'
```

If this prints `STOP`, close the shell, remove the OC2 exports from shell startup files
for this session, and start a fresh shell. Do not print the values of environment
variables.

Record the current command resolution and OC1 version:

```bash
command -v opencode
/home/lutz/.opencode/bin/opencode --version
ls -ld /home/lutz/lprojekte /home/lutz/.local/bin /home/lutz/.opencode/bin
ls -ld /home/lutz/.config/opencode /home/lutz/.config/opencode/kiki
```

Expected: `command -v opencode` resolves to the OC1 installation, normally
`/home/lutz/.opencode/bin/opencode`. If a wrapper already exists, or the path differs,
stop and record the baseline instead of overwriting anything.

### 1.2 Mandatory collision, parent and symlink checks

Each target must be absent unless this section says otherwise. A failed check means
**stop and review**, not delete and retry.

```bash
for path in /home/lutz/lprojekte/kiki-v1 /home/lutz/.local/bin/kiki-v1; do
  if [ -e "$path" ] || [ -L "$path" ]; then
    printf "STOP collision: %s already exists\n" "$path"
  else
    printf "absent: %s\n" "$path"
  fi
done
```

```bash
test -d /home/lutz/lprojekte && echo "parent present: /home/lutz/lprojekte"
test -d /home/lutz/.local/bin && echo "parent present: /home/lutz/.local/bin"
test -d /home/lutz/.opencode/bin && echo "parent present: /home/lutz/.opencode/bin"
test -d /home/lutz/.config/opencode/kiki && echo "loader parent present"
```

```bash
git -C /home/lutz/lprojekte/kiki worktree list
git -C /home/lutz/lprojekte/kiki rev-parse --show-toplevel
readlink -f /home/lutz/lprojekte/kiki
```

The worktree list must not already contain `kiki-v1`. The real path of the development
checkout must remain `/home/lutz/lprojekte/kiki`.

### 1.3 Verify the existing freeze tag; do not recreate it

The tag is already done. These are read-only checks.

```bash
git -C /home/lutz/lprojekte/kiki rev-parse 'v2.4.0^{commit}'
# expected: e2bf396df5a14657f34f55c78b31819be10b9c05
git -C /home/lutz/lprojekte/kiki rev-parse v2.4.0
# expected tag object: 92a7f1918e68afd29931818fb6c33efcff4e3f92
git -C /home/lutz/lprojekte/kiki cat-file -t v2.4.0
# expected: tag
```

Do **not** run `git tag`, `git tag -f`, `git push`, or any tag cleanup command. The
plan's earlier status text and the spec's "missing tag" wording are superseded by this
verified tag.

### 1.4 Create the frozen V1 worktree at the verified commit

Only after §1.2 and §1.3 pass:

```bash
git -C /home/lutz/lprojekte/kiki worktree add --detach \
  /home/lutz/lprojekte/kiki-v1 \
  e2bf396df5a14657f34f55c78b31819be10b9c05
```

Verify the new checkout is the frozen commit and is clean:

```bash
git -C /home/lutz/lprojekte/kiki-v1 rev-parse HEAD
# expected: e2bf396df5a14657f34f55c78b31819be10b9c05
git -C /home/lutz/lprojekte/kiki-v1 status --short
# expected: no output
git -C /home/lutz/lprojekte/kiki worktree list
readlink -f /home/lutz/lprojekte/kiki-v1
# expected: /home/lutz/lprojekte/kiki-v1
```

If the target already exists or is a symlink, stop. Do not remove and recreate an
existing checkout without explicit review.

### 1.5 Install and build only the frozen checkout

Never run `npm ci` or `npm run build` in `/home/lutz/lprojekte/kiki` for this batch.

```bash
( cd /home/lutz/lprojekte/kiki-v1 && pwd )
# expected: /home/lutz/lprojekte/kiki-v1
```

```bash
( cd /home/lutz/lprojekte/kiki-v1 && npm ci && npm run build )
```

Registry/authentication setup is human-owned. Do not let an agent read credential-bearing
npm configuration. If `npm ci` fails, stop; do not fall back to installing in the
development checkout.

Verify the build:

```bash
test -f /home/lutz/lprojekte/kiki-v1/dist/cli/index.js
test -f /home/lutz/lprojekte/kiki-v1/dist/tui/index.js
node -p "require('/home/lutz/lprojekte/kiki-v1/package.json').version"
# expected: 2.4.0
node /home/lutz/lprojekte/kiki-v1/dist/cli/index.js --help >/dev/null
printf 'frozen CLI help exit: %s\n' "$?"
```

### 1.6 Create the `kiki-v1` wrapper

Use the inherited OC1 environment. The wrapper intentionally does **not** export or
remove any isolation variable.

```bash
test ! -e /home/lutz/.local/bin/kiki-v1
test ! -L /home/lutz/.local/bin/kiki-v1
umask 022
cat > /home/lutz/.local/bin/kiki-v1 <<'EOF'
#!/bin/sh
exec node /home/lutz/lprojekte/kiki-v1/dist/cli/index.js "$@"
EOF
chmod 0755 /home/lutz/.local/bin/kiki-v1
```

Verify the wrapper and PATH resolution:

```bash
sed -n '1,5p' /home/lutz/.local/bin/kiki-v1
test -x /home/lutz/.local/bin/kiki-v1
command -v kiki-v1
# expected: /home/lutz/.local/bin/kiki-v1
kiki-v1 --help >/dev/null
printf 'kiki-v1 help exit: %s\n' "$?"
```

If `command -v kiki-v1` resolves anywhere else, stop and fix PATH ordering before
continuing.

**Inherited-environment safety:** `kiki-v1` runs with the caller's environment. It
does not set `XDG_CONFIG_HOME`, `OPENCODE_CONFIG_DIR`, `XDG_DATA_HOME`,
`XDG_CACHE_HOME` or `XDG_STATE_HOME`. Run it only from a clean OC1 shell. Never export
OC2 roots globally or invoke V1 fallback commands from an OC2-exporting shell.

### 1.7 Back up and repoint the non-secret V1 TUI loader

The installed OC1 TUI loader currently points at the development checkout's `dist`.
A future V3 build would overwrite that target and make OC1 load V3 TUI code. The loader
is non-secret. Back up **only this loader file**; do not back up or copy
`opencode.json`, `tui.json`, `.env`, `auth.json` or provider configuration.

```bash
loader=/home/lutz/.config/opencode/kiki/tui.js
backup=/home/lutz/.config/opencode/kiki/tui.js.pre-v1-protect.$(date +%Y%m%dT%H%M%S).bak
test -f "$loader"
test ! -L "$loader"
test ! -e "$backup"
sed -n '1,15p' "$loader"
cp -p "$loader" "$backup"
chmod 0600 "$backup"
printf 'loader backup: %s\n' "$backup"
```

The inspected loader must be a regular file whose target is the development checkout,
normally:

```js
export { default } from "file:///home/lutz/lprojekte/kiki/dist/tui/index.js";
```

If the file is a symlink or has unexpected content, stop and record it; do not
overwrite an unknown loader.

Create the replacement with the same mode and install it only after the backup exists:

```bash
loader=/home/lutz/.config/opencode/kiki/tui.js
tmp=/home/lutz/.config/opencode/kiki/tui.js.v1-protect.$$
mode=$(stat -c '%a' "$loader")
test ! -e "$tmp"
printf '%s\n' "export { default } from 'file:///home/lutz/lprojekte/kiki-v1/dist/tui/index.js';" > "$tmp"
chmod "$mode" "$tmp"
test -s "$tmp"
mv "$tmp" "$loader"
```

Verify the loader no longer targets the development checkout:

```bash
sed -n '1,5p' /home/lutz/.config/opencode/kiki/tui.js
grep -F "file:///home/lutz/lprojekte/kiki-v1/dist/tui/index.js" \
  /home/lutz/.config/opencode/kiki/tui.js
if grep -F "file:///home/lutz/lprojekte/kiki/dist/tui/index.js" \
  /home/lutz/.config/opencode/kiki/tui.js; then
  printf 'STOP: loader still targets the development checkout\n'
fi
```

### 1.8 Restart V1 and smoke-test version, paths and `/kiki`

Record metadata only; do not read configuration values.

```bash
/home/lutz/.opencode/bin/opencode --version
command -v opencode
for file in /home/lutz/.config/opencode/opencode.json /home/lutz/.config/opencode/opencode.jsonc; do
  if [ -f "$file" ]; then stat -c '%n %s %Y' "$file"; fi
done
```

Launch OC1 directly from its binary in a scratch directory so PATH and wrapper
ambiguity cannot hide a problem:

```bash
mkdir -p /tmp/kiki-v1-smoke
( cd /tmp/kiki-v1-smoke && /home/lutz/.opencode/bin/opencode )
```

In the TUI:

1. Run `/kiki`.
2. Confirm the menu opens with the German labels and agent/model list.
3. Press Escape or cancel before selecting and saving a model.
4. Quit OpenCode.

The menu must make no LLM request, and no model or permission setting may be saved.
After quitting, compare the metadata recorded above. Also record whether an OC1
`cli.json` already existed; do not delete it if it did.

```bash
for file in /home/lutz/.config/opencode/opencode.json /home/lutz/.config/opencode/opencode.jsonc; do
  if [ -f "$file" ]; then stat -c '%n %s %Y' "$file"; fi
done
if [ -e /home/lutz/.config/opencode/cli.json ]; then
  printf 'baseline: cli.json exists in OC1 config; record, do not delete\n'
else
  printf 'baseline: no cli.json in OC1 config\n'
fi
```

A failed menu smoke is a blocker. Stop and report it. Do not restore the §1.7
pre-detachment backup; repair the frozen target using the §1.7 repoint steps, repeat the
loader target check, and repeat this smoke. Keep the backup for diagnosis only.

### 1.9 Record the `V1_PROTECTED` checkpoint

Do not proceed to Task 2 until all of these are true and recorded in the human's task
notes. Do not include secret values.

```text
V1_PROTECTED
date:
operator:
OC1 version:
OC1 binary path:
`opencode` resolution:
`kiki-v1` resolution:
frozen worktree path:
frozen worktree HEAD: e2bf396df5a14657f34f55c78b31819be10b9c05
frozen package version: 2.4.0
frozen CLI help exit:
frozen build exit:
loader backup path:
loader new target:
`/kiki` menu smoke (pass/fail):
OC1 config metadata before/after:
pre-existing OC1 cli.json (yes/no):
unexpected paths or blockers:
```

Pass criteria:

- `v2.4.0` still resolves to the verified commit and was not recreated or pushed.
- `kiki-v1` is a regular executable in `/home/lutz/.local/bin`, resolves first, and
  runs the frozen `dist/cli/index.js`; the old checkout-driven Kiki CLI is no longer
  used for real work.
- The V1 TUI loader is a regular file targeting
  `file:///home/lutz/lprojekte/kiki-v1/dist/tui/index.js`, with a recorded backup.
- OC1 restarts after detachment and `/kiki` opens and cancels without saving.
- No V3 build, OC2 install, live default switch, commit, tag or push occurred.

## 2. Why V1 must be detached, not merely copied

OC1 and OC2 both use the OpenCode application name for their roots. With the tagged
upstream layout, each generation derives config, data, cache and state from XDG
variables and appends `opencode`; `OPENCODE_CONFIG_DIR` overrides the config directory
only. That creates four independent collision risks if both generations inherit the
same environment:

| Root | OC1 default | OC2 default | Required isolated OC2 value |
|---|---|---|---|
| Config | `$XDG_CONFIG_HOME/opencode` | same | `OPENCODE_CONFIG_DIR=.../config/opencode` and `XDG_CONFIG_HOME=.../config` |
| Data | `$XDG_DATA_HOME/opencode` | same | `XDG_DATA_HOME=.../data` |
| Cache | `$XDG_CACHE_HOME/opencode` | same | `XDG_CACHE_HOME=.../cache` |
| State | `$XDG_STATE_HOME/opencode` | same | `XDG_STATE_HOME=.../state` |

The config directory is especially dangerous: both generations would auto-discover
plugins from the same directory, and both would write the same project/session data if
data/cache/state were shared. A wrapper that sets only `OPENCODE_CONFIG_DIR` leaves
data, cache and state shared. A wrapper that sets only XDG roots but not
`OPENCODE_CONFIG_DIR` may still be overridden by an inherited variable.

The installed OC1 TUI loader adds a second, independent problem: it currently imports
`file:///home/lutz/lprojekte/kiki/dist/tui/index.js`. Creating `kiki-v1` does not change
that loader. Before any V3 build overwrites `dist/`, the loader must be repointed at the
frozen checkout. Repointing the CLI alone is insufficient because the TUI is loaded
through the separate loader file and requires an OpenCode restart.

The development checkout remains on `feat/global-kiki-updates`; no implementation
worktree is created. The frozen worktree is the only separate checkout.

**Wrapper inherited-environment safety:** `kiki-v1` and `opencode-v1` deliberately
inherit the caller's environment so OC1 behaves exactly as before. They must be run
from a clean OC1 shell. Do not put OC2 isolation exports in shell startup files. Do not
run fallback commands from a shell that exports OC2 roots.

## 3. Checkpoints and gates

| Checkpoint | Meaning | Required evidence | Current state |
|---|---|---|---|
| `V1_PROTECTED` | OC1 binary/CLI/TUI are detached from the moving checkout | §1.9 checklist complete | **Human-reported complete:** loader backup recorded, frozen target and `/kiki` menu smoke passed |
| `OC2_ISOLATED` | OC2 2.2.6 installed and verified against separate roots | §5.3 checks complete; user-owned login separate | **Human-reported §5.3 complete:** V1/V2 start, version/PATH/wrappers verified; login not inferred |
| `TEST_BINARY_READY` | Human supplied an absolute OC2 2.2.6 binary for tests | Path recorded; version exactly 2.2.6 | **Required tests used `/home/lutz/.opencode/bin/opencode`, exactly 2.2.6** |
| `ACTUAL_V3_VALIDATION` | Real V3 checkout/build/package evidence | Final Task 13 input/dist/tarball/pack manifests, required/full suites, fresh audit | **PASS (automated, final snapshot):** tarball `952be150…`, input `74bccc17…`, dist `f0da220c…`, pack `14005d97…`; 24/24 required zero skips; 632/2/0 with binary; audit 0 high/critical, 32 moderate, no exception |
| `RELEASE_REHEARSAL` | Synthetic 2.4.0→3.0.0 release-path rehearsal | Task 13 run8 evidence: six real gates, no apply, private synthetic Git, source immutability, candidate hashes match actual | **PASS (synthetic)** |
| `FUTURE_RELEASE_AUTHORIZATION` | Actual release procedure and permission | Separate user authorization | **NOT RUN** |
| `KIKI_LIVE_MACHINE_ACCEPTANCE` | Live Kiki 3.0.0 install, migration, provider login, dispatch and `/kiki` smoke | Task 14 evidence | **NOT RUN** |

`V1_PROTECTED`, `OC2_ISOLATED` and the test-binary prerequisite are human-reported.
`ACTUAL_V3_VALIDATION` is automated evidence; `RELEASE_REHEARSAL` is synthetic evidence.
Neither fills the actual-release or live-machine columns. The final whole-branch review
PASS is recorded in `.agentic/reviews/2026-11-09-kiki-oc2-final-review.md`. See
[`kiki-3-oc2-acceptance.md`](./kiki-3-oc2-acceptance.md).

## 4. Development-checkout safety rules for this phase

- Stay on `/home/lutz/lprojekte/kiki`, branch `feat/global-kiki-updates`.
- Do not create an implementation worktree.
- Do not run `npm ci`, `npm run build`, `npm test` or lint in the development checkout
  as part of Task 1.
- Do not clean, revert or commit the existing working-tree changes, including
  `.agentic/kiki/TASK_REGISTRY.json`, `.agentic/kiki/routing_log.jsonl`,
  `opencode.jsonc`, the plan, the spec or the review file.
- Do not recreate `v2.4.0`, create another tag, commit, push or open a pull request.
- Do not edit live OC1/OC2 configs, binaries, wrappers, defaults, secrets or registry
  files from this document.
- Do not run any V3 build, CLI command or TUI against the OC1 config. V3 work starts only
  after `V1_PROTECTED` and uses the isolated OC2 roots.
- Do not copy or print `.env`, `auth.json`, provider configuration or credential values.
  Presence checks are metadata-only.

Product implementation cannot start until the human reports `V1_PROTECTED`.

## 5. OC2 parallel-setup reference — human-run

**Stage reached:** the human reports §5.3 verification complete and both V1 and V2 start
successfully with the expected version, PATH and wrappers. This section is now the
human-run reference for that setup and for a fresh-machine repeat. It does not authorize
a live Kiki 3.0.0 install, migration, provider login or default-switch decision, and it
does not claim Task 14 acceptance. Do not rerun destructive moves or overwrite working
wrappers without reviewing the current state first.

### 5.1 Preconditions for the OC2 stage

- `V1_PROTECTED` recorded; on a fresh machine, complete §1 first.
- The user has reviewed the pinned OC2 install source or release artifact and approved
  the binary install and PATH/default changes.
- The user understands that the official installer writes `~/.opencode/bin/opencode`,
  the same path as the retained OC1 binary, so OC1 must be renamed first.
- No agent reads credentials or edits live configuration. Provider login is user-owned.
- The wrapper sets all five isolation variables. `OPENCODE_CONFIG_DIR` overrides only the
  config root; the four XDG roots remain required.

### 5.2 Install OC2 2.2.6 with separate roots (machine appendix B)

Check the retained binary name is absent before moving anything:

```bash
test ! -e /home/lutz/.opencode/bin/opencode-v1
test ! -L /home/lutz/.opencode/bin/opencode-v1
test -x /home/lutz/.opencode/bin/opencode
/home/lutz/.opencode/bin/opencode --version
test ! -e /home/lutz/.local/bin/opencode
test ! -L /home/lutz/.local/bin/opencode
test ! -e /home/lutz/.local/bin/opencode-v1
test ! -L /home/lutz/.local/bin/opencode-v1
```

Record the OC1 version. Then move OC1 aside under its retained name:

```bash
mv /home/lutz/.opencode/bin/opencode /home/lutz/.opencode/bin/opencode-v1
/home/lutz/.opencode/bin/opencode-v1 --version
# expected: the recorded OC1 version
```

Install OC2 exactly 2.2.6. Do not run an unreviewed `curl | bash` pipeline. Download the
installer to a file, inspect it, verify provenance/checksum from the official release
page if available, and only then run it:

```bash
installer=/tmp/opencode-v2-install-2.2.6.sh
test ! -e "$installer"
curl -fsSLo "$installer" https://opencode.ai/v2/install
# Human review: inspect the downloaded file and verify the pinned version/provenance.
less "$installer"
bash "$installer" --version 2.2.6 --no-modify-path
```

If the installer cannot be reviewed or its provenance cannot be verified, stop. Do not
substitute an unpinned install, a pipe-to-shell command, or a later version.

The installer requires **Bash**, not `sh`. If you already downloaded and reviewed
`/tmp/opencode-v2-install-2.2.6.sh` and preserved OC1 above, the exact install command is:

```bash
bash /tmp/opencode-v2-install-2.2.6.sh --version 2.2.6 --no-modify-path
```

There is no installer isolation flag: `--no-modify-path` only avoids shell startup
edits. Runtime isolation comes from the five environment variables in the wrapper
below. Do not launch the new binary interactively without that wrapper or the same
explicit environment.

Verify the installed binary:

```bash
test -x /home/lutz/.opencode/bin/opencode
/home/lutz/.opencode/bin/opencode --version
# expected: 2.2.6
```

Create the private roots after checking the target is not a symlink and recording any
existing content:

```bash
test ! -L /home/lutz/.opencode2
if [ -e /home/lutz/.opencode2 ]; then
  printf 'baseline: /home/lutz/.opencode2 exists; record it and do not delete\n'
fi
mkdir -p /home/lutz/.opencode2/config/opencode \
  /home/lutz/.opencode2/data \
  /home/lutz/.opencode2/cache \
  /home/lutz/.opencode2/state
ls -ld /home/lutz/.opencode2/config /home/lutz/.opencode2/data \
  /home/lutz/.opencode2/cache /home/lutz/.opencode2/state
```

Create the OC2 wrapper only if no wrapper already exists, or after reviewing the
existing one. It sets **both** `OPENCODE_CONFIG_DIR` and `XDG_CONFIG_HOME` so OC2 and
the Kiki CLI resolve the same isolated config directory; the XDG fallback and the
explicit override both point at `~/.opencode2/config/opencode`.

```bash
test ! -e /home/lutz/.local/bin/opencode
test ! -L /home/lutz/.local/bin/opencode
umask 022
cat > /home/lutz/.local/bin/opencode <<'EOF'
#!/bin/sh
export OPENCODE_CONFIG_DIR="$HOME/.opencode2/config/opencode"
export XDG_CONFIG_HOME="$HOME/.opencode2/config"
export XDG_DATA_HOME="$HOME/.opencode2/data"
export XDG_CACHE_HOME="$HOME/.opencode2/cache"
export XDG_STATE_HOME="$HOME/.opencode2/state"
exec "$HOME/.opencode/bin/opencode" "$@"
EOF
chmod 0755 /home/lutz/.local/bin/opencode
```

Create the OC1 passthrough wrapper with the inherited environment:

```bash
test ! -e /home/lutz/.local/bin/opencode-v1
test ! -L /home/lutz/.local/bin/opencode-v1
umask 022
cat > /home/lutz/.local/bin/opencode-v1 <<'EOF'
#!/bin/sh
exec "$HOME/.opencode/bin/opencode-v1" "$@"
EOF
chmod 0755 /home/lutz/.local/bin/opencode-v1
```

Ensure `~/.local/bin` precedes `~/.opencode/bin`, and check aliases/functions:

```bash
command -v opencode
command -v opencode-v1
type -a opencode
type -a opencode-v1
hash -r
```

Both wrapper paths must resolve in `/home/lutz/.local/bin`. If not, stop and fix PATH
ordering or remove the conflicting shell alias/function. Do not globally export the
isolation variables in shell startup files.

Before the first OC2 launch, create the isolated config only if it does not already
exist. If it exists, merge the two settings manually; never overwrite user config.

```bash
oc2config=/home/lutz/.opencode2/config/opencode/opencode.jsonc
test ! -L /home/lutz/.opencode2/config/opencode
test ! -e "$oc2config"
cat > "$oc2config" <<'EOF'
{
  "update": "disable",
  "experimental": {
    "subagent_depth": 1
  }
}
EOF
```

**Credentials:** After the authorized install, log in to providers inside the OC2 TUI.
Credentials belong in `~/.opencode2/data/opencode/`. Never copy OC1's `.env`,
`auth.json` or provider configuration, and never print key values. Kiki 3.0.0 will only
check credential presence and print instructions.

### 5.3 Verify separation (machine appendix C)

```bash
command -v opencode
command -v opencode-v1
opencode --version
# expected: 2.2.6
opencode-v1 --version
# expected: the recorded OC1 version
ls -ld /home/lutz/.opencode2/config/opencode \
  /home/lutz/.opencode2/data/opencode \
  /home/lutz/.opencode2/cache/opencode \
  /home/lutz/.opencode2/state/opencode
```

Some runtime subdirectories appear only after the first authorized OC2 launch. Do not
treat their temporary absence as a failure.

Record metadata before and after the first OC2 run for the OC1 config/data/cache/state.
Do not read contents, especially `auth.json`, `.env` or provider config:

```bash
for path in /home/lutz/.config/opencode \
  /home/lutz/.local/share/opencode \
  /home/lutz/.cache/opencode \
  /home/lutz/.local/state/opencode; do
  if [ -e "$path" ]; then stat -c '%n %s %Y' "$path"; fi
done
if [ -e /home/lutz/.config/opencode/cli.json ]; then
  printf 'baseline: OC1 cli.json exists; record it, do not delete\n'
else
  printf 'baseline: no OC1 cli.json\n'
fi
```

After the first OC2 run, repeat the metadata checks and confirm no new OC2 database,
auth file or `cli.json` appeared under the OC1 roots. Use the Task 2 verified
service-path command only if it exists; an unsupported command is not proof of
isolation.

### 5.4 Activate development Kiki 3.0.0 for Task 14 — human-run

This is the **next stage** and is **not run**. It requires the user's explicit live-write
authorization; do not run it from this documentation agent. The final automated actual
validation and synthetic rehearsal passed, but live Kiki installation, migration, provider
login and Task 14 acceptance do not exist until the human performs them.

Create the wrapper only if it is absent, or review an existing wrapper before replacing it.
It sets the same five isolation variables as `opencode` and executes the actual current
CLI from the development checkout:

```bash
test ! -e /home/lutz/.local/bin/kiki
test ! -L /home/lutz/.local/bin/kiki
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
command -v kiki
kiki --help
```

Then perform the global install and the first isolated diagnosis:

```bash
kiki install
kiki init /path/to/scratch-project   # interactive wizard; asks no model questions
kiki doctor /path/to/scratch-project
```

`kiki install` writes the eight native Kiki agent files, the workflow reference, the server
`plugins` registration and the `cli.json` TUI registration into the isolated OC2 config,
backing up existing Kiki-owned targets first. The development checkout registers its
absolute directory; a release registration form is valid only when a validated candidate
package is actually available. Do not assume a published `kiki@3.0.0` package, a GitHub
install target or a public uninstall command.

The user should also confirm, without sharing config contents, that the OC2 configuration
has `update: "disable"` and `experimental.subagent_depth: 1`, and that the wrapper and
`opencode` resolve the same isolated config root. Continue with §5.5 migration and §5.7
Task 14 workflow checks.

### 5.5 One-time Kiki configuration migration — human-run, live-write authorization required

Run this only after the human explicitly authorizes live OC2 writes. The migration
command never reads or copies credentials, but it must receive a **secret-free OC1
export**. Never point `--from` at a live credential-bearing configuration and never copy
`.env`, `auth.json` or provider configuration into that export.

Prepare the export yourself outside the agent, containing only the OC1
`opencode.json`/`opencode.jsonc` Kiki model and permission data with no `provider`,
`providers`, `auth` or `env` keys. Then, through the OC2 `kiki` wrapper (or with the same
five OC2 environment variables):

```bash
kiki migrate --from /path/to/sanitized-oc1-export
# Project-tier migration, when that project has local Kiki files to retire:
kiki migrate --project /path/to/project --from /path/to/sanitized-oc1-export
kiki doctor /path/to/scratch-project
```

Migration behavior and safety:

- The OC1 source is read-only and remains byte-identical. Only the OC2 destination (or
  the named project) is written.
- A source containing `provider`, `providers`, `auth` or `env` is refused **before any
  write**. A source/destination overlap or a destination that looks like OC1 is refused.
- Eligible models and permissions become native `agents.<id>.model` objects and ordered
  `permissions` arrays. Untranslatable permissions are rejected per agent, never dropped
  or defaulted to allow.
- On a per-agent conflict or rejection, the command exits non-zero and reports each
  agent and reason. Successfully translated agents may already have been written
  (partial success); no migration marker is written, and project-tier migration removes
  no local Kiki files. Correct the export or conflict and rerun.
- A fully successful run writes `.agentic/kiki/migration.json` (source, timestamp and
  Kiki version) in the destination/project. A later rerun fails closed at the marker;
  `--force` reruns with a fresh backup.
- Backups are written before changes under `kiki/backups/` globally or
  `.agentic/kiki/backups/` in a project, with restrictive permissions, a path manifest
  and a Git ignore rule.
- Non-Kiki agents and the user-owned `scientist` agent are reported by name for manual
  migration and are not imported. The scientist audit/port remains deferred.
- Provider login is separate and user-owned. Do not copy OC1 credentials. `doctor`
  reports credential presence only; it never reads or prints credential values.

### 5.6 Rollback (machine appendix E)

Choose an option and run it deliberately. Do not run rollback automatically, and do not
delete working databases or user sessions as part of a drill.

**Kiki-side rollback:** remove only known V3 Kiki agent files and plugin-list entries
using the backup manifest. Preserve V1, V2, unrelated config and project data. Do not
add an unsupported uninstall command.

**Machine rollback — preferred, non-destructive wrapper repoint.** This keeps the OC2
binary at `~/.opencode/bin/opencode` intact:

```bash
test -f /home/lutz/.local/bin/opencode
wrapper_backup="/home/lutz/.local/bin/opencode.pre-rollback.$(date +%Y%m%dT%H%M%S).bak"
test ! -e "$wrapper_backup"
cp -p /home/lutz/.local/bin/opencode "$wrapper_backup"
umask 022
cat > /home/lutz/.local/bin/opencode <<'EOF'
#!/bin/sh
exec "$HOME/.opencode/bin/opencode-v1" "$@"
EOF
chmod 0755 /home/lutz/.local/bin/opencode
opencode --version
# expected: the recorded OC1 version
```

The OC2 executable is still available at `~/.opencode/bin/opencode` for diagnosis or a
later return to OC2. To return to OC2, restore the recorded wrapper backup rather than
moving binaries.

**Binary swap alternative — only with all collision checks.** This preserves the OC2
executable as `opencode-v2` before restoring V1 to the default path. Never run the
plan's bare `mv ~/.opencode/bin/opencode-v1 ~/.opencode/bin/opencode`; that would
overwrite the OC2 executable.

**Required ordering:** remove or repoint the OC2 wrapper
`/home/lutz/.local/bin/opencode` **before** any bare OC1 binary swap. Otherwise that
wrapper would exec the newly swapped-in OC1 binary while still exporting OC2 roots,
which is the exact collision the isolation setup exists to prevent. Back up the wrapper
first, then perform the checked swap. Do not move, remove or overwrite
`~/.opencode/bin/opencode-v2`; it is the retained OC2 binary for diagnosis or return.

```bash
test -f /home/lutz/.local/bin/opencode
wrapper_backup="/home/lutz/.local/bin/opencode.pre-binary-swap.$(date +%Y%m%dT%H%M%S).bak"
test ! -e "$wrapper_backup"
cp -p /home/lutz/.local/bin/opencode "$wrapper_backup"
# Remove the OC2 wrapper, or repoint it to the intended V1 entrypoint, BEFORE swapping.
rm /home/lutz/.local/bin/opencode
hash -r

test -x /home/lutz/.opencode/bin/opencode
test -x /home/lutz/.opencode/bin/opencode-v1
test ! -e /home/lutz/.opencode/bin/opencode-v2
test ! -L /home/lutz/.opencode/bin/opencode-v2
mv /home/lutz/.opencode/bin/opencode /home/lutz/.opencode/bin/opencode-v2
mv /home/lutz/.opencode/bin/opencode-v1 /home/lutz/.opencode/bin/opencode
```

After the swap, the retained OC2 executable is still at
`~/.opencode/bin/opencode-v2`. Review the `opencode-v1` wrapper afterward; it still
points at `~/.opencode/bin/opencode-v1`, which no longer exists after the swap. Update or
remove that wrapper deliberately and refresh the shell command cache. Do not run an OC1
command through the removed OC2 wrapper or from a shell exporting OC2 roots.

**Keep the frozen V1 TUI target — do not restore the pre-detachment loader.** The loader
backup recorded in §1.7 is a diagnostic artifact only. Default rollback must **not** copy
it back: it points at `file:///home/lutz/lprojekte/kiki/dist/tui/index.js`, the moving
development checkout, and restoring it would undo `V1_PROTECTED`. There is no executable
restore path in this runbook. Re-coupling the loader to the development checkout would
require a separate review after that checkout is verifiably back at frozen 2.4.0.

Verify the frozen target is still installed:

```bash
loader=/home/lutz/.config/opencode/kiki/tui.js
test -f "$loader"
test ! -L "$loader"
test -f /home/lutz/lprojekte/kiki-v1/dist/tui/index.js
sed -n '1,5p' "$loader"
grep -F "file:///home/lutz/lprojekte/kiki-v1/dist/tui/index.js" "$loader"
if grep -F "file:///home/lutz/lprojekte/kiki/dist/tui/index.js" "$loader"; then
  printf 'STOP: loader points at the moving development checkout\n'
fi
```

If any check fails, stop and report the failure. Do not restore the §1.7 backup and do
not run OC1 against the development checkout.

After the chosen rollback option, repeat the version/PATH checks and the OC1 `/kiki`
menu smoke. Use the V1 entry point you verified for that option; if the wrapper is still
being repaired, launch `/home/lutz/.opencode/bin/opencode` directly.

```bash
hash -r
command -v opencode
# Preferred wrapper repoint:
opencode --version
# expected: the recorded OC1 version
# Binary swap alternative, if the wrapper is not yet repaired:
# /home/lutz/.opencode/bin/opencode --version
mkdir -p /tmp/kiki-v1-rollback-smoke
( cd /tmp/kiki-v1-rollback-smoke && opencode )
# Binary swap alternative:
# ( cd /tmp/kiki-v1-rollback-smoke && /home/lutz/.opencode/bin/opencode )
```

In the TUI: run `/kiki`, confirm the menu opens with German labels, cancel before saving,
and quit without making an LLM request or changing a model/permission. Then record the
post-rollback smoke result alongside the original `V1_PROTECTED` evidence.

Keep `~/.opencode2` for diagnosis. Deleting it is a separate destructive decision that
requires backing up user-owned sessions and credentials first. Do not delete it during
an acceptance drill. No freeze-tag operation or V1 database restore is needed if
isolation checks passed.

### 5.7 Task 14 human acceptance checklist — NOT RUN

All steps are **human-run** and require explicit live-write authorization. Do not let an
agent read live configs, credentials or `.env`. Record only non-secret outcomes.

```bash
command -v opencode
command -v opencode-v1
command -v kiki
opencode --version      # expected: 2.2.6
opencode-v1 --version   # expected: the recorded OC1 version
kiki install
kiki init /path/to/scratch-project   # interactive wizard; asks no model questions
kiki doctor /path/to/scratch-project
```

1. Confirm the OC2 `update: "disable"`, `experimental.subagent_depth: 1` and all five
   isolation variables without sharing file contents.
2. Prepare a **secret-free OC1 export yourself**; never point `--from` at the live
   config. Then run `kiki migrate --from /path/to/sanitized-oc1-export`, followed by
   `kiki doctor /path/to/scratch-project`. Correct a reported rejection and rerun rather
   than treating a partial success as complete.
3. Log in to providers inside the isolated OC2 TUI. Login stays user-owned; Kiki never
   reads or copies credentials.
4. Run one real `kiki-orchestrator` → `subagent` dispatch in a scratch project.
5. Exercise `/kiki` save and removal. Observe that selecting the already-effective
   inherited model is a conservative no-op (no write; unchanged toast); this is documented
   behavior, not an urgent decision.
6. Run `opencode-v1` + `kiki-v1` in a separate scratch project and smoke the V1 `/kiki`
   menu.
7. Rehearse Kiki cleanup and the preferred wrapper-repoint rollback on a throwaway OC2
   config copy. Do not delete working databases or `~/.opencode2`; keep the frozen V1 TUI
   target.
8. Record versions, paths, check outcomes and smoke results, then choose
   **ACCEPT/SWITCH**, **RETAIN OC1**, or **ROLLBACK**. Task 14 remains NOT RUN until this
   evidence exists.

## 6. Reconciliation and flagged inconsistencies

These are recorded rather than silently changing approved behavior or product design.

1. **Freeze tag is already done.** The plan and spec contain stale wording about
   creating or missing `v2.4.0`. This runbook treats the tag as complete, verifies the
   peeled target, and never creates, pushes or cleans up the tag.
2. **Execution location is the current checkout.** The approved amendment forbids
   switching to `main` or creating an implementation worktree. The separate `kiki-v1`
   worktree remains mandatory for the installed OC1 loader.
3. **All five isolation variables are required.** The design wrapper examples set
   `OPENCODE_CONFIG_DIR` plus data/cache/state, but not `XDG_CONFIG_HOME`. The current
   V1 CLI's `globalDirectory()` reads `XDG_CONFIG_HOME` only. The OC2 and future `kiki`
   wrappers therefore set `OPENCODE_CONFIG_DIR`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`,
   `XDG_CACHE_HOME` and `XDG_STATE_HOME`, with the config override and XDG config root
   pointing at the same directory. `kiki-v1`/`opencode-v1` inherit a clean OC1
   environment and set none of them. If a wrapper omits one of the five, do not deploy
   it until resolution has been re-verified against the tagged upstream and fixtures.
4. **The plan's OC2 install uses a pipe-to-shell command.** It is not executed by any
   agent here. This runbook requires downloading the installer, human review and
   pinned-version/provenance verification before execution. If that cannot be done,
   stop rather than recommend an unreviewed command.
5. **The plan's rollback command would overwrite the OC2 executable.** The bare
   `mv ~/.opencode/bin/opencode-v1 ~/.opencode/bin/opencode` is replaced above with a
   wrapper repoint or a checked binary swap that first moves V2 to `opencode-v2`.
6. **The OC2 binary prerequisite is reported satisfied for this machine.** The human
   reports V1/V2 start successfully and the version/PATH/wrapper separation checks pass.
   Task 11 and Task 13 used the absolute binary `/home/lutz/.opencode/bin/opencode`, which
   reported exactly `2.2.6`; the harness refuses any other version. This is a test
   prerequisite and does not establish a live Kiki 3.0.0 installation, migration or
   Task 14 acceptance.
7. **Same app name means real collision risk.** Both generations derive roots from the
   `opencode` suffix. `OPENCODE_CONFIG_DIR` isolates config only; data/cache/state need
   separate XDG roots. Project-local `.opencode/` and ancestor `opencode.json(c)` files
   are shared by design and are not isolated by these machine variables.
8. **Working tree is intentionally not clean.** Existing tracked changes and untracked
   plan/spec/review files are preserved. Do not clean, revert or commit them as part of
   this runbook.
9. **Documentation claims remain bounded.** Task 1 did not update README/CHANGELOG;
   Task 12 documented the tested OC2 usage, and this final revision records Task 13's
   actual-validation PASS, fresh audit (0 high/critical, 32 moderate, no exception) and
   synthetic rehearsal PASS. The docs do not claim a live Kiki 3.0.0 install, live
   migration, provider login, future release authorization or Task 14 acceptance, and
   they do not assume a published package or public uninstall command exists.
10. **Rollback retains the frozen V1 TUI target.** The pre-detachment loader backup from
    §1.7 is diagnostic only and is never restored by default. Restoring it would re-point
    OC1 at the moving development checkout and would invalidate `V1_PROTECTED`. Rollback
    therefore verifies the `kiki-v1` target and repeats the OC1 `/kiki` smoke instead,
    matching plan appendix E's instruction to keep `kiki-v1` and its detached TUI target.
11. **Migration requires a secret-free export.** §5.5 permits `--from` only for a
    human-prepared sanitized OC1 export. Live credential-bearing config, `.env`,
    `auth.json` and provider settings are never read or copied. Per-agent rejection is
    fail-closed with partial-success reporting; the marker and `--force` backup behavior
    are documented rather than treated as a retry shortcut.
12. **Prompt bodies use the V1-equivalent baseline.** `kiki install`/`kiki update`
    regenerate Kiki-owned native Markdown prompt bodies and back up the previous files;
    config models and existing frontmatter permissions are preserved. This adds no new
    feature and is not a migration blocker. Preserving user edits to those global bodies
    would be a separate post-switch ownership change for the user to request. Project-local
    agent Markdown overrides remain separate.
13. **Same-model `/kiki` selection is a documented no-op.** Selecting the currently
    effective inherited model writes nothing and leaves the existing toast text unchanged.
    This conservative behavior is accepted; it can be observed in Task 14 and is not an
    urgent decision.

## 7. Documentation validation

The historian validates the final Task 12/13 documents with the repository's read-only verifier:

```bash
node dist/cli/index.js verify docs/migrations/kiki-3-oc2-parallel.md
node dist/cli/index.js verify docs/migrations/kiki-3-oc2-api-contract.md
node dist/cli/index.js verify docs/migrations/kiki-3-oc2-acceptance.md
node dist/cli/index.js verify README.md
node dist/cli/index.js verify CHANGELOG.md
```

The verifier reads only the named Markdown file; it does not need a build, an OpenCode
installation, a live config root or credentials. The final documentation report records
the actual exit results. The reviewer also checks that:

- every machine command is labelled human-run and staged; automated evidence is labelled
  separately from human-run/checkpoint evidence;
- no tag creation, cleanup, commit, push, install, registry update or public-uninstall
  instruction is embedded;
- no secret copying or credential reading is recommended; migration uses a sanitized
  export only;
- V3 builds occur only in `/home/lutz/lprojekte/kiki` after `V1_PROTECTED`;
- the OC2 section clearly records the human-reported setup stage without claiming a live
  Kiki 3.0.0 install, migration, provider login or Task 14 acceptance;
- rollback preserves the OC2 executable as `opencode-v2`, explicitly removes or repoints
  the OC2 wrapper **before** any bare binary swap, and keeps the frozen `kiki-v1` TUI
  target instead of restoring the moving-checkout loader;
- the acceptance table keeps ACTUAL_V3_VALIDATION (PASS, final snapshot),
  RELEASE_REHEARSAL (PASS, synthetic) and FUTURE_RELEASE_AUTHORIZATION (NOT RUN)
  separate, with Task 14 live acceptance explicitly NOT RUN.
