import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { loadRoutingTable, saveRoutingTable, setRoutingPath } from '../../src/core/routing-table';
import { classifyDomain } from '../../src/core/domain-classifier';
import { lookupModel } from '../../src/core/routing-table';

describe('routing pipeline integration', () => {
  let tmpDir: string;
  
  beforeEach(() => {
    tmpDir = `tmp/integration-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    mkdirSync(join(tmpDir, '.agentic'), { recursive: true });
    setRoutingPath(join(tmpDir, '.agentic', 'routing.json'));
    
    writeFileSync(join(tmpDir, '.agentic', 'config.json'), JSON.stringify({
      riskMatrix: {
        highRiskPaths: ['src/auth/'],
        criticalRiskPaths: ['src/security/']
      },
      routingPreferences: {
        minBenchmarkRank: 20,
        costCeilingPer1kTokens: 1.0
      }
    }));

    const table = {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      sources: { benchmarks: '', pricing: '' },
      rules: [
        {
          skill: 'brainstorming' as const,
          domain: 'gui' as const,
          risk: 'medium' as const,
          model: 'claude-4',
          scorePerDollar: 100,
          benchmarkScore: 90,
          costPer1k: 0.05,
          reason: 'test'
        }
      ],
      projectDefaults: {}
    };
    saveRoutingTable(table);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    setRoutingPath('.agentic/routing.json');
  });

  it('classifies domain and looks up model', () => {
    const domain = classifyDomain('Build a React modal component');
    expect(domain).toBe('gui');
    
    const table = loadRoutingTable();
    expect(table).not.toBeNull();
    const model = lookupModel(table!, 'brainstorming', domain, 'medium');
    expect(model).toBe('claude-4');
  });
});
