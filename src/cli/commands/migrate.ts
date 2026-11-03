import { parseScope } from '../args.js';
import { migrateProject } from '../opencode-config.js';

export async function migrate(args: string[]): Promise<void> {
  const { project, help } = parseScope(args, 'migrate', true);
  if (help) { console.log('Usage: kiki migrate --project <path> — preserve rights/models, back up and remove local Kiki copies.'); return; }
  if (!project) throw new Error('Usage: kiki migrate --project <path>');
  migrateProject(project);
}
