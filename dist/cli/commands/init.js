import * as readline from 'readline';
import { basename } from 'path';
import { DEFAULT_CONFIG, DEFAULT_PATHS, DEFAULT_MODELS, writeAgenticFiles, writeOpencodeFiles, ensurePathExists, } from '../config.js';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
class LineReader {
    rl;
    queue = [];
    waiting = null;
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false,
        });
        this.rl.on('line', (line) => {
            if (this.waiting) {
                const cb = this.waiting;
                this.waiting = null;
                cb(line);
            }
            else {
                this.queue.push(line);
            }
        });
    }
    question(prompt) {
        process.stdout.write(prompt);
        return new Promise((resolve) => {
            if (this.queue.length > 0) {
                resolve(this.queue.shift());
            }
            else {
                this.waiting = resolve;
            }
        });
    }
    close() {
        this.rl.close();
    }
}
function ask(lr, question, defaultVal) {
    const suffix = defaultVal ? ` [${defaultVal}]` : '';
    return lr.question(`${question}${suffix}: `).then((answer) => answer.trim() || defaultVal);
}
function askChoice(lr, question, options, defaultVal) {
    const opts = options.join('/');
    const suffix = defaultVal ? ` [${defaultVal}]` : '';
    return lr.question(`${question} (${opts})${suffix}: `).then((answer) => (answer.trim().toLowerCase() || defaultVal));
}
async function askPathWithStatus(lr, label, defaultPath, targetPath) {
    const path = await ask(lr, `${label} path`, defaultPath);
    if (path === 'none' || path === 'skip') {
        return { path: '', status: 'skip' };
    }
    const fullPath = join(targetPath, path);
    if (existsSync(fullPath)) {
        console.log(`  ✓ ${path} already exists`);
        return { path, status: 'exists' };
    }
    const action = await askChoice(lr, `  ${path} does not exist`, ['create', 'skip'], 'create');
    if (action === 'skip') {
        return { path: '', status: 'skip' };
    }
    return { path, status: 'create' };
}
export async function runWizard(targetPath) {
    const lr = new LineReader();
    const defaultName = basename(targetPath) || 'my-project';
    console.log('\n=== Kiki Setup Wizard ===\n');
    const projectName = await ask(lr, 'Project name', defaultName);
    const language = await askChoice(lr, 'Language', ['typescript', 'python', 'other'], 'typescript');
    const source = await ask(lr, 'Source directory', 'src/');
    const tests = await ask(lr, 'Tests directory', 'tests/');
    const docs = await ask(lr, 'Docs directory', 'docs/');
    console.log('\n--- Documentation Paths ---\n');
    const changelogResult = await askPathWithStatus(lr, 'Changelog file', 'CHANGELOG.md', targetPath);
    const decisionsResult = await askPathWithStatus(lr, 'Decisions file', 'docs/DECISIONS.md', targetPath);
    const knowledgeResult = await askPathWithStatus(lr, 'Knowledge base directory', 'docs/knowledge/', targetPath);
    console.log('\n--- Models ---\n');
    const standardModel = await ask(lr, 'Standard model', DEFAULT_MODELS.standard);
    const criticalModel = await ask(lr, 'Critical model', DEFAULT_MODELS.critical);
    console.log('\n--- Build Commands ---\n');
    const buildCmd = await ask(lr, 'Build command', language === 'python' ? 'python -m build' : 'npm run build');
    const testCmd = await ask(lr, 'Test command', language === 'python' ? 'pytest' : 'npm test');
    const lintCmd = await ask(lr, 'Lint command', language === 'python' ? 'ruff check .' : 'npm run lint');
    const securityCmd = await ask(lr, 'Security command', language === 'python' ? 'bandit -r .' : 'npm audit');
    lr.close();
    const config = {
        projectName,
        language,
        commands: {
            build: buildCmd,
            test: testCmd,
            lint: lintCmd,
            security: securityCmd,
        },
        riskMatrix: DEFAULT_CONFIG.riskMatrix,
        paths: {
            source,
            tests,
            docs,
            superpowers: docs.endsWith('/') ? docs + 'superpowers/' : docs + '/superpowers/',
            specs: docs.endsWith('/') ? docs + 'superpowers/specs/' : docs + '/superpowers/specs/',
            plans: docs.endsWith('/') ? docs + 'superpowers/plans/' : docs + '/superpowers/plans/',
            changelog: changelogResult.path || DEFAULT_PATHS.changelog,
            readme: 'README.md',
            decisions: decisionsResult.path || null,
            knowledge: knowledgeResult.path || null,
            taskRegistry: '.agentic/TASK_REGISTRY.json',
        },
        models: {
            standard: standardModel,
            critical: criticalModel,
        },
    };
    return config;
}
export function applyPathSetup(targetPath, config, changelogStatus, decisionsStatus, knowledgeStatus) {
    const p = config.paths;
    if (changelogStatus === 'create' && p.changelog) {
        ensurePathExists(targetPath, p.changelog);
        const fullPath = join(targetPath, p.changelog);
        if (existsSync(fullPath) && readFileSync(fullPath, 'utf-8') === '') {
            writeFileSync(fullPath, `# Changelog\n\nAll notable changes to ${config.projectName} will be documented in this file.\n`);
        }
    }
    if (decisionsStatus === 'create' && p.decisions) {
        ensurePathExists(targetPath, p.decisions);
        const fullPath = join(targetPath, p.decisions);
        if (existsSync(fullPath) && readFileSync(fullPath, 'utf-8') === '') {
            writeFileSync(fullPath, `# Architecture Decisions — ${config.projectName}\n\nThis file documents key architecture decisions, phase plans, and status updates.\n`);
        }
    }
    if (knowledgeStatus === 'create' && p.knowledge) {
        ensurePathExists(targetPath, p.knowledge);
    }
    ensurePathExists(targetPath, p.superpowers);
    ensurePathExists(targetPath, p.specs);
    ensurePathExists(targetPath, p.plans);
}
export async function init(targetPath, options) {
    let config;
    if (options?.wizard === false) {
        config = { ...DEFAULT_CONFIG };
    }
    else {
        config = await runWizard(targetPath);
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
    }
    writeAgenticFiles(targetPath, config);
    writeOpencodeFiles(targetPath, config);
    console.log(`\nInitialized Kiki in ${targetPath}`);
    console.log(`  Project: ${config.projectName}`);
    console.log(`  Language: ${config.language}`);
    console.log(`  Standard model: ${config.models.standard}`);
    console.log(`  Critical model: ${config.models.critical}`);
    if (config.paths.decisions)
        console.log(`  Decisions: ${config.paths.decisions}`);
    if (config.paths.knowledge)
        console.log(`  Knowledge: ${config.paths.knowledge}`);
}
//# sourceMappingURL=init.js.map