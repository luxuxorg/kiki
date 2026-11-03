import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { init } from '../../src/cli/commands/init';
import { doctor } from '../../src/cli/commands/doctor';
import { installGlobalFiles, readOpenCodeSettings } from '../../src/cli/opencode-config';

let root: string;
let project: string;
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'kiki-doctor-'));
  vi.stubEnv('XDG_CONFIG_HOME', root);
  installGlobalFiles(join(root, 'opencode'));
  project = join(root, 'project'); mkdirSync(project);
  await init(project, { wizard: false });
  const file = join(project, '.agentic/kiki/config.json');
  const config = JSON.parse(readFileSync(file, 'utf8')); config.projectName = 'fixture';
  writeFileSync(file, JSON.stringify(config));
  for (const dir of ['src', 'tests', 'docs/superpowers/specs', 'docs/superpowers/plans']) mkdirSync(join(project, dir), { recursive: true });
  for (const file of ['README.md', 'CHANGELOG.md', 'docs/DECISIONS.md']) writeFileSync(join(project, file), '# fixture');
  vi.spyOn(process, 'exit').mockImplementation(code => { throw new Error(`exit(${code})`); });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); rmSync(root, { recursive: true, force: true }); });
it('passes with global JSON agents and no project Markdown/plugin copies or routing.json', async () => { await doctor(project); });
it('accepts model inheritance from native OpenCode top-level settings', async () => {
  const directory = join(root, 'opencode');
  const config = readOpenCodeSettings(directory, true);
  config.model = 'inherited/model';
  delete config.agent['kiki-orchestrator'].model;
  writeFileSync(join(directory, 'opencode.jsonc'), JSON.stringify(config));
  await doctor(project);
});
it.each(['lint', 'security', 'build', 'test'])('reports missing %s command', async key => {
  const file = join(project, '.agentic/kiki/config.json');
  const config = JSON.parse(readFileSync(file, 'utf8')); config.commands[key] = '';
  writeFileSync(file, JSON.stringify(config));
  await expect(doctor(project)).rejects.toThrow('exit(1)');
  expect(vi.mocked(console.log).mock.calls.flat().join('\n')).toContain(`commands.${key}`);
});
it('reports remaining duplicate plugin copies with a migration instruction', async () => {
  mkdirSync(join(project, '.opencode/plugins'), { recursive: true });
  writeFileSync(join(project, '.opencode/plugins/kiki.ts'), 'legacy');
  await expect(doctor(project)).rejects.toThrow('exit(1)');
  expect(vi.mocked(console.log).mock.calls.flat().join('\n')).toContain('migrate');
});
