import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installGlobalFiles } from '../../src/cli/opencode-config';
import { status } from '../../src/cli/commands/status';
let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'kiki-status-')); vi.stubEnv('XDG_CONFIG_HOME', root); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); rmSync(root, { recursive: true, force: true }); });
it('reports global JSON agents and effective project models without requiring project initialization', async () => {
  installGlobalFiles(join(root, 'opencode'));
  const project = join(root, 'project'); mkdirSync(project);
  writeFileSync(join(project, 'opencode.json'), '{"agent":{"kiki-reviewer":{"model":"project/model"}}}');
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  await status(project);
  const output = log.mock.calls.flat().join('\n');
  expect(output).toContain('Global agents: 8');
  expect(output).toContain('kiki-reviewer: project/model [project]');
});
