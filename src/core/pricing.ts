import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'node:path';
import type { OpenRouterCache, PricingData } from '../types';

export let CACHE_PATH = '.agentic/cache/openrouter_pricing.json';
const OPENROUTER_API = 'https://openrouter.ai/api/v1/models';

export function setPricingCachePath(newPath: string): void {
  CACHE_PATH = newPath;
}

export function loadPricingCache(): OpenRouterCache | null {
  if (!existsSync(CACHE_PATH)) return null;
  const raw = readFileSync(CACHE_PATH, 'utf-8');
  return JSON.parse(raw) as OpenRouterCache;
}

export function savePricingCache(cache: OpenRouterCache): void {
  const dir = path.dirname(CACHE_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

export function getModelPricing(cache: OpenRouterCache, model: string): PricingData | null {
  return cache.models.find(m => m.model === model) ?? null;
}

export async function fetchOpenRouterPricing(): Promise<OpenRouterCache> {
  try {
    const response = await fetch(OPENROUTER_API);
    if (!response.ok) {
      throw new Error(`OpenRouter API returned ${response.status}`);
    }
    const data = await response.json();

    const models: PricingData[] = data.data.map((m: any) => ({
      model: m.id,
      promptCostPer1k: m.pricing?.prompt ? parseFloat(m.pricing.prompt) * 1000 : 0,
      completionCostPer1k: m.pricing?.completion ? parseFloat(m.pricing.completion) * 1000 : 0,
      avgCostPer1k: m.pricing?.prompt && m.pricing?.completion
        ? ((parseFloat(m.pricing.prompt) + parseFloat(m.pricing.completion)) / 2) * 1000
        : parseFloat(m.pricing?.prompt ?? '0') * 1000
    }));

    const cache: OpenRouterCache = {
      fetchedAt: new Date().toISOString(),
      models
    };

    savePricingCache(cache);
    return cache;
  } catch (error) {
    console.warn('Failed to fetch OpenRouter pricing:', error);
    return loadPricingCache() ?? { fetchedAt: new Date().toISOString(), models: [] };
  }
}
