import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'node:path';
import type { StaticRoutingTable, Skill, Domain, Risk } from '../types.js';

export let ROUTING_PATH = '.agentic/routing.json';

export function setRoutingPath(newPath: string): void {
  if (newPath.includes('..') || newPath.startsWith('/')) {
    throw new Error('Invalid routing path');
  }
  ROUTING_PATH = newPath;
}

export function loadRoutingTable(): StaticRoutingTable | null {
  if (!existsSync(ROUTING_PATH)) return null;
  try {
    const raw = readFileSync(ROUTING_PATH, 'utf-8');
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
