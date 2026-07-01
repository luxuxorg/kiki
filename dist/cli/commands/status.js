import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { loadRoutingTable, mergeRoutingTables } from '../../core/routing-table.js';
const GLOBAL_DEFAULTS_DIR = join(homedir(), '.config', 'opencode', 'kiki', 'defaults');
const GLOBAL_AGENTS_DIR = join(homedir(), '.config', 'opencode', 'agents');
const GLOBAL_PLUGINS_DIR = join(homedir(), '.config', 'opencode', 'plugins');
export async function status(projectPath = '.') {
    const agenticDir = join(projectPath, '.agentic');
    const agenticKikiDir = join(agenticDir, 'kiki');
    // Global state
    const globalRoutingPath = join(GLOBAL_DEFAULTS_DIR, 'routing.json');
    const globalRouting = existsSync(globalRoutingPath) ? loadRoutingTable(globalRoutingPath) : null;
    const hasGlobalAgents = existsSync(GLOBAL_AGENTS_DIR) && existsSync(join(GLOBAL_AGENTS_DIR, 'kiki-orchestrator.md'));
    const hasGlobalPlugin = existsSync(join(GLOBAL_PLUGINS_DIR, 'kiki.ts'));
    console.log('=== Global Installation ===');
    console.log(`  Agents: ${hasGlobalAgents ? 'installed' : 'missing'}`);
    console.log(`  Plugin: ${hasGlobalPlugin ? 'installed' : 'missing'}`);
    console.log(`  Defaults: ${globalRouting ? `present (${Object.keys(globalRouting.agents).length} agents)` : 'missing'}`);
    // Project state
    const hasProject = existsSync(agenticDir);
    const hasModernKiki = existsSync(agenticKikiDir);
    console.log('\n=== Project State ===');
    console.log(`  Path: ${projectPath}`);
    console.log(`  Status: ${hasModernKiki ? 'initialized (.agentic/kiki/)' : 'not initialized'}`);
    if (!hasProject) {
        console.error('\nNo .agentic/ directory found. Run "kiki init" or "kiki install --project ." first.');
        process.exit(1);
    }
    // Routing tables
    const projectRoutingPath = join(agenticKikiDir, 'routing.json');
    const projectTable = existsSync(projectRoutingPath) ? loadRoutingTable(projectRoutingPath) : null;
    const mergedTable = mergeRoutingTables(projectTable, globalRouting);
    console.log('\n=== Routing Tables ===');
    console.log(`  Project agents: ${projectTable ? Object.keys(projectTable.agents).length : 0}`);
    console.log(`  Global agents: ${globalRouting ? Object.keys(globalRouting.agents).length : 0}`);
    console.log(`  Effective agents: ${mergedTable ? Object.keys(mergedTable.agents).length : 0}`);
    if (mergedTable && Object.keys(mergedTable.agents).length > 0) {
        for (const [agent, model] of Object.entries(mergedTable.agents)) {
            const source = projectTable?.agents[agent] ? 'project' : 'global';
            console.log(`  ${agent}: ${model} [${source}]`);
        }
    }
    else {
        console.log('\nNo routing table found. Run "kiki init" or "kiki install".\n');
    }
}
//# sourceMappingURL=status.js.map