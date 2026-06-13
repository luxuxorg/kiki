import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { loadRoutingTable, lookupModel, saveRoutingTable } from '../../src/core/routing-table';
import { classifyDomain } from '../../src/core/domain-classifier';
import { classifyRisk } from '../../src/core/risk-classifier';
import { selectModel } from '../../src/core/stabilizer';
import type { Skill, Domain, Risk, RoutingLogEntry, RoutingTable } from '../../src/types';

// Map kiki subagent types to the superpowers skill they invoke.
// This is the bridge between OpenCode's task tool (which dispatches by subagent_type)
// and Kiki's routing table (which routes by skill).
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

function findFallbackModel(table: RoutingTable, skill: Skill, domain: Domain): string | null {
  // First: try any risk level for this skill+domain
  const risks: Risk[] = ['critical', 'high', 'medium', 'low', 'micro'];
  for (const risk of risks) {
    const model = lookupModel(table, skill, domain, risk);
    if (model) return model;
  }

  // Second: try any rule for this skill (any domain, any risk)
  const rule = table.rules.find(r => r.skill === skill);
  if (rule) return rule.model;

  // Third: try any rule at all
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
        // Not a kiki subagent; let OpenCode handle it normally.
        return;
      }

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
          const key = `${skill}:${domain}`;
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
            const { saveRoutingTable } = await import('../../src/core/routing-table');
            saveRoutingTable(table);
          }

          reason = `scorePerDollar: ${candidateScore.toFixed(2)}`;
        } else {
          // Fallback: find any usable model in the routing table
          selectedModel = findFallbackModel(table, skill, domain);
          if (selectedModel) {
            console.warn(`[Kiki] No exact rule for ${skill}/${domain}/${risk}. Falling back to ${selectedModel}.`);
            reason = 'fallback (no exact rule)';
          } else {
            console.error(`[Kiki] CRITICAL: Routing table has no models at all for ${skill}/${domain}.`);
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

        console.log(`[Kiki] Routed ${subagentType} → ${selectedModel} (${skill}, ${domain}, ${risk})`);
      } else {
        console.error(`[Kiki] CRITICAL: Could not select any model for ${subagentType}. Task will use OpenCode default.`);
      }
    }
  };
}
