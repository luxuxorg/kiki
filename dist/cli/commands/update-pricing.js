import { fetchOpenRouterPricing } from '../../core/pricing.js';
import { loadBenchmarkCache } from '../../core/benchmark-cache.js';
import { generateRoutingTable, saveRoutingTable, loadRoutingTable } from '../../core/routing-table.js';
import { readFileSync } from 'fs';
export async function updatePricing() {
    console.log('Fetching OpenRouter pricing...');
    const pricing = await fetchOpenRouterPricing();
    const benchmarks = loadBenchmarkCache();
    if (!benchmarks) {
        console.error('No benchmark cache found. Run "kiki update-benchmarks" first.');
        process.exit(1);
    }
    let availableModels = [];
    try {
        const opencodeConfig = JSON.parse(readFileSync('opencode.json', 'utf-8'));
        availableModels = Object.keys(opencodeConfig.providers ?? {});
    }
    catch {
        availableModels = pricing.models.map((m) => m.model);
    }
    let config;
    try {
        config = JSON.parse(readFileSync('.agentic/config.json', 'utf-8'));
    }
    catch {
        console.error('Failed to read .agentic/config.json');
        process.exit(1);
    }
    const table = generateRoutingTable(benchmarks, pricing, availableModels, config.routingPreferences);
    const existing = loadRoutingTable();
    if (existing) {
        table.projectDefaults = existing.projectDefaults;
    }
    saveRoutingTable(table);
    console.log(`Routing table updated. ${table.rules.length} rules generated.`);
}
//# sourceMappingURL=update-pricing.js.map