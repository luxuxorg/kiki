import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import type { StaticRoutingTable } from '../types.js';

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

export interface KikiModels {
  standard: string;
  critical: string;
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
  models: KikiModels;
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

export const DEFAULT_MODELS: KikiModels = {
  standard: 'moonshotai/kimi-k2.6',
  critical: 'anthropic/claude-sonnet-4.6',
};

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
  models: DEFAULT_MODELS,
};

export const DEFAULT_ALIGNMENT = {
  guardrails: [
    'No hardcoded secrets in source code',
    'All database queries must use parameterized statements',
    'API responses must not leak internal stack traces',
  ],
  compliance: ['OWASP Top 10', 'SOC 2 Type II'],
};

export const DEFAULT_ROUTING_TABLE: StaticRoutingTable = {
  agents: {
    'kiki-orchestrator': DEFAULT_MODELS.standard,
    'kiki-brainstormer': DEFAULT_MODELS.standard,
    'kiki-planner': DEFAULT_MODELS.standard,
    'kiki-implementer': DEFAULT_MODELS.standard,
    'kiki-gui-designer': DEFAULT_MODELS.standard,
    'kiki-reviewer': DEFAULT_MODELS.standard,
    'kiki-escalation': DEFAULT_MODELS.critical,
    'kiki-historian': DEFAULT_MODELS.standard,
  },
};

function dirGlob(path: string): string {
  if (path.endsWith('/')) return path + '*';
  return path + '/*';
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
    const { riskMatrix: _discardedRiskMatrix, ...rest } = raw;
    return {
      ...DEFAULT_CONFIG,
      ...rest,
      paths: { ...DEFAULT_PATHS, ...(rest.paths ?? {}) },
      models: { ...DEFAULT_MODELS, ...(rest.models ?? {}) },
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function buildBrainstormerPermissions(p: KikiPaths): string {
  const sw = dirGlob(p.superpowers);
  const src = dirGlob(p.source);
  const tst = dirGlob(p.tests);
  return `permission:
  write:
    "${sw}": allow
    "*": deny
  edit:
    "${sw}": allow
    "${src}": deny
    "${tst}": deny
    "*": deny
  bash:
    "git diff*": allow
    "git log*": allow
    "*": deny`;
}

function buildImplementerPermissions(p: KikiPaths): string {
  const src = dirGlob(p.source);
  const tst = dirGlob(p.tests);
  const sw = dirGlob(p.superpowers);
  return `permission:
  write:
    "${src}": allow
    "${tst}": allow
    "*": deny
  edit:
    "${src}": allow
    "${tst}": allow
    "${sw}": deny
    "*": deny
  bash: allow`;
}

function buildReviewerPermissions(_p: KikiPaths): string {
  return `permission:
  read:
    "src/*": allow
    "tests/*": allow
    "docs/*": allow
    ".agentic/*": allow
    "*": deny
  write:
    ".agentic/reviews/*": allow
    ".opencode/docs/reviews/*": allow
    "*": deny
  edit:
    ".agentic/reviews/*": allow
    ".opencode/docs/reviews/*": allow
    "src/*": deny
    "tests/*": deny
    "*": deny
  bash:
    "git diff*": allow
    "git log*": allow
    "*": deny`;
}

function buildEscalationPermissions(): string {
  return `permission:
  read:
    ".agentic/*": allow
    "docs/*": allow
    "*": deny
  write:
    ".agentic/reviews/*": allow
    ".opencode/docs/reviews/*": allow
    "*": deny
  edit:
    ".agentic/reviews/*": allow
    ".opencode/docs/reviews/*": allow
    "*": deny
  bash:
    "git diff*": allow
    "git log*": allow
    "*": deny`;
}

function buildHistorianPermissions(p: KikiPaths): string {
  const src = dirGlob(p.source);
  const tst = dirGlob(p.tests);
  const readmeGlob = fileGlob(p.readme);
  const changelogGlob = fileGlob(p.changelog);
  const docsGlob = dirGlob(p.docs);

  const readLines: string[] = [
    `"${readmeGlob}": allow`,
    `"${changelogGlob}": allow`,
    `"${docsGlob}": allow`,
    `"package.json": allow`,
    `"${p.taskRegistry}": allow`,
  ];
  const writeLines: string[] = [
    `"${readmeGlob}": allow`,
    `"${changelogGlob}": allow`,
    `"${docsGlob}": allow`,
  ];
  const editLines: string[] = [...writeLines];

  if (p.decisions) {
    const decDir = fileDir(p.decisions);
    if (decDir) {
      const decGlob = dirGlob(decDir);
      readLines.push(`"${decGlob}": allow`);
      writeLines.push(`"${decGlob}": allow`);
      editLines.push(`"${decGlob}": allow`);
    }
  }

  if (p.knowledge) {
    const kgGlob = dirGlob(p.knowledge);
    readLines.push(`"${kgGlob}": allow`);
    writeLines.push(`"${kgGlob}": allow`);
    editLines.push(`"${kgGlob}": allow`);
  }

  readLines.push(`".agentic/*": allow`);
  writeLines.push(`".agentic/*": allow`);
  editLines.push(`".agentic/*": allow`);

  readLines.push(`"${src}": deny`);
  readLines.push(`"${tst}": deny`);
  readLines.push(`"*": deny`);
  writeLines.push(`"*": deny`);
  editLines.push(`"${src}": deny`);
  editLines.push(`"${tst}": deny`);
  editLines.push(`"*": deny`);

  return `permission:
  read:
    ${readLines.join('\n    ')}
  write:
    ${writeLines.join('\n    ')}
  edit:
    ${editLines.join('\n    ')}
  bash:
    "git log*": allow
    "git diff*": allow
    "*": deny`;
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
Dispatch the correct subagent via the \`task\` tool. Do not write code, edit files, run commands, or read implementation details. Agent models come from \`.agentic/kiki/routing.json\` after \`kiki routing\` syncs them into OpenCode agent frontmatter.

## Dispatch Rules
- UI/frontend/visual/layout/component/design task → @kiki-gui-designer
- Backend/logic/data/tooling task → @kiki-implementer
- Design/spec phase → @kiki-brainstormer
- Planning phase → @kiki-planner
- Review phase → @kiki-reviewer
- Failure diagnosis → @kiki-escalation

## Process
1. **Intake:** Ask clarifying questions one at a time until requirements are clear.
2. **Brainstorm:** Dispatch \`kiki-brainstormer\`.
3. **Plan:** Dispatch \`kiki-planner\`.
4. **Architect Review:** Dispatch \`kiki-reviewer\` for architect review of the plan against \`.agentic/kiki/alignment.json\`.
5. **Implement:** Dispatch \`kiki-implementer\`.
6. **Review:** Dispatch \`kiki-reviewer\`.
7. **Document:** Dispatch \`kiki-historian\` to update \`${p.readme}\`, \`${p.changelog}\`, and project docs.
8. **Complete:** Update \`${p.taskRegistry}\`.

## Task Registry Schema
TASK_REGISTRY entries must use \`id\`, \`description\`, \`status\`, \`phase\`, \`failures\`, and \`startedAt\`. Valid phases are \`brainstorm\`, \`plan\`, \`plan-review\`, \`implement\`, \`implementation-review\`, \`document\`, and \`complete\`. Optional descriptive fields include \`completedAt\`, \`spec\`, \`plan\`, \`deferred\`, \`knownIssues\`, and \`reviewNotes\`. \`reviewNotes\` must be an array containing only unresolved issue strings; do not record fixed review findings there.

## Key Rules
- Always dispatch the correct **kiki subagent** via \`task\`.
- **NEVER** do the work yourself.
- Update the task registry after every phase transition.
- Never hardcode secrets or log sensitive data.
- If a task fails twice, dispatch \`kiki-escalation\`.

## Handling Empty or Failed Subagent Results
A dispatch fails when the subagent returns empty output, cannot complete, tests fail after 3 retries, or exceeds 30 minutes.

1. **Retry once** with the same prompt.
2. **If still failing:** Log in \`${p.taskRegistry}\`, increment the failure counter, and dispatch \`kiki-escalation\`.
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
4. Debug systematically before claiming work is complete. Verify before claiming completion.

## Security Rules
- Never commit \`.env\` files, API keys, or credentials.
- Use \`process.env\` for configuration, never hardcode secrets.
- Report hardcoded secrets to the reviewer but do not commit them.

## Security
- Before declaring work complete, run the security command from \`.agentic/config.json\` (field \`commands.security\`, e.g., \`npm audit\`).
- Address high/critical findings before finishing. If they cannot be fixed, report them to the reviewer.

## Linting
- Before declaring work complete, run the lint command from \`.agentic/config.json\` (field \`commands.lint\`).
- Fix all lint errors and warnings before finishing.
- Do not leave lint issues for the reviewer to catch.

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

export function generateGuiDesignerTemplate(_config: KikiConfig): string {
  return `---
description: Kiki GUI Designer — UI/UX design + implementation via superpowers skills
mode: subagent
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
- Plan adherence
- Security issues and secrets exposure
- **Security scan:**
  - The implementer has run the security command and fixed or reported high/critical findings
- Code quality and error handling
- **Linting compliance:**
  - The implementer has run the lint command and fixed all issues
  - No lint warnings or errors remain in changed files
  - Code follows project style conventions
- Test coverage
- **Parallelization logic:**
  - No circular \`depends_on\` chains
  - All \`depends_on\` references exist
  - Parallel tasks do not modify the same files
  - Sequential tasks are correctly ordered

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

export function generatePluginTemplate(): string {
  return `import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

interface RoutingLogEntry {
  timestamp: string;
  agent: string;
  model: string;
}

export default function KikiPlugin({ client }: { client: any }) {
  return {
    'tool.execute.before': async (input: any, output: any) => {
      if (input.tool !== 'task') return;
      const subagentType = output.args?.subagent_type ?? '';
      if (!subagentType.startsWith('kiki-')) return;

      const logPath = join(process.cwd(), '.agentic', 'routing_log.jsonl');
      const dir = dirname(logPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      const entry: RoutingLogEntry = {
        timestamp: new Date().toISOString(),
        agent: subagentType,
        model: output.args?.model ?? 'unknown',
      };
      appendFileSync(logPath, JSON.stringify(entry) + '\\n');
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
  "reviewNotes": ["Only unresolved issue strings go here"]
}
\`\`\`

Do not use \`name\`, \`created_at\`, \`phases\`, or \`failure_count\`. \`reviewNotes\` is an array of unresolved issue strings only; remove fixed findings instead of preserving them as history.

## Role-Level Model Routing

Model selection is one model per Kiki role. Edit the \`agents\` map in \`.agentic/kiki/routing.json\`, then run \`kiki routing\` to sync those models into \`.opencode/agents/kiki-*.md\` frontmatter.

Example:

\`\`\`json
{
  "agents": {
    "kiki-orchestrator": "moonshotai/kimi-k2.6",
    "kiki-brainstormer": "moonshotai/kimi-k2.6",
    "kiki-planner": "moonshotai/kimi-k2.6",
    "kiki-implementer": "moonshotai/kimi-k2.6",
    "kiki-reviewer": "moonshotai/kimi-k2.6",
    "kiki-escalation": "anthropic/claude-sonnet-4.6",
    "kiki-historian": "moonshotai/kimi-k2.6"
  }
}
\`\`\`

Use \`kiki routing --check\` in CI or before dispatching subagents to verify the OpenCode agent files match the central routing file.
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
    plugin: generatePluginTemplate(),
    packageJson: OPENCODE_PACKAGE_JSON_TEMPLATE,
    gitignore: OPENCODE_GITIGNORE_TEMPLATE,
    workflow: generateWorkflowTemplate(config),
  };
}

export function writeOpencodeFiles(targetPath: string, config: KikiConfig): void {
  const opencodeDir = join(targetPath, '.opencode');
  const agentsDir = join(opencodeDir, 'agents');
  const pluginsDir = join(opencodeDir, 'plugins');
  const docsDir = join(opencodeDir, 'docs');

  mkdirSync(opencodeDir, { recursive: true });
  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(pluginsDir, { recursive: true });
  mkdirSync(docsDir, { recursive: true });

  const templates = generateAllTemplates(config);

  writeFileSync(join(agentsDir, 'kiki-orchestrator.md'), templates.orchestrator);
  writeFileSync(join(agentsDir, 'kiki-brainstormer.md'), templates.brainstormer);
  writeFileSync(join(agentsDir, 'kiki-planner.md'), templates.planner);
  writeFileSync(join(agentsDir, 'kiki-implementer.md'), templates.implementer);
  writeFileSync(join(agentsDir, 'kiki-gui-designer.md'), templates.guiDesigner);
  writeFileSync(join(agentsDir, 'kiki-reviewer.md'), templates.reviewer);
  writeFileSync(join(agentsDir, 'kiki-escalation.md'), templates.escalation);
  writeFileSync(join(agentsDir, 'kiki-historian.md'), templates.historian);

  writeFileSync(join(pluginsDir, 'kiki.ts'), templates.plugin);
  writeFileSync(join(opencodeDir, 'package.json'), templates.packageJson);
  writeFileSync(join(opencodeDir, '.gitignore'), templates.gitignore);

  writeFileSync(join(docsDir, 'agentic-workflow.md'), templates.workflow);
}

export function writeAgenticFiles(targetPath: string, config: KikiConfig): string {
  const agenticDir = join(targetPath, '.agentic');
  const cacheDir = join(agenticDir, 'cache');

  if (!existsSync(agenticDir)) {
    mkdirSync(agenticDir, { recursive: true });
  }
  mkdirSync(cacheDir, { recursive: true });

  writeFileSync(join(agenticDir, 'config.json'), JSON.stringify(config, null, 2));
  writeFileSync(join(agenticDir, 'alignment.json'), JSON.stringify(DEFAULT_ALIGNMENT, null, 2));
  writeFileSync(join(agenticDir, 'TASK_REGISTRY.json'), JSON.stringify({ tasks: [] }, null, 2));
  writeFileSync(join(agenticDir, 'routing.json'), JSON.stringify(DEFAULT_ROUTING_TABLE, null, 2));

  return agenticDir;
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
