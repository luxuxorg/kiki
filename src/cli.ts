#!/usr/bin/env node
import { scaffold } from './scaffold.js';
import { checkScaffolding, readTaskRegistry, auditContent } from './lib.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);

if (args.length === 0) {
  printHelp();
  process.exit(0);
}

const command = args[0];

function printHelp() {
  console.log('Kiki — General-purpose meta-framework for LLM-driven software engineering\n');
  console.log('Usage:');
  console.log('  kiki init [project-path]     Scaffolds the Kiki pipeline, configs, and agents.');
  console.log('  kiki status                  Checks scaffolding, tech stack, and risk configurations.');
  console.log('  kiki verify <report-path>    Validates design/execution logs for TBDs or placeholders.');
  console.log();
}

async function main() {
  switch (command) {
    case 'init': {
      const targetPath = args[1] ?? '.';
      await scaffold(targetPath);
      break;
    }

    case 'status': {
      const projectPath = '.';
      const isScaffolded = await checkScaffolding(projectPath);

      if (!isScaffolded) {
        console.log('\n❌ Workspace is not scaffolded with Kiki.');
        console.log('Run `kiki init` or `npx kiki init` to set up the multi-agent engine.\n');
        process.exit(1);
      }

      console.log('\n================================================================');
      console.log('Kiki Operational Status: ACTIVE & VALIDATED');
      console.log('================================================================');

      try {
        const configRaw = await fs.readFile(path.join(projectPath, '.agentic/config.json'), 'utf-8');
        const alignmentRaw = await fs.readFile(path.join(projectPath, '.agentic/alignment.json'), 'utf-8');
        const modelsRaw = await fs.readFile(path.join(projectPath, '.opencode/models.json'), 'utf-8');

        const config = JSON.parse(configRaw);
        const alignment = JSON.parse(alignmentRaw);
        const models = JSON.parse(modelsRaw);

        console.log(`\nProject Name:   ${config.project_name ?? 'unknown'}`);
        console.log(`Language:       ${config.language ?? 'unknown'}`);
        console.log(`Build Command:  \`${config.commands?.build ?? 'none'}\``);
        console.log(`Test Command:   \`${config.commands?.test ?? 'none'}\``);
        console.log(`Audit Type:     ${alignment.audit_type ?? 'none'}`);
        console.log(`Guardrails:     ${alignment.core_guardrails?.length ?? 0} active constraints`);
        console.log(`Models Defined: ${Object.keys(models.roles ?? {}).length} role configurations`);
        
        console.log('\nPaths Configured:');
        console.log(`  High Risk:     ${config.risk_matrix?.high_risk_paths?.join(', ') || 'none'}`);
        console.log(`  Critical Risk: ${config.risk_matrix?.critical_risk_paths?.join(', ') || 'none'}`);

        const registry = await readTaskRegistry(projectPath);
        console.log('\n--- Task Registry ---');
        if (!registry || !registry.tasks || registry.tasks.length === 0) {
          console.log('No tasks recorded yet.');
        } else {
          const activeTasks = registry.tasks.filter((t: any) => t.status !== 'completed').length;
          const completedTasks = registry.tasks.filter((t: any) => t.status === 'completed').length;
          console.log(`Active Tasks:    ${activeTasks}`);
          console.log(`Completed Tasks: ${completedTasks}`);
          console.log();
          for (const task of registry.tasks) {
            console.log(`  Task ${task.id}:`);
            console.log(`    Status:              ${task.status}`);
            console.log(`    Phase:               ${task.phase}`);
            console.log(`    Request:             ${task.user_request_summary}`);
            console.log(`    Spec Ref:            ${task.spec_ref}`);
            console.log(`    Plan Ref:            ${task.plan_ref}`);
            console.log(`    Phases Completed:    ${task.phases_completed?.join(', ') ?? 'none'}`);
            console.log(`    Phases Pending:      ${task.phases_pending?.join(', ') ?? 'none'}`);
            console.log();
          }
        }
      } catch (err) {
        console.log('\n⚠️ Error reading configuration files:', err instanceof Error ? err.message : String(err));
      }
      console.log('================================================================\n');
      break;
    }

    case 'verify': {
      const filePath = args[1];
      if (!filePath) {
        console.error('Error: verify requires a file path (e.g. kiki verify design-report.md)');
        process.exit(1);
      }

      const absolutePath = path.resolve(filePath);
      try {
        const content = await fs.readFile(absolutePath, 'utf-8');
        const placeholders = auditContent(content);

        console.log('\n================================================================');
        console.log(`Auditing: ${path.basename(filePath)}`);
        console.log('================================================================');
        if (placeholders.length === 0) {
          console.log('✅ Validation Succeeded! No TBDs, TODOs, or placeholders detected.');
        } else {
          console.log(`❌ Validation Failed! Found ${placeholders.length} unfinished segments:`);
          placeholders.forEach(p => console.log(`  - ${p}`));
        }
        console.log('================================================================\n');
      } catch (err) {
        console.error(`Error reading ${filePath}:`, err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

if (import.meta.url.startsWith('file://') && process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch(err => {
    console.error('Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
