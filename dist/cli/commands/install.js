import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { DEFAULT_CONFIG, DEFAULT_ROUTING_TABLE, DEFAULT_ALIGNMENT, generateAllTemplates, } from '../config.js';
import { runWizard, applyPathSetup } from './init.js';
const GLOBAL_AGENTS_DIR = join(homedir(), '.config', 'opencode', 'agents');
const GLOBAL_PLUGINS_DIR = join(homedir(), '.config', 'opencode', 'plugins');
const GLOBAL_DEFAULTS_DIR = join(homedir(), '.config', 'opencode', 'kiki', 'defaults');
function ensureDir(path) {
    if (!existsSync(path)) {
        mkdirSync(path, { recursive: true });
    }
}
export async function install(args) {
    const projectFlag = args.indexOf('--project');
    const projectPath = projectFlag >= 0 ? args[projectFlag + 1] : null;
    const force = args.includes('--force');
    const globalFlag = args.includes('--global');
    if (projectPath && globalFlag) {
        console.error('Error: --project and --global are mutually exclusive.');
        process.exit(1);
    }
    if (projectPath) {
        await installProject(projectPath, force);
    }
    else {
        await installGlobal(force);
    }
}
async function installGlobal(force) {
    const templates = generateAllTemplates(DEFAULT_CONFIG);
    ensureDir(GLOBAL_AGENTS_DIR);
    ensureDir(GLOBAL_PLUGINS_DIR);
    ensureDir(GLOBAL_DEFAULTS_DIR);
    const agentFiles = {
        'kiki-orchestrator.md': templates.orchestrator,
        'kiki-brainstormer.md': templates.brainstormer,
        'kiki-planner.md': templates.planner,
        'kiki-implementer.md': templates.implementer,
        'kiki-gui-designer.md': templates.guiDesigner,
        'kiki-reviewer.md': templates.reviewer,
        'kiki-escalation.md': templates.escalation,
        'kiki-historian.md': templates.historian,
    };
    for (const [name, content] of Object.entries(agentFiles)) {
        const target = join(GLOBAL_AGENTS_DIR, name);
        if (!existsSync(target) || force) {
            writeFileSync(target, content);
        }
    }
    const pluginTarget = join(GLOBAL_PLUGINS_DIR, 'kiki.ts');
    if (!existsSync(pluginTarget) || force) {
        writeFileSync(pluginTarget, templates.plugin);
    }
    writeFileSync(join(GLOBAL_DEFAULTS_DIR, 'routing.json'), JSON.stringify(DEFAULT_ROUTING_TABLE, null, 2));
    writeFileSync(join(GLOBAL_DEFAULTS_DIR, 'alignment.json'), JSON.stringify(DEFAULT_ALIGNMENT, null, 2));
    console.log('Kiki installed globally.');
    console.log(`  Agents: ${GLOBAL_AGENTS_DIR}`);
    console.log(`  Plugin: ${GLOBAL_PLUGINS_DIR}`);
    console.log(`  Defaults: ${GLOBAL_DEFAULTS_DIR}`);
}
async function installProject(targetPath, force) {
    const agenticKikiDir = join(targetPath, '.agentic', 'kiki');
    ensureDir(agenticKikiDir);
    const config = await runWizard(targetPath);
    const changelogStatus = config.paths.changelog
        ? existsSync(join(targetPath, config.paths.changelog)) ? 'exists' : 'create'
        : 'skip';
    const decisionsStatus = config.paths.decisions
        ? existsSync(join(targetPath, config.paths.decisions)) ? 'exists' : 'create'
        : 'skip';
    const knowledgeStatus = config.paths.knowledge
        ? existsSync(join(targetPath, config.paths.knowledge)) ? 'exists' : 'create'
        : 'skip';
    applyPathSetup(targetPath, config, changelogStatus, decisionsStatus, knowledgeStatus);
    const configPath = join(agenticKikiDir, 'config.json');
    const routingPath = join(agenticKikiDir, 'routing.json');
    const alignmentPath = join(agenticKikiDir, 'alignment.json');
    const registryPath = join(agenticKikiDir, 'TASK_REGISTRY.json');
    if (!existsSync(configPath) || force) {
        writeFileSync(configPath, JSON.stringify(config, null, 2));
    }
    if (!existsSync(routingPath) || force) {
        writeFileSync(routingPath, JSON.stringify(DEFAULT_ROUTING_TABLE, null, 2));
    }
    if (!existsSync(alignmentPath) || force) {
        writeFileSync(alignmentPath, JSON.stringify(DEFAULT_ALIGNMENT, null, 2));
    }
    if (!existsSync(registryPath) || force) {
        writeFileSync(registryPath, JSON.stringify({ tasks: [] }, null, 2));
    }
    console.log(`\nKiki project config installed in ${targetPath}`);
    console.log(`  Project: ${config.projectName}`);
    console.log(`  Language: ${config.language}`);
    console.log(`  Standard model: ${config.models.standard}`);
    console.log(`  Critical model: ${config.models.critical}`);
    console.log(`  Workhorse model: ${config.models.workhorse}`);
    if (config.paths.decisions)
        console.log(`  Decisions: ${config.paths.decisions}`);
    if (config.paths.knowledge)
        console.log(`  Knowledge: ${config.paths.knowledge}`);
}
//# sourceMappingURL=install.js.map