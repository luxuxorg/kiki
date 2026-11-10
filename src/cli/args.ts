export interface MigrationArgs {
  from?: string;
  project?: string;
  force: boolean;
  help: boolean;
}

/** Strict parser for the one-time migration command. */
export function parseMigrationArgs(args: string[]): MigrationArgs {
  let from: string | undefined;
  let project: string | undefined;
  let force = false;
  let help = false;
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') { help = true; continue; }
    if (arg === '--force') {
      if (seen.has(arg)) throw new Error('migrate: duplicate --force.');
      seen.add(arg); force = true; continue;
    }
    if (arg === '--from' || arg === '--project') {
      if (seen.has(arg)) throw new Error(`migrate: duplicate ${arg}.`);
      seen.add(arg);
      const value = args[++i];
      if (!value || value.startsWith('-')) throw new Error(`migrate: ${arg} requires one path.`);
      if (arg === '--from') from = value; else project = value;
      continue;
    }
    throw new Error(`migrate: unsupported argument '${arg}'.`);
  }
  return { ...(from !== undefined ? { from } : {}), ...(project !== undefined ? { project } : {}), force, help };
}

export function parseScope(args: string[], command: string, allowProject: boolean): { project?: string; help: boolean } {
  let project: string | undefined;
  let global = false;
  const help = args.includes('--help') || args.includes('-h');
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h' || arg === '--force') continue;
    if (arg === '--global') { global = true; continue; }
    if (arg === '--project' && allowProject) {
      const value = args[++i];
      if (!value || value.startsWith('-') || project !== undefined) throw new Error(`${command}: --project requires one path.`);
      project = value;
      continue;
    }
    throw new Error(`${command}: unsupported argument '${arg}'. For existing projects use 'kiki migrate --project <path>'.`);
  }
  if (project && global) throw new Error('--project and --global are mutually exclusive.');
  return { project, help };
}
