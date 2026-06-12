import type { BridgeBenchCache } from '../types.js';
export declare let CACHE_PATH: string;
export declare function setBenchmarkCachePath(newPath: string): void;
export declare function loadBenchmarkCache(): BridgeBenchCache | null;
export declare function saveBenchmarkCache(cache: BridgeBenchCache): void;
export declare function getBridgeBenchScore(cache: BridgeBenchCache, model: string, category: string): number | null;
export declare function getBenchmarkRank(cache: BridgeBenchCache, model: string, category: string): number | null;
export declare function scrapeBridgeBench(): Promise<BridgeBenchCache>;
//# sourceMappingURL=benchmark-cache.d.ts.map