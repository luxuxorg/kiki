import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { loadConfig } from '../config.js';
function check(label, ok, detail) {
    return { ok, message: label, detail };
}
function checkPathExists(targetPath, relPath, label) {
    const fullPath = join(targetPath, relPath);
    return check(label, existsSync(fullPath), existsSync(fullPath) ? undefined : `Missing: ${relPath}`);
}
function checkPathsConfig(config, targetPath) {
    const results = [];
    const p = config.paths;
    const requiredPaths = [
        ['source', p.source],
        ['tests', p.tests],
        ['docs', p.docs],
        ['superpowers', p.superpowers],
        ['specs', p.specs],
        ['plans', p.plans],
        ['changelog', p.changelog],
        ['readme', p.readme],
    ];
    for (const [label, path] of requiredPaths) {
        results.push(checkPathExists(targetPath, path, `paths.${label} (${path})`));
    }
    if (p.decisions) {
        results.push(checkPathExists(targetPath, p.decisions, `paths.decisions (${p.decisions})`));
    }
    if (p.knowledge) {
        results.push(checkPathExists(targetPath, p.knowledge, `paths.knowledge (${p.knowledge})`));
    }
    return results;
}
function checkModels(config) {
    const results = [];
    if (!config.models.standard || config.models.standard.trim() === '') {
        results.push(check('models.standard', false, 'Standard model is empty'));
    }
    else {
        results.push(check(`models.standard (${config.models.standard})`, true));
    }
    if (!config.models.critical || config.models.critical.trim() === '') {
        results.push(check('models.critical', false, 'Critical model is empty'));
    }
    else {
        results.push(check(`models.critical (${config.models.critical})`, true));
    }
    if (!config.models.workhorse || config.models.workhorse.trim() === '') {
        results.push(check('models.workhorse', false, 'Workhorse model is empty'));
    }
    else {
        results.push(check(`models.workhorse (${config.models.workhorse})`, true));
    }
    return results;
}
function checkRoutingTable(targetPath) {
    const results = [];
    const routingPath = join(targetPath, '.agentic', 'kiki', 'routing.json');
    if (!existsSync(routingPath)) {
        results.push(check('.agentic/kiki/routing.json', false, 'File missing'));
        return results;
    }
    try {
        const raw = JSON.parse(readFileSync(routingPath, 'utf-8'));
        const agents = raw?.agents;
        if (!agents || typeof agents !== 'object') {
            results.push(check('routing.json agents', false, 'No agents map found'));
        }
        else {
            const agentCount = Object.keys(agents).length;
            if (agentCount === 0) {
                results.push(check('routing.json agents', false, 'No agents defined'));
            }
            else {
                results.push(check(`routing.json agents (${agentCount} agents)`, true));
                for (const [name, model] of Object.entries(agents)) {
                    const m = model;
                    if (!m || m.trim() === '') {
                        results.push(check(`agent ${name} model`, false, 'Empty model'));
                    }
                }
            }
        }
    }
    catch {
        results.push(check('.agentic/kiki/routing.json', false, 'Invalid JSON'));
    }
    return results;
}
function checkAgentFiles(targetPath) {
    const results = [];
    const expectedAgents = [
        'kiki-orchestrator.md',
        'kiki-brainstormer.md',
        'kiki-planner.md',
        'kiki-implementer.md',
        'kiki-gui-designer.md',
        'kiki-reviewer.md',
        'kiki-escalation.md',
        'kiki-historian.md',
    ];
    for (const agent of expectedAgents) {
        results.push(checkPathExists(targetPath, join('.opencode', 'agents', agent), `agent: ${agent}`));
    }
    results.push(checkPathExists(targetPath, join('.opencode', 'plugins', 'kiki.ts'), 'plugin: kiki.ts'));
    results.push(checkPathExists(targetPath, join('.opencode', 'docs', 'agentic-workflow.md'), 'doc: agentic-workflow.md'));
    return results;
}
function checkOrchestratorNoPermissions(targetPath) {
    const results = [];
    const orchPath = join(targetPath, '.opencode', 'agents', 'kiki-orchestrator.md');
    if (!existsSync(orchPath)) {
        return results;
    }
    const content = readFileSync(orchPath, 'utf-8');
    const frontmatter = content.split('---')[1] ?? '';
    if (frontmatter.includes('permission:')) {
        results.push(check('orchestrator has no permission block', false, 'mode: primary + permissions crashes OpenCode'));
    }
    else {
        results.push(check('orchestrator has no permission block', true));
    }
    return results;
}
function checkConfigFields(config) {
    const results = [];
    if (!config.projectName || config.projectName === 'my-project') {
        results.push(check('config.projectName', false, 'Still using default "my-project"'));
    }
    else {
        results.push(check(`config.projectName (${config.projectName})`, true));
    }
    if (!config.commands.build) {
        results.push(check('config.commands.build', false, 'Build command is empty'));
    }
    else {
        results.push(check(`config.commands.build (${config.commands.build})`, true));
    }
    if (!config.commands.test) {
        results.push(check('config.commands.test', false, 'Test command is empty'));
    }
    else {
        results.push(check(`config.commands.test (${config.commands.test})`, true));
    }
    if (!config.commands.lint) {
        results.push(check('config.commands.lint', false, 'Lint command is empty'));
    }
    else {
        results.push(check(`config.commands.lint (${config.commands.lint})`, true));
    }
    if (!config.commands.security) {
        results.push(check('config.commands.security', false, 'Security command is empty'));
    }
    else {
        results.push(check(`config.commands.security (${config.commands.security})`, true));
    }
    results.push(check('config.paths present', Boolean(config.paths)));
    return results;
}
export async function doctor(targetPath = '.') {
    console.log(`\n🔍 Kiki Doctor — checking ${targetPath}\n`);
    const config = loadConfig(targetPath);
    let allResults = [];
    // Config checks
    console.log('--- Config ---');
    const configResults = checkConfigFields(config);
    allResults = allResults.concat(configResults);
    // Path checks
    console.log('--- Paths ---');
    const pathResults = checkPathsConfig(config, targetPath);
    allResults = allResults.concat(pathResults);
    // Model checks
    console.log('--- Models ---');
    const modelResults = checkModels(config);
    allResults = allResults.concat(modelResults);
    // Routing checks
    console.log('--- Routing ---');
    const routingResults = checkRoutingTable(targetPath);
    allResults = allResults.concat(routingResults);
    // Agent file checks
    console.log('--- Agent Files ---');
    const agentResults = checkAgentFiles(targetPath);
    allResults = allResults.concat(agentResults);
    // Orchestrator safety check
    console.log('--- Safety ---');
    const safetyResults = checkOrchestratorNoPermissions(targetPath);
    allResults = allResults.concat(safetyResults);
    // Print results
    let passCount = 0;
    let failCount = 0;
    for (const result of allResults) {
        const icon = result.ok ? '✓' : '✗';
        const line = result.detail ? `${icon} ${result.message} — ${result.detail}` : `${icon} ${result.message}`;
        console.log(line);
        if (result.ok)
            passCount++;
        else
            failCount++;
    }
    console.log(`\n${passCount} passed, ${failCount} failed`);
    if (failCount > 0) {
        console.log('\n💡 Run `kiki update` to fix template issues, or `kiki init` to reconfigure.');
        process.exit(1);
    }
}
//# sourceMappingURL=doctor.js.map