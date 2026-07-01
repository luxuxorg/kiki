import * as readline from 'readline';
import { basename } from 'path';
import {
  KikiConfig,
  DEFAULT_CONFIG,
  DEFAULT_PATHS,
  DEFAULT_MODELS,
  DEFAULT_ROUTING_TABLE,
  DEFAULT_ALIGNMENT,
  ensurePathExists,
  writeOpencodeFiles,
} from '../config.js';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { install } from './install.js';

class LineReader {
  private rl: readline.Interface;
  private queue: string[] = [];
  private waiting: ((line: string) => void) | null = null;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });
    this.rl.on('line', (line: string) => {
      if (this.waiting) {
        const cb = this.waiting;
        this.waiting = null;
        cb(line);
      } else {
        this.queue.push(line);
      }
    });
  }

  question(prompt: string): Promise<string> {
    process.stdout.write(prompt);
    return new Promise((resolve) => {
      if (this.queue.length > 0) {
        resolve(this.queue.shift()!);
      } else {
        this.waiting = resolve;
      }
    });
  }

  close(): void {
    this.rl.close();
  }
}

function ask(lr: LineReader, question: string, defaultVal: string): Promise<string> {
  const suffix = defaultVal ? ` [${defaultVal}]` : '';
  return lr.question(`${question}${suffix}: `).then((answer) => answer.trim() || defaultVal);
}

function askChoice(lr: LineReader, question: string, options: string[], defaultVal: string): Promise<string> {
  const opts = options.join('/');
  const suffix = defaultVal ? ` [${defaultVal}]` : '';
  return lr.question(`${question} (${opts})${suffix}: `).then((answer) => (answer.trim().toLowerCase() || defaultVal));
}

async function askPathWithStatus(
  lr: LineReader,
  label: string,
  defaultPath: string,
  targetPath: string,
): Promise<{ path: string; status: 'exists' | 'create' | 'skip' }> {
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

export async function runWizard(targetPath: string): Promise<KikiConfig> {
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
  const workhorseModel = await ask(lr, 'Workhorse model', DEFAULT_MODELS.workhorse);

  console.log('\n--- Build Commands ---\n');
  const buildCmd = await ask(lr, 'Build command', language === 'python' ? 'python -m build' : 'npm run build');
  const testCmd = await ask(lr, 'Test command', language === 'python' ? 'pytest' : 'npm test');
  const lintCmd = await ask(lr, 'Lint command', language === 'python' ? 'ruff check .' : 'npm run lint');
  const securityCmd = await ask(lr, 'Security command', language === 'python' ? 'bandit -r .' : 'npm audit');

  lr.close();

  const config: KikiConfig = {
    projectName,
    language,
    commands: {
      build: buildCmd,
      test: testCmd,
      lint: lintCmd,
      security: securityCmd,
    },
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
      taskRegistry: '.agentic/kiki/TASK_REGISTRY.json',
    },
    models: {
      standard: standardModel,
      critical: criticalModel,
      workhorse: workhorseModel,
    },
  };

  return config;
}

export function applyPathSetup(
  targetPath: string,
  config: KikiConfig,
  changelogStatus: string,
  decisionsStatus: string,
  knowledgeStatus: string,
): void {
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

/**
 * Backward-compatible init: supports both string path and args array.
 * When wizard=false, writes defaults directly without interactive prompt.
 */
export async function init(args: string[] | string, options?: { wizard?: boolean }): Promise<void> {
  const targetPath = typeof args === 'string' ? args : (args[0] ?? '.');

  if (options?.wizard === false) {
    // Legacy behavior: write defaults directly
    const config = { ...DEFAULT_CONFIG };
    const agenticDir = join(targetPath, '.agentic');
    const kikiDir = join(agenticDir, 'kiki');

    if (!existsSync(agenticDir)) mkdirSync(agenticDir, { recursive: true });
    if (!existsSync(kikiDir)) mkdirSync(kikiDir, { recursive: true });

    writeFileSync(join(kikiDir, 'config.json'), JSON.stringify(config, null, 2));
    writeFileSync(join(kikiDir, 'routing.json'), JSON.stringify(DEFAULT_ROUTING_TABLE, null, 2));
    writeFileSync(join(kikiDir, 'alignment.json'), JSON.stringify(DEFAULT_ALIGNMENT, null, 2));
    writeFileSync(join(kikiDir, 'TASK_REGISTRY.json'), JSON.stringify({ tasks: [] }, null, 2));

    // Backward compat: also scaffold .opencode/ files
    writeOpencodeFiles(targetPath, config);
  } else {
    await install(['--project', targetPath]);
  }
}
