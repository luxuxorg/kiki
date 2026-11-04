import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { WATCHDOG_SOURCE } from '../plugin/watchdog-source.js';
import { DEDUP_SOURCE } from '../plugin/dedup-source.js';

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

/**
 * Kiki version, baked into the generated plugin as KIKI_PLUGIN_VERSION.
 * MUST be kept in sync with package.json on every release. The published
 * package ships only dist/ (see package.json "files"), so a globally
 * installed CLI cannot read its own package.json at runtime — this const
 * is the source of truth for the generator.
 */
export const KIKI_VERSION = '2.2.0';

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
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function buildBroadReadPermissions(): string {
  return `  read:
    "*": allow
    ".env*": deny
    "**/.env*": deny
    "**/*secret*": deny
    "**/*credential*": deny
    "**/*.pem": deny
    "**/*.key": deny
    "**/id_rsa*": deny`;
}

function buildBrainstormerPermissions(p: KikiPaths): string {
  const sw = dirGlob(p.superpowers);
  const plans = dirGlob(p.plans);
  const specs = dirGlob(p.specs);
  const src = dirGlob(p.source);
  const tst = dirGlob(p.tests);
  return `permission:
${buildBroadReadPermissions()}
  edit:
    "*": deny
    "${src}": deny
    "${tst}": deny
    "${sw}": allow
    "${plans}": allow
    "${specs}": allow
  bash:
    "*": deny
    "git diff*": allow
    "git log*": allow
    "mkdir*": allow`;
}

function buildImplementerPermissions(p: KikiPaths): string {
  const src = dirGlob(p.source);
  const tst = dirGlob(p.tests);
  const sw = dirGlob(p.superpowers);
  return `permission:
${buildBroadReadPermissions()}
  edit:
    "*": deny
    "${sw}": deny
    "${src}": allow
    "${tst}": allow
    "/tmp/**": allow
    "tmp/**": allow
  external_directory:
    "/tmp/**": allow
    "tmp/**": allow
  bash: allow`;
}

function buildReviewerPermissions(_p: KikiPaths): string {
  return `permission:
${buildBroadReadPermissions()}
  edit:
    "*": deny
    "src/**": deny
    "tests/**": deny
    "docs/**": deny
    ".agentic/reviews/*": allow
    ".opencode/docs/reviews/*": allow
  external_directory:
    "/tmp/**": allow
    "tmp/**": allow
  bash:
    "*": deny
    "git diff*": allow
    "git log*": allow`;
}

function buildEscalationPermissions(): string {
  return `permission:
${buildBroadReadPermissions()}
  edit:
    "*": deny
    ".agentic/reviews/*": allow
    ".opencode/docs/reviews/*": allow
  external_directory:
    "/tmp/**": allow
    "tmp/**": allow
  bash:
    "*": deny
    "git diff*": allow
    "git log*": allow`;
}

function buildHistorianPermissions(p: KikiPaths): string {
  const src = dirGlob(p.source);
  const tst = dirGlob(p.tests);
  const readmeGlob = fileGlob(p.readme);
  const changelogGlob = fileGlob(p.changelog);
  const docsGlob = dirGlob(p.docs);

  const editLines: string[] = [
    `"*": deny`,
    `"${readmeGlob}": allow`,
    `"${changelogGlob}": allow`,
    `"${docsGlob}": allow`,
  ];

  if (p.decisions) {
    const decDir = fileDir(p.decisions);
    if (decDir) {
      const decGlob = dirGlob(decDir);
      editLines.push(`"${decGlob}": allow`);
    }
  }

  if (p.knowledge) {
    const kgGlob = dirGlob(p.knowledge);
    editLines.push(`"${kgGlob}": allow`);
  }

  editLines.push(`".agentic/**": allow`);

  editLines.push(`"${src}": deny`);
  editLines.push(`"${tst}": deny`);

  return `permission:
${buildBroadReadPermissions()}
  edit:
    ${editLines.join('\n    ')}
  bash:
    "*": deny
    "git log*": allow
    "git diff*": allow`;
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
  return `---
description: Kiki Orchestrator — routes the superpowers pipeline
mode: primary
---
You are the Kiki Orchestrator. You are **COORDINATION-ONLY**.

## Your Role
Dispatch the correct subagent via the \`task\` tool. Do not write code, implementation files, docs, or run commands. The only direct file edit you may perform is updating \`${p.taskRegistry}\` for task state, phase transitions, and failure counts. Agent models and permissions are configured in global/project \`opencode.json\` or \`opencode.jsonc\` and resolved by OpenCode.

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
- Always dispatch the correct **kiki subagent** via \`task\`.
- **NEVER** do implementation, spec, plan, review, or documentation work yourself.
- Update the task registry after every phase transition.
- Never hardcode secrets or log sensitive data.
- Never set a task to \`completed\` while \`documentation.status\` is \`pending\`. Resolve \`documentation.status\` to \`completed\` or \`not_required\` before marking the task complete.
- If a task fails twice, dispatch \`kiki-escalation\`.

## Handling Empty or Failed Subagent Results
A dispatch fails when the subagent returns empty output, cannot complete, tests fail after 3 retries, or exceeds 30 minutes.

1. **Retry once** with the same prompt.
2. Before dispatching \`kiki-escalation\`, log the failure in \`${p.taskRegistry}\`, increment the failure counter, and include the failed phase and reason.
3. **Never block silently.**
`;
}

export function generateBrainstormerTemplate(config: KikiConfig): string {
  const perms = buildBrainstormerPermissions(config.paths);
  const p = config.paths;
  return `---
description: Kiki Brainstormer — produces design specs via superpowers brainstorming
mode: subagent
${perms}
---
You are the Kiki Brainstormer. Your job is to produce design specs and explore requirements.

## Instructions
1. **Load the \`brainstorming\` superpowers skill** and follow it **inline**.
2. Do the work yourself; do not dispatch the skill to another subagent.
3. Write the spec to \`${p.specs}YYYY-MM-DD-<topic>-design.md\`.
4. You do NOT write source code. Only design docs.
`;
}

export function generatePlannerTemplate(config: KikiConfig): string {
  const perms = buildBrainstormerPermissions(config.paths);
  const p = config.paths;
  return `---
description: Kiki Planner — writes implementation plans via superpowers writing-plans
mode: subagent
${perms}
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
`;
}

export function generateImplementerTemplate(config: KikiConfig): string {
  const perms = buildImplementerPermissions(config.paths);
  return `---
description: Kiki Implementer — writes code and tests per approved plan
mode: subagent
${perms}
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
`;
}

export function generateGuiDesignerTemplate(config: KikiConfig): string {
  const perms = buildImplementerPermissions(config.paths);
  return `---
description: Kiki GUI Designer — UI/UX design + implementation via superpowers skills
mode: subagent
${perms}
---

You are the Kiki GUI Designer. You own UI/UX design and implementation end-to-end. Load the \`ui-ux-pro-max\` skill for design intelligence, the \`executing-plans\` skill for plan execution discipline, the \`test-driven-development\` skill for implementation, and the \`systematic-debugging\` skill for when things break. Follow all four exactly. Produce both design direction and working frontend code. Do not split visual work from implementation.
`;
}

export function generateReviewerTemplate(config: KikiConfig): string {
  const perms = buildReviewerPermissions(config.paths);
  return `---
description: Kiki Reviewer — read-only code and security review
mode: subagent
${perms}
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
`;
}

export function generateEscalationTemplate(_config: KikiConfig): string {
  const perms = buildEscalationPermissions();
  return `---
description: Kiki Escalation — diagnoses failures and recommends next steps
mode: subagent
${perms}
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
`;
}

export function generateHistorianTemplate(config: KikiConfig): string {
  const perms = buildHistorianPermissions(config.paths);
  const responsibilities = buildHistorianResponsibilities(config.paths);
  const p = config.paths;
  return `---
description: Kiki Historian — maintains project documentation, README and CHANGELOG
mode: subagent
${perms}
---
You are the Kiki Historian. Keep project documentation accurate and up to date.

## Responsibilities
${responsibilities}

## Rules
- You do NOT write source code. You do NOT edit \`${p.source}*\` or \`${p.tests}*\`.
- You do NOT create plans or specs.
- Use the **Implementation Summary** from the implementer as your primary input. Read changed files only if needed.
- When updating CHANGELOG, follow Keep a Changelog format (Added, Changed, Fixed, Removed, Security).
`;
}

export function generatePluginTemplate(opts: { scope?: 'global' | 'project'; version?: string } = {}): string {
  const scope = opts.scope ?? 'project';
  const version = opts.version ?? KIKI_VERSION;
  return `import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';

const KIKI_PLUGIN_VERSION = '${version}';
const KIKI_PLUGIN_SCOPE = '${scope}';

${WATCHDOG_SOURCE}

${DEDUP_SOURCE}

const DEFAULT_HEALTH = ${JSON.stringify(DEFAULT_HEALTH, null, 2)};

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && Math.floor(v) === v;
}

function sanitizeHealth(raw: any): typeof DEFAULT_HEALTH {
  const out = Object.assign({}, DEFAULT_HEALTH);
  if (!raw || typeof raw !== 'object') return out;
  if (typeof raw.watchdogEnabled === 'boolean') out.watchdogEnabled = raw.watchdogEnabled;
  if (typeof raw.watchAllSubagents === 'boolean') out.watchAllSubagents = raw.watchAllSubagents;
  if (typeof raw.logPath === 'string' && raw.logPath.length > 0) out.logPath = raw.logPath;
  if (isPositiveInt(raw.stuckThresholdMs)) out.stuckThresholdMs = raw.stuckThresholdMs;
  if (isPositiveInt(raw.gracePeriodMs)) out.gracePeriodMs = raw.gracePeriodMs;
  if (isPositiveInt(raw.absoluteMaxMs)) out.absoluteMaxMs = raw.absoluteMaxMs;
  if (isPositiveInt(raw.checkIntervalMs)) out.checkIntervalMs = raw.checkIntervalMs;
  if (isPositiveInt(raw.loopRepeatCount) && raw.loopRepeatCount >= 2) out.loopRepeatCount = raw.loopRepeatCount;
  return out;
}

function loadHealthConfig(directory: string) {
  try {
    const raw = JSON.parse(readFileSync(join(directory, '.agentic', 'kiki', 'config.json'), 'utf-8'));
    return sanitizeHealth(raw.health);
  } catch {
    return sanitizeHealth(null);
  }
}

interface RoutingLogEntry {
  timestamp: string;
  agent: string;
  model: string;
}

export default function KikiPlugin({ client, directory }: { client: any; directory: string }) {
  // Load-once plugin: interval is unref'd; no teardown hook needed (watchdog.stop unused by design).
  const root = resolve(directory || process.cwd());

  // --- ownership gate: first-loaded instance for this root owns the
  // watchdog and routing logger. Non-owners return no-op hooks so the
  // plugin contract stays stable. Keep the no-op hook names in sync with
  // the owner branch if new hooks are added. ---
  const ownership = acquireOwnership(root);
  if (!ownership) {
    const owner = getOwner(root);
    if (owner && owner.version !== KIKI_PLUGIN_VERSION) {
      reportVersionMismatch(root, owner, client, directory);
    }
    return {
      'tool.execute.before': async (_input: any, _output: any) => {},
      event: async (_args: { event: any }) => {}
    };
  }

  const health = loadHealthConfig(root);
  const watchdog = createWatchdog({ client, directory: root, config: health, now: () => Date.now() });
  watchdog.start();

  return {
    'tool.execute.before': async (input: any, output: any) => {
      if (input.tool !== 'task') return;
      const subagentType = output.args?.subagent_type ?? '';
      if (!subagentType.startsWith('kiki-')) return;

      const logPath = join(process.cwd(), '.agentic', 'kiki', 'routing_log.jsonl');
      const dir = dirname(logPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      const entry: RoutingLogEntry = {
        timestamp: new Date().toISOString(),
        agent: subagentType,
        model: output.args?.model ?? 'unknown',
      };
      appendFileSync(logPath, JSON.stringify(entry) + '\\n');
    },
    event: async ({ event }: { event: any }) => {
      watchdog.handleEvent(event);
    }
  };
}
`;
}

export function generateWorkflowTemplate(config: KikiConfig): string {
  const p = config.paths;
  const docExtras: string[] = [];
  if (p.decisions) docExtras.push(`decisions in \`${p.decisions}\``);
  if (p.knowledge) docExtras.push(`knowledge base in \`${p.knowledge}*\``);
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
The orchestrator dispatches the appropriate implementation subagent via the \`task\` tool. UI/frontend/visual/layout/component/design tasks route to \`kiki-gui-designer\`, which loads \`ui-ux-pro-max\`, \`executing-plans\`, \`test-driven-development\`, and \`systematic-debugging\` skills inline. All other tasks (backend/logic/data/tooling) route to \`kiki-implementer\`, which loads \`executing-plans\` and \`test-driven-development\` skills inline. Either agent implements the tasks per the plan.

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

Model selection is one model per Kiki role. Set \`agent.<name>.model\` in global or project \`opencode.json\` / \`opencode.jsonc\`. OpenCode merges the settings; no synchronization command is needed.

Example:

\`\`\`json
{
  "agent": {
    "kiki-reviewer": { "model": "openai/gpt-6.1-sol" }
  }
}
\`\`\`

Use \`kiki doctor\` to check the installation. Existing local definitions can be imported with \`kiki migrate --project .\`; \`kiki reset --project .\` restores global agent defaults without deleting project work.
`;
}

export const OPENCODE_PACKAGE_JSON_TEMPLATE = `{
  "dependencies": {
    "@opencode-ai/plugin": "1.15.13"
  }
}
`;

export const OPENCODE_GITIGNORE_TEMPLATE = `node_modules
package.json
package-lock.json
bun.lock
.gitignore
`;

export interface GeneratedTemplates {
  orchestrator: string;
  brainstormer: string;
  planner: string;
  implementer: string;
  guiDesigner: string;
  reviewer: string;
  escalation: string;
  historian: string;
  plugin: string;
  packageJson: string;
  gitignore: string;
  workflow: string;
}

export function generateAllTemplates(config: KikiConfig, scope: 'global' | 'project' = 'project', version: string = KIKI_VERSION): GeneratedTemplates {
  return {
    orchestrator: generateOrchestratorTemplate(config),
    brainstormer: generateBrainstormerTemplate(config),
    planner: generatePlannerTemplate(config),
    implementer: generateImplementerTemplate(config),
    guiDesigner: generateGuiDesignerTemplate(config),
    reviewer: generateReviewerTemplate(config),
    escalation: generateEscalationTemplate(config),
    historian: generateHistorianTemplate(config),
    plugin: generatePluginTemplate({ scope, version }),
    packageJson: OPENCODE_PACKAGE_JSON_TEMPLATE,
    gitignore: OPENCODE_GITIGNORE_TEMPLATE,
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
