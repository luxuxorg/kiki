import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { init } from '../../src/cli/commands/init';
import { setRoutingPath } from '../../src/core/routing-table';

describe('cli init', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = `tmp/cli-init-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await fs.mkdir(tmpDir, { recursive: true });
    setRoutingPath(path.join(tmpDir, '.agentic/routing.json'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scaffolds .agentic directory with all config files', async () => {
    await init(tmpDir);

    const config = JSON.parse(await fs.readFile(path.join(tmpDir, '.agentic/config.json'), 'utf-8'));
    expect(config.projectName).toBe('my-project');
    expect(config.language).toBe('typescript');
    expect(config.commands.build).toBe('npm run build');
    expect(config.riskMatrix.highRiskPaths).toContain('src/auth/');
    expect(config.riskMatrix.criticalRiskPaths).toContain('src/security/');
    expect(config.routingPreferences.minBenchmarkRank).toBe(20);

    const alignment = JSON.parse(await fs.readFile(path.join(tmpDir, '.agentic/alignment.json'), 'utf-8'));
    expect(alignment.guardrails).toHaveLength(3);
    expect(alignment.compliance).toContain('OWASP Top 10');

    const registry = JSON.parse(await fs.readFile(path.join(tmpDir, '.agentic/TASK_REGISTRY.json'), 'utf-8'));
    expect(registry.tasks).toEqual([]);

    const routing = JSON.parse(await fs.readFile(path.join(tmpDir, '.agentic/routing.json'), 'utf-8'));
    expect(routing.version).toBe('1.0.0');
    expect(routing.rules).toEqual([]);
    expect(routing.projectDefaults).toEqual({});
  });

  it('scaffolds at a custom path', async () => {
    const customDir = path.join(tmpDir, 'subproject');
    await fs.mkdir(customDir, { recursive: true });

    await init(customDir);

    const config = JSON.parse(await fs.readFile(path.join(customDir, '.agentic/config.json'), 'utf-8'));
    expect(config.projectName).toBe('my-project');
  });

  it('does not fail if .agentic already exists', async () => {
    await fs.mkdir(path.join(tmpDir, '.agentic'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, '.agentic/existing.txt'), 'hello');

    await init(tmpDir);

    const existing = await fs.readFile(path.join(tmpDir, '.agentic/existing.txt'), 'utf-8');
    expect(existing).toBe('hello');
  });

  it('scaffolds .opencode directory with agents, plugin, package.json, docs, and .gitignore', async () => {
    await init(tmpDir);

    // Agents exist with correct content
    const orchestrator = await fs.readFile(path.join(tmpDir, '.opencode/agents/kiki-orchestrator.md'), 'utf-8');
    expect(orchestrator).toContain('mode: primary');
    expect(orchestrator).toContain('Kiki Orchestrator');

    const brainstormer = await fs.readFile(path.join(tmpDir, '.opencode/agents/kiki-brainstormer.md'), 'utf-8');
    expect(brainstormer).toContain('mode: subagent');
    expect(brainstormer).toContain('docs/superpowers/*');

    const planner = await fs.readFile(path.join(tmpDir, '.opencode/agents/kiki-planner.md'), 'utf-8');
    expect(planner).toContain('mode: subagent');
    expect(planner).toContain('docs/superpowers/*');

    const implementer = await fs.readFile(path.join(tmpDir, '.opencode/agents/kiki-implementer.md'), 'utf-8');
    expect(implementer).toContain('mode: subagent');
    expect(implementer).toContain('src/*');

    const reviewer = await fs.readFile(path.join(tmpDir, '.opencode/agents/kiki-reviewer.md'), 'utf-8');
    expect(reviewer).toContain('mode: subagent');
    expect(reviewer).toContain('edit: deny');

    const escalation = await fs.readFile(path.join(tmpDir, '.opencode/agents/kiki-escalation.md'), 'utf-8');
    expect(escalation).toContain('mode: subagent');
    expect(escalation).toContain('Redesign');

    // Plugin imports from kiki package, not relative paths
    const plugin = await fs.readFile(path.join(tmpDir, '.opencode/plugins/kiki.ts'), 'utf-8');
    expect(plugin).toContain("from 'kiki'");
    expect(plugin).not.toContain("../../src/core");

    // package.json references kiki dependency
    const pkg = JSON.parse(await fs.readFile(path.join(tmpDir, '.opencode/package.json'), 'utf-8'));
    expect(pkg.dependencies).toHaveProperty('@opencode-ai/plugin');
    expect(pkg.dependencies).toHaveProperty('kiki');
    expect(pkg.dependencies.kiki).toBe('github.com/luxuxorg/kiki');

    // .gitignore ignores node_modules
    const gitignore = await fs.readFile(path.join(tmpDir, '.opencode/.gitignore'), 'utf-8');
    expect(gitignore).toContain('node_modules');

    // agentic-workflow.md exists
    const workflow = await fs.readFile(path.join(tmpDir, '.opencode/docs/agentic-workflow.md'), 'utf-8');
    expect(workflow).toContain('Kiki Workflow');
  });
});
