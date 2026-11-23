#!/usr/bin/env node
import { install } from './commands/install.js';
import { init } from './commands/init.js';
import { update } from './commands/update.js';
import { status } from './commands/status.js';
import { stats } from './commands/stats.js';
import { verify } from './commands/verify.js';
import { release } from './commands/release.js';
import { doctor } from './commands/doctor.js';
import { reset } from './commands/reset.js';
import { permissions } from './commands/permissions.js';
const args = process.argv.slice(2);
const command = args[0];
async function main() {
    switch (command) {
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
        case 'stats': {
            const code = await stats(args[1] ?? '.');
            if (code !== 0)
                process.exit(code);
            break;
        }
        case 'verify':
            await verify(args[1]);
            break;
        case 'doctor':
            await doctor(args[1] ?? '.');
            break;
        case 'release':
            await release(args.slice(1));
            break;
        case 'permissions': {
            const code = await permissions(args.slice(1));
            if (code !== 0)
                process.exit(code);
            break;
        }
        default:
            console.log(`Usage: kiki <command>
Commands:
  install              Install global native agents and Kiki package registration
  install --project <path>  Scaffold .agentic/kiki/ in a project
  init [path]          Initialize project configuration only
  update [--global]    Refresh global Kiki installation; preserve project settings
  reset --project <path>    Remove project Kiki agent overrides after backup
  status [path]       Show global/project configuration
  stats [path]        Summarize local usage diagnostics (read-only)
  verify <file>        Check for TBDs/TODOs/placeholders
  doctor [path]        Validate config, paths, agent files, and skills
  permissions <cmd>    Inspect project permissions or preview/apply narrow project grants
  release [options]    Validate (default) or apply a local release candidate`);
            process.exitCode = !command || command === '--help' || command === '-h' ? 0 : 1;
    }
}
main().catch(err => {
    console.error(err instanceof Error ? err.message : 'Kiki command failed.');
    process.exitCode = 1;
});
//# sourceMappingURL=index.js.map