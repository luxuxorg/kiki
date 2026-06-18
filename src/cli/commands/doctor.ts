import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { KikiConfig, DEFAULT_CONFIG, loadConfig } from '../config.js';

interface CheckResult {
  ok: boolean;
  message: string;
  detail?: string;
}

function check(label: string, ok: boolean, detail?: string): CheckResult {
  return { ok, message: label, detail };
}

function checkPathExists(targetPath: string, relPath: string, label: string): CheckResult {
  const fullPath = join(targetPath, relPath);
  return check(label, existsSync(fullPath), existsSync(fullPath) ? undefined : `Missing: ${relPath}`);
}

function checkPathsConfig(config: KikiConfig, targetPath: string): CheckResult[] {
  const results: CheckResult[] = [];
  const p = config.paths;

  const requiredPaths: Array<[string, string]> = [
    ['source', p.source],
    ['tests', p.tests],
    ['docs', p.docs],
    ['superpowers', p.superpowers],
    ['specs', p.specs],
    ['plans', p.plans],
    ['changelog', p.changelog],
    ['readme', p.readme],
    ['taskRegistry', p.taskRegistry],
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

function checkModels(config: KikiConfig): CheckResult[] {
  const results: CheckResult[] = [];

  if (!config.models.standard || config.models.standard.trim() === '') {
    results.push(check('models.standard', false, 'Standard model is empty'));
  } else {
    results.push(check(`models.standard (${config.models.standard})`, true));
  }

  if (!config.models.critical || config.models.critical.trim() === '') {
    results.push(check('models.critical', false, 'Critical model is empty'));
  } else {
    results.push(check(`models.critical (${config.models.critical})`, true));
  }

  return results;
}

function checkRoutingTable(targetPath: string): CheckResult[] {
  const results: CheckResult[] = [];
  const routingPath = join(targetPath, '.agentic', 'routing.json');

  if (!existsSync(routingPath)) {
    results.push(check('.agentic/routing.json', false, 'File missing'));
    return results;
  }

  try {
    const raw = JSON.parse(readFileSync(routingPath, 'utf-8'));
    const rules = raw?.rules;
    if (!rules || typeof rules !== 'object') {
      results.push(check('routing.json rules', false, 'No rules object found'));
      return results;
    }

    const ruleCount = Object.keys(rules).length;
    if (ruleCount === 0) {
      results.push(check('routing.json rules', false, 'No routing rules defined'));
    } else {
      results.push(check(`routing.json rules (${ruleCount} rules)`, true));
    }

    let emptyModelCount = 0;
    for (const [key, rule] of Object.entries(rules)) {
      const r = rule as { standard?: string; critical?: string };
      if (!r.standard || r.standard.trim() === '') {
        emptyModelCount++;
        results.push(check(`routing rule ${key}`, false, 'standard model is empty'));
      }
    }
    if (emptyModelCount === 0) {
      results.push(check('All routing rules have standard model', true));
    }
  } catch {
    results.push(check('.agentic/routing.json', false, 'Invalid JSON'));
  }

  return results;
}

function checkAgentFiles(targetPath: string): CheckResult[] {
  const results: CheckResult[] = [];
  const expectedAgents = [
    'kiki-orchestrator.md',
    'kiki-brainstormer.md',
    'kiki-planner.md',
    'kiki-implementer.md',
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

function checkOrchestratorNoPermissions(targetPath: string): CheckResult[] {
  const results: CheckResult[] = [];
  const orchPath = join(targetPath, '.opencode', 'agents', 'kiki-orchestrator.md');

  if (!existsSync(orchPath)) {
    return results;
  }

  const content = readFileSync(orchPath, 'utf-8');
  const frontmatter = content.split('---')[1] ?? '';

  if (frontmatter.includes('permission:')) {
    results.push(check('orchestrator has no permission block', false, 'mode: primary + permissions crashes OpenCode'));
  } else {
    results.push(check('orchestrator has no permission block', true));
  }

  return results;
}

function checkConfigFields(config: KikiConfig): CheckResult[] {
  const results: CheckResult[] = [];

  if (!config.projectName || config.projectName === 'my-project') {
    results.push(check('config.projectName', false, 'Still using default "my-project"'));
  } else {
    results.push(check(`config.projectName (${config.projectName})`, true));
  }

  if (!config.commands.build) {
    results.push(check('config.commands.build', false, 'Build command is empty'));
  } else {
    results.push(check(`config.commands.build (${config.commands.build})`, true));
  }

  if (!config.commands.test) {
    results.push(check('config.commands.test', false, 'Test command is empty'));
  } else {
    results.push(check(`config.commands.test (${config.commands.test})`, true));
  }

  const defaultPaths = JSON.stringify(DEFAULT_CONFIG.paths);
  const configPaths = JSON.stringify(config.paths);
  if (defaultPaths === configPaths) {
    results.push(check('config.paths customized', false, 'Still using all default paths'));
  } else {
    results.push(check('config.paths customized', true));
  }

  return results;
}

export async function doctor(targetPath: string = '.'): Promise<void> {
  console.log(`\n🔍 Kiki Doctor — checking ${targetPath}\n`);

  const config = loadConfig(targetPath);
  let allResults: CheckResult[] = [];

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
    if (result.ok) passCount++;
    else failCount++;
  }

  console.log(`\n${passCount} passed, ${failCount} failed`);

  if (failCount > 0) {
    console.log('\n💡 Run `kiki update` to fix template issues, or `kiki init` to reconfigure.');
    process.exit(1);
  }
}
