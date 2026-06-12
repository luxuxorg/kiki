import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { status } from '../../src/cli/commands/status';
import { setRoutingPath, saveRoutingTable } from '../../src/core/routing-table';
import type { RoutingTable } from '../../src/types';

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

  it('exits with error when .agentic is missing', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(status(tmpDir)).rejects.toThrow('process.exit(1)');
    expect(errorSpy).toHaveBeenCalledWith('No .agentic/ directory found. Run "kiki init" first.');

    exitSpy.mockRestore();
    errorSpy.mockRestore();
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
    expect(logs).toContain('Total tasks: 3');
    expect(logs).toContain('completed: 1');
    expect(logs).toContain('in_progress: 2');

    logSpy.mockRestore();
  });

  it('shows routing table when present', async () => {
    await fs.mkdir(path.join(tmpDir, '.agentic'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, '.agentic/TASK_REGISTRY.json'), JSON.stringify({ tasks: [] }, null, 2));

    const table: RoutingTable = {
      version: '1.0.0',
      generatedAt: '2024-01-01T00:00:00.000Z',
      sources: {
        benchmarks: 'BridgeBench',
        pricing: 'OpenRouter'
      },
      rules: [
        {
          skill: 'brainstorming',
          domain: 'general',
          risk: 'low',
          model: 'openai/gpt-4o',
          scorePerDollar: 10.5,
          benchmarkScore: 88,
          costPer1k: 8.4,
          reason: 'Best'
        }
      ],
      projectDefaults: { foo: 'bar' }
    };
    saveRoutingTable(table);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await status(tmpDir);

    const logs = logSpy.mock.calls.map(c => c[0]).join('\n');
    expect(logs).toContain('Routing Table');
    expect(logs).toContain('2024-01-01T00:00:00.000Z');
    expect(logs).toContain('Rules: 1');
    expect(logs).toContain('Project defaults: 1');

    logSpy.mockRestore();
  });

  it('shows no routing table message when missing', async () => {
    await fs.mkdir(path.join(tmpDir, '.agentic'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, '.agentic/TASK_REGISTRY.json'), JSON.stringify({ tasks: [] }, null, 2));

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await status(tmpDir);

    const logs = logSpy.mock.calls.map(c => c[0]).join('\n');
    expect(logs).toContain('No routing table found');

    logSpy.mockRestore();
  });
});
