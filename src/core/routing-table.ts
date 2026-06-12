import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'node:path';
import type { RoutingTable, RoutingRule, BridgeBenchCache, OpenRouterCache, Skill, Domain, Risk } from '../types';
import { getBridgeBenchScore, getBenchmarkRank } from './benchmark-cache';
import { getModelPricing } from './pricing';

export let ROUTING_PATH = '.agentic/routing.json';

export function setRoutingPath(newPath: string): void {
  if (newPath.includes('..') || newPath.startsWith('/')) {
    throw new Error('Invalid routing path');
  }
  ROUTING_PATH = newPath;
}

export function loadRoutingTable(): RoutingTable | null {
  if (!existsSync(ROUTING_PATH)) return null;
  try {
    const raw = readFileSync(ROUTING_PATH, 'utf-8');
    return JSON.parse(raw) as RoutingTable;
  } catch {
    return null;
  }
}

export function saveRoutingTable(table: RoutingTable): void {
  const dir = path.dirname(ROUTING_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(ROUTING_PATH, JSON.stringify(table, null, 2));
}

export function generateRoutingTable(
  benchmarks: BridgeBenchCache,
  pricing: OpenRouterCache,
  availableModels: string[],
  config: { minBenchmarkRank: number; costCeilingPer1kTokens: number }
): RoutingTable {
  const skills: Skill[] = ['brainstorming', 'writing-plans', 'executing-plans', 'reviewing'];
  const domains: Domain[] = ['gui', 'backend', 'security', 'database', 'general'];
  const risks: Risk[] = ['critical', 'high', 'medium', 'low', 'micro'];

  const rules: RoutingRule[] = [];

  for (const skill of skills) {
    for (const domain of domains) {
      const category = mapSkillDomainToCategory(skill, domain);
      
      let bestModel: string | null = null;
      let bestScorePerDollar = -Infinity;
      let bestBenchmarkScore = -Infinity;
      let bestCost = 0;

      for (const model of availableModels) {
        const benchmarkScore = getBridgeBenchScore(benchmarks, model, category);
        const rank = getBenchmarkRank(benchmarks, model, category);
        const pricingData = getModelPricing(pricing, model);

        if (benchmarkScore === null || pricingData === null) continue;
        if (rank !== null && rank > config.minBenchmarkRank) continue;
        if (pricingData.avgCostPer1k > config.costCeilingPer1kTokens) continue;

        const scorePerDollar = benchmarkScore / pricingData.avgCostPer1k;
        if (isNaN(scorePerDollar)) continue;

        if (scorePerDollar > bestScorePerDollar) {
          bestScorePerDollar = scorePerDollar;
          bestModel = model;
          bestBenchmarkScore = benchmarkScore;
          bestCost = pricingData.avgCostPer1k;
        }
      }

      // Fallback: if no model meets criteria, pick highest-ranked regardless of cost
      if (!bestModel) {
        for (const model of availableModels) {
          const benchmarkScore = getBridgeBenchScore(benchmarks, model, category);
          if (benchmarkScore === null) continue;

          const pricingData = getModelPricing(pricing, model);
          if (pricingData === null) continue;

          if (benchmarkScore > bestBenchmarkScore) {
            bestBenchmarkScore = benchmarkScore;
            bestModel = model;
            bestCost = pricingData.avgCostPer1k;
            bestScorePerDollar = bestCost > 0 ? benchmarkScore / bestCost : 0;
          }
        }
      }

      if (bestModel) {
        for (const risk of risks) {
          rules.push({
            skill,
            domain,
            risk,
            model: bestModel,
            scorePerDollar: bestScorePerDollar,
            benchmarkScore: bestBenchmarkScore,
            costPer1k: bestCost,
            reason: `Best score/$ for ${category} (${bestBenchmarkScore.toFixed(1)} / $${bestCost.toFixed(4)})`
          });
        }
      }
    }
  }

  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    sources: {
      benchmarks: `BridgeBench (scraped ${benchmarks.scrapedAt})`,
      pricing: `OpenRouter API (${pricing.fetchedAt})`
    },
    rules,
    projectDefaults: {}
  };
}

export function mapSkillDomainToCategory(skill: Skill, domain: Domain): string {
  const mappings: Record<string, string> = {
    'brainstorming:gui': 'BS',
    'brainstorming:backend': 'BS',
    'brainstorming:security': 'BS',
    'brainstorming:database': 'BS',
    'brainstorming:general': 'BS',
    'writing-plans:gui': 'Reasoning',
    'writing-plans:backend': 'Reasoning',
    'writing-plans:security': 'Reasoning',
    'writing-plans:database': 'Reasoning',
    'writing-plans:general': 'Reasoning',
    'executing-plans:gui': 'UI',
    'executing-plans:backend': 'Debugging',
    'executing-plans:security': 'Security',
    'executing-plans:database': 'Debugging',
    'executing-plans:general': 'Debugging',
    'reviewing:gui': 'Refactoring',
    'reviewing:backend': 'Refactoring',
    'reviewing:security': 'Security',
    'reviewing:database': 'Refactoring',
    'reviewing:general': 'Refactoring'
  };
  return mappings[`${skill}:${domain}`] ?? 'Reasoning';
}

export function lookupModel(
  table: RoutingTable,
  skill: Skill,
  domain: Domain,
  risk: Risk
): string | null {
  const rule = table.rules.find(r => r.skill === skill && r.domain === domain && r.risk === risk);
  return rule?.model ?? null;
}
