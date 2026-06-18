import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DEFAULT_CONFIG, DEFAULT_ALIGNMENT, DEFAULT_ROUTING_TABLE, writeOpencodeFiles, loadConfig, } from '../config.js';
function smartMerge(existing, defaults) {
    const result = { ...defaults };
    if (!existing)
        return result;
    for (const key of Object.keys(defaults)) {
        if (key in existing) {
            if (typeof defaults[key] === 'object' && defaults[key] !== null && !Array.isArray(defaults[key])) {
                result[key] = smartMerge(existing[key], defaults[key]);
            }
            else if (JSON.stringify(existing[key]) !== JSON.stringify(defaults[key])) {
                result[key] = existing[key];
            }
        }
    }
    return result;
}
export async function update(targetPath) {
    const agenticDir = join(targetPath, '.agentic');
    if (!existsSync(agenticDir)) {
        console.error("No Kiki installation found. Run 'kiki init' first.");
        process.exit(1);
    }
    const updated = [];
    const merged = [];
    // Load existing config and smart-merge with defaults (only keeps keys defined in defaults)
    const existingRaw = loadConfig(targetPath);
    const mergedConfig = smartMerge(existingRaw, DEFAULT_CONFIG);
    // Write merged config
    const configPath = join(agenticDir, 'config.json');
    writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2));
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
    let userRouting;
    if (existsSync(routingPath)) {
        try {
            userRouting = JSON.parse(readFileSync(routingPath, 'utf-8'));
        }
        catch {
            // ignore parse errors, treat as missing
        }
    }
    const mergedRules = smartMerge(userRouting?.rules, DEFAULT_ROUTING_TABLE.rules);
    const mergedRouting = { rules: mergedRules };
    writeFileSync(routingPath, JSON.stringify(mergedRouting, null, 2));
    merged.push('.agentic/routing.json');
    // Smart-merge alignment.json
    const alignmentPath = join(agenticDir, 'alignment.json');
    let userAlignment;
    if (existsSync(alignmentPath)) {
        try {
            userAlignment = JSON.parse(readFileSync(alignmentPath, 'utf-8'));
        }
        catch {
            // ignore parse errors
        }
    }
    const mergedAlignment = smartMerge(userAlignment, DEFAULT_ALIGNMENT);
    writeFileSync(alignmentPath, JSON.stringify(mergedAlignment, null, 2));
    merged.push('.agentic/alignment.json');
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
//# sourceMappingURL=update.js.map