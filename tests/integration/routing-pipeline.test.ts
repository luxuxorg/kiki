import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rmSync, writeFileSync, mkdirSync, readFileSync, appendFileSync, existsSync } from 'fs';
import path from 'node:path';
import {
  loadRoutingTable,
  saveRoutingTable,
  lookupAgentModel,
  setRoutingPath,
} from '../../src/core/routing-table';
import type { RoutingLogEntry, StaticRoutingTable } from '../../src/types';

const LOG_PATH = '.agentic/routing_log.jsonl';

/**
 * Mirrors the thin plugin's logging behaviour: append a simplified
 * RoutingLogEntry ({ timestamp, agent, model }) for a dispatched kiki subagent.
 */
function logRouting(agent: string, model: string): void {
  if (!existsSync('.agentic')) mkdirSync('.agentic', { recursive: true });
  const entry: RoutingLogEntry = {
    timestamp: new Date().toISOString(),
    agent,
    model,
  };
  appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
}

describe('routing pipeline integration', () => {
  let tmpDir: string;
  let routingPath: string;

  const table: StaticRoutingTable = {
    agents: {
      'kiki-orchestrator': 'anthropic/claude-opus-4-8',
      'kiki-implementer': 'deepseek/deepseek-v4-pro',
      'kiki-brainstormer': 'kimi/kimi-k2.6',
      'kiki-reviewer': 'deepseek/deepseek-v4-pro',
    },
  };

  beforeEach(() => {
    tmpDir = `tmp/routing-pipeline-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    mkdirSync(tmpDir, { recursive: true });
    routingPath = path.join(tmpDir, 'routing.json');
    setRoutingPath(routingPath);
    saveRoutingTable(routingPath, table);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(LOG_PATH, { force: true });
    setRoutingPath('.agentic/kiki/routing.json');
  });

  it('looks up the model for kiki-orchestrator', () => {
    const loaded = loadRoutingTable(routingPath)!;
    expect(lookupAgentModel(loaded, 'kiki-orchestrator')).toBe(
      'anthropic/claude-opus-4-8'
    );
  });

  it('looks up the model for kiki-implementer', () => {
    const loaded = loadRoutingTable(routingPath)!;
    expect(lookupAgentModel(loaded, 'kiki-implementer')).toBe(
      'deepseek/deepseek-v4-pro'
    );
  });

  it('returns null for an unknown agent', () => {
    const loaded = loadRoutingTable(routingPath)!;
    expect(lookupAgentModel(loaded, 'kiki-gui-designer')).toBeNull();
  });

  it('returns null when the routing table is missing', () => {
    rmSync(routingPath);
    expect(loadRoutingTable(routingPath)).toBeNull();
  });

  it('writes routing log entries containing timestamp, agent, model', () => {
    const loaded = loadRoutingTable(routingPath)!;
    const agent = 'kiki-implementer';
    const model = lookupAgentModel(loaded, agent)!;
    logRouting(agent, model);

    const entries = readFileSync(LOG_PATH, 'utf-8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as RoutingLogEntry);

    expect(entries).toHaveLength(1);
    const entry = entries[0];
    const keys = Object.keys(entry).sort();
    expect(keys).toEqual(['agent', 'model', 'timestamp']);
    expect(entry.agent).toBe('kiki-implementer');
    expect(entry.model).toBe('deepseek/deepseek-v4-pro');
    expect(typeof entry.timestamp).toBe('string');
  });

  it('routing log entries carry no domain or risk fields', () => {
    const loaded = loadRoutingTable(routingPath)!;
    const agent = 'kiki-brainstormer';
    logRouting(agent, lookupAgentModel(loaded, agent)!);

    const entries = readFileSync(LOG_PATH, 'utf-8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    for (const entry of entries) {
      expect(entry.domain).toBeUndefined();
      expect(entry.risk).toBeUndefined();
    }
  });
});
