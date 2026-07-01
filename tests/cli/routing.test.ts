import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { routing } from '../../src/cli/commands/routing';
import { DEFAULT_ROUTING_TABLE } from '../../src/cli/config';

describe('cli routing', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = `tmp/cli-routing-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await fs.mkdir(path.join(tmpDir, '.agentic', 'kiki'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, '.opencode', 'agents'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, '.agentic', 'kiki', 'routing.json'),
      JSON.stringify({
        agents: {
          'kiki-brainstormer': 'openrouter/glm5.2',
          'kiki-planner': 'deepseek/deepseek-v4-pro',
        },
        rules: {},
      }, null, 2)
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  async function writeAgent(fileName: string, lines: string[]): Promise<void> {
    await fs.writeFile(path.join(tmpDir, '.opencode', 'agents', fileName), [...lines, ''].join('\n'));
  }

  it('adds model frontmatter from routing agents map', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const agentPath = path.join(tmpDir, '.opencode', 'agents', 'kiki-brainstormer.md');
    await writeAgent('kiki-brainstormer.md', [
      '---',
      'description: Kiki Brainstormer',
      'mode: subagent',
      'permission:',
      '  bash: allow',
      '---',
      'Body stays unchanged.',
    ]);
    await writeAgent('kiki-planner.md', [
      '---',
      'description: Kiki Planner',
      'mode: subagent',
      'model: deepseek/deepseek-v4-pro',
      '---',
      'Planner body.',
    ]);

    const result = await routing([tmpDir]);

    const updated = await fs.readFile(agentPath, 'utf-8');
    expect(result).toBe(0);
    expect(updated).toContain('model: openrouter/glm5.2');
    expect(updated).toContain('permission:\n  bash: allow');
    expect(updated).toContain('Body stays unchanged.');
  });

  it('replaces existing model frontmatter from routing agents map', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const agentPath = path.join(tmpDir, '.opencode', 'agents', 'kiki-planner.md');
    await writeAgent('kiki-brainstormer.md', [
      '---',
      'description: Kiki Brainstormer',
      'mode: subagent',
      'model: openrouter/glm5.2',
      '---',
      'Body.',
    ]);
    await writeAgent('kiki-planner.md', [
      '---',
      'description: Kiki Planner',
      'mode: subagent',
      'model: old/model',
      'permission:',
      '  bash: allow',
      '---',
      'Planner body.',
    ]);

    await routing([tmpDir]);

    const updated = await fs.readFile(agentPath, 'utf-8');
    expect(updated).toContain('model: deepseek/deepseek-v4-pro');
    expect(updated).not.toContain('model: old/model');
    expect(updated).toContain('Planner body.');
  });

  it('checks stale frontmatter without writing', async () => {
    const agentPath = path.join(tmpDir, '.opencode', 'agents', 'kiki-brainstormer.md');
    const original = [
      '---',
      'description: Kiki Brainstormer',
      'mode: subagent',
      '---',
      'Body.',
      '',
    ].join('\n');
    await fs.writeFile(agentPath, original);
    await writeAgent('kiki-planner.md', [
      '---',
      'description: Kiki Planner',
      'mode: subagent',
      'model: deepseek/deepseek-v4-pro',
      '---',
      'Planner body.',
    ]);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await routing([tmpDir, '--check']);

    expect(result).toBe(1);
    expect(await fs.readFile(agentPath, 'utf-8')).toBe(original);
    expect(logSpy.mock.calls.map(c => c[0]).join('\n')).toContain('stale: kiki-brainstormer.md');
  });

  it('warns for routing entries without local agent files', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await routing([tmpDir]);

    expect(warnSpy.mock.calls.map(c => c[0]).join('\n')).toContain('missing: kiki-brainstormer.md');
    expect(warnSpy.mock.calls.map(c => c[0]).join('\n')).toContain('missing: kiki-planner.md');
  });

  it('treats every default generated Kiki agent as routed', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.agentic', 'kiki', 'routing.json'),
      JSON.stringify(DEFAULT_ROUTING_TABLE, null, 2)
    );
    for (const agentName of Object.keys(DEFAULT_ROUTING_TABLE.agents)) {
      await writeAgent(`${agentName}.md`, [
        '---',
        `description: ${agentName}`,
        agentName === 'kiki-orchestrator' ? 'mode: primary' : 'mode: subagent',
        '---',
        'Body.',
      ]);
    }
    await writeAgent('kiki-orchestrator.md', [
      '---',
      'description: kiki-orchestrator',
      'mode: primary',
      '---',
      'Body.',
    ]);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await routing([tmpDir]);

    expect(result).toBe(0);
  });

  it('rejects routing entries outside local kiki agent files', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.agentic', 'kiki', 'routing.json'),
      JSON.stringify({ agents: { '../outside': 'unsafe/model' }, rules: {} }, null, 2)
    );
    const outsidePath = path.join(tmpDir, '.opencode', 'outside.md');
    await fs.writeFile(outsidePath, ['---', 'description: outside', 'mode: subagent', '---', 'Body.', ''].join('\n'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await routing([tmpDir]);

    expect(result).toBe(1);
    expect(await fs.readFile(outsidePath, 'utf-8')).not.toContain('model: unsafe/model');
    expect(warnSpy.mock.calls.map(c => c[0]).join('\n')).toContain('invalid agent name: ../outside');
  });

  it('rejects model values that would alter yaml frontmatter', async () => {
    const original = ['---', 'description: Kiki Brainstormer', 'mode: subagent', '---', 'Body.', ''].join('\n');
    const agentPath = path.join(tmpDir, '.opencode', 'agents', 'kiki-brainstormer.md');
    await fs.writeFile(agentPath, original);
    await fs.writeFile(
      path.join(tmpDir, '.agentic', 'kiki', 'routing.json'),
      JSON.stringify({ agents: { 'kiki-brainstormer': 'safe/model\npermission:\n  bash: allow' }, rules: {} }, null, 2)
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await routing([tmpDir]);

    expect(result).toBe(1);
    expect(await fs.readFile(agentPath, 'utf-8')).toBe(original);
    expect(warnSpy.mock.calls.map(c => c[0]).join('\n')).toContain('invalid model for kiki-brainstormer');
  });

  it('rejects yaml-active single-line model values', async () => {
    const original = ['---', 'description: Kiki Brainstormer', 'mode: subagent', '---', 'Body.', ''].join('\n');
    const agentPath = path.join(tmpDir, '.opencode', 'agents', 'kiki-brainstormer.md');
    await fs.writeFile(agentPath, original);
    await fs.writeFile(
      path.join(tmpDir, '.agentic', 'kiki', 'routing.json'),
      JSON.stringify({ agents: { 'kiki-brainstormer': 'foo: bar' }, rules: {} }, null, 2)
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await routing([tmpDir]);

    expect(result).toBe(1);
    expect(await fs.readFile(agentPath, 'utf-8')).toBe(original);
    expect(warnSpy.mock.calls.map(c => c[0]).join('\n')).toContain('invalid model for kiki-brainstormer');
  });
});
