import type { OpenRouterCache, PricingData } from '../types.js';
export declare let CACHE_PATH: string;
export declare function setPricingCachePath(newPath: string): void;
export declare function loadPricingCache(): OpenRouterCache | null;
export declare function savePricingCache(cache: OpenRouterCache): void;
export declare function getModelPricing(cache: OpenRouterCache, model: string): PricingData | null;
export declare function fetchOpenRouterPricing(): Promise<OpenRouterCache>;
//# sourceMappingURL=pricing.d.ts.map