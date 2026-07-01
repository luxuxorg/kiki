import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { init } from '../../src/cli/commands/init';
import { doctor } from '../../src/cli/commands/doctor';
import { setRoutingPath } from '../../src/core/routing-table';

async function scaffoldMinimalProject(dir: string): Promise<void> {
  const config = JSON.parse(await fs.readFile(path.join(dir, '.agentic/kiki/config.json'), 'utf-8'));
  config.projectName = 'doctor-test-project';
  config.paths.docs = 'documentation/';
  config.paths.superpowers = 'documentation/superpowers/';
  config.paths.specs = 'documentation/superpowers/specs/';
  config.paths.plans = 'documentation/superpowers/plans/';
  await fs.writeFile(path.join(dir, '.agentic/kiki/config.json'), JSON.stringify(config, null, 2));

  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
  await fs.mkdir(path.join(dir, 'documentation', 'superpowers', 'specs'), { recursive: true });
  await fs.mkdir(path.join(dir, 'documentation', 'superpowers', 'plans'), { recursive: true });
  await fs.mkdir(path.join(dir, 'docs'), { recursive: true });
  await fs.writeFile(path.join(dir, 'README.md'), '# Project\n');
  await fs.writeFile(path.join(dir, 'CHANGELOG.md'), '# Changelog\n');
  await fs.writeFile(path.join(dir, 'docs', 'DECISIONS.md'), '# Decisions\n');
}

describe('cli doctor', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = `tmp/cli-doctor-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await fs.mkdir(tmpDir, { recursive: true });
    setRoutingPath(path.join(tmpDir, '.agentic/kiki/routing.json'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('passes for a complete kiki installation', async () => {
    await init(tmpDir, { wizard: false });
    await scaffoldMinimalProject(tmpDir);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await doctor(tmpDir);

    logSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('fails when commands.lint is empty', async () => {
    await init(tmpDir, { wizard: false });
    await scaffoldMinimalProject(tmpDir);

    const config = JSON.parse(await fs.readFile(path.join(tmpDir, '.agentic/kiki/config.json'), 'utf-8'));
    config.commands.lint = '';
    await fs.writeFile(path.join(tmpDir, '.agentic/kiki/config.json'), JSON.stringify(config, null, 2));

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(doctor(tmpDir)).rejects.toThrow('process.exit(1)');

    logSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('reports config.commands.lint when configured', async () => {
    await init(tmpDir, { wizard: false });
    await scaffoldMinimalProject(tmpDir);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg);
    });

    await doctor(tmpDir);

    expect(logs.some((line) => line.includes('config.commands.lint'))).toBe(true);

    logSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('fails when commands.security is empty', async () => {
    await init(tmpDir, { wizard: false });
    await scaffoldMinimalProject(tmpDir);

    const config = JSON.parse(await fs.readFile(path.join(tmpDir, '.agentic/kiki/config.json'), 'utf-8'));
    config.commands.security = '';
    await fs.writeFile(path.join(tmpDir, '.agentic/kiki/config.json'), JSON.stringify(config, null, 2));

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(doctor(tmpDir)).rejects.toThrow('process.exit(1)');

    logSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('reports config.commands.security when configured', async () => {
    await init(tmpDir, { wizard: false });
    await scaffoldMinimalProject(tmpDir);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg);
    });

    await doctor(tmpDir);

    expect(logs.some((line) => line.includes('config.commands.security'))).toBe(true);

    logSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('fails when routing.json has no agents map', async () => {
    await init(tmpDir, { wizard: false });
    await scaffoldMinimalProject(tmpDir);

    // Overwrite routing.json with no agents map
    await fs.writeFile(
      path.join(tmpDir, '.agentic', 'kiki', 'routing.json'),
      JSON.stringify({ rules: { 'brainstorming:general': { standard: 'openai/gpt-4o' } } }, null, 2),
    );

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg);
    });

    await expect(doctor(tmpDir)).rejects.toThrow('process.exit(1)');

    const output = logs.join('\n');
    expect(output).toContain('No agents map found');

    logSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('fails when an agent has an empty model', async () => {
    await init(tmpDir, { wizard: false });
    await scaffoldMinimalProject(tmpDir);

    // Overwrite routing.json with an empty model
    const routing = JSON.parse(await fs.readFile(path.join(tmpDir, '.agentic', 'kiki', 'routing.json'), 'utf-8'));
    routing.agents['kiki-orchestrator'] = '';
    await fs.writeFile(path.join(tmpDir, '.agentic', 'kiki', 'routing.json'), JSON.stringify(routing, null, 2));

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg);
    });

    await expect(doctor(tmpDir)).rejects.toThrow('process.exit(1)');

    const output = logs.join('\n');
    expect(output).toContain('agent kiki-orchestrator model');
    expect(output).toContain('Empty model');

    logSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('fails when kiki-gui-designer.md is missing from .opencode/agents/', async () => {
    await init(tmpDir, { wizard: false });
    await scaffoldMinimalProject(tmpDir);

    await fs.rm(path.join(tmpDir, '.opencode', 'agents', 'kiki-gui-designer.md'));

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg);
    });

    await expect(doctor(tmpDir)).rejects.toThrow('process.exit(1)');

    const output = logs.join('\n');
    expect(output).toContain('kiki-gui-designer.md');

    logSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('validates agents map with non-empty models on a healthy project', async () => {
    await init(tmpDir, { wizard: false });
    await scaffoldMinimalProject(tmpDir);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg);
    });

    await doctor(tmpDir);

    const output = logs.join('\n');
    expect(output).toMatch(/routing\.json agents \(\d+ agents\)/);
    expect(output).not.toContain('No agents map found');
    expect(output).not.toContain('Empty model');

    logSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
