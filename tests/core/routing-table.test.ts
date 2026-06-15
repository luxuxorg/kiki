import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rmSync, writeFileSync, mkdirSync } from 'fs';
import path from 'node:path';
import { loadRoutingTable, saveRoutingTable, lookupModel, setRoutingPath } from '../../src/core/routing-table';
import type { StaticRoutingTable } from '../../src/types';

describe('routing-table', () => {
  let tmpDir: string;

  const testTable: StaticRoutingTable = {
    rules: {
      'brainstorming:gui': { standard: 'claude-sonnet-4.6' },
      'brainstorming:backend': { standard: 'kimi-k2.6' },
      'brainstorming:security': { standard: 'deepseek-v4-pro', critical: 'claude-opus-4' },
      'executing-plans:gui': { standard: 'claude-sonnet-4.6' },
    }
  };

  beforeEach(() => {
    tmpDir = `tmp/routing-table-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    mkdirSync(tmpDir, { recursive: true });
    setRoutingPath(path.join(tmpDir, 'routing.json'));
    saveRoutingTable(testTable);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    setRoutingPath('.agentic/routing.json');
  });

  it('loads and saves a static routing table', () => {
    const loaded = loadRoutingTable();
    expect(loaded).not.toBeNull();
    expect(loaded!.rules['brainstorming:gui'].standard).toBe('claude-sonnet-4.6');
  });

  it('looks up standard model for a skill+domain', () => {
    const loaded = loadRoutingTable()!;
    const model = lookupModel(loaded, 'brainstorming', 'gui', 'standard');
    expect(model).toBe('claude-sonnet-4.6');
  });

  it('returns critical model when defined and risk is critical', () => {
    const loaded = loadRoutingTable()!;
    const model = lookupModel(loaded, 'brainstorming', 'security', 'critical');
    expect(model).toBe('claude-opus-4');
  });

  it('falls back to standard when critical is not defined', () => {
    const loaded = loadRoutingTable()!;
    const model = lookupModel(loaded, 'brainstorming', 'gui', 'critical');
    expect(model).toBe('claude-sonnet-4.6');
  });

  it('returns null for unknown skill+domain', () => {
    const loaded = loadRoutingTable()!;
    const model = lookupModel(loaded, 'reviewing', 'database', 'standard');
    expect(model).toBeNull();
  });

  it('returns null when routing table does not exist', () => {
    rmSync(path.join(tmpDir, 'routing.json'));
    const loaded = loadRoutingTable();
    expect(loaded).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    writeFileSync(path.join(tmpDir, 'routing.json'), 'not json');
    const loaded = loadRoutingTable();
    expect(loaded).toBeNull();
  });

  it('returns null for JSON without rules key', () => {
    writeFileSync(path.join(tmpDir, 'routing.json'), JSON.stringify({ foo: 'bar' }));
    const loaded = loadRoutingTable();
    expect(loaded).toBeNull();
  });
});
