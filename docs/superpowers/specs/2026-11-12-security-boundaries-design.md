# Security Boundaries for Kiki Agents — Design

- **Date:** 2026-11-12
- **Status (2026-11-13, corrected):** IMPLEMENTED, TESTED AND APPLIED LOCALLY after user approval, then **scope-corrected on 2026-11-13**. The live `opencode.jsonc` uses V2 permission arrays with `allow shell *` first, 18 publishing/remote-changing `ask` rules, and five force-push `deny` rules last; `kiki update` refreshed all eight active global prompts with the no-circumvention line. The earlier blanket ask-first draft (Revision 4) was rejected in practice as too broad and is historical. The registry records automated validation on OpenCode 2.2.7: focused permission/migration/install/doctor 62/62 and the full suite 659 passed, 2 skipped, 0 failed; the orchestrator re-verified the structural shell-rule check and focused tests after apply. A user-observed root-visible implementer shell prompt from the ask-first period remains historical evidence of the subagent ask path. Direct orchestrator gate verification, TUI Always/reject/auto-accept, real long waits, saved-grant inventory, reconnect state and blocked-operation stop behavior remain open, not waived. The conditional approval limitation in §5.5 remains accepted. Design-time evidence below is not current rollout status; later evidence is in `docs/research/2026-11-12-security-boundaries-probes.md` and the task registry. No commit or release authorization is granted by this status.
- **Revision:** 5 (2026-11-13) — approved scope correction. Routine local shell is allowed for all eight roles; publishing, deployments, pushes, uploads and remote-changing operations ask via 18 ordered patterns; force-push taboos remain denies. The earlier ask-first/unknown-command design (§5.1–§5.4, §5.7) is superseded in practice and retained as historical design evidence. Read/file, edit, execute/MCP/web/skill/subagent/external-directory rules are unchanged. Command gates protect known publishing routes only and are not an adversarial sandbox.
- **Revision:** 4 (2026-11-12) — status updated after implementation: source changes and focused tests are complete, while live rollout remains unapplied and separately gated. The user accepted the conditional `Always`/auto-accept limitation; design-time "not probed" and "open decision" wording is retained below as historical evidence.
- **Revision:** 3 (2026-11-12) — user-authorized removal of the exact OpenCode 2.2.6 runtime-test pin: probes accept any available OpenCode 2.x binary (2.2.7 was available when this amendment was written) and record the actual tested version; V1, malformed and future-major binaries remain rejected. Adds the bounded ruling on real long-wait probes. Historical migration evidence, `docs/migrations/*` and dependency/SDK pins are unchanged.
- **Revision:** 2 (2026-11-12) — builder-review corrections: watchdog-while-waiting contingency, auto-accept as a native ask bypass, per-agent route verification incl. the orchestrator, reuse of `oc2-permissions.ts`/`oc2-migration.ts`, and "always"/auto-accept reframed as an **open acceptance decision**.
- **Scope:** agent shell/tool permissions and approval gating for remote-changing operations, in Kiki's generated defaults and in the Kiki repository's live config.
- **Out of scope (user decisions):** Windows-side separation (assumed, not verified); separate publishing infrastructure; custom approval UI; transfer file-list previews.
- **Inputs (design-time):** security-boundary brainstorm of 2026-11-12 (decisions in §2); `docs/research/2026-11-12-critical-review-kiki-improvement-research.md`; `docs/research/Kiki improvement brief for brainstorming.md`; OpenCode V2 permissions documentation (fetched 2026-11-12); read-only local inventory (§3). **At design time (2026-11-12) the OpenCode runtime had not been probed; runtime behaviors below were documentation claims pending the §7 verification and are retained as historical design evidence.** The runtime was later probed on OpenCode 2.2.7; measured results and remaining PENDING items are in the probe record. Verification accepts any available OpenCode 2.x binary and records the exact observed version.

## 1. Intent and why

Kiki agents run on the user's development machine with the user's own account authority. At design time (2026-11-12; see §2.1 for the later correction), the permissions were accidental: generated defaults and the live project config gave implementer and gui-designer unrestricted shell (`allow('shell','*')`, `src/cli/config.ts:203`; `"bash": "allow"`, `opencode.jsonc:128,158`), which voided every file-level restriction for those agents. The user (sole, non-programmer, one-person operation) wants:

- agents that cannot change the outside world — remotes, providers, the live website — without an explicit approval given inside Kiki (agent prepares, user approves, execution is automated; the user does not publish manually);
- a simple, maintainable per-project command permission list — not a second publishing system;
- honest boundaries: protection against mistakes, not an adversarial sandbox.

Publishing happens via push-triggered deploys on Scalingo and Railway (user believes pushes trigger deploy; provider mechanics unverified) and, for one website project, via SSH/SFTP/FTPS uploads to a live root, with no staging mentioned.

## 2. Decisions and corrections from the conversation

| # | Decision | Status |
|---|---|---|
| D1 | Broad shell for any agent was accidental; no agent needs it | User statement — remove unrestricted shell everywhere. **Superseded in practice (2026-11-13):** routine local shell is allowed; the user's concern is accidental publishing, not shell capability. |
| D2 | Simple, maintainable command/tool permissions over isolated publishing infrastructure | User choice |
| D3 | Publishing is approved inside Kiki (agent prepares, user approves, execution automated) | User choice |
| D4 | Every remote-changing operation asks before running | Proposed conservative default; approved at general scope ("OK, sounds all good" to the summary containing it); the concrete command list returns for approval with the policy draft; per-project relaxation possible later. **Corrected (2026-11-13):** implemented as 18 publishing-route patterns; commands outside those patterns run under the routine-local allow, so "unknown asks" no longer applies. |
| D5 | SSH, SFTP (over SSH), FTPS (FTP over TLS) covered; plain FTP discouraged (plaintext passwords) | User request + recommendation |
| D6 | No file-list previews for transfers; no custom approval UI; no separate publish service | User scope reduction |
| D7 | A separately named publisher agent with the same shell and credentials is **not** a boundary | User challenge, conceded and recorded — informs §8 |
| D8 | Windows separation out of scope | Working assumption, not a verified fact |

### 2.1 Approved scope correction (2026-11-13)

The original design made `shell *` ask for every role and treated unknown commands as ask-gated. That proved impractical for routine local work, so the user approved a narrower publishing gate:

| Class | Examples | Effect |
|---|---|---|
| Routine local | any shell command not matched below | allow (`allow shell *`) |
| Publishing / remote-changing | `git push*`, `gh pr merge*`, `gh release*`, `gh workflow run*`, `scalingo *deploy*`, `railway up*`, `railway deploy*`, `ssh*`, `sftp*`, `scp*`, `rsync*`, `lftp*`, `ftp*`, `curl*`, `wget*`, `npm publish*`, `yarn publish*`, `pnpm publish*` | ask |
| Hard taboos | `git push --force*`, `git push -f*`, `git push *--force*`, `git push * -f`, `git push * --force` | deny |

Rules are ordered allow, 18 asks, five denies; last match wins. Obsolete legacy exact shell allows were removed as subsumed. Read/file, edit, execute/MCP/web/skill/subagent/external-directory rules are unchanged. The operation-class and unknown-command wording in §5.1–§5.4 and §5.7 is retained as historical design evidence, not current policy. The command gates protect known publishing routes only; they are not an adversarial sandbox, and an allowed local script can still perform network actions. Every generated prompt carries the no-circumvention/`PERMISSION_BLOCKED` instruction.

## 3. Inventory (read-only, 2026-11-12 — historical design-time snapshot)

What was configured and generated at design time. Later source implementation is summarized in the status line and plan; this snapshot is retained as evidence, not as current source truth. This is **not** a claim about the effective runtime policy (merged global/ancestor/session rules not inspected) or about what commands agents actually run (no usage evidence collected).

### 3.1 Generated defaults — `src/cli/config.ts` (V2-style `permissions` arrays, `renderPermissions` at 289-297)

| Agent | Shell rules | Where |
|---|---|---|
| brainstormer / planner | `deny shell *` + allow `git diff*`, `git log*`, `mkdir*` | 180-184 |
| implementer | `allow shell *` | 203 |
| gui-designer | reuses implementer rules | 452-457 |
| reviewer | `deny shell *` + `git diff*`, `git log*` | 220-222 |
| escalation | `deny shell *` + `git diff*`, `git log*` | 226-240 |
| historian | `deny shell *` + `git log*`, `git diff*` | 283-285 |
| orchestrator | no permissions block (mode: primary) | template 316-364 |

### 3.2 Live project config — `opencode.jsonc` (V1-style `permission` objects with `bash` key)

| Agent | bash | Where |
|---|---|---|
| orchestrator | none (model only) | 4-7 |
| brainstormer / planner | `*: deny` + git read + `mkdir*` | 31-42, 69-80 |
| implementer | `"bash": "allow"` — unrestricted | 128 |
| gui-designer | `"bash": "allow"` — unrestricted | 158 |
| reviewer | `*: deny` + git read + `npm test/build/lint/audit/pack*`, `npm ci --ignore-scripts*`, `npx --no-install vitest*/tsc*`, `node dist/cli/index.js verify*/release*` | 188-214 |
| escalation | `*: deny` + git read | 242-252 |
| historian | `*: deny` + git read + `node dist/cli/index.js verify*` | 284-295 |

All agents: read `*` allow with `.env*`, `*secret*`, `*credential*`, `*.pem`, `*.key`, `id_rsa*` denies; edits role-scoped.

### 3.3 Project command/config state

- `.agentic/kiki/config.json` does not exist → `loadConfig` returns `DEFAULT_CONFIG`: build `npm run build`, test `npm test`, lint `npm run lint`, security `npm audit` (`src/cli/config.ts:76-87, 123-140`).
- `.agentic/kiki/alignment.json`: 3 guardrails (no hardcoded secrets, parameterized queries, no stack traces); compliance "OWASP Top 10", "SOC 2 Type II".
- A generated backup agent file (`.agentic/kiki/backups/…/3-kiki-implementer.md`) shows an **older generation emitted V1-style frontmatter** (`permission:` object, `bash: allow`); the current generator emits V2-style (`permissions:` list, `action: shell`); the live `opencode.jsonc` is V1-style. The shape divergence is real; which shape the available OpenCode 2.x runtime enforces, and with what precedence, is unverified (§7.1).
- A V1→V2 permission translation module already exists (`src/cli/oc2-permissions.ts`: `translatePermissions`, `projectPermissionRules`; plus `oc2-migration.ts` with secret-free migration guards). Whether its translation assumptions match the available OpenCode 2.x runtime's actual enforcement is exactly what §7.1 must verify — reuse it, don't replace it.

### 3.4 Not established

- **No ask rules for shell exist anywhere in generated or live config — no approval gating is currently configured.** (Prior reviewer confirmed: no push-specific ask in examined config/templates; no push gating in the plugin; the release CLI never pushes but does not restrict agent shell.)
- Effective merged policy (global/ancestor/session/agent), runtime semantics of the V1-style keys, and actual agent command usage: not inspected, not evidenced.

## 4. Goals / non-goals / anti-goals

**Goals**

1. No agent has unrestricted shell.
2. Known-safe routine operations run without interruption; the list is per project and maintainable.
3. Every remote-changing operation (push, merge, deploy, upload, remote config/resource change; any SSH or transfer-client use) asks the user first, one-off, through the normal OpenCode prompt.
4. Unknown operations stop (ask), never auto-run, and do not cause retry loops.
5. Alternate routes (Code Mode, MCP tools, web tools) are covered by rules, not left to defaults.

**Corrected 2026-11-13:** goal 1 is superseded — routine local shell is allowed, not denied. Goal 4 no longer applies: commands outside the 18 publishing patterns run under `allow shell *` rather than asking. Goal 3 remains the accepted intent, now implemented as a known-route gate rather than a general unknown-then-ask boundary.

**Non-goals:** OS-level sandboxing, credential isolation, adversarial containment (§8); verifying Windows-side separation; any new UI.

**Anti-goals:** custom approval UI, transfer previews, separate publish service (user-rejected); a blacklist approach — the official docs themselves recommend a narrow allowlist over patterns intended to recognize dangerous commands.

## 5. Design

### 5.1 Operation classes

> **Historical design (superseded 2026-11-13 by §2.1).** The class table and catch-all-ask reasoning below are the original design; current policy allows routine local shell and asks only on the 18 publishing routes, with force-push denies. Retained as design evidence.

| Class | Examples | Effect |
|---|---|---|
| Known-safe routine (per project) | `git status*`, `git diff*`, `git log*`, `git ls-files*`, `mkdir*`; the project's `config.commands` values | allow |
| Remote-changing ("publish class") | `git push*`; `gh pr merge*`, `gh release*`; scalingo/railway deploy-type commands; any `ssh*`, `sftp*`, `scp*`, `rsync*`, `lftp*`, `curl*`, `wget*` | ask (one-off) |
| Hard taboos | force-push; credential-file reads via tools (already denied) | deny |
| Unknown (everything else) | any command not allowlisted | ask (catch-all rule) |

The publish class needs no explicit rules: a catch-all `ask` for shell, placed before the specific allows, produces it automatically (last-match-wins; the docs' own example uses exactly this shape: ask-before-shell, allow routine git, deny push). ssh/transfer clients get **no blanket allow anywhere** because they can write and execute remotely; their read-only subcommands, if a project wants them, are added as individually reviewed exact commands — never the whole client. Plain FTP is not used (D5).

### 5.2 Rule shape and placement

- **Historical (superseded 2026-11-13 by §2.1):** generated agents use V2-style ordered `permissions` arrays: `[ ask shell * ] → [ per-project allows ] → [ taboo denies ]`. The current generated order is `[ allow shell * ] → [ 18 publishing asks ] → [ five force-push denies ]`. The documented default base policy is allow-all; agent rules are appended last, so the later rules override it.
- The live `opencode.jsonc` V1-style blocks stay untouched until §7.1 verifies shape semantics — no gratuitous migration. Target single source of truth: the generator; `opencode.jsonc` keeps models only.

### 5.3 Read-only is not automatically safe

Provider "status" commands can print secrets (`env`-style output) or leak data into logs, and a bulk download can pull secrets off a server. Each read-only grant is chosen per command after reviewing what it actually prints. No blanket `gh *`, `scalingo *`, or `status`/`list` wildcards. Shell file-reading commands (`cat` etc.) are never allowlisted — file-read denies do not govern shell — so the original design relied on unknown→ask (superseded 2026-11-13: routine local shell is now allowed; only the 18 publishing routes ask).

### 5.4 Unknown operations and retries

> **Superseded in part (2026-11-13):** unknown commands are no longer asked; they run under `allow shell *`. The 18 publishing routes still use native `ask`, and the no-retry/no-circumvention instruction remains current. The reasoning below is historical.

- Native `ask` = wait for a decision. In the TUI, subagent asks surface in the root session (brief §5 [Run] probes); in headless `opencode run` they are auto-rejected (brief §5 [Run]).
- Prompt change for all agents: *"Do not circumvent publishing-route approval via scripts, wrappers, alternate tools, APIs, or delegation. Request approval for the intended publishing operation. If approval is rejected, do not retry or work around it; report `PERMISSION_BLOCKED: <command>` and stop."* Aligns with brief WP1; without it, rejected asks risk retry loops (documented agent weakness).
- Native `deny` blocks without asking the user (brief §5 [Run]) — used only for taboos, where silence is intended. The publish class uses `ask`, not `deny`, so those routes reach the user.

### 5.5 Approvals: "always" and auto-accept are native bypass routes — accepted conditional limitation

Documented approval choices: `once`, `always` (saves the tool's proposed pattern — for shell, a command prefix — as a project-scoped allow), `reject`. Additionally, the TUI has an auto-accept mode in which every request is accepted automatically (documented in the brief's WP7 analysis; not probed here). These are two **native bypass routes around ask**:

- a saved `always` grant on a publish-class command allows that prefix without further asking;
- auto-accept mode accepts every pending request, including publish-class asks.

**What this design guarantees — and what it does not.** The user's requirement is authorization before publishing. With the existing native UI only, approach A enforces ask **conditionally**: while approvals are answered with `once` and auto-accept is not enabled, every remote-changing operation asks. There is **no absolute ask-each-time guarantee**: warnings cannot prevent a bypass; only hard enforcement could, and that is a scope addition the user has not chosen.

**Historical open acceptance decision (design time, deliberately not pre-accepted then):** accept the conditional guarantee — ask holds only in approval-required mode and while no saved bypass exists — or add scope for hard enforcement (e.g. denying the publish class outright so it can never run inside Kiki, or a custom approval flow — both previously rejected for simplicity). This decision was the user's to make before approval.

**Resolution (2026-11-12):** the user accepted the conditional guarantee: ask holds only while approvals are answered `once` and while no saved `Always` grant or auto-accept bypass exists. No hard-enforcement scope was added. This acceptance supersedes the earlier open-decision wording; the warnings below remain reminders, not enforcement.

Proposed warnings — reminders, **not** enforcement:

- `kiki doctor` + README line: answer `once` for publish-class approvals; review saved approvals periodically (the docs recommend this too); be aware that auto-accept disables asking entirely.
- `policies` can hard-deny after rules and saved approvals (documented) — a backstop for taboos (e.g. force-push); **not** usable to keep push askable (a policy turns `ask` into `deny`). Unverified on the available OpenCode 2.x runtime.

### 5.6 Alternate routes

| Route | Proposed default |
|---|---|
| Code Mode `execute` | deny for all Kiki agents, **orchestrator included** (a deny removes Code Mode; nested tools enforce their own rules) |
| MCP tools (`<server>_<tool>`) | deny wildcard for all agents, **orchestrator included**; named servers allowed per project when introduced |
| `webfetch` / `websearch` | allow for brainstormer/planner (research); deny for implementer, gui-designer, reviewer, historian, escalation, **and orchestrator** |
| `skill` | keep allowed for all agents (skills are instructions, not capabilities) |
| `subagent` | orchestrator only (matches current usage; enforce in rules; no nested delegation) |

The orchestrator currently has **no permissions block at all** (§3.1) and inherits defaults — it must be included in the per-agent rule tables like every other agent. Final per-agent tables are builder work, verified route by route via §7.4.

### 5.7 Per-project derivation and maintenance

> **Historical (superseded 2026-11-13 by §2.1):** routine local shell is now allowed broadly, so the per-command allowlist derivation below is no longer the active policy. Publishing routes remain the maintained list.

- Allowlist = fixed safe set (git read + rollback commands, `mkdir`, /tmp writes) ∪ `config.commands` values ∪ individually reviewed read-only provider commands.
- Future CLIs (gh, scalingo, railway, others): nothing automatic. When a project uses one, its safe read-only subcommands are added by name after review; writes always stay ask.
- `kiki doctor` warns when a `config.commands` default belongs to another ecosystem (brief §6) — extend to warn on unsafe prefix shapes (e.g. a configured command ending in `*`).

### 5.8 Rollback-safety conflict (implementer)

The implementer prompt's rollback uses `git diff >`, `git ls-files --others`, `git checkout -- .` (patternable) plus deletion of untracked files — `rm`, which is **not** safely patternable (`rm *` would allow deleting anything). Left to the builder: replace the untracked-cleanup step with a scoped helper (a Kiki-owned CLI subcommand or project script) or accept a per-invocation ask. `git checkout -- .` is local-destructive but limited to tracked files — proposed allow, flagged for the user.

### 5.9 Ruling — permanent SDD workspace edit grant (2026-11-12)

**Authority:** the user, who wants a maintainable superpowers/SDD workflow. **Source-only:** no live configuration or installed agent is changed by this ruling.

`.superpowers/sdd/**` is a **permanent narrow edit grant** for the implementer (task reports), the gui-designer (which reuses the implementer builder), and the orchestrator (SDD ledger and briefs). It is not a temporary migration grant and is not added to any other role. The Task 5 preview carries it through the transition rather than removing it with the temporary exact-path grants.

## 6. Approaches considered

| Approach | Verdict |
|---|---|
| A. Command/tool permission control with ask-gated remote changes (this design) | **Chosen** — native, maintainable, proportionate |
| B. Isolated publish executor with credential separation | Rejected by user (one-person overhead). Conceded (D7): only real privilege separation would make it stronger than A; without that, it is a nameplate |
| C. Status quo (unrestricted shell for implementer/gui) | Rejected — accidental, user-confirmed |

## 7. Verification plan (no real pushes, no credentials)

1. **Shape/precedence:** on an available OpenCode 2.x runtime (isolated home, scripted local provider, probe plugin — the brief's methodology), record the exact observed version and verify which of V1-style `permission.bash` and V2-style `permissions.shell` is enforced, and rule precedence across layers (project, ancestor/global, agent frontmatter). V1, malformed and future-major binaries are rejected; the former exact 2.2.6 pin is removed by user authorization. Historical migration evidence, `docs/migrations/*` and dependency/SDK pins remain unchanged. Compare against the assumptions of the existing translator (`src/cli/oc2-permissions.ts`); **reuse** `translatePermissions`/`projectPermissionRules` and `oc2-migration.ts` for any shape handling rather than inventing new logic — after, not before, the runtime check.
2. **Ask path:** subagent ask surfaces in the TUI root session; `once`/`always`/`reject` behavior; what pattern `always` saves for shell; whether auto-accept mode is in use and what it accepts (configuration-dependent, not assumed).
3. **Watchdog while waiting — must be probed, not promised:** a session waiting on an approval produces no activity. Probe that the existing session watchdog (stuck threshold 5 min, absolute max 60 min per `DEFAULT_HEALTH`) does **not** abort a session with a pending approval. Contingency if it does: pause the watchdog for that session while `permission.asked` is pending until `permission.replied` — that pause is itself unimplemented and unvalidated (the brief's WP7 lists it as an assumption, not a run), so it becomes builder work with its own probe, not a silent promise.

   **Bounded ruling (2026-11-12):** real pending-wait probes at 300,000 ms and 3,600,000 ms cannot run unattended under the current authorization. Fake-clock tests may verify the watchdog's pending-wait logic, but real TUI long-wait evidence remains pending and blocks any rollout that depends on it unless separately authorized and verified.
4. **Route denials — one safe probe per route (§5.6):** `execute` deny → Code Mode removed for that agent; MCP wildcard deny → an MCP tool call is blocked (dummy local server or stub tool); `webfetch`/`websearch` deny → fetch/search denied against a localhost dummy server; `skill` allow → skills still load for the agents that need them; `subagent` → dispatch denied for every non-orchestrator agent and allowed for the orchestrator.
5. **Scanner:** `git status && git push` → push asks (compound commands split into subcommands, each checked — docs claim); dynamic constructs (`$(…)`, eval) produce scanner errors, not execution (docs claim; verify).
6. **Allowlist safety:** for each allowed prefix, confirm every argument variant is acceptable.
7. **Fake remotes:** local bare git repo as push target; localhost dummy SFTP/FTPS server; PATH-shimmed stub CLIs for gh/scalingo/railway — assert ask/classification without touching real hosting.
8. **Retry behavior:** rejected ask in headless mode against current prompts; confirm the no-retry prompt line works.

## 8. Open issues and residual risks

**Status note (2026-11-13):** the live V2 configuration has been applied with user approval, then scope-corrected to routine-local allow plus publishing-route asks (§2.1). `kiki update` refreshed the active global prompts. The subagent ask path has user-observed TUI evidence from the earlier ask-first period; remaining live checks listed in the status above remain unverified. Historical design-time gates below do not mean the migration is still unapplied.

**Open issues (precise, not promises):**

1. **Applied locally with corrected scope:** probes on OpenCode 2.2.7 measured V2 `permissions` enforced and V1 `permission.bash` ignored. The user-authorized transition to V2 is applied: `allow shell *`, 18 publishing asks and five force-push denies, with alternate-route and file rules unchanged. The earlier ask-first policy is historical.
2. **Resolved acceptance decision (§5.5):** "always" grants and auto-accept mode are native bypass routes around ask; the docs describe no per-rule way to disable them. On 2026-11-12 the user accepted the conditional guarantee (ask holds only in approval-required mode and while no saved bypass or auto-accept exists); no hard-enforcement scope was added. Prompt/doctor warnings remind; they do not enforce.
3. **Source logic implemented; real waits pending:** the watchdog pause contingency (§7.3) is implemented and fake-clock tested. Real pending-wait probes at 300,000 ms and 3,600,000 ms remain blocked pending separate authorization, so related live rollout remains gated until real TUI long-wait behavior is verified.
4. Headless ask auto-rejection + retry hazard → the §5.4 prompt rule mitigates; the full fix is WP1's `needs_human` classification (not built).
5. Command-pattern matching is string-prefix only: approvals show command text, with no payload/ref-level binding (accepted — previews dropped, D6).
6. The implementer rollback `rm` step is not patternable (§5.8).

**Residual risks (explicit, accepted by design choice):**

- Allowed commands (build/test/lint, `npx --no-install vitest/tsc`) execute project and dependency code with the user's full local authority; this design is mistake protection, not containment — the official docs' own warning.
- Credentials present in the WSL environment remain reachable to allowed code; nothing here isolates them (approach B would have).
- Repository-content prompt injection can still steer agents toward any allowed action; approval gates catch remote changes, not local damage.
- Approval of a publish means "make it live", not "this code is safe".
- D7 stands: nothing in this design is a wall against a determined adversary.

## 9. What is left to the builder

> **Historical handoff (superseded 2026-11-13 by §2.1).** The tasks below describe the original ask-first design. Current generated permissions, prompts, doctor advisories and live configuration are already applied; remaining verification limits are listed in the status line and §8.

- Exact per-agent rule tables (V2 shape), including the §5.6 route defaults **and the orchestrator**.
- The no-retry prompt line for all agent templates.
- `kiki doctor` checks: prefix-shape warnings; saved-approval review and auto-accept awareness reminders (reminders, not enforcement).
- Verification fixtures/scripts per §7 (fake remotes, stub CLIs, probe scenarios, per-route denial probes, watchdog-waiting probe); accept any available OpenCode 2.x and record the observed version.
- Watchdog pause contingency (§7.3) — only if the probe shows sessions are aborted while waiting. Real 300,000/3,600,000 ms TUI probes require separate authorization; fake-clock tests cover logic only.
- Migration mechanics for the live config after §7.1 verification, **reusing `src/cli/oc2-permissions.ts` (`translatePermissions`, `projectPermissionRules`) and `oc2-migration.ts`** rather than new translation logic; single-source-of-truth cleanup (permissions only in generated frontmatter; `opencode.jsonc` keeps models).
- Workflow/README documentation of the approval discipline (`once` for the publish class; what auto-accept does to it).
