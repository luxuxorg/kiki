import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import type { PermissionRule } from './opencode-config.js';

export interface KikiPaths {
  source: string;
  tests: string;
  docs: string;
  superpowers: string;
  specs: string;
  plans: string;
  changelog: string;
  readme: string;
  decisions: string | null;
  knowledge: string | null;
  taskRegistry: string;
}

export interface KikiHealthConfig {
  watchdogEnabled: boolean;
  stuckThresholdMs: number;
  gracePeriodMs: number;
  absoluteMaxMs: number;
  checkIntervalMs: number;
  loopRepeatCount: number;
  watchAllSubagents: boolean;
  logPath: string;
}

export interface KikiDiagnosticsConfig {
  enabled: boolean;
}

export interface KikiConfig {
  projectName: string;
  language: string;
  commands: {
    build: string;
    test: string;
    lint: string;
    security: string;
  };
  paths: KikiPaths;
  health: KikiHealthConfig;
  diagnostics: KikiDiagnosticsConfig;
}

export const DEFAULT_PATHS: KikiPaths = {
  source: 'src/',
  tests: 'tests/',
  docs: 'docs/',
  superpowers: 'docs/superpowers/',
  specs: 'docs/superpowers/specs/',
  plans: 'docs/superpowers/plans/',
  changelog: 'CHANGELOG.md',
  readme: 'README.md',
  decisions: 'docs/DECISIONS.md',
  knowledge: null,
  taskRegistry: '.agentic/kiki/TASK_REGISTRY.json',
};

export const DEFAULT_HEALTH: KikiHealthConfig = {
  watchdogEnabled: true,
  stuckThresholdMs: 300_000,
  gracePeriodMs: 120_000,
  absoluteMaxMs: 3_600_000,
  checkIntervalMs: 30_000,
  loopRepeatCount: 3,
  watchAllSubagents: false,
  logPath: '.agentic/kiki/health_log.jsonl',
};

export const DEFAULT_DIAGNOSTICS: KikiDiagnosticsConfig = {
  enabled: false,
};

/**
 * Sanitizes the diagnostics section with the same safe-fallback pattern as the
 * runtime health settings: only an explicit boolean enables collection, and
 * unknown fields are discarded rather than trusted.
 */
export function sanitizeDiagnostics(raw: unknown): KikiDiagnosticsConfig {
  const out: KikiDiagnosticsConfig = { ...DEFAULT_DIAGNOSTICS };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const source = raw as Record<string, unknown>;
  if (typeof source.enabled === 'boolean') out.enabled = source.enabled;
  return out;
}

/**
 * Kiki version. MUST be kept in sync with package.json on every release. The
 * published package ships only dist/ (see package.json "files"), so a globally
 * installed CLI cannot read its own package.json at runtime — this const is the
 * runtime source of truth for version checks and release transforms.
 */
export const KIKI_VERSION = '3.0.1';

export const DEFAULT_CONFIG: KikiConfig = {
  projectName: 'my-project',
  language: 'typescript',
  commands: {
    build: 'npm run build',
    test: 'npm test',
    lint: 'npm run lint',
    security: 'npm audit',
  },
  paths: DEFAULT_PATHS,
  health: DEFAULT_HEALTH,
  diagnostics: DEFAULT_DIAGNOSTICS,
};

export const DEFAULT_ALIGNMENT = {
  guardrails: [
    'No hardcoded secrets in source code',
    'All database queries must use parameterized statements',
    'API responses must not leak internal stack traces',
  ],
  compliance: ['OWASP Top 10', 'SOC 2 Type II'],
};

function dirGlob(path: string): string {
  if (path.endsWith('/')) return path + '**';
  return path + '/**';
}

function fileGlob(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  const filename = lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex > 0) {
    const prefix = filename.substring(0, dotIndex);
    return (lastSlash >= 0 ? path.substring(0, lastSlash + 1) : '') + prefix + '*';
  }
  return path;
}

function fileDir(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  return lastSlash >= 0 ? path.substring(0, lastSlash + 1) : '';
}

function worktreeGlob(path: string): string {
  return '.worktree/**/' + path;
}

function worktreesGlob(path: string): string {
  return '.worktrees/**/' + path;
}

/**
 * Both project-worktree layouts for the same role-scoped path: the existing
 * singular `.worktree/` directory and the plural `.worktrees/` directory.
 * Callers keep their existing narrow path grants; this adds parity, never a
 * blanket worktree grant.
 */
function worktreeGlobs(path: string): string[] {
  return [worktreeGlob(path), worktreesGlob(path)];
}

export function loadConfig(targetPath: string): KikiConfig {
  const modernConfigPath = join(targetPath, '.agentic', 'kiki', 'config.json');
  const legacyConfigPath = join(targetPath, '.agentic', 'config.json');
  const configPath = existsSync(modernConfigPath) ? modernConfigPath : legacyConfigPath;
  if (!existsSync(configPath)) return { ...DEFAULT_CONFIG };
  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
    const { riskMatrix: _discardedRiskMatrix, models: _discardedModels, ...rest } = raw;
    return {
      ...DEFAULT_CONFIG,
      ...rest,
      paths: { ...DEFAULT_PATHS, ...(rest.paths ?? {}) },
      health: { ...DEFAULT_HEALTH, ...(rest.health ?? {}) },
      diagnostics: sanitizeDiagnostics(rest.diagnostics),
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function allow(action: string, resource: string): PermissionRule {
  return { action, resource, effect: 'allow' };
}

function deny(action: string, resource: string): PermissionRule {
  return { action, resource, effect: 'deny' };
}

// Routine local work runs without approval prompts; the role prompts still
// govern behavior (the orchestrator remains coordination-only by instruction).
// The baseline allow comes first so publishing/remote-changing asks appended
// after it win (last matching rule wins).
const PUBLISH_ASK_PATTERNS: readonly string[] = [
  'git push*',
  'gh pr merge*',
  'gh release*',
  'gh workflow run*',
  'scalingo *deploy*',
  'railway up*',
  'railway deploy*',
  'ssh*',
  'sftp*',
  'scp*',
  'rsync*',
  'lftp*',
  'ftp*',
  'curl*',
  'wget*',
  'npm publish*',
  'yarn publish*',
  'pnpm publish*',
];

// Force-push taboos. They follow the publishing asks so the last matching rule
// wins and denies; aliases and wrappers remain a known limitation. The trailing
// forms require the flag to be its own final argument, so branch names that
// merely contain `-f` (e.g. `my-feature`, `hot-fix`) stay on the ask rule.
const FORCE_PUSH_DENIES: readonly string[] = [
  'git push --force*',
  'git push -f*',
  'git push *--force*',
  'git push * -f',
  'git push * --force',
];

/**
 * Shell order: allow everything routine, then ask the publishing routes, then
 * deny the force-push taboos. Denies are last-match wins, so they survive the
 * baseline allow.
 */
function shellRules(): PermissionRule[] {
  const asks: PermissionRule[] = PUBLISH_ASK_PATTERNS.map(resource => ({
    action: 'shell',
    resource,
    effect: 'ask',
  }));
  return [
    allow('shell', '*'),
    ...asks,
    ...FORCE_PUSH_DENIES.map(resource => deny('shell', resource)),
  ];
}

function buildBroadReadPermissions(): PermissionRule[] {
  return [
    allow('read', '*'),
    deny('read', '.env*'),
    deny('read', '**/.env*'),
    deny('read', '**/*secret*'),
    deny('read', '**/*credential*'),
    deny('read', '**/*.pem'),
    deny('read', '**/*.key'),
    deny('read', '**/id_rsa*'),
  ];
}

// The superpowers SDD workspace is git-ignored scratch shared by the
// implementer (task reports), the gui-designer that reuses its builder, and the
// orchestrator (ledger and briefs). This is a permanent narrow grant, not a
// temporary migration grant; every other role keeps the broad edit deny.
const SDD_WORKSPACE_GLOB = '.superpowers/sdd/**';

const KIKI_SUBAGENTS: readonly string[] = [
  'kiki-brainstormer',
  'kiki-planner',
  'kiki-implementer',
  'kiki-gui-designer',
  'kiki-reviewer',
  'kiki-escalation',
  'kiki-historian',
];

/**
 * Alternate-route restrictions, appended after the file/shell scopes.
 *
 * Measured on OpenCode 2.2.7: `execute` denial removes Code Mode, `webfetch`
 * and `subagent` denials remove those tools, and `skill` allow loads skills.
 * MCP server tools use the action `<server>_<tool>`. OpenCode 2 matches action
 * names as whole-value wildcards, so a generic `*_*` action deny closes every
 * arbitrary server without a blanket `*` rule or a server list.
 */
function routeRules(options: {
  research: boolean;
  orchestrator?: boolean;
  externalDirectory?: readonly string[];
}): PermissionRule[] {
  const rules: PermissionRule[] = [
    deny('execute', '*'),
    deny('opencode_list_mcp_resources', '*'),
    deny('opencode_read_mcp_resource', '*'),
    options.research ? allow('webfetch', '*') : deny('webfetch', '*'),
    options.research ? allow('websearch', '*') : deny('websearch', '*'),
    allow('skill', '*'),
    // Deny every delegation first, then allow only the orchestrator's seven
    // named Kiki subagents (last matching rule wins).
    deny('subagent', '*'),
  ];
  if (options.orchestrator) {
    for (const agent of KIKI_SUBAGENTS) rules.push(allow('subagent', agent));
  }
  // Generic MCP server-tool closure: every MCP tool action is
  // `<server>_<tool>`, so `*_*` covers arbitrary server names. Appended after
  // the base allows so the last matching rule wins.
  rules.push(deny('*_*', '*'));
  // `external_directory` also contains an underscore, so the generic deny
  // closes it. Only the roles that pass their pre-existing narrow grants replay
  // those allows after this deny; every other role stays denied. No blanket
  // external-directory allow is added, so project-level denies are preserved.
  for (const resource of options.externalDirectory ?? []) {
    rules.push(allow('external_directory', resource));
  }
  return rules;
}

function buildBrainstormerPermissions(p: KikiPaths): PermissionRule[] {
  const sw = dirGlob(p.superpowers);
  const plans = dirGlob(p.plans);
  const specs = dirGlob(p.specs);
  const src = dirGlob(p.source);
  const tst = dirGlob(p.tests);
  return [
    ...buildBroadReadPermissions(),
    deny('edit', '*'),
    deny('edit', src),
    deny('edit', tst),
    allow('edit', sw),
    allow('edit', plans),
    allow('edit', specs),
    ...worktreeGlobs(sw).map(resource => allow('edit', resource)),
    ...worktreeGlobs(plans).map(resource => allow('edit', resource)),
    ...worktreeGlobs(specs).map(resource => allow('edit', resource)),
    ...shellRules(),
    ...routeRules({ research: true }),
  ];
}

function buildImplementerPermissions(
  config: KikiConfig,
  options: { gitignore?: boolean } = {},
): PermissionRule[] {
  const p = config.paths;
  const src = dirGlob(p.source);
  const tst = dirGlob(p.tests);
  const sw = dirGlob(p.superpowers);
  return [
    ...buildBroadReadPermissions(),
    deny('edit', '*'),
    deny('edit', sw),
    allow('edit', src),
    allow('edit', tst),
    ...worktreeGlobs(src).map(resource => allow('edit', resource)),
    ...worktreeGlobs(tst).map(resource => allow('edit', resource)),
    // Only the implementer maintains .gitignore, and only at the exact root or
    // inside a project worktree; never a blanket `**/.gitignore` grant.
    ...(options.gitignore
      ? [
          allow('edit', '.gitignore'),
          ...worktreeGlobs('.gitignore').map(resource => allow('edit', resource)),
        ]
      : []),
    allow('edit', '/tmp/**'),
    allow('edit', 'tmp/**'),
    allow('edit', SDD_WORKSPACE_GLOB),
    ...shellRules(),
    ...routeRules({ research: false, externalDirectory: ['/tmp/**', 'tmp/**'] }),
  ];
}

function buildReviewerPermissions(): PermissionRule[] {
  return [
    ...buildBroadReadPermissions(),
    deny('edit', '*'),
    deny('edit', 'src/**'),
    deny('edit', 'tests/**'),
    deny('edit', 'docs/**'),
    allow('edit', '.agentic/reviews/*'),
    allow('edit', '.opencode/docs/reviews/*'),
    ...worktreeGlobs('.agentic/reviews/*').map(resource => allow('edit', resource)),
    ...worktreeGlobs('.opencode/docs/reviews/*').map(resource => allow('edit', resource)),
    ...shellRules(),
    ...routeRules({ research: false, externalDirectory: ['/tmp/**', 'tmp/**'] }),
  ];
}

function buildEscalationPermissions(): PermissionRule[] {
  return [
    ...buildBroadReadPermissions(),
    deny('edit', '*'),
    allow('edit', '.agentic/reviews/*'),
    allow('edit', '.opencode/docs/reviews/*'),
    ...worktreeGlobs('.agentic/reviews/*').map(resource => allow('edit', resource)),
    ...worktreeGlobs('.opencode/docs/reviews/*').map(resource => allow('edit', resource)),
    ...shellRules(),
    ...routeRules({ research: false, externalDirectory: ['/tmp/**', 'tmp/**'] }),
  ];
}

function buildHistorianPermissions(p: KikiPaths): PermissionRule[] {
  const src = dirGlob(p.source);
  const tst = dirGlob(p.tests);
  const readmeGlob = fileGlob(p.readme);
  const changelogGlob = fileGlob(p.changelog);
  const docsGlob = dirGlob(p.docs);

  const rules: PermissionRule[] = [
    ...buildBroadReadPermissions(),
    deny('edit', '*'),
    allow('edit', readmeGlob),
    allow('edit', changelogGlob),
    allow('edit', docsGlob),
  ];

  if (p.decisions) {
    const decDir = fileDir(p.decisions);
    if (decDir) {
      const decGlob = dirGlob(decDir);
      rules.push(allow('edit', decGlob));
      rules.push(...worktreeGlobs(decGlob).map(resource => allow('edit', resource)));
    }
  }

  if (p.knowledge) {
    const kgGlob = dirGlob(p.knowledge);
    rules.push(allow('edit', kgGlob));
    rules.push(...worktreeGlobs(kgGlob).map(resource => allow('edit', resource)));
  }

  rules.push(allow('edit', '.agentic/**'));
  rules.push(...worktreeGlobs(readmeGlob).map(resource => allow('edit', resource)));
  rules.push(...worktreeGlobs(changelogGlob).map(resource => allow('edit', resource)));
  rules.push(...worktreeGlobs(docsGlob).map(resource => allow('edit', resource)));
  rules.push(...worktreeGlobs('.agentic/**').map(resource => allow('edit', resource)));

  rules.push(deny('edit', src));
  rules.push(deny('edit', tst));
  rules.push(...worktreeGlobs(src).map(resource => deny('edit', resource)));
  rules.push(...worktreeGlobs(tst).map(resource => deny('edit', resource)));

  rules.push(...shellRules());
  rules.push(...routeRules({ research: false }));
  return rules;
}

function buildOrchestratorPermissions(p: KikiPaths): PermissionRule[] {
  // The shared shell baseline applies here too, so a primary session does not
  // prompt for routine local work; the orchestrator prompt keeps coordination
  // authoritative by instruction. Read protections apply and the only edit
  // grants are the task registry and the SDD ledger/briefs workspace.
  return [
    ...buildBroadReadPermissions(),
    deny('edit', '*'),
    allow('edit', p.taskRegistry),
    ...worktreeGlobs(p.taskRegistry).map(resource => allow('edit', resource)),
    allow('edit', SDD_WORKSPACE_GLOB),
    ...shellRules(),
    ...routeRules({ research: false, orchestrator: true }),
  ];
}

function renderPermissions(rules: PermissionRule[]): string {
  const lines = ['permissions:'];
  for (const rule of rules) {
    // Quote the action: the generic MCP rule uses `*_*`, which is a YAML alias
    // if emitted bare.
    lines.push(`  - action: ${JSON.stringify(rule.action)}`);
    lines.push(`    resource: ${JSON.stringify(rule.resource)}`);
    lines.push(`    effect: ${rule.effect}`);
  }
  return lines.join('\n');
}

// Every generated agent prompt carries this exact no-circumvention line: the
// publishing-route approval must not be routed around by other means, and a
// rejected approval must stop the agent (remote-change safety).
const PERMISSION_BLOCK_PROMPT =
  'Do not circumvent publishing-route approval via scripts, wrappers, alternate tools, APIs, or delegation. Request approval for the intended publishing operation. If approval is rejected, do not retry or work around it; report PERMISSION_BLOCKED: <command> and stop.';

// Every generated agent prompt carries this exact fixed baseline. It is a
// literal, deliberately not derived from the active project's alignment.json
// at generation time (the generators have no project root), and it matches
// DEFAULT_ALIGNMENT one-to-one; R15 keeps the two from drifting apart.
const ALIGNMENT_GUARDRAIL_PROMPT =
  'Project guardrails (non-negotiable; source: .agentic/kiki/alignment.json): Never hardcode secrets in source code. Use parameterized statements for every database query. Never leak internal stack traces in API responses. If a guardrail cannot be satisfied, stop and report it; do not work around it.';

// Shared builder contract for the implementer and gui-designer. Both run the
// project's configured checks and hand the exact evidence to the reviewer and
// historian; the reviewer judges that evidence instead of rerunning commands.
// Blocking is explicit and terminal: no silent retry or workaround, and no
// unilateral spec/plan edits.
function buildBuilderHandoffPrompt(commands: KikiConfig['commands']): string {
  return `## Verification and Handoff
Run all four configured checks and record the exact command, exit status, and complete output (stdout and stderr), including failure output, in the handoff to the reviewer and historian:
- Build: \`${commands.build}\`
- Test: \`${commands.test}\`
- Lint: \`${commands.lint}\`
- Security: \`${commands.security}\`
Never claim a check passed without its recorded output. When done, append the Implementation Summary and changed files to the handoff for the reviewer and historian.

## Explicit Blocking
If you cannot proceed, stop and report BLOCKED:
\`\`\`
BLOCKED
Blocker: <the exact blocker>
Tried: <what you tried>
Need: <what you need to proceed>
\`\`\`
Do not silently retry, do not work around the blocker, and do not edit the spec or plan on your own. Report BLOCKED to the orchestrator and stop. A permission block takes priority: report \`PERMISSION_BLOCKED: <command>\` and stop instead of retrying or substituting another command.

## Change Safety
- Before starting, record the current project state:
  1. Run \`git diff > /tmp/kiki-tracked-before.patch\` to capture tracked changes.
  2. Run \`git ls-files --others --exclude-standard > /tmp/kiki-untracked-before.txt\` to capture existing untracked files.
- Do NOT use \`git clean -fd\` at any point — it could delete user files.
- If build, test, lint, or security still fails and you cannot fix it within this task, stop and report BLOCKED; do not start another autonomous retry loop, do not run a blanket checkout or reset, and preserve existing and user changes. Use the pre-change inventory to remove only new untracked files you created.
- On success, you may delete \`/tmp/kiki-tracked-before.patch\` and \`/tmp/kiki-untracked-before.txt\`.`;
}

function buildHistorianResponsibilities(p: KikiPaths): string {
  const lines: string[] = [
    `1. **README:** Keep \`${p.readme}\` current with project description, setup instructions, and feature list.`,
    `2. **CHANGELOG:** Maintain \`${p.changelog}\` with notable changes per version or date.`,
    `3. **Project Docs:** Update \`${p.docs}*\` files (except \`${p.superpowers}*\` which belongs to the planner/brainstormer).`,
  ];
  let idx = 4;
  if (p.decisions) {
    lines.push(`${idx}. **Decisions:** Update \`${p.decisions}\` to document architecture decisions, phase plans, and status updates as they evolve.`);
    idx++;
  }
  if (p.knowledge) {
    lines.push(`${idx}. **Knowledge:** Update \`${p.knowledge}*\` with reusable knowledge artifacts, wiki entries, and reference material.`);
  }
  return lines.join('\n');
}

export function generateOrchestratorTemplate(config: KikiConfig): string {
  const p = config.paths;
  const perms = buildOrchestratorPermissions(p);
  return `---
description: Kiki Orchestrator — routes the superpowers pipeline
mode: primary
${renderPermissions(perms)}
---
You are the Kiki Orchestrator. You are **COORDINATION-ONLY**.

## Your Role
Dispatch the correct subagent via the \`subagent\` tool. Do not write code, implementation files, docs, or run commands. The only direct file edit you may perform is updating \`${p.taskRegistry}\` for task state, phase transitions, and failure counts. Agent models and permissions are configured in global/project \`opencode.json\` or \`opencode.jsonc\` and resolved by OpenCode. You run no project checks: do not run build, test, lint, or security commands yourself. Pass the recorded evidence from builders to the reviewer and escalation.

## Dispatch Rules
- UI/frontend/visual/layout/component/design task → @kiki-gui-designer
- Backend/logic/data/tooling task → @kiki-implementer
- Design/spec phase → @kiki-brainstormer
- Planning phase → @kiki-planner
- Review phase → @kiki-reviewer
- Documentation decision required → dispatch @kiki-historian unless the registry explicitly records \`documentation.status: "not_required"\` with a concrete reason.
- Failure diagnosis → @kiki-escalation, only for a technical deadlock.

## Dispatch Labels and Requested Comparisons
- Prefix every dispatch description with \`[task:<taskId> <kind>]\`, where the task ID uses the existing task identity and the kind is \`initial\` | \`fix\` | \`review\`. Comparison runs use \`[task:<taskId> <kind> cmp:<groupId>]\`. \`cmp\` is an independent field and never overwrites the task ID or kind. Keep the whole description within the 3–5-word rule; a malformed or missing label logs \`unknown\`. Examples: \`[task:diag fix] Correct regression now\` and \`[task:diag review cmp:trial] Check changes\`. No new registry counters are introduced.
- Only when the user explicitly requests a comparison, obtain the task text, chosen variants and starting revision from the user. You are dispatch-only: delegate preparation and execution to existing authorized builders, or use user-prepared directories. Each trial uses a fresh separate worktree at the same starting revision. These worktrees are not sandboxes; commands run under ordinary permissions, and there is no invented subagent working-directory argument.
- When collection is enabled and writing the ledger is permitted, the preparation builder appends one metadata-only comparison marker using the existing \`createLedgerWriter\`: task and group with the known starting commit and any genuinely available result commit. That marker records supplied context, not a verified dispatch-to-session binding; when collection is off, no marker is written, and never copy prompts, diffs or source. Preparation and cleanup preserve user changes and report dirty or untracked limitations; there are no hidden models, paid trials, global routing edits or automatic commits.
- Use the summary to compare metadata and per-session statistics side by side only. Without a verified dispatch-to-child binding, token attribution stays unknown; state that and never claim equal quality, savings or equivalence. This adds no new CLI command, runner or subagent argument.

## Process
1. **Intake:** Ask clarifying questions one at a time until requirements are clear.
2. **Brainstorm:** Dispatch \`kiki-brainstormer\`.
3. **Plan:** Dispatch \`kiki-planner\`.
4. **Architect Review:** Dispatch \`kiki-reviewer\` for architect review of the plan against \`.agentic/kiki/alignment.json\`.
5. **Implement:** Dispatch \`kiki-implementer\`.
6. **Review:** Dispatch \`kiki-reviewer\`.
7. **Document:** Dispatch \`kiki-historian\` to update \`${p.readme}\`, \`${p.changelog}\`, and project docs.
8. **Complete:** Update \`${p.taskRegistry}\` with the task status and any failure metrics.

## Ownership
The user approves the spec. Plans are machine-owned: you may accept a revised plan, or dispatch the planner to revise one, only while the spec's requirements, scope, security intent, and acceptance criteria are unchanged. Changing what is delivered or what is allowed is a spec change and requires explicit user approval. If implementation reveals that the spec itself is wrong, stop and ask the user.
Every revised plan — from a FAIL/\`plan\`, an escalation recommendation, or a planner-initiated improvement — passes the reviewer loop before implementation resumes.

## Routing Review Verdicts
Route by the reviewer's Reason before retrying or escalating:
- **PASS** / **PASS_WITH_NOTES** → accept; record the notes in the review document and the task's phase/progress prose (never \`reviewNotes\`); no follow-up.
- **FAIL + Reason \`implementation\`** → exactly one fix round: dispatch the original builder (implementer or gui-designer) with the FAIL evidence, then dispatch \`kiki-reviewer\` to re-review. The fix round increments the task's numeric \`failures\` field.
- **FAIL + Reason \`plan\`** → no fix round. Dispatch \`kiki-planner\` to revise the plan, then the reviewer loop; implementation resumes only after the revised plan passes. A second technical plan failure is a deadlock, not an unlimited planner loop.
- **FAIL + Reason \`spec\`** → stop and ask the user. The spec is user-owned; a spec change requires explicit user approval.
- **FAIL + Reason \`user-decision\`** → stop and ask the user directly. Do not dispatch escalation.
- **FAIL + Reason \`environment/permission\`** → terminal: no retry, no workaround. Keep the \`PERMISSION_BLOCKED\` no-retry override; a missing credential or unreachable service stops for the user.

## Second FAIL, Same Failure Twice, and Escalation
On the second FAIL of the same task, or when the same failure happens twice, stop automatic work and classify the cause before spending escalation: user-only or technical.
- Treat \`user-decision\` and \`environment/permission\` reasons as user-only.
- When the Reason is technical (\`implementation\` or \`plan\`) but the failure pattern is user-only, ask the user anyway. Consult the user-only checklist: missing permission/credential, product or scope decision, external service/hosting, unclear requirement, destructive or irreversible choice, including ostensibly technical failures caused by a credential.
- Only a **technical deadlock** may dispatch \`kiki-escalation\`, at most once per task.
- Do not reset the failure counter after a plan revision or an escalation dispatch.

## Handling Empty or Failed Subagent Results
A dispatch fails when the subagent returns empty output or cannot complete.
Terminal dispatch outcomes are never retried with the same prompt:
- a \`BLOCKED\` report,
- a \`PERMISSION_BLOCKED\` report,
- a FAIL routed to the planner or the user.

1. Only a non-BLOCKED empty or failed dispatch result is retried: retry once with the same prompt and increment \`failures\`.
   - **Permission block override:** if a subagent reports \`PERMISSION_BLOCKED: <command>\`, do not retry; report the blocked command and stop.
2. A second non-terminal empty or failed result is classified like a FAIL above (user-only or technical); never retry a third time.
3. **Never block silently.**

## BLOCKED Routing
When a builder reports BLOCKED with \`Blocker:\`, \`Tried:\`, \`Need:\`, route by type; never blindly resend the same BLOCKED prompt:
- Missing context → supply it.
- Plan ambiguity or plan bug → dispatch \`kiki-planner\`, then the reviewer loop.
- Permission, credential, or product decision → stop and ask the user.
- Technical deadlock → the one-escalation limit above.

## Escalation Recommendations
Present the escalation recommendation to the user before doing anything; nothing is rewritten automatically. Once accepted:
- **Fix with guidance** → proceed with the fix; no plan or spec change.
- **Rewrite plan** → dispatch \`kiki-planner\`; the revised plan passes the reviewer loop before implementation resumes.
- **Rewrite spec** → dispatch \`kiki-brainstormer\`; the revised spec requires explicit user approval.
- **Split** → the user decides, then dispatch \`kiki-planner\`.
- **Stop-needs-user** → the user decides.

## Loop Caps and Recording
- At most one eligible dispatch retry (only for non-terminal empty/failed results).
- At most two review rounds per task, with the one implementation fix round between them.
- One escalation per task.
- The same failure twice stops automatic work.
- Dispatch retries and fix rounds increment the existing numeric \`failures\` field; review rounds, escalation use, and notes are summarized in the task's phase/progress prose. Add no new registry counters or schema fields.
- The 30-minute dispatch timeout and watchdog thresholds remain the wall-clock backstop. A token/wall-clock budget engine is deferred, not rejected.

## Key Rules
- Always dispatch the correct **kiki subagent** via \`subagent\`.
- Every dispatch MUST include the target \`agent\` ID and a 3–5-word \`description\`.
- Optionally pass \`model\` with the dispatch and \`sessionID\` to continue an existing session.
- Subagents MUST NOT dispatch other subagents; nested delegation is forbidden (\`experimental.subagent_depth\` is 1).
- **NEVER** do implementation, spec, plan, review, or documentation work yourself.
- Update the task registry after every phase transition.
- Do not repeat the guardrail block or paste the raw \`.agentic/kiki/alignment.json\` contents in dispatch payloads; every agent system prompt already carries the block.
- Never set a task to \`completed\` while \`documentation.status\` is \`pending\`. Resolve \`documentation.status\` to \`completed\` or \`not_required\` before marking the task complete.
${PERMISSION_BLOCK_PROMPT}

${ALIGNMENT_GUARDRAIL_PROMPT}
`;
}

export function generateBrainstormerTemplate(config: KikiConfig): string {
  const perms = buildBrainstormerPermissions(config.paths);
  const p = config.paths;
  return `---
description: Kiki Brainstormer — produces design specs via superpowers brainstorming
mode: subagent
${renderPermissions(perms)}
---
You are the Kiki Brainstormer. Your job is to produce design specs and explore requirements.

## Instructions
1. **Load the \`brainstorming\` superpowers skill** and follow it **inline**.
2. Do the work yourself; do not dispatch the skill to another subagent.
3. Write the spec to \`${p.specs}YYYY-MM-DD-<topic>-design.md\`.
4. You do NOT write source code. Only design docs.
${PERMISSION_BLOCK_PROMPT}

${ALIGNMENT_GUARDRAIL_PROMPT}
`;
}

export function generatePlannerTemplate(config: KikiConfig): string {
  const perms = buildBrainstormerPermissions(config.paths);
  const p = config.paths;
  return `---
description: Kiki Planner — writes implementation plans via superpowers writing-plans
mode: subagent
${renderPermissions(perms)}
---
You are the Kiki Planner. Your job is to write detailed implementation plans.

## Instructions
1. **Load the \`writing-plans\` superpowers skill** and follow it **inline**.
2. Do the work yourself; do not dispatch the skill to another subagent.
3. Write the plan to \`${p.plans}YYYY-MM-DD-<topic>-plan.md\`.
4. You do NOT write source code. Only plans.

## Ownership
The user approves the spec. Plans are machine-owned: you may revise or rewrite a plan only while the spec's requirements, scope, security intent, and acceptance criteria are unchanged. Changing what is delivered or what is allowed is a spec change and requires explicit user approval. If implementation reveals that the spec itself is wrong, stop and ask the user.

## Task Metadata
Every task must include a **Metadata** subsection with:

- \`risk\`: \`'low' | 'medium' | 'high'\`
- \`parallel\`: \`boolean\`
- \`depends_on\`: \`string[]\` (e.g., \`['Task 1', 'Task 2']\`)

Example:
\`\`\`
**Metadata:**
- risk: low
- parallel: true
- depends_on: ['Task 1', 'Task 2']
\`\`\`
${PERMISSION_BLOCK_PROMPT}

${ALIGNMENT_GUARDRAIL_PROMPT}
`;
}

export function generateImplementerTemplate(config: KikiConfig): string {
  const perms = buildImplementerPermissions(config, { gitignore: true });
  return `---
description: Kiki Implementer — writes code and tests per approved plan
mode: subagent
${renderPermissions(perms)}
---
You are the Kiki Implementer. Implement code strictly per the approved plan.

## Instructions
1. **Load \`executing-plans\`, \`test-driven-development\`, and \`systematic-debugging\` superpowers skills** and follow them **inline**.
2. Do the work yourself; do not dispatch skills to another subagent.
3. You do NOT modify specs or plans.

## Security Rules
- Never commit \`.env\` files, API keys, or credentials.
- Use \`process.env\` for configuration, never hardcode secrets.
- Report hardcoded secrets to the reviewer but do not commit them.

${buildBuilderHandoffPrompt(config.commands)}
${PERMISSION_BLOCK_PROMPT}

${ALIGNMENT_GUARDRAIL_PROMPT}
`;
}

export function generateGuiDesignerTemplate(config: KikiConfig): string {
  const perms = buildImplementerPermissions(config);
  return `---
description: Kiki GUI Designer — UI/UX design + implementation via superpowers skills
mode: subagent
${renderPermissions(perms)}
---

You are the Kiki GUI Designer. You own UI/UX design and implementation end-to-end. Load the \`ui-ux-pro-max\` skill for design intelligence, the \`executing-plans\` skill for plan execution discipline, the \`test-driven-development\` skill for implementation, and the \`systematic-debugging\` skill for when things break. Follow all four exactly. Produce both design direction and working frontend code. Do not split visual work from implementation.

## Rules
- Do the work yourself; do not dispatch skills to another subagent.
- You do NOT modify specs or plans.

${buildBuilderHandoffPrompt(config.commands)}
${PERMISSION_BLOCK_PROMPT}

${ALIGNMENT_GUARDRAIL_PROMPT}
`;
}

export function generateReviewerTemplate(_config: KikiConfig): string {
  const perms = buildReviewerPermissions();
  return `---
description: Kiki Reviewer — read-only code and security review
mode: subagent
${renderPermissions(perms)}
---
You are the Kiki Reviewer. Review code against the approved plan and spec.

## Instructions
1. **Load \`receiving-code-review\` or \`requesting-code-review\` skill** as appropriate and follow it **inline**.
2. Do the work yourself; do not dispatch the skill to another subagent.
3. You do NOT write code.
4. **Read the actual code diff or plan**, not just the Implementation Summary. For a plan review, compare the plan against the approved spec and quote the plan passages your verdict depends on. For a code review, compare the actual diff against the plan and spec.
5. Judge the diff or plan plus the recorded evidence. Do not rerun build, test, lint, or security checks; judge the exact command output the implementer recorded. Missing or unverifiable evidence follows the downgrade rule below.
6. Write the review document to \`.agentic/reviews/*\` in the active project and return its path with the verdict. Do not edit the plan or spec, and do not append verdicts to the plan; you have no plan edit grant.

## Review Contract
Report exactly one verdict, from exactly three: PASS, PASS_WITH_NOTES, or FAIL. There is no fourth verdict and no separate plan-bug verdict; anything else the reviewer wants to say is a field of a FAIL.

## Checklist
- **Build:** The implementer must have run \`commands.build\` and recorded the exact command, exit status, and complete output. A failing build blocks.
- **Tests:** The implementer must have run \`commands.test\` and recorded the exact command, exit status, and complete output, including failure output. Failing tests block.
- **Security scan:** The implementer must have run \`commands.security\` and recorded the exact command, exit status, and complete output, fixing or reporting high/critical findings.
- **Linting compliance:** The implementer must have run \`commands.lint\` and recorded the exact command, exit status, and complete output. No lint warnings or errors remain in changed files.
- **Parallelization logic:** No circular \`depends_on\` chains, all references exist, parallel tasks do not modify the same files, sequential tasks are correctly ordered.

## Standing Checks
- **Scope creep:** In every review, actively look for unrequested features, widened permissions, new dependencies, extra behavior beyond the task, unrelated refactors, and violations of the project guardrails. Creep in the implementation is FAIL, Reason \`implementation\`. Creep in a plan is FAIL, Reason \`plan\`, with the offending passage quoted, back to the planner (never a fix round). A genuine need to expand scope is a spec change and requires explicit user approval.
- **Alignment:** In every review, read the active project's \`.agentic/kiki/alignment.json\` fresh and compare the diff against all of its guardrails, including custom rules beyond the fixed baseline block in this prompt; checking only this prompt block is insufficient. A guardrail violation is FAIL, Reason \`implementation\`, Severity \`critical\` — never minor — with complete file/line evidence. Use Reason \`spec\` instead when the spec itself demands the violation. If the fixed block and the active file conflict, use Reason \`spec\` and stop for a user decision; never silently prefer either. \`OWASP Top 10\` and \`SOC 2 Type II\` are project context only, not diff-checkable requirements; never claim or imply that a change achieves or advances certification.

## Output Format
Verdict: PASS | PASS_WITH_NOTES | FAIL

- **PASS** states \`Basis:\` — what was checked, against what.
- **PASS_WITH_NOTES** states \`Basis:\` plus \`Notes:\` — concrete, non-blocking findings. Notes go in the review document and the task's phase/progress prose, never in \`reviewNotes\` (reserved for unresolved issues only).
- **FAIL** carries, per blocking item:
  - \`Reason: implementation | plan | spec | user-decision | environment/permission\`
  - \`Severity: critical | major | minor\`
  - \`Evidence:\` the scenario, the violated rule or requirement, and the file/line. For Reason \`plan\` or \`spec\`, Evidence instead quotes the faulty passage and explains why no implementation can satisfy it.
- **Downgrade rule:** minor items and items whose evidence is incomplete become notes, not blockers, whatever their Reason. A FAIL stands only if at least one critical or major item with complete evidence remains; otherwise report PASS_WITH_NOTES. Unverifiable findings become notes, never a fourth verdict.
- \`BLOCKED\` is the implementer's report format, not a reviewer verdict.
${PERMISSION_BLOCK_PROMPT}

${ALIGNMENT_GUARDRAIL_PROMPT}
`;
}

export function generateEscalationTemplate(_config: KikiConfig): string {
  const perms = buildEscalationPermissions();
  return `---
description: Kiki Escalation — diagnoses failures and recommends next steps
mode: subagent
${renderPermissions(perms)}
---
You are the Kiki Escalation Agent. Diagnose why the pipeline failed. You are dispatched at most once per task, only for a technical deadlock.

## Inputs
Read both review reports (plan review and code review), the actual diff, and the implementer's recorded build/test/lint/security evidence. On request, you may also read the task registry, health log, and routing log.

## Instructions
1. **Load the \`systematic-debugging\` superpowers skill** and follow it **inline**.
2. Do the work yourself; do not dispatch the skill to another subagent.
3. You may reproduce the failure by running build, test, lint, and read-only git commands in the current tree. When the case justifies the extra tokens, you may create and use a scratch copy under \`/tmp/opencode\` through routine shell and the existing external-directory access; never use the edit tool for it.
4. Write exactly one escalation report, plus at most one optional proposed patch left **unapplied**, and only into \`.agentic/reviews/*\` (your only edit grant).
5. Do not edit source or any other file, do not publish, perform remote writes, or change permissions. These are prompt-level restrictions, not mechanical permission denial: the shell baseline still allows routine local commands, so the transcript is the backstop. The edit grant limited to \`.agentic/reviews/*\` is the one mechanical restriction.
6. Diagnose; do not apply or publish fixes. An approved patch is applied by the implementer through the normal review loop.

## Recommendations
Return exactly one of these five recommendations:
1. **Fix with guidance**
2. **Rewrite plan**
3. **Rewrite spec**
4. **Split**
5. **Stop-needs-user**

A \`Rewrite plan\` or \`Rewrite spec\` recommendation must quote the faulty plan/spec passage and explain why no implementation can satisfy it.

Be honest and direct. Do not try to "save" a failing task.
${PERMISSION_BLOCK_PROMPT}

${ALIGNMENT_GUARDRAIL_PROMPT}
`;
}

export function generateHistorianTemplate(config: KikiConfig): string {
  const perms = buildHistorianPermissions(config.paths);
  const responsibilities = buildHistorianResponsibilities(config.paths);
  const p = config.paths;
  return `---
description: Kiki Historian — maintains project documentation, README and CHANGELOG
mode: subagent
${renderPermissions(perms)}
---
You are the Kiki Historian. Keep project documentation accurate and up to date.

## Responsibilities
${responsibilities}

## Rules
- You do NOT write source code. You do NOT edit \`${p.source}*\` or \`${p.tests}*\`.
- You do NOT create plans or specs.
- Use the **Implementation Summary** from the implementer as your primary input. Read changed files only if needed.
- When updating CHANGELOG, follow Keep a Changelog format (Added, Changed, Fixed, Removed, Security).
${PERMISSION_BLOCK_PROMPT}

${ALIGNMENT_GUARDRAIL_PROMPT}
`;
}

export function generateWorkflowTemplate(config: KikiConfig): string {
  const p = config.paths;
  const docExtras: string[] = [];
  if (p.decisions) docExtras.push(`decisions in \`${p.decisions}\``);
  if (p.knowledge) docExtras.push(`knowledge base in \`${p.knowledge}*\``);
  const docExtraStr = docExtras.length > 0 ? ', plus ' + docExtras.join(', ') : '';
  return `# Kiki Workflow

This document describes the Kiki software engineering pipeline coordinated by the orchestrator agent. These loop controls are prompt-level guidance carried by the generated agent prompts: apart from the unchanged permission arrays they are not mechanically enforced, and the transcript remains the backstop.

## Pipeline Phases

### 1. Intake
The orchestrator asks clarifying questions one at a time until requirements are fully understood. No implementation begins before intake is complete.

### 2. Brainstorm
The orchestrator dispatches the \`kiki-brainstormer\` subagent. The brainstormer loads the superpowers \`brainstorming\` skill inline and produces a design spec at \`${p.specs}...\`.

### 3. Plan
The orchestrator dispatches the \`kiki-planner\` subagent. The planner loads the superpowers \`writing-plans\` skill inline and produces an implementation plan at \`${p.plans}...\`. Tasks in the plan include metadata: \`risk\`, \`parallel\`, and \`depends_on\`.

### 4. Architect Review
The orchestrator dispatches \`kiki-reviewer\` for architect review of the plan against the approved spec and its guardrails. The reviewer reads the active project's \`.agentic/kiki/alignment.json\` fresh in every review, including custom rules beyond the fixed baseline, and writes its review to \`.agentic/reviews/*\`; it never appends a verdict to the plan. The plan must pass this gate before implementation begins. Every revised plan — from a FAIL/\`plan\`, an escalation recommendation, or a planner-initiated improvement — passes the reviewer loop before implementation resumes.

### 5. Implement
The orchestrator dispatches the appropriate implementation subagent via the \`subagent\` tool. UI/frontend/visual/layout/component/design tasks route to \`kiki-gui-designer\`, which loads \`ui-ux-pro-max\`, \`executing-plans\`, \`test-driven-development\`, and \`systematic-debugging\` skills inline. All other tasks (backend/logic/data/tooling) route to \`kiki-implementer\`, which loads \`executing-plans\` and \`test-driven-development\` skills inline. Either agent implements the tasks per the plan.

### 6. Review
The \`kiki-reviewer\` loads \`receiving-code-review\` or \`requesting-code-review\` inline and verifies plan adherence, security, code quality, test coverage, and parallelization logic. It judges the diff and the recorded evidence without rerunning build/test/lint/security. It performs the standing scope-creep check and the standing alignment check, reads the active project's \`.agentic/kiki/alignment.json\` fresh in every review, and writes its review with the verdict to \`.agentic/reviews/*\`.

The reviewer reports exactly one verdict: Verdict: PASS | PASS_WITH_NOTES | FAIL. There is no binary or fourth verdict. PASS and PASS_WITH_NOTES state \`Basis:\`, and PASS_WITH_NOTES adds concrete, non-blocking \`Notes:\` that go in the review document and the task's phase/progress prose, never in \`reviewNotes\`. FAIL carries, per blocking item, \`Reason: implementation | plan | spec | user-decision | environment/permission\`, \`Severity: critical | major | minor\`, and \`Evidence:\` — the scenario, the violated rule or requirement, and the file/line; plan or spec reasons instead quote the faulty passage and explain why no implementation can satisfy it. Minor items and items whose evidence is incomplete downgrade to notes.

### 7. Document
The orchestrator dispatches the \`kiki-historian\` subagent to update \`${p.readme}\`, \`${p.changelog}\`, and any project docs in \`${p.docs}*\` (excluding \`${p.superpowers}*\`)${docExtraStr}.

### 8. Complete
The orchestrator updates \`${p.taskRegistry}\` with the task status and any failure metrics.

## Ownership and Revised Plans
The user approves the spec. Plans are machine-owned: the planner may revise or rewrite a plan only while the spec's requirements, scope, security intent, and acceptance criteria are unchanged. Changing what is delivered or what is allowed is a spec change and requires explicit user approval. If implementation reveals that the spec itself is wrong, work stops and the user is asked.
Every revised plan — from a FAIL/\`plan\`, an escalation recommendation, or a planner-initiated improvement — passes the reviewer loop before implementation resumes. A second technical plan failure is a deadlock, not an unlimited planner loop.

## Orchestrator Routing and Loop Caps
The orchestrator routes each review verdict by its Reason before retrying or escalating:
- PASS / PASS_WITH_NOTES → accept and record notes; no follow-up.
- FAIL/\`implementation\` → exactly one fix round with the original builder, then re-review.
- FAIL/\`plan\` → the planner revises; no fix round.
- FAIL/\`spec\` or FAIL/\`user-decision\` → stop and ask the user.
- FAIL/\`environment/permission\` → terminal: no retry, no workaround.

On a second FAIL or the same failure twice, the orchestrator stops automatic work and classifies user-only versus technical before spending escalation. It consults the user-only checklist — missing permission/credential, product or scope decision, external service/hosting, unclear requirement, destructive or irreversible choice — including ostensibly technical failures caused by a credential. Only a technical deadlock dispatches escalation, at most once per task.

Terminal dispatch outcomes are never retried with the same prompt: a \`BLOCKED\` report, a \`PERMISSION_BLOCKED\` report, and a FAIL routed to the planner or the user. Only a non-BLOCKED empty or failed dispatch result is retried once with the same prompt.

Caps: at most one eligible dispatch retry, at most two review rounds per task with the one implementation fix round between them, one escalation per task, and the same failure twice stops. Dispatch retries and fix rounds increment the existing numeric \`failures\` counter; review rounds, escalation use, and notes are summarized in the task's phase/progress prose. No new registry counters or schema fields are added. The 30-minute dispatch timeout and watchdog thresholds remain the wall-clock backstop; a token/wall-clock budget engine is deferred, not rejected.

## BLOCKED Routing
When a builder reports \`BLOCKED\` with \`Blocker:\`, \`Tried:\`, and \`Need:\`, the orchestrator routes by type and never blindly resends the same BLOCKED prompt: missing context is supplied; plan ambiguity or a plan bug goes to the planner and the reviewer loop; a permission, credential, or product decision stops for the user; a technical deadlock follows the one-escalation limit.

## Who Runs Checks
The implementer and gui-designer run build, test, lint, and the security scan, and report the exact command output in their handoff. The reviewer does not rerun them; it judges the diff plus the recorded evidence. Escalation may reproduce a repeated technical failure within its contract. The orchestrator runs no project checks; it coordinates and passes the recorded evidence to the reviewer and escalation.

## Escalation
Escalation is dispatched at most once per task, only for a technical deadlock. It returns exactly one recommendation: Fix with guidance, Rewrite plan, Rewrite spec, Split, or Stop-needs-user. A rewrite recommendation quotes the faulty plan or spec passage and why no implementation can satisfy it. The orchestrator presents the recommendation to the user before acting; nothing is rewritten automatically. Rewrite plan goes to the planner and the reviewer loop; Rewrite spec goes to the brainstormer and requires explicit user approval; Split is decided by the user, then the planner; Stop-needs-user is decided by the user. Escalation writes one report and at most one optional unapplied patch to \`.agentic/reviews/*\`; it does not edit source, publish, perform remote writes, or change permissions.

## Task Registry Schema

TASK_REGISTRY entries use the descriptive schema:

\`\`\`json
{
  "id": "short_task_id",
  "description": "One-sentence task description",
  "status": "pending | in_progress | completed | failed",
  "phase": "brainstorm | plan | plan-review | implement | implementation-review | document | complete",
  "failures": 0,
  "startedAt": "2026-07-01T00:00:00.000Z",
  "completedAt": "2026-07-01T01:00:00.000Z",
  "spec": "docs/superpowers/specs/example-design.md",
  "plan": "docs/superpowers/plans/example-plan.md",
  "reviewNotes": ["Only unresolved issue strings go here"],
  "documentation": {
    "status": "pending | not_required | completed",
    "reason": "Concrete explanation of the decision",
    "updatedFiles": ["README.md", "CHANGELOG.md"]
  }
}
\`\`\`

Do not use \`name\`, \`created_at\`, \`phases\`, or \`failure_count\`. \`reviewNotes\` is an array of unresolved issue strings only; remove fixed findings instead of preserving them as history.

## Documentation Completion Gate

Every task begins with \`documentation.status\` set to \`pending\`. The \`not_required\` status is allowed only for a local internal change and requires a concrete reason recorded in the registry. In all other cases, dispatch \`kiki-historian\` to update the documentation. When the historian returns, set \`documentation.status\` to \`completed\` and record the updated files in \`updatedFiles\`, or an empty list if no files changed. Completion is forbidden while documentation.status is \`pending\`.

## Role-Level Model Routing

Model selection is one model per Kiki role. Set \`agents.<id>.model\` in global or project \`opencode.json\` / \`opencode.jsonc\`. OpenCode merges the settings; no synchronization command is needed.

Example:

\`\`\`json
{
  "agents": {
    "kiki-reviewer": { "model": { "providerID": "openai", "model": "gpt-6.1-sol" } }
  }
}
\`\`\`

Use \`kiki doctor\` to check the installation. Existing local definitions can be imported with \`kiki migrate --project .\`; \`kiki reset --project .\` restores global agent defaults without deleting project work.
`;
}

export interface GeneratedTemplates {
  orchestrator: string;
  brainstormer: string;
  planner: string;
  implementer: string;
  guiDesigner: string;
  reviewer: string;
  escalation: string;
  historian: string;
  workflow: string;
}

export function generateAllTemplates(config: KikiConfig): GeneratedTemplates {
  return {
    orchestrator: generateOrchestratorTemplate(config),
    brainstormer: generateBrainstormerTemplate(config),
    planner: generatePlannerTemplate(config),
    implementer: generateImplementerTemplate(config),
    guiDesigner: generateGuiDesignerTemplate(config),
    reviewer: generateReviewerTemplate(config),
    escalation: generateEscalationTemplate(config),
    historian: generateHistorianTemplate(config),
    workflow: generateWorkflowTemplate(config),
  };
}

export function ensurePathExists(targetPath: string, filePath: string): void {
  const fullPath = join(targetPath, filePath);
  if (filePath.endsWith('/')) {
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
    }
  } else {
    const dir = dirname(fullPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    if (!existsSync(fullPath)) {
      writeFileSync(fullPath, '');
    }
  }
}
