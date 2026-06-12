import fs from 'node:fs/promises';
import path from 'node:path';

export async function checkScaffolding(projectPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(projectPath, '.agentic/config.json'));
    await fs.access(path.join(projectPath, '.agentic/alignment.json'));
    await fs.access(path.join(projectPath, '.opencode/models.json'));
    return true;
  } catch {
    return false;
  }
}

export async function readTaskRegistry(projectPath: string): Promise<{ version: string; tasks: any[] } | null> {
  try {
    const raw = await fs.readFile(path.join(projectPath, '.agentic/TASK_REGISTRY.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function auditContent(content: string): string[] {
  const lines = content.split('\n');
  const placeholders: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/TODO|TBD|placeholder|\[insert|\[ \] check|implement later|fill in details/i.test(line)) {
      placeholders.push(`Line ${i + 1}: ${line.trim()}`);
    }
  }
  return placeholders;
}
