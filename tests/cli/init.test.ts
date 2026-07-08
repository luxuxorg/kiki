import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { init } from '../../src/cli/commands/init';
import { setRoutingPath } from '../../src/core/routing-table';

function permissionAction(agent: string, section: string, targetPath: string): string | null {
  const lines = agent.split('\n');
  const sectionStart = lines.findIndex((line) => line === `  ${section}:`);
  if (sectionStart === -1) return null;

  let action: string | null = null;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('  ') && !line.startsWith('    ')) break;

    const match = line.match(/^    "(.+)": (allow|deny|ask)$/);
    if (!match) continue;

    const [, pattern, ruleAction] = match;
    if (permissionPatternMatches(pattern, targetPath)) {
      action = ruleAction;
    }
  }

  return action;
}

function permissionPatternMatches(pattern: string, targetPath: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('/**')) return targetPath.startsWith(pattern.slice(0, -3));
  if (pattern.endsWith('/*')) return targetPath.startsWith(pattern.slice(0, -1));
  if (pattern.endsWith('*')) return targetPath.startsWith(pattern.slice(0, -1));
  return pattern === targetPath;
}

describe('cli init', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = `tmp/cli-init-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await fs.mkdir(tmpDir, { recursive: true });
    setRoutingPath(path.join(tmpDir, '.agentic/kiki/routing.json'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scaffolds .agentic/kiki directory with all config files', async () => {
    await init(tmpDir, { wizard: false });

    const config = JSON.parse(await fs.readFile(path.join(tmpDir, '.agentic/kiki/config.json'), 'utf-8'));
    expect(config.projectName).toBe('my-project');
    expect(config.language).toBe('typescript');
    expect(config.commands.build).toBe('npm run build');
    expect(config.commands.security).toBe('npm audit');
    expect(config.riskMatrix).toBeUndefined();
    expect(config.paths).toBeDefined();
    expect(config.paths.source).toBe('src/');
    expect(config.paths.tests).toBe('tests/');
    expect(config.paths.changelog).toBe('CHANGELOG.md');
    expect(config.paths.taskRegistry).toBe('.agentic/kiki/TASK_REGISTRY.json');
    expect(config.models).toBeDefined();
    expect(config.models.standard).toBeDefined();
    expect(config.models.critical).toBeDefined();
    expect(config.routingPreferences).toBeUndefined();

    const alignment = JSON.parse(await fs.readFile(path.join(tmpDir, '.agentic/kiki/alignment.json'), 'utf-8'));
    expect(alignment.guardrails).toHaveLength(3);
    expect(alignment.compliance).toContain('OWASP Top 10');

    const registry = JSON.parse(await fs.readFile(path.join(tmpDir, '.agentic/kiki/TASK_REGISTRY.json'), 'utf-8'));
    expect(registry.tasks).toEqual([]);

    const routing = JSON.parse(await fs.readFile(path.join(tmpDir, '.agentic/kiki/routing.json'), 'utf-8'));
    expect(routing.agents).toBeDefined();
    expect(typeof routing.agents).toBe('object');
    expect(routing.agents['kiki-orchestrator']).toBeDefined();
    expect(routing.agents['kiki-gui-designer']).toBeDefined();
    expect(routing.agents['kiki-escalation']).toBeDefined();
    expect(routing.rules).toBeUndefined();
    expect(routing.version).toBeUndefined();
    expect(routing.generatedAt).toBeUndefined();
    expect(routing.sources).toBeUndefined();
    expect(routing.projectDefaults).toBeUndefined();
  });

  it('scaffolds at a custom path', async () => {
    const customDir = path.join(tmpDir, 'subproject');
    await fs.mkdir(customDir, { recursive: true });

    await init(customDir, { wizard: false });

    const config = JSON.parse(await fs.readFile(path.join(customDir, '.agentic/kiki/config.json'), 'utf-8'));
    expect(config.projectName).toBe('my-project');
  });

  it('does not fail if .agentic already exists', async () => {
    await fs.mkdir(path.join(tmpDir, '.agentic'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, '.agentic/existing.txt'), 'hello');

    await init(tmpDir, { wizard: false });

    const existing = await fs.readFile(path.join(tmpDir, '.agentic/existing.txt'), 'utf-8');
    expect(existing).toBe('hello');
  });

  it('scaffolds .opencode directory with agents, plugin, package.json, docs, and .gitignore', async () => {
    await init(tmpDir, { wizard: false });

    // Agents exist with correct content
    const orchestrator = await fs.readFile(path.join(tmpDir, '.opencode/agents/kiki-orchestrator.md'), 'utf-8');
    expect(orchestrator).toContain('mode: primary');
    expect(orchestrator).toContain('Kiki Orchestrator');
    expect(orchestrator).toContain('kiki-historian');
    expect(orchestrator).not.toContain('permission:');

    const brainstormer = await fs.readFile(path.join(tmpDir, '.opencode/agents/kiki-brainstormer.md'), 'utf-8');
    expect(brainstormer).toContain('mode: subagent');
    expect(brainstormer).toContain('write:');
    expect(brainstormer).toContain('read:');

    const planner = await fs.readFile(path.join(tmpDir, '.opencode/agents/kiki-planner.md'), 'utf-8');
    expect(planner).toContain('mode: subagent');
    expect(planner).toContain('docs/superpowers/*');
    expect(planner).toContain('Task Metadata');

    const implementer = await fs.readFile(path.join(tmpDir, '.opencode/agents/kiki-implementer.md'), 'utf-8');
    expect(implementer).toContain('mode: subagent');
    expect(implementer).toContain('src/*');
    expect(implementer).toContain('lint command');
    expect(implementer).toContain('commands.lint');
    expect(implementer).toContain('commands.security');
    expect(implementer).toContain('Rollback Safety');
    expect(implementer).toContain('kiki-untracked-before.txt');
    expect(implementer).toContain('git checkout -- .');
    expect(implementer).toContain('Do NOT use `git clean -fd`');

    const reviewer = await fs.readFile(path.join(tmpDir, '.opencode/agents/kiki-reviewer.md'), 'utf-8');
    expect(reviewer).toContain('mode: subagent');
    expect(reviewer).toContain('".agentic/reviews/*": allow');
    expect(reviewer).toContain('Linting compliance');
    expect(reviewer).toContain('Security scan');

    const escalation = await fs.readFile(path.join(tmpDir, '.opencode/agents/kiki-escalation.md'), 'utf-8');
    expect(escalation).toContain('mode: subagent');
    expect(escalation).toContain('Redesign');

    const historian = await fs.readFile(path.join(tmpDir, '.opencode/agents/kiki-historian.md'), 'utf-8');
    expect(historian).toContain('mode: subagent');
    expect(historian).toContain('CHANGELOG');
    expect(historian).toContain('.agentic/*');

    // Plugin is a thin logger (no agent names, no external imports)
    const plugin = await fs.readFile(path.join(tmpDir, '.opencode/plugins/kiki.ts'), 'utf-8');
    expect(plugin).not.toContain("from 'kiki'");
    expect(plugin).not.toContain('../../src/core');
    expect(plugin).not.toContain('kiki-historian');
    expect(plugin).toContain('routing_log.jsonl');

    // package.json has only opencode plugin dependency
    const pkg = JSON.parse(await fs.readFile(path.join(tmpDir, '.opencode/package.json'), 'utf-8'));
    expect(pkg.dependencies).toHaveProperty('@opencode-ai/plugin');
    expect(pkg.dependencies).not.toHaveProperty('kiki');

    // .gitignore ignores node_modules
    const gitignore = await fs.readFile(path.join(tmpDir, '.opencode/.gitignore'), 'utf-8');
    expect(gitignore).toContain('node_modules');

    // agentic-workflow.md exists
    const workflow = await fs.readFile(path.join(tmpDir, '.opencode/docs/agentic-workflow.md'), 'utf-8');
    expect(workflow).toContain('Kiki Workflow');
    expect(workflow).toContain('kiki-historian');
  });

  it('scaffolds kiki-gui-designer.md in .opencode/agents/', async () => {
    await init(tmpDir, { wizard: false });

    const guiDesigner = await fs.readFile(path.join(tmpDir, '.opencode/agents/kiki-gui-designer.md'), 'utf-8');
    expect(guiDesigner).toContain('mode: subagent');
    expect(guiDesigner).toContain('Kiki GUI Designer');
    expect(guiDesigner).toContain('ui-ux-pro-max');
  });

  it('allows brainstormer to write specs under opencode last-match permission rules', async () => {
    await init(tmpDir, { wizard: false });

    const brainstormer = await fs.readFile(path.join(tmpDir, '.opencode/agents/kiki-brainstormer.md'), 'utf-8');
    const specPath = 'docs/superpowers/specs/example-design.md';

    expect(permissionAction(brainstormer, 'read', specPath)).toBe('allow');
    expect(permissionAction(brainstormer, 'write', specPath)).toBe('allow');
    expect(permissionAction(brainstormer, 'edit', specPath)).toBe('allow');
    expect(permissionAction(brainstormer, 'edit', 'src/index.ts')).toBe('deny');
  });
});
