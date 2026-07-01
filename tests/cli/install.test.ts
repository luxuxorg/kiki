import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('cli install', () => {
  let tmpDir: string;
  let globalAgentsDir: string;
  let globalPluginsDir: string;
  let globalDefaultsDir: string;

  beforeEach(async () => {
    tmpDir = `tmp/cli-install-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    globalAgentsDir = path.join(tmpDir, 'global', '.config', 'opencode', 'agents');
    globalPluginsDir = path.join(tmpDir, 'global', '.config', 'opencode', 'plugins');
    globalDefaultsDir = path.join(tmpDir, 'global', '.config', 'opencode', 'kiki', 'defaults');

    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(() => {
    vi.resetModules();
  });

  async function getInstall() {
    vi.doMock('os', async () => {
      const actual = await vi.importActual('os');
      return {
        ...actual,
        homedir: () => path.join(tmpDir, 'global'),
      };
    });
    vi.doMock('../../src/cli/commands/init.js', async () => {
      const actual = await vi.importActual('../../src/cli/commands/init.js');
      return {
        ...actual,
        runWizard: vi.fn().mockResolvedValue({
          projectName: 'test-project',
          language: 'typescript',
          commands: {
            build: 'npm run build',
            test: 'npm test',
            lint: 'npm run lint',
            security: 'npm audit',
          },
          paths: {
            source: 'src/',
            tests: 'tests/',
            docs: 'docs/',
            superpowers: 'docs/superpowers/',
            specs: 'docs/superpowers/specs/',
            plans: 'docs/superpowers/plans/',
            changelog: 'CHANGELOG.md',
            readme: 'README.md',
            decisions: 'docs/DECISIONS.md',
            knowledge: null,
            taskRegistry: '.agentic/kiki/TASK_REGISTRY.json',
          },
          models: {
            standard: 'moonshotai/kimi-k2.6',
            critical: 'anthropic/claude-sonnet-4.6',
          },
        }),
      };
    });
    const mod = await import('../../src/cli/commands/install');
    return mod.install;
  }

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('installs globally by default', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await (await getInstall())([]);

    const agents = await fs.readdir(globalAgentsDir);
    expect(agents).toContain('kiki-orchestrator.md');
    expect(agents).toContain('kiki-brainstormer.md');

    const pluginExists = await fs.stat(path.join(globalPluginsDir, 'kiki.ts')).then(() => true).catch(() => false);
    expect(pluginExists).toBe(true);

    const routingPath = path.join(globalDefaultsDir, 'routing.json');
    const routing = JSON.parse(await fs.readFile(routingPath, 'utf-8'));
    expect(routing.agents).toBeDefined();
    expect(routing.agents['kiki-orchestrator']).toBeDefined();
    expect(routing.rules).toBeUndefined();

    logSpy.mockRestore();
  });

  it('installs kiki-gui-designer.md to global agents dir', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await (await getInstall())([]);

    const agents = await fs.readdir(globalAgentsDir);
    expect(agents).toContain('kiki-gui-designer.md');

    const guiDesigner = await fs.readFile(path.join(globalAgentsDir, 'kiki-gui-designer.md'), 'utf-8');
    expect(guiDesigner).toContain('Kiki GUI Designer');

    logSpy.mockRestore();
  });

  it('installs to project with --project flag', async () => {
    const projectDir = path.join(tmpDir, 'project');
    await fs.mkdir(projectDir, { recursive: true });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await (await getInstall())(['--project', projectDir]);

    const configPath = path.join(projectDir, '.agentic', 'kiki', 'config.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    expect(config.projectName).toBe('test-project');

    const routingPath = path.join(projectDir, '.agentic', 'kiki', 'routing.json');
    const routing = JSON.parse(await fs.readFile(routingPath, 'utf-8'));
    expect(routing.agents).toBeDefined();
    expect(routing.agents['kiki-orchestrator']).toBeDefined();
    expect(routing.rules).toBeUndefined();

    logSpy.mockRestore();
  });

  it('rejects --project and --global together', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect((await getInstall())(['--project', '.', '--global'])).rejects.toThrow('process.exit(1)');
    expect(errorSpy).toHaveBeenCalledWith('Error: --project and --global are mutually exclusive.');

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('skips existing files without --force', async () => {
    await fs.mkdir(globalAgentsDir, { recursive: true });
    await fs.writeFile(path.join(globalAgentsDir, 'kiki-orchestrator.md'), 'existing');

    await (await getInstall())([]);

    const content = await fs.readFile(path.join(globalAgentsDir, 'kiki-orchestrator.md'), 'utf-8');
    expect(content).toBe('existing');
  });

  it('overwrites existing files with --force', async () => {
    await fs.mkdir(globalAgentsDir, { recursive: true });
    await fs.writeFile(path.join(globalAgentsDir, 'kiki-orchestrator.md'), 'existing');

    await (await getInstall())(['--force']);

    const content = await fs.readFile(path.join(globalAgentsDir, 'kiki-orchestrator.md'), 'utf-8');
    expect(content).not.toBe('existing');
    expect(content).toContain('Kiki Orchestrator');
  });
});
