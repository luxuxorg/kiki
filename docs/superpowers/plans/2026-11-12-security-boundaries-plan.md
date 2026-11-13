# Security Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace accidental unrestricted agent capabilities with narrow, project-maintainable permissions and native approval gating.

**Architecture:** Probe an available OpenCode 2.x runtime (record the actual observed version) before choosing permission shapes or changing configuration. Derive role-specific rules through existing generation/translation paths, keeping remote-changing operations ask-gated and hard taboos denied. (The plan's original unknown-command ask was superseded by the 2026-11-13 scope correction: routine local shell is now allowed.)

**Tech Stack:** Existing TypeScript CLI/plugin, OpenCode native permissions, local-only verification fixtures.

**Spec:** `docs/superpowers/specs/2026-11-12-security-boundaries-design.md`; guardrails: `.agentic/kiki/alignment.json`.

**Status (2026-11-13): IMPLEMENTED, TESTED AND APPLIED LOCALLY; NO COMMIT OR RELEASE AUTHORIZATION FOR THIS WORK.** The user approved the live V2 permission migration and, on 2026-11-13, an approved scope correction replaced the earlier blanket ask-first shell policy with `allow shell *` first, 18 publishing/remote-changing `ask` rules, and five force-push `deny` rules last; `kiki update` refreshed the active global prompts with the no-circumvention line. The registry records automated validation on OpenCode 2.2.7: focused permission/migration/install/doctor 62/62 and the full suite 659 passed, 2 skipped, 0 failed; the orchestrator re-verified the structural shell-rule check and focused tests after apply. The earlier ask-first implementation, exact-grant table and unknown-command ask requirement are historical and superseded. Direct orchestrator native gate verification and remaining TUI approval/wait/reconnect checks remain unverified, not waived. The accepted Always/auto-accept conditional limitation remains in force. The checklists below retain the original implementation procedure; they are not instructions to repeat completed migration checks. **User authorization (2026-11-12):** the former exact OpenCode 2.2.6 runtime-test pin is removed. Probes accept any available OpenCode 2.x binary and record the actual tested version; V1, malformed and future-major binaries remain rejected. Historical migration evidence, `docs/migrations/*` and dependency/SDK pins are unchanged.

## Global Constraints

- Practical mistake-prevention, not a sandbox, credential isolation, or adversarial containment.
- **Corrected 2026-11-13:** routine local shell is allowed; 18 publishing/remote-changing routes ask; force-push taboos deny. This supersedes the original "no unrestricted shell; unknown operations ask" constraint, which is retained in the historical task text below. Command gates protect known publishing routes only, not arbitrary network actions by allowed local scripts.
- Native approval only: no custom UI, transfer/file-list previews, or separate publishing infrastructure; no plain FTP.
- Ask-each-time is conditional: use `once`, no saved publish bypass, auto-accept off. Warnings cannot enforce this accepted limitation.
- Probe with isolated HOME, local provider/tool stubs and fake remotes; no credentials, live publishing, or real hosting.
- Runtime probes take `OPENCODE_TEST_BINARY` pointing at any available OpenCode 2.x binary and record the exact observed version. The former 2.2.6 patch pin is removed by user authorization; V1, malformed and future-major binaries are rejected.
- Commands below are future verification instructions, not executed during planning. No commits without user authorization.
- Reuse `translatePermissions`/`projectPermissionRules` in `src/cli/oc2-permissions.ts` and `src/cli/oc2-migration.ts`; no replacement migration system.
- `.agentic/kiki/config.json` is absent; preserve existing default-command derivation, reviewing project commands before granting them.
- Preserve alignment guardrails: “No hardcoded secrets in source code”; “All database queries must use parameterized statements”; “API responses must not leak internal stack traces.” Compliance labels are not certification claims.

## Review Focus

- Conflicting global/project/agent/saved rules must not silently invalidate the measured policy (Task 1).
- Compound commands, dynamic constructs, and broad argument variants must not inherit accidental safe-prefix grants (Tasks 1–2).
- Pending approvals must not trigger watchdog aborts; rejection must stop without workaround or retries (Task 4).
- Alternate tools and orchestrator inheritance must not bypass role restrictions (Tasks 1–3).
- Existing saved grants, config-shape divergence, and destructive rollback must remain visible and separately reviewed (Tasks 2, 5–6).

## Ruling — permanent SDD workspace edit grant (2026-11-12)

**Authority:** the user, who wants a maintainable superpowers/SDD workflow. **Source-only:** this changes generated defaults; no live `opencode.jsonc`, installed agent, or rollout is approved by it.

`.superpowers/sdd/**` is a **permanent narrow edit grant**, not a temporary migration grant, for the implementer (task reports), the gui-designer that reuses the implementer builder, and the orchestrator (SDD ledger and briefs). No other role may edit that workspace. Task 5's preview is regenerated from this generated owner; the grant survives the transition instead of being removed with the other temporary exact-path grants.

## Bounded ruling — unattended long-wait probes (2026-11-12)

Real pending-wait probes at 300,000 ms and 3,600,000 ms cannot run unattended under the current authorization. Fake-clock tests may verify the watchdog's pending-wait logic, but real TUI long-wait evidence remains pending and blocks any rollout that depends on it unless separately authorized and verified.

---

### Task 1: OpenCode 2.x safe-probe gate

**Metadata:**
- risk: high
- parallel: false
- depends_on: []

**Files:** Create `tests/integration/oc2-security-boundaries.test.ts` and `docs/research/2026-11-12-security-boundaries-probes.md`; reuse `tests/helpers/oc2-fixture.ts`, `tests/integration/fixtures/oc2-provider.ts`, and watchdog integration patterns without production edits.

**Interfaces:** Consume `requireOC2Binary(): string`, `createOC2Fixture(binary?: string): OC2Fixture`, `fixture.runAsync(args, options): Promise<FixtureRunResult>`, and `startFixtureProvider(responder): Promise<FixtureProvider>`. Record scenario, version, configuration, decision and stub count.

- [ ] **1. Fail first:** Add `security_gate_rejects_unsafe_execution`: stub counters remain zero for rejected unknown/network commands; add `security_shape_precedence` comparing V1/V2 and global/ancestor/project/agent rules, including saved grants. Initially assert the proposed generated policy, exposing current unrestricted implementer and missing primary rules.
- [ ] **2. Verify red:** After approval, run `OPENCODE_TEST_BINARY=/absolute/path/to/opencode npm test -- tests/integration/oc2-security-boundaries.test.ts` using any available OpenCode 2.x binary; the harness records the exact observed version and rejects V1, malformed and future-major binaries. Expect policy assertion failures, not infrastructure errors. Missing/wrong binary or skipped scenarios cannot pass the gate.
- [ ] **3. Establish runtime evidence:** Use isolated HOME/XDG/config, loopback stubs, PATH-shimmed clients and local bare remotes; never installed hosting clients. Record once/Always/reject/auto-accept and root-visible subagent asks through isolated native TUI, not headless substitutes. Probe pending waits beyond 300,000 ms and 3,600,000 ms for Task 4 only where separately authorized; see the bounded ruling above. Unattended runs must not fabricate or omit this evidence.
- [ ] **4. Pin scanner limits:** Add `security_scanner_does_not_execute_hidden_network`: rejected `git status && git push`, substitutions, eval, redirects, interpreter wrappers and extra arguments leave write counters zero. Record scanner errors versus asks distinctly; do not substitute the unit-test glob matcher for runtime enforcement.
- [ ] **5. Gate:** Record measured shape/actions/precedence before Tasks 2–3; require passing enforcement assertions after them. If exact grants, taboos, or alternate-route restrictions have no safe representable scope, stop implementation for revised approval, never broaden them. Watchdog failures require Task 4 before rollout.

### Task 2: Narrow operation tables and generation

**Metadata:**
- risk: high
- parallel: false
- depends_on: ['Task 1']

**Files:** Modify `src/cli/config.ts` and `tests/cli/oc2-permissions.test.ts`; retain translation/migration modules and legacy fixture unchanged.

**Interfaces:** Preserve `generate*Template(config: KikiConfig): string`, `generateAllTemplates(config): GeneratedTemplates`, `PermissionRule`, and `baselineAgents(config)`. Pass config to private builders needing commands; reuse `renderPermissions`, `translatePermissions(input): PermissionResult` and `projectPermissionRules(local, inherited): PermissionRule[]`; no new evaluator.

**Proposed operation table — RETURN FOR USER APPROVAL before implementation:** Exact strings below, no suffix wildcard; additional arguments ask.

> **Superseded (2026-11-13):** the implemented policy is `allow shell *` first, then the 18 publishing/remote-changing asks, then the force-push denies. The exact-grant table and "never `allow shell *`" wording below are the historical planned design and are retained as evidence, not as current behavior. Standard role prompts still restrict behavior by instruction.

| Agents | Shell allows |
|---|---|
| orchestrator | none; coordination remains command-free |
| brainstormer, planner | `git status --short`, `git diff --stat`, `git log --oneline -20` |
| implementer, gui-designer | preceding three; `git ls-files --others --exclude-standard`; reviewed exact `commands.build/test/lint/security` |
| reviewer | research three plus reviewed exact project verification commands |
| escalation, historian | research three only |

All eight: shell fallback **ask**, never `allow shell *`; push/merge/release/deploy, SSH/SFTP/FTPS/scp/rsync/lftp/curl/wget, unknowns and deletion/rollback ask. No `mkdir*`, git argument wildcards, arbitrary scripts/interpreters or provider-status grants. Verification defaults: exactly `npm run build`, `npm test`, `npm run lint`, `npm audit`; project-code authority is not containment. Unreviewed/unsafe configured strings stay ask, including wildcard, compound, interpreter and network commands. Preserve credential denies. Current generated force-push deny set (unit-tested): `git push -f*`, `git push --force*`, `git push *--force*`, `git push * -f`, `git push * --force`. Runtime matching is not yet probed; branch names containing `-f` such as `my-feature`/`hot-fix` are not denied, some other flag placements can fall through to ask, and aliases/wrappers remain limitations, not universal force-push detection.

- [ ] **1. Fail first:** Add `security_shell_matrix_all_eight_roles`: `rulesForRole` asserts first shell rule equals `{action:'shell',resource:'*',effect:'ask'}`, no wildcard allow, exact table grants, and unknown/publish examples ask; force forms deny. Add `security_config_commands_are_not_prefix_grants`: extra args and unsafe configured examples ask.
- [ ] **2. Verify red:** `npm test -- tests/cli/oc2-permissions.test.ts`; expect failures on current broad shell/missing primary rules.
- [ ] **3. Change generation:** Implement approved table only after Task 1; preserve non-shell scopes, adding primary read protections and edit-only task-registry scope. Narrow `template_rule_matrix_preserves_effective_policy` comparison to unchanged non-shell rules; update `native_agent_modes` to require primary permissions too, retaining legacy translator tests.
- [ ] **4. Verify green:** Rerun that command and Task 1 enforcement cases; require all pass. Unsupported exact-command matching blocks these grants rather than widening prefixes.

### Task 3: Alternate-route enforcement

**Metadata:**
- risk: high
- parallel: false
- depends_on: ['Task 2']

**Files/interfaces:** Modify `src/cli/config.ts`, `tests/cli/oc2-permissions.test.ts`, and Task 1 integration test; consume the same generated `PermissionRule[]`, no new routing API.

**Proposed route table — approval required:** All eight deny `execute` and MCP tools; brainstormer/planner allow `webfetch`/`websearch`, other six deny; all allow `skill`; non-primary deny `subagent`, orchestrator allows only seven named Kiki agents. Use Task 1’s measured action/resource spelling; action wildcards cannot be assumed because existing `effectFor` compares actions literally.

- [ ] **1. Fail first:** Add `security_alternate_routes_all_eight_roles`: assert each table cell via parsed frontmatter; primary delegation to unknown agents denies. Add `security_runtime_routes` with per-role local tool counters: denied execute/MCP/web/delegation counters equal zero; allowed skills/research/named dispatch succeed.
- [ ] **2. Verify red:** Run the Task 2 unit command; expect missing route-rule failures.
- [ ] **3. Generate measured rules:** Append explicit route restrictions for every role, including primary; do not extend legacy translator known actions speculatively or treat shell rules as network-tool controls.
- [ ] **4. Verify green:** Run unit command, Task 1 integration command and `npm run build`; require passing results and no skipped enforcement checks. If MCP wildcard/tool removal semantics fail, stop for review rather than leave alternate routes open.

### Task 4: Permission waits and blocked-operation behavior

**Metadata:**
- risk: medium
- parallel: false
- depends_on: ['Task 1', 'Task 3']

**Files:** Modify `src/cli/config.ts`, `tests/cli/oc2-permissions.test.ts`; conditionally `src/server/watchdog-events.ts`, `src/server/watchdog.ts`, `tests/plugin/watchdog-events.test.ts`, `tests/plugin/watchdog.test.ts`, `tests/integration/oc2-watchdog.test.ts`.

**Interfaces:** Preserve `decodeWatchdogEvent(event: OpenCodeEvent): WatchdogEvent[]`, `createWatchdog(deps: WatchdogDeps): Watchdog`, and `Watchdog.handle`. `src/server/index.ts` already forwards decoded events. OpenCode 2.x releases use `permission.asked.data.{sessionID,id}` and `permission.replied.data.{sessionID,requestID,reply}` (observed on 2.2.6; re-verify on the actual tested 2.x version in Task 1, not invented payloads).

- [ ] **1. Fail first:** Add `security_blocked_prompt_all_roles`, asserting every prompt contains: “If a command is blocked or its approval is rejected, do not retry and do not work around it; report `PERMISSION_BLOCKED: <command>` and stop.” (Historical wording; the current prompt prepends the no-circumvention sentence and retains this stop instruction.) Update `prompt_body_only_changes_delegation` to permit only that addition. Add `permission_wait_suspends_watchdog`: existing fake-clock harness asserts zero interrupts beyond both default deadlines while pending, including overlapping/duplicate requests; unrelated children still time out.
- [ ] **2. Verify red:** `npm test -- tests/cli/oc2-permissions.test.ts tests/plugin/watchdog-events.test.ts tests/plugin/watchdog.test.ts`; expect missing prompt/pause failures where applicable.
- [ ] **3. Minimal change:** Add prompt line; override orchestrator retry instructions explicitly for permission blocks. Only if runtime waits abort, extend `WatchdogEvent` with permission asked/replied variants carrying session/request IDs; track pending IDs per child, suppress evaluation while pending, exclude waiting duration from active age and reset silence on final reply. Preserve root exclusion; clear pending state on finish/delete/stop. Test unmatched replies, late events and resumed timeout without immediate abort. Unobservable pending state after reconnect/discovery blocks rollout until safely resolved, not guessed.
- [ ] **4. Verify green:** Rerun unit command, then Task 1 command and `OPENCODE_TEST_BINARY=/absolute/path/to/opencode npm test -- tests/integration/oc2-watchdog.test.ts` using any available OpenCode 2.x binary (record the actual observed version). Require pending-wait safety and headless rejection with one attempted operation, `PERMISSION_BLOCKED`, and no fallback invocation. Fake-clock tests verify pending-wait logic only; real TUI long-wait evidence remains blocked by the bounded ruling above and blocks related rollout unless separately verified. Scripted-provider tests verify transport, not model obedience; document that limitation.

### Task 5: Separately approved current-config transition

**Metadata:**
- risk: high
- parallel: false
- depends_on: ['Task 2', 'Task 3', 'Task 4']

**Files:** Test `tests/cli/oc2-migration.test.ts`; separately approved edit `opencode.jsonc` and replacement of existing local Kiki agent copies identified in preview. Record preview/evidence in Task 1 research file; no blanket reset.

**Interfaces:** Reuse `migrateOC1(options: MigrationOptions): MigrationReport`, `translatePermissions`, `projectPermissionRules`, and `baselineAgents(config)`. Migration has **no dry-run** and preserves permissions: run only against disposable copies for preview, not as permission cleanup on the live repository.

- [ ] **1. Fail first:** Add `security_transition_preserves_unrelated_jsonc`: synthetic legacy config includes comments, non-Kiki agents, models/variants and unrelated settings; assert these survive, Kiki permissions have one generated owner, unsafe legacy grants are absent. Assert rejected/conflicting migration leaves originals byte-identical; rerun is idempotent.
- [ ] **2. Verify red:** `npm test -- tests/cli/oc2-migration.test.ts`; expect legacy unrestricted grants to violate target assertions.
- [ ] **3. Preview:** Use isolated copies with existing migration guards/backups and JSONC `modify`/`applyEdits` leaf edits; show exact Kiki permission removals, model conversion and generated replacements. Preserve unrelated keys/comments; “models-only” applies to Kiki overrides, not the entire config. Do not use `resetProject`, which removes models too, or retain migrated broad permissions alongside new frontmatter.
- [ ] **4. Approval/apply:** Present diff, affected paths, byte-preserving backup/restore and runtime evidence; wait for separate approval. Apply only that reviewed transition; changed inputs require renewed preview. Failure restores backups. Rerun fixture test and isolated enforcement suite before any approved local rollout/restart; no live remote writes.

### Task 6: Proportionate doctor and documentation

**Metadata:**
- risk: low
- parallel: false
- depends_on: ['Task 5']

**Files/interfaces:** Modify `src/cli/commands/doctor.ts` (`doctor(targetPath = '.'): Promise<void>`), `tests/cli/doctor.test.ts`, workflow text in `src/cli/config.ts`, `README.md`, and historian-maintained `CHANGELOG.md`.

- [ ] **1. Fail first:** Add `security_doctor_advisory_only`: captured output warns for wildcard/compound command shapes and npm defaults in a Python-language fixture; fixture snapshots remain identical. Add `security_approval_reminders`: output/docs mention `once`, saved grants, auto-accept and no sandbox guarantee, without claiming bypass detection or enforcement.
- [ ] **2. Verify red:** `npm test -- tests/cli/doctor.test.ts`; expect missing warning/reminder failures.
- [ ] **3. Minimal change:** Extend existing `check`/`info` reporting; do not execute configured commands, inspect credentials or scan approval databases. Keep notices advisory; historian updates only the listed docs with measured limitations, live-publish consequences and rollback asks, not a new compliance system.
- [ ] **4. Verify green:** Rerun doctor and permission tests, then `npm run build` and `npm run lint`; require passing results and preserved fixtures. Review docs against probe evidence, not assumed runtime guarantees.

## Self-review and handoff

Coverage: spec §7 → Task 1; §5.1–3/7–8 → Task 2; §5.6 → Task 3; §5.4/watchdog → Task 4; migration → Task 5; reminders/docs → Task 6. All five Review Focus conditions have named assertions. Existing interfaces remain intact; normalized watchdog variants are explicitly conditional additions. Narrower-than-spec defaults (mkdir and rollback ask; reviewed rather than automatic project commands) require approval. Six sequential tasks, no implementation bodies or new subsystem; no probes, configuration changes or commits performed. Architect review must check runtime-test sequencing and approval boundaries before implementation authorization, including the user-authorized removal of the exact 2.2.6 pin and the bounded long-wait ruling.
