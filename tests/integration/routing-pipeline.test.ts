import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rmSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { loadRoutingTable, saveRoutingTable, setRoutingPath } from '../../src/core/routing-table';
import { classifyDomain } from '../../src/core/domain-classifier';
import { classifyRisk } from '../../src/core/risk-classifier';
import { lookupModel } from '../../src/core/routing-table';
import KikiPlugin from '../../.opencode/plugins/kiki';

describe('routing pipeline integration', () => {
  beforeEach(() => {
    setRoutingPath('.agentic/kiki/routing.json');
    mkdirSync('.agentic/kiki', { recursive: true });

    writeFileSync('.agentic/kiki/config.json', JSON.stringify({
      riskMatrix: {
        highRiskPaths: ['src/auth/'],
        criticalRiskPaths: ['src/security/']
      }
    }));

    const table = {
      rules: {
        'brainstorming:gui': { standard: 'claude-4' },
        'brainstorming:security': { standard: 'deepseek-v4-pro', critical: 'claude-4-critical' },
        'reviewing:backend': { standard: 'deepseek-v4-pro' }
      }
    };
    saveRoutingTable(table);
  });

  afterEach(() => {
    rmSync('.agentic', { recursive: true, force: true });
    setRoutingPath('.agentic/kiki/routing.json');
  });

  it('classifies domain and looks up standard model', () => {
    const domain = classifyDomain('Build a React modal component');
    expect(domain).toBe('gui');

    const table = loadRoutingTable();
    expect(table).not.toBeNull();
    const model = lookupModel(table!, 'brainstorming', domain, 'standard');
    expect(model).toBe('claude-4');
  });

  it('uses standard when critical not defined for that skill+domain', () => {
    const table = loadRoutingTable()!;
    const model = lookupModel(table, 'brainstorming', 'gui', 'critical');
    expect(model).toBe('claude-4');
  });

  it('uses critical model when defined and risk is critical', () => {
    const table = loadRoutingTable()!;
    const model = lookupModel(table, 'brainstorming', 'security', 'critical');
    expect(model).toBe('claude-4-critical');
  });

  it('returns null when routing table is missing', () => {
    rmSync('.agentic/kiki/routing.json');
    const table = loadRoutingTable();
    expect(table).toBeNull();
  });

  it('returns null when no matching model exists', () => {
    const table = loadRoutingTable()!;
    const model = lookupModel(table, 'executing-plans', 'database', 'standard');
    expect(model).toBeNull();
  });

  it('classifies risk with only standard/critical', () => {
    const configData = JSON.parse(readFileSync('.agentic/kiki/config.json', 'utf-8'));

    expect(classifyRisk(['src/auth/login.ts'], configData.riskMatrix)).toBe('standard');
    expect(classifyRisk(['src/security/crypto.ts'], configData.riskMatrix)).toBe('critical');
    expect(classifyRisk(['src/app/main.ts'], configData.riskMatrix)).toBe('standard');
    expect(classifyRisk([], configData.riskMatrix)).toBe('standard');
  });

  it('intercepts task tool with kiki subagent type and logs model', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const plugin = KikiPlugin({ client: {} });
    const input = { tool: 'task' };
    const output = { args: { subagent_type: 'kiki-brainstormer', prompt: 'Build a React component' } };
    await (plugin as any)['tool.execute.before'](input, output);
    // gui + no file paths -> standard -> claude-4
    const logs = logSpy.mock.calls.map((c: any) => c[0]).join('\n');
    expect(logs).toContain('claude-4');
    expect(logs).toContain('brainstorming');
    expect(logs).toContain('gui');
    logSpy.mockRestore();
  });

  it('uses critical model for security paths', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const plugin = KikiPlugin({ client: {} });
    const input = { tool: 'task' };
    const output = { args: { subagent_type: 'kiki-brainstormer', prompt: 'Fix src/security/crypto.ts encryption' } };
    await (plugin as any)['tool.execute.before'](input, output);
    const logs = logSpy.mock.calls.map((c: any) => c[0]).join('\n');
    expect(logs).toContain('claude-4-critical');
    logSpy.mockRestore();
  });

  it('ignores non-kiki subagent types', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const plugin = KikiPlugin({ client: {} });
    const input = { tool: 'task' };
    const output = { args: { subagent_type: 'general', prompt: 'Do something' } };
    await (plugin as any)['tool.execute.before'](input, output);
    const logs = logSpy.mock.calls.map((c: any) => c[0]).join('\n');
    expect(logs).not.toContain('[Kiki] Routed');
    logSpy.mockRestore();
  });

  it('ignores non-task tools', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const plugin = KikiPlugin({ client: {} });
    const input = { tool: 'bash' };
    const output = { args: { subagent_type: 'kiki-brainstormer', prompt: 'Build a React component' } };
    await (plugin as any)['tool.execute.before'](input, output);
    const logs = logSpy.mock.calls.map((c: any) => c[0]).join('\n');
    expect(logs).not.toContain('[Kiki] Routed');
    logSpy.mockRestore();
  });

  it('falls back to any model for the skill when no exact rule matches', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const plugin = KikiPlugin({ client: {} });
    const input = { tool: 'task' };
    const output = { args: { subagent_type: 'kiki-brainstormer', prompt: 'Build a backend API' } };
    await (plugin as any)['tool.execute.before'](input, output);
    const logs = logSpy.mock.calls.map((c: any) => c[0]).join('\n');
    expect(logs).toContain('claude-4');
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('logs error but does not crash when routing table is missing', async () => {
    rmSync('.agentic/kiki/routing.json');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const plugin = KikiPlugin({ client: {} });
    const input = { tool: 'task' };
    const output = { args: { subagent_type: 'kiki-brainstormer', prompt: 'Build a React component' } };
    await (plugin as any)['tool.execute.before'](input, output);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No routing table found'));

    consoleSpy.mockRestore();
  });
});
