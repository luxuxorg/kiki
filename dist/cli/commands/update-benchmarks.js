import { scrapeBridgeBench, saveBenchmarkCache } from '../../core/benchmark-cache.js';
export async function updateBenchmarks() {
    console.log('Scraping BridgeBench...');
    const cache = await scrapeBridgeBench();
    saveBenchmarkCache(cache);
    console.log(`Benchmarks cached. Categories: ${Object.keys(cache.categories).length}`);
    console.log('Run "kiki update-pricing" to rebuild routing table.');
}
//# sourceMappingURL=update-benchmarks.js.map