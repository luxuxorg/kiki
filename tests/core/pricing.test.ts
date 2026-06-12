import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  loadPricingCache,
  savePricingCache,
  getModelPricing,
  setPricingCachePath
} from '../../src/core/pricing';
import type { OpenRouterCache } from '../../src/types';

describe('pricing', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kiki-pricing-test-'));
    setPricingCachePath(path.join(tmpDir, '.agentic/cache/openrouter_pricing.json'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('loads null when cache missing', () => {
    const result = loadPricingCache();
    expect(result).toBeNull();
  });

  it('saves and loads pricing cache', () => {
    const cache: OpenRouterCache = {
      fetchedAt: new Date().toISOString(),
      models: [
        { model: 'anthropic/claude-opus-4', promptCostPer1k: 15, completionCostPer1k: 75, avgCostPer1k: 45 }
      ]
    };
    savePricingCache(cache);
    const loaded = loadPricingCache();
    expect(loaded).toEqual(cache);
  });

  it('gets pricing for model', () => {
    const cache: OpenRouterCache = {
      fetchedAt: new Date().toISOString(),
      models: [
        { model: 'anthropic/claude-opus-4', promptCostPer1k: 15, completionCostPer1k: 75, avgCostPer1k: 45 },
        { model: 'openai/gpt-4o', promptCostPer1k: 5, completionCostPer1k: 15, avgCostPer1k: 10 }
      ]
    };
    const pricing = getModelPricing(cache, 'anthropic/claude-opus-4');
    expect(pricing).not.toBeNull();
    expect(pricing!.promptCostPer1k).toBe(15);
    expect(pricing!.completionCostPer1k).toBe(75);
    expect(pricing!.avgCostPer1k).toBe(45);
  });

  it('returns null for missing model', () => {
    const cache: OpenRouterCache = {
      fetchedAt: new Date().toISOString(),
      models: [
        { model: 'anthropic/claude-opus-4', promptCostPer1k: 15, completionCostPer1k: 75, avgCostPer1k: 45 }
      ]
    };
    expect(getModelPricing(cache, 'missing-model')).toBeNull();
  });
});
