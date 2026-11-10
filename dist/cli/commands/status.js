import { existsSync } from 'fs';
import { join } from 'path';
import { AGENT_NAMES, globalDirectory, readOpenCodeSettings, mergeSettings } from '../opencode-config.js';
import { autoDiscoveredKikiPlugins, hasKikiServerRegistration } from '../oc2-registration.js';
function modelString(value) {
    if (typeof value === 'string')
        return value;
    if (!value || typeof value !== 'object')
        return undefined;
    const model = value;
    if (typeof model.providerID !== 'string' || typeof model.model !== 'string')
        return undefined;
    return `${model.providerID}/${model.model}`;
}
export async function status(projectPath = '.') {
    const global = globalDirectory();
    const globalSettings = readOpenCodeSettings(global, true);
    const projectSettings = readOpenCodeSettings(projectPath);
    const globalAgents = globalSettings.agents || {};
    const projectAgents = projectSettings.agents || {};
    const effective = mergeSettings(globalAgents, projectAgents);
    const installed = AGENT_NAMES.filter(name => existsSync(join(global, 'agents', `${name}.md`)) || globalAgents[name] !== undefined).length;
    const pluginInstalled = hasKikiServerRegistration(global) || autoDiscoveredKikiPlugins(global).length > 0;
    console.log('=== Global Installation ===');
    console.log(`  Location: ${global}`);
    console.log(`  Global agents: ${installed}`);
    console.log(`  Plugin: ${pluginInstalled ? 'installed' : 'missing'}`);
    console.log('=== Project State ===');
    console.log(`  Path: ${projectPath}`);
    console.log(`  Metadata: ${existsSync(join(projectPath, '.agentic/kiki')) ? 'initialized' : 'global defaults'}`);
    console.log('=== JSON-configured Models ===');
    for (const name of AGENT_NAMES) {
        const model = modelString(effective[name]?.model)
            ?? modelString(projectSettings.model) ?? modelString(globalSettings.model);
        if (effective[name] === undefined && model === undefined)
            continue;
        const source = projectAgents[name]?.model !== undefined ? 'project' : 'global';
        console.log(`  ${name}: ${model || '(inherited)'} [${source}]`);
        if (['agent', 'agents'].some(dir => existsSync(join(projectPath, '.opencode', dir, `${name}.md`)))) {
            console.log(`    Local Markdown override present for ${name}; it can override these settings.`);
        }
    }
    if (existsSync(join(projectPath, '.agentic/kiki/routing.json')))
        console.log('Legacy routing.json found: use kiki migrate --project <path>.');
}
//# sourceMappingURL=status.js.map