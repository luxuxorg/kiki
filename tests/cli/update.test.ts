import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { init, DEFAULT_CONFIG, DEFAULT_ALIGNMENT, DEFAULT_ROUTING_TABLE, ORCHESTRATOR_TEMPLATE } from '../../src/cli/commands/init';
import { update } from '../../src/cli/commands/update';
import { setRoutingPath } from '../../src/core/routing-table';

describe('cli update', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = `tmp/cli-update-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await fs.mkdir(tmpDir, { recursive: true });
    setRoutingPath(path.join(tmpDir, '.agentic/routing.json'));
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
    await init(tmpDir);
    // Modify an .opencode file
    await fs.writeFile(path.join(tmpDir, '.opencode/agents/kiki-orchestrator.md'), 'CUSTOM CONTENT');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await update(tmpDir);
    logSpy.mockRestore();

    const orchestrator = await fs.readFile(path.join(tmpDir, '.opencode/agents/kiki-orchestrator.md'), 'utf-8');
    expect(orchestrator).toBe(ORCHESTRATOR_TEMPLATE);
  });

  it('smart-merges routing.json: keeps user overrides, adds new rules, removes old rules', async () => {
    await init(tmpDir);
    
    // Modify routing.json: change existing rule, add custom rule
    const userRouting = {
      rules: {
        ...DEFAULT_ROUTING_TABLE.rules,
        'brainstorming:gui': { standard: 'custom-model' },
        'custom:rule': { standard: 'custom' }
      }
    };
    await fs.writeFile(path.join(tmpDir, '.agentic/routing.json'), JSON.stringify(userRouting, null, 2));

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await update(tmpDir);
    logSpy.mockRestore();

    const routing = JSON.parse(await fs.readFile(path.join(tmpDir, '.agentic/routing.json'), 'utf-8'));
    
    // User override kept
    expect(routing.rules['brainstorming:gui'].standard).toBe('custom-model');
    
    // New default rules added (all defaults should be present)
    for (const key of Object.keys(DEFAULT_ROUTING_TABLE.rules)) {
      expect(routing.rules[key]).toBeDefined();
    }
    
    // Custom rule removed
    expect(routing.rules['custom:rule']).toBeUndefined();
  });

  it('smart-merges config.json: keeps user values, adds new keys, removes old keys', async () => {
    await init(tmpDir);
    
    // Modify config.json: change existing key, add custom key
    const userConfig = {
      ...DEFAULT_CONFIG,
      projectName: 'custom-project',
      customKey: 'custom-value'
    };
    await fs.writeFile(path.join(tmpDir, '.agentic/config.json'), JSON.stringify(userConfig, null, 2));

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await update(tmpDir);
    logSpy.mockRestore();

    const config = JSON.parse(await fs.readFile(path.join(tmpDir, '.agentic/config.json'), 'utf-8'));
    
    // User override kept
    expect(config.projectName).toBe('custom-project');
    
    // Default keys present
    expect(config.language).toBe(DEFAULT_CONFIG.language);
    
    // Custom key removed
    expect(config.customKey).toBeUndefined();
  });

  it('smart-merges alignment.json: keeps user values, adds new keys, removes old keys', async () => {
    await init(tmpDir);
    
    // Modify alignment.json: change existing key, add custom key
    const userAlignment = {
      ...DEFAULT_ALIGNMENT,
      guardrails: ['Custom guardrail'],
      customKey: 'custom-value'
    };
    await fs.writeFile(path.join(tmpDir, '.agentic/alignment.json'), JSON.stringify(userAlignment, null, 2));

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await update(tmpDir);
    logSpy.mockRestore();

    const alignment = JSON.parse(await fs.readFile(path.join(tmpDir, '.agentic/alignment.json'), 'utf-8'));
    
    // User override kept
    expect(alignment.guardrails).toEqual(['Custom guardrail']);
    
    // Default keys present
    expect(alignment.compliance).toEqual(DEFAULT_ALIGNMENT.compliance);
    
    // Custom key removed
    expect(alignment.customKey).toBeUndefined();
  });

  it('does NOT touch TASK_REGISTRY.json', async () => {
    await init(tmpDir);
    
    const userRegistry = { tasks: [{ taskId: '1', status: 'completed' }] };
    await fs.writeFile(path.join(tmpDir, '.agentic/TASK_REGISTRY.json'), JSON.stringify(userRegistry, null, 2));

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await update(tmpDir);
    logSpy.mockRestore();

    const registry = JSON.parse(await fs.readFile(path.join(tmpDir, '.agentic/TASK_REGISTRY.json'), 'utf-8'));
    expect(registry.tasks).toHaveLength(1);
    expect(registry.tasks[0].taskId).toBe('1');
  });
});
