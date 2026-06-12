import { fetchOpenRouterPricing } from '../../core/pricing';
import { loadBenchmarkCache } from '../../core/benchmark-cache';
import { generateRoutingTable, saveRoutingTable, loadRoutingTable } from '../../core/routing-table';
import { readFileSync } from 'fs';

export async function updatePricing(): Promise<void> {
  console.log('Fetching OpenRouter pricing...');
  const pricing = await fetchOpenRouterPricing();
  
  const benchmarks = loadBenchmarkCache();
  if (!benchmarks) {
    console.error('No benchmark cache found. Run "kiki update-benchmarks" first.');
    process.exit(1);
  }

  let availableModels: string[] = [];
  try {
    const opencodeConfig = JSON.parse(readFileSync('opencode.json', 'utf-8'));
    availableModels = Object.keys(opencodeConfig.providers ?? {});
  } catch {
    availableModels = pricing.models.map(m => m.model);
  }

  const config = JSON.parse(readFileSync('.agentic/config.json', 'utf-8'));
  const table = generateRoutingTable(benchmarks, pricing, availableModels, config.routingPreferences);
  
  const existing = loadRoutingTable();
  if (existing) {
    table.projectDefaults = existing.projectDefaults;
  }

  saveRoutingTable(table);
  console.log(`Routing table updated. ${table.rules.length} rules generated.`);
}
