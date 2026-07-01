import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rmSync, writeFileSync, mkdirSync } from 'fs';
import path from 'node:path';
import {
  loadRoutingTable,
  saveRoutingTable,
  lookupAgentModel,
  setRoutingPath,
  mergeRoutingTables,
} from '../../src/core/routing-table';
import type { StaticRoutingTable } from '../../src/types';

describe('routing-table', () => {
  let tmpDir: string;
  let routingPath: string;

  const testTable: StaticRoutingTable = {
    agents: {
      'kiki-orchestrator': 'anthropic/claude-opus-4-8',
      'kiki-implementer': 'deepseek/deepseek-v4-pro',
      'kiki-brainstormer': 'kimi/kimi-k2.6',
    },
  };

  beforeEach(() => {
    tmpDir = `tmp/routing-table-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    mkdirSync(tmpDir, { recursive: true });
    routingPath = path.join(tmpDir, 'routing.json');
    setRoutingPath(routingPath);
    saveRoutingTable(routingPath, testTable);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    setRoutingPath('.agentic/kiki/routing.json');
  });

  it('loads and saves an agents-only routing table', () => {
    const loaded = loadRoutingTable();
    expect(loaded).not.toBeNull();
    expect(loaded!.agents['kiki-implementer']).toBe('deepseek/deepseek-v4-pro');
  });

  it('looks up the model for a known agent', () => {
    const loaded = loadRoutingTable()!;
    const model = lookupAgentModel(loaded, 'kiki-brainstormer');
    expect(model).toBe('kimi/kimi-k2.6');
  });

  it('returns null for an unknown agent', () => {
    const loaded = loadRoutingTable()!;
    const model = lookupAgentModel(loaded, 'kiki-unknown');
    expect(model).toBeNull();
  });

  it('returns null when routing table does not exist', () => {
    rmSync(routingPath);
    const loaded = loadRoutingTable();
    expect(loaded).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    writeFileSync(routingPath, 'not json');
    const loaded = loadRoutingTable();
    expect(loaded).toBeNull();
  });

  it('returns null for tables with only rules (no agents)', () => {
    writeFileSync(
      routingPath,
      JSON.stringify({ rules: { 'brainstorming:gui': { standard: 'claude-4' } } })
    );
    const loaded = loadRoutingTable();
    expect(loaded).toBeNull();
  });
});

describe('mergeRoutingTables', () => {
  it('project agents override global agents', () => {
    const global: StaticRoutingTable = {
      agents: { 'kiki-planner': 'global-planner' },
    };
    const project: StaticRoutingTable = {
      agents: { 'kiki-planner': 'project-planner' },
    };
    const merged = mergeRoutingTables(project, global);
    expect(merged.agents['kiki-planner']).toBe('project-planner');
  });

  it('fills missing project agents from global', () => {
    const global: StaticRoutingTable = {
      agents: { 'kiki-brainstormer': 'global-brainstormer' },
    };
    const project: StaticRoutingTable = { agents: {} };
    const merged = mergeRoutingTables(project, global);
    expect(merged.agents['kiki-brainstormer']).toBe('global-brainstormer');
  });

  it('preserves project-only agents', () => {
    const global: StaticRoutingTable = { agents: {} };
    const project: StaticRoutingTable = {
      agents: { 'kiki-reviewer': 'project-reviewer' },
    };
    const merged = mergeRoutingTables(project, global);
    expect(merged.agents['kiki-reviewer']).toBe('project-reviewer');
  });

  it('handles null inputs', () => {
    const merged = mergeRoutingTables(null, null);
    expect(merged.agents).toEqual({});
  });
});
