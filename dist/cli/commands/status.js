import { readFileSync, existsSync } from 'fs';
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
    console.log(`  Defaults: ${globalRouting ? `present (${Object.keys(globalRouting.rules).length} rules)` : 'missing'}`);
    // Project state
    const hasProject = existsSync(agenticDir);
    const hasModernKiki = existsSync(agenticKikiDir);
    const hasLegacyKiki = hasProject && !hasModernKiki && (existsSync(join(agenticDir, 'config.json')) || existsSync(join(agenticDir, 'routing.json')));
    console.log('\n=== Project State ===');
    console.log(`  Path: ${projectPath}`);
    console.log(`  Status: ${hasModernKiki ? 'modern (.agentic/kiki/)' : hasLegacyKiki ? 'legacy (.agentic/ root)' : hasProject ? 'initialized but no kiki config' : 'not initialized'}`);
    if (!hasProject) {
        console.error('\nNo .agentic/ directory found. Run "kiki init" or "kiki install --project ." first.');
        process.exit(1);
    }
    let registry;
    try {
        const registryPath = hasModernKiki ? join(agenticKikiDir, 'TASK_REGISTRY.json') : join(agenticDir, 'TASK_REGISTRY.json');
        registry = JSON.parse(readFileSync(registryPath, 'utf-8'));
    }
    catch {
        console.error('Failed to read TASK_REGISTRY.json');
        process.exit(1);
    }
    console.log('\n=== Task Registry ===');
    console.log(`Total tasks: ${registry.tasks?.length ?? 0}`);
    const byStatus = (registry.tasks ?? []).reduce((acc, t) => {
        acc[t.status] = (acc[t.status] ?? 0) + 1;
        return acc;
    }, {});
    for (const [status, count] of Object.entries(byStatus)) {
        console.log(`  ${status}: ${count}`);
    }
    // Routing tables
    const projectRoutingPath = hasModernKiki ? join(agenticKikiDir, 'routing.json') : join(agenticDir, 'routing.json');
    const projectTable = existsSync(projectRoutingPath) ? loadRoutingTable(projectRoutingPath) : null;
    const mergedTable = mergeRoutingTables(projectTable, globalRouting);
    console.log('\n=== Routing Tables ===');
    console.log(`  Project rules: ${projectTable ? Object.keys(projectTable.rules).length : 0}`);
    console.log(`  Global rules: ${globalRouting ? Object.keys(globalRouting.rules).length : 0}`);
    console.log(`  Effective rules: ${mergedTable ? Object.keys(mergedTable.rules).length : 0}`);
    if (mergedTable && Object.keys(mergedTable.rules).length > 0) {
        const rules = Object.entries(mergedTable.rules);
        const bySkill = {};
        for (const [key, rule] of rules) {
            const [skill] = key.split(':');
            if (!bySkill[skill])
                bySkill[skill] = [];
            const source = projectTable?.rules[key] ? 'project' : 'global';
            bySkill[skill].push(`  ${key}: standard=${rule.standard}${rule.critical ? `, critical=${rule.critical}` : ''} [${source}]`);
        }
        for (const [skill, entries] of Object.entries(bySkill)) {
            console.log(`\n${skill}:`);
            entries.forEach(e => console.log(e));
        }
    }
    else {
        console.log('\nNo routing table found. Run "kiki init" or "kiki install".\n');
    }
}
//# sourceMappingURL=status.js.map