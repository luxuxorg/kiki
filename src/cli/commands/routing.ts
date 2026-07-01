import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { StaticRoutingTable } from '../../types.js';

interface SyncResult {
  readonly changed: boolean;
  readonly content: string;
}

function parseArgs(args: string[]): { projectPath: string; check: boolean } {
  const check = args.includes('--check');
  const projectPath = args.find(arg => arg !== '--check') ?? '.';
  return { projectPath, check };
}

function loadProjectRouting(projectPath: string): StaticRoutingTable | null {
  const paths = [
    join(projectPath, '.agentic', 'kiki', 'routing.json'),
  ];

  for (const routingPath of paths) {
    if (!existsSync(routingPath)) continue;
    try {
      const parsed = JSON.parse(readFileSync(routingPath, 'utf-8'));
      if (!parsed || typeof parsed !== 'object') return null;
      return {
        agents: typeof parsed.agents === 'object' && parsed.agents ? parsed.agents : undefined,
      };
    } catch {
      return null;
    }
  }

  return null;
}

function syncModelFrontmatter(content: string, model: string): SyncResult | null {
  const lines = content.split('\n');
  if (lines[0] !== '---') return null;

  const end = lines.findIndex((line, index) => index > 0 && line === '---');
  if (end < 0) return null;

  const frontmatter = lines.slice(1, end);
  const modelIndex = frontmatter.findIndex(line => /^model:\s*/.test(line));

  if (modelIndex >= 0) {
    frontmatter[modelIndex] = `model: ${model}`;
  } else {
    const modeIndex = frontmatter.findIndex(line => /^mode:\s*/.test(line));
    frontmatter.splice(modeIndex >= 0 ? modeIndex + 1 : frontmatter.length, 0, `model: ${model}`);
  }

  const updated = ['---', ...frontmatter, '---', ...lines.slice(end + 1)].join('\n');
  return { changed: updated !== content, content: updated };
}

function isValidAgentName(agentName: string): boolean {
  return /^kiki-[A-Za-z0-9-]+$/.test(agentName);
}

function isValidModel(model: unknown): model is string {
  return typeof model === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]*[A-Za-z0-9]$/.test(model);
}

export async function routing(args: string[] = []): Promise<number> {
  const { projectPath, check } = parseArgs(args);
  const table = loadProjectRouting(projectPath);

  if (!table?.agents || Object.keys(table.agents).length === 0) {
    console.error('No role-level agents map found in .agentic/kiki/routing.json.');
    return 1;
  }

  const agentsDir = join(projectPath, '.opencode', 'agents');
  if (!existsSync(agentsDir)) {
    console.error('No .opencode/agents directory found.');
    return 1;
  }

  let changed = false;
  let failed = false;
  const routedFiles = new Set<string>();

  for (const [agentName, model] of Object.entries(table.agents)) {
    if (!isValidAgentName(agentName)) {
      console.warn(`invalid agent name: ${agentName}`);
      failed = true;
      continue;
    }

    if (!isValidModel(model)) {
      console.warn(`invalid model for ${agentName}`);
      failed = true;
      continue;
    }

    const fileName = `${agentName}.md`;
    const agentPath = join(agentsDir, fileName);
    routedFiles.add(fileName);

    if (!existsSync(agentPath)) {
      console.warn(`missing: ${fileName}`);
      failed = true;
      continue;
    }

    const current = readFileSync(agentPath, 'utf-8');
    const result = syncModelFrontmatter(current, model);
    if (!result) {
      console.warn(`invalid frontmatter: ${fileName}`);
      failed = true;
      continue;
    }

    if (result.changed) {
      changed = true;
      if (check) {
        console.log(`stale: ${fileName}`);
      } else {
        writeFileSync(agentPath, result.content);
        console.log(`updated: ${fileName}`);
      }
    }
  }

  for (const fileName of readdirSync(agentsDir)) {
    if (fileName.startsWith('kiki-') && fileName.endsWith('.md') && !routedFiles.has(fileName)) {
      console.warn(`unrouted: ${fileName}`);
      failed = true;
    }
  }

  if (!changed && !failed) {
    console.log('Routing is up to date.');
  }

  if (check) return changed || failed ? 1 : 0;
  return failed ? 1 : 0;
}
