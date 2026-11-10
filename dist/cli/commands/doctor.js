import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { loadConfig } from '../config.js';
import { discoverSkills, observeSkills } from '../doctor-skills.js';
import { AGENT_NAMES, formatModelID, globalDirectory, mergeSettings, parseAgent, readOpenCodeSettings, } from '../opencode-config.js';
import { assertOC2Target, canonicalPath, resolveOC2Roots } from '../oc2-paths.js';
import { autoDiscoveredKikiPlugins, kikiCliSources, kikiServerSources } from '../oc2-registration.js';
function runOC2Version() {
    const output = execFileSync('opencode', ['--version'], {
        encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'],
    });
    return String(output).trim().split(/\r?\n/)[0]?.trim() ?? '';
}
/** The pinned raw binary prints `opencode v2.2.6`; compare only the version. */
function normalizeVersion(observed) {
    const match = observed.match(/^(?:opencode\s+v)?(\d+\.\d+\.\d+)$/i);
    return match ? match[1] : observed;
}
function modelString(value) {
    if (typeof value === 'string')
        return value;
    if (!value || typeof value !== 'object')
        return undefined;
    try {
        return formatModelID(value);
    }
    catch {
        return undefined;
    }
}
export async function doctor(targetPath = '.', options = {}) {
    console.log(`Kiki Doctor — ${targetPath}`);
    let failures = 0;
    let passes = 0;
    let warnings = 0;
    const check = (label, level, detail = '') => {
        console.log(`${level === 'pass' ? '✓' : level === 'warn' ? '!' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
        if (level === 'pass')
            passes++;
        else if (level === 'warn')
            warnings++;
        else
            failures++;
    };
    const info = (label, detail = '') => console.log(`• ${label}${detail ? ` — ${detail}` : ''}`);
    const outcome = (ok) => (ok ? 'pass' : 'fail');
    const roots = resolveOC2Roots(process.env, homedir());
    let rootsValid = true;
    try {
        assertOC2Target(roots, homedir(), { allowKnownV1Artifacts: true });
        check('OC2 roots', 'pass', 'config/data/cache/state are isolated');
    }
    catch (error) {
        rootsValid = false;
        check('OC2 roots', 'fail', error instanceof Error ? error.message : 'invalid OpenCode 2 roots');
    }
    if (!process.env.OPENCODE_CONFIG_DIR && !process.env.XDG_CONFIG_HOME
        && !process.env.XDG_DATA_HOME && !process.env.XDG_CACHE_HOME && !process.env.XDG_STATE_HOME) {
        check('OC2 environment', 'warn', 'no isolated OC2 environment detected; use the user wrapper');
    }
    else if (process.env.OPENCODE_CONFIG_DIR && process.env.XDG_CONFIG_HOME
        && canonicalPath(process.env.OPENCODE_CONFIG_DIR)
            !== canonicalPath(join(process.env.XDG_CONFIG_HOME, 'opencode'))) {
        check('OC2 environment', 'warn', 'OPENCODE_CONFIG_DIR and XDG_CONFIG_HOME disagree; the config root is overridden');
    }
    else {
        info('OC2 environment', process.env.OPENCODE_CONFIG_DIR
            ? 'OPENCODE_CONFIG_DIR overrides the config root only; data/cache/state use the XDG roots'
            : 'config follows XDG_CONFIG_HOME/opencode; no OPENCODE_CONFIG_DIR override');
    }
    const observed = (() => {
        try {
            return (options.observeVersion ?? runOC2Version)();
        }
        catch {
            return '';
        }
    })();
    const version = normalizeVersion(observed);
    if (!observed)
        check('OC2 version', 'warn', 'not observed; Kiki 3.0.0 targets exactly 2.2.6');
    else if (version === '2.2.6')
        check('OC2 version', 'pass', '2.2.6');
    else
        check('OC2 version', 'warn', `observed ${version}; Kiki 3.0.0 targets exactly 2.2.6`);
    // A failed root guard may mean the config file is credential-bearing. Report
    // the metadata failure and never parse that file.
    if (!rootsValid) {
        console.log(`${passes} passed, ${warnings} warnings, ${failures} failed`);
        if (failures)
            process.exit(1);
        return;
    }
    const global = globalDirectory();
    const globalConfig = readOpenCodeSettings(global, true);
    const projectConfig = readOpenCodeSettings(targetPath);
    const nativeAgents = mergeSettings(globalConfig.agents || {}, projectConfig.agents || {});
    const legacyAgents = mergeSettings(globalConfig.agent || {}, projectConfig.agent || {});
    for (const name of AGENT_NAMES) {
        const file = join(global, 'agents', `${name}.md`);
        let settings;
        try {
            settings = parseAgent(readFileSync(file, 'utf8'), file).settings;
        }
        catch {
            check(`native agent: ${name}`, 'fail', 'missing or unparsable');
            settings = undefined;
        }
        if (settings) {
            const expected = name === 'kiki-orchestrator' ? 'primary' : 'subagent';
            if (settings.mode !== expected)
                check(`native agent: ${name}`, 'fail', `mode ${String(settings.mode)}; expected ${expected}`);
            else
                check(`native agent: ${name}`, 'pass', expected);
        }
        const model = modelString(nativeAgents[name]?.model)
            ?? modelString(legacyAgents[name]?.model)
            ?? modelString(projectConfig.model)
            ?? modelString(globalConfig.model);
        info(`agent ${name} model`, model ?? 'inherits OpenCode default; set via /kiki');
    }
    const serverSources = [
        ...kikiServerSources(global).map(source => source.file),
        ...autoDiscoveredKikiPlugins(global),
        ...kikiServerSources(targetPath).map(source => source.file),
        ...kikiServerSources(join(targetPath, '.opencode')).map(source => source.file),
        ...autoDiscoveredKikiPlugins(targetPath),
        ...autoDiscoveredKikiPlugins(join(targetPath, '.opencode')),
    ];
    if (serverSources.length === 0) {
        check('server plugin registration', 'fail', 'not registered; run kiki update');
    }
    else if (serverSources.length > 1) {
        check('server plugin registration', 'fail', 'duplicate Kiki server plugin sources; keep exactly one');
    }
    else {
        check('server plugin registration', 'pass', serverSources[0]);
    }
    const cliSources = kikiCliSources(global);
    if (cliSources.length === 0)
        check('cli.json TUI registration', 'fail', 'missing; run kiki update');
    else if (cliSources.length > 1)
        check('cli.json TUI registration', 'fail', 'duplicate Kiki TUI plugin entries');
    else
        check('cli.json TUI registration', 'pass', cliSources[0].file);
    const authFile = join(roots.data, 'auth.json');
    info('provider credentials', existsSync(authFile)
        ? 'present in OC2 data root (metadata only; user-owned)'
        : 'not present in OC2 data root; run opencode auth login');
    const workflow = join(global, 'kiki/agentic-workflow.md');
    check('global workflow', outcome(existsSync(workflow)));
    if (existsSync(join(targetPath, '.agentic/kiki/routing.json'))) {
        check('legacy routing.json', 'fail', 'Run kiki migrate --project <path> to preserve models in OpenCode configuration');
    }
    if (existsSync(join(targetPath, '.agentic/kiki/config.json')) || existsSync(join(targetPath, '.agentic/config.json'))) {
        const config = loadConfig(targetPath);
        check('config.projectName', outcome(!!config.projectName && config.projectName !== 'my-project'));
        for (const [name, command] of Object.entries(config.commands)) {
            check(`config.commands.${name}`, outcome(typeof command === 'string' && !!command.trim()));
        }
        for (const name of ['source', 'tests', 'docs', 'superpowers', 'specs', 'plans', 'readme', 'changelog', 'decisions', 'knowledge']) {
            const value = config.paths[name];
            if (value)
                check(`paths.${name}`, outcome(existsSync(join(targetPath, value))), value);
        }
    }
    else {
        console.log('No project metadata; using global defaults.');
    }
    console.log('Skill checks verify files on disk; they cannot confirm OpenCode plugin registration or live availability in a running session.');
    for (const observation of observeSkills(discoverSkills(targetPath))) {
        if (observation.level === 'info')
            info(observation.label, observation.detail);
        else
            check(observation.label, observation.level, observation.detail);
    }
    console.log(`${passes} passed, ${warnings} warnings, ${failures} failed`);
    if (failures)
        process.exit(1);
}
//# sourceMappingURL=doctor.js.map