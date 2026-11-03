#!/usr/bin/env node
import { install } from './commands/install.js';
import { init } from './commands/init.js';
import { update } from './commands/update.js';
import { status } from './commands/status.js';
import { verify } from './commands/verify.js';
import { doctor } from './commands/doctor.js';
import { routing } from './commands/routing.js';
import { migrate } from './commands/migrate.js';
import { reset } from './commands/reset.js';

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case 'migrate':
      await migrate(args.slice(1));
      break;
    case 'reset':
      await reset(args.slice(1));
      break;
    case 'install':
      await install(args.slice(1));
      break;
    case 'init':
      await init(args.slice(1));
      break;
    case 'update':
      await update(args.slice(1));
      break;
    case 'status':
      await status(args[1] ?? '.');
      break;
    case 'verify':
      await verify(args[1]);
      break;
    case 'doctor':
      await doctor(args[1] ?? '.');
      break;
    case 'routing': {
      const code = await routing(args.slice(1));
      if (code !== 0) process.exit(code);
      break;
    }
    default:
      console.log(`Usage: kiki <command>
Commands:
  install              Install global JSON agents, prompts and plugin
  install --project <path>  Scaffold .agentic/kiki/ in a project
  init [path]          Initialize project configuration only
  update [--global]    Refresh global Kiki; preserve project settings
  migrate --project <path>  Extract local rights/models and remove duplicate copies
  reset --project <path>    Reset Kiki agent overrides to global defaults
  status [path]       Show global/project configuration
  routing             Retired; configure agent models in opencode.json
  verify <file>        Check for TBDs/TODOs/placeholders
  doctor [path]        Validate config, paths, models, and agent files`);
      process.exitCode = !command || command === '--help' || command === '-h' ? 0 : 1;
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : 'Kiki command failed.');
  process.exitCode = 1;
});
