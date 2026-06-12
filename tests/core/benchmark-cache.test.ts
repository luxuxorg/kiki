import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  loadBenchmarkCache,
  saveBenchmarkCache,
  getBridgeBenchScore,
  getBenchmarkRank,
  setBenchmarkCachePath,
  CACHE_PATH
} from '../../src/core/benchmark-cache';
import type { BridgeBenchCache } from '../../src/types';

describe('benchmark-cache', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = `tmp/benchmark-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await fs.mkdir(tmpDir, { recursive: true });
    setBenchmarkCachePath(path.join(tmpDir, '.agentic/cache/bridgebench.json'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('loads null when cache missing', () => {
    const result = loadBenchmarkCache();
    expect(result).toBeNull();
  });

  it('saves and loads cache correctly', () => {
    const cache: BridgeBenchCache = {
      scrapedAt: new Date().toISOString(),
      categories: {
        reasoning: [
          { model: 'anthropic/claude-opus-4', category: 'reasoning', score: 92, rank: 1 }
        ]
      }
    };
    saveBenchmarkCache(cache);
    const loaded = loadBenchmarkCache();
    expect(loaded).toEqual(cache);
  });

  it('gets score for model and category', () => {
    const cache: BridgeBenchCache = {
      scrapedAt: new Date().toISOString(),
      categories: {
        reasoning: [
          { model: 'anthropic/claude-opus-4', category: 'reasoning', score: 92, rank: 1 },
          { model: 'openai/gpt-4o', category: 'reasoning', score: 88, rank: 2 }
        ]
      }
    };
    expect(getBridgeBenchScore(cache, 'anthropic/claude-opus-4', 'reasoning')).toBe(92);
    expect(getBridgeBenchScore(cache, 'openai/gpt-4o', 'reasoning')).toBe(88);
  });

  it('returns null for missing model/category', () => {
    const cache: BridgeBenchCache = {
      scrapedAt: new Date().toISOString(),
      categories: {
        reasoning: [
          { model: 'anthropic/claude-opus-4', category: 'reasoning', score: 92, rank: 1 }
        ]
      }
    };
    expect(getBridgeBenchScore(cache, 'missing-model', 'reasoning')).toBeNull();
    expect(getBridgeBenchScore(cache, 'anthropic/claude-opus-4', 'missing-category')).toBeNull();
    expect(getBenchmarkRank(cache, 'missing-model', 'reasoning')).toBeNull();
    expect(getBenchmarkRank(cache, 'anthropic/claude-opus-4', 'missing-category')).toBeNull();
  });

  it('returns null for malformed JSON cache', async () => {
    await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
    await fs.writeFile(CACHE_PATH, 'not valid json');
    const result = loadBenchmarkCache();
    expect(result).toBeNull();
  });

  it('rejects invalid cache paths', () => {
    expect(() => setBenchmarkCachePath('../etc/passwd')).toThrow('Invalid cache path');
    expect(() => setBenchmarkCachePath('/etc/passwd')).toThrow('Invalid cache path');
  });
});
