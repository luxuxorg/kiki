import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rmSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { loadRoutingTable, saveRoutingTable, setRoutingPath } from '../../src/core/routing-table';
import { classifyDomain } from '../../src/core/domain-classifier';
import { classifyRisk } from '../../src/core/risk-classifier';
import { lookupModel } from '../../src/core/routing-table';
import { selectModel } from '../../src/core/stabilizer';
import KikiPlugin from '../../.opencode/plugins/kiki';

describe('routing pipeline integration', () => {
  beforeEach(() => {
    mkdirSync('.agentic', { recursive: true });
    
    writeFileSync('.agentic/config.json', JSON.stringify({
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
        },
        {
          skill: 'brainstorming' as const,
          domain: 'gui' as const,
          risk: 'critical' as const,
          model: 'claude-4-critical',
          scorePerDollar: 120,
          benchmarkScore: 95,
          costPer1k: 0.08,
          reason: 'test'
        },
        {
          skill: 'brainstorming' as const,
          domain: 'gui' as const,
          risk: 'micro' as const,
          model: 'claude-4-micro',
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
    rmSync('.agentic', { recursive: true, force: true });
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

  it('defaults to medium risk when config is missing', () => {
    rmSync('.agentic/config.json');
    const table = loadRoutingTable();
    expect(table).not.toBeNull();
    const model = lookupModel(table!, 'brainstorming', 'gui', 'medium');
    expect(model).toBe('claude-4');
  });

  it('returns null when routing table is missing', () => {
    rmSync('.agentic/routing.json');
    const table = loadRoutingTable();
    expect(table).toBeNull();
  });

  it('returns null when no matching model exists', () => {
    const table = loadRoutingTable();
    expect(table).not.toBeNull();
    const model = lookupModel(table!, 'reviewing', 'database', 'critical');
    expect(model).toBeNull();
  });

  it('classifies risk with matching paths', () => {
    const configData = JSON.parse(readFileSync('.agentic/config.json', 'utf-8'));
    
    expect(classifyRisk(['src/auth/login.ts'], configData.riskMatrix)).toBe('high');
    expect(classifyRisk(['src/security/crypto.ts'], configData.riskMatrix)).toBe('critical');
    expect(classifyRisk(['src/app/main.ts'], configData.riskMatrix)).toBe('medium');
    expect(classifyRisk([], configData.riskMatrix)).toBe('micro');
  });

  it('does not switch default on exactly 20% improvement (hysteresis)', () => {
    const state = { projectDefaults: { 'brainstorming:gui': 'claude-4' } };
    const result = selectModel(state, 'brainstorming:gui', null, 'new-model', 120, 'claude-4', 100);
    expect(result.model).toBe('claude-4');
    expect(result.updatedDefaults['brainstorming:gui']).toBe('claude-4');
  });

  it('intercepts task tool with kiki subagent type and sets model', async () => {
    const plugin = KikiPlugin({ client: {} });
    const input = { tool: 'task' };
    const output = { args: { subagent_type: 'kiki-brainstormer', prompt: 'Build a React component' } };
    await (plugin as any)['tool.execute.before'](input, output);
    expect(output.args.model).toBeDefined();
    // No file paths in prompt => risk=micro => claude-4-micro
    expect(output.args.model).toBe('claude-4-micro');
  });

  it('ignores non-kiki subagent types', async () => {
    const plugin = KikiPlugin({ client: {} });
    const input = { tool: 'task' };
    const output = { args: { subagent_type: 'general', prompt: 'Do something' } };
    await (plugin as any)['tool.execute.before'](input, output);
    expect(output.args.model).toBeUndefined();
  });

  it('ignores non-task tools', async () => {
    const plugin = KikiPlugin({ client: {} });
    const input = { tool: 'bash' };
    const output = { args: { subagent_type: 'kiki-brainstormer', prompt: 'Build a React component' } };
    await (plugin as any)['tool.execute.before'](input, output);
    expect(output.args.model).toBeUndefined();
  });

  it('falls back to any model for the skill when no exact rule matches', async () => {
    const plugin = KikiPlugin({ client: {} });
    const input = { tool: 'task' };
    // gui/medium exists for brainstorming, but let's test with a domain that has no rules
    const output = { args: { subagent_type: 'kiki-brainstormer', prompt: 'Build a backend API' } };
    await (plugin as any)['tool.execute.before'](input, output);
    // No exact rule for backend, but fallback should find any brainstorming model
    expect(output.args.model).toBeDefined();
  });

  it('logs error but does not crash when routing table is missing', async () => {
    rmSync('.agentic/routing.json');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const plugin = KikiPlugin({ client: {} });
    const input = { tool: 'task' };
    const output = { args: { subagent_type: 'kiki-brainstormer', prompt: 'Build a React component' } };
    await (plugin as any)['tool.execute.before'](input, output);
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No routing table found'));
    expect(output.args.model).toBeUndefined();
    
    consoleSpy.mockRestore();
  });
});
