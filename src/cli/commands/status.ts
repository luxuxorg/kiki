import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { loadRoutingTable } from '../../core/routing-table.js';

export async function status(projectPath: string = '.'): Promise<void> {
  const agenticDir = join(projectPath, '.agentic');

  if (!existsSync(agenticDir)) {
    console.error('No .agentic/ directory found. Run "kiki init" first.');
    process.exit(1);
  }

  let registry;
  try {
    registry = JSON.parse(readFileSync(join(agenticDir, 'TASK_REGISTRY.json'), 'utf-8'));
  } catch {
    console.error('Failed to read TASK_REGISTRY.json');
    process.exit(1);
  }
  const table = loadRoutingTable();

  console.log('=== Task Registry ===');
  console.log(`Total tasks: ${registry.tasks?.length ?? 0}`);
  
  const byStatus = (registry.tasks ?? []).reduce((acc: Record<string, number>, t: any) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});
  
  for (const [status, count] of Object.entries(byStatus)) {
    console.log(`  ${status}: ${count}`);
  }

  if (table) {
    console.log('\n=== Routing Table ===');
    console.log(`Generated: ${table.generatedAt}`);
    console.log(`Sources: ${table.sources.benchmarks}, ${table.sources.pricing}`);
    console.log(`Rules: ${table.rules.length}`);
    console.log(`Project defaults: ${Object.keys(table.projectDefaults).length}`);
  } else {
    console.log('\nNo routing table found. Run "kiki update-benchmarks" or "kiki update-pricing".');
  }
}
