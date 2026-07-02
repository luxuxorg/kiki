import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { status } from '../../src/cli/commands/status';
import { setRoutingPath } from '../../src/core/routing-table';

describe('cli status', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = `tmp/cli-status-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await fs.mkdir(tmpDir, { recursive: true });
    setRoutingPath(path.join(tmpDir, '.agentic/kiki/routing.json'));
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

  it('shows agents count and model display when routing table is present', async () => {
    await fs.mkdir(path.join(tmpDir, '.agentic', 'kiki'), { recursive: true });
    const routingPath = path.join(tmpDir, '.agentic', 'kiki', 'routing.json');
    await fs.writeFile(routingPath, JSON.stringify({
      agents: {
        'kiki-orchestrator': 'moonshotai/kimi-k2.6',
        'kiki-escalation': 'anthropic/claude-sonnet-4.6',
      },
    }, null, 2));

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await status(tmpDir);

    const logs = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(logs).toContain('=== Project State ===');
    expect(logs).toContain('Project agents: 2');
    expect(logs).toContain('kiki-orchestrator: moonshotai/kimi-k2.6 [project]');
    expect(logs).toContain('kiki-escalation: anthropic/claude-sonnet-4.6 [project]');

    logSpy.mockRestore();
  });

  it('shows no routing table message when missing', async () => {
    await fs.mkdir(path.join(tmpDir, '.agentic', 'kiki'), { recursive: true });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await status(tmpDir);

    const logs = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(logs).toContain('Project agents: 0');

    logSpy.mockRestore();
  });
});
