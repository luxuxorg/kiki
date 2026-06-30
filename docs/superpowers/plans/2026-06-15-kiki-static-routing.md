# Kiki Static Routing Simplification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dynamic benchmark/pricing-based routing table with a manually-maintained static file. Simplify risk from 5 levels to 2 (standard/critical). Remove all OpenRouter and BridgeBench dependencies.

**Architecture:** The routing table becomes a simple JSON map keyed by `skill:domain` with optional `standard` and `critical` model slots. Standard is the fallback when critical is not defined. The risk classifier only checks for critical paths; everything else is standard. The stabilizer drops score-based hysteresis and only retains task locking.

**Tech Stack:** TypeScript (Node.js), Vitest for tests, no new dependencies.

---

## File Structure

| File | Action | Purpose |
|---|---|---|
| `src/types.ts` | **Modify** | Simplify Risk, remove BenchmarkScore/PricingData/BridgeBenchCache/OpenRouterCache types |
| `src/core/routing-table.ts` | **Rewrite** | Static lookup from simplified routing.json; remove generateRoutingTable, mapSkillDomainToCategory |
| `src/core/risk-classifier.ts` | **Modify** | Only check critical paths; return `'standard' \| 'critical'` |
| `src/core/stabilizer.ts` | **Simplify** | Remove score-based hysteresis; keep task locking only |
| `src/core/benchmark-cache.ts` | **Delete** | No longer needed |
| `src/core/pricing.ts` | **Delete** | No longer needed |
| `src/index.ts` | **Modify** | Update exports; remove benchmark/pricing exports |
| `src/cli/index.ts` | **Modify** | Remove `update-benchmarks` and `update-pricing` commands |
| `src/cli/commands/update-benchmarks.ts` | **Delete** | No longer needed |
| `src/cli/commands/update-pricing.ts` | **Delete** | No longer needed |
| `src/cli/commands/init.ts` | **Modify** | Update templates: new routing.json format, simplified config, updated plugin template |
| `src/cli/commands/status.ts` | **Modify** | Remove benchmark/pricing source display |
| `.opencode/plugins/kiki.ts` | **Rewrite** | Use new static routing format; remove scorePerDollar logic |
| `tests/core/routing-table.test.ts` | **Rewrite** | Test new static lookup |
| `tests/core/risk-classifier.test.ts` | **Modify** | Test only standard/critical |
| `tests/core/stabilizer.test.ts` | **Simplify** | Test task locking only |
| `tests/core/benchmark-cache.test.ts` | **Delete** | No longer needed |
| `tests/core/pricing.test.ts` | **Delete** | No longer needed |
| `tests/integration/routing-pipeline.test.ts` | **Modify** | Use new routing format |
| `tests/cli/init.test.ts` | **Modify** | Expect new templates |
| `tests/cli/status.test.ts` | **Modify** | Expect simplified status output |

---

### Task 1: Simplify Types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Rewrite types.ts**

Replace the content of `src/types.ts` with the simplified version:

```typescript
export type Skill = 'brainstorming' | 'writing-plans' | 'executing-plans' | 'reviewing';
export type Domain = 'gui' | 'backend' | 'security' | 'database' | 'general';
export type Risk = 'standard' | 'critical';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface StaticRoutingRule {
  readonly standard: string;
  readonly critical?: string;
}

export interface StaticRoutingTable {
  readonly rules: Record<string, StaticRoutingRule>;
}

export interface TaskRegistryEntry {
  readonly taskId: string;
  readonly createdAt: string;
  readonly skill: Skill;
  readonly domain: Domain;
  readonly model: string;
  readonly status: TaskStatus;
}

export interface KikiConfig {
  readonly projectName: string;
  readonly language: string;
  readonly commands: {
    readonly build: string;
    readonly test: string;
    readonly lint: string;
  };
  readonly riskMatrix: {
    readonly highRiskPaths: readonly string[];
    readonly criticalRiskPaths: readonly string[];
  };
}

export interface RoutingLogEntry {
  readonly timestamp: string;
  readonly taskId?: string;
  readonly skill: Skill;
  readonly domain: Domain;
  readonly risk: Risk;
  readonly selectedModel: string;
  readonly reason: string;
}
```

- [ ] **Step 2: Build and verify no compile errors from types**

Run: `npx tsc --noEmit`
Expected: Compile errors in other files (which we'll fix in subsequent tasks). No errors in types.ts itself.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "refactor(types): simplify Risk to standard/critical, remove benchmark/pricing types"
```

---

### Task 2: Delete Benchmark Cache and Pricing Modules

**Files:**
- Delete: `src/core/benchmark-cache.ts`
- Delete: `src/core/pricing.ts`

- [ ] **Step 1: Delete the files**

```bash
rm src/core/benchmark-cache.ts src/core/pricing.ts
```

- [ ] **Step 2: Commit**

```bash
git add src/core/benchmark-cache.ts src/core/pricing.ts
git commit -m "refactor: remove benchmark-cache and pricing modules"
```

---

### Task 3: Simplify Risk Classifier

**Files:**
- Modify: `src/core/risk-classifier.ts`

- [ ] **Step 1: Rewrite risk-classifier.ts**

Replace the content of `src/core/risk-classifier.ts`:

```typescript
import type { Risk, KikiConfig } from '../types.js';

export function classifyRisk(filePaths: string[], config: KikiConfig['riskMatrix']): Risk {
  if (filePaths.length === 0) return 'standard';

  const matchesCritical = filePaths.some((p: string) =>
    config.criticalRiskPaths.some((critical: string) => p.includes(critical))
  );
  if (matchesCritical) return 'critical';

  return 'standard';
}
```

- [ ] **Step 2: Build check**

Run: `npx tsc --noEmit`
Expected: Errors only in files not yet updated.

- [ ] **Step 3: Commit**

```bash
git add src/core/risk-classifier.ts
git commit -m "refactor(risk): simplify to standard/critical only"
```

---

### Task 4: Simplify Stabilizer (Task Locking Only)

**Files:**
- Modify: `src/core/stabilizer.ts`

- [ ] **Step 1: Rewrite stabilizer.ts**

Replace the content of `src/core/stabilizer.ts`:

```typescript
export interface StabilizerState {
  taskLocks: Record<string, string>; // taskId -> model
}

export function loadStabilizerState(): StabilizerState {
  return { taskLocks: {} };
}

export function lockTaskModel(state: StabilizerState, taskId: string, model: string): StabilizerState {
  return {
    taskLocks: { ...state.taskLocks, [taskId]: model }
  };
}

export function getLockedModel(state: StabilizerState, taskId: string | null): string | null {
  if (!taskId) return null;
  return state.taskLocks[taskId] ?? null;
}
```

- [ ] **Step 2: Build check**

Run: `npx tsc --noEmit`
Expected: Errors only in files not yet updated.

- [ ] **Step 3: Commit**

```bash
git add src/core/stabilizer.ts
git commit -m "refactor(stabilizer): remove score-based hysteresis, keep task locking"
```

---

### Task 5: Rewrite Routing Table Module

**Files:**
- Modify: `src/core/routing-table.ts`

- [ ] **Step 1: Rewrite routing-table.ts**

Replace the content of `src/core/routing-table.ts`:

```typescript
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'node:path';
import type { StaticRoutingTable, Skill, Domain, Risk } from '../types.js';

export let ROUTING_PATH = '.agentic/routing.json';

export function setRoutingPath(newPath: string): void {
  if (newPath.includes('..') || newPath.startsWith('/')) {
    throw new Error('Invalid routing path');
  }
  ROUTING_PATH = newPath;
}

export function loadRoutingTable(): StaticRoutingTable | null {
  if (!existsSync(ROUTING_PATH)) return null;
  try {
    const raw = readFileSync(ROUTING_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.rules || typeof parsed.rules !== 'object') {
      return null;
    }
    return parsed as StaticRoutingTable;
  } catch {
    return null;
  }
}

export function saveRoutingTable(table: StaticRoutingTable): void {
  const dir = path.dirname(ROUTING_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(ROUTING_PATH, JSON.stringify(table, null, 2));
}

export function lookupModel(
  table: StaticRoutingTable,
  skill: Skill,
  domain: Domain,
  risk: Risk
): string | null {
  const key = `${skill}:${domain}`;
  const rule = table.rules[key];
  if (!rule) return null;

  // If risk is critical and a critical model is explicitly defined, use it
  if (risk === 'critical' && rule.critical) {
    return rule.critical;
  }

  // Otherwise fall back to standard
  return rule.standard ?? null;
}
```

- [ ] **Step 2: Build check**

Run: `npx tsc --noEmit`
Expected: Errors only in plugin and CLI files not yet updated.

- [ ] **Step 3: Commit**

```bash
git add src/core/routing-table.ts
git commit -m "refactor(routing-table): static lookup from simplified routing.json"
```

---

### Task 6: Update Plugin to Use New Static Routing

**Files:**
- Modify: `.opencode/plugins/kiki.ts`

- [ ] **Step 1: Rewrite the plugin**

Replace the content of `.opencode/plugins/kiki.ts`:

```typescript
import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { loadRoutingTable, lookupModel } from '../../src/core/routing-table';
import { classifyDomain } from '../../src/core/domain-classifier';
import { classifyRisk } from '../../src/core/risk-classifier';
import { loadStabilizerState, lockTaskModel, getLockedModel } from '../../src/core/stabilizer';
import type { Skill, Domain, Risk, StaticRoutingTable, RoutingLogEntry } from '../../src/types';

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
    const logLine = JSON.stringify(entry) + '\n';
    appendFileSync('.agentic/routing_log.jsonl', logLine);
  } catch {
    // Silently ignore logging failures
  }
}

function findFallbackModel(table: StaticRoutingTable, skill: Skill, domain: Domain): string | null {
  // Try exact match first
  const key = `${skill}:${domain}`;
  const rule = table.rules[key];
  if (rule) return rule.standard;

  // Try any domain for this skill
  const skillKeys = Object.keys(table.rules).filter(k => k.startsWith(`${skill}:`));
  if (skillKeys.length > 0) return table.rules[skillKeys[0]].standard;

  // Try any rule at all
  const allKeys = Object.keys(table.rules);
  if (allKeys.length > 0) return table.rules[allKeys[0]].standard;

  return null;
}

export default function KikiPlugin({ client }: { client: any }) {
  const stabilizerState = loadStabilizerState();

  return {
    'tool.execute.before': async (input: any, output: any) => {
      if (input.tool !== 'task') return;

      const subagentType = output.args?.agent ?? '';
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
        const pathMatches = taskDesc.match(/[\w/.-]+\.(ts|js|tsx|jsx|py|rs|go)/g) ?? [];
        risk = classifyRisk(pathMatches, config.riskMatrix);
      } catch {
        // Config missing, use default standard
      }

      // Check if this task is already locked to a model
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
            // Lock the task to this model
            if (taskId) {
              lockTaskModel(stabilizerState, taskId, selectedModel);
            }
            reason = `static routing (${risk})`;
          } else {
            // Fallback
            selectedModel = findFallbackModel(table, skill, domain);
            if (selectedModel) {
              console.warn(`[Kiki] No exact rule for ${skill}/${domain}. Falling back to ${selectedModel}.`);
              if (taskId) {
                lockTaskModel(stabilizerState, taskId, selectedModel);
              }
              reason = 'fallback (no exact match)';
            } else {
              console.error(`[Kiki] CRITICAL: Routing table has no models at all for ${skill}/${domain}.`);
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

        console.log(`[Kiki] Routed ${subagentType} → ${selectedModel} (${skill}, ${domain}, ${risk})`);
      } else {
        console.error(`[Kiki] CRITICAL: Could not select any model for ${subagentType}. Task will use OpenCode default.`);
      }
    }
  };
}
```

- [ ] **Step 2: Build check**

Run: `npx tsc --noEmit`
Expected: Errors only in CLI files not yet updated.

- [ ] **Step 3: Commit**

```bash
git add .opencode/plugins/kiki.ts
git commit -m "refactor(plugin): use static routing, remove score-aware logic"
```

---

### Task 7: Update Exports in index.ts

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Rewrite index.ts**

Replace the content of `src/index.ts`:

```typescript
export { loadRoutingTable, lookupModel, saveRoutingTable } from './core/routing-table.js';
export { classifyDomain } from './core/domain-classifier.js';
export { classifyRisk } from './core/risk-classifier.js';
export { lockTaskModel, getLockedModel, loadStabilizerState } from './core/stabilizer.js';
export type { Skill, Domain, Risk, StaticRoutingTable, StaticRoutingRule, RoutingLogEntry, KikiConfig } from './types.js';
```

- [ ] **Step 2: Build check**

Run: `npx tsc --noEmit`
Expected: Clean compile (CLI errors pending).

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "refactor(index): update exports for simplified routing"
```

---

### Task 8: Update CLI — Remove Benchmark/Pricing Commands

**Files:**
- Modify: `src/cli/index.ts`
- Delete: `src/cli/commands/update-benchmarks.ts`
- Delete: `src/cli/commands/update-pricing.ts`

- [ ] **Step 1: Delete the command files**

```bash
rm src/cli/commands/update-benchmarks.ts src/cli/commands/update-pricing.ts
```

- [ ] **Step 2: Rewrite cli/index.ts**

Replace the content of `src/cli/index.ts`:

```typescript
#!/usr/bin/env node
import { init } from './commands/init.js';
import { status } from './commands/status.js';
import { verify } from './commands/verify.js';

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case 'init':
      await init(args[1] ?? '.');
      break;
    case 'status':
      await status();
      break;
    case 'verify':
      await verify(args[1]);
      break;
    default:
      console.log(`Usage: kiki <command>
Commands:
  init [path]    Scaffold .agentic/ directory with static routing table
  status         Show task registry + routing summary
  verify <file>  Check for TBDs/TODOs/placeholders`);
      process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Build check**

Run: `npx tsc --noEmit`
Expected: Clean compile (init.ts still needs update but has no compile errors).

- [ ] **Step 4: Commit**

```bash
git add src/cli/index.ts src/cli/commands/update-benchmarks.ts src/cli/commands/update-pricing.ts
git commit -m "refactor(cli): remove update-benchmarks and update-pricing commands"
```

---

### Task 9: Update Init Command Templates

**Files:**
- Modify: `src/cli/commands/init.ts`

- [ ] **Step 1: Rewrite DEFAULT_CONFIG**

Remove `routingPreferences` from DEFAULT_CONFIG. Replace lines 4-21:

```typescript
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
  }
};
```

- [ ] **Step 2: Rewrite the scaffolded routing.json (in writeAgenticFiles)**

Replace the routing.json scaffolding (lines 410-416) with the static format pre-filled from noema:

```typescript
writeFileSync(join(agenticDir, 'routing.json'), JSON.stringify({
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
    "reviewing:general": { "standard": "deepseek/deepseek-v4-pro" }
  }
}, null, 2));
```

- [ ] **Step 3: Rewrite the PLUGIN_TEMPLATE**

Replace the PLUGIN_TEMPLATE (lines 198-336) to match the new simplified plugin:

```typescript
const PLUGIN_TEMPLATE = `import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { loadRoutingTable, lookupModel } from 'kiki';
import { classifyDomain, classifyRisk, lockTaskModel, getLockedModel, loadStabilizerState } from 'kiki';
import type { Skill, Domain, Risk, RoutingLogEntry, StaticRoutingTable } from 'kiki';

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

function findFallbackModel(table: StaticRoutingTable, skill: Skill, domain: Domain): string | null {
  const key = \`\${skill}:\${domain}\`;
  const rule = table.rules[key];
  if (rule) return rule.standard;
  const skillKeys = Object.keys(table.rules).filter(k => k.startsWith(\`\${skill}:\`));
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

      const subagentType = output.args?.agent ?? '';
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
        const pathMatches = taskDesc.match(/[\\\\w/.-]+\\\\.(ts|js|tsx|jsx|py|rs|go)/g) ?? [];
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
            reason = \`static routing (\${risk})\`;
          } else {
            selectedModel = findFallbackModel(table, skill, domain);
            if (selectedModel) {
              console.warn(\`[Kiki] No exact rule for \${skill}/\${domain}. Falling back to \${selectedModel}.\`);
              if (taskId) {
                lockTaskModel(stabilizerState, taskId, selectedModel);
              }
              reason = 'fallback (no exact match)';
            } else {
              console.error(\`[Kiki] CRITICAL: Routing table has no models at all for \${skill}/\${domain}.\`);
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

        console.log(\`[Kiki] Routed \${subagentType} → \${selectedModel} (\${skill}, \${domain}, \${risk})\`);
      } else {
        console.error(\`[Kiki] CRITICAL: Could not select any model for \${subagentType}. Task will use OpenCode default.\`);
      }
    }
  };
}
`;
```

- [ ] **Step 4: Update WORKFLOW_TEMPLATE risk table**

Replace the risk-based routing table in WORKFLOW_TEMPLATE (lines 381-386):

```
## Risk-Based Routing

| Risk Level | Behavior |
|---|---|
| Standard | Uses the standard model from `.agentic/routing.json` |
| Critical | Uses the critical model if defined for the skill+domain; falls back to standard |
```

And replace the model selection section (lines 388-391):

```
## Model Selection

Model selection is static and manually maintained. Edit `.agentic/routing.json` to change which model is used for each skill+domain combination. The `standard` model is always used unless a `critical` override is defined and the task touches critical paths.
```

- [ ] **Step 5: Build check**

Run: `npx tsc --noEmit`
Expected: Clean compile.

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/init.ts
git commit -m "refactor(init): scaffold simplified static routing table"
```

---

### Task 10: Update Status Command

**Files:**
- Modify: `src/cli/commands/status.ts`

- [ ] **Step 1: Rewrite status.ts**

Replace the content of `src/cli/commands/status.ts`:

```typescript
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { loadRoutingTable } from '../../core/routing-table.js';

export async function status(projectPath: string = '.'): Promise<void> {
  const agenticDir = join(projectPath, '.agentic');

  if (!existsSync(agenticDir)) {
    console.error('No .agentic/ directory found. Run "kiki init" first.');
    process.exit(1);
  }

  let registry;
  try {
    registry = JSON.parse(readFileSync(join(agenticDir, 'TASK_REGISTRY.json'), 'utf-8'));
  } catch {
    console.error('Failed to read TASK_REGISTRY.json');
    process.exit(1);
  }
  const table = loadRoutingTable();

  console.log('=== Task Registry ===');
  console.log(`Total tasks: ${registry.tasks?.length ?? 0}`);

  const byStatus = (registry.tasks ?? []).reduce((acc: Record<string, number>, t: any) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});

  for (const [status, count] of Object.entries(byStatus)) {
    console.log(`  ${status}: ${count}`);
  }

  if (table) {
    console.log('\n=== Routing Table ===');
    console.log('Static routing table (manually maintained)');
    const rules = Object.entries(table.rules);
    console.log(`Rules: ${rules.length}`);

    // Group by skill
    const bySkill: Record<string, string[]> = {};
    for (const [key, rule] of rules) {
      const [skill] = key.split(':');
      if (!bySkill[skill]) bySkill[skill] = [];
      bySkill[skill].push(`  ${key}: standard=${rule.standard}${rule.critical ? `, critical=${rule.critical}` : ''}`);
    }
    for (const [skill, entries] of Object.entries(bySkill)) {
      console.log(`\n${skill}:`);
      entries.forEach(e => console.log(e));
    }
  } else {
    console.log('\nNo routing table found. Run "kiki init".');
  }
}
```

- [ ] **Step 2: Build check**

Run: `npx tsc --noEmit`
Expected: Clean compile.

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/status.ts
git commit -m "refactor(status): display static routing table summary"
```

---

### Task 11: Update Tests

**Files:**
- Modify: `tests/core/routing-table.test.ts`
- Modify: `tests/core/risk-classifier.test.ts`
- Modify: `tests/core/stabilizer.test.ts`
- Delete: `tests/core/benchmark-cache.test.ts`
- Delete: `tests/core/pricing.test.ts`
- Modify: `tests/integration/routing-pipeline.test.ts`
- Modify: `tests/cli/init.test.ts`
- Modify: `tests/cli/status.test.ts`

- [ ] **Step 1: Delete benchmark-cache and pricing tests**

```bash
rm tests/core/benchmark-cache.test.ts tests/core/pricing.test.ts
```

- [ ] **Step 2: Rewrite tests/core/routing-table.test.ts**

Replace content:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rmSync, writeFileSync, mkdirSync } from 'fs';
import { loadRoutingTable, saveRoutingTable, lookupModel, setRoutingPath } from '../../src/core/routing-table';
import type { StaticRoutingTable } from '../../src/types';

describe('routing-table', () => {
  const testTable: StaticRoutingTable = {
    rules: {
      'brainstorming:gui': { standard: 'claude-sonnet-4.6' },
      'brainstorming:backend': { standard: 'kimi-k2.6' },
      'brainstorming:security': { standard: 'deepseek-v4-pro', critical: 'claude-opus-4' },
      'executing-plans:gui': { standard: 'claude-sonnet-4.6' },
    }
  };

  beforeEach(() => {
    mkdirSync('.agentic', { recursive: true });
    saveRoutingTable(testTable);
  });

  afterEach(() => {
    rmSync('.agentic', { recursive: true, force: true });
    setRoutingPath('.agentic/routing.json');
  });

  it('loads and saves a static routing table', () => {
    const loaded = loadRoutingTable();
    expect(loaded).not.toBeNull();
    expect(loaded!.rules['brainstorming:gui'].standard).toBe('claude-sonnet-4.6');
  });

  it('looks up standard model for a skill+domain', () => {
    const loaded = loadRoutingTable()!;
    const model = lookupModel(loaded, 'brainstorming', 'gui', 'standard');
    expect(model).toBe('claude-sonnet-4.6');
  });

  it('returns critical model when defined and risk is critical', () => {
    const loaded = loadRoutingTable()!;
    const model = lookupModel(loaded, 'brainstorming', 'security', 'critical');
    expect(model).toBe('claude-opus-4');
  });

  it('falls back to standard when critical is not defined', () => {
    const loaded = loadRoutingTable()!;
    const model = lookupModel(loaded, 'brainstorming', 'gui', 'critical');
    expect(model).toBe('claude-sonnet-4.6');
  });

  it('returns null for unknown skill+domain', () => {
    const loaded = loadRoutingTable()!;
    const model = lookupModel(loaded, 'reviewing', 'database', 'standard');
    expect(model).toBeNull();
  });

  it('returns null when routing table does not exist', () => {
    rmSync('.agentic/routing.json');
    const loaded = loadRoutingTable();
    expect(loaded).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    writeFileSync('.agentic/routing.json', 'not json');
    const loaded = loadRoutingTable();
    expect(loaded).toBeNull();
  });

  it('returns null for JSON without rules key', () => {
    writeFileSync('.agentic/routing.json', JSON.stringify({ foo: 'bar' }));
    const loaded = loadRoutingTable();
    expect(loaded).toBeNull();
  });
});
```

- [ ] **Step 3: Rewrite tests/core/risk-classifier.test.ts**

Replace content:

```typescript
import { describe, it, expect } from 'vitest';
import { classifyRisk } from '../../src/core/risk-classifier';

const config = {
  highRiskPaths: ['src/auth/'],
  criticalRiskPaths: ['src/security/', 'migrations/']
};

describe('risk-classifier', () => {
  it('returns standard for empty file paths', () => {
    expect(classifyRisk([], config)).toBe('standard');
  });

  it('returns standard for non-critical paths', () => {
    expect(classifyRisk(['src/app/main.ts', 'src/components/button.tsx'], config)).toBe('standard');
  });

  it('returns standard for high-risk but not critical paths', () => {
    expect(classifyRisk(['src/auth/login.ts'], config)).toBe('standard');
  });

  it('returns critical when a path matches criticalRiskPaths', () => {
    expect(classifyRisk(['src/security/crypto.ts'], config)).toBe('critical');
  });

  it('returns critical when any path matches (among many)', () => {
    expect(classifyRisk(['src/app/main.ts', 'src/security/crypto.ts'], config)).toBe('critical');
  });

  it('returns critical for migration paths', () => {
    expect(classifyRisk(['migrations/001_add_users.sql'], config)).toBe('critical');
  });

  it('returns standard when config has no criticalRiskPaths', () => {
    expect(classifyRisk(['src/anything.ts'], { criticalRiskPaths: [], highRiskPaths: [] })).toBe('standard');
  });
});
```

- [ ] **Step 4: Rewrite tests/core/stabilizer.test.ts**

Replace content:

```typescript
import { describe, it, expect } from 'vitest';
import { loadStabilizerState, lockTaskModel, getLockedModel } from '../../src/core/stabilizer';

describe('stabilizer', () => {
  it('loads empty state', () => {
    const state = loadStabilizerState();
    expect(state.taskLocks).toEqual({});
  });

  it('locks a task to a model', () => {
    const state = loadStabilizerState();
    const updated = lockTaskModel(state, 'task-1', 'claude-4');
    expect(updated.taskLocks['task-1']).toBe('claude-4');
  });

  it('returns locked model for known task', () => {
    const state = loadStabilizerState();
    const updated = lockTaskModel(state, 'task-1', 'claude-4');
    const locked = getLockedModel(updated, 'task-1');
    expect(locked).toBe('claude-4');
  });

  it('returns null for unknown task', () => {
    const state = loadStabilizerState();
    const updated = lockTaskModel(state, 'task-1', 'claude-4');
    const locked = getLockedModel(updated, 'task-2');
    expect(locked).toBeNull();
  });

  it('returns null for null taskId', () => {
    const state = loadStabilizerState();
    const locked = getLockedModel(state, null);
    expect(locked).toBeNull();
  });

  it('locks multiple tasks independently', () => {
    const state = loadStabilizerState();
    const s1 = lockTaskModel(state, 'task-1', 'claude-4');
    const s2 = lockTaskModel(s1, 'task-2', 'kimi-k2');
    expect(getLockedModel(s2, 'task-1')).toBe('claude-4');
    expect(getLockedModel(s2, 'task-2')).toBe('kimi-k2');
  });
});
```

- [ ] **Step 5: Rewrite tests/integration/routing-pipeline.test.ts**

Replace content:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rmSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { loadRoutingTable, saveRoutingTable, setRoutingPath } from '../../src/core/routing-table';
import { classifyDomain } from '../../src/core/domain-classifier';
import { classifyRisk } from '../../src/core/risk-classifier';
import { lookupModel } from '../../src/core/routing-table';
import KikiPlugin from '../../.opencode/plugins/kiki';

describe('routing pipeline integration', () => {
  beforeEach(() => {
    mkdirSync('.agentic', { recursive: true });

    writeFileSync('.agentic/config.json', JSON.stringify({
      riskMatrix: {
        highRiskPaths: ['src/auth/'],
        criticalRiskPaths: ['src/security/']
      }
    }));

    const table = {
      rules: {
        'brainstorming:gui': { standard: 'claude-4' },
        'brainstorming:security': { standard: 'deepseek-v4-pro', critical: 'claude-4-critical' },
        'reviewing:backend': { standard: 'deepseek-v4-pro' }
      }
    };
    saveRoutingTable(table);
  });

  afterEach(() => {
    rmSync('.agentic', { recursive: true, force: true });
    setRoutingPath('.agentic/routing.json');
  });

  it('classifies domain and looks up standard model', () => {
    const domain = classifyDomain('Build a React modal component');
    expect(domain).toBe('gui');

    const table = loadRoutingTable();
    expect(table).not.toBeNull();
    const model = lookupModel(table!, 'brainstorming', domain, 'standard');
    expect(model).toBe('claude-4');
  });

  it('uses standard when critical not defined for that skill+domain', () => {
    const table = loadRoutingTable()!;
    // brainstorming:gui has no critical — should fall back to standard
    const model = lookupModel(table, 'brainstorming', 'gui', 'critical');
    expect(model).toBe('claude-4');
  });

  it('uses critical model when defined and risk is critical', () => {
    const table = loadRoutingTable()!;
    const model = lookupModel(table, 'brainstorming', 'security', 'critical');
    expect(model).toBe('claude-4-critical');
  });

  it('returns null when routing table is missing', () => {
    rmSync('.agentic/routing.json');
    const table = loadRoutingTable();
    expect(table).toBeNull();
  });

  it('returns null when no matching model exists', () => {
    const table = loadRoutingTable()!;
    const model = lookupModel(table, 'executing-plans', 'database', 'standard');
    expect(model).toBeNull();
  });

  it('classifies risk with only standard/critical', () => {
    const configData = JSON.parse(readFileSync('.agentic/config.json', 'utf-8'));

    expect(classifyRisk(['src/auth/login.ts'], configData.riskMatrix)).toBe('standard');
    expect(classifyRisk(['src/security/crypto.ts'], configData.riskMatrix)).toBe('critical');
    expect(classifyRisk(['src/app/main.ts'], configData.riskMatrix)).toBe('standard');
    expect(classifyRisk([], configData.riskMatrix)).toBe('standard');
  });

  it('intercepts task tool with kiki subagent type and sets model', async () => {
    const plugin = KikiPlugin({ client: {} });
    const input = { tool: 'task' };
    const output = { args: { agent: 'kiki-brainstormer', prompt: 'Build a React component' } };
    await (plugin as any)['tool.execute.before'](input, output);
    expect(output.args.model).toBeDefined();
    // gui + no file paths → standard → claude-4
    expect(output.args.model).toBe('claude-4');
  });

  it('uses critical model for security paths', async () => {
    const plugin = KikiPlugin({ client: {} });
    const input = { tool: 'task' };
    const output = { args: { agent: 'kiki-brainstormer', prompt: 'Fix src/security/crypto.ts encryption' } };
    await (plugin as any)['tool.execute.before'](input, output);
    expect(output.args.model).toBe('claude-4-critical');
  });

  it('ignores non-kiki subagent types', async () => {
    const plugin = KikiPlugin({ client: {} });
    const input = { tool: 'task' };
    const output = { args: { agent: 'general', prompt: 'Do something' } };
    await (plugin as any)['tool.execute.before'](input, output);
    expect(output.args.model).toBeUndefined();
  });

  it('ignores non-task tools', async () => {
    const plugin = KikiPlugin({ client: {} });
    const input = { tool: 'bash' };
    const output = { args: { agent: 'kiki-brainstormer', prompt: 'Build a React component' } };
    await (plugin as any)['tool.execute.before'](input, output);
    expect(output.args.model).toBeUndefined();
  });

  it('falls back to any model for the skill when no exact rule matches', async () => {
    const plugin = KikiPlugin({ client: {} });
    const input = { tool: 'task' };
    const output = { args: { agent: 'kiki-brainstormer', prompt: 'Build a backend API' } };
    await (plugin as any)['tool.execute.before'](input, output);
    expect(output.args.model).toBeDefined();
  });

  it('logs error but does not crash when routing table is missing', async () => {
    rmSync('.agentic/routing.json');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const plugin = KikiPlugin({ client: {} });
    const input = { tool: 'task' };
    const output = { args: { agent: 'kiki-brainstormer', prompt: 'Build a React component' } };
    await (plugin as any)['tool.execute.before'](input, output);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No routing table found'));
    expect(output.args.model).toBeUndefined();

    consoleSpy.mockRestore();
  });
});
```

- [ ] **Step 6: Update init.test.ts and status.test.ts — READ FIRST then edit**

Read `tests/cli/init.test.ts` and `tests/cli/status.test.ts`, then update them to expect the new simplified config format (no routingPreferences in config, new routing.json format in init, simplified status output).

For `init.test.ts`:
- Remove assertions for `routingPreferences` in DEFAULT_CONFIG
- Update routing.json assertions to check new static format

For `status.test.ts`:
- Remove assertions for benchmark/pricing sources
- Update to expect new status output format

- [ ] **Step 7: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add tests/
git commit -m "test: update tests for static routing simplification"
```

---

### Task 12: Full Build and Verification

**Files:**
- (None — verification only)

- [ ] **Step 1: Clean build**

```bash
rm -rf dist && npx tsc
```

Expected: Clean TypeScript compilation, dist/ populated with all modules.

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 3: Verify CLI works**

```bash
node dist/cli/index.js
```

Expected: Usage message with only init, status, verify commands (no update-benchmarks or update-pricing).

- [ ] **Step 4: Commit if any build artifacts changed**

```bash
git add dist/ && git commit -m "build: regenerate dist after static routing refactor" || true
```
```

