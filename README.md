# Kiki — OpenCode 2 Agent Orchestration

Kiki 3.2.0 is the current OpenCode 2 (OC2) release of Kiki. It installs native OC2 agent
definitions and a package-style server/TUI plugin for the Intake → Brainstorm → Plan →
Architect Review → Implement → Review → Document → Complete workflow. Small, low-risk
local tasks may use the shorter intake → implement → risk-appropriate review → complete
path without persistent spec/plan files or a separate architect gate. Project
configuration is kept separate from Kiki updates.

Kiki 3.2.0 targets OpenCode V2 and is OC2-only. Its OC2 security-boundary
integration suite passed against OpenCode **2.3.2** during 3.1.1 verification;
the 3.0.0 baseline was **2.2.6**. OpenCode 1 is deprecated; there is no parallel
V1/V2 setup.

## Who Kiki is for

Kiki is for people who own the product but not every implementation detail —
product owners, designers, and solo builders. You decide what gets built and
approve the result; a structured team of agents plans, implements, reviews, and
documents it. If you're comfortable with OpenCode, you will be comfortable with
Kiki.

**Status:** 3.0.0 accepted for release by the user on 2026-11-10, after live OC2/V1
startup and `/kiki` smoke checks. Automated **ACTUAL_V3_VALIDATION** and the synthetic
**RELEASE_REHEARSAL** passed, including an audit with 0 high/critical and 32 moderate
findings and no exception. Live model migration, provider login and the optional
rollback drill are user-owned; unreported checks are not claimed. See
[`docs/migrations/kiki-3-oc2-acceptance.md`](docs/migrations/kiki-3-oc2-acceptance.md).

**Security boundaries:** Kiki's generated agent defaults are a lean 74-entry
baseline: 59 per-role lines (allow `shell *`; ask `kiki permissions add *` and
`kiki permissions remove *`; deny `edit *`, then allow only the role's own edit
territory; a final `git push *` ask), one managed top-level `permissions` entry
asking for `git push *`, and a managed top-level `policies` block with 14 secret
read/edit denies. `kiki permissions list|check` need no own rule because they
run under the allowed shell. The seven secret patterns are denied for both
reading and writing for every agent, including against later saved grants,
because policies are checked after permissions and can never allow (see
[Security boundaries and approvals](#security-boundaries-and-approvals)). The
2026-11-20 consolidation moved the role baselines to the global config's
`agents.<id>.permissions` arrays and removed permissions from agent Markdown; the
2026-11-23 baseline simplification reduced the 569-rule catalog to this form and
retired the publishing-ask catalog, force-push denies, alternate-route rules,
per-role read allows and worktree mirror rules. Publishing beyond `git push` and
tool routes are now prompt-governed behavioral rules, not mechanical gates.
Role territories apply in worktrees when OpenCode resolves the patterns per
working directory; the probe passed and no separate worktree mirror rules are
emitted. User entries at the two managed top-level locations are preserved and
Kiki's marked fragments follow them; a changed managed fragment stops the
update with evidence. Project configs still hold only explicit additions.
On 2026-11-13, before the simplified baseline, the user confirmed that an
orchestrator-dispatched implementer's harmless `printf` command raised a
permission prompt in the root UI and returned its expected output; the approval
option was not recorded. That historical observation verifies the subagent ask
path under the earlier ask-first policy, not the current rule set or every
remaining approval/wait scenario.

## Requirements

- Runtime Node `>=18.0.0`.
- OpenCode V2 for the Kiki server and TUI entrypoints. Kiki 3.0.0 was validated
  against `2.2.6`; the 3.1.1 verification run additionally passed the OC2
  security-boundary integration suite against `2.3.2`. That focused run does not
  certify every V2 hook path. Newer V2 releases are not gated by `kiki doctor`.
- Runtime dependency `@opencode/plugin@2.2.6` (exact pin). The package exports
  `./server`, `./tui` and `.` and ships `dist/`.
- `experimental.subagent_depth: 1` and `update: "disable"` in the global
  OpenCode configuration.
- OpenCode 1 and OpenCode 2 share the standard global paths
  (`~/.config/opencode`, `~/.local/share/opencode`, `~/.cache/opencode`,
  `~/.local/state/opencode`). Kiki 3 needs no wrapper and no environment
  overrides: run `opencode` directly. `OPENCODE_CONFIG_DIR` and the XDG
  variables remain supported when separate roots are wanted deliberately;
  `OPENCODE_CONFIG_DIR` overrides the config root only, while data, cache and
  state still follow their XDG roots.

## Installation and updates

From a built checkout, the validated local form is:

```bash
npm ci
npm run build
node dist/cli/index.js install
```

Run `kiki` normally. It writes to the standard global OpenCode config directory
(`~/.config/opencode`); no wrapper or environment overrides are required.
`kiki install` writes the eight native agent Markdown files, the workflow reference and
the package registrations, backs up existing Kiki-owned targets, and asks for an
OpenCode restart. Kiki 3 is OC2-only and has no OpenCode 1 import step: set up the
global installation directly and configure models natively.

Use this form only for an actual checkout or local package you have built and reviewed.
Do not assume that a published `kiki@3.0.0` package, an `npm install -g` path or a GitHub
install target is available. The release registration form
(`opencode plugin add kiki@<version>`) is valid only when a validated candidate package
is actually available and a release has been separately authorized.

To refresh a global installation:

```bash
kiki update
# equivalent: kiki update --global
# OpenCode reloads configuration changes; use /reload to force a refresh.
```

`update` changes only the global installation and never project files. It writes
the canonical lean role permissions to global `agents.<id>.permissions`, keeps
one marked top-level `permissions` ask (`git push *`) and a marked top-level
`policies` block with 14 secret read/edit denies, verifies all of them, then
removes permission fields from the native agent Markdown. Kiki appends its
fragments after existing user entries and preserves user rules at both managed
locations. Existing prompts, other frontmatter and config-level models are
preserved; fresh agent files use the installed templates. Previous files are
backed up. Each exact `(action, resource, effect)` tuple that matches the role's
known generated defaults — its recorded history or the fresh baseline — is
retired, and the fresh role defaults are written; unknown custom rules keep
allow, ask and deny effects in stable encounter order. Comments inside a
permissions array that would be lost still stop the update before writing. A
changed, duplicated, reordered or partially removed managed top-level fragment
stops the update before any write with the file, location and expected/observed
evidence. `kiki install --force` does not bypass these checks.

A failed write or verification restores the original files; if restoration is
incomplete, the error reports the failures and the backup directory. The global
update path keeps its pre-existing post-write verification; it does not add an
exact pre-write byte precondition for a concurrent external edit.

There is no ownership hash or drift gate. Any existing `kiki/state.json` (for
example `~/.config/opencode/kiki/state.json`) is ignored and left untouched:
install/update neither reads, writes nor deletes it.

**Prompt preservation:** `update` adds or refreshes only the managed baseline
behavior section and the binding consent line; it does not regenerate the rest
of an existing agent prompt body. Project prompt overrides remain separate: a
project file such as `.opencode/agents/kiki-reviewer.md` replaces the global
prompt for that project and does not receive later global prompt updates.

## Using Kiki in OpenCode

Select **kiki-orchestrator** as the main agent and describe your task. It coordinates
design, planning, implementation, review and documentation.

To change a Kiki agent's model, use the native terminal menu:

The menu copy follows the locale resolved once when OpenCode loads the Kiki TUI plugin:
the first non-empty `LC_ALL`, `LC_MESSAGES` or `LANG` selects German for
`de`/`de_*`/`de-*` and English for everything else, including unset, `C` and `POSIX`.
There is no manual language setting and no live switching; restart OpenCode after
changing the locale.

```text
/kiki
  → Modell ändern — global / Change model — global   (default)
    → Select the agent
      → Search and select a model
        → Saved; restart OpenCode
```

Choose **Modell ändern — dieses Projekt** / **Change model — this project** instead for a
project-specific model. The scope, agent and model selection dialogs open at the host's
default dialog width (60), subject to the terminal's own size clamp. Agent names appear
in full, including a `kiki-` prefix; that full ID is used in the agent-list header,
dialog titles and toasts, while saved IDs and configuration keys are unchanged. The
agent list uses each agent name as a non-selectable category header and shows the
current model, or the localized OpenCode default, on the next line; only that model line
is highlighted, and a blank line separates the groups. A bare scope-specific footer
appears at the right where it applies: `Project` in English or `Projekt` in German for a
global assignment that a project-local override replaces, and `Global` in both languages
for a project assignment that inherits the global model, marking the value as inherited
from the global scope. The footer never stacks and has no parentheses or exclamation
mark; a global row without a project override shows none. The agent list uses OpenCode's
built-in fuzzy search over agent name and model; the model and scope dialogs keep their
existing search behavior. The project scope's delete-all entry remains an ordinary,
ungrouped action. Long model names may still clip; the menu does not wrap them. The
picker uses OpenCode's native searchable selection dialog and provider/model data. It
sends no LLM request and does not change the active chat's model.

Only the selected `agents.<name>.model` object is saved. Permissions, prompts, other
settings and JSONC comments remain intact. A global change keeps existing project
overrides and tells you when one still takes precedence. Escape cancels before model
selection without saving. Selecting the already-effective inherited model is a
conservative no-op: no model write occurs and the existing toast text is unchanged. That
behavior is documented and is not an urgent decision; it can be observed during the
Task 14 save/removal drill.

To remove a project-local override, open **Modell ändern — dieses Projekt** /
**Change model — this project**, pick an agent that has one, and choose
**Globales Modell (<model>) verwenden** / **Use global model (<model>)** at the top of
the model list. The project agent list also ends with **Alle lokalen
Modell-Zuordnungen löschen** / **Delete all local model assignments**, which removes
every local Kiki model override after a confirmation. Both delete only the local `model`
key — permissions, prompts, other settings and comments stay intact — and the global
model applies again. No delete is offered in the global scope, since global values are
the defaults themselves.

The menu is registered globally through the OC2 `cli.json` plugin list by
`kiki install` / `kiki update` and requires an OpenCode restart. It is tested against
OpenCode 2.2.6. It is a separate TUI entrypoint; the server routing/watchdog plugin stays
unchanged.

## Project setup

```bash
kiki init .
# Equivalent: kiki install --project .
```

The wizard asks for project paths and build/test/lint/security commands. It creates:

- `.agentic/kiki/config.json`: project paths, build/test/lint/security commands and
  watchdog settings.
- `.agentic/kiki/alignment.json`: project guardrails.
- `.agentic/kiki/TASK_REGISTRY.json`: workflow state.

Initialization writes no OpenCode project config and no baseline permission
mirrors; it validates existing project permissions without rewriting them.

The wizard asks no model questions and fresh project setup writes no `model` keys.
Agents inherit the OpenCode default unless a model is chosen explicitly with `/kiki` or
by editing native configuration. Existing local model values are user data and are
preserved by init and update. A legacy `models` section in
`.agentic/kiki/config.json` is tolerated and ignored, but is never rewritten or used to
seed agents; setup is not a model source.

It creates **no local plugin or agent copies**. Reinitialization preserves existing
metadata, task state, permissions and models. Global agents read project paths and
commands from `.agentic/kiki/config.json`.

## Models and permissions

OpenCode merges global and project `agents` settings. Models are objects, and Kiki
permissions are ordered rule arrays. The complete role baselines live only in
the global config; agent Markdown carries no permission fields. For example,
a project `opencode.jsonc` can select a reviewer model:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "agents": {
    "kiki-reviewer": {
      "model": { "providerID": "openai", "model": "gpt-6.1-sol" }
    }
  }
}
```

Kiki-managed project permissions are bounded additional file/folder read or edit
grants, not replacement baselines or shell grants. Unsupported paths and grants
crossing protected role boundaries are rejected; necessary file-protection masks
follow accepted grants so secret descendants remain denied. Models are independent.

Kiki also maintains two marked top-level fragments in the global config: one
`permissions` entry asking for `git push *`, and a `policies` block with 14
secret read/edit denies. User entries at both locations stay untouched and
Kiki's fragments follow them; Kiki recognizes its own entries on every update
and stops with file, location and expected/observed evidence if a managed
fragment was changed. Rules are evaluated in order and later matching rules
win, so a manually edited permission rule can override an earlier baseline.
Policies are evaluated after all permission rules and saved grants, can never
allow, and therefore bind every agent. Kiki validates its own writes, not
arbitrary external edits; no runtime enforcement hook is installed. File-tool
restrictions are not a shell sandbox.

### Managed project permission requests

`kiki permissions` manages only project OpenCode configuration. It never edits
global policy, prompts or Markdown. The lean global baseline does not change its
behavior: `list` and `check` are read-only and print
permission rule metadata only — scope, file, agent, index, action, resource and
effect. `check` reports conflicts such as duplicate agent keys, legacy baseline
mirrors and unsafe surviving asks, and exits non-zero when it finds one. Neither
subcommand writes files or prints provider, model or prompt settings.

```text
kiki permissions list [--project <dir>] [--agent <name>]
kiki permissions check [--project <dir>] [--agent <name>]
kiki permissions add <literal-resource> --agent <name> --action read|edit [--project <dir>] [--file <project-config-path>] --apply
kiki permissions remove --agent <name> --entry <index> --action <action> --resource <literal-resource> --effect allow|ask|deny [--project <dir>] [--file <project-config-path>] --apply
```

`--project` defaults to the current directory. The target is the project's sole
existing config among `opencode.json`, `opencode.jsonc`,
`.opencode/opencode.json` and `.opencode/opencode.jsonc`, or `opencode.jsonc`
when none exists; if multiple exist, `--file` is required and must name one of
those candidates. `add` and `remove` are previews by default and write only with
explicit `--apply`. Writes use the existing backup → patch → verify → rollback
transaction into `.agentic/kiki/backups`, preserve unrelated JSONC bytes and the
file mode, and refuse a target that changed since planning, duplicate agent
keys, or comments inside the permission array that would be lost. A write is
also refused if the selected project path is outside the project or overlaps
the global configuration root; no general symlink-target enforcement is
claimed.

`add` creates one narrow literal file or directory `allow` grant for `read` or
`edit` only. The unchanged project validator rejects secret, role-boundary and
publishing violations; redundant grants, grants already covered by an inherited
or local allow, and grants that a retained restriction would override are
refused. Re-adding an already-covered grant is refused without writes. The CLI
intentionally does not expose every validator-supported form: for example,
`external_directory`/`/tmp` rules remain hand-addable only.

`remove` deletes exactly the entry selected by zero-based `--entry` plus its
exact action, resource and effect tuple. It can remove a user-handwritten
project entry as well as a Kiki-written one; selection, not guessed provenance,
authorizes removal. It refuses a stale index or changed tuple, an entry
inherited from global/ancestor configuration, an entry still required as
mandatory protection for surviving rules, an unsupported surviving ask, and a
legacy baseline mirror. Protection masks and the secret deny suffix are
recomputed for the survivors, and unrelated rules stay in order. Managed writes
never create an orphaned protective suffix, but one fail-closed case remains:
after a Kiki `add`, removing the only grant is refused because its trailing
protective suffix would be orphaned; recovering a manually orphaned suffix
requires a manual file edit, outside the managed-write guarantee.

An approval ask is OpenCode's native human prompt. The CLI validates rule shape
only: it records no consent and cannot verify that a human saw or approved the
prompt. A rejected ask or `PERMISSION_BLOCKED` stops the request without retry or
workaround. No native visual-consent, wrapper-hardening or tamperproof claim is
made.

Model selection has one source: native OpenCode configuration; there is no frontmatter
sync or setup-time model slot.

For general project instructions use `AGENTS.md`. For an intentionally different agent
prompt, create `.opencode/agents/kiki-reviewer.md` (or another Kiki agent). That prompt
replaces the global prompt for this project and does not automatically receive later
global instruction updates. OpenCode merges fields; settings explicitly present in the
local Markdown frontmatter take precedence.

### Security boundaries and approvals

Kiki's generated agent defaults (rendered from `src/cli/config.ts`) are a lean
74-entry baseline: 59 per-role lines, one managed top-level `permissions` entry
and 14 managed policy statements.

- **Routine local work is allowed.** Every role starts with `allow shell *`, so
  ordinary local commands run without a prompt. Role prompts still restrict
  behavior by instruction; the orchestrator remains coordination-only by prompt,
  not by a native shell deny. The obsolete legacy exact-command allows for
  configured build/test/lint/security values were removed because the wildcard
  subsumes them.
- **Managed permission commands are gated.** All eight roles, the orchestrator
  included, ask for `kiki permissions add *` and `kiki permissions remove *`
  after the `shell *` allow. `kiki permissions list` and `check` need no own rule
  because they run under that allow. Only the literal space wildcard is named;
  there is no prefix glob, so `addendum` cannot match. Every other shell form
  runs under the broad allow: there is no wrapper-hardening engine and no
  bypass-proof promise.
- **Each role may edit only its own territory.** After `deny edit *`, only the
  role's own file globs are allowed: orchestrator `.agentic/kiki/TASK_REGISTRY.json`
  and `.superpowers/sdd/**`; brainstormer and planner `docs/superpowers/**`;
  implementer `src/**`, `tests/**`, `.gitignore` and `.superpowers/sdd/**`;
  gui-designer `src/**`, `tests/**` and `.superpowers/sdd/**`; reviewer and
  escalation `.agentic/reviews/*` and `.opencode/docs/reviews/*`; historian
  `docs/**`, `README*`, `CHANGELOG*` and `.agentic/**`. The same territory
  patterns cover worktrees when OpenCode resolves them per working directory;
  no separate `.worktree/**`/`.worktrees/**` mirror rules are emitted.
- **Secrets are denied globally.** The managed `policies` block denies `read` and
  `edit` for `.env*`, `**/.env*`, `**/*secret*`, `**/*credential*`, `**/*.pem`,
  `**/*.key` and `**/id_rsa*` — 14 statements. Policies are evaluated after all
  permission rules and saved grants and can never allow, so a role territory or
  a hand-written allow cannot open these paths. Rewriting the managed block
  disables it; the next update then stops with drift evidence.
- **Only `git push` asks among publishing commands.** Every role ends its rules with
  `ask shell git push *`; a managed top-level `ask shell git push *` reaches
  agents without their own rules, because a top-level ask alone does not bind a
  role that has its own rules (measured). `git push --force` and other force
  forms therefore ask rather than being hard-denied; an accepted or rejected ask
  is still the stop point. All other publishing and remote-changing commands
  (for example `gh release`, deploy commands, `ssh`, `scp`, `rsync` and
  `npm publish`) run under `allow shell *`; the binding prompt and the transcript
  are the control, not a command catalog.
- **Tool and route boundaries are prompt-governed.** The alternate-route
  permission rules are retired. Generated prompts tell the brainstormer and
  planner that web research is allowed; the orchestrator's line forbids web,
  MCP and Code Mode while limiting delegation to the seven Kiki roles; every
  other role is told no web, no MCP, no delegation and no Code Mode. These are
  behavioral rules: Web, MCP, delegation, Code Mode and access outside the
  project are mechanically open at the OpenCode default. The orchestrator's
  coordination-only limit is likewise prompt-level. No rule here is a
  containment claim.
- **Managed top-level customs are preserved.** Kiki appends its two marked
  fragments after existing user entries in the global `permissions` and
  `policies` arrays, never rewrites or deduplicates user rules, and recognizes
  its own entries on every update. A changed, duplicated, reordered or partially
  removed managed fragment stops the update before any write with the file,
  location and expected/observed evidence. User policy objects with extra fields
  are preserved verbatim.
- **Worktree prompt line.** Every generated role prompt carries the sentence
  “Die Regeln aus Main gelten auch im Worktree.” — a behavioral reminder that the
  main-branch rules also apply in a worktree.

Behavior when a decision is needed:

- Generated prompts tell every agent, as a behavioral rule, not to circumvent
  publishing/Deploy-route approval via scripts, wrappers, alternate tools, APIs
  or delegation; to request approval for the intended publishing operation; and,
  if approval is rejected, to stop and report `PERMISSION_BLOCKED: <command>`
  without retry or workaround. The orchestrator does not retry it. The generated
  consent line names `publishing/Deploy-route approval` and carries a
  `Behavioral rule:` prefix. Only the exact previously generated line is
  replaced: a user-edited consent paragraph keeps its own wording, and the
  canonical line is added alongside it.
- Every generated role prompt ends with one `## Kiki managed permission
  requests (v1)` fragment. It permits any role, orchestrator included, to
  request additional file/directory rights for its own role only through the
  canonical `kiki permissions add ... --apply` path when the validator permits
  and a human approves the native ask. It grants no general command rights and
  never permits self-authorization, global-policy or raw-config edits, wrappers,
  alternate tools, scripts or delegation. The fragment is delivered only by the
  reviewed generator and a normal backed-up `kiki update`; the CLI never edits
  prompts or Markdown. A rejected ask or `PERMISSION_BLOCKED` stops immediately
  without retry or workaround. User text appended after the managed fragment
  makes the next update fail preflight safely rather than overwrite it; a
  v1→v2 transition story is future work.
- The watchdog source tracks pending permission requests per child, pauses stuck
  evaluation while an approval is pending, excludes the waiting time from active
  age and resets silence on the final reply. Fake-clock tests cover this logic.
  On 2026-11-13 the user resolved the former live-check list: real TUI long
  approval waits were never a concern and were removed; reconnect/restart state
  is not a concern because a restart means restart; and `PERMISSION_BLOCKED` stop
  behavior is to be observed in use. These are accepted limits, not live
  measurements: no live wait-safety claim is made, and model obedience remains
  observe-in-use rather than proven.

**Approval discipline.** Answer `once` for any remote-changing operation. `Always`
saves the proposed command prefix as a project-scoped grant, and later matching
commands run without asking; auto-accept answers every pending request, including
the `git push` ask. The user's discipline is to answer `once` and not `Always`.
**Saved-grant inventory is not a current work item:** Kiki cannot yet inventory
or remove saved grants, so any review of accumulated grants is manual, and the UI
steps for reviewing or removing a grant were not verified. These
notices are mistake protection, not a sandbox: Kiki does not detect or enforce
around saved grants or auto-accept, and approving a publish means "make it live",
not "this code is safe". Only `git push` asks among publishing operations; other publishing and
transfer commands are not gated and run under the allowed shell, so an allowed
local script can still perform network actions.

**Managed-write limits.** Managed writes are not tamperproofness. Arbitrary
manual native edits remain possible and are outside the guarantee. `kiki update`
preserves unknown rules as customs but provides no provenance tracking or
runtime enforcement, and `kiki permissions check` reports selected project
conflicts, not every hand-edited override. Inherited ASK tuples placed in a
project tier are accepted wherever they appear (unlike denies); hand edits can
still change permission-rule outcomes under last-match, and `check` does not
report every such override. The policy block is stronger: a hand-written allow
cannot open a secret path, although rewriting the managed block itself disables
it and makes the next update stop with drift evidence. Managed writes cannot
produce these states, and they remain accepted residual risks of hand editing.
Symlink-target enforcement and wrapper hardening are not implemented or
claimed. Native ask is human consent; the CLI cannot verify visual consent.

Permission prompts are presented by OpenCode's UI. A subagent reporting that it
saw no prompt is not evidence that approval was bypassed; use the user's UI
observation or permission events to establish whether a request occurred. In the
2026-11-13 observation, made under the earlier ask-first policy, the child's
report that no prompt surfaced was contradicted by the user's direct observation
and is not bypass evidence.

**Rollout status (2026-11-13).** The user-authorized corrected policy is applied
to the live project `opencode.jsonc`; the patch result is byte-identical to the
reviewed expected file, and `kiki update` refreshed all eight active global agent
prompts with the no-circumvention line. Earlier, under the ask-first draft, the
user confirmed a root-visible permission prompt for an orchestrator-dispatched
implementer `printf` command; it returned the expected output and the selected
approval option was not recorded. The orchestrator's refusal to run the command
directly demonstrates role-instruction compliance, not native shell denial.
On 2026-11-13 the user resolved the former remaining-check list: the
fresh-primary orchestrator gate is recorded as already covered by the README/TUI
observation; real long approval waits were removed as a non-issue;
reconnect/restart state is not a concern; saved-grant inventory is not a current
work item; and blocked-operation stop behavior is to be observed in use. TUI
Always/reject/auto-accept behavior was not separately re-verified. These
resolutions retire checks; they do not convert waived or accepted items into
independently measured evidence. Removing Kiki does not remove native saved grants
or undo a publish. Automated evidence is on OpenCode 2.2.7 only: focused
permission/migration/install/doctor tests 62/62 and the full suite 659 passed,
2 skipped, 0 failed, with build/tsc/lint clean; the orchestrator re-verified the
structural shell-rule check for all eight agents and focused tests 38/38 after
apply. Other 2.x patch levels are accepted as-is by the user for this solo
setup; that is a user acceptance, not a compatibility result. Automated
evidence remains on OpenCode 2.2.7 only, so no universal 2.x compatibility is
claimed; re-probe if behavior looks wrong. See the
[design](docs/superpowers/specs/2026-11-12-security-boundaries-design.md),
[plan](docs/superpowers/plans/2026-11-12-security-boundaries-plan.md) and
[probe record](docs/research/2026-11-12-security-boundaries-probes.md).

**Managed permission requests and lean baseline status (2026-11-23).** The
command, generator rules, role fragment, managed global fragments and lean
74-entry baseline are implemented and passed final review (PASS_WITH_NOTES,
notes accepted); the owner-directed OC1/V1 migration removal (no `kiki migrate`,
no V1 import) and the follow-up OC1 legacy residue removal (no `kiki routing`,
no routing-table public API, no V1 translation or cleanup paths) also passed
final review. The earlier ownership state, hash
evidence and drift gate are gone; updates classify each exact
action/resource/effect against the role's known defaults and preserve unknown
customs. The release work is committed locally; nothing was pushed, tagged,
published or rolled out, and no live config was written. Current source
verification recorded build and lint exit 0
and `git diff --check` clean. After the migration removal, the native full suite
ran 916 passed, 2 env-gated opt-in skips (`KIKI_RELEASE_TEST_REAL_TSC` and
`KIKI_RELEASE_TEST_OC2_REHEARSAL`) and zero failures; after the residue removal
it ran 884 passed with the same 2 env-gated opt-in skips and zero failures (916
minus 32 removed residue tests). Release verification on 2026-11-23 re-ran the
native full suite against the installed OpenCode 2.4.1: 884 passed, the same 2
env-gated opt-in skips and zero failures, with the policy battery and baseline
worktree probe passing at the final generator state on 2.4.1. Two expectations
that pinned 2.3.2 runtime behavior were re-measured and updated honestly: the
version pin, and the malformed-command scanner cases, which 2.4.1 refuses through
the headless permission ask (auto-rejected) instead of the scanner error path
while still executing nothing. No broader
full-green claim is made. The prior OpenCode 2.3.2 spike proved backend
ask/reject/once-approval for one real child, not native visual consent, wrapper
hardening, argv parsing or behavior for other child roles. `list`/`check`
zero-write is covered at CLI-test level.

## Loop controls and review governance

The generated agent prompts carry a bounded dispatch/review loop and an
evidence-based review contract. This is prompt-level guidance, not a sandbox:
the native permission arrays and the wall-clock watchdog remain the mechanical
backstops, and the transcript is the final backstop.

**Reviewer report.** The reviewer reports exactly one verdict: `PASS`,
`PASS_WITH_NOTES` or `FAIL`; there is no binary or fourth verdict. Each `FAIL`
item carries `Reason` (`implementation` | `plan` | `spec` | `user-decision` |
`environment/permission`), `Severity` (`critical` | `major` | `minor`) and
`Evidence` (the scenario, the violated rule or requirement, and the file/line;
for `plan` and `spec`, the faulty passage quoted plus why no implementation can
satisfy it, or why a technically implementable choice is nonetheless unsound).
Critical and major block; a minor item, or one whose evidence is
incomplete, downgrades to a note whatever its Reason, so a `FAIL` stands only
while a critical/major item with complete evidence remains. `PASS` and
`PASS_WITH_NOTES` state their `Basis:`; non-blocking notes go in the review
document, while the task's phase/progress prose keeps only a short reference to
that document — the notes are not duplicated there and never go in `reviewNotes`
(reserved for unresolved issues).

**Routing.** `FAIL` + `implementation` earns exactly one fix round with the
original builder, then re-review. `FAIL` + `plan` sends the plan back to the
planner with no fix round, and every substantial revised plan passes the reviewer
loop before implementation resumes; a mechanical revision (typos, formatting or
wording that does not change requirements, scope or technical choices) needs no
new review. `FAIL` + `spec` or `user-decision` stops and asks
the user directly. `FAIL` + `environment/permission` is terminal: no retry and
no workaround. A second failure on the same task is classified before spending
escalation: `user-decision` and `environment/permission` are user-only and stop
for the user, and an ostensibly technical failure caused by a missing
credential is treated the same way. Only a technical deadlock dispatches
escalation, at most once per task.

**Ownership.** The user approves the spec; plans are machine-owned only while
the spec's requirements, scope, security intent and acceptance criteria stay
unchanged. Changing what is delivered or what is allowed is a spec change and
needs explicit user approval.

**Escalation.** Escalation reads both review reports, the diff and the builder's
recorded evidence (registry, health and routing logs on request), may reproduce
checks in the current tree or a scratch copy under `/tmp/opencode`, and writes
one report plus at most one optional unapplied patch to `.agentic/reviews/*`. It
recommends exactly one of Fix with guidance, Rewrite plan, Rewrite spec, Split,
or Stop-needs-user; rewrite recommendations quote the faulty passage. It does
not edit source, publish, perform remote writes, or change permissions —
prompt-level restrictions, with the review-directory edit grant as the one
mechanical limit. The orchestrator presents the recommendation to the user;
nothing is rewritten automatically.

**Check ownership.** The implementer and gui-designer choose the checks the change
actually affects and report each one's exact command, scope, exit status and
relevant results; failure output is included in full, while a success is a short
summary. Focused tests are the default; a broad or full run is justified when the
change radius is unclear or the change crosses shared infrastructure — permissions,
publishing boundaries, generation/installation, or build/test configuration — not
merely because a named path was touched. Each check is stated honestly as failed,
passed, skipped or not run, and a relevant check that was not run gets one sentence
of rationale; a test exit status alone never becomes a broader integration claim.
For a proven-irrelevant docs, version or prompt delta, the last recorded PASS may be
cited as an earlier PASS at the named work state, never as fresh evidence. The
reviewer judges the diff and recorded evidence, including whether the chosen scope
fits the change, without rerunning them, and the orchestrator runs no project
checks. A builder that cannot proceed reports the explicit `BLOCKED` form
(`Blocker:`, `Tried:`, `Need:`) and stops; silent retry and workaround are
forbidden.

**Standing checks.** In every review the reviewer also looks for silent scope
creep — unrequested features, widened permissions, new dependencies, extra
behavior beyond the task, and unrelated refactors — and for guardrail
violations. Creep in the implementation is `FAIL`/`implementation`; creep in a
plan is `FAIL`/`plan` with the offending passage quoted; a genuine need to
expand scope is a spec change and needs user approval.

**Necessity check.** In every plan review and final review the reviewer applies
the substantive necessity criteria to existing spec, plan and code substance —
not to a required heading or record — when the change adds a dependency,
persistence, a new abstraction or scope growth; the normal review always checks
the smallest sufficient change, and a change that adds none of these justifies
itself in one sentence of existing prose. Proportionally to the change, it asks
what existing capability or source already provides the need (a claim
that none exists cites the bounded command, lookup or search tried and what it
returned), what happens if nothing is built and whether an existing source can
be reused as-is or read at query time, what real tradeoff justifies duplicate
persistence, a dependency or a new abstraction, what user-visible capability
disappears without the addition, and what coupling or maintenance cost it
creates. No mandatory section, per-field catalog,
waiver format or extra review pass is added. Scrutiny is cumulative: plan
review reassesses the spec's technical assumptions with the plan's new evidence,
and code review rechecks plan and spec adequacy in light of the implementation
evidence, reusing evidence rather than repeating the analysis. A `FAIL`'s
Reason follows the flaw's root cause (`spec`, `plan` or `implementation` for a
technical flaw) through the existing routing, so an upstream flaw is revised at
its source and never forces the builder to satisfy faulty instructions; the
verdicts, Reasons, severity and downgrade rules, and caps are unchanged.
Rationale or prior approval is not proof of soundness: an implementable but
concretely evidenced unnecessary, duplicative, insecure or disproportionately
complex technical choice can `FAIL`, while product goals, informed explicit
user decisions and the no-taste-veto limit still apply. The planner may choose
and justify new technical details inside the approved requirements, scope,
security intent and acceptance criteria; omission from the spec alone is not a
spec change. This is prompt-level guidance — static tests prove the wording,
not live model obedience — and ordinary `kiki update` delivers the regenerated
prompts.

**Guardrail baseline.** Every one of the eight generated agent prompts carries
this fixed block exactly once; the role's permissions live in global configuration:

```text
Project guardrails (non-negotiable; source: .agentic/kiki/alignment.json): Never hardcode secrets in source code. Use parameterized statements for every database query. Never leak internal stack traces in API responses. If a guardrail cannot be satisfied, stop and report it; do not work around it.
```

The block is a fixed constant whose three rule sentences correspond one-to-one
to the three default guardrails, plus a stop-and-report rule; it is not
generated from the active project file. In every review the reviewer additionally reads the active
project's `.agentic/kiki/alignment.json` fresh and checks the diff against all
of its guardrails, so custom project rules are caught there. A violation is
`FAIL`/`implementation`/`critical` (or `spec` when the spec itself demands it),
and a conflict between the fixed block and the active file stops for a user
decision. Per-project dynamic prompt injection is deferred, not rejected. The
block is guidance: tests prove the wording is present in each prompt, not that a
model obeys it.

**Documentation.** Documentation follows the change: the historian updates
existing docs only when they are actually stale, otherwise
`documentation.status` is `not_required` with a concrete reason. There is no
separate mandatory documentation completion gate, and the registry keeps state
and references rather than duplicated report prose.

**Caps and recording.** Prompt-level: at most one dispatch retry (only for a
non-`BLOCKED` empty or failed result), at most two review rounds per task with
the one implementation fix round between them, one escalation per task, and the
same failure twice stops automatic work. Dispatch retries and fix rounds
increment the existing numeric `failures` field; review rounds, escalation use
and notes are summarized in phase/progress prose, with no new registry counters
or schema fields. The 30-minute dispatch timeout and watchdog thresholds remain
the wall-clock backstop; a token/wall-clock budget engine is deferred, not
dropped.

**Implementation status (2026-11-13).** The prompt changes and their static
tests are implemented in `src/cli/config.ts`, `tests/cli/loop-controls.test.ts`
and the sandbox delivery tests in `tests/cli/install.test.ts`. No commit, global
install, real `kiki update`, or rollout was performed; existing installations
receive the new prompt bodies on the next `kiki update`. Behavioral outcomes,
including whether agents actually stop when required or read the active
alignment file each review, remain observe-in-use. In this change's final
verification run, with `OPENCODE_TEST_BINARY` set to the local OpenCode 2.2.7
binary, the serial full suite reported 46 files passed and 2 skipped, 682 tests
passed, 2 skipped and 0 failed; `npm run build`, `npm run lint` and
`npx tsc --noEmit` all exited 0, and the 2 skips are by-design opt-in release
tests. An earlier run without that integration prerequisite reported 666
passed, 14 skipped and 4 failed; those four integration failures occur only
when `OPENCODE_TEST_BINARY` is unset and are unrelated to this change.
`npm audit` reported 32 pre-existing moderate findings with no dependency
changes.

## Reset a project's agent customizations

```bash
kiki reset --project .
# Restart OpenCode to use the global agent defaults.
```

Reset backs up and removes Kiki agent entries from project OpenCode configuration and
local Kiki Markdown agents. Other agents, provider settings, task registries, reviews and
documentation remain.
Project path/command metadata, alignment and health settings also remain. Reset restores
**global agent models, permissions and prompts**, not a total deletion of project data.
It does not repair an already running or stuck OpenCode session.

## Diagnostics

- `kiki status [path]`: global OC2 installation, effective `agents.<id>.model` values,
  and project overrides.
- `kiki doctor [path]`: checks the OC2 root layout, native agent files and
  modes, prompt files, one server plugin registration, one `cli.json` TUI
  registration, project commands/paths and skills.
  Configured command shapes are advisory. Wildcard or compound values produce
  warnings that never change the exit code and are not added as exact allows.
  An npm default in a non-Node project also warns as a likely leftover. These
  warnings no longer control execution: `allow shell *` covers routine local
  commands and only the managed top-level `git push` ask remains. Doctor never executes a
  configured command or scans the approval database. It also prints informational approval reminders (`once`,
  saved `Always` grants, auto-accept and the no-sandbox limit).
  Agent model presence is informational: it shows the resolved model or inherited
  OpenCode default and never fails a fresh install. Credential status is
  presence/metadata only. Required skills are checked as files on disk; missing skills,
  name drift, duplicate copies and superpowers versions are warnings/info and never
  change the exit code. Skill presence does not confirm live plugin registration.
- `kiki verify <file>`: checks Markdown for unfinished markers or checklist items.
- `kiki stats [path]`: read-only summary of the opt-in metadata ledger, the
  configured health log and existing task-registry references. It makes no model
  call, writes nothing and never opens referenced spec/plan documents.
- `kiki permissions list|check [--project <path>] [--agent <name>]`: read-only
  permission rule metadata and project conflicts; `add`/`remove` preview by
  default and write only with `--apply` (see
  [Managed project permission requests](#managed-project-permission-requests)).

### Usage diagnostics (opt-in)

Collection is **off by default** and changes nothing until a project opts in
through its existing `.agentic/kiki/config.json`:

```json
{ "diagnostics": { "enabled": true } }
```

When disabled, the plugin creates no ledger file, records nothing and adds no
observation instrumentation, keeping the existing watchdog and routing behavior.
When enabled, it appends one metadata-only JSON line per dispatch, child-session
snapshot and comparison marker to `.agentic/kiki/run_ledger.jsonl`. Records
contain declared labels (task ID, kind `initial`/`fix`/`review`, optional
comparison group and the declared dispatch model string), observed child-session
identity, status, a `partial` completeness flag, durations, retry count and the
five token counters. The dispatch model string is the declared input, not a
verified resolved model. No prompt, response, diff, source, transcript or secret
is copied into the ledger.

The ledger is append-only and grows without rotation; delete it manually to
discard history. `kiki stats` reads it regardless of the current setting. The
feature records activity only and evaluates no output quality.

Declared dispatch counts and observed session usage are displayed as separate
tables. The fix and review counts are declared invocation counts, not logical
review rounds. There is no verified dispatch-to-child session binding — not even
for sequential dispatches — so task and comparison-group token attribution stays
**unknown**. Session usage is the latest observed snapshot per session, never a
sum of snapshots; missing tokens, status or durations remain unknown rather than
zero, and interrupted or incomplete sessions keep their last snapshot with the
`partial` flag. Watchdog incidents are joined strictly by session ID. Registry
spec/plan entries appear as current reference paths, not historical versions, and
a starting revision never reconstructs dirty or untracked worktree content.

**Manual comparisons** happen only when the user explicitly requests one and
supplies the task text, variants and starting revision. The orchestrator is
dispatch-only: existing authorized builders, or user-prepared directories,
prepare and execute each trial in a fresh separate worktree at the same starting
revision under ordinary permissions. Worktrees are not sandboxes, and there are
no hidden models, paid trials, global routing edits or automatic commits. With
collection enabled and ledger writes permitted, the preparation builder appends
one metadata-only comparison marker using the existing `createLedgerWriter`
(task/group with the known starting commit and any genuinely available result
commit). With collection off, no marker is written; no prompts, diffs or source
are copied. `kiki stats` shows supplied comparison metadata and per-session
statistics side by side only. Without a verified child binding, comparison token
attribution is unknown, and no result claims equal quality, savings or
equivalence.

## Release validation

`kiki release` prepares and validates a local release without performing one. It runs
only in a Kiki source checkout and reads Git history only through `git log`,
`git ls-files` and `git status`; it never commits, tags, pushes or publishes.

```bash
kiki release                 # dry run: validate only; no checkout writes
kiki release --apply         # copy a fully validated candidate back
kiki release --bump minor    # auto (default), major, minor or patch
kiki release --since <ref>   # explicit baseline; range is <ref>..HEAD
kiki release --security-exception <reason>  # approve high/critical findings
kiki release --help
```

The default is a dry run, but a prior dry run is only an optional preview:
`--apply` creates and validates its own fresh candidate. `--apply` is required
for any checkout write and additionally requires a clean working tree. The candidate tree is built outside the checkout from
tracked working-tree files only; untracked and ignored files are not part of the release.
The local `node_modules` tree is byte-copied separately so gates run without touching or
symlinking source dependencies; npm cache/log/tmp state is redirected to run-owned
temporary paths. Local development dependencies must already be installed — gates never
use `npx` or download tooling.

Five gates run against that candidate: the candidate's own `tsc` build, the Vitest
test suite, source-only ESLint, a full-tree `npm audit` including
dev/optional/peer dependencies, and release invariants (version fields, generated
plugin version, changelog headings, allowlisted changed files). There is no
separate typecheck gate: under Kiki's `tsconfig.json` the build runs the same
candidate-owned compiler with the same config and already typechecks every file it
emits (tests are excluded), so the retired gate was that same invocation plus
`--noEmit`. That equivalence is specific to Kiki's compiler and configuration;
other projects may need their own typecheck gate. The audit is
the only network query. It fails closed with
`security: INCOMPLETE — npm audit unavailable (<reason>)` when the registry or advisory
data is unavailable, the audit output is malformed, or the audit subprocess fails;
incomplete results can never be excepted.

Without `--security-exception`, any high or critical vulnerability blocks the release,
while low and moderate findings are reported only. `--security-exception <reason>`
requires a non-empty reason and changes only that high/critical block decision when the
audit produced complete evidence: the audit still runs, all counts are still reported,
and low/moderate behavior is unchanged. An excepted result reports
`security: passed with approved exception (N high, M critical; reason: …)` — never a
clean pass.

The 2026-11-04 exception for the retired `@opencode-ai/plugin@1.18.35` graph does **not**
apply to Kiki 3.0.0. The final fresh audit on the actual `@opencode/plugin@2.2.6` graph
reported **0 high, 0 critical, 32 moderate, 0 low, 0 info** with no exception. The 32
moderate findings are non-blocking under the existing gate policy and are reported
honestly; no routine approval is added. The synthetic 2.4.0→3.0.0 **RELEASE_REHEARSAL**
passed with all six gates and no `--apply` (the historical run predates the
current five-gate contract). The user subsequently authorized the 3.0.0
commit, tag, push and GitHub Release. Because the development tree is already 3.0.0,
that release uses fresh validation of the current version rather than running an
additional version bump or copying the synthetic rehearsal back.

The baseline is the newest commit whose subject contains an exact `release v<current>`
match. If none exists, the command fails closed and asks for `--since <ref>`; an explicit
`--since` defines `<ref>..HEAD`. Conventional commit subjects and bodies infer the
semver bump (`!` or a breaking footer is major, `feat` is minor, `fix`/`perf` is patch);
`--bump` overrides inference, and a non-increasing or non-release-worthy range fails
closed.

Changelog generation is deterministic and mandatory: an empty `[Unreleased]` section is
filled from the commit range, then renamed to a dated heading with a fresh empty
`[Unreleased]` above it. Existing human-authored content is never rewritten.

Before `--apply`, any untracked or ignored file under `dist/` causes a collision refusal
(a dry run reports that apply would refuse). Apply snapshots the four version/changelog
files and the entire `dist/` tree, writes the candidate back, then verifies every byte in
both directions; any write or verification failure restores the snapshot and reports the
retained backup location. A failed apply never leaves a partial release behind. Both
modes print manual `git add`/`git commit`/tag/push next steps but never execute them.

Dependency `.bin` links are rewritten as candidate-owned POSIX `/bin/sh` shims.
Node-shebang (or `.js`/`.mjs`/`.cjs`) entrypoints run through the current Node binary
with the candidate-local entrypoint; recognized native ELF executables are executed
directly. Other linked executables are rejected. This is a POSIX-only shim mechanism,
not a general Windows launcher.

These examples document the command; do not run them against this repository unless a
release is explicitly authorized.

## Agents

| Agent | Role |
|---|---|
| `kiki-orchestrator` | Coordinates the workflow and task registry |
| `kiki-brainstormer` | Explores requirements and writes design specs |
| `kiki-planner` | Writes implementation plans |
| `kiki-implementer` | Implements code and tests |
| `kiki-gui-designer` | Implements UI/UX work |
| `kiki-reviewer` | Reviews plans, code and security |
| `kiki-escalation` | Diagnoses failures |
| `kiki-historian` | Updates project documentation |

The eight agents load Superpowers skills for brainstorming, planning, implementation, TDD
and review. Role-based baseline permissions live only in global
`agents.<id>.permissions`; the shared `git push` ask and the 14 secret policy
denials live in managed top-level fragments. Agent Markdown has no permission
fields. Project configs contain validated additions rather than generated copies
of the baseline.

## Plugin

The `kiki` package provides two OC2 entrypoints:

- `./server`: a package-style plugin that logs `kiki-*` task dispatches to
  `.agentic/kiki/routing_log.jsonl` and runs the configurable subagent watchdog,
  recording incidents in `.agentic/kiki/health_log.jsonl` by default. It observes
  dispatches; OpenCode selects the configured models. The routing entry format remains
  `{ timestamp, agent, model }`, with `model: "unknown"` when no explicit model is
  passed. Setup owns its subscriptions/intervals and returns a cleanup function awaited
  on unload/reload. The OC1 `globalThis` dedup shim is not used; `doctor` diagnoses
  duplicate Kiki server registrations instead.
- `./tui`: the native `/kiki` menu.

`.agentic/kiki/routing_log.jsonl` and `.agentic/kiki/health_log.jsonl` are local
project state: they are Git-ignored and existing local copies are retained. They
are not part of the package or of a tracked project history.

Server registration is `plugins` in the global `opencode.json`/`opencode.jsonc`; TUI
registration is `plugins` in the global `cli.json`/`cli.jsonc`. A development checkout
registers its absolute package directory; a release uses the package name once such a
candidate is available.

## Development

Runtime use requires Node `>=18.0.0` (`package.json` `engines.node`). Development and
lint require Node **`^20.19.0 || ^22.13.0 || >=24`** because of the lint dependency graph;
Node 21 and 23 are excluded. The lint packages are development-only.

```bash
npm test
npm run lint
npm run build
# Optional standalone source typecheck; `npm run build` already typechecks the
# files it emits (tsconfig excludes tests):
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
# Optional integration tests against an installed OpenCode 2.x binary
# (the opt-in real-binary suites require OPENCODE_TEST_BINARY):
OPENCODE_TEST_BINARY=/absolute/path/to/opencode npm test
```

`npm run lint` runs `eslint "src/**/*.ts"` and `npm run build` compiles and
typechecks `src/` with the project `tsconfig.json`. Lint and the optional
standalone typecheck cover source only; tests are covered by Vitest. The release
candidate has no separate typecheck gate for the same reason.

The optional native tests use disposable HOME and all XDG roots plus an explicit
`OPENCODE_CONFIG_DIR`; child processes receive a whitelisted environment and never
inherit live auth/provider/config values. The optional integration fixture accepts any
OpenCode 2.x binary and records the exact version it observed for the test evidence; it
rejects V1, malformed and future-major binaries. That is a test gate, not a runtime
requirement.
The `/kiki` integration test also requires Python 3 and a POSIX pseudo-terminal; it opens
the real TUI, exercises the menu with the copy for the active locale (German or English),
and asserts zero provider requests.

The final Task 13 snapshot recorded 24/24 required real-binary integration tests with zero
skips, and 632 passed / 2 by-design opt-in skips / 0 failed in the full suite with the
binary. That is automated evidence only. The user accepted Task 14 on the basis of live
startup and `/kiki` smoke, and the v3.0.0 release was delivered; neither is a claim that
every machine drill was run. Unreported live migration, provider login, dispatch,
save/removal and rollback drills remain unverified. See the acceptance document for the
current gate state.

Reviewer-precision eval (deferred; no accepted metric cases): [`.agentic/kiki/evals/reviewer-precision/README.md`](.agentic/kiki/evals/reviewer-precision/README.md).
Keep `KIKI_VERSION` in `src/cli/config.ts` synchronized with `package.json` on release.
License: MIT.
