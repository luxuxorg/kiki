import { parseMigrationArgs } from '../args.js';
import { globalDirectory } from '../opencode-config.js';
import { migrateOC1 } from '../oc2-migration.js';

export async function migrate(args: string[]): Promise<void> {
  const options = parseMigrationArgs(args);
  if (options.help) {
    console.log('Usage: kiki migrate [--from <dir>] [--project <path>] [--force] — preserve OC1 models/permissions in OC2, back up, and remove redundant project copies.');
    return;
  }
  const destination = options.project ?? globalDirectory();
  const report = migrateOC1({
    ...(options.from !== undefined ? { from: options.from } : {}),
    ...(options.project !== undefined ? { project: options.project } : {}),
    force: options.force,
    destination,
  });
  console.log(`Migrated agents: ${report.migrated.length ? report.migrated.join(', ') : 'none'}`);
  for (const entry of report.rejected) console.log(`Rejected ${entry.agent}: ${entry.reason}`);
  if (report.manual.length) console.log(`Manual migration required (names only): ${report.manual.join(', ')}`);
  if (report.marker) console.log(`Migration marker: ${report.marker}`);
  if (report.exitCode !== 0) process.exitCode = 1;
}
