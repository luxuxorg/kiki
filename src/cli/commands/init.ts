import { mkdirSync, writeFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';

export const DEFAULT_CONFIG = {
  projectName: 'my-project',
  language: 'typescript',
  commands: {
    build: 'npm run build',
    test: 'npm test',
    lint: 'npm run lint'
  },
  riskMatrix: {
    highRiskPaths: ['src/auth/', 'src/db/schema.ts'],
    criticalRiskPaths: ['src/security/', 'migrations/']
  },
};

export const DEFAULT_ALIGNMENT = {
  guardrails: [
    'No hardcoded secrets in source code',
    'All database queries must use parameterized statements',
    'API responses must not leak internal stack traces'
  ],
  compliance: ['OWASP Top 10', 'SOC 2 Type II']
};

export const DEFAULT_ROUTING_TABLE = {
  rules: {
    "brainstorming:gui": { "standard": "anthropic/claude-sonnet-4.6" },
    "brainstorming:backend": { "standard": "moonshotai/kimi-k2.6" },
    "brainstorming:security": { "standard": "deepseek/deepseek-v4-pro", "critical": "anthropic/claude-sonnet-4.6" },
    "brainstorming:database": { "standard": "moonshotai/kimi-k2.6" },
    "brainstorming:general": { "standard": "moonshotai/kimi-k2.6" },
    "writing-plans:gui": { "standard": "anthropic/claude-sonnet-4.6" },
    "writing-plans:backend": { "standard": "moonshotai/kimi-k2.6" },
    "writing-plans:security": { "standard": "moonshotai/kimi-k2.6", "critical": "anthropic/claude-sonnet-4.6" },
    "writing-plans:database": { "standard": "moonshotai/kimi-k2.6" },
    "writing-plans:general": { "standard": "moonshotai/kimi-k2.6" },
    "executing-plans:gui": { "standard": "anthropic/claude-sonnet-4.6" },
    "executing-plans:backend": { "standard": "moonshotai/kimi-k2.6" },
    "executing-plans:security": { "standard": "deepseek/deepseek-v4-pro", "critical": "anthropic/claude-sonnet-4.6" },
    "executing-plans:database": { "standard": "moonshotai/kimi-k2.6" },
    "executing-plans:general": { "standard": "moonshotai/kimi-k2.6" },
    "reviewing:gui": { "standard": "openai/gpt-5.4-mini" },
    "reviewing:backend": { "standard": "deepseek/deepseek-v4-pro" },
    "reviewing:security": { "standard": "moonshotai/kimi-k2.6", "critical": "anthropic/claude-sonnet-4.6" },
    "reviewing:database": { "standard": "deepseek/deepseek-v4-pro" },
    "reviewing:general": { "standard": "deepseek/deepseek-v4-pro" },
    "documenting:gui": { "standard": "moonshotai/kimi-k2.6" },
    "documenting:backend": { "standard": "moonshotai/kimi-k2.6" },
    "documenting:security": { "standard": "moonshotai/kimi-k2.6" },
    "documenting:database": { "standard": "moonshotai/kimi-k2.6" },
    "documenting:general": { "standard": "moonshotai/kimi-k2.6" }
  }
};

export const ORCHESTRATOR_TEMPLATE = `---
description: Kiki Orchestrator — routes the superpowers pipeline
mode: primary
---
You are the Kiki Orchestrator. You are **COORDINATION-ONLY**.

## Your Role
You do NOT write code. You do NOT edit files. You do NOT run commands. You do NOT read source files to understand implementation details.
Your **ONLY** job is to coordinate the pipeline by dispatching the correct subagent via the \`task\` tool.

## Process
1. **Intake:** Ask clarifying questions one at a time until requirements are clear.
2. **Brainstorm:** Dispatch \`kiki-brainstormer\` subagent via the \`task\` tool.
3. **Plan:** Dispatch \`kiki-planner\` subagent via the \`task\` tool.
4. **Architect Review:** Dispatch \`kiki-reviewer\` subagent (architect mode) or review the plan yourself against \`.agentic/alignment.json\`. Append inline review.
5. **Implement:** Dispatch \`kiki-implementer\` subagent via the \`task\` tool.
6. **Review:** Dispatch \`kiki-reviewer\` subagent via the \`task\` tool.
7. **Document:** Dispatch \`kiki-historian\` subagent via the \`task\` tool to update README, CHANGELOG, and project docs.
8. **Complete:** Update \`.agentic/TASK_REGISTRY.json\`.

## Key Rules
- Always dispatch the correct **kiki subagent** (e.g., \`kiki-brainstormer\`, \`kiki-planner\`) via the \`task\` tool — the Kiki plugin will handle model selection.
- Never pick a model manually. Trust the routing plugin.
- Update the task registry after every phase transition.
- Never hardcode secrets, API keys, or credentials in source code. Use environment variables only.
- Do not log sensitive data (tokens, passwords, PII) to console or files.
- If a task fails twice, dispatch the \`kiki-escalation\` subagent.

## Handling Empty or Failed Subagent Results
A dispatch is considered failed when:
- The subagent returns **empty output** (zero content, no files written, no results)
- The subagent reports it cannot complete the task
- Tests fail after 3 retry attempts
- The subagent exceeds its time budget (30 minutes per phase)

**If a subagent returns empty output:**
1. **Retry once:** Dispatch the same subagent again with the same prompt.
2. **If still empty:** Log the failure in \`.agentic/TASK_REGISTRY.json\`, increment the failure counter, and dispatch \`kiki-escalation\`.
3. **Never block silently.** Empty results must always trigger retry or escalation.

Track failures in \`.agentic/TASK_REGISTRY.json\` under \`failures\` counter per task.
`;

export const BRAINSTORMER_TEMPLATE = `---
description: Kiki Brainstormer — produces design specs via superpowers brainstorming
mode: subagent
permission:
  edit:
    "docs/superpowers/*": allow
    "src/*": deny
    "tests/*": deny
    "*": deny
  bash:
    "git diff*": allow
    "git log*": allow
    "*": deny
---
You are the Kiki Brainstormer. Your job is to produce design specs and explore requirements.

## Instructions
1. **Load the \`brainstorming\` superpowers skill** and follow its instructions **inline**.
2. Do NOT dispatch the skill to another subagent — you are the subagent. Do the work yourself.
3. Write the resulting spec to \`docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md\`.
4. You do NOT write source code. Only design docs.

The Kiki plugin selects your model automatically based on the task.
`;

export const PLANNER_TEMPLATE = `---
description: Kiki Planner — writes implementation plans via superpowers writing-plans
mode: subagent
permission:
  edit:
    "docs/superpowers/*": allow
    "src/*": deny
    "tests/*": deny
    "*": deny
  bash:
    "git diff*": allow
    "git log*": allow
    "*": deny
---
You are the Kiki Planner. Your job is to write detailed implementation plans.

## Instructions
1. **Load the \`writing-plans\` superpowers skill** and follow its instructions **inline**.
2. Do NOT dispatch the skill to another subagent — you are the subagent. Do the work yourself.
3. Write the resulting plan to \`docs/superpowers/plans/YYYY-MM-DD-<topic>-plan.md\`.
4. You do NOT write source code. Only plans.

The Kiki plugin selects your model automatically based on the task.
`;

export const IMPLEMENTER_TEMPLATE = `---
description: Kiki Implementer — writes code and tests per approved plan
mode: subagent
permission:
  edit:
    "src/*": allow
    "tests/*": allow
    "docs/superpowers/*": deny
    "*": deny
  bash: allow
---
You are the Kiki Implementer. Your job is to implement code strictly per the approved plan.

## Instructions
1. **Load the \`executing-plans\` superpowers skill** and follow its instructions **inline**.
2. **Load the \`test-driven-development\` superpowers skill** and follow its instructions **inline**.
3. Do NOT dispatch these skills to another subagent — you are the subagent. Do the work yourself.
4. You do NOT modify specs or plans.

## Security Rules
- Never commit \`.env\` files, API keys, or credentials.
- Use \`process.env\` for configuration, never hardcode secrets.
- If you find hardcoded secrets in existing code, report them to the reviewer but do not commit them.

The Kiki plugin selects your model automatically based on the task.
`;

export const REVIEWER_TEMPLATE = `---
description: Kiki Reviewer — read-only code and security review
mode: subagent
permission:
  edit: deny
  bash:
    "*": allow
---
You are the Kiki Reviewer. Your job is to review code against the approved plan.

## Instructions
1. **Load the \`receiving-code-review\` or \`requesting-code-review\` superpowers skill** as appropriate, and follow its instructions **inline**.
2. Do NOT dispatch the skill to another subagent — you are the subagent. Do the work yourself.
3. You do NOT write code.

## Checklist
- Plan adherence (did they implement what was specified?)
- Security issues (injections, secrets, auth flaws)
- Secrets exposure (hardcoded keys, tokens, passwords in source code)
- Code quality (readability, edge cases, error handling)
- Test coverage (are tests present and meaningful?)

The Kiki plugin selects your model automatically based on the task.
`;

export const ESCALATION_TEMPLATE = `---
description: Kiki Escalation — diagnoses failures and recommends next steps
mode: subagent
permission:
  edit: deny
  bash:
    "git diff*": allow
    "git log*": allow
    "*": deny
---
You are the Kiki Escalation Agent. Your job is to diagnose why the pipeline failed.

## Instructions
1. Read the task registry, routing log, and git history.
2. **Load the \`brainstorming\` or \`writing-plans\` superpowers skill** as needed for diagnostic reasoning, and follow it **inline**.
3. Do NOT dispatch the skill to another subagent — you are the subagent. Do the work yourself.
4. Recommend exactly one of:
   - **Redesign:** The approach is fundamentally wrong. Start over with a new plan.
   - **Split:** The task is too large. Break into smaller sub-tasks.
   - **Stop:** The task is infeasible or too risky. Recommend cancellation.

Be honest and direct. Do not try to "save" a failing task.

The Kiki plugin selects your model automatically based on the task.
`;

export const HISTORIAN_TEMPLATE = `---
description: Kiki Historian — maintains project documentation, README and CHANGELOG
mode: subagent
permission:
  read:
    "README*": allow
    "CHANGELOG*": allow
    "docs/*": allow
    "package.json": allow
    ".agentic/TASK_REGISTRY.json": allow
    "src/*": deny
    "tests/*": deny
    "*": deny
  write:
    "README*": allow
    "CHANGELOG*": allow
    "docs/*": allow
    "*": deny
  edit:
    "README*": allow
    "CHANGELOG*": allow
    "docs/*": allow
    "src/*": deny
    "tests/*": deny
    "*": deny
  bash:
    "git log*": allow
    "git diff*": allow
    "*": deny
---
You are the Kiki Historian. Your job is to keep project documentation accurate and up to date.

## Responsibilities
1. **README:** Keep \`README.md\` current with project description, setup instructions, and feature list.
2. **CHANGELOG:** Maintain \`CHANGELOG.md\` with notable changes per version or date.
3. **Project Docs:** Update \`docs/*\` files (except \`docs/superpowers/*\` which belongs to the planner/brainstormer).

## Rules
- You do NOT write source code. You do NOT edit \`src/*\` or \`tests/*\`.
- You do NOT create plans or specs. Those belong to the planner and brainstormer.
- When updating CHANGELOG, follow Keep a Changelog format (Added, Changed, Fixed, Removed, Security).
- When the orchestrator dispatches you, you will receive a summary of what was done. Update docs accordingly.

The Kiki plugin selects your model automatically based on the task.
`;

export const PLUGIN_TEMPLATE = `import { readFileSync, appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';

type Skill = 'brainstorming' | 'writing-plans' | 'executing-plans' | 'reviewing' | 'documenting';
type Domain = 'gui' | 'backend' | 'security' | 'database' | 'general';
type Risk = 'standard' | 'critical';

interface StaticRoutingRule {
  standard: string;
  critical?: string;
}

interface StaticRoutingTable {
  rules: Record<string, StaticRoutingRule>;
}

interface RoutingLogEntry {
  timestamp: string;
  taskId?: string;
  skill: Skill;
  domain: Domain;
  risk: Risk;
  selectedModel: string;
  reason: string;
}

interface StabilizerState {
  locks: Record<string, string>;
}

const SUBAGENT_TYPE_TO_SKILL: Record<string, Skill> = {
  'kiki-brainstormer': 'brainstorming',
  'kiki-planner': 'writing-plans',
  'kiki-implementer': 'executing-plans',
  'kiki-reviewer': 'reviewing',
  'kiki-escalation': 'brainstorming',
  'kiki-historian': 'documenting',
};

function getSkillFromSubagentType(subagentType: string): Skill | null {
  return SUBAGENT_TYPE_TO_SKILL[subagentType] ?? null;
}

function loadRoutingTable(): StaticRoutingTable | null {
  try {
    const raw = readFileSync('.agentic/routing.json', 'utf-8');
    return JSON.parse(raw) as StaticRoutingTable;
  } catch {
    return null;
  }
}

function lookupModel(table: StaticRoutingTable, skill: Skill, domain: Domain, risk: Risk): string | null {
  const key = skill + ':' + domain;
  const rule = table.rules[key];
  if (!rule) return null;
  if (risk === 'critical' && rule.critical) return rule.critical;
  return rule.standard;
}

function classifyDomain(taskDesc: string): Domain {
  const d = taskDesc.toLowerCase();
  if (/\b(react|vue|angular|frontend|ui|css|html|component)\b/.test(d)) return 'gui';
  if (/\b(api|server|backend|route|endpoint|middleware|express|fastify)\b/.test(d)) return 'backend';
  if (/\b(auth|security|crypto|encrypt|password|token|jwt|oauth|sql\s*injection|xss)\b/.test(d)) return 'security';
  if (/\b(db|database|schema|migration|sql|postgres|sqlite|prisma|orm)\b/.test(d)) return 'database';
  return 'general';
}

function classifyRisk(paths: string[], riskMatrix: { highRiskPaths: string[]; criticalRiskPaths: string[] }): Risk {
  for (const p of paths) {
    for (const critical of riskMatrix.criticalRiskPaths) {
      if (p.startsWith(critical)) return 'critical';
    }
  }
  for (const p of paths) {
    for (const high of riskMatrix.highRiskPaths) {
      if (p.startsWith(high)) return 'standard';
    }
  }
  return 'standard';
}

function loadStabilizerState(): StabilizerState {
  try {
    const raw = readFileSync('.agentic/cache/stabilizer.json', 'utf-8');
    return JSON.parse(raw) as StabilizerState;
  } catch {
    return { locks: {} };
  }
}

function getLockedModel(state: StabilizerState, taskId: string | null): string | null {
  if (!taskId) return null;
  return state.locks[taskId] ?? null;
}

function lockTaskModel(state: StabilizerState, taskId: string, model: string): void {
  state.locks[taskId] = model;
  try {
    mkdirSync('.agentic/cache', { recursive: true });
    writeFileSync('.agentic/cache/stabilizer.json', JSON.stringify(state, null, 2));
  } catch {
    // silently ignore
  }
}

function logRoutingDecision(entry: RoutingLogEntry): void {
  try {
    mkdirSync('.agentic', { recursive: true });
    const logLine = JSON.stringify(entry) + '\\n';
    appendFileSync('.agentic/routing_log.jsonl', logLine);
  } catch {
    // Silently ignore logging failures
  }
}

function findFallbackModel(table: StaticRoutingTable, skill: Skill, domain: Domain): string | null {
  const key = skill + ':' + domain;
  const rule = table.rules[key];
  if (rule) return rule.standard;
  const skillKeys = Object.keys(table.rules).filter(k => k.startsWith(skill + ':'));
  if (skillKeys.length > 0) return table.rules[skillKeys[0]].standard;
  const allKeys = Object.keys(table.rules);
  if (allKeys.length > 0) return table.rules[allKeys[0]].standard;
  return null;
}

export default function KikiPlugin({ client }: { client: any }) {
  const stabilizerState = loadStabilizerState();

  return {
    'tool.execute.before': async (input: any, output: any) => {
      if (input.tool !== 'task') return;

      const subagentType = output.args?.subagent_type ?? '';
      const skill = getSkillFromSubagentType(subagentType);

      if (!skill) {
        return;
      }

      const taskDesc = output.args?.prompt ?? '';
      const taskId = output.args?.taskId;

      const domain = classifyDomain(taskDesc);

      let risk: Risk = 'standard';
      try {
        const config = JSON.parse(readFileSync('.agentic/config.json', 'utf-8'));
        const pathMatches = taskDesc.match(/[\\w/.-]+\\.(ts|js|tsx|jsx|py|rs|go)/g) ?? [];
        risk = classifyRisk(pathMatches, config.riskMatrix);
      } catch {
        // Config missing, use default standard
      }

      let selectedModel: string | null = getLockedModel(stabilizerState, taskId ?? null);
      let reason: string;

      if (selectedModel) {
        reason = 'task locked';
      } else {
        const table = loadRoutingTable();

        if (!table) {
          console.error('[Kiki] CRITICAL: No routing table found. Check .agentic/routing.json exists.');
          reason = 'missing routing table';
        } else {
          selectedModel = lookupModel(table, skill, domain, risk);

          if (selectedModel) {
            if (taskId) {
              lockTaskModel(stabilizerState, taskId, selectedModel);
            }
            reason = 'static routing (' + risk + ')';
          } else {
            selectedModel = findFallbackModel(table, skill, domain);
            if (selectedModel) {
              console.warn('[Kiki] No exact rule for ' + skill + '/' + domain + '. Falling back to ' + selectedModel + '.');
              if (taskId) {
                lockTaskModel(stabilizerState, taskId, selectedModel);
              }
              reason = 'fallback (no exact match)';
            } else {
              console.error('[Kiki] CRITICAL: Routing table has no models at all for ' + skill + '/' + domain + '.');
              reason = 'no models in routing table';
            }
          }
        }
      }

      if (selectedModel) {
        if (!output.args) {
          output.args = {};
        }
        output.args.model = selectedModel;

        logRoutingDecision({
          timestamp: new Date().toISOString(),
          taskId,
          skill,
          domain,
          risk,
          selectedModel,
          reason
        });

        console.log('[Kiki] Routed ' + subagentType + ' → ' + selectedModel + ' (' + skill + ', ' + domain + ', ' + risk + ')');
      } else {
        console.error('[Kiki] CRITICAL: Could not select any model for ' + subagentType + '. Task will use OpenCode default.');
      }
    }
  };
}
`;

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

export const WORKFLOW_TEMPLATE = `# Kiki Workflow

This document describes the Kiki software engineering pipeline enforced by the orchestrator agent.

## Pipeline Phases

### 1. Intake
The orchestrator asks clarifying questions one at a time until requirements are fully understood. No implementation begins before intake is complete.

### 2. Brainstorm
The orchestrator dispatches the \`kiki-brainstormer\` subagent. The brainstormer loads the superpowers \`brainstorming\` skill inline and produces a design spec at \`docs/superpowers/specs/...\`.

### 3. Plan
The orchestrator dispatches the \`kiki-planner\` subagent. The planner loads the superpowers \`writing-plans\` skill inline and produces an implementation plan at \`docs/superpowers/plans/...\`.

### 4. Architect Review
The orchestrator reviews the plan against \`.agentic/alignment.json\` guardrails. An inline review is appended to the plan document. The plan must pass this gate before implementation begins.

### 5. Implement
The \`kiki-implementer\` loads \`executing-plans\` and \`test-driven-development\` skills inline and implements the plan task by task. Tests are written first, then code to make them pass.

### 6. Review
The \`kiki-reviewer\` loads \`receiving-code-review\` or \`requesting-code-review\` inline and verifies plan adherence, security, code quality, and test coverage. An inline verdict is appended to the plan.

### 7. Document
The orchestrator dispatches the \`kiki-historian\` subagent to update \`README.md\`, \`CHANGELOG.md\`, and any project docs in \`docs/*\` (excluding \`docs/superpowers/*\`).

### 8. Complete
The orchestrator updates \`.agentic/TASK_REGISTRY.json\` with the task status and any failure metrics.

## Risk-Based Routing

| Risk Level | Behavior |
|---|---|
| Standard | Uses the standard model from \`.agentic/routing.json\` |
| Critical | Uses the critical model if defined for the skill+domain; falls back to standard |

## Model Selection

Model selection is static and manually maintained. Edit \`.agentic/routing.json\` to change which model is used for each skill+domain combination. The \`standard\` model is always used unless a \`critical\` override is defined and the task touches critical paths.
`;

export function writeAgenticFiles(targetPath: string): string {
  const agenticDir = join(targetPath, '.agentic');
  const cacheDir = join(agenticDir, 'cache');

  if (existsSync(agenticDir) && !statSync(agenticDir).isDirectory()) {
    console.error(`${agenticDir} exists but is not a directory`);
    process.exit(1);
  }

  if (!existsSync(agenticDir)) {
    mkdirSync(agenticDir, { recursive: true });
  }
  mkdirSync(cacheDir, { recursive: true });

  writeFileSync(join(agenticDir, 'config.json'), JSON.stringify(DEFAULT_CONFIG, null, 2));
  writeFileSync(join(agenticDir, 'alignment.json'), JSON.stringify(DEFAULT_ALIGNMENT, null, 2));
  writeFileSync(join(agenticDir, 'TASK_REGISTRY.json'), JSON.stringify({ tasks: [] }, null, 2));
  writeFileSync(join(agenticDir, 'routing.json'), JSON.stringify(DEFAULT_ROUTING_TABLE, null, 2));

  return agenticDir;
}

export function writeOpencodeFiles(targetPath: string): void {
  const opencodeDir = join(targetPath, '.opencode');
  const agentsDir = join(opencodeDir, 'agents');
  const pluginsDir = join(opencodeDir, 'plugins');
  const docsDir = join(opencodeDir, 'docs');

  mkdirSync(opencodeDir, { recursive: true });
  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(pluginsDir, { recursive: true });
  mkdirSync(docsDir, { recursive: true });

  writeFileSync(join(agentsDir, 'kiki-orchestrator.md'), ORCHESTRATOR_TEMPLATE);
  writeFileSync(join(agentsDir, 'kiki-brainstormer.md'), BRAINSTORMER_TEMPLATE);
  writeFileSync(join(agentsDir, 'kiki-planner.md'), PLANNER_TEMPLATE);
  writeFileSync(join(agentsDir, 'kiki-implementer.md'), IMPLEMENTER_TEMPLATE);
  writeFileSync(join(agentsDir, 'kiki-reviewer.md'), REVIEWER_TEMPLATE);
  writeFileSync(join(agentsDir, 'kiki-escalation.md'), ESCALATION_TEMPLATE);
  writeFileSync(join(agentsDir, 'kiki-historian.md'), HISTORIAN_TEMPLATE);

  writeFileSync(join(pluginsDir, 'kiki.ts'), PLUGIN_TEMPLATE);
  writeFileSync(join(opencodeDir, 'package.json'), OPENCODE_PACKAGE_JSON_TEMPLATE);
  writeFileSync(join(opencodeDir, '.gitignore'), OPENCODE_GITIGNORE_TEMPLATE);

  writeFileSync(join(docsDir, 'agentic-workflow.md'), WORKFLOW_TEMPLATE);
}

export async function init(targetPath: string): Promise<void> {
  writeAgenticFiles(targetPath);
  writeOpencodeFiles(targetPath);

  console.log(`Initialized Kiki in ${targetPath}`);
}
