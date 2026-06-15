#!/usr/bin/env node
import { init } from './commands/init.js';
import { status } from './commands/status.js';
import { verify } from './commands/verify.js';
const args = process.argv.slice(2);
const command = args[0];
async function main() {
    switch (command) {
        case 'init':
            await init(args[1] ?? '.');
            break;
        case 'status':
            await status();
            break;
        case 'verify':
            await verify(args[1]);
            break;
        default:
            console.log(`Usage: kiki <command>
Commands:
  init [path]    Scaffold .agentic/ directory with static routing table
  status         Show task registry + routing summary
  verify <file>  Check for TBDs/TODOs/placeholders`);
            process.exit(1);
    }
}
main().catch(err => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map