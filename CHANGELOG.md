# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

- **Explicit read-only Git inspection grants for specialist agents:** the seven
  specialist roles — brainstormer, planner, implementer, gui-designer, reviewer,
  escalation and historian — now allow `git status *`, `git rev-parse *` and
  `git worktree list *` in the generated shell rules. The grants sit after the 18
  publishing asks and before the force-push denials; the orchestrator receives no
  read-only additions. Only the read-only `worktree list` subcommand is named:
  no blanket `git worktree *` rule and no new write grant is added. The grants
  are stored in the global config's role arrays; the orchestrator receives no
  new explicit Git grants.
- **Global secret edit denials:** every role now ends its edit rules with denies
  for `.env*`, `**/.env*`, `**/*secret*`, `**/*credential*`, `**/*.pem`,
  `**/*.key` and `**/id_rsa*`, so broader grants such as `src/**` or
  `.superpowers/sdd/**` cannot permit secret edits. The rules were applied to
  the global config's role arrays, not agent Markdown or project baseline copies.
- **Worktree write parity:** role-scoped edit grants cover both `.worktree/**`
  and `.worktrees/**`, including `.gitignore` for the implementer and the task
  registry for the orchestrator. The grants remain narrow; no blanket worktree
  write grant is added.
- **German/English Kiki TUI copy and scoped status footers:** all visible `/kiki`
  menu, dialog, toast and error text now comes from a typed German/English
  dictionary. The language is resolved once at startup from the first non-empty
  `LC_ALL`, `LC_MESSAGES` or `LANG`; `de`/`de_*`/`de-*` selects German, and
  everything else — including unset, `C` and `POSIX` — selects English. There is
  no manual setting or live switching; restart OpenCode to change the locale.
  Agent rows show at most one bare, scope-specific footer at the right:
  `Project` in English or `Projekt` in German for a global assignment that a
  project-local override replaces, and `Global` in both languages for a project
  assignment that inherits the global model, marking the value as inherited from
  the global scope. The footer never stacks, carries no parentheses or
  exclamation mark, and a global row without a project override has none. CLI
  and server logs, identifiers and error names are unchanged.

### Changed

- **Single-source global permissions:** install/update persists role baselines in
  global `agents.<id>.permissions`, verifies them before stripping Markdown
  permission fields, and preserves existing prompts and models. Recognized
  generated history is replaced; validated custom file grants survive, while
  unknown denies, ambiguity or comments that would be lost halt before writing.
  Init writes project metadata only. Kiki-managed project permission additions
  are bounded file/folder grants with protective masks, not shell grants or
  baseline mirrors; manually edited native overrides are not runtime-policed.
- **Grouped two-line TUI agent rows with full agent IDs:** the scope, agent and
  model selection dialogs use the host's default width (60), subject to the
  terminal's size clamp. Full agent IDs, including the `kiki-` prefix, appear in
  the agent-list headers, dialog titles and toasts; stored IDs and configuration
  keys are unchanged. Each agent is a non-selectable category header whose second
  line shows the current model or the localized OpenCode default, with the
  scope-specific bare footer at the right; only the model line is highlighted and
  a blank line separates the groups. The agent list uses OpenCode's built-in fuzzy
  search over agent name and model, while the model and scope dialogs keep their
  existing search behavior; the project-scope delete-all entry stays an ordinary,
  ungrouped action. Long model names may still clip; no wrapping is provided.

### Fixed

- **Empty watchdog content is not loop evidence:** content-loop detection now
  ignores empty or whitespace-only text and reasoning parts, and a replacement
  with no text clears that part's earlier ring evidence instead of leaving a
  stale hash. Repeated nonempty content is still detected; thresholds, grace
  behavior and permissions are unchanged.

## [3.1.1] — 2026-11-17

### Changed

- **Proportional generated workflow:** generated prompts and the workflow
  template now choose only the configured checks the change actually affects and
  report each check's exact command, scope, exit status and relevant results,
  with failure output in full and a short success summary. Status is stated
  honestly as failed, passed, skipped or not run, and an earlier PASS is cited
  only as an earlier PASS at the named work state, never as fresh evidence.
  Small, low-risk local tasks may run without persistent spec/plan files, a
  separate architect gate or a separate PASS report; normal code diffs and
  semantically relevant prompt diffs get a risk-appropriate final review, while
  pure editorial changes need no separate agent run. Plan re-review, the
  necessity catalog and parallelization checks apply only to substantial
  revisions, additions (dependency, persistence, abstraction or scope growth)
  and actual parallel work; the historian runs only for genuinely stale
  documentation. Pre-change inventory, user-file protection, permission and
  publishing boundaries, loop caps and escalation rules are unchanged. Existing
  installations receive the regenerated prompt bodies on the next ordinary
  `kiki update`; no live update or rollout was performed.
- **Five-gate Kiki release candidate:** the separate `typecheck` gate is removed
  because the build runs the same candidate-owned TypeScript compiler with the
  same `tsconfig.json` and already typechecks the files it emits; tests remain
  excluded. This equivalence is specific to Kiki's configuration. `build`,
  `test`, `lint`, `security` and `invariants` remain, and apply validation, byte
  verification and rollback are unchanged. A prior dry run is an optional
  preview; `--apply` creates and validates its own fresh candidate.

### Removed

- **Mandatory four-check/full-output contract and documentation gate:** the
  generated builder no longer requires all four configured checks with complete
  output, and there is no separate mandatory documentation completion step. The
  release gate type and execution no longer include `typecheck`.

## [3.1.0] — 2026-11-17

### Added

- **Necessity criteria in generated prompts and workflow:** a private
  `NECESSITY_CRITERIA` block is interpolated exactly once into the brainstormer,
  reviewer and workflow generators under both default and custom path configs,
  and the planner prompt gains in-boundary technical-ownership guidance.
  Proportionally to the change, reviewers judge existing capabilities and
  sources with bounded, observed probes for negative claims, the
  do-nothing/reuse alternative, the real tradeoff for duplicate persistence,
  dependencies or abstractions, unique value and coupling cost from existing
  spec/plan/code substance — no mandatory Necessity section, record, per-field
  catalog, waiver format or extra review phase. Scrutiny is cumulative: plan
  review reassesses the spec with the plan's new evidence, and code review
  rechecks plan and spec adequacy in light of implementation evidence, reusing
  evidence rather than repeating the analysis. A `FAIL`'s Reason follows the
  flaw's root cause through the existing `spec`/`plan`/`implementation` routing,
  caps and downgrade rule. The reviewer may reject a technically implementable
  but concretely evidenced unnecessary, duplicative, insecure or
  disproportionately complex choice despite a written rationale or prior
  approval; product goals, informed explicit user decisions, existing
  severity/downgrade rules and the no-taste-veto limit still apply.
  Orchestrator, implementer, gui-designer, escalation and historian prompts,
  permission arrays, frontmatter, exported types, the workflow registry schema
  and Superpowers remain unchanged. Static prompt and
  install/update delivery tests cover the wording; prompt-level guidance does
  not prove live model obedience, and no measured quality, savings or
  equivalence is claimed. Existing installations receive the regenerated
  prompt bodies on the next ordinary `kiki update`; no live install, update or
  rollout was performed with this change.
- **Opt-in lightweight usage diagnostics:** one metadata-only ledger
  (`.agentic/kiki/run_ledger.jsonl`, off by default) records declared dispatch
  task/kind/optional comparison group and observed child-session status,
  durations, retries and five token counters; `kiki stats [path]` summarizes
  declared invocations, observed sessions, watchdog incidents joined by session
  ID and current registry reference paths without a model call. No prompts,
  diffs, source or transcripts are stored. Declared counts and observed session
  tokens stay unjoined because no verified dispatch-to-child binding exists, so
  task/comparison token attribution is unknown. The ledger is append-only and
  has no rotation. Manual comparisons remain an explicitly requested
  orchestrator-delegated workflow in fresh separate worktrees at one starting
  revision under ordinary permissions; worktrees are not sandboxes and no
  quality, savings or equivalence is claimed. No measured savings are claimed.
- **Bounded loop controls and review governance in generated agent prompts:**
  the reviewer reports exactly one of `PASS`, `PASS_WITH_NOTES` or `FAIL`, with
  `Reason` (`implementation` | `plan` | `spec` | `user-decision` |
  `environment/permission`), `Severity` (`critical` | `major` | `minor`) and
  `Evidence` per blocking item; minor or incomplete-evidence items downgrade to
  non-blocking notes, which go to the review document and phase prose rather
  than `reviewNotes`. An implementation FAIL earns one fix round, a plan FAIL
  returns to the planner and must re-pass review, spec and user-decision FAILs
  stop for the user, and environment/permission FAILs are terminal. A second
  failure is classified user-only versus technical before escalation, which is
  limited to one technical-deadlock diagnosis per task with five possible
  recommendations (Fix with guidance, Rewrite plan, Rewrite spec, Split,
  Stop-needs-user). Prompt-level caps are one dispatch retry, two review rounds,
  one escalation, and stop on the same failure twice; retries and fix rounds
  increment the existing `failures` field, review rounds stay in phase prose,
  and the watchdog remains the wall-clock backstop. The token/wall-clock budget
  engine remains deferred.
- **Fixed guardrail block in all eight generated agent prompts:** the three
  default guardrails plus their stop-and-report rule appear verbatim exactly
  once per prompt; the reviewer reads the active project's
  `.agentic/kiki/alignment.json` fresh in every review to catch custom rules,
  and a violation is critical (implementation, or spec when demanded). The
  block is a constant, not per-project generation; dynamic injection is
  deferred.
- **Builder evidence handoff and explicit blocking:** implementer and
  gui-designer run the configured build/test/lint/security commands, record
  exact command output, and report `BLOCKED` with `Blocker:`, `Tried:` and
  `Need:` instead of silently retrying or working around a blocker. The
  reviewer judges the diff and recorded evidence without rerunning checks, and
  the orchestrator runs no project checks.
- **Loop-control and delivery regression tests:** static assertions cover
  verdict/report fields, routing, caps, escalation, builder handoff, guardrails,
  alignment checks and plan ownership (R1–R13, R15, R16); sandbox install/update
  tests assert the delivered prompt bodies and preserved native settings.
- **Publishing-gated generated agent permissions:** all eight roles, including
  the orchestrator, get `allow shell *` first so routine local work runs without
  prompts. After it come 18 `ask` rules for publishing and remote-changing
  commands — `git push*`, `gh pr merge*`, `gh release*`, `gh workflow run*`,
  `scalingo *deploy*`, `railway up*`, `railway deploy*`, `ssh*`, `sftp*`, `scp*`,
  `rsync*`, `lftp*`, `ftp*`, `curl*`, `wget*`, `npm publish*`, `yarn publish*`
  and `pnpm publish*` — and five force-push `deny` rules last. Obsolete legacy
  exact shell allows were removed as subsumed by the wildcard; configured
  build/test/lint/security values are no longer separate grants. Force-push
  matching is unit-tested only; runtime matching is not probed by that coverage.
  The corrected scope was approved and applied on 2026-11-13, replacing an
  earlier blanket ask-first draft that made routine local work impractical. The
  user-authorized local migration applied V2 permissions to `opencode.jsonc` and
  removed temporary exact-path edit grants while preserving the permanent SDD
  workspace grants; `kiki update` refreshed the active global prompts.
- **Alternate-route rules for all eight roles:** Code Mode `execute` denied for
  every role including the orchestrator, `webfetch`/`websearch` allowed only for
  the brainstormer and planner, `skill` allowed, delegation denied except the
  orchestrator's seven named Kiki subagents, and arbitrary MCP server tools
  closed with a generic `*_*` action deny. No blanket external-directory
  re-allow is added: only the four roles with pre-existing narrow `/tmp/**` and
  `tmp/**` grants keep them after that deny, and the other four stay denied.
  Applied to the live project configuration with the V2 permission migration.
- **Blocked-operation and watchdog behavior:** every generated prompt instructs
  agents not to circumvent publishing-route approval via scripts, wrappers,
  alternate tools, APIs or delegation, to request approval for the intended
  publishing operation, and — if approval is rejected — to report
  `PERMISSION_BLOCKED: <command>` and stop instead of retrying or working around
  it; the watchdog tracks pending permission requests per child and pauses stuck
  evaluation while an approval is pending. Covered by fake-clock tests. Real TUI
  long waits (300,000 ms / 3,600,000 ms), reconnect/reload pending state and
  model obedience remain PENDING.
- **Doctor advisories and approval reminders:** `kiki doctor` now warns
  (advisory, non-failing) about wildcard or compound configured command shapes
  and about npm default commands in a non-Node project, and prints informational
  approval reminders: answer `once` for remote-changing operations, `Always`
  saves a grant that later runs without asking, auto-accept answers every
  pending request, and these notices are not a sandbox. Wildcard/compound
  configured values, network-client or interpreter heads, and values containing
  shell metacharacters remain doctor warning targets, but they no longer control
  execution: `allow shell *` covers routine local commands, and only the 18
  publishing patterns ask. Doctor never executes a configured command or scans
  the approval database.

### Changed

- **Reviewer, orchestrator, escalation and workflow prompt contracts
  replaced:** binary `PASS`/`FAIL` became the three-verdict report above;
  unconditional twice-failed escalation became reason-based routing with a
  user-only checkpoint; escalation now receives both review reports, the diff
  and recorded evidence, may reproduce in the tree or a `/tmp/opencode` scratch
  copy, and writes only one report plus an optional unapplied patch under
  `.agentic/reviews/*`, with no source edits, publishing, remote writes or
  permission changes (prompt-level restrictions). Plans remain machine-owned
  only within an unchanged user-approved spec.
- **Agent prompt bodies changed for existing installations:** the new prompts
  and guardrail block ship in the generated templates and are picked up by the
  next `kiki update`. No commit, global install, real `kiki update`, or rollout
  was performed with this change.
- **Verification and enforcement limits:** enforcement is prompt-level, not a
  sandbox; the permission arrays and watchdog remain the mechanical backstops.
  Static tests prove the prompt wording is present, not that a model obeys it,
  and the behavioral outcomes remain observe-in-use. In this change's final
  verification run, with `OPENCODE_TEST_BINARY` set, the serial full suite
  reported 46 files passed and 2 skipped, 682 tests passed, 2 skipped and 0
  failed; `npm run build`, `npm run lint` and `npx tsc --noEmit` all exited 0,
  and the 2 skips are by-design opt-in release tests. The four integration
  failures seen in an earlier run occur only when that prerequisite is unset
  and are unrelated to this change. `npm audit` reported 32 pre-existing
  moderate findings with no dependency changes.
- **Corrected shell scope (2026-11-13):** the earlier blanket `shell *` → `ask`
  generated policy was too broad and made routine local work impractical. It was
  replaced by `allow shell *` plus 18 publishing/remote-changing asks and five
  force-push denies, together with the no-circumvention prompt line. Read/file
  denies, edit scopes and execute/MCP/webfetch/websearch/skill/subagent/
  external-directory rules are unchanged. The live `opencode.jsonc` was updated
  to the corrected scope and `kiki update` refreshed all eight active global
  prompts. The command gates protect known publishing routes only; they are not
  an adversarial sandbox, and allowed local scripts can still perform network
  actions.
- **Runtime state is local-only (repository maintenance):**
  `.agentic/kiki/routing_log.jsonl`, `.agentic/kiki/health_log.jsonl` and
  `.agentic/kiki/migration.json` are Git-ignored. The previously tracked routing
  log is removed from the index while the existing local file is kept. No
  runtime format, retention or behavior changed.
- **Project watchdog threshold:** this repository's `.agentic/kiki/config.json`
  sets `health.stuckThresholdMs` to 600000 ms (10 minutes) for all child
  sessions in the project. This is project configuration only; the generated
  default remains 5 minutes.

### Security

- **Local V2 policy applied and corrected:** following user approval, the live
  project `opencode.jsonc` uses native V2 permission arrays with the corrected
  shell scope (routine local allow, 18 publishing asks, five force-push denies).
  Earlier, under the ask-first draft, the user confirmed a root-visible
  permission prompt for an orchestrator-dispatched implementer's harmless
  `printf` command; it returned the expected output and the selected approval
  option was not recorded. That historical observation is manual evidence of the
  subagent ask path, not a complete live-policy certification. Direct
  orchestrator gate verification, TUI rejection/Always/auto-accept and remaining
  wait/reconnect checks are pending. Focused permission/migration/install/doctor
  tests passed 62/62 and the full suite with real OpenCode 2.2.7 passed 659,
  skipped 2, failed 0; build/tsc/lint were clean.
- **Approval is conditional, not a boundary:** saved `Always` grants
  (project-scoped command prefixes) and auto-accept bypass later asks. Kiki does
  not detect or enforce around them; this is mistake protection, not a sandbox,
  and approving a publish means "make it live", not that the code is safe.
  Automated evidence is on OpenCode 2.2.7 only. TUI `Always`/auto-accept, real
  long waits (300,000 ms / 3,600,000 ms) and saved-grant inventory remain
  PENDING. Alternate-route enforcement was measured in Task 3; the task registry
  subsequently records a passing route suite after final `external_directory`
  narrowing on OpenCode 2.2.7.

## [3.0.1] — 2026-11-11

### Fixed
- **Standard OpenCode config directory:** OpenCode 1 and OpenCode 2 both use
  `~/.config/opencode`, so Kiki no longer treats the presence of
  `opencode.json(c)` there as proof of a V1 Kiki installation. The guard now
  keys only on V1-specific Kiki files (`plugins/kiki.*`, `kiki/tui.js`,
  `kiki/prompts/`); a generic `tui.json(c)` is no longer a marker.
  `kiki install`/`update` may back up and remove stale artifacts in the
  standard directory. No wrapper or XDG overrides are required.
- **No OpenCode binary version gate:** `kiki doctor` no longer probes
  `opencode --version` or warns when the installed OpenCode is newer than
  `2.2.6`. Kiki targets OpenCode V2; `2.2.6` remains the validated baseline,
  not a runtime requirement.

## [3.0.0] — 2026-11-10

### Added
- **Kiki 3.0.0 OC2-only port:** support for OpenCode exactly 2.2.6 with the exact runtime dependency `@opencode/plugin@2.2.6`; package exports `./server`, `./tui` and `.`.
- **Native OC2 agent files:** eight Kiki agent Markdown definitions with `mode`, ordered `permissions` rules and package-style server/TUI registration. `experimental.subagent_depth` remains `1` in the isolated machine configuration.
- **Fail-closed OC1 migration:** `kiki migrate [--from <sanitized-dir>] [--project <path>] [--force]` translates OC1 models/permissions into native `agents.<id>.model` objects and ordered rule arrays. The source is read-only; credential-bearing sources are refused; per-agent rejections are reported; successful runs write a marker and `--force` creates a fresh backup.
- **Parallel OC1/OC2 runbook and acceptance evidence:** user-operated wrapper/root isolation, rollback guidance, and separate ACTUAL_V3_VALIDATION, RELEASE_REHEARSAL and FUTURE_RELEASE_AUTHORIZATION status reporting.
- **Task 13 final acceptance evidence:** actual final-snapshot tarball `952be150…` (input manifest `74bccc17…`, dist `f0da220c…`, pack manifest `14005d97…`), 24/24 required real-binary tests with zero skips, 632-pass/2-by-design-skip full suite, fresh audit 0 high/critical/32 moderate with no exception, and a PASS synthetic 2.4.0→3.0.0 release rehearsal with no apply.

### Changed
- **Configuration format:** V2 native `agents.<id>.model` objects, ordered `permissions` arrays, and `plugins` lists replace V1 `agent`/`permission`/`plugin` shapes. Kiki never writes top-level `permissions`.
- **Install/update ownership:** `kiki install`/`kiki update` write Kiki-owned native agent Markdown files and back up existing targets before writing. User models and existing frontmatter permissions are preserved. Regenerating the Kiki-owned prompt body is the V1-equivalent baseline; preserving user edits to those global bodies would be a separate post-switch ownership change, not a migration blocker.
- **Routing:** `kiki routing` is retired and prints a read-only migration notice; models are configured only in native OpenCode configuration.
- **Parallel wrappers:** the isolated OC2 wrapper sets `OPENCODE_CONFIG_DIR` plus all four XDG roots; `opencode` targets OC2 and `opencode-v1` targets the retained OC1 binary. The frozen V1 TUI loader target stays detached from the moving development checkout.

### Removed
- **OC1 plugin runtime:** the generated V1 plugin source, OC1 compatibility adapter and `globalThis` dedup shim are retired for the OC2 package plugin.
- **V1 config keys and model seeding:** fresh setup writes no model values and does not use `.agentic/kiki/config.json` as a model source.

### Security
- **Fresh audit completed:** the 2026-11-04 exception for the retired `@opencode-ai/plugin@1.18.35` graph does not apply to Kiki 3.0.0. The final audit of the actual `@opencode/plugin@2.2.6` graph reported 0 high, 0 critical, 32 moderate, 0 low and 0 info across 454 dependencies, with no exception supplied. The moderate findings are non-blocking under the existing gate policy. The user accepted 3.0.0 and authorized commit, release and push on 2026-11-10.
- Credential handling remains metadata-only; Kiki does not read, copy or print `.env`, `auth.json` or provider credentials. Provider login is user-owned.

## [2.4.0] — 2026-11-09
### Added
- support role-scoped permissions in project worktrees

## [2.3.0] — 2026-11-04

### Added
- **Release security exception:** `kiki release --security-exception <reason>` requires a non-empty reason and changes only the high/critical block decision when the audit produced complete evidence. The audit still runs and all counts are still reported; low/moderate behavior and no-flag output remain unchanged. INCOMPLETE audits (unavailable, malformed or subprocess failure) still fail closed and can never be excepted. An excepted result reports `security: passed with approved exception (N high, M critical; reason: …)`, never a clean pass, with the reason in the gate line, report header and manual-next-steps block. Motivated by 4 high advisories in the `@opencode-ai/plugin` type-only import graph (accepted 2026-11-04).
- **Safe local release preparation (`kiki release`):** dry-run by default, with `--apply`, `--bump auto|major|minor|patch`, `--since <ref>` and help. A tracked-only candidate is built outside the checkout with byte-copied dependencies; build, Vitest, source typecheck, source lint, full-tree `npm audit` and release invariants run only in that candidate. Includes deterministic changelog generation and validation, exact-version baseline discovery with `--since` fallback, dist collision refusal, backup/rollback and full post-apply byte verification. It never commits, tags, pushes, publishes or runs remote release actions.
- **Doctor skill observations:** required skills are discovered across project, user, XDG config and the nested superpowers package-cache layout. Missing skills, name drift and duplicate copies are reported; the observed superpowers version is compared with the tested `7.0.1` observation without a support floor. All skill findings are warnings/info and never change the exit code; doctor states that it verifies disk presence only.
- **Source-only lint foundation:** `npm run lint` runs flat-config ESLint on `src/**/*.ts`; source typecheck remains a separate `tsc --noEmit` gate, and tests remain covered by Vitest. Development/lint requires Node `^20.19.0 || ^22.13.0 || >=24` (minimum 20.19.0, Node 21/23 excluded) due to the transitive graph; runtime `engines.node` remains `>=18.0.0`.

### Changed
- **Model-slot retirement:** init asks no model questions and no Kiki path seeds model values; fresh installs inherit OpenCode defaults. Existing agent model values and permissions remain preserved by install/update/migrate. Legacy `models` sections are tolerated, ignored on load, never rewritten and reported informationally by doctor; install/update print the `/kiki` model-selection hint.
- **Doctor model reporting:** agent model presence is informational, showing the resolved model or inherited OpenCode default (set via `/kiki`); a fresh install with no configured models no longer fails.

## [2.2.0] — 2026-11-03

### Changed
- **Global-only installation:** Kiki agents now use native OpenCode JSON configuration with global prompt files and one global plugin. `kiki update` refreshes the global installation while preserving approved permissions, model choices, unrelated OpenCode settings and all project files. Project init creates metadata and JSON agent settings instead of local runtime copies.
- **Native model selection:** configure `agent.<name>.model` in global/project OpenCode configuration. `kiki routing` now prints a read-only retirement notice; doctor/status use native JSON configuration.

### Added
- **Native `/kiki` menu:** select global model changes (default) or project-specific changes, choose a Kiki agent, then search OpenCode's available models in a native dialog. Saves only the chosen model in OpenCode JSON/JSONC, preserving permissions and comments; reports existing project overrides. Installed globally through a separate TUI loader, with real OpenCode 1.18.35 terminal integration coverage.
- **Local model reset via `/kiki`:** in the project scope, an agent with a local override offers "Globales Modell (<model>) verwenden" to delete just that local `model` key, and the agent list offers "Alle lokalen Modell-Zuordnungen löschen" (with confirmation) to remove all local Kiki model overrides across every project config tier; global models apply again after an OpenCode restart. No delete is offered in the global scope.
- **No implicit local model values:** `kiki init --project` writes local `agent.<name>.model` keys only for explicit non-default choices, and `.agentic/kiki/config.json` now persists only non-default model preferences, so built-in default changes cannot leak into project configs later. Local model values added via `/kiki` or file edits are always preserved by init/update/migrate.
- `kiki migrate --project <path>` extracts old agent permissions/models, imports legacy routing selections, backs up originals and removes redundant local agents/plugins. Global updates similarly migrate old global Markdown agents.
- `kiki reset --project <path>` resets Kiki agent overrides to global defaults while preserving unrelated configuration, tasks, reviews and project metadata.
- Global/project configuration edits preserve JSONC comments; help and invalid installation/update arguments do not write files. Integration coverage verifies global prompts with local rights/models against OpenCode using an isolated home directory.

- Subagent watchdog in the generated OpenCode plugin: automatically detects hung subagent sessions (no message parts or token growth for `health.stuckThresholdMs`, default 5 min), output/tool loops (3 identical repetitions), and sessions exceeding `health.absoluteMaxMs` (default 60 min), then aborts them so the orchestrator's retry/escalation flow resumes without manual intervention. Incidents are logged to `.agentic/kiki/health_log.jsonl`. Configurable via the new `health` section in `.agentic/kiki/config.json`.
- **Plugin deduplication fallback:** dedup-aware copies share ownership through `globalThis[Symbol.for('kiki.plugin')]` keyed by project root. First-loaded wins; later copies yield and diagnose version differences. Pre-dedup copies must be removed using project migration; normal operation now uses one global plugin.
- **Release checklist:** `KIKI_VERSION` in `src/cli/config.ts` (baked into the generated plugin as `KIKI_PLUGIN_VERSION`) must be updated alongside `package.json` on every release. A unit test asserts they match at test time.

## [2.1.0] — 2026-06-23

### Added
- **Security command** (`commands.security`) — default `npm audit`, configurable per project, validated by `kiki doctor`
- **Rollback safety** in implementer template — records pre-implementation state and safely reverts tracked changes and newly created untracked files without touching existing user files
- **Implementation Summary** in implementer template — short handoff summary for reviewer and historian
- **Reviewer verdict format** — `PASS/FAIL` with numbered blockers instead of verbose prose reviews

### Changed
- **Reduced token consumption** — agent prompts streamlined by removing redundant footers and compressing instructions (approx. 21% fewer characters in agent templates)
- **Init wizard** now asks for security command alongside build, test, and lint
- **Doctor** validates `commands.lint` and `commands.security`

## [2.0.0] — 2026-06-18

### Added
- **Interactive setup wizard** (`kiki init`) — asks about paths, models, changelog, decisions, knowledge base, build commands
- **Config-driven scaffolding** — all agent templates are generated from `.agentic/config.json` paths and models
- **Paths configuration** — `source`, `tests`, `docs`, `superpowers`, `changelog`, `readme`, `decisions`, `knowledge`, `taskRegistry`
- **Models configuration** — `standard` and `critical` model settings
- **`kiki doctor`** — validates config, paths, models, routing, agent files, and orchestrator safety
- **Explicit read/write permissions** for all subagents (brainstormer, planner, implementer, reviewer, historian)
- **Parallel task execution** with wave-based dispatch
- **Per-task metadata** — `risk`, `parallel`, `depends_on` fields in planner templates
- **Reviewer parallelization validation** — checks circular dependencies, file conflicts, dependency chains
- **Auto-build on install** — `prepare` script runs `tsc` during `npm install`

### Changed
- **Installation** — now works directly from GitHub: `npm install -g github:luxuxorg/kiki`
- **Agent templates** — regenerated from config instead of hardcoded strings
- **Historian** — now manages decisions and knowledge base if configured
- **Orchestrator** — no `permission:` blocks (OpenCode crash prevention for `mode: primary`)
- **Reviewer bash permissions** — restricted to `git diff*`/`git log*` only
- **Plugin** — self-contained with zero external dependencies

### Removed
- **prepublishOnly** script — was causing race conditions during GitHub install
- **dist/ from git tracking** — built automatically on install via `prepare`
- **Benchmark-cache and pricing modules** — simplified to static routing only

## [1.0.0] — 2026-06-12

### Added
- Initial release with 7 subagents (orchestrator, brainstormer, planner, implementer, reviewer, escalation, historian)
- Static routing table with skill+domain+risk model selection
- Smart-merge update command
- Verification command for TBDs/TODOs
- Self-contained OpenCode plugin
