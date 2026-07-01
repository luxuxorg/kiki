import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { init } from '../../src/cli/commands/init';
import { update } from '../../src/cli/commands/update';
import { DEFAULT_CONFIG, generateOrchestratorTemplate } from '../../src/cli/config';
import { setRoutingPath } from '../../src/core/routing-table';

describe('cli update', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = `tmp/cli-update-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await fs.mkdir(tmpDir, { recursive: true });
    setRoutingPath(path.join(tmpDir, '.agentic/kiki/routing.json'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('fails gracefully when no .agentic/ exists', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(update(tmpDir)).rejects.toThrow('process.exit(1)');
    expect(errorSpy).toHaveBeenCalledWith("No Kiki installation found. Run 'kiki init' first.");

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('overwrites .opencode files', async () => {
    await init(tmpDir, { wizard: false });
    // Modify an .opencode file
    await fs.writeFile(path.join(tmpDir, '.opencode/agents/kiki-orchestrator.md'), 'CUSTOM CONTENT');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await update(tmpDir);
    logSpy.mockRestore();

    const orchestrator = await fs.readFile(path.join(tmpDir, '.opencode/agents/kiki-orchestrator.md'), 'utf-8');
    const expected = generateOrchestratorTemplate(DEFAULT_CONFIG);
    expect(orchestrator).toBe(expected);
  });

  it('writes kiki-gui-designer.md to .opencode/agents/', async () => {
    await init(tmpDir, { wizard: false });
    // Remove the gui-designer file to prove update recreates it
    await fs.rm(path.join(tmpDir, '.opencode/agents/kiki-gui-designer.md'));

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await update(tmpDir);
    logSpy.mockRestore();

    const guiDesigner = await fs.readFile(path.join(tmpDir, '.opencode/agents/kiki-gui-designer.md'), 'utf-8');
    expect(guiDesigner).toContain('Kiki GUI Designer');
    expect(guiDesigner).toContain('mode: subagent');
  });

  it('writes routing.json with agents map to .agentic/kiki/', async () => {
    await init(tmpDir, { wizard: false });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await update(tmpDir);
    logSpy.mockRestore();

    const routing = JSON.parse(await fs.readFile(path.join(tmpDir, '.agentic/kiki/routing.json'), 'utf-8'));
    expect(routing.agents).toBeDefined();
    expect(typeof routing.agents).toBe('object');
    expect(routing.agents['kiki-orchestrator']).toBeDefined();
    expect(routing.agents['kiki-gui-designer']).toBeDefined();
    expect(routing.rules).toBeUndefined();
  });

  it('writes alignment.json to .agentic/kiki/', async () => {
    await init(tmpDir, { wizard: false });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await update(tmpDir);
    logSpy.mockRestore();

    const alignment = JSON.parse(await fs.readFile(path.join(tmpDir, '.agentic/kiki/alignment.json'), 'utf-8'));
    expect(alignment.guardrails).toBeDefined();
    expect(alignment.compliance).toContain('OWASP Top 10');
  });
});
