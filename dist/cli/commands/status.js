import { existsSync } from 'fs';
import { join } from 'path';
import { AGENT_NAMES, globalDirectory, readOpenCodeSettings, mergeSettings } from '../opencode-config.js';
export async function status(projectPath = '.') {
    const global = globalDirectory();
    const globalAgents = readOpenCodeSettings(global, true).agent || {};
    const projectAgents = readOpenCodeSettings(projectPath).agent || {};
    const effective = mergeSettings(globalAgents, projectAgents);
    console.log('=== Global Installation ===');
    console.log(`  Location: ${global}`);
    console.log(`  Global agents: ${AGENT_NAMES.filter(name => globalAgents[name]).length}`);
    console.log(`  Plugin: ${existsSync(join(global, 'plugins/kiki.ts')) ? 'installed' : 'missing'}`);
    console.log('=== Project State ===');
    console.log(`  Path: ${projectPath}`);
    console.log(`  Metadata: ${existsSync(join(projectPath, '.agentic/kiki')) ? 'initialized' : 'global defaults'}`);
    console.log('=== JSON-configured Models ===');
    for (const name of AGENT_NAMES) {
        if (!effective[name])
            continue;
        const source = projectAgents[name]?.model !== undefined ? 'project' : 'global';
        console.log(`  ${name}: ${effective[name].model || '(inherited)'} [${source}]`);
        if (['agent', 'agents'].some(dir => existsSync(join(projectPath, '.opencode', dir, `${name}.md`)))) {
            console.log(`    Local Markdown override present for ${name}; it can override these settings.`);
        }
    }
    if (existsSync(join(projectPath, '.agentic/kiki/routing.json')))
        console.log('Legacy routing.json found: use kiki migrate --project <path>.');
}
//# sourceMappingURL=status.js.map