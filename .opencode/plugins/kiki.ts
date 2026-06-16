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
  'kiki-historian': 'documenting',
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
