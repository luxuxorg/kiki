import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'node:path';
import type { BridgeBenchCache, BenchmarkScore } from '../types';

export let CACHE_PATH = '.agentic/cache/bridgebench.json';

export function setBenchmarkCachePath(newPath: string): void {
  if (newPath.includes('..') || newPath.startsWith('/')) {
    throw new Error('Invalid cache path');
  }
  CACHE_PATH = newPath;
}

export function loadBenchmarkCache(): BridgeBenchCache | null {
  if (!existsSync(CACHE_PATH)) return null;
  const raw = readFileSync(CACHE_PATH, 'utf-8');
  try {
    return JSON.parse(raw) as BridgeBenchCache;
  } catch {
    return null;
  }
}

export function saveBenchmarkCache(cache: BridgeBenchCache): void {
  const dir = path.dirname(CACHE_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

export function getBridgeBenchScore(cache: BridgeBenchCache, model: string, category: string): number | null {
  const scores = cache.categories[category];
  if (!scores) return null;
  const entry = scores.find(s => s.model === model);
  return entry?.score ?? null;
}

export function getBenchmarkRank(cache: BridgeBenchCache, model: string, category: string): number | null {
  const scores = cache.categories[category];
  if (!scores) return null;
  const entry = scores.find(s => s.model === model);
  return entry?.rank ?? null;
}

// Placeholder for actual scraping logic
export async function scrapeBridgeBench(): Promise<BridgeBenchCache> {
  // TODO: Implement actual scraping when BridgeBench API is available
  // For now, return empty structure
  return {
    scrapedAt: new Date().toISOString(),
    categories: {}
  };
}
