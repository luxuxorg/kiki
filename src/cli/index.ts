#!/usr/bin/env node
import { init } from './commands/init';
import { status } from './commands/status';
import { verify } from './commands/verify';
import { updateBenchmarks } from './commands/update-benchmarks';
import { updatePricing } from './commands/update-pricing';

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
    case 'update-benchmarks':
      await updateBenchmarks();
      break;
    case 'update-pricing':
      await updatePricing();
      break;
    default:
      console.log(`Usage: kiki <command>
Commands:
  init [path]          Scaffold .agentic/ directory
  status               Show task registry + routing summary
  verify <file>        Check for TBDs/TODOs/placeholders
  update-benchmarks    Scrape BridgeBench and rebuild routing table
  update-pricing       Fetch OpenRouter pricing and rebuild routing table`);
      process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
