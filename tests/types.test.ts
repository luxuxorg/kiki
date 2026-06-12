import { describe, it, expect } from 'vitest';
import type { RoutingRule, KikiConfig } from '../src/types';

describe('types', () => {
  it('RoutingRule has required fields', () => {
    const rule: RoutingRule = {
      skill: 'brainstorming',
      domain: 'gui',
      risk: 'medium',
      model: 'anthropic/claude-opus-4-8',
      score_per_dollar: 145.2,
      benchmark_score: 92.0,
      cost_per_1k: 0.05,
      reason: 'Best UI reasoning'
    };
    expect(rule.model).toBe('anthropic/claude-opus-4-8');
  });

  it('KikiConfig has required fields', () => {
    const config: KikiConfig = {
      project_name: 'test',
      language: 'typescript',
      commands: { build: '', test: '', lint: '' },
      risk_matrix: { high_risk_paths: [], critical_risk_paths: [] },
      routing_preferences: {
        refresh_interval_hours: 24,
        min_benchmark_rank: 20,
        cost_ceiling_per_1k_tokens: 0.05
      }
    };
    expect(config.routing_preferences.min_benchmark_rank).toBe(20);
  });
});
