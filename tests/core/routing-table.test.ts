import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  loadRoutingTable,
  saveRoutingTable,
  generateRoutingTable,
  lookupModel,
  setRoutingPath,
  ROUTING_PATH,
  mapSkillDomainToCategory
} from '../../src/core/routing-table';
import type { RoutingTable, BridgeBenchCache, OpenRouterCache } from '../../src/types';

describe('routing-table', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = `tmp/routing-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await fs.mkdir(tmpDir, { recursive: true });
    setRoutingPath(path.join(tmpDir, '.agentic/routing.json'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('loads null when table missing', () => {
    const result = loadRoutingTable();
    expect(result).toBeNull();
  });

  it('saves and loads routing table', () => {
    const table: RoutingTable = {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      sources: {
        benchmarks: 'BridgeBench (scraped 2024-01-01)',
        pricing: 'OpenRouter API (2024-01-01)'
      },
      rules: [
        {
          skill: 'brainstorming',
          domain: 'general',
          risk: 'low',
          model: 'openai/gpt-4o',
          scorePerDollar: 10.5,
          benchmarkScore: 88,
          costPer1k: 8.4,
          reason: 'Best score/$ for BS (88.0 / $8.4000)'
        }
      ],
      projectDefaults: {}
    };
    saveRoutingTable(table);
    const loaded = loadRoutingTable();
    expect(loaded).toEqual(table);
  });

  it('generates routing table from benchmarks and pricing', () => {
    const benchmarks: BridgeBenchCache = {
      scrapedAt: '2024-01-01T00:00:00.000Z',
      categories: {
        BS: [
          { model: 'model-a', category: 'BS', score: 80, rank: 1 },
          { model: 'model-b', category: 'BS', score: 90, rank: 2 }
        ]
      }
    };

    const pricing: OpenRouterCache = {
      fetchedAt: '2024-01-01T00:00:00.000Z',
      models: [
        { model: 'model-a', promptCostPer1k: 1, completionCostPer1k: 1, avgCostPer1k: 1 },
        { model: 'model-b', promptCostPer1k: 10, completionCostPer1k: 10, avgCostPer1k: 10 }
      ]
    };

    const availableModels = ['model-a', 'model-b'];
    const config = { minBenchmarkRank: 5, costCeilingPer1kTokens: 100 };

    const table = generateRoutingTable(benchmarks, pricing, availableModels, config);

    // model-a: 80 / $1 = 80 score/$, rank 1
    // model-b: 90 / $10 = 9 score/$, rank 2
    // model-a should win on score/$
    const rule = table.rules.find(r => r.skill === 'brainstorming' && r.domain === 'gui' && r.risk === 'low');
    expect(rule).toBeDefined();
    expect(rule!.model).toBe('model-a');
    expect(rule!.benchmarkScore).toBe(80);
    expect(rule!.costPer1k).toBe(1);
    expect(rule!.scorePerDollar).toBe(80);
  });

  it('fallback to highest-ranked when no model meets criteria', () => {
    const benchmarks: BridgeBenchCache = {
      scrapedAt: '2024-01-01T00:00:00.000Z',
      categories: {
        BS: [
          { model: 'model-a', category: 'BS', score: 80, rank: 1 },
          { model: 'model-b', category: 'BS', score: 90, rank: 2 }
        ]
      }
    };

    const pricing: OpenRouterCache = {
      fetchedAt: '2024-01-01T00:00:00.000Z',
      models: [
        { model: 'model-a', promptCostPer1k: 1, completionCostPer1k: 1, avgCostPer1k: 1 },
        { model: 'model-b', promptCostPer1k: 10, completionCostPer1k: 10, avgCostPer1k: 10 }
      ]
    };

    const availableModels = ['model-a', 'model-b'];
    // Set cost ceiling so low that no model qualifies on cost
    const config = { minBenchmarkRank: 5, costCeilingPer1kTokens: 0.5 };

    const table = generateRoutingTable(benchmarks, pricing, availableModels, config);

    // Fallback should pick highest benchmark score regardless of cost
    const rule = table.rules.find(r => r.skill === 'brainstorming' && r.domain === 'gui' && r.risk === 'low');
    expect(rule).toBeDefined();
    expect(rule!.model).toBe('model-b');
    expect(rule!.benchmarkScore).toBe(90);
  });

  it('looks up model by skill/domain/risk', () => {
    const table: RoutingTable = {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      sources: {
        benchmarks: 'BridgeBench (scraped 2024-01-01)',
        pricing: 'OpenRouter API (2024-01-01)'
      },
      rules: [
        {
          skill: 'brainstorming',
          domain: 'general',
          risk: 'low',
          model: 'openai/gpt-4o',
          scorePerDollar: 10.5,
          benchmarkScore: 88,
          costPer1k: 8.4,
          reason: 'Best score/$ for BS (88.0 / $8.4000)'
        },
        {
          skill: 'executing-plans',
          domain: 'backend',
          risk: 'high',
          model: 'anthropic/claude-opus-4',
          scorePerDollar: 5.2,
          benchmarkScore: 92,
          costPer1k: 17.7,
          reason: 'Best score/$ for Debugging (92.0 / $17.7000)'
        }
      ],
      projectDefaults: {}
    };

    expect(lookupModel(table, 'brainstorming', 'general', 'low')).toBe('openai/gpt-4o');
    expect(lookupModel(table, 'executing-plans', 'backend', 'high')).toBe('anthropic/claude-opus-4');
  });

  it('returns null for non-existent rule', () => {
    const table: RoutingTable = {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      sources: {
        benchmarks: 'BridgeBench (scraped 2024-01-01)',
        pricing: 'OpenRouter API (2024-01-01)'
      },
      rules: [
        {
          skill: 'brainstorming',
          domain: 'general',
          risk: 'low',
          model: 'openai/gpt-4o',
          scorePerDollar: 10.5,
          benchmarkScore: 88,
          costPer1k: 8.4,
          reason: 'Best score/$ for BS (88.0 / $8.4000)'
        }
      ],
      projectDefaults: {}
    };

    expect(lookupModel(table, 'reviewing', 'security', 'critical')).toBeNull();
    expect(lookupModel(table, 'brainstorming', 'general', 'high')).toBeNull();
  });

  it('returns null for malformed JSON table', async () => {
    await fs.mkdir(path.dirname(ROUTING_PATH), { recursive: true });
    await fs.writeFile(ROUTING_PATH, 'not valid json');
    const result = loadRoutingTable();
    expect(result).toBeNull();
  });

  it('rejects invalid routing paths', () => {
    expect(() => setRoutingPath('../etc/passwd')).toThrow('Invalid routing path');
    expect(() => setRoutingPath('/etc/passwd')).toThrow('Invalid routing path');
  });

  it('returns empty rules for empty benchmarks', () => {
    const benchmarks: BridgeBenchCache = {
      scrapedAt: '2024-01-01T00:00:00.000Z',
      categories: {}
    };
    const pricing: OpenRouterCache = {
      fetchedAt: '2024-01-01T00:00:00.000Z',
      models: [
        { model: 'model-a', promptCostPer1k: 1, completionCostPer1k: 1, avgCostPer1k: 1 }
      ]
    };
    const table = generateRoutingTable(benchmarks, pricing, ['model-a'], { minBenchmarkRank: 5, costCeilingPer1kTokens: 100 });
    expect(table.rules).toEqual([]);
  });

  it('returns empty rules for empty pricing', () => {
    const benchmarks: BridgeBenchCache = {
      scrapedAt: '2024-01-01T00:00:00.000Z',
      categories: {
        BS: [
          { model: 'model-a', category: 'BS', score: 80, rank: 1 }
        ]
      }
    };
    const pricing: OpenRouterCache = {
      fetchedAt: '2024-01-01T00:00:00.000Z',
      models: []
    };
    const table = generateRoutingTable(benchmarks, pricing, ['model-a'], { minBenchmarkRank: 5, costCeilingPer1kTokens: 100 });
    expect(table.rules).toEqual([]);
  });

  it('returns empty rules for empty availableModels', () => {
    const benchmarks: BridgeBenchCache = {
      scrapedAt: '2024-01-01T00:00:00.000Z',
      categories: {
        BS: [
          { model: 'model-a', category: 'BS', score: 80, rank: 1 }
        ]
      }
    };
    const pricing: OpenRouterCache = {
      fetchedAt: '2024-01-01T00:00:00.000Z',
      models: [
        { model: 'model-a', promptCostPer1k: 1, completionCostPer1k: 1, avgCostPer1k: 1 }
      ]
    };
    const table = generateRoutingTable(benchmarks, pricing, [], { minBenchmarkRank: 5, costCeilingPer1kTokens: 100 });
    expect(table.rules).toEqual([]);
  });

  it('filters out models with rank above minBenchmarkRank', () => {
    const benchmarks: BridgeBenchCache = {
      scrapedAt: '2024-01-01T00:00:00.000Z',
      categories: {
        BS: [
          { model: 'model-a', category: 'BS', score: 80, rank: 1 },
          { model: 'model-b', category: 'BS', score: 90, rank: 6 }
        ]
      }
    };
    const pricing: OpenRouterCache = {
      fetchedAt: '2024-01-01T00:00:00.000Z',
      models: [
        { model: 'model-a', promptCostPer1k: 1, completionCostPer1k: 1, avgCostPer1k: 1 },
        { model: 'model-b', promptCostPer1k: 1, completionCostPer1k: 1, avgCostPer1k: 1 }
      ]
    };
    const table = generateRoutingTable(benchmarks, pricing, ['model-a', 'model-b'], { minBenchmarkRank: 5, costCeilingPer1kTokens: 100 });
    const rule = table.rules.find(r => r.skill === 'brainstorming' && r.domain === 'gui' && r.risk === 'low');
    expect(rule).toBeDefined();
    expect(rule!.model).toBe('model-a');
  });

  it('filters out models with cost above costCeilingPer1kTokens', () => {
    const benchmarks: BridgeBenchCache = {
      scrapedAt: '2024-01-01T00:00:00.000Z',
      categories: {
        BS: [
          { model: 'model-a', category: 'BS', score: 80, rank: 1 },
          { model: 'model-b', category: 'BS', score: 90, rank: 2 }
        ]
      }
    };
    const pricing: OpenRouterCache = {
      fetchedAt: '2024-01-01T00:00:00.000Z',
      models: [
        { model: 'model-a', promptCostPer1k: 1, completionCostPer1k: 1, avgCostPer1k: 1 },
        { model: 'model-b', promptCostPer1k: 10, completionCostPer1k: 10, avgCostPer1k: 10 }
      ]
    };
    const table = generateRoutingTable(benchmarks, pricing, ['model-a', 'model-b'], { minBenchmarkRank: 5, costCeilingPer1kTokens: 5 });
    const rule = table.rules.find(r => r.skill === 'brainstorming' && r.domain === 'gui' && r.risk === 'low');
    expect(rule).toBeDefined();
    expect(rule!.model).toBe('model-a');
  });

  it('maps skill and domain to correct category', () => {
    expect(mapSkillDomainToCategory('executing-plans', 'backend')).toBe('Debugging');
    expect(mapSkillDomainToCategory('reviewing', 'security')).toBe('Security');
  });

  it('fallback test asserts costPer1k and scorePerDollar values', () => {
    const benchmarks: BridgeBenchCache = {
      scrapedAt: '2024-01-01T00:00:00.000Z',
      categories: {
        BS: [
          { model: 'model-a', category: 'BS', score: 80, rank: 1 },
          { model: 'model-b', category: 'BS', score: 90, rank: 2 }
        ]
      }
    };

    const pricing: OpenRouterCache = {
      fetchedAt: '2024-01-01T00:00:00.000Z',
      models: [
        { model: 'model-a', promptCostPer1k: 1, completionCostPer1k: 1, avgCostPer1k: 1 },
        { model: 'model-b', promptCostPer1k: 10, completionCostPer1k: 10, avgCostPer1k: 10 }
      ]
    };

    const availableModels = ['model-a', 'model-b'];
    const config = { minBenchmarkRank: 5, costCeilingPer1kTokens: 0.5 };

    const table = generateRoutingTable(benchmarks, pricing, availableModels, config);

    const rule = table.rules.find(r => r.skill === 'brainstorming' && r.domain === 'gui' && r.risk === 'low');
    expect(rule).toBeDefined();
    expect(rule!.model).toBe('model-b');
    expect(rule!.benchmarkScore).toBe(90);
    expect(rule!.costPer1k).toBe(10);
    expect(rule!.scorePerDollar).toBe(9);
  });
});
