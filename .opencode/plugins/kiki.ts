import { readFileSync, appendFileSync, existsSync } from 'fs';
import { loadRoutingTable, lookupModel } from '../../src/core/routing-table';
import { classifyDomain } from '../../src/core/domain-classifier';
import { classifyRisk } from '../../src/core/risk-classifier';
import { selectModel, lockTaskModel } from '../../src/core/stabilizer';
import type { Skill, Domain, Risk } from '../../src/types';

const SUPERPOWERS_SKILLS = ['brainstorming', 'writing-plans', 'executing-plans', 'reviewing'];

function isSuperpowersSkill(skill: string): boolean {
  return SUPERPOWERS_SKILLS.includes(skill);
}

function logRoutingDecision(entry: any): void {
  const logLine = JSON.stringify(entry) + '\n';
  appendFileSync('.agentic/routing_log.jsonl', logLine);
}

export default function KikiPlugin({ client }: { client: any }) {
  return {
    'tool.execute.before': async (input: any, output: any) => {
      if (input.tool !== 'task') return;
      
      const skill = output.args?.skill;
      if (!skill || !isSuperpowersSkill(skill)) return;

      const taskDesc = output.args?.prompt ?? '';
      const taskId = output.args?.taskId;
      
      const domain = classifyDomain(taskDesc) as Domain;
      
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
        console.warn(`[Kiki] No model found for ${skill}/${domain}/${risk}`);
        return;
      }

      const state = { projectDefaults: table.projectDefaults ?? {}, taskLocks: {} };
      const key = `${skill}:${domain}`;
      const currentDefault = table.projectDefaults[key] ?? null;
      const currentDefaultScore = table.rules.find(r => r.model === currentDefault)?.scorePerDollar ?? 0;
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
        (table as any).projectDefaults = updatedDefaults;
        const { saveRoutingTable } = await import('../../src/core/routing-table');
        saveRoutingTable(table);
      }

      output.args.model = selectedModel;

      logRoutingDecision({
        timestamp: new Date().toISOString(),
        taskId,
        skill,
        domain,
        risk,
        selectedModel,
        reason: `scorePerDollar: ${candidateScore.toFixed(2)}`
      });

      console.log(`[Kiki] Routed ${skill} → ${selectedModel} (${domain}, ${risk})`);
    }
  };
}
