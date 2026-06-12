import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { scaffold } from '../src/scaffold.js';

describe('scaffold', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kiki-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should create .agentic/config.json', async () => {
    await scaffold(tmpDir);
    const content = await fs.readFile(path.join(tmpDir, '.agentic/config.json'), 'utf-8');
    const config = JSON.parse(content);
    expect(config.project_name).toBe('my-project');
  });

  it('should create .agentic/alignment.json', async () => {
    await scaffold(tmpDir);
    const content = await fs.readFile(path.join(tmpDir, '.agentic/alignment.json'), 'utf-8');
    const alignment = JSON.parse(content);
    expect(alignment.audit_type).toBeDefined();
  });

  it('should create .agentic/TASK_REGISTRY.json', async () => {
    await scaffold(tmpDir);
    const content = await fs.readFile(path.join(tmpDir, '.agentic/TASK_REGISTRY.json'), 'utf-8');
    const registry = JSON.parse(content);
    expect(registry.version).toBe('1.0.0');
    expect(registry.tasks).toEqual([]);
  });

  it('should create .opencode/models.json with kiki-prefixed roles', async () => {
    await scaffold(tmpDir);
    const content = await fs.readFile(path.join(tmpDir, '.opencode/models.json'), 'utf-8');
    const models = JSON.parse(content);
    expect(models.roles['kiki-orchestrator']).toBeDefined();
    expect(models.roles['kiki-brainstormer']).toBeDefined();
    expect(models.roles['kiki-planner']).toBeDefined();
    expect(models.roles['project-researcher']).toBeUndefined();
  });

  it('should create 9 agent files with kiki- prefix', async () => {
    await scaffold(tmpDir);
    const agentsDir = path.join(tmpDir, '.opencode/agents');
    const files = await fs.readdir(agentsDir);
    const expected = [
      'kiki-orchestrator.md',
      'kiki-brainstormer.md',
      'kiki-planner.md',
      'kiki-architect.md',
      'kiki-implementation-standard.md',
      'kiki-implementation-complexity.md',
      'kiki-first-reviewer.md',
      'kiki-second-reviewer.md',
      'kiki-escalation-agent.md',
    ];
    for (const name of expected) {
      expect(files).toContain(name);
    }
    expect(files).toHaveLength(9);
  });

  it('should NOT create .agentic/templates/', async () => {
    await scaffold(tmpDir);
    await expect(fs.access(path.join(tmpDir, '.agentic/templates'))).rejects.toThrow();
  });

  it('should create .opencode/docs/agentic-workflow.md', async () => {
    await scaffold(tmpDir);
    const content = await fs.readFile(path.join(tmpDir, '.opencode/docs/agentic-workflow.md'), 'utf-8');
    expect(content).toContain('Kiki Agentic Development Workflow');
  });
});
