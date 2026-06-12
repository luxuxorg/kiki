import { describe, it, expect } from 'vitest';
import type { RoutingRule, KikiConfig } from '../src/types';

describe('types', () => {
  it('RoutingRule has required fields', () => {
    const rule: RoutingRule = {
      skill: 'brainstorming',
      domain: 'gui',
      risk: 'medium',
      model: 'anthropic/claude-opus-4-8',
      scorePerDollar: 145.2,
      benchmarkScore: 92.0,
      costPer1k: 0.05,
      reason: 'Best UI reasoning'
    };
    expect(rule.model).toBe('anthropic/claude-opus-4-8');
  });

  it('KikiConfig has required fields', () => {
    const config: KikiConfig = {
      projectName: 'test',
      language: 'typescript',
      commands: { build: '', test: '', lint: '' },
      riskMatrix: { highRiskPaths: [], criticalRiskPaths: [] },
      routingPreferences: {
        refreshIntervalHours: 24,
        minBenchmarkRank: 20,
        costCeilingPer1kTokens: 0.05
      }
    };
    expect(config.routingPreferences.minBenchmarkRank).toBe(20);
  });
});
