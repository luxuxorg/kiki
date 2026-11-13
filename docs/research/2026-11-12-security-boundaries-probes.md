# Security Boundaries — OpenCode 2.x Runtime Probes

**Date:** 2026-11-12 (fix round 1: ancestor isolation and Task 4 correlation
evidence added)
**Plan:** `docs/superpowers/plans/2026-11-12-security-boundaries-plan.md` (Task 1)
**Observed runtime:** OpenCode **2.2.7** (`/home/lutz/.opencode/bin/opencode`, reported by `opencode --version`)
**Test:** `tests/integration/oc2-security-boundaries.test.ts`
**Evidence source:** `[security-boundary-probe]` records emitted by the test and the
Vitest run log. Only behavior actually observed in those runs is recorded here;
unmeasured behavior is listed under **PENDING** and is not asserted as fact.

> **Historical gate position (Task 1 run):** Task 1 was NOT PASSED at that time.
> Measured runtime enforcement passed (below), while the then-proposed generated
> policy was **RED as designed** (expected until Task 2). Later tasks implemented
> and tested the source; alternate-route runtime evidence was measured under
> Task 3 (§5.3). Human/TUI, long-wait and watchdog-while-waiting evidence remain
> **PENDING** and block the related rollout gates.
>
> **Policy correction (2026-11-13):** the shipped generated policy was corrected
> after these probes. All eight roles now get `allow shell *` first, 18
> publishing/remote-changing `ask` rules, then five force-push `deny` rules.
> The ask-gate configurations in §3 are **probe fixtures** that measure runtime
> semantics (ask/reject, saved grants, scanner limits, precedence); they are not
> the current shipped policy. The measurements remain valid for those semantics,
> but §3.1's `ask shell *` fixture no longer describes Kiki behavior, and unknown
> local commands now run under the allow instead of asking. `kiki update`
> refreshed the active global prompts with the no-circumvention line.

---

## 1. Purpose and scope

Task 1 probes an available OpenCode 2.x runtime before choosing permission
shapes. The probes answer:

- Which permission schema does OpenCode 2.2.7 enforce (V2 `permissions` vs V1
  `permission.bash`)?
- What precedence applies across agent, project, ancestor and global config?
- Do exact command grants match only the exact command?
- What happens to an `ask` in a headless run, and are writes attempted?
- How do `once`, `Always` (saved grant) and `reject` behave across runs?
- Where is the boundary between a permission **ask** and a **scanner error**?

Out of scope: adversarial containment, credentials, live publishing, real
hosting clients, Windows-side separation, and long-wait/watchdog evidence
(deferred to Task 4 and to separately authorized human probes).

---

## 2. Isolation and configuration

Each probe ran in a disposable fixture created by
`createOC2Fixture()` / `fixtureEnv()`:

- Fresh `mkdtemp` root with isolated `HOME`, `TMPDIR`, `XDG_CONFIG_HOME`,
  `XDG_DATA_HOME`, `XDG_CACHE_HOME`, `XDG_STATE_HOME` and
  `OPENCODE_CONFIG_DIR`; the caller's auth, provider and unrelated
  `OPENCODE_*` variables are not inherited.
- `OPENCODE_DISABLE_AUTOUPDATE=true` and
  `OPENCODE_DISABLE_MODELS_FETCH=true`.
- Loopback-only fixture provider (`startFixtureProvider`) serving a
  deterministic `bash` tool call; no model API or network egress.
- PATH-shimmed local stubs (`stub-safe`, `stub-net`, `stub-ssh`, `stub-curl`,
  `stub-deploy`, plus a `git` shim) that append to a counter directory. The
  `git` shim records `status`/`push` and **refuses every push**.
- A local bare repository (`remote.git`) exists only to observe push attempts;
  no remote is contacted.
- Probes run with `opencode run --standalone --format json --agent
  security-probe`; `--auto` is added only where the scenario is labeled
  headless auto-approval.
- Saved-grant scenarios drive native replies through a local plugin using
  `ctx.permission.reply({ sessionID, requestID, decision })`; this is the
  native permission reply path, **not** the TUI (see PENDING).
- Scope files: global = isolated `OPENCODE_CONFIG_DIR/opencode.jsonc`; project =
  `project/opencode.jsonc`; ancestor = `opencode.jsonc` at the fixture root
  (the parent of `project/`).

**Decision vocabulary** (from the test's `observe()`):

| Decision | Meaning |
|---|---|
| `executed` | Tool part completed; the stub ran. |
| `ask-rejected` | Permission was requested and auto-rejected in headless mode. |
| `tool-removed` | Deny removed the tool; the model could not invoke it. |
| `scanner-error` | Portable shell scanner refused to analyze the command (not an ask). |
| `rejected-other` | Non-zero run whose tool error matched no known class (used for native `reject`). |
| `no-tool-event` | No tool event observed. |

**Stub count** is the number of recorded stub invocations. Zero is meaningful
only alongside the positive controls in §3.1 and §3.4.

---

## 3. PASS — measured runtime evidence (OpenCode 2.2.7)

### 3.1 Ask gate: unknown/network commands reject with zero writes

Configuration: `V2 permissions`: `[{ action: shell, resource: '*', effect: ask },
{ action: shell, resource: 'stub-safe', effect: allow }]`.

| Scenario | Version | Configuration | Decision | Stub count |
|---|---|---|---|---|
| gate/allowed-control (`stub-safe`) | 2.2.7 | ask `shell *`; allow exact `stub-safe` | `executed` | safe=1 |
| gate/`stub-net` | 2.2.7 | same | `ask-rejected` | net=0 |
| gate/`stub-ssh` | 2.2.7 | same | `ask-rejected` | ssh=0 |
| gate/`stub-curl` | 2.2.7 | same | `ask-rejected` | curl=0 |
| gate/`stub-deploy` | 2.2.7 | same | `ask-rejected` | deploy=0 |
| gate/`git push <bare> HEAD:refs/heads/main` | 2.2.7 | same | `ask-rejected` | git-push=0 |

Observed headless ask behavior: stderr contains
`permission requested: shell (...); auto-rejecting`, the tool error contains
`cannot ask the user for permission`, the command is not executed. After all
rejections the local bare repository had no refs. The allowed positive control
executed exactly once, so the zero counters are not vacuous.

### 3.2 Schema enforcement: V2 enforced, V1 ignored

| Scenario | Version | Configuration | Decision | Stub count |
|---|---|---|---|---|
| shape/v2-agent-allow | 2.2.7 | agent `permissions: [allow shell *]` | `executed` | safe=1 |
| shape/v2-agent-ask | 2.2.7 | agent `permissions: [ask shell *]` | `ask-rejected` | safe=0 |
| shape/v2-agent-deny-auto | 2.2.7 | agent `permissions: [deny shell *]`, `--auto` | `tool-removed` | safe=0 |
| shape/v1-agent-bash-allow | 2.2.7 | agent V1 `permission: { bash: allow }` | `executed` | safe=1 |
| shape/v1-agent-bash-ask | 2.2.7 | agent V1 `permission: { bash: ask }` | `executed` | safe=1 |
| shape/v1-agent-bash-deny-auto | 2.2.7 | agent V1 `permission: { bash: deny }`, `--auto` | `executed` | safe=1 |

**Finding:** On 2.2.7 the agent `permissions` array is enforced. The V1
`permission.bash` agent block is **ignored** for allow, ask and deny — including
deny under `--auto`. Generated V1 blocks therefore provide no runtime
protection on this version.

### 3.3 Precedence and rule ordering

The ancestor-only and ancestor-vs-global controls were added in fix round 1;
each row is one isolated fixture running only `stub-safe`.

| Scenario | Version | Configuration | Decision | Stub count |
|---|---|---|---|---|
| shape/global-ask-agent-allow | 2.2.7 | global ask; agent allow | `executed` | safe=1 |
| shape/global-allow-agent-ask | 2.2.7 | global allow; agent ask | `ask-rejected` | safe=0 |
| shape/project-ask-global-allow | 2.2.7 | global allow; project ask | `ask-rejected` | safe=0 |
| shape/project-allow-global-ask | 2.2.7 | global ask; project allow | `executed` | safe=1 |
| shape/ancestor-ask-only | 2.2.7 | ancestor ask; no project/agent rules | `ask-rejected` | safe=0 |
| shape/ancestor-ask-global-allow | 2.2.7 | global allow; ancestor ask | `ask-rejected` | safe=0 |
| shape/ancestor-allow-global-ask | 2.2.7 | global ask; ancestor allow | `executed` | safe=1 |
| shape/ancestor-ask-project-allow | 2.2.7 | ancestor ask; project allow | `executed` | safe=1 |
| shape/ancestor-allow-project-ask | 2.2.7 | ancestor allow; project ask | `ask-rejected` | safe=0 |
| shape/agent-ask-project-allow | 2.2.7 | project allow; agent ask | `ask-rejected` | safe=0 |
| shape/agent-allow-project-ask | 2.2.7 | project ask; agent allow | `executed` | safe=1 |
| shape/rules-ask-then-allow-prefix | 2.2.7 | rules `[ask, allow stub-safe*]` | `executed` | safe=1 |
| shape/rules-allow-prefix-then-ask | 2.2.7 | rules `[allow stub-safe*, ask]` | `ask-rejected` | safe=0 |

**Findings (measured pairs only; no four-level total order is claimed):**

- **agent > global** — both directions: global ask + agent allow executes,
  global allow + agent ask rejects.
- **agent > project** — both directions: project allow + agent ask rejects,
  project ask + agent allow executes.
- **project > global** — both directions: global allow + project ask rejects,
  global ask + project allow executes.
- **ancestor > global** — both directions: global allow + ancestor ask rejects,
  global ask + ancestor allow executes.
- **The ancestor config is read when it is the nearest config.** The
  ancestor-only control (`ancestor ask`, no project/agent rules) rejects, ruling
  out the earlier "ancestor config files are never read" hypothesis for this
  case.
- **Project decisions are observed over the ancestor file** (`ancestor ask` +
  project allow executes; `ancestor allow` + project ask rejects). The probe
  still cannot distinguish **project overrides ancestor** from **only the
  nearest config is loaded when a project config exists**; both hypotheses
  produce these outcomes. This document therefore records the measured pairs
  above and does **not** assert `project > ancestor` as a separate total-order
  link.
- Within one ruleset, the **last matching rule wins** (not first-match, not
  most-specific).
- Broadening is possible: `stub-safe*` matched `stub-safe`, and the saved grant
  proposed `stub-safe *` (see §3.4).

### 3.4 Saved grants: `once`, `Always`, `reject`

Configuration: ask `shell *`; reply delivered once through the native
permission API; the second run uses the same config **without** the reply
plugin.

| Scenario | Version | Configuration | First run | Second run | Stub count (second) |
|---|---|---|---|---|---|
| saved-grant/once | 2.2.7 | ask `shell *`; native reply `once` | `executed` (safe=1) | `ask-rejected` | 0 |
| saved-grant/always | 2.2.7 | ask `shell *`; native reply `always` | `executed` (safe=1) | `executed`, no ask | safe=1 |
| saved-grant/reject | 2.2.7 | ask `shell *`; native reply `reject` | `rejected-other`, exit 1, tool error `declined` | `ask-rejected` | 0 |

Request details observed for every reply scenario: asked `action` = `shell`,
`resources` = `["stub-safe"]`, proposed saved pattern `save` =
`["stub-safe *"]`.

**`permission.asked` payload sample** (one native `always` request, retained for
Task 4 correlation; volatile IDs redacted):

```json
{
  "action": "shell",
  "resources": ["stub-safe"],
  "save": ["stub-safe *"],
  "source": { "type": "tool", "messageID": "<redacted-message>", "id": "call_0" },
  "id": "<redacted-request>",
  "sessionID": "<redacted-session>"
}
```

**Persisted grant (measured, `always` only):**

- Location: `$XDG_DATA_HOME/opencode/opencode.db` (fixture-relative
  `data/opencode/opencode.db`), SQLite table `permission`.
- Row: `{ id: "psv_…", project_id: "<fixture-project-hash>", action: "shell",
  resource: "stub-safe *", time_created, time_updated }`.
- Correlation: the `permission.asked` `id` is **not** the persisted
  `permission.id` (measured `requestIdMatchesPersistedId: false`). The asked
  `source.messageID` did match a `session_message.id` containing the tool call
  (measured `sourceMessageIdMatchesSessionMessageId: true`). Task 4 must
  correlate by `action` + `resource` (and `project_id`), not by assuming the
  asked request ID equals the persisted grant ID.
- `once` and `reject` were not decoded at the store level; their
  non-persistence is established behaviorally by the second run asking again
  (table above).

**Findings:**

- `once` executes the command for that run only; it is **not persisted** and the
  next run asks again.
- `Always` saves the proposed prefix pattern `stub-safe *` and the next run
  executes **without asking**, bypassing the ask gate for that prefix.
- `reject` exits non-zero (exit 1) with a `declined` tool error, writes nothing,
  and is not persisted; the next run asks again.

### 3.5 Scanner limits: asks vs scanner errors

Configuration: ask `shell *`; allow exact `stub-safe`; allow exact
`git status --short`. Counters reset before each command.

| Scenario | Version | Command | Decision | Stub count |
|---|---|---|---|---|
| scanner/compound-and | 2.2.7 | `stub-safe && stub-net` | `ask-rejected` | safe=0, net=0 |
| scanner/compound-semicolon | 2.2.7 | `stub-safe; stub-net` | `ask-rejected` | safe=0, net=0 |
| scanner/substitution | 2.2.7 | `stub-safe $(stub-payload)` | `ask-rejected` | safe=0, payload=0 |
| scanner/backticks | 2.2.7 | ``stub-safe `stub-net` `` | `ask-rejected` | safe=0, net=0 |
| scanner/eval | 2.2.7 | `eval stub-net` | `ask-rejected` | net=0 |
| scanner/redirect | 2.2.7 | `stub-safe > redir.txt` | `ask-rejected` | safe=0; `redir.txt` absent |
| scanner/interpreter-wrapper | 2.2.7 | `sh -c 'stub-net'` | `ask-rejected` | net=0 |
| scanner/extra-arguments | 2.2.7 | `stub-safe --extra` | `ask-rejected` | safe=0 |
| scanner/git-compound-push | 2.2.7 | `git status --short && git push <bare> HEAD:refs/heads/main` | `ask-rejected` | git-push=0 |
| scanner/scanner-unterminated-quote | 2.2.7 | `stub-safe "` | `scanner-error` (`unterminated-quote`) | safe=0 |
| scanner/scanner-trailing-and | 2.2.7 | `stub-safe &&` | `scanner-error` (`invalid-structure`) | safe=0 |
| scanner/scanner-trailing-pipe | 2.2.7 | `stub-safe \|` | `scanner-error` (`invalid-structure`) | safe=0 |
| scanner/scanner-command-substitution | 2.2.7 | `stub-safe $(` | `scanner-error` (`command-substitution`) | safe=0 |

Positive controls used headless `--auto` to prove these commands would execute
if the ask gate were absent:

| Scenario | Version | Command | Decision | Stub count |
|---|---|---|---|---|
| scanner-control/auto-compound | 2.2.7 | `stub-safe && stub-net` | `executed` | safe=1, net=1 |
| scanner-control/auto-substitution | 2.2.7 | `stub-safe $(stub-safe)` | `executed` | safe=2 |
| scanner-control/auto-git-push-wrapper | 2.2.7 | `git status --short; git push <bare> HEAD:refs/heads/main` | `executed` | git-push=1 |

**Findings:**

- Compound commands are asked as a whole with subcommands split; dynamic
  constructs (substitution, backticks, eval, redirect, interpreter wrapper) and
  **extra arguments** ask rather than inheriting the exact-command grant.
- An exact resource such as `stub-safe` matches **only** the exact command.
  `stub-safe --extra` is not covered; `stub-safe*` / `stub-safe *` are.
- A malformed command produces a distinct **scanner error**
  (`Portable shell scanner cannot analyze command: <reason>`), not a permission
  ask, and never executes.
- The local `git` shim refused every push; the counter proves whether a push was
  even attempted (zero for rejected/asked commands, one for the `--auto`
  control), and the local bare repository stayed untouched.
- **Limitation:** `--auto` is headless auto-approval; these controls do not
  establish TUI auto-accept behavior.

### 3.6 Key runtime findings (summary)

1. **V2 `permissions` enforced; V1 `permission.bash` ignored** on 2.2.7.
2. **Precedence (measured pairs):** agent > global, agent > project,
   project > global, ancestor > global; the ancestor config is read when it is
   the nearest config. Project decisions are observed over the ancestor file,
   but "project overrides ancestor" and "only the nearest config is loaded"
   are not distinguished; no four-level total order is asserted.
3. **Last matching rule wins** within a ruleset.
4. **Exact grants match only exact commands**; extra arguments ask; `*`
   prefixes/suffixes broaden.
5. **Headless asks auto-reject with zero stub writes**; stderr reports
   `auto-rejecting`, tool error reports it cannot ask.
6. **Scanner errors are distinct from asks** and also execute nothing.
7. **`Always` saves the prefix pattern (`stub-safe *`) and bypasses the next
   ask**; `once` is not persisted; `reject` exits 1 and is not persisted.

---

## 4. Expected RED at the Task 1 run — then-current generated policy (historical; since replaced)

`security_shape_precedence` also asserts the **proposed generated policy** as
`expect.soft` checks, so all measured runtime assertions above run first. On the
generator at the Task 1 run the test was intentionally RED on exactly these 11
soft assertions (recorded in the Vitest log):

| # | Assertion |
|---|---|
| 1 | `kiki-orchestrator: first shell rule must be the ask fallback` (`undefined` received — no shell rule) |
| 2 | `kiki-brainstormer: first shell rule must be the ask fallback` |
| 3 | `kiki-planner: first shell rule must be the ask fallback` |
| 4 | `kiki-implementer: first shell rule must be the ask fallback` |
| 5 | `kiki-implementer: wildcard shell allow must be absent` (`true` received — `allow shell *`) |
| 6 | `kiki-gui-designer: first shell rule must be the ask fallback` |
| 7 | `kiki-gui-designer: wildcard shell allow must be absent` (`true` received — `allow shell *`) |
| 8 | `kiki-reviewer: first shell rule must be the ask fallback` |
| 9 | `kiki-escalation: first shell rule must be the ask fallback` |
| 10 | `kiki-historian: first shell rule must be the ask fallback` |
| 11 | `orchestrator: primary permissions block` (`false` received — missing) |

These were the expected policy gaps for **Task 2** at that time: the
then-current implementer and gui-designer contained `allow shell *`, and the
orchestrator had no primary `permissions` block. Later source implementation
replaced both; this section is retained as historical Task 1 evidence. They are
**not** runtime-enforcement failures, and they must not be reported as a Task 1
pass.

Test-level result of the fix-round-1 recorded run:

```
Test Files  1 failed (1)
     Tests  1 failed | 2 passed (3)
  Duration  60.33s
```

Passed: `security_gate_rejects_unsafe_execution`,
`security_scanner_does_not_execute_hidden_network`.
Failed: `security_shape_precedence` **only** on the same 11 soft policy
assertions above. The run emitted **47** `[security-boundary-probe]` records:
the original 41 plus 3 ancestor isolation/ordering cases and 3
`permission.asked` payload records. No runtime shape, precedence or saved-grant
assertion failed.

---

## 5. PENDING — not measured, not claimed

The following evidence was **not** produced by this run. It must not be treated
as verified, and it blocks the rollout gates that depend on it.

### 5.1 Human / TUI evidence

**Later manual observation (2026-11-13, under the then-applied ask-first policy):** the user confirmed that an
orchestrator-dispatched implementer's `printf 'kiki primary boundary test\n'`
raised a permission prompt in the root TUI and returned the expected stdout.
This supplies informal evidence for the root-visible subagent ask path only;
the selected approval option was not recorded. The child's initial claim that
no prompt surfaced was contradicted by the user's observation and is not bypass
evidence. The orchestrator's refusal to execute directly is role compliance,
not a native shell-deny test. No scripted probe or additional TUI behavior is
claimed by this observation.

- Native TUI `once`, **Always**, and `reject` behavior (the saved-grant probes
  used the native permission API via a local plugin, not TUI key interaction).
- TUI auto-accept mode. Only headless `--auto` auto-approval was observed; the
  two are not equivalent and this document does not claim equivalence.
- Root-visible subagent permission asks: manually observed as above; not a
  scripted TUI test.
- TUI presentation of saved grants, and how a user reviews/removes them.
- Real pending waits at **300,000 ms** and **3,600,000 ms**. Per the bounded
  ruling, these require separate authorization; no sleeps were run.
- Any model-obedience behavior (reporting `PERMISSION_BLOCKED` and stopping
  without retry/workaround). Scripted-provider tests verify transport, not model
  obedience.

### 5.2 Watchdog and blocked-operation behavior (Task 4)

- Watchdog behavior while a permission request is pending (no interrupts,
  pending-ID tracking, silence reset, timeout exclusion).
- Watchdog-while-waiting end-to-end evidence and real TUI long waits.
- `PERMISSION_BLOCKED` prompt behavior and headless single-attempt plus stop.

### 5.3 Alternate routes (Task 3)

Task 1 measured **shell** permissions only; a shell ask does not by itself
establish network-tool or delegation control. Task 3 later ran the
`security_runtime_routes` probe on OpenCode **2.2.7** (216 s, exit 0). That run
measured an MCP positive control executing (stubCount 1), MCP stubCount **0** for
the generated role run across all eight roles, and passing execute,
`webfetch`/`websearch`, `skill`, `subagent` and the then-current
external-directory deny/re-allow controls.

Still **PENDING** or qualified:

- TUI-visible route behavior and native TUI `Always`/auto-accept (see §5.1).
- Real long waits at 300,000 ms and 3,600,000 ms (see §5.1/§5.2).
- Saved-grant inventory and removal (see §5.4).
- The final fix-wave `external_directory` narrowing removed the blanket `*`
  restore and kept only four roles' narrow `/tmp/**` and `tmp/**` grants. That
   Task 3 runtime probe above predates that final shape. The task registry's
   later finalValidation records a passing runtime route suite after narrowing
   on OpenCode 2.2.7 (240 s); this is later recorded evidence, not a rerun made
   during this documentation update. MCP closure via `*_*` is unchanged.

### 5.4 Configuration transition and other out-of-scope items

- `opencode.jsonc` transition history: a **preview only** was generated on
  disposable copies (Task 5, 2026-11-12;
  `.superpowers/sdd/2026-11-12-security-boundaries-plan/task-5-preview.md`).
  At preview time the live project config was unchanged and still used V1
  rules ignored on 2.2.7. **Later update (2026-11-13):** the user authorized
  application and the live config now uses V2 `permissions`, first under the
  ask-first policy and then under the corrected scope (`allow shell *`, 18
  publishing asks, five force-push denies). The registry records config/load
  checks, final route validation after narrowing, and remaining verification
  limits; §5.1 records the user's live subagent prompt observation from the
  ask-first period. This supersedes the earlier unapplied status, not the
  remaining unverified checks. The preview was regenerated after the 2026-11-12 ruling: it
  retains the permanent narrow `.superpowers/sdd/**` edit grant for the
  implementer, gui-designer, and orchestrator, and removes only the other 19
  temporary implementer path grants. The implementer's grant already exists in
  the live config and is carried forward; the gui-designer and orchestrator
  receive it newly from the generated owner.
- Saved-grant inventory remains pending (Task 5; separately approved).
- Real hosting clients, credentials, live remotes, and Windows-side separation.
- Alias/wrapper universality: the measured wrapper case (`sh -c`) asked, but
  this does not establish detection of every possible alias or wrapper.

---

## 6. Reproduction

Recorded commands (OpenCode 2.2.7):

```bash
OPENCODE_TEST_BINARY=/home/lutz/.opencode/bin/opencode \
  npx vitest run tests/integration/oc2-security-boundaries.test.ts --reporter=verbose
# exit 1; 2 passed / 1 failed (the 11 expected soft policy assertions above)

npx --no-install vitest run tests/helpers/oc2-fixture.test.ts --reporter=verbose
# exit 0; 7/7 passed (accepts 2.x and records 2.2.7; rejects V1, malformed,
# future-major, relative path, missing variable)
```

Artifacts from the recorded fix-round-1 run (local only):
`/tmp/kiki-task1-fix4.log`, `/tmp/kiki-task1-fix4-evidence.txt` (47 scenario
records) and `/tmp/kiki-task1-harness.log` (harness gate, 7/7). The full suite
and build were intentionally not run for Task 1.

**Version policy:** probes accept any available OpenCode 2.x binary supplied by
`OPENCODE_TEST_BINARY` and record the observed version. V1, malformed and
future-major binaries are rejected by the harness. This document records
**2.2.7**; a different 2.x patch must be re-probed before relying on these
results.
