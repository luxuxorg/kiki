import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'node:path';
import type { StaticRoutingTable } from '../types.js';

export let ROUTING_PATH = '.agentic/kiki/routing.json';

export function setRoutingPath(newPath: string): void {
  if (newPath.includes('..') || newPath.startsWith('/')) {
    throw new Error('Invalid routing path');
  }
  ROUTING_PATH = newPath;
}

export function loadRoutingTable(filePath?: string): StaticRoutingTable | null {
  const targetPath = filePath ?? ROUTING_PATH;
  if (!existsSync(targetPath)) return null;
  try {
    const raw = readFileSync(targetPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed?.agents || typeof parsed.agents !== 'object') {
      return null;
    }
    return { agents: parsed.agents } as StaticRoutingTable;
  } catch {
    return null;
  }
}

export function saveRoutingTable(filePath: string, table: StaticRoutingTable): void {
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(table, null, 2));
}

export function lookupAgentModel(
  table: StaticRoutingTable,
  agentName: string
): string | null {
  return table.agents[agentName] ?? null;
}

export function mergeRoutingTables(
  project: StaticRoutingTable | null,
  global: StaticRoutingTable | null
): StaticRoutingTable {
  const result: StaticRoutingTable = { agents: {} };
  if (global) {
    Object.assign(result.agents, global.agents);
  }
  if (project) {
    Object.assign(result.agents, project.agents);
  }
  return result;
}
