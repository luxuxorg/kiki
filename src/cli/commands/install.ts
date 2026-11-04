import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DEFAULT_ALIGNMENT, KikiConfig } from '../config.js';
import { initializeProjectAgents, installGlobalFiles } from '../opencode-config.js';
import { parseScope } from '../args.js';
import { runWizard, applyPathSetup } from './init.js';

export function installProjectConfig(target: string, config: KikiConfig): void {
  const directory = join(target, '.agentic/kiki');
  // Parse/validate existing OpenCode settings before creating any metadata.
  initializeProjectAgents(target, config);
  mkdirSync(directory, { recursive: true });
  for (const [file, data] of Object.entries({
    'config.json': config, 'alignment.json': DEFAULT_ALIGNMENT, 'TASK_REGISTRY.json': { tasks: [] },
  })) {
    const path = join(directory, file);
    if (!existsSync(path)) writeFileSync(path, JSON.stringify(data, null, 2));
  }
  console.log(`Kiki project configuration initialized in ${target}; agents and plugin remain global.`);
}

export async function install(args: string[]): Promise<void> {
  const { project, help } = parseScope(args, 'install', true);
  if (help) { console.log('Usage: kiki install [--global] | kiki install --project <path>'); return; }
  if (!project) { installGlobalFiles(); return; }
  const configPath = join(project, '.agentic/kiki/config.json');
  if (existsSync(configPath)) {
    // Reinitialization is not a reset and must not replace project choices.
    const { loadConfig } = await import('../config.js');
    installProjectConfig(project, loadConfig(project));
    return;
  }
  const config = await runWizard(project);
  const status = (value: string | null) => !value ? 'skip' : existsSync(join(project, value)) ? 'exists' : 'create';
  applyPathSetup(project, config, status(config.paths.changelog), status(config.paths.decisions), status(config.paths.knowledge));
  installProjectConfig(project, config);
}
