import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { init } from '../../src/cli/commands/init';
import { doctor } from '../../src/cli/commands/doctor';
import { setRoutingPath } from '../../src/core/routing-table';

async function scaffoldMinimalProject(dir: string): Promise<void> {
  const config = JSON.parse(await fs.readFile(path.join(dir, '.agentic/config.json'), 'utf-8'));
  config.projectName = 'doctor-test-project';
  config.paths.docs = 'documentation/';
  config.paths.superpowers = 'documentation/superpowers/';
  config.paths.specs = 'documentation/superpowers/specs/';
  config.paths.plans = 'documentation/superpowers/plans/';
  await fs.writeFile(path.join(dir, '.agentic/config.json'), JSON.stringify(config, null, 2));

  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.mkdir(path.join(dir, 'tests'), { recursive: true });
  await fs.mkdir(path.join(dir, 'documentation', 'superpowers', 'specs'), { recursive: true });
  await fs.mkdir(path.join(dir, 'documentation', 'superpowers', 'plans'), { recursive: true });
  await fs.mkdir(path.join(dir, '.opencode', 'docs'), { recursive: true });
  await fs.writeFile(path.join(dir, 'README.md'), '# Project\n');
  await fs.writeFile(path.join(dir, 'CHANGELOG.md'), '# Changelog\n');
  await fs.writeFile(path.join(dir, '.opencode', 'docs', 'decisions.md'), '# Decisions\n');
}

describe('cli doctor', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = `tmp/cli-doctor-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await fs.mkdir(tmpDir, { recursive: true });
    setRoutingPath(path.join(tmpDir, '.agentic/routing.json'));
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

    const config = JSON.parse(await fs.readFile(path.join(tmpDir, '.agentic/config.json'), 'utf-8'));
    config.commands.lint = '';
    await fs.writeFile(path.join(tmpDir, '.agentic/config.json'), JSON.stringify(config, null, 2));

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
});
