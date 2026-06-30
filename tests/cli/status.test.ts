import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { status } from '../../src/cli/commands/status';
import { setRoutingPath, saveRoutingTable } from '../../src/core/routing-table';
import type { StaticRoutingTable } from '../../src/types';

describe('cli status', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = `tmp/cli-status-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await fs.mkdir(tmpDir, { recursive: true });
    setRoutingPath(path.join(tmpDir, '.agentic/routing.json'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exits with error when .agentic is missing', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(status(tmpDir)).rejects.toThrow('process.exit(1)');
    expect(errorSpy).toHaveBeenCalledWith('\nNo .agentic/ directory found. Run "kiki init" or "kiki install --project ." first.');

    exitSpy.mockRestore();
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('shows task registry summary', async () => {
    await fs.mkdir(path.join(tmpDir, '.agentic'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, '.agentic/TASK_REGISTRY.json'),
      JSON.stringify({
        tasks: [
          { taskId: '1', status: 'completed' },
          { taskId: '2', status: 'in_progress' },
          { taskId: '3', status: 'in_progress' }
        ]
      }, null, 2)
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await status(tmpDir);

    const logs = logSpy.mock.calls.map(c => c[0]).join('\n');
    expect(logs).toContain('=== Global Installation ===');
    expect(logs).toContain('=== Project State ===');
    expect(logs).toContain('Total tasks: 3');
    expect(logs).toContain('completed: 1');
    expect(logs).toContain('in_progress: 2');

    logSpy.mockRestore();
  });

  it('shows routing table when present', async () => {
    await fs.mkdir(path.join(tmpDir, '.agentic', 'kiki'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, '.agentic', 'kiki', 'TASK_REGISTRY.json'), JSON.stringify({ tasks: [] }, null, 2));

    const table: StaticRoutingTable = {
      rules: {
        'brainstorming:general': { standard: 'openai/gpt-4o' }
      }
    };
    const routingPath = path.join(tmpDir, '.agentic', 'kiki', 'routing.json');
    await fs.writeFile(routingPath, JSON.stringify(table, null, 2));

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await status(tmpDir);

    const logs = logSpy.mock.calls.map(c => c[0]).join('\n');
    expect(logs).toContain('Routing Tables');
    expect(logs).toContain('Project rules: 1');
    expect(logs).toContain('Effective rules: 1');
    expect(logs).toContain('brainstorming:general: standard=openai/gpt-4o [project]');
    expect(logs).toContain('brainstorming:');

    logSpy.mockRestore();
  });

  it('shows no routing table message when missing', async () => {
    await fs.mkdir(path.join(tmpDir, '.agentic', 'kiki'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, '.agentic', 'kiki', 'TASK_REGISTRY.json'), JSON.stringify({ tasks: [] }, null, 2));

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await status(tmpDir);

    const logs = logSpy.mock.calls.map(c => c[0]).join('\n');
    expect(logs).toContain('No routing table found');
    expect(logs).toContain('Project rules: 0');
    expect(logs).toContain('Effective rules: 0');

    logSpy.mockRestore();
  });
});
