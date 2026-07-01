import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DEFAULT_ALIGNMENT, DEFAULT_ROUTING_TABLE, writeOpencodeFiles, loadConfig, } from '../config.js';
export async function update(args) {
    const targetPath = typeof args === 'string' ? args : (args[0] ?? '.');
    const agenticDir = join(targetPath, '.agentic');
    const kikiDir = join(agenticDir, 'kiki');
    if (!existsSync(agenticDir)) {
        console.error("No Kiki installation found. Run 'kiki init' first.");
        process.exit(1);
    }
    const updated = [];
    // Load config from .agentic/kiki/config.json only (with legacy fallback handled by loadConfig)
    const config = loadConfig(targetPath);
    // Regenerate .opencode/ files from loaded config
    writeOpencodeFiles(targetPath, config);
    updated.push('.opencode/agents/kiki-orchestrator.md');
    updated.push('.opencode/agents/kiki-brainstormer.md');
    updated.push('.opencode/agents/kiki-planner.md');
    updated.push('.opencode/agents/kiki-implementer.md');
    updated.push('.opencode/agents/kiki-gui-designer.md');
    updated.push('.opencode/agents/kiki-reviewer.md');
    updated.push('.opencode/agents/kiki-escalation.md');
    updated.push('.opencode/agents/kiki-historian.md');
    updated.push('.opencode/plugins/kiki.ts');
    updated.push('.opencode/package.json');
    updated.push('.opencode/.gitignore');
    updated.push('.opencode/docs/agentic-workflow.md');
    mkdirSync(kikiDir, { recursive: true });
    // Write routing to .agentic/kiki/routing.json only
    writeFileSync(join(kikiDir, 'routing.json'), JSON.stringify(DEFAULT_ROUTING_TABLE, null, 2));
    updated.push('.agentic/kiki/routing.json');
    // Write alignment to .agentic/kiki/alignment.json only
    writeFileSync(join(kikiDir, 'alignment.json'), JSON.stringify(DEFAULT_ALIGNMENT, null, 2));
    updated.push('.agentic/kiki/alignment.json');
    // Print summary
    console.log(`Updated Kiki in ${targetPath}`);
    console.log(`\nOverwritten (${updated.length} files):`);
    for (const file of updated) {
        console.log(`  - ${file}`);
    }
}
//# sourceMappingURL=update.js.map