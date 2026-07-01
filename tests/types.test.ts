import { describe, it, expect } from 'vitest';
import type { Skill, StaticRoutingTable, KikiConfig, RoutingLogEntry } from '../src/types';

describe('types', () => {
  it('Skill covers the supported skill set', () => {
    const skills: Skill[] = [
      'brainstorming',
      'writing-plans',
      'executing-plans',
      'reviewing',
      'documenting',
    ];
    expect(skills).toHaveLength(5);
  });

  it('StaticRoutingTable is an agents-only map', () => {
    const table: StaticRoutingTable = {
      agents: {
        'kiki-orchestrator': 'anthropic/claude-opus-4-8',
        'kiki-implementer': 'deepseek/deepseek-v4-pro',
      },
    };
    expect(table.agents['kiki-orchestrator']).toBe('anthropic/claude-opus-4-8');
  });

  it('KikiConfig has no riskMatrix', () => {
    const config: KikiConfig = {
      projectName: 'test',
      language: 'typescript',
      commands: { build: 'npm run build', test: 'npm test', lint: 'npm run lint', security: 'npm audit' },
    };
    expect(config.projectName).toBe('test');
    expect((config as unknown as Record<string, unknown>).riskMatrix).toBeUndefined();
  });

  it('RoutingLogEntry carries only timestamp, agent, model', () => {
    const entry: RoutingLogEntry = {
      timestamp: '2026-07-01T00:00:00.000Z',
      agent: 'kiki-implementer',
      model: 'deepseek/deepseek-v4-pro',
    };
    const keys = Object.keys(entry).sort();
    expect(keys).toEqual(['agent', 'model', 'timestamp']);
  });
});
