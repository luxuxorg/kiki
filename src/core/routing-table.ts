import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'node:path';
import type { StaticRoutingTable, Skill, Domain, Risk } from '../types.js';

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
    if (!parsed || !parsed.rules || typeof parsed.rules !== 'object') {
      return null;
    }
    return parsed as StaticRoutingTable;
  } catch {
    return null;
  }
}

export function saveRoutingTable(table: StaticRoutingTable): void {
  const dir = path.dirname(ROUTING_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(ROUTING_PATH, JSON.stringify(table, null, 2));
}

export function lookupModel(
  table: StaticRoutingTable,
  skill: Skill,
  domain: Domain,
  risk: Risk
): string | null {
  const key = `${skill}:${domain}`;
  const rule = table.rules[key];
  if (!rule) return null;

  // If risk is critical and a critical model is explicitly defined, use it
  if (risk === 'critical' && rule.critical) {
    return rule.critical;
  }

  // Otherwise fall back to standard
  return rule.standard ?? null;
}

export function mergeRoutingTables(
  project: StaticRoutingTable | null,
  global: StaticRoutingTable | null
): StaticRoutingTable {
  const result: StaticRoutingTable = { rules: {} };

  if (global) {
    Object.assign(result.rules, global.rules);
  }

  if (project) {
    Object.assign(result.rules, project.rules);
  }

  return result;
}
