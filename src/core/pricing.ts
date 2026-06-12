import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'node:path';
import type { OpenRouterCache, PricingData } from '../types.js';

export let CACHE_PATH = '.agentic/cache/openrouter_pricing.json';
const OPENROUTER_API = 'https://openrouter.ai/api/v1/models';

export function setPricingCachePath(newPath: string): void {
  if (newPath.includes('..') || newPath.startsWith('/')) {
    throw new Error('Invalid cache path');
  }
  CACHE_PATH = newPath;
}

export function loadPricingCache(): OpenRouterCache | null {
  if (!existsSync(CACHE_PATH)) return null;
  const raw = readFileSync(CACHE_PATH, 'utf-8');
  try {
    return JSON.parse(raw) as OpenRouterCache;
  } catch {
    return null;
  }
}

export function savePricingCache(cache: OpenRouterCache): void {
  const dir = path.dirname(CACHE_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

export function getModelPricing(cache: OpenRouterCache, model: string): PricingData | null {
  return cache.models.find((m: PricingData) => m.model === model) ?? null;
}

interface OpenRouterModel {
  id: string;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
}

export async function fetchOpenRouterPricing(): Promise<OpenRouterCache> {
  try {
    const response = await fetch(OPENROUTER_API, {
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) {
      throw new Error(`OpenRouter API returned ${response.status}`);
    }
    const data = await response.json();

    if (!data || !Array.isArray(data.data)) {
      throw new Error('Unexpected OpenRouter API response structure');
    }

    const models: PricingData[] = (data.data as OpenRouterModel[])
      .map((m) => {
        const promptPrice = m.pricing?.prompt ? parseFloat(m.pricing.prompt) : 0;
        const completionPrice = m.pricing?.completion ? parseFloat(m.pricing.completion) : 0;
        if (isNaN(promptPrice) || isNaN(completionPrice)) {
          return null;
        }
        return {
          model: m.id,
          promptCostPer1k: promptPrice * 1000,
          completionCostPer1k: completionPrice * 1000,
          avgCostPer1k: m.pricing?.prompt && m.pricing?.completion
            ? ((promptPrice + completionPrice) / 2) * 1000
            : promptPrice * 1000
        };
      })
      .filter((m): m is PricingData => m !== null);

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
