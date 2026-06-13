import { mkdirSync, writeFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
const DEFAULT_CONFIG = {
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
    routingPreferences: {
        refreshIntervalHours: 24,
        minBenchmarkRank: 20,
        costCeilingPer1kTokens: 0.05
    }
};
const DEFAULT_ALIGNMENT = {
    guardrails: [
        'No hardcoded secrets in source code',
        'All database queries must use parameterized statements',
        'API responses must not leak internal stack traces'
    ],
    compliance: ['OWASP Top 10', 'SOC 2 Type II']
};
const ORCHESTRATOR_TEMPLATE = `---
description: Kiki Orchestrator — routes the superpowers pipeline
mode: primary
---
You are the Kiki Orchestrator. Guide the user through a disciplined software engineering process.

## Process
1. **Intake:** Ask clarifying questions one at a time until requirements are clear.
2. **Brainstorm:** Dispatch \`kiki-brainstormer\` subagent via the \`task\` tool.
3. **Plan:** Dispatch \`kiki-planner\` subagent via the \`task\` tool.
4. **Architect Review:** Dispatch \`kiki-reviewer\` subagent (architect mode) or review the plan yourself against \`.agentic/alignment.json\`. Append inline review.
5. **Implement:** Dispatch \`kiki-implementer\` subagent via the \`task\` tool.
6. **Review:** Dispatch \`kiki-reviewer\` subagent via the \`task\` tool.
7. **Complete:** Update \`.agentic/TASK_REGISTRY.json\`.

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
const BRAINSTORMER_TEMPLATE = `---
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
const PLANNER_TEMPLATE = `---
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
const IMPLEMENTER_TEMPLATE = `---
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
const REVIEWER_TEMPLATE = `---
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
const ESCALATION_TEMPLATE = `---
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
const PLUGIN_TEMPLATE = `import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { loadRoutingTable, lookupModel, saveRoutingTable } from 'kiki';
import { classifyDomain, classifyRisk, selectModel } from 'kiki';
import type { Skill, Domain, Risk, RoutingLogEntry, RoutingTable } from 'kiki';

// Map kiki subagent types to the superpowers skill they invoke.
const SUBAGENT_TYPE_TO_SKILL: Record<string, Skill> = {
  'kiki-brainstormer': 'brainstorming',
  'kiki-planner': 'writing-plans',
  'kiki-implementer': 'executing-plans',
  'kiki-reviewer': 'reviewing',
  'kiki-escalation': 'brainstorming',
};

function getSkillFromSubagentType(subagentType: string): Skill | null {
  return SUBAGENT_TYPE_TO_SKILL[subagentType] ?? null;
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

function findFallbackModel(table: RoutingTable, skill: Skill, domain: Domain): string | null {
  const risks: Risk[] = ['critical', 'high', 'medium', 'low', 'micro'];
  for (const risk of risks) {
    const model = lookupModel(table, skill, domain, risk);
    if (model) return model;
  }
  const rule = table.rules.find(r => r.skill === skill);
  if (rule) return rule.model;
  if (table.rules.length > 0) return table.rules[0].model;
  return null;
}

export default function KikiPlugin({ client }: { client: any }) {
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

      let risk: Risk = 'medium';
      try {
        const config = JSON.parse(readFileSync('.agentic/config.json', 'utf-8'));
        const pathMatches = taskDesc.match(/[\\w/.-]+\\.(ts|js|tsx|jsx|py|rs|go)/g) ?? [];
        risk = classifyRisk(pathMatches, config.riskMatrix);
      } catch {
        // Config missing, use default medium
      }

      let table = loadRoutingTable();
      let selectedModel: string | null = null;
      let reason: string;

      if (!table) {
        console.error('[Kiki] CRITICAL: No routing table found. Run "kiki update-benchmarks" and "kiki update-pricing".');
        selectedModel = null;
        reason = 'missing routing table';
      } else {
        const candidateModel = lookupModel(table, skill, domain, risk);

        if (candidateModel) {
          const state = { projectDefaults: table.projectDefaults ?? {} };
          const key = \`\${skill}:\${domain}\`;
          const currentDefault = table.projectDefaults[key] ?? null;
          const currentDefaultScore = table.rules.find(r => r.model === currentDefault && r.skill === skill && r.domain === domain)?.scorePerDollar ?? 0;
          const candidateScore = table.rules.find(r => r.model === candidateModel && r.skill === skill && r.domain === domain)?.scorePerDollar ?? 0;

          const result = selectModel(
            state,
            key,
            taskId ?? null,
            candidateModel,
            candidateScore,
            currentDefault,
            currentDefaultScore
          );

          selectedModel = result.model;

          if (result.updatedDefaults[key] !== table.projectDefaults[key]) {
            (table as any).projectDefaults = result.updatedDefaults;
            const { saveRoutingTable } = await import('kiki');
            saveRoutingTable(table);
          }

          reason = \`scorePerDollar: \${candidateScore.toFixed(2)}\`;
        } else {
          selectedModel = findFallbackModel(table, skill, domain);
          if (selectedModel) {
            console.warn(\`[Kiki] No exact rule for \${skill}/\${domain}/\${risk}. Falling back to \${selectedModel}.\`);
            reason = 'fallback (no exact rule)';
          } else {
            console.error(\`[Kiki] CRITICAL: Routing table has no models at all for \${skill}/\${domain}.\`);
            reason = 'no models in routing table';
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

        console.log(\`[Kiki] Routed \${subagentType} → \${selectedModel} (\${skill}, \${domain}, \${risk})\`);
      } else {
        console.error(\`[Kiki] CRITICAL: Could not select any model for \${subagentType}. Task will use OpenCode default.\`);
      }
    }
  };
}
`;
const OPENCODE_PACKAGE_JSON_TEMPLATE = `{
  "dependencies": {
    "@opencode-ai/plugin": "1.15.13",
    "kiki": "github.com/luxuxorg/kiki"
  }
}
`;
const OPENCODE_GITIGNORE_TEMPLATE = `node_modules
package.json
package-lock.json
bun.lock
.gitignore
`;
const WORKFLOW_TEMPLATE = `# Kiki Workflow

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

### 7. Complete
The orchestrator updates \`.agentic/TASK_REGISTRY.json\` with the task status and any failure metrics.

## Risk-Based Routing

| Risk Level | Path |
|---|---|
| Micro | Intake → Implement → Review → Complete (bypass planning) |
| Low | Intake → Plan → Implement → Review → Complete (bypass architect review) |
| Medium+ | Full pipeline with all gates |

## Model Selection

Model selection is fully automated. The Kiki plugin reads the routing table (\`.agentic/routing.json\`) and selects the optimal model based on benchmark scores and cost data. Never pick a model manually — trust the plugin.
`;
function writeAgenticFiles(targetPath) {
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
    writeFileSync(join(agenticDir, 'routing.json'), JSON.stringify({
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        sources: { benchmarks: '', pricing: '' },
        rules: [],
        projectDefaults: {}
    }, null, 2));
    return agenticDir;
}
function writeOpencodeFiles(targetPath) {
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
    writeFileSync(join(pluginsDir, 'kiki.ts'), PLUGIN_TEMPLATE);
    writeFileSync(join(opencodeDir, 'package.json'), OPENCODE_PACKAGE_JSON_TEMPLATE);
    writeFileSync(join(opencodeDir, '.gitignore'), OPENCODE_GITIGNORE_TEMPLATE);
    writeFileSync(join(docsDir, 'agentic-workflow.md'), WORKFLOW_TEMPLATE);
}
export async function init(targetPath) {
    writeAgenticFiles(targetPath);
    writeOpencodeFiles(targetPath);
    console.log(`Initialized Kiki in ${targetPath}`);
}
//# sourceMappingURL=init.js.map