# Smoke case `1decc15` — plugin hook registration (no behavioral test)

**Non-metric smoke only.** Not scored, not gated, not counted.

- **Introducer:** `0c13814` — "refactor: simplify config.ts — thin plugin, 8-agent routing,
  remove riskMatrix, add gui-designer"
- **Fix:** `1decc15` — "fix: plugin hook registration — return object with tool.execute.before
  key"
- **Later live-plugin mirror:** `82bb29d` (outside the `src`+`tests` restriction)
- **Base for smoke replay:** `0c13814` (apply nothing; the change is HEAD)
- **Frozen change:** `git diff 0c13814^ 0c13814 -- src tests`
- **Why not ground truth:** the fix ships no behavioral test. Nothing proves the defect
  behaviorally; this case exists only to exercise replay and report shape.

## Neutral task prompt

> Review the attached change simplifying the generated plugin and agent configuration in the
> provided repository context.

Do not mention hooks, registration, the defect, the fix or expected verdict.

## Frozen diff (src+tests only)

```diff
diff --git a/src/cli/config.ts b/src/cli/config.ts
index be30b48..1f23462 100644
--- a/src/cli/config.ts
+++ b/src/cli/config.ts
@@ -1,5 +1,6 @@
 import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
 import { join, dirname } from 'path';
+import type { StaticRoutingTable } from '../types.js';
 
 export interface KikiPaths {
   source: string;
@@ -29,10 +30,6 @@ export interface KikiConfig {
     lint: string;
     security: string;
   };
-  riskMatrix: {
-    highRiskPaths: string[];
-    criticalRiskPaths: string[];
-  };
   paths: KikiPaths;
   models: KikiModels;
 }
@@ -48,7 +45,7 @@ export const DEFAULT_PATHS: KikiPaths = {
   readme: 'README.md',
   decisions: 'docs/DECISIONS.md',
   knowledge: null,
-  taskRegistry: '.agentic/TASK_REGISTRY.json',
+  taskRegistry: '.agentic/kiki/TASK_REGISTRY.json',
 };
 
 export const DEFAULT_MODELS: KikiModels = {
@@ -65,10 +62,6 @@ export const DEFAULT_CONFIG: KikiConfig = {
     lint: 'npm run lint',
     security: 'npm audit',
   },
-  riskMatrix: {
-    highRiskPaths: ['src/auth/', 'src/db/schema.ts'],
-    criticalRiskPaths: ['src/security/', 'migrations/'],
-  },
   paths: DEFAULT_PATHS,
   models: DEFAULT_MODELS,
 };
@@ -82,33 +75,16 @@ export const DEFAULT_ALIGNMENT = {
   compliance: ['OWASP Top 10', 'SOC 2 Type II'],
 };
 
-export const DEFAULT_ROUTING_TABLE = {
-  rules: {
-    'brainstorming:gui': { standard: 'anthropic/claude-sonnet-4.6' },
-    'brainstorming:backend': { standard: 'moonshotai/kimi-k2.6' },
-    'brainstorming:security': { standard: 'deepseek/deepseek-v4-pro', critical: 'anthropic/claude-sonnet-4.6' },
-    'brainstorming:database': { standard: 'moonshotai/kimi-k2.6' },
-    'brainstorming:general': { standard: 'moonshotai/kimi-k2.6' },
-    'writing-plans:gui': { standard: 'anthropic/claude-sonnet-4.6' },
-    'writing-plans:backend': { standard: 'moonshotai/kimi-k2.6' },
-    'writing-plans:security': { standard: 'moonshotai/kimi-k2.6', critical: 'anthropic/claude-sonnet-4.6' },
-    'writing-plans:database': { standard: 'moonshotai/kimi-k2.6' },
-    'writing-plans:general': { standard: 'moonshotai/kimi-k2.6' },
-    'executing-plans:gui': { standard: 'anthropic/claude-sonnet-4.6' },
-    'executing-plans:backend': { standard: 'moonshotai/kimi-k2.6' },
-    'executing-plans:security': { standard: 'deepseek/deepseek-v4-pro', critical: 'anthropic/claude-sonnet-4.6' },
-    'executing-plans:database': { standard: 'moonshotai/kimi-k2.6' },
-    'executing-plans:general': { standard: 'moonshotai/kimi-k2.6' },
-    'reviewing:gui': { standard: 'openai/gpt-5.4-mini' },
-    'reviewing:backend': { standard: 'deepseek/deepseek-v4-pro' },
-    'reviewing:security': { standard: 'moonshotai/kimi-k2.6', critical: 'anthropic/claude-sonnet-4.6' },
-    'reviewing:database': { standard: 'deepseek/deepseek-v4-pro' },
-    'reviewing:general': { standard: 'deepseek/deepseek-v4-pro' },
-    'documenting:gui': { standard: 'moonshotai/kimi-k2.6' },
-    'documenting:backend': { standard: 'moonshotai/kimi-k2.6' },
-    'documenting:security': { standard: 'moonshotai/kimi-k2.6' },
-    'documenting:database': { standard: 'moonshotai/kimi-k2.6' },
-    'documenting:general': { standard: 'moonshotai/kimi-k2.6' },
+export const DEFAULT_ROUTING_TABLE: StaticRoutingTable = {
+  agents: {
+    'kiki-orchestrator': DEFAULT_MODELS.standard,
+    'kiki-brainstormer': DEFAULT_MODELS.standard,
+    'kiki-planner': DEFAULT_MODELS.standard,
+    'kiki-implementer': DEFAULT_MODELS.standard,
+    'kiki-gui-designer': DEFAULT_MODELS.standard,
+    'kiki-reviewer': DEFAULT_MODELS.standard,
+    'kiki-escalation': DEFAULT_MODELS.critical,
+    'kiki-historian': DEFAULT_MODELS.standard,
   },
 };
 
@@ -134,15 +110,18 @@ function fileDir(path: string): string {
 }
 
 export function loadConfig(targetPath: string): KikiConfig {
-  const configPath = join(targetPath, '.agentic', 'config.json');
+  const modernConfigPath = join(targetPath, '.agentic', 'kiki', 'config.json');
+  const legacyConfigPath = join(targetPath, '.agentic', 'config.json');
+  const configPath = existsSync(modernConfigPath) ? modernConfigPath : legacyConfigPath;
   if (!existsSync(configPath)) return { ...DEFAULT_CONFIG };
   try {
     const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
+    const { riskMatrix: _discardedRiskMatrix, ...rest } = raw;
     return {
       ...DEFAULT_CONFIG,
-      ...raw,
-      paths: { ...DEFAULT_PATHS, ...(raw.paths ?? {}) },
-      models: { ...DEFAULT_MODELS, ...(raw.models ?? {}) },
+      ...rest,
+      paths: { ...DEFAULT_PATHS, ...(rest.paths ?? {}) },
+      models: { ...DEFAULT_MODELS, ...(rest.models ?? {}) },
     };
   } catch {
     return { ...DEFAULT_CONFIG };
@@ -318,18 +297,21 @@ mode: primary
 You are the Kiki Orchestrator. You are **COORDINATION-ONLY**.
 
 ## Your Role
-Dispatch the correct subagent via the \`task\` tool. Do not write code, edit files, run commands, or read implementation details. The Kiki plugin handles model selection automatically.
+Dispatch the correct subagent via the \`task\` tool. Do not write code, edit files, run commands, or read implementation details. Agent models come from \`.agentic/kiki/routing.json\` after \`kiki routing\` syncs them into OpenCode agent frontmatter.
 
 ## Process
 1. **Intake:** Ask clarifying questions one at a time until requirements are clear.
 2. **Brainstorm:** Dispatch \`kiki-brainstormer\`.
 3. **Plan:** Dispatch \`kiki-planner\`.
-4. **Architect Review:** Review the plan against \`.agentic/alignment.json\` and append inline review.
+4. **Architect Review:** Dispatch \`kiki-reviewer\` for architect review of the plan against \`.agentic/kiki/alignment.json\`.
 5. **Implement:** Dispatch \`kiki-implementer\`.
 6. **Review:** Dispatch \`kiki-reviewer\`.
 7. **Document:** Dispatch \`kiki-historian\` to update \`${p.readme}\`, \`${p.changelog}\`, and project docs.
 8. **Complete:** Update \`${p.taskRegistry}\`.
 
+## Task Registry Schema
+TASK_REGISTRY entries must use \`id\`, \`description\`, \`status\`, \`phase\`, \`failures\`, and \`startedAt\`. Valid phases are \`brainstorm\`, \`plan\`, \`plan-review\`, \`implement\`, \`implementation-review\`, \`document\`, and \`complete\`. Optional descriptive fields include \`completedAt\`, \`spec\`, \`plan\`, \`deferred\`, \`knownIssues\`, and \`reviewNotes\`. \`reviewNotes\` must be an array containing only unresolved issue strings; do not record fixed review findings there.
+
 ## Key Rules
 - Always dispatch the correct **kiki subagent** via \`task\`.
 - **NEVER** do the work yourself.
@@ -407,9 +389,10 @@ ${perms}
 You are the Kiki Implementer. Implement code strictly per the approved plan.
 
 ## Instructions
-1. **Load \`executing-plans\` and \`test-driven-development\` superpowers skills** and follow them **inline**.
+1. **Load \`executing-plans\`, \`test-driven-development\`, and \`systematic-debugging\` superpowers skills** and follow them **inline**.
 2. Do the work yourself; do not dispatch skills to another subagent.
 3. You do NOT modify specs or plans.
+4. Debug systematically before claiming work is complete. Verify before claiming completion.
 
 ## Security Rules
 - Never commit \`.env\` files, API keys, or credentials.
@@ -441,6 +424,16 @@ When done, append a short **Implementation Summary** (3–5 sentences + changed
 `;
 }
 
+export function generateGuiDesignerTemplate(_config: KikiConfig): string {
+  return `---
+description: Kiki GUI Designer — UI/UX design + implementation via superpowers skills
+mode: subagent
+---
+
+You are the Kiki GUI Designer. You own UI/UX design and implementation end-to-end. Load the \`ui-ux-pro-max\` skill for design intelligence, the \`executing-plans\` skill for plan execution discipline, the \`test-driven-development\` skill for implementation, and the \`systematic-debugging\` skill for when things break. Follow all four exactly. Produce both design direction and working frontend code. Do not split visual work from implementation.
+`;
+}
+
 export function generateReviewerTemplate(config: KikiConfig): string {
   const perms = buildReviewerPermissions(config.paths);
   return `---
@@ -493,7 +486,7 @@ You are the Kiki Escalation Agent. Diagnose why the pipeline failed.
 
 ## Instructions
 1. Read the task registry, routing log, and git history.
-2. **Load \`brainstorming\` or \`writing-plans\` skill** as needed and follow it **inline**.
+2. **Load the \`systematic-debugging\` superpowers skill** and follow it **inline**.
 3. Do the work yourself; do not dispatch the skill to another subagent.
 4. Recommend exactly one of:
    - **Redesign:** Start over with a new plan.
@@ -527,245 +520,32 @@ ${responsibilities}
 }
 
 export function generatePluginTemplate(): string {
-  return `import { readFileSync, appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
-import { homedir } from 'os';
-import { join } from 'path';
-
-type Skill = 'brainstorming' | 'writing-plans' | 'executing-plans' | 'reviewing' | 'documenting';
-type Domain = 'gui' | 'backend' | 'security' | 'database' | 'general';
-type Risk = 'standard' | 'critical';
-
-interface StaticRoutingRule {
-  standard: string;
-  critical?: string;
-}
-
-interface StaticRoutingTable {
-  rules: Record<string, StaticRoutingRule>;
-}
+  return `import { appendFileSync, existsSync, mkdirSync } from 'fs';
+import { join, dirname } from 'path';
 
 interface RoutingLogEntry {
   timestamp: string;
-  taskId?: string;
-  skill: Skill;
-  domain: Domain;
-  risk: Risk;
-  selectedModel: string;
-  reason: string;
-}
-
-interface StabilizerState {
-  locks: Record<string, string>;
-}
-
-const SUBAGENT_TYPE_TO_SKILL: Record<string, Skill> = {
-  'kiki-brainstormer': 'brainstorming',
-  'kiki-planner': 'writing-plans',
-  'kiki-implementer': 'executing-plans',
-  'kiki-reviewer': 'reviewing',
-  'kiki-escalation': 'brainstorming',
-  'kiki-historian': 'documenting',
-};
-
-function getSkillFromSubagentType(subagentType: string): Skill | null {
-  return SUBAGENT_TYPE_TO_SKILL[subagentType] ?? null;
-}
-
-function loadRoutingTable(filePath?: string): StaticRoutingTable | null {
-  const paths = filePath
-    ? [filePath]
-    : ['.agentic/kiki/routing.json', '.agentic/routing.json'];
-  for (const p of paths) {
-    try {
-      const raw = readFileSync(p, 'utf-8');
-      return JSON.parse(raw) as StaticRoutingTable;
-    } catch {
-      // try next path
-    }
-  }
-  return null;
-}
-
-function mergeRoutingTables(project: StaticRoutingTable | null, global: StaticRoutingTable | null): StaticRoutingTable {
-  return {
-    rules: Object.assign({}, global?.rules ?? {}, project?.rules ?? {})
-  };
-}
-
-function lookupModel(table: StaticRoutingTable, skill: Skill, domain: Domain, risk: Risk): string | null {
-  const key = skill + ':' + domain;
-  const rule = table.rules[key];
-  if (!rule) return null;
-  if (risk === 'critical' && rule.critical) return rule.critical;
-  return rule.standard;
-}
-
-function classifyDomain(taskDesc: string): Domain {
-  const d = taskDesc.toLowerCase();
-  if (/\\b(react|vue|angular|frontend|ui|css|html|component)\\b/.test(d)) return 'gui';
-  if (/\\b(api|server|backend|route|endpoint|middleware|express|fastify)\\b/.test(d)) return 'backend';
-  if (/\\b(auth|security|crypto|encrypt|password|token|jwt|oauth|sql\\s*injection|xss)\\b/.test(d)) return 'security';
-  if (/\\b(db|database|schema|migration|sql|postgres|sqlite|prisma|orm)\\b/.test(d)) return 'database';
-  return 'general';
-}
-
-function classifyRisk(paths: string[], riskMatrix: { highRiskPaths: string[]; criticalRiskPaths: string[] }): Risk {
-  for (const p of paths) {
-    for (const critical of riskMatrix.criticalRiskPaths) {
-      if (p.startsWith(critical)) return 'critical';
-    }
-  }
-  for (const p of paths) {
-    for (const high of riskMatrix.highRiskPaths) {
-      if (p.startsWith(high)) return 'standard';
-    }
-  }
-  return 'standard';
-}
-
-function loadStabilizerState(): StabilizerState {
-  try {
-    const raw = readFileSync('.agentic/cache/stabilizer.json', 'utf-8');
-    return JSON.parse(raw) as StabilizerState;
-  } catch {
-    return { locks: {} };
-  }
-}
-
-function getLockedModel(state: StabilizerState, taskId: string | null): string | null {
-  if (!taskId) return null;
-  return state.locks[taskId] ?? null;
-}
-
-function lockTaskModel(state: StabilizerState, taskId: string, model: string): void {
-  state.locks[taskId] = model;
-  try {
-    mkdirSync('.agentic/cache', { recursive: true });
-    writeFileSync('.agentic/cache/stabilizer.json', JSON.stringify(state, null, 2));
-  } catch {
-    // silently ignore
-  }
-}
-
-function logRoutingDecision(entry: RoutingLogEntry): void {
-  try {
-    mkdirSync('.agentic', { recursive: true });
-    const logLine = JSON.stringify(entry) + '\\n';
-    appendFileSync('.agentic/routing_log.jsonl', logLine);
-  } catch {
-    // Silently ignore logging failures
-  }
-}
-
-function findFallbackModel(table: StaticRoutingTable, skill: Skill, domain: Domain): string | null {
-  const key = skill + ':' + domain;
-  const rule = table.rules[key];
-  if (rule) return rule.standard;
-  const skillKeys = Object.keys(table.rules).filter(k => k.startsWith(skill + ':'));
-  if (skillKeys.length > 0) return table.rules[skillKeys[0]].standard;
-  const allKeys = Object.keys(table.rules);
-  if (allKeys.length > 0) return table.rules[allKeys[0]].standard;
-  return null;
-}
-
-function resolveConfigPath(): string | null {
-  const paths = ['.agentic/kiki/config.json', '.agentic/config.json'];
-  for (const p of paths) {
-    if (existsSync(p)) return p;
-  }
-  return null;
+  agent: string;
+  model: string;
 }
 
 export default function KikiPlugin({ client }: { client: any }) {
-  const stabilizerState = loadStabilizerState();
-
-  return {
-    'tool.execute.before': async (input: any, output: any) => {
-      if (input.tool !== 'task') return;
-
-      const subagentType = output.args?.subagent_type ?? '';
-      const skill = getSkillFromSubagentType(subagentType);
-
-      if (!skill) {
-        return;
-      }
-
-      const taskDesc = output.args?.prompt ?? '';
-      const taskId = output.args?.taskId;
-
-      const domain = classifyDomain(taskDesc);
-
-      let risk: Risk = 'standard';
-      try {
-        const configPath = resolveConfigPath();
-        if (configPath) {
-          const config = JSON.parse(readFileSync(configPath, 'utf-8'));
-          const pathMatches = taskDesc.match(/[\\w/.-]+\\.(ts|js|tsx|jsx|py|rs|go)/g) ?? [];
-          risk = classifyRisk(pathMatches, config.riskMatrix);
-        }
-      } catch {
-        // Config missing, use default standard
-      }
-
-      let selectedModel: string | null = getLockedModel(stabilizerState, taskId ?? null);
-      let reason: string;
-
-      if (selectedModel) {
-        reason = 'task locked';
-      } else {
-        const projectTable = loadRoutingTable('.agentic/kiki/routing.json');
-        const globalTable = loadRoutingTable(join(homedir(), '.config', 'opencode', 'kiki', 'defaults', 'routing.json'));
-        const table = mergeRoutingTables(projectTable, globalTable);
-
-        if (!table || Object.keys(table.rules).length === 0) {
-          console.error('[Kiki] CRITICAL: No routing table found. Check .agentic/kiki/routing.json exists.');
-          reason = 'missing routing table';
-        } else {
-          selectedModel = lookupModel(table, skill, domain, risk);
-
-          if (selectedModel) {
-            if (taskId) {
-              lockTaskModel(stabilizerState, taskId, selectedModel);
-            }
-            reason = 'static routing (' + risk + ')';
-          } else {
-            selectedModel = findFallbackModel(table, skill, domain);
-            if (selectedModel) {
-              console.warn('[Kiki] No exact rule for ' + skill + '/' + domain + '. Falling back to ' + selectedModel + '.');
-              if (taskId) {
-                lockTaskModel(stabilizerState, taskId, selectedModel);
-              }
-              reason = 'fallback (no exact match)';
-            } else {
-              console.error('[Kiki] CRITICAL: Routing table has no models at all for ' + skill + '/' + domain + '.');
-              reason = 'no models in routing table';
-            }
-          }
-        }
-      }
-
-      if (selectedModel) {
-        if (!output.args) {
-          output.args = {};
-        }
-
-        logRoutingDecision({
-          timestamp: new Date().toISOString(),
-          taskId,
-          skill,
-          domain,
-          risk,
-          selectedModel,
-          reason
-        });
-
-        console.log('[Kiki] Routed ' + subagentType + ' → ' + selectedModel + ' (' + skill + ', ' + domain + ', ' + risk + ')');
-        console.log('[Kiki DIAG] NOTE: model not set on task args (task tool uses agent model frontmatter)');
-      } else {
-        console.error('[Kiki] CRITICAL: Could not select any model for ' + subagentType + '. Task will use OpenCode default.');
-      }
-    }
-  };
+  client.tool.execute.before(async ({ input, output }: any) => {
+    if (input.tool !== 'task') return;
+    const subagentType = output.args?.subagent_type ?? '';
+    if (!subagentType.startsWith('kiki-')) return;
+
+    const logPath = join(process.cwd(), '.agentic', 'routing_log.jsonl');
+    const dir = dirname(logPath);
+    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
+
+    const entry: RoutingLogEntry = {
+      timestamp: new Date().toISOString(),
+      agent: subagentType,
+      model: output.args?.model ?? 'unknown',
+    };
+    appendFileSync(logPath, JSON.stringify(entry) + '\\n');
+  });
 }
 `;
 }
@@ -792,7 +572,7 @@ The orchestrator dispatches the \`kiki-brainstormer\` subagent. The brainstormer
 The orchestrator dispatches the \`kiki-planner\` subagent. The planner loads the superpowers \`writing-plans\` skill inline and produces an implementation plan at \`${p.plans}...\`. Tasks in the plan include metadata: \`risk\`, \`parallel\`, and \`depends_on\`.
 
 ### 4. Architect Review
-The orchestrator reviews the plan against \`.agentic/alignment.json\` guardrails. An inline review is appended to the plan document. The plan must pass this gate before implementation begins.
+The orchestrator dispatches \`kiki-reviewer\` for architect review of the plan against \`.agentic/kiki/alignment.json\` guardrails. The reviewer appends an inline verdict to the plan document. The plan must pass this gate before implementation begins.
 
 ### 5. Implement
 The orchestrator dispatches the \`kiki-implementer\` subagent via the \`task\` tool. The implementer loads \`executing-plans\` and \`test-driven-development\` skills inline and implements the tasks.
@@ -806,16 +586,48 @@ The orchestrator dispatches the \`kiki-historian\` subagent to update \`${p.read
 ### 8. Complete
 The orchestrator updates \`${p.taskRegistry}\` with the task status and any failure metrics.
 
-## Risk-Based Routing
+## Task Registry Schema
 
-| Risk Level | Behavior |
-|---|---|
-| Standard | Uses the standard model from \`.agentic/routing.json\` |
-| Critical | Uses the critical model if defined for the skill+domain; falls back to standard |
+TASK_REGISTRY entries use the descriptive schema:
 
-## Model Selection
+\`\`\`json
+{
+  "id": "short_task_id",
+  "description": "One-sentence task description",
+  "status": "pending | in_progress | completed | failed",
+  "phase": "brainstorm | plan | plan-review | implement | implementation-review | document | complete",
+  "failures": 0,
+  "startedAt": "2026-07-01T00:00:00.000Z",
+  "completedAt": "2026-07-01T01:00:00.000Z",
+  "spec": "docs/superpowers/specs/example-design.md",
+  "plan": "docs/superpowers/plans/example-plan.md",
+  "reviewNotes": ["Only unresolved issue strings go here"]
+}
+\`\`\`
+
+Do not use \`name\`, \`created_at\`, \`phases\`, or \`failure_count\`. \`reviewNotes\` is an array of unresolved issue strings only; remove fixed findings instead of preserving them as history.
+
+## Role-Level Model Routing
+
+Model selection is one model per Kiki role. Edit the \`agents\` map in \`.agentic/kiki/routing.json\`, then run \`kiki routing\` to sync those models into \`.opencode/agents/kiki-*.md\` frontmatter.
+
+Example:
+
+\`\`\`json
+{
+  "agents": {
+    "kiki-orchestrator": "moonshotai/kimi-k2.6",
+    "kiki-brainstormer": "moonshotai/kimi-k2.6",
+    "kiki-planner": "moonshotai/kimi-k2.6",
+    "kiki-implementer": "moonshotai/kimi-k2.6",
+    "kiki-reviewer": "moonshotai/kimi-k2.6",
+    "kiki-escalation": "anthropic/claude-sonnet-4.6",
+    "kiki-historian": "moonshotai/kimi-k2.6"
+  }
+}
+\`\`\`
 
-Model selection is static and manually maintained. Edit \`.agentic/routing.json\` to change which model is used for each skill+domain combination. The \`standard\` model is always used unless a \`critical\` override is defined and the task touches critical paths.
+Use \`kiki routing --check\` in CI or before dispatching subagents to verify the OpenCode agent files match the central routing file.
 `;
 }
 
@@ -838,6 +650,7 @@ export interface GeneratedTemplates {
   brainstormer: string;
   planner: string;
   implementer: string;
+  guiDesigner: string;
   reviewer: string;
   escalation: string;
   historian: string;
@@ -853,6 +666,7 @@ export function generateAllTemplates(config: KikiConfig): GeneratedTemplates {
     brainstormer: generateBrainstormerTemplate(config),
     planner: generatePlannerTemplate(config),
     implementer: generateImplementerTemplate(config),
+    guiDesigner: generateGuiDesignerTemplate(config),
     reviewer: generateReviewerTemplate(config),
     escalation: generateEscalationTemplate(config),
     historian: generateHistorianTemplate(config),
@@ -880,6 +694,7 @@ export function writeOpencodeFiles(targetPath: string, config: KikiConfig): void
   writeFileSync(join(agentsDir, 'kiki-brainstormer.md'), templates.brainstormer);
   writeFileSync(join(agentsDir, 'kiki-planner.md'), templates.planner);
   writeFileSync(join(agentsDir, 'kiki-implementer.md'), templates.implementer);
+  writeFileSync(join(agentsDir, 'kiki-gui-designer.md'), templates.guiDesigner);
   writeFileSync(join(agentsDir, 'kiki-reviewer.md'), templates.reviewer);
   writeFileSync(join(agentsDir, 'kiki-escalation.md'), templates.escalation);
   writeFileSync(join(agentsDir, 'kiki-historian.md'), templates.historian);
```
