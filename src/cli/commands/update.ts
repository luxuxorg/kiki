import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  KikiConfig,
  DEFAULT_CONFIG,
  DEFAULT_ALIGNMENT,
  DEFAULT_ROUTING_TABLE,
  writeOpencodeFiles,
  loadConfig,
} from '../config.js';

function smartMerge<T extends Record<string, unknown>>(
  existing: T | undefined,
  defaults: T
): T {
  const result = { ...defaults };
  if (!existing) return result;

  for (const key of Object.keys(defaults)) {
    if (key in existing) {
      if (typeof defaults[key] === 'object' && defaults[key] !== null && !Array.isArray(defaults[key])) {
        (result as Record<string, unknown>)[key] = smartMerge(
          existing[key] as Record<string, unknown>,
          defaults[key] as Record<string, unknown>,
        );
      } else if (JSON.stringify(existing[key]) !== JSON.stringify(defaults[key])) {
        (result as Record<string, unknown>)[key] = existing[key];
      }
    }
  }
  return result;
}

export async function update(args: string[] | string): Promise<void> {
  const targetPath = typeof args === 'string' ? args : (args[0] ?? '.');
  const agenticDir = join(targetPath, '.agentic');
  const kikiDir = join(agenticDir, 'kiki');

  if (!existsSync(agenticDir)) {
    console.error("No Kiki installation found. Run 'kiki init' first.");
    process.exit(1);
  }

  const updated: string[] = [];
  const merged: string[] = [];

  // Load existing config and smart-merge with defaults
  const existingRaw = loadConfig(targetPath);
  const mergedConfig = smartMerge(
    existingRaw as unknown as Record<string, unknown>,
    DEFAULT_CONFIG as unknown as Record<string, unknown>,
  ) as unknown as KikiConfig;

  // Write merged config to both legacy and new locations
  const configPath = join(agenticDir, 'config.json');
  const kikiConfigPath = join(kikiDir, 'config.json');
  writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2));
  if (!existsSync(kikiDir)) {
    // If no kiki dir, user is on legacy setup — don't create it automatically
    // (they can run `kiki install --project .` to migrate)
  } else {
    writeFileSync(kikiConfigPath, JSON.stringify(mergedConfig, null, 2));
  }
  merged.push('.agentic/config.json');

  // Regenerate .opencode/ files from merged config
  writeOpencodeFiles(targetPath, mergedConfig);
  updated.push('.opencode/agents/kiki-orchestrator.md');
  updated.push('.opencode/agents/kiki-brainstormer.md');
  updated.push('.opencode/agents/kiki-planner.md');
  updated.push('.opencode/agents/kiki-implementer.md');
  updated.push('.opencode/agents/kiki-reviewer.md');
  updated.push('.opencode/agents/kiki-escalation.md');
  updated.push('.opencode/agents/kiki-historian.md');
  updated.push('.opencode/plugins/kiki.ts');
  updated.push('.opencode/package.json');
  updated.push('.opencode/.gitignore');
  updated.push('.opencode/docs/agentic-workflow.md');

  // Smart-merge routing.json
  const routingPath = join(agenticDir, 'routing.json');
  let userRouting: { rules: Record<string, unknown> } | undefined;
  if (existsSync(routingPath)) {
    try {
      userRouting = JSON.parse(readFileSync(routingPath, 'utf-8'));
    } catch {
      // ignore parse errors, treat as missing
    }
  }
  const mergedRules = smartMerge(userRouting?.rules, DEFAULT_ROUTING_TABLE.rules);
  const mergedRouting = { rules: mergedRules };
  writeFileSync(routingPath, JSON.stringify(mergedRouting, null, 2));
  merged.push('.agentic/routing.json');

  // Also update .agentic/kiki/routing.json if it exists
  const kikiRoutingPath = join(kikiDir, 'routing.json');
  if (existsSync(kikiDir)) {
    writeFileSync(kikiRoutingPath, JSON.stringify(mergedRouting, null, 2));
  }

  // Smart-merge alignment.json
  const alignmentPath = join(agenticDir, 'alignment.json');
  let userAlignment: Record<string, unknown> | undefined;
  if (existsSync(alignmentPath)) {
    try {
      userAlignment = JSON.parse(readFileSync(alignmentPath, 'utf-8'));
    } catch {
      // ignore parse errors
    }
  }
  const mergedAlignment = smartMerge(userAlignment, DEFAULT_ALIGNMENT);
  writeFileSync(alignmentPath, JSON.stringify(mergedAlignment, null, 2));
  merged.push('.agentic/alignment.json');

  // Also update .agentic/kiki/alignment.json if it exists
  const kikiAlignmentPath = join(kikiDir, 'alignment.json');
  if (existsSync(kikiDir)) {
    writeFileSync(kikiAlignmentPath, JSON.stringify(mergedAlignment, null, 2));
  }

  // Print summary
  console.log(`Updated Kiki in ${targetPath}`);
  console.log(`\nOverwritten (${updated.length} files):`);
  for (const file of updated) {
    console.log(`  - ${file}`);
  }
  console.log(`\nSmart-merged (${merged.length} files):`);
  for (const file of merged) {
    console.log(`  - ${file}`);
  }
  console.log('\nSkipped: .agentic/TASK_REGISTRY.json');
}
