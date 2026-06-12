import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'node:path';
export let CACHE_PATH = '.agentic/cache/bridgebench.json';
export function setBenchmarkCachePath(newPath) {
    if (newPath.includes('..') || newPath.startsWith('/')) {
        throw new Error('Invalid cache path');
    }
    CACHE_PATH = newPath;
}
export function loadBenchmarkCache() {
    if (!existsSync(CACHE_PATH))
        return null;
    const raw = readFileSync(CACHE_PATH, 'utf-8');
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
export function saveBenchmarkCache(cache) {
    const dir = path.dirname(CACHE_PATH);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}
export function getBridgeBenchScore(cache, model, category) {
    const scores = cache.categories[category];
    if (!scores)
        return null;
    const entry = scores.find((s) => s.model === model);
    return entry?.score ?? null;
}
export function getBenchmarkRank(cache, model, category) {
    const scores = cache.categories[category];
    if (!scores)
        return null;
    const entry = scores.find((s) => s.model === model);
    return entry?.rank ?? null;
}
// Placeholder for actual scraping logic
export async function scrapeBridgeBench() {
    // NOTE: BridgeBench has no public API yet. This is a placeholder.
    // When an API becomes available, implement actual scraping here.
    // For now, return empty structure
    return {
        scrapedAt: new Date().toISOString(),
        categories: {}
    };
}
//# sourceMappingURL=benchmark-cache.js.map