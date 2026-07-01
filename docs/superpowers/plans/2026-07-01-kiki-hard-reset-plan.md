# Kiki Hard Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip Kiki back to three pillars (model routing, documentation scaffolding, safety checks) by deleting dynamic domain/risk/stabilizer logic, simplifying types and routing, converting the plugin to a thin logger, adding kiki-gui-designer, and removing all legacy/TASK_REGISTRY machinery.

**Architecture:** StaticRoutingTable becomes `{ agents: Record<string, string> }` — one role, one model. The plugin becomes a ~20-line logger that appends to `routing_log.jsonl` on `kiki-` subagent dispatch. Four core modules (domain-classifier, risk-classifier, stabilizer, path-resolver) are deleted. CLI commands drop legacy `.agentic/` root fallbacks, dual-layout merges, and TASK_REGISTRY reads. DEFAULT_ROUTING_TABLE gains `kiki-gui-designer` (8 agents total).

**Tech Stack:** TypeScript, Node.js, Vitest (`npm test`), tsc (`npm run build`)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/types.ts` | Modify | Remove Domain, Risk, TaskStatus, TaskRegistryEntry, StaticRoutingRule, rules from StaticRoutingTable, riskMatrix from KikiConfig; simplify RoutingLogEntry |
| `src/core/domain-classifier.ts` | Delete | Removed entirely |
| `src/core/risk-classifier.ts` | Delete | Removed entirely |
| `src/core/stabilizer.ts` | Delete | Removed entirely |
| `src/core/path-resolver.ts` | Delete | Removed entirely |
| `src/core/routing-table.ts` | Modify | Simplify to agents-only: loadRoutingTable, saveRoutingTable(path, table), lookupAgentModel, mergeRoutingTables |
| `src/index.ts` | Modify | Remove deleted-module exports, add lookupAgentModel, update type exports |
| `src/cli/config.ts` | Modify | Simplify KikiConfig (remove riskMatrix), DEFAULT_ROUTING_TABLE (agents only, 8 agents), generatePluginTemplate (thin logger), add generateGuiDesignerTemplate, update implementer/escalation prompts, update GeneratedTemplates + generateAllTemplates + writeOpencodeFiles, update DEFAULT_CONFIG |
| `src/cli/commands/install.ts` | Modify | Remove migrateLegacyConfig, add gui-designer to agent file list |
| `src/cli/commands/init.ts` | Modify | Remove legacy .agentic/ writes, remove riskMatrix from wizard config |
| `src/cli/commands/update.ts` | Modify | Remove mergeConfigSources/mergeRoutingSection/smartMerge, remove dual-layout writes, add gui-designer |
| `src/cli/commands/status.ts` | Modify | Remove TASK_REGISTRY counts, legacy layout detection, rules display |
| `src/cli/commands/doctor.ts` | Modify | Remove TASK_REGISTRY schema checks, deprecated-field checks, legacy routing path fallback, rules validation; add gui-designer to expected agents |
| `src/cli/commands/routing.ts` | Modify | Remove legacy .agentic/routing.json path fallback, remove rules parsing |
| `tests/core/domain-classifier.test.ts` | Delete | Removed |
| `tests/core/risk-classifier.test.ts` | Delete | Removed |
| `tests/core/stabilizer.test.ts` | Delete | Removed |
| `tests/core/path-resolver.test.ts` | Delete | Removed |
| `tests/types.test.ts` | Modify | Remove stripped types |
| `tests/core/routing-table.test.ts` | Modify | Simplify to agents-only |
| `tests/integration/routing-pipeline.test.ts` | Modify | Simplify to role-based lookup + logging |
| `tests/cli/status.test.ts` | Modify | Drop registry counts + legacy detection |
| `tests/cli/update.test.ts` | Modify | Drop dual-layout merge tests |
| `tests/cli/init.test.ts` | Modify | Drop legacy branch tests |
| `tests/cli/doctor.test.ts` | Modify | Drop registry schema tests + legacy checks |
| `tests/cli/install.test.ts` | Modify | Drop migration tests |

---

## Wave 1: Foundation — Types & Module Deletion

### Task 1: Simplify `src/types.ts`

**Files:**
- Modify: `src/types.ts`

**Metadata:**
- risk: medium
- parallel: true
- depends_on: []

- [ ] **Step 1: Rewrite `src/types.ts`**

Replace the entire file content with:

```typescript
export type Skill = 'brainstorming' | 'writing-plans' | 'executing-plans' | 'reviewing' | 'documenting';

export interface StaticRoutingTable {
  agents: Record<string, string>;
}

export interface KikiConfig {
  readonly projectName: string;
  readonly language: string;
  readonly commands: {
    readonly build: string;
    readonly test: string;
    readonly lint: string;
    readonly security: string;
  };
}

export interface RoutingLogEntry {
  readonly timestamp: string;
  readonly agent: string;
  readonly model: string;
}
```

Removed: `Domain`, `Risk`, `TaskStatus`, `TaskRegistryEntry`, `StaticRoutingRule`, `rules` from `StaticRoutingTable`, `critical` from `StaticRoutingRule`, `riskMatrix` from `KikiConfig`, `skill`/`domain`/`risk`/`selectedModel`/`reason`/`taskId` from `RoutingLogEntry`.

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "refactor: simplify types.ts — remove Domain, Risk, TaskStatus, TaskRegistryEntry, rules, riskMatrix"
```

---

### Task 2: Delete 4 Core Modules + Their Tests

**Files:**
- Delete: `src/core/domain-classifier.ts`
- Delete: `src/core/risk-classifier.ts`
- Delete: `src/core/stabilizer.ts`
- Delete: `src/core/path-resolver.ts`
- Delete: `tests/core/domain-classifier.test.ts`
- Delete: `tests/core/risk-classifier.test.ts`
- Delete: `tests/core/stabilizer.test.ts`
- Delete: `tests/core/path-resolver.test.ts`

**Metadata:**
- risk: low
- parallel: true
- depends_on: []

- [ ] **Step 1: Delete the 8 files**

```bash
rm src/core/domain-classifier.ts src/core/risk-classifier.ts src/core/stabilizer.ts src/core/path-resolver.ts
rm tests/core/domain-classifier.test.ts tests/core/risk-classifier.test.ts tests/core/stabilizer.test.ts tests/core/path-resolver.test.ts
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "refactor: delete domain-classifier, risk-classifier, stabilizer, path-resolver modules and tests"
```

---

### Wave 1 Verification

- [ ] **Step 3: Run `npm run build`** — Expected: FAIL (broken imports in routing-table.ts, index.ts, config.ts). This is expected; fixes come in Wave 2+.

---

## Wave 2: Core Routing & Barrel Export

### Task 3: Simplify `src/core/routing-table.ts`

**Files:**
- Modify: `src/core/routing-table.ts`

**Metadata:**
- risk: medium
- parallel: false
- depends_on: ['Task 1']

- [ ] **Step 1: Rewrite `src/core/routing-table.ts`**

Replace the entire file with:

```typescript
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'node:path';
import type { StaticRoutingTable } from '../types.js';

export let ROUTING_PATH = '.agentic/kiki/routing.json';

export function setRoutingPath(newPath: string): void {
  if (newPath.includes('..') || newPath.startsWith('/')) {
    throw new Error('Invalid routing path');
  }
  ROUTING_PATH = newPath;
}

export function loadRoutingTable(filePath?: string): StaticRoutingTable | null {
  const targetPath = filePath ?? ROUTING_PATH;
  if (!existsSync(targetPath)) return null;
  try {
    const raw = readFileSync(targetPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed?.agents || typeof parsed.agents !== 'object') {
      return null;
    }
    return { agents: parsed.agents } as StaticRoutingTable;
  } catch {
    return null;
  }
}

export function saveRoutingTable(filePath: string, table: StaticRoutingTable): void {
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(table, null, 2));
}

export function lookupAgentModel(
  table: StaticRoutingTable,
  agentName: string
): string | null {
  return table.agents[agentName] ?? null;
}

export function mergeRoutingTables(
  project: StaticRoutingTable | null,
  global: StaticRoutingTable | null
): StaticRoutingTable {
  const result: StaticRoutingTable = { agents: {} };
  if (global) {
    Object.assign(result.agents, global.agents);
  }
  if (project) {
    Object.assign(result.agents, project.agents);
  }
  return result;
}
```

Key changes: `saveRoutingTable` now takes `(filePath, table)` instead of `(table)`. `lookupModel(table, skill, domain, risk)` replaced by `lookupAgentModel(table, agentName)`. `mergeRoutingTables` merges `agents` only. Removed import of `Skill, Domain, Risk`. Removed `rules` from all return objects.

- [ ] **Step 2: Commit**

```bash
git add src/core/routing-table.ts
git commit -m "refactor: simplify routing-table.ts to agents-only lookup"
```

---

### Task 4: Update `src/index.ts` Barrel Exports

**Files:**
- Modify: `src/index.ts`

**Metadata:**
- risk: low
- parallel: false
- depends_on: ['Task 2', 'Task 3']

- [ ] **Step 1: Rewrite `src/index.ts`**

```typescript
export { loadRoutingTable, saveRoutingTable, lookupAgentModel, mergeRoutingTables, setRoutingPath, ROUTING_PATH } from './core/routing-table.js';
export type { Skill, StaticRoutingTable, KikiConfig, RoutingLogEntry } from './types.js';
```

Removed: `classifyDomain`, `classifyRisk`, `lockTaskModel`, `getLockedModel`, `loadStabilizerState`, `lookupModel`, `Domain`, `Risk`, `StaticRoutingRule`.

- [ ] **Step 2: Commit**

```bash
git add src/index.ts
git commit -m "refactor: update index.ts barrel exports for hard reset"
```

---

### Wave 2 Verification

- [ ] **Step 3: Run `npm run build`** — Expected: FAIL (config.ts and CLI commands still reference removed types/functions). Fixes come in Wave 3+.

---

## Wave 3: Config Overhaul

### Task 5: Simplify `src/cli/config.ts`

**Files:**
- Modify: `src/cli/config.ts`

**Metadata:**
- risk: high
- parallel: false
- depends_on: ['Task 1', 'Task 3']

This is the largest task. It touches: `KikiConfig` interface, `DEFAULT_CONFIG`, `DEFAULT_ROUTING_TABLE`, `generatePluginTemplate()`, agent prompt templates, `GeneratedTemplates`, `generateAllTemplates`, `writeOpencodeFiles`.

- [ ] **Step 1: Remove `riskMatrix` from `KikiConfig` interface**

Remove the `riskMatrix` field and its nested type from the `KikiConfig` interface.

- [ ] **Step 2: Remove `riskMatrix` from `DEFAULT_CONFIG`**

Remove the `riskMatrix` object from `DEFAULT_CONFIG`.

- [ ] **Step 3: Simplify `DEFAULT_ROUTING_TABLE` to agents-only with 8 agents**

Replace the entire `DEFAULT_ROUTING_TABLE` constant:

```typescript
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
```

Remove the entire `rules` object. Add `'kiki-gui-designer'` entry.

- [ ] **Step 4: Add `generateGuiDesignerTemplate()` function**

Add after `generateImplementerTemplate()`:

```typescript
export function generateGuiDesignerTemplate(_config: KikiConfig): string {
  return `---
description: Kiki GUI Designer — UI/UX design + implementation via superpowers skills
mode: subagent
---

You are the Kiki GUI Designer. You own UI/UX design and implementation end-to-end. Load the \`ui-ux-pro-max\` skill for design intelligence, the \`executing-plans\` skill for plan execution discipline, the \`test-driven-development\` skill for implementation, and the \`systematic-debugging\` skill for when things break. Follow all four exactly. Produce both design direction and working frontend code. Do not split visual work from implementation.
`;
}
```

- [ ] **Step 5: Update `kiki-implementer` prompt to add `systematic-debugging`**

In `generateImplementerTemplate()`, update the prompt body to include:

```
1. **Load `executing-plans`, `test-driven-development`, and `systematic-debugging` superpowers skills** and follow them **inline**.
```

Add: "Debug systematically before claiming work is complete. Verify before claiming completion."

- [ ] **Step 6: Update `kiki-escalation` prompt to add `systematic-debugging`**

In `generateEscalationTemplate()`, update the prompt body:

```
Load the `systematic-debugging` superpowers skill and follow it **inline**.
```

- [ ] **Step 7: Replace `generatePluginTemplate()` with thin logger**

Replace the entire function and all inline type definitions with:

```typescript
export function generatePluginTemplate(): string {
  return `import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

interface RoutingLogEntry {
  timestamp: string;
  agent: string;
  model: string;
}

export default function KikiPlugin({ client }: { client: any }) {
  client.tool.execute.before(async ({ input, output }: any) => {
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
  });
}
`;
}
```

This removes all inline type definitions, `SUBAGENT_TYPE_TO_SKILL`, `classifyDomain`, `classifyRisk`, `loadStabilizerState`, `getLockedModel`, model injection logic, and the entire routing override. The plugin now only logs.

- [ ] **Step 8: Update `GeneratedTemplates` interface and `generateAllTemplates()`**

Add `guiDesigner` field:

```typescript
export interface GeneratedTemplates {
  orchestrator: string;
  brainstormer: string;
  planner: string;
  implementer: string;
  guiDesigner: string;
  reviewer: string;
  escalation: string;
  historian: string;
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
  };
}
```

- [ ] **Step 9: Update `writeOpencodeFiles()`**

Add gui-designer write:

```typescript
writeFileSync(join(agentsDir, 'kiki-gui-designer.md'), templates.guiDesigner);
```

Insert after the `kiki-implementer.md` write line.

- [ ] **Step 10: Update `loadConfig()`**

Remove `riskMatrix` from the spread/default logic. The config loading should no longer reference `riskMatrix`.

- [ ] **Step 11: Commit**

```bash
git add src/cli/config.ts
git commit -m "refactor: simplify config.ts — thin plugin, 8-agent routing, remove riskMatrix, add gui-designer"
```

---

### Wave 3 Verification

- [ ] **Step 12: Run `npm run build`** — Expected: FAIL (CLI commands still reference removed functions/legacy paths). Fixes come in Wave 4.

---

## Wave 4: CLI Commands (Parallel)

### Task 6: Simplify `src/cli/commands/install.ts`

**Files:**
- Modify: `src/cli/commands/install.ts`

**Metadata:**
- risk: medium
- parallel: true
- depends_on: ['Task 5']

- [ ] **Step 1: Remove `migrateLegacyConfig` function and its call**

Delete the entire `migrateLegacyConfig` function and remove the call `migrateLegacyConfig(targetPath);` from the `installProject` function.

- [ ] **Step 2: Add `kiki-gui-designer.md` to the agent file map**

Add after `'kiki-implementer.md': templates.implementer,`:

```typescript
'kiki-gui-designer.md': templates.guiDesigner,
```

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/install.ts
git commit -m "refactor: remove migrateLegacyConfig from install.ts, add gui-designer"
```

---

### Task 7: Simplify `src/cli/commands/init.ts`

**Files:**
- Modify: `src/cli/commands/init.ts`

**Metadata:**
- risk: medium
- parallel: true
- depends_on: ['Task 5']

- [ ] **Step 1: Remove `riskMatrix` from wizard config**

Delete the line `riskMatrix: DEFAULT_CONFIG.riskMatrix,` from the config object created in `runWizard()`.

- [ ] **Step 2: Remove legacy `.agentic/` root writes**

Delete the block that writes legacy `.agentic/routing.json` (the "Also write legacy paths for backward compatibility in tests" section). Keep only the `.agentic/kiki/` writes.

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/init.ts
git commit -m "refactor: remove legacy .agentic/ writes and riskMatrix from init.ts"
```

---

### Task 8: Simplify `src/cli/commands/update.ts`

**Files:**
- Modify: `src/cli/commands/update.ts`

**Metadata:**
- risk: high
- parallel: true
- depends_on: ['Task 5']

- [ ] **Step 1: Remove `mergeConfigSources`, `mergeRoutingSection`, `smartMerge`, `isCustomValue` functions**

Delete all merge helper functions. These are the dual-layout merge machinery.

- [ ] **Step 2: Simplify `update()` function**

Replace the config/routing/alignment merge logic. The `update()` function should:
1. Load config from `.agentic/kiki/config.json` only (via `loadConfig`)
2. Regenerate `.opencode/` files via `writeOpencodeFiles`
3. Write routing to `.agentic/kiki/routing.json` only
4. Write alignment to `.agentic/kiki/alignment.json` only
5. Remove all `.agentic/config.json`, `.agentic/routing.json`, `.agentic/alignment.json` (legacy root) writes
6. Remove `TASK_REGISTRY.json` skip message

- [ ] **Step 3: Add `kiki-gui-designer.md` to the updated files list**

Add after `updated.push('.opencode/agents/kiki-implementer.md');`:

```typescript
updated.push('.opencode/agents/kiki-gui-designer.md');
```

- [ ] **Step 4: Remove `DEFAULT_ROUTING_TABLE.rules` reference**

Remove `mergeRoutingSection` calls and the `mergedRules` line. The routing write becomes simply writing `DEFAULT_ROUTING_TABLE` (or the loaded routing) to `.agentic/kiki/routing.json`.

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/update.ts
git commit -m "refactor: remove dual-layout merge from update.ts, add gui-designer"
```

---

### Task 9: Simplify `src/cli/commands/status.ts`

**Files:**
- Modify: `src/cli/commands/status.ts`

**Metadata:**
- risk: medium
- parallel: true
- depends_on: ['Task 5']

- [ ] **Step 1: Remove legacy layout detection**

Replace the status line that detects `modern` vs `legacy` vs `not initialized` to only check for modern `.agentic/kiki/` layout:

```typescript
console.log(`  Status: ${hasModernKiki ? 'initialized (.agentic/kiki/)' : 'not initialized'}`);
```

Remove `hasLegacyKiki` variable and its detection logic.

- [ ] **Step 2: Remove TASK_REGISTRY counts**

Remove any code that reads or displays TASK_REGISTRY.json content (task counts, status entries).

- [ ] **Step 3: Remove rules display**

Remove all `rules`-related console output (`Project rules`, `Global rules`, `Effective rules`, the `bySkill` grouping loop). Replace with agents summary:

```typescript
console.log(`  Project agents: ${projectTable ? Object.keys(projectTable.agents).length : 0}`);
console.log(`  Global agents: ${globalRouting ? Object.keys(globalRouting.agents).length : 0}`);
console.log(`  Effective agents: ${mergedTable ? Object.keys(mergedTable.agents).length : 0}`);

if (mergedTable && Object.keys(mergedTable.agents).length > 0) {
  for (const [agent, model] of Object.entries(mergedTable.agents)) {
    const source = projectTable?.agents[agent] ? 'project' : 'global';
    console.log(`  ${agent}: ${model} [${source}]`);
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/status.ts
git commit -m "refactor: remove TASK_REGISTRY and legacy detection from status.ts"
```

---

### Task 10: Simplify `src/cli/commands/doctor.ts`

**Files:**
- Modify: `src/cli/commands/doctor.ts`

**Metadata:**
- risk: high
- parallel: true
- depends_on: ['Task 5']

- [ ] **Step 1: Remove legacy routing path fallback**

Replace legacy path probing with:

```typescript
const routingPath = join(targetPath, '.agentic', 'kiki', 'routing.json');
```

- [ ] **Step 2: Replace rules validation with agents validation**

Remove all `rules` checking logic. Replace with `agents` map validation:

```typescript
const agents = raw?.agents;
if (!agents || typeof agents !== 'object') {
  results.push(check('routing.json agents', false, 'No agents map found'));
} else {
  const agentCount = Object.keys(agents).length;
  if (agentCount === 0) {
    results.push(check('routing.json agents', false, 'No agents defined'));
  } else {
    results.push(check(`routing.json agents (${agentCount} agents)`, true));
    for (const [name, model] of Object.entries(agents)) {
      const m = model as string;
      if (!m || m.trim() === '') {
        results.push(check(`agent ${name} model`, false, 'Empty model'));
      }
    }
  }
}
```

- [ ] **Step 3: Remove `checkTaskRegistry` function and its call**

Delete the entire `checkTaskRegistry` function and remove the call from the `doctor()` function. Remove `registryResults` from the results array.

- [ ] **Step 4: Remove deprecated-field schema checks from `checkConfigFields`**

Remove any checks for `riskMatrix`, `criticalRiskPaths`, `highRiskPaths`, or other deprecated fields from `checkConfigFields`.

- [ ] **Step 5: Add `kiki-gui-designer.md` to expected agent files**

Add after `'kiki-implementer.md',`:

```typescript
'kiki-gui-designer.md',
```

- [ ] **Step 6: Remove TASK_REGISTRY path references**

Remove the `join(targetPath, '.agentic', 'kiki', 'TASK_REGISTRY.json')` and `join(targetPath, '.agentic', 'TASK_REGISTRY.json')` path checks from the config paths validation in `checkPathsConfig`.

- [ ] **Step 7: Commit**

```bash
git add src/cli/commands/doctor.ts
git commit -m "refactor: remove TASK_REGISTRY/deprecated checks from doctor.ts, add gui-designer"
```

---

### Task 11: Simplify `src/cli/commands/routing.ts`

**Files:**
- Modify: `src/cli/commands/routing.ts`

**Metadata:**
- risk: medium
- parallel: true
- depends_on: ['Task 3']

- [ ] **Step 1: Remove legacy `.agentic/routing.json` path fallback**

Replace:
```typescript
const paths = [
  join(projectPath, '.agentic', 'kiki', 'routing.json'),
  join(projectPath, '.agentic', 'routing.json'),
];
```

With:
```typescript
const paths = [
  join(projectPath, '.agentic', 'kiki', 'routing.json'),
];
```

- [ ] **Step 2: Remove `rules` parsing from routing table loading**

Remove the `rules` field from the parsed routing table object. Keep only `agents` parsing.

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/routing.ts
git commit -m "refactor: remove legacy path fallback and rules from routing.ts"
```

---

### Wave 4 Verification

- [ ] **Step 4: Run `npm run build`** — Expected: PASS (or nearly — tests may still fail). All source files should now compile.
- [ ] **Step 5: Run `npm test`** — Expected: FAIL (tests need updating). Wave 5 fixes tests.

---

## Wave 5: Tests & Templates

### Task 12: Update Core & Integration Tests

**Files:**
- Modify: `tests/types.test.ts`
- Modify: `tests/core/routing-table.test.ts`
- Modify: `tests/integration/routing-pipeline.test.ts`

**Metadata:**
- risk: medium
- parallel: true
- depends_on: ['Task 1', 'Task 3', 'Task 4']

- [ ] **Step 1: Update `tests/types.test.ts`**

Remove all tests for `Domain`, `Risk`, `TaskStatus`, `TaskRegistryEntry`, `StaticRoutingRule`, `rules` on `StaticRoutingTable`, `riskMatrix` on `KikiConfig`. Keep tests for `Skill`, `StaticRoutingTable` (agents-only), `KikiConfig` (without riskMatrix), `RoutingLogEntry` (simplified fields: `timestamp`, `agent`, `model`).

- [ ] **Step 2: Update `tests/core/routing-table.test.ts`**

- Remove all tests that use `lookupModel` — replace with `lookupAgentModel` tests
- Remove all tests that reference `rules` in routing tables
- Update `saveRoutingTable` tests to pass `(path, table)` instead of `(table)`
- Update `mergeRoutingTables` tests to verify agents-only merge
- Update `loadRoutingTable` tests to verify agents-only parsing (tables with only `rules` should return null)

- [ ] **Step 3: Update `tests/integration/routing-pipeline.test.ts`**

Simplify to role-based lookup + logging:
- Remove domain/risk classification tests
- Remove stabilizer lock tests
- Test `lookupAgentModel` with agent names like `'kiki-orchestrator'`, `'kiki-implementer'`
- Test that routing log entries contain `timestamp`, `agent`, `model` (no `domain`/`risk`)

- [ ] **Step 4: Commit**

```bash
git add tests/types.test.ts tests/core/routing-table.test.ts tests/integration/routing-pipeline.test.ts
git commit -m "test: update core and integration tests for hard reset"
```

---

### Task 13: Update CLI Tests

**Files:**
- Modify: `tests/cli/status.test.ts`
- Modify: `tests/cli/update.test.ts`
- Modify: `tests/cli/init.test.ts`
- Modify: `tests/cli/doctor.test.ts`
- Modify: `tests/cli/install.test.ts`

**Metadata:**
- risk: medium
- parallel: true
- depends_on: ['Task 6', 'Task 7', 'Task 8', 'Task 9', 'Task 10', 'Task 11']

- [ ] **Step 1: Update `tests/cli/status.test.ts`**

- Remove tests for TASK_REGISTRY counts
- Remove tests for legacy layout detection
- Remove tests that assert `rules` counts in output
- Add tests that assert `agents` count and agent model display in output

- [ ] **Step 2: Update `tests/cli/update.test.ts`**

- Remove tests for `mergeConfigSources`, `mergeRoutingSection`, `smartMerge`
- Remove tests for dual-layout writes (`.agentic/config.json` + `.agentic/kiki/config.json`)
- Remove tests for `rules` merging
- Add test that `kiki-gui-designer.md` is written to `.opencode/agents/`

- [ ] **Step 3: Update `tests/cli/init.test.ts`**

- Remove tests for legacy `.agentic/` root writes
- Remove tests that verify `riskMatrix` in generated config
- Add test that `kiki-gui-designer.md` is scaffolded in `.opencode/agents/`

- [ ] **Step 4: Update `tests/cli/doctor.test.ts`**

- Remove tests for TASK_REGISTRY schema validation
- Remove tests for deprecated-field checks (`riskMatrix`, `criticalRiskPaths`)
- Remove tests for `rules` validation in routing.json
- Add tests for `agents` map validation (presence, non-empty models)
- Add test that `kiki-gui-designer.md` is in the expected agent files list
- Remove tests for legacy routing path fallback

- [ ] **Step 5: Update `tests/cli/install.test.ts`**

- Remove tests for `migrateLegacyConfig`
- Remove tests for legacy config migration
- Add test that `kiki-gui-designer.md` is installed to global agents dir

- [ ] **Step 6: Commit**

```bash
git add tests/cli/status.test.ts tests/cli/update.test.ts tests/cli/init.test.ts tests/cli/doctor.test.ts tests/cli/install.test.ts
git commit -m "test: update CLI tests for hard reset"
```

---

### Task 14: Update Workflow Template & Orchestrator Prompt

**Files:**
- Modify: `src/cli/config.ts` (workflow template + orchestrator template)

**Metadata:**
- risk: medium
- parallel: true
- depends_on: ['Task 5']

- [ ] **Step 1: Update orchestrator template to include gui-designer dispatch rules**

In `generateOrchestratorTemplate()`, update the dispatch rules section to include:

```
- UI/frontend/visual/layout/component/design task → @kiki-gui-designer
- Backend/logic/data/tooling task → @kiki-implementer
- Design/spec phase → @kiki-brainstormer
- Planning phase → @kiki-planner
- Review phase → @kiki-reviewer
- Failure diagnosis → @kiki-escalation
```

- [ ] **Step 2: Update workflow template to mention gui-designer**

In `generateWorkflowTemplate()`, add a section for the GUI Designer phase or update the implement phase to mention routing UI tasks to `kiki-gui-designer`.

- [ ] **Step 3: Commit**

```bash
git add src/cli/config.ts
git commit -m "refactor: update orchestrator and workflow templates for gui-designer + systematic-debugging"
```

---

## Final Verification

- [ ] **Step 1: Run `npm run build`**

```bash
npm run build
```

Expected: PASS — tsc compiles with zero errors.

- [ ] **Step 2: Run `npm test`**

```bash
npm test
```

Expected: PASS — all Vitest tests pass.

- [ ] **Step 3: Manual smoke test**

```bash
# In a temp directory:
node dist/cli/index.js init /tmp/kiki-test
# Verify: .agentic/kiki/ created with config.json, routing.json, alignment.json
# Verify: .opencode/agents/ has 8 agent files including kiki-gui-designer.md
# Verify: routing.json has agents map only (no rules)
# Verify: config.json has no riskMatrix
# Verify: plugin template is ~20 lines (thin logger)

node dist/cli/index.js doctor /tmp/kiki-test
# Verify: no TASK_REGISTRY checks, no rules checks
# Verify: agents map validation runs
# Verify: kiki-gui-designer.md in expected agents list

node dist/cli/index.js status /tmp/kiki-test
# Verify: no TASK_REGISTRY counts, no legacy detection
# Verify: agents summary shown

node dist/cli/index.js routing /tmp/kiki-test
# Verify: reads .agentic/kiki/routing.json only
# Verify: syncs agents map to frontmatter
```

- [ ] **Step 4: Verify noema still works**

```bash
node dist/cli/index.js doctor /home/lutz/lprojekte/noema
node dist/cli/index.js routing /home/lutz/lprojekte/noema --check
```

---

## Self-Review Checklist

| Spec Requirement | Task |
|---|---|
| Delete 4 core modules + tests | Task 2 |
| Simplify types.ts (remove Domain, Risk, TaskStatus, TaskRegistryEntry, rules, critical, riskMatrix) | Task 1 |
| Simplify routing-table.ts (loadRoutingTable, saveRoutingTable, lookupAgentModel, mergeRoutingTables) | Task 3 |
| Simplify plugin to ~20-line thin logger | Task 5 (Step 7) |
| Simplify generatePluginTemplate() in config.ts | Task 5 (Step 7) |
| Add kiki-gui-designer agent to roster + DEFAULT_ROUTING_TABLE | Task 5 (Steps 3-4), Task 14 |
| Update kiki-implementer prompt (add systematic-debugging) | Task 5 (Step 5) |
| Update kiki-escalation prompt (add systematic-debugging) | Task 5 (Step 6) |
| Remove legacy .agentic/ root fallback | Tasks 7, 9, 10, 11 |
| Remove migrateLegacyConfig from install.ts | Task 6 |
| Remove dual-layout writes from update.ts and init.ts | Tasks 7, 8 |
| Remove TASK_REGISTRY reads from status.ts and doctor.ts | Tasks 9, 10 |
| Remove deprecated-field schema checks from doctor.ts | Task 10 |
| Update all affected tests | Tasks 12, 13 |
| DEFAULT_ROUTING_TABLE simplified to agents map with 8 agents | Task 5 (Step 3) |
