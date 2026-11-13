import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
export const DEFAULT_PATHS = {
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
export const DEFAULT_HEALTH = {
    watchdogEnabled: true,
    stuckThresholdMs: 300_000,
    gracePeriodMs: 120_000,
    absoluteMaxMs: 3_600_000,
    checkIntervalMs: 30_000,
    loopRepeatCount: 3,
    watchAllSubagents: false,
    logPath: '.agentic/kiki/health_log.jsonl',
};
/**
 * Kiki version. MUST be kept in sync with package.json on every release. The
 * published package ships only dist/ (see package.json "files"), so a globally
 * installed CLI cannot read its own package.json at runtime — this const is the
 * runtime source of truth for version checks and release transforms.
 */
export const KIKI_VERSION = '3.0.1';
export const DEFAULT_CONFIG = {
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
};
export const DEFAULT_ALIGNMENT = {
    guardrails: [
        'No hardcoded secrets in source code',
        'All database queries must use parameterized statements',
        'API responses must not leak internal stack traces',
    ],
    compliance: ['OWASP Top 10', 'SOC 2 Type II'],
};
function dirGlob(path) {
    if (path.endsWith('/'))
        return path + '**';
    return path + '/**';
}
function fileGlob(path) {
    const lastSlash = path.lastIndexOf('/');
    const filename = lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
    const dotIndex = filename.lastIndexOf('.');
    if (dotIndex > 0) {
        const prefix = filename.substring(0, dotIndex);
        return (lastSlash >= 0 ? path.substring(0, lastSlash + 1) : '') + prefix + '*';
    }
    return path;
}
function fileDir(path) {
    const lastSlash = path.lastIndexOf('/');
    return lastSlash >= 0 ? path.substring(0, lastSlash + 1) : '';
}
function worktreeGlob(path) {
    return '.worktree/**/' + path;
}
export function loadConfig(targetPath) {
    const modernConfigPath = join(targetPath, '.agentic', 'kiki', 'config.json');
    const legacyConfigPath = join(targetPath, '.agentic', 'config.json');
    const configPath = existsSync(modernConfigPath) ? modernConfigPath : legacyConfigPath;
    if (!existsSync(configPath))
        return { ...DEFAULT_CONFIG };
    try {
        const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
        const { riskMatrix: _discardedRiskMatrix, models: _discardedModels, ...rest } = raw;
        return {
            ...DEFAULT_CONFIG,
            ...rest,
            paths: { ...DEFAULT_PATHS, ...(rest.paths ?? {}) },
            health: { ...DEFAULT_HEALTH, ...(rest.health ?? {}) },
        };
    }
    catch {
        return { ...DEFAULT_CONFIG };
    }
}
function allow(action, resource) {
    return { action, resource, effect: 'allow' };
}
function deny(action, resource) {
    return { action, resource, effect: 'deny' };
}
// Routine local work runs without approval prompts; the role prompts still
// govern behavior (the orchestrator remains coordination-only by instruction).
// The baseline allow comes first so publishing/remote-changing asks appended
// after it win (last matching rule wins).
const PUBLISH_ASK_PATTERNS = [
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
const FORCE_PUSH_DENIES = [
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
function shellRules() {
    const asks = PUBLISH_ASK_PATTERNS.map(resource => ({
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
function buildBroadReadPermissions() {
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
const KIKI_SUBAGENTS = [
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
function routeRules(options) {
    const rules = [
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
        for (const agent of KIKI_SUBAGENTS)
            rules.push(allow('subagent', agent));
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
function buildBrainstormerPermissions(p) {
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
        allow('edit', worktreeGlob(sw)),
        allow('edit', worktreeGlob(plans)),
        allow('edit', worktreeGlob(specs)),
        ...shellRules(),
        ...routeRules({ research: true }),
    ];
}
function buildImplementerPermissions(config) {
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
        allow('edit', worktreeGlob(src)),
        allow('edit', worktreeGlob(tst)),
        allow('edit', '/tmp/**'),
        allow('edit', 'tmp/**'),
        allow('edit', SDD_WORKSPACE_GLOB),
        ...shellRules(),
        ...routeRules({ research: false, externalDirectory: ['/tmp/**', 'tmp/**'] }),
    ];
}
function buildReviewerPermissions() {
    return [
        ...buildBroadReadPermissions(),
        deny('edit', '*'),
        deny('edit', 'src/**'),
        deny('edit', 'tests/**'),
        deny('edit', 'docs/**'),
        allow('edit', '.agentic/reviews/*'),
        allow('edit', '.opencode/docs/reviews/*'),
        allow('edit', '.worktree/**/.agentic/reviews/*'),
        allow('edit', '.worktree/**/.opencode/docs/reviews/*'),
        ...shellRules(),
        ...routeRules({ research: false, externalDirectory: ['/tmp/**', 'tmp/**'] }),
    ];
}
function buildEscalationPermissions() {
    return [
        ...buildBroadReadPermissions(),
        deny('edit', '*'),
        allow('edit', '.agentic/reviews/*'),
        allow('edit', '.opencode/docs/reviews/*'),
        allow('edit', '.worktree/**/.agentic/reviews/*'),
        allow('edit', '.worktree/**/.opencode/docs/reviews/*'),
        ...shellRules(),
        ...routeRules({ research: false, externalDirectory: ['/tmp/**', 'tmp/**'] }),
    ];
}
function buildHistorianPermissions(p) {
    const src = dirGlob(p.source);
    const tst = dirGlob(p.tests);
    const readmeGlob = fileGlob(p.readme);
    const changelogGlob = fileGlob(p.changelog);
    const docsGlob = dirGlob(p.docs);
    const rules = [
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
            rules.push(allow('edit', worktreeGlob(decGlob)));
        }
    }
    if (p.knowledge) {
        const kgGlob = dirGlob(p.knowledge);
        rules.push(allow('edit', kgGlob));
        rules.push(allow('edit', worktreeGlob(kgGlob)));
    }
    rules.push(allow('edit', '.agentic/**'));
    rules.push(allow('edit', worktreeGlob(readmeGlob)));
    rules.push(allow('edit', worktreeGlob(changelogGlob)));
    rules.push(allow('edit', worktreeGlob(docsGlob)));
    rules.push(allow('edit', '.worktree/**/.agentic/**'));
    rules.push(deny('edit', src));
    rules.push(deny('edit', tst));
    rules.push(deny('edit', worktreeGlob(src)));
    rules.push(deny('edit', worktreeGlob(tst)));
    rules.push(...shellRules());
    rules.push(...routeRules({ research: false }));
    return rules;
}
function buildOrchestratorPermissions(p) {
    // The shared shell baseline applies here too, so a primary session does not
    // prompt for routine local work; the orchestrator prompt keeps coordination
    // authoritative by instruction. Read protections apply and the only edit
    // grants are the task registry and the SDD ledger/briefs workspace.
    return [
        ...buildBroadReadPermissions(),
        deny('edit', '*'),
        allow('edit', p.taskRegistry),
        allow('edit', SDD_WORKSPACE_GLOB),
        ...shellRules(),
        ...routeRules({ research: false, orchestrator: true }),
    ];
}
function renderPermissions(rules) {
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
const PERMISSION_BLOCK_PROMPT = 'Do not circumvent publishing-route approval via scripts, wrappers, alternate tools, APIs, or delegation. Request approval for the intended publishing operation. If approval is rejected, do not retry or work around it; report PERMISSION_BLOCKED: <command> and stop.';
function buildHistorianResponsibilities(p) {
    const lines = [
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
export function generateOrchestratorTemplate(config) {
    const p = config.paths;
    const perms = buildOrchestratorPermissions(p);
    return `---
description: Kiki Orchestrator — routes the superpowers pipeline
mode: primary
${renderPermissions(perms)}
---
You are the Kiki Orchestrator. You are **COORDINATION-ONLY**.

## Your Role
Dispatch the correct subagent via the \`subagent\` tool. Do not write code, implementation files, docs, or run commands. The only direct file edit you may perform is updating \`${p.taskRegistry}\` for task state, phase transitions, and failure counts. Agent models and permissions are configured in global/project \`opencode.json\` or \`opencode.jsonc\` and resolved by OpenCode.

## Dispatch Rules
- UI/frontend/visual/layout/component/design task → @kiki-gui-designer
- Backend/logic/data/tooling task → @kiki-implementer
- Design/spec phase → @kiki-brainstormer
- Planning phase → @kiki-planner
- Review phase → @kiki-reviewer
- Documentation decision required → dispatch @kiki-historian unless the registry explicitly records \`documentation.status: "not_required"\` with a concrete reason.
- Failure diagnosis → @kiki-escalation

## Process
1. **Intake:** Ask clarifying questions one at a time until requirements are clear.
2. **Brainstorm:** Dispatch \`kiki-brainstormer\`.
3. **Plan:** Dispatch \`kiki-planner\`.
4. **Architect Review:** Dispatch \`kiki-reviewer\` for architect review of the plan against \`.agentic/kiki/alignment.json\`.
5. **Implement:** Dispatch \`kiki-implementer\`.
6. **Review:** Dispatch \`kiki-reviewer\`.
7. **Document:** Dispatch \`kiki-historian\` to update \`${p.readme}\`, \`${p.changelog}\`, and project docs.
8. **Complete:** Update \`${p.taskRegistry}\` with the task status and any failure metrics.

## Key Rules
- Always dispatch the correct **kiki subagent** via \`subagent\`.
- Every dispatch MUST include the target \`agent\` ID and a 3–5-word \`description\`.
- Optionally pass \`model\` with the dispatch and \`sessionID\` to continue an existing session.
- Subagents MUST NOT dispatch other subagents; nested delegation is forbidden (\`experimental.subagent_depth\` is 1).
- **NEVER** do implementation, spec, plan, review, or documentation work yourself.
- Update the task registry after every phase transition.
- Never hardcode secrets or log sensitive data.
- Never set a task to \`completed\` while \`documentation.status\` is \`pending\`. Resolve \`documentation.status\` to \`completed\` or \`not_required\` before marking the task complete.
- If a task fails twice, dispatch \`kiki-escalation\`.

## Handling Empty or Failed Subagent Results
A dispatch fails when the subagent returns empty output, cannot complete, tests fail after 3 retries, or exceeds 30 minutes.

1. **Retry once** with the same prompt.
   - **Permission block override:** if a subagent reports \`PERMISSION_BLOCKED: <command>\`, do not retry; report the blocked command and stop.
2. Before dispatching \`kiki-escalation\`, log the failure in \`${p.taskRegistry}\`, increment the failure counter, and include the failed phase and reason.
3. **Never block silently.**
${PERMISSION_BLOCK_PROMPT}
`;
}
export function generateBrainstormerTemplate(config) {
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
`;
}
export function generatePlannerTemplate(config) {
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
`;
}
export function generateImplementerTemplate(config) {
    const perms = buildImplementerPermissions(config);
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

## Rollback Safety
- Before starting, record the current project state so a failed implementation can be reverted safely:
  1. Run \`git diff > /tmp/kiki-tracked-before.patch\` to capture tracked changes.
  2. Run \`git ls-files --others --exclude-standard > /tmp/kiki-untracked-before.txt\` to capture existing untracked files.
- Do NOT use \`git clean -fd\` at any point — it could delete user files.
- If build/test/lint/security fail after all retries:
  1. Revert tracked changes: \`git checkout -- .\`
  2. Delete only new untracked files created during this implementation. Read \`/tmp/kiki-untracked-before.txt\` and remove any untracked file not listed there.
  3. Report the failure to the orchestrator.
- On success, you may delete \`/tmp/kiki-tracked-before.patch\` and \`/tmp/kiki-untracked-before.txt\`.

## Handoff
When done, append a short **Implementation Summary** (3–5 sentences + changed files) for the reviewer and historian.
${PERMISSION_BLOCK_PROMPT}
`;
}
export function generateGuiDesignerTemplate(config) {
    const perms = buildImplementerPermissions(config);
    return `---
description: Kiki GUI Designer — UI/UX design + implementation via superpowers skills
mode: subagent
${renderPermissions(perms)}
---

You are the Kiki GUI Designer. You own UI/UX design and implementation end-to-end. Load the \`ui-ux-pro-max\` skill for design intelligence, the \`executing-plans\` skill for plan execution discipline, the \`test-driven-development\` skill for implementation, and the \`systematic-debugging\` skill for when things break. Follow all four exactly. Produce both design direction and working frontend code. Do not split visual work from implementation.
${PERMISSION_BLOCK_PROMPT}
`;
}
export function generateReviewerTemplate(_config) {
    const perms = buildReviewerPermissions();
    return `---
description: Kiki Reviewer — read-only code and security review
mode: subagent
${renderPermissions(perms)}
---
You are the Kiki Reviewer. Review code against the approved plan.

## Instructions
1. **Load \`receiving-code-review\` or \`requesting-code-review\` skill** as appropriate and follow it **inline**.
2. Do the work yourself; do not dispatch the skill to another subagent.
3. You do NOT write code.
4. **Read the actual code diff**, not just the Implementation Summary.

## Checklist
- **Security scan:** The implementer must have run \`commands.security\` and fixed or reported high/critical findings.
- **Linting compliance:** The implementer must have run \`commands.lint\` and fixed all issues. No lint warnings or errors remain in changed files.
- **Parallelization logic:** No circular \`depends_on\` chains, all references exist, parallel tasks do not modify the same files, sequential tasks are correctly ordered.

## Output Format
\`\`\`
Verdict: PASS | FAIL
Blockers:
1. <if FAIL, numbered blockers>
\`\`\`
${PERMISSION_BLOCK_PROMPT}
`;
}
export function generateEscalationTemplate(_config) {
    const perms = buildEscalationPermissions();
    return `---
description: Kiki Escalation — diagnoses failures and recommends next steps
mode: subagent
${renderPermissions(perms)}
---
You are the Kiki Escalation Agent. Diagnose why the pipeline failed.

## Instructions
1. Read the task registry, routing log, and git history.
2. **Load the \`systematic-debugging\` superpowers skill** and follow it **inline**.
3. Do the work yourself; do not dispatch the skill to another subagent.
4. Recommend exactly one of:
   - **Redesign:** Start over with a new plan.
   - **Split:** Break into smaller sub-tasks.
   - **Stop:** Recommend cancellation.

Be honest and direct. Do not try to "save" a failing task.
${PERMISSION_BLOCK_PROMPT}
`;
}
export function generateHistorianTemplate(config) {
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
`;
}
export function generateWorkflowTemplate(config) {
    const p = config.paths;
    const docExtras = [];
    if (p.decisions)
        docExtras.push(`decisions in \`${p.decisions}\``);
    if (p.knowledge)
        docExtras.push(`knowledge base in \`${p.knowledge}*\``);
    const docExtraStr = docExtras.length > 0 ? ', plus ' + docExtras.join(', ') : '';
    return `# Kiki Workflow

This document describes the Kiki software engineering pipeline enforced by the orchestrator agent.

## Pipeline Phases

### 1. Intake
The orchestrator asks clarifying questions one at a time until requirements are fully understood. No implementation begins before intake is complete.

### 2. Brainstorm
The orchestrator dispatches the \`kiki-brainstormer\` subagent. The brainstormer loads the superpowers \`brainstorming\` skill inline and produces a design spec at \`${p.specs}...\`.

### 3. Plan
The orchestrator dispatches the \`kiki-planner\` subagent. The planner loads the superpowers \`writing-plans\` skill inline and produces an implementation plan at \`${p.plans}...\`. Tasks in the plan include metadata: \`risk\`, \`parallel\`, and \`depends_on\`.

### 4. Architect Review
The orchestrator dispatches \`kiki-reviewer\` for architect review of the plan against \`.agentic/kiki/alignment.json\` guardrails. The reviewer appends an inline verdict to the plan document. The plan must pass this gate before implementation begins.

### 5. Implement
The orchestrator dispatches the appropriate implementation subagent via the \`subagent\` tool. UI/frontend/visual/layout/component/design tasks route to \`kiki-gui-designer\`, which loads \`ui-ux-pro-max\`, \`executing-plans\`, \`test-driven-development\`, and \`systematic-debugging\` skills inline. All other tasks (backend/logic/data/tooling) route to \`kiki-implementer\`, which loads \`executing-plans\` and \`test-driven-development\` skills inline. Either agent implements the tasks per the plan.

### 6. Review
The \`kiki-reviewer\` loads \`receiving-code-review\` or \`requesting-code-review\` inline and verifies plan adherence, security, code quality, test coverage, and parallelization logic. An inline verdict is appended to the plan.

### 7. Document
The orchestrator dispatches the \`kiki-historian\` subagent to update \`${p.readme}\`, \`${p.changelog}\`, and any project docs in \`${p.docs}*\` (excluding \`${p.superpowers}*\`)${docExtraStr}.

### 8. Complete
The orchestrator updates \`${p.taskRegistry}\` with the task status and any failure metrics.

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
export function generateAllTemplates(config) {
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
export function ensurePathExists(targetPath, filePath) {
    const fullPath = join(targetPath, filePath);
    if (filePath.endsWith('/')) {
        if (!existsSync(fullPath)) {
            mkdirSync(fullPath, { recursive: true });
        }
    }
    else {
        const dir = dirname(fullPath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        if (!existsSync(fullPath)) {
            writeFileSync(fullPath, '');
        }
    }
}
//# sourceMappingURL=config.js.map