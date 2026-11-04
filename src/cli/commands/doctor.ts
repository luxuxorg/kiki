import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { loadConfig } from '../config.js';
import { discoverSkills, observeSkills } from '../doctor-skills.js';
import { AGENT_NAMES, globalDirectory, mergeSettings, readOpenCodeSettings } from '../opencode-config.js';

export async function doctor(targetPath = '.'): Promise<void> {
  console.log(`Kiki Doctor — ${targetPath}`);
  let failures = 0;
  let passes = 0;
  let warnings = 0;
  const check = (label: string, level: 'pass' | 'warn' | 'fail', detail = '') => {
    console.log(`${level === 'pass' ? '✓' : level === 'warn' ? '!' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
    if (level === 'pass') passes++;
    else if (level === 'warn') warnings++;
    else failures++;
  };
  const info = (label: string, detail = '') =>
    console.log(`• ${label}${detail ? ` — ${detail}` : ''}`);
  const outcome = (ok: boolean): 'pass' | 'fail' => (ok ? 'pass' : 'fail');
  // Legacy model sections are inert: report their presence only, never values.
  const reportLegacyModels = () => {
    const modern = join(targetPath, '.agentic', 'kiki', 'config.json');
    const legacy = join(targetPath, '.agentic', 'config.json');
    const configPath = existsSync(modern) ? modern : legacy;
    if (!existsSync(configPath)) return;
    try {
      const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (raw && typeof raw === 'object' && 'models' in raw) {
        info('legacy models section present; ignored', 'models are configured via /kiki or OpenCode config');
      }
    } catch {
      // Malformed configuration is handled by loadConfig and the path checks below.
    }
  };
  const global = globalDirectory();
  const globalConfig = readOpenCodeSettings(global, true);
  const project = readOpenCodeSettings(targetPath);
  const agents = mergeSettings(globalConfig.agent || {}, project.agent || {});
  for (const name of AGENT_NAMES) {
    check(`global agent: ${name}`, outcome(!!globalConfig.agent?.[name]));
    const model = agents[name]?.model ?? project.model ?? globalConfig.model;
    const detail = typeof model === 'string' && model.trim()
      ? model
      : 'inherits OpenCode default; set via /kiki';
    check(`agent ${name} model`, 'pass', detail);
    check(`prompt: ${name}`, outcome(existsSync(join(global, 'kiki/prompts', `${name}.md`))));
  }
  check('global plugin: kiki.ts', outcome(existsSync(join(global, 'plugins/kiki.ts'))));
  check('global workflow', outcome(existsSync(join(global, 'kiki/agentic-workflow.md'))));
  for (const folder of ['plugin', 'plugins']) {
    for (const extension of ['ts', 'js']) {
      const local = join(targetPath, '.opencode', folder, `kiki.${extension}`);
      if (existsSync(local)) check('duplicate local Kiki plugin', 'fail', 'Run kiki migrate --project <path>');
    }
  }
  if (existsSync(join(targetPath, '.agentic/kiki/routing.json'))) {
    check('legacy routing.json', 'fail', 'Run kiki migrate --project <path> to preserve models in OpenCode configuration');
  }
  if (existsSync(join(targetPath, '.agentic/kiki/config.json')) || existsSync(join(targetPath, '.agentic/config.json'))) {
    reportLegacyModels();
    const config = loadConfig(targetPath);
    check('config.projectName', outcome(!!config.projectName && config.projectName !== 'my-project'));
    for (const [name, command] of Object.entries(config.commands)) {
      check(`config.commands.${name}`, outcome(typeof command === 'string' && !!command.trim()));
    }
    for (const name of ['source', 'tests', 'docs', 'superpowers', 'specs', 'plans', 'readme', 'changelog', 'decisions', 'knowledge'] as const) {
      const value = config.paths[name];
      if (value) check(`paths.${name}`, outcome(existsSync(join(targetPath, value))), value);
    }
  } else {
    console.log('No project metadata; using global defaults.');
  }
  console.log('Skill checks verify files on disk; they cannot confirm OpenCode plugin registration or live availability in a running session.');
  for (const observation of observeSkills(discoverSkills(targetPath))) {
    if (observation.level === 'info') info(observation.label, observation.detail);
    else check(observation.label, observation.level, observation.detail);
  }
  console.log(`${passes} passed, ${warnings} warnings, ${failures} failed`);
  if (failures) process.exit(1);
}
