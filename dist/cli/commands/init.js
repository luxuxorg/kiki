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
2. **Brainstorm:** Dispatch superpowers \`brainstorming\` skill via the \`task\` tool.
3. **Plan:** Dispatch superpowers \`writing-plans\` skill.
4. **Architect Review:** Review the plan against \`.agentic/alignment.json\`. Append inline review.
5. **Implement:** Dispatch superpowers \`executing-plans\` + \`test-driven-development\` skills.
6. **Review:** Dispatch review subagent. Append inline verdict.
7. **Complete:** Update \`.agentic/TASK_REGISTRY.json\`.

## Key Rules
- Always dispatch skills via the \`task\` tool — the Kiki plugin will handle model selection.
- Never pick a model manually. Trust the routing plugin.
- Update the task registry after every phase transition.
- Never hardcode secrets, API keys, or credentials in source code. Use environment variables only.
- Do not log sensitive data (tokens, passwords, PII) to console or files.
- If a task fails twice, dispatch the escalation subagent.

## Failure Criteria
A task fails when:
- The agent reports it cannot complete the task
- Tests fail after 3 retry attempts
- The agent exceeds its time budget (30 minutes per phase)

Track failures in \`.agentic/TASK_REGISTRY.json\` under \`failures\` counter per task.
`;
const RESEARCHER_TEMPLATE = `---
description: Kiki Researcher — writes specs and plans, never source code
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
You write design docs (specs, plans, reviews). You do NOT write source code.

Dispatch superpowers skills:
- \`brainstorming\` for ideation and requirements
- \`writing-plans\` for implementation plans
- \`requesting-code-review\` for architect review

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
You implement code strictly per the approved plan. You do NOT modify specs or plans.

Dispatch superpowers skills:
- \`executing-plans\` for implementation
- \`test-driven-development\` for test-first coding

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
You review code against the approved plan. You do NOT write code.

Check for:
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
You diagnose why the pipeline failed. Read the task registry, routing log, and git history.

Recommend exactly one of:
- **Redesign:** The approach is fundamentally wrong. Start over with a new plan.
- **Split:** The task is too large. Break into smaller sub-tasks.
- **Stop:** The task is infeasible or too risky. Recommend cancellation.

Be honest and direct. Do not try to "save" a failing task.
`;
const PLUGIN_TEMPLATE = `import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { loadRoutingTable, lookupModel, saveRoutingTable, classifyDomain, classifyRisk, selectModel } from 'kiki';
import type { Skill, Domain, Risk, RoutingLogEntry } from 'kiki';

const SUPERPOWERS_SKILLS = ['brainstorming', 'writing-plans', 'executing-plans', 'reviewing'];

function isSuperpowersSkill(skill: string): boolean {
  return SUPERPOWERS_SKILLS.includes(skill);
}

function logRoutingDecision(entry: RoutingLogEntry): void {
  try {
    mkdirSync('.agentic', { recursive: true });
    const logLine = JSON.stringify(entry) + '\n';
    appendFileSync('.agentic/routing_log.jsonl', logLine);
  } catch {
    // Silently ignore logging failures
  }
}

export default function KikiPlugin({ client }: { client: any }) {
  return {
    'tool.execute.before': async (input: any, output: any) => {
      if (input.tool !== 'task') return;
      
      const skill = output.args?.skill;
      if (!skill || !isSuperpowersSkill(skill)) return;

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
      if (!table) {
        console.warn('[Kiki] No routing table found. Run "kiki update-benchmarks" and "kiki update-pricing".');
        return;
      }

      const candidateModel = lookupModel(table, skill as Skill, domain, risk);
      if (!candidateModel) {
        console.warn(\`[Kiki] No model found for \${skill}/\${domain}/\${risk}\`);
        return;
      }

      const state = { projectDefaults: table.projectDefaults ?? {} };
      const key = \`\${skill}:\${domain}\`;
      const currentDefault = table.projectDefaults[key] ?? null;
      const currentDefaultScore = table.rules.find(r => r.model === currentDefault && r.skill === skill && r.domain === domain)?.scorePerDollar ?? 0;
      const candidateScore = table.rules.find(r => r.model === candidateModel && r.skill === skill && r.domain === domain)?.scorePerDollar ?? 0;

      const { model: selectedModel, updatedDefaults } = selectModel(
        state,
        key,
        taskId ?? null,
        candidateModel,
        candidateScore,
        currentDefault,
        currentDefaultScore
      );

      if (updatedDefaults[key] !== table.projectDefaults[key]) {
        table.projectDefaults = updatedDefaults;
        saveRoutingTable(table);
      }

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
        reason: \`scorePerDollar: \${candidateScore.toFixed(2)}\`
      });

      console.log(\`[Kiki] Routed \${skill} → \${selectedModel} (\${domain}, \${risk})\`);
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
The orchestrator dispatches the superpowers \`brainstorming\` skill. This phase produces documented design decisions, trade-off analysis, and a validated spec.

### 3. Plan
The \`writing-plans\` skill produces a detailed implementation plan with bite-sized tasks, exact file paths, and complete code in every step.

### 4. Architect Review
The orchestrator reviews the plan against \`.agentic/alignment.json\` guardrails. An inline review is appended to the plan document. The plan must pass this gate before implementation begins.

### 5. Implement
The \`executing-plans\` and \`test-driven-development\` skills implement the plan task by task. Tests are written first, then code to make them pass. All commits reference the plan.

### 6. Review
The Kiki Reviewer subagent verifies plan adherence, security, code quality, and test coverage. An inline verdict is appended to the plan.

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
    writeFileSync(join(agentsDir, 'kiki-researcher.md'), RESEARCHER_TEMPLATE);
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