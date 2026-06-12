import fs from 'node:fs/promises';
import path from 'node:path';
import * as configs from './templates/configs.js';
import * as agents from './templates/agents.js';
import * as workflow from './templates/workflow.js';
import * as registry from './templates/registry.js';

export async function scaffold(targetPath: string): Promise<void> {
  const absolutePath = path.resolve(targetPath);
  console.log(`\nInitializing Kiki development engine under: ${absolutePath}\n`);

  const dirs = [
    '.agentic',
    '.opencode',
    '.opencode/agents',
    '.opencode/docs'
  ];

  for (const dir of dirs) {
    const p = path.join(absolutePath, dir);
    await fs.mkdir(p, { recursive: true });
  }

  // 1. Write core configurations
  await fs.writeFile(path.join(absolutePath, '.agentic/config.json'), configs.DEFAULT_CONFIG, 'utf-8');
  await fs.writeFile(path.join(absolutePath, '.agentic/alignment.json'), configs.DEFAULT_ALIGNMENT, 'utf-8');
  await fs.writeFile(path.join(absolutePath, '.agentic/TASK_REGISTRY.json'), registry.TASK_REGISTRY_SKELETON, 'utf-8');
  await fs.writeFile(path.join(absolutePath, '.opencode/models.json'), configs.DEFAULT_MODELS, 'utf-8');

  // 2. Write modular agent prompt files (9 files with kiki- prefix)
  const agentFiles = [
    { name: 'kiki-orchestrator.md', content: agents.KIKI_ORCHESTRATOR },
    { name: 'kiki-brainstormer.md', content: agents.KIKI_BRAINSTORMER },
    { name: 'kiki-planner.md', content: agents.KIKI_PLANNER },
    { name: 'kiki-architect.md', content: agents.KIKI_ARCHITECT },
    { name: 'kiki-implementation-standard.md', content: agents.KIKI_IMPLEMENTATION_STANDARD },
    { name: 'kiki-implementation-complexity.md', content: agents.KIKI_IMPLEMENTATION_COMPLEXITY },
    { name: 'kiki-first-reviewer.md', content: agents.KIKI_FIRST_REVIEWER },
    { name: 'kiki-second-reviewer.md', content: agents.KIKI_SECOND_REVIEWER },
    { name: 'kiki-escalation-agent.md', content: agents.KIKI_ESCALATION_AGENT },
  ];

  for (const a of agentFiles) {
    await fs.writeFile(path.join(absolutePath, '.opencode/agents', a.name), a.content, 'utf-8');
  }

  // 3. Write operations manual
  await fs.writeFile(path.join(absolutePath, '.opencode/docs/agentic-workflow.md'), workflow.WORKFLOW, 'utf-8');

  // 4. Output dynamic ASCII completion report
  console.log('================================================================');
  console.log('     _  __ _ _ki   _  __ _ _ki');
  console.log('    | |/ /(_) |/i | |/ /(_) |/i');
  console.log("    | ' / | | ' /  | ' / | | ' /");
  console.log('    | . \\ | | . \\  | . \\ | | . \\');
  console.log('    |_|\\_\\|_|_|\\_\\ |_|\\_\\|_|_|\\_\\');
  console.log('================================================================');
  console.log('Kiki meta-framework has successfully scaffolded the workspace!');
  console.log('\nDirectories Created:');
  console.log('  ├── .agentic/                  (Configurations & task registry)');
  console.log('  │   ├── config.json            (Custom tech stack commands & risks)');
  console.log('  │   ├── alignment.json         (Ethical/Security audit gates)');
  console.log('  │   └── TASK_REGISTRY.json     (Cross-task progress tracker)');
  console.log('  └── .opencode/                 (Dynamic model orchestration)');
  console.log('      ├── models.json            (Dynamic primary, fallback, escalation routers)');
  console.log('      ├── docs/                  (Universal workflow operational manual)');
  console.log('      └── agents/                (Model-agnostic skill-mapped roles)');
  console.log('\nNext Steps:');
  console.log('  1. Open `.agentic/config.json` and customize your test/build/lint commands.');
  console.log('  2. Open `.agentic/alignment.json` and customize your system-specific guardrails.');
  console.log('  3. In opencode, type `/kiki` (or run orchestrator sub-agent) to kick off the pipeline!');
  console.log('================================================================\n');
}
