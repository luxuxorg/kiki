import { existsSync } from 'fs';
import { join } from 'path';
import { loadConfig } from '../config.js';
import { AGENT_NAMES, globalDirectory, mergeSettings, readOpenCodeSettings } from '../opencode-config.js';
export async function doctor(targetPath = '.') {
    console.log(`Kiki Doctor — ${targetPath}`);
    let failures = 0;
    let passes = 0;
    const check = (label, ok, detail = '') => {
        console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
        ok ? passes++ : failures++;
    };
    const global = globalDirectory();
    const globalConfig = readOpenCodeSettings(global, true);
    const project = readOpenCodeSettings(targetPath);
    const agents = mergeSettings(globalConfig.agent || {}, project.agent || {});
    for (const name of AGENT_NAMES) {
        check(`global agent: ${name}`, !!globalConfig.agent?.[name]);
        const model = agents[name]?.model ?? project.model ?? globalConfig.model;
        check(`agent ${name} model`, typeof model === 'string' && !!model.trim());
        check(`prompt: ${name}`, existsSync(join(global, 'kiki/prompts', `${name}.md`)));
    }
    check('global plugin: kiki.ts', existsSync(join(global, 'plugins/kiki.ts')));
    check('global workflow', existsSync(join(global, 'kiki/agentic-workflow.md')));
    for (const folder of ['plugin', 'plugins']) {
        for (const extension of ['ts', 'js']) {
            const local = join(targetPath, '.opencode', folder, `kiki.${extension}`);
            if (existsSync(local))
                check('duplicate local Kiki plugin', false, 'Run kiki migrate --project <path>');
        }
    }
    if (existsSync(join(targetPath, '.agentic/kiki/routing.json'))) {
        check('legacy routing.json', false, 'Run kiki migrate --project <path> to preserve models in OpenCode configuration');
    }
    if (existsSync(join(targetPath, '.agentic/kiki/config.json')) || existsSync(join(targetPath, '.agentic/config.json'))) {
        const config = loadConfig(targetPath);
        check('config.projectName', !!config.projectName && config.projectName !== 'my-project');
        for (const [name, command] of Object.entries(config.commands))
            check(`config.commands.${name}`, typeof command === 'string' && !!command.trim());
        for (const name of ['source', 'tests', 'docs', 'superpowers', 'specs', 'plans', 'readme', 'changelog', 'decisions', 'knowledge']) {
            const value = config.paths[name];
            if (value)
                check(`paths.${name}`, existsSync(join(targetPath, value)), value);
        }
    }
    else {
        console.log('No project metadata; using global defaults.');
    }
    console.log(`${passes} passed, ${failures} failed`);
    if (failures)
        process.exit(1);
}
//# sourceMappingURL=doctor.js.map