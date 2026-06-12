# Kiki Deployable Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `kiki init` scaffold the complete `.opencode/` directory (agents, plugin, package.json, docs) so target projects are immediately usable with the kiki-orchestrator agent.

**Architecture:** Package exports via barrel `src/index.ts`. `kiki init` embeds all `.opencode/` files as string constants. The plugin template uses `import from 'kiki'` (package import), while the dev copy in the repo keeps relative imports for local development.

**Tech Stack:** TypeScript, Node.js >=18, vitest for testing

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `package.json` | Modify | Package name, repo URL, ESM exports |
| `src/index.ts` | Create | Barrel re-export for plugin consumers |
| `src/cli/commands/init.ts` | Modify | Add `.opencode/` template constants and scaffolding logic |
| `tests/cli/init.test.ts` | Modify | Add `.opencode/` scaffolding assertions |
| `.opencode/plugins/kiki.ts` | No change | Dev copy stays with relative imports |

No core module changes needed — all required exports already exist.

---

### Task 1: Fix package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update package name, repo URL, and add exports**

Edit `package.json` to change `"name"` and `"repository"`, and add `"exports"`:

```json
{
  "name": "kiki",
  "version": "1.0.0",
  "description": "Thin OpenCode plugin + CLI with benchmark-driven model routing",
  "license": "MIT",
  "keywords": ["opencode", "ai", "routing"],
  "repository": {
    "type": "git",
    "url": "https://github.com/luxuxorg/kiki.git"
  },
  "type": "module",
  "main": "dist/index.js",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "bin": {
    "kiki": "dist/cli/index.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "cli": "node dist/cli/index.js"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "@types/node": "^18.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

- [ ] **Step 2: Verify package.json parses**

```bash
node -e "const p = require('./package.json'); console.log(p.name, p.exports);"
```
Expected: `kiki` and the exports object.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: rename package to kiki, add exports field for barrel export"
```

---

### Task 2: Create barrel export (src/index.ts)

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Create src/index.ts**

```typescript
export { loadRoutingTable, lookupModel, saveRoutingTable } from './core/routing-table.js';
export { classifyDomain } from './core/domain-classifier.js';
export { classifyRisk } from './core/risk-classifier.js';
export { selectModel } from './core/stabilizer.js';
export type { Skill, Domain, Risk, RoutingLogEntry, RoutingTable, KikiConfig } from './types.js';
```

- [ ] **Step 2: Verify barrel exports compile**

```bash
npx tsc --noEmit
```
Expected: No errors. All re-exported symbols exist in their source modules.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add barrel export src/index.ts for plugin consumers"
```

---

### Task 3: Write failing test for .opencode scaffolding

**Files:**
- Modify: `tests/cli/init.test.ts`

- [ ] **Step 1: Add test for .opencode scaffolding**

Add this test after the existing tests in `tests/cli/init.test.ts` (before the closing `});` of the `describe` block):

```typescript
  it('scaffolds .opencode directory with agents, plugin, package.json, docs, and .gitignore', async () => {
    await init(tmpDir);

    // Agents exist with correct content
    const orchestrator = await fs.readFile(path.join(tmpDir, '.opencode/agents/kiki-orchestrator.md'), 'utf-8');
    expect(orchestrator).toContain('mode: primary');
    expect(orchestrator).toContain('Kiki Orchestrator');

    const researcher = await fs.readFile(path.join(tmpDir, '.opencode/agents/kiki-researcher.md'), 'utf-8');
    expect(researcher).toContain('mode: subagent');
    expect(researcher).toContain('docs/superpowers/*');

    const implementer = await fs.readFile(path.join(tmpDir, '.opencode/agents/kiki-implementer.md'), 'utf-8');
    expect(implementer).toContain('mode: subagent');
    expect(implementer).toContain('src/*');

    const reviewer = await fs.readFile(path.join(tmpDir, '.opencode/agents/kiki-reviewer.md'), 'utf-8');
    expect(reviewer).toContain('mode: subagent');
    expect(reviewer).toContain('edit: deny');

    const escalation = await fs.readFile(path.join(tmpDir, '.opencode/agents/kiki-escalation.md'), 'utf-8');
    expect(escalation).toContain('mode: subagent');
    expect(escalation).toContain('Redesign');

    // Plugin imports from kiki package, not relative paths
    const plugin = await fs.readFile(path.join(tmpDir, '.opencode/plugins/kiki.ts'), 'utf-8');
    expect(plugin).toContain("from 'kiki'");
    expect(plugin).not.toContain("../../src/core");

    // package.json references kiki dependency
    const pkg = JSON.parse(await fs.readFile(path.join(tmpDir, '.opencode/package.json'), 'utf-8'));
    expect(pkg.dependencies).toHaveProperty('@opencode-ai/plugin');
    expect(pkg.dependencies).toHaveProperty('kiki');
    expect(pkg.dependencies.kiki).toBe('github.com/luxuxorg/kiki');

    // .gitignore ignores node_modules
    const gitignore = await fs.readFile(path.join(tmpDir, '.opencode/.gitignore'), 'utf-8');
    expect(gitignore).toContain('node_modules');

    // agentic-workflow.md exists
    const workflow = await fs.readFile(path.join(tmpDir, '.opencode/docs/agentic-workflow.md'), 'utf-8');
    expect(workflow).toContain('Kiki Workflow');
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/cli/init.test.ts
```
Expected: The new test FAILS with ENOENT (no `.opencode/` directory created yet).

- [ ] **Step 3: Commit failing test**

```bash
git add tests/cli/init.test.ts
git commit -m "test: add failing test for .opencode scaffolding in kiki init"
```

---

### Task 4: Extend init.ts with .opencode templates

**Files:**
- Modify: `src/cli/commands/init.ts`

- [ ] **Step 1: Add template constants for all .opencode files**

Replace the entire file content with the extended version. Here is the complete new file:

```typescript
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
        const pathMatches = taskDesc.match(/[\w/.-]+\.(ts|js|tsx|jsx|py|rs|go)/g) ?? [];
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

function writeAgenticFiles(targetPath: string): string {
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

function writeOpencodeFiles(targetPath: string): void {
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

export async function init(targetPath: string): Promise<void> {
  writeAgenticFiles(targetPath);
  writeOpencodeFiles(targetPath);

  console.log(`Initialized Kiki in ${targetPath}`);
}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
npx vitest run tests/cli/init.test.ts
```
Expected: All 4 tests PASS (3 existing + 1 new).

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/init.ts
git commit -m "feat: extend kiki init to scaffold .opencode/ directory with agents, plugin, docs"
```

---

### Task 5: Run full test suite

**Files:**
- None (verification only)

- [ ] **Step 1: Build the project**

```bash
npm run build
```
Expected: TypeScript compilation succeeds with no errors.

- [ ] **Step 2: Run all tests**

```bash
npm test
```
Expected: All tests pass.

- [ ] **Step 3: End-to-end smoke test with real kiki init**

```bash
node dist/cli/index.js init /tmp/kiki-smoke-test
ls -la /tmp/kiki-smoke-test/.opencode/agents/
ls -la /tmp/kiki-smoke-test/.agentic/
rm -rf /tmp/kiki-smoke-test
```
Expected: Lists all 5 agent files in `.opencode/agents/`, and all `.agentic/` files.

- [ ] **Step 4: Commit if any fixes made during testing**

Only if something was fixed:
```bash
git add -A
git commit -m "chore: fix issues found during full test run"
```

---

### Task 6: Final verification and review

**Files:**
- None (verification only)

- [ ] **Step 1: Verify plugin template has no relative imports**

```bash
grep -c '../../src/core' src/cli/commands/init.ts
```
Expected: `0` (no relative imports in template strings).

- [ ] **Step 2: Verify all agent templates have correct frontmatter**

```bash
grep 'mode:' src/cli/commands/init.ts
```
Expected: One `mode: primary` (orchestrator) and four `mode: subagent` occurrences.

- [ ] **Step 3: TypeScript type-check**

```bash
npx tsc --noEmit
```
Expected: No type errors.
