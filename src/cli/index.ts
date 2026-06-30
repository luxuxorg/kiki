#!/usr/bin/env node
import { install } from './commands/install.js';
import { init } from './commands/init.js';
import { update } from './commands/update.js';
import { status } from './commands/status.js';
import { verify } from './commands/verify.js';
import { doctor } from './commands/doctor.js';

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
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
      await status();
      break;
    case 'verify':
      await verify(args[1]);
      break;
    case 'doctor':
      await doctor(args[1] ?? '.');
      break;
    default:
      console.log(`Usage: kiki <command>
Commands:
  install              Install Kiki globally (agents + plugin + defaults)
  install --project <path>  Scaffold .agentic/kiki/ in a project
  install --force      Overwrite existing global files
  init [path]          Alias for install --project [path]
  update [path]        Alias for install --project [path] --force
  status               Show task registry + routing summary
  verify <file>        Check for TBDs/TODOs/placeholders
  doctor [path]        Validate config, paths, models, and agent files`);
      process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
