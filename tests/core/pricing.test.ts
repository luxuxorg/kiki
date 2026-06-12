import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  loadPricingCache,
  savePricingCache,
  getModelPricing,
  setPricingCachePath,
  fetchOpenRouterPricing,
  CACHE_PATH
} from '../../src/core/pricing';
import type { OpenRouterCache } from '../../src/types';

describe('pricing', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = `tmp/pricing-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await fs.mkdir(tmpDir, { recursive: true });
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

  it('returns null for malformed JSON cache', async () => {
    await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
    await fs.writeFile(CACHE_PATH, 'not valid json');
    const result = loadPricingCache();
    expect(result).toBeNull();
  });

  it('rejects invalid cache paths', () => {
    expect(() => setPricingCachePath('../etc/passwd')).toThrow('Invalid cache path');
    expect(() => setPricingCachePath('/etc/passwd')).toThrow('Invalid cache path');
  });

  it('handles NaN pricing values gracefully', async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { id: 'good-model', pricing: { prompt: '0.01', completion: '0.02' } },
            { id: 'bad-model', pricing: { prompt: 'invalid', completion: '0.02' } },
            { id: 'bad-model2', pricing: { prompt: '0.01', completion: 'invalid' } }
          ]
        })
      } as Response)
    );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;
    try {
      const result = await fetchOpenRouterPricing();
      expect(result.models).toHaveLength(1);
      expect(result.models[0].model).toBe('good-model');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('falls back to empty cache on fetch network failure', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn(() => Promise.reject(new Error('Network error')));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = await fetchOpenRouterPricing();
      expect(result.models).toEqual([]);
      expect(result.fetchedAt).toBeDefined();
      expect(warnSpy).toHaveBeenCalledWith(
        'Failed to fetch OpenRouter pricing:',
        expect.any(Error)
      );
    } finally {
      global.fetch = originalFetch;
      warnSpy.mockRestore();
    }
  });

  it('falls back to empty cache on non-ok API response (HTTP 500)', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500
      } as Response)
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = await fetchOpenRouterPricing();
      expect(result.models).toEqual([]);
      expect(result.fetchedAt).toBeDefined();
      expect(warnSpy).toHaveBeenCalledWith(
        'Failed to fetch OpenRouter pricing:',
        expect.any(Error)
      );
    } finally {
      global.fetch = originalFetch;
      warnSpy.mockRestore();
    }
  });

  it('falls back to empty cache on invalid API response structure', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({})
      } as Response)
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = await fetchOpenRouterPricing();
      expect(result.models).toEqual([]);
      expect(result.fetchedAt).toBeDefined();
      expect(warnSpy).toHaveBeenCalledWith(
        'Failed to fetch OpenRouter pricing:',
        expect.any(Error)
      );
    } finally {
      global.fetch = originalFetch;
      warnSpy.mockRestore();
    }
  });
});
