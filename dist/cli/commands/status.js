import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { loadRoutingTable } from '../../core/routing-table.js';
export async function status(projectPath = '.') {
    const agenticDir = join(projectPath, '.agentic');
    if (!existsSync(agenticDir)) {
        console.error('No .agentic/ directory found. Run "kiki init" first.');
        process.exit(1);
    }
    let registry;
    try {
        registry = JSON.parse(readFileSync(join(agenticDir, 'TASK_REGISTRY.json'), 'utf-8'));
    }
    catch {
        console.error('Failed to read TASK_REGISTRY.json');
        process.exit(1);
    }
    const table = loadRoutingTable();
    console.log('=== Task Registry ===');
    console.log(`Total tasks: ${registry.tasks?.length ?? 0}`);
    const byStatus = (registry.tasks ?? []).reduce((acc, t) => {
        acc[t.status] = (acc[t.status] ?? 0) + 1;
        return acc;
    }, {});
    for (const [status, count] of Object.entries(byStatus)) {
        console.log(`  ${status}: ${count}`);
    }
    if (table) {
        console.log('\n=== Routing Table ===');
        console.log('Static routing table (manually maintained)');
        const rules = Object.entries(table.rules);
        console.log(`Rules: ${rules.length}`);
        // Group by skill
        const bySkill = {};
        for (const [key, rule] of rules) {
            const [skill] = key.split(':');
            if (!bySkill[skill])
                bySkill[skill] = [];
            bySkill[skill].push(`  ${key}: standard=${rule.standard}${rule.critical ? `, critical=${rule.critical}` : ''}`);
        }
        for (const [skill, entries] of Object.entries(bySkill)) {
            console.log(`\n${skill}:`);
            entries.forEach(e => console.log(e));
        }
    }
    else {
        console.log('\nNo routing table found. Run "kiki init".');
    }
}
//# sourceMappingURL=status.js.map