import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { init } from '../../src/cli/commands/init';
import { doctor } from '../../src/cli/commands/doctor';
import { installGlobalFiles, readOpenCodeSettings } from '../../src/cli/opencode-config';
import { REQUIRED_SKILLS, TESTED_SUPERPOWERS_VERSION } from '../../src/cli/doctor-skills';

let root: string;
let project: string;
let home: string;
let xdgConfig: string;
let xdgCache: string;
let globalDir: string;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'kiki-doctor-'));
  home = join(root, 'home');
  xdgConfig = join(root, 'xdg-config');
  xdgCache = join(root, 'xdg-cache');
  mkdirSync(home, { recursive: true });
  mkdirSync(xdgConfig, { recursive: true });
  mkdirSync(xdgCache, { recursive: true });
  vi.stubEnv('HOME', home);
  vi.stubEnv('XDG_CONFIG_HOME', xdgConfig);
  vi.stubEnv('XDG_CACHE_HOME', xdgCache);
  globalDir = join(xdgConfig, 'opencode');
  installGlobalFiles(globalDir);
  project = join(root, 'project');
  mkdirSync(project);
  await init(project, { wizard: false });
  const file = join(project, '.agentic/kiki/config.json');
  const config = JSON.parse(readFileSync(file, 'utf8'));
  config.projectName = 'fixture';
  writeFileSync(file, JSON.stringify(config));
  for (const dir of ['src', 'tests', 'docs/superpowers/specs', 'docs/superpowers/plans']) {
    mkdirSync(join(project, dir), { recursive: true });
  }
  for (const file of ['README.md', 'CHANGELOG.md', 'docs/DECISIONS.md']) {
    writeFileSync(join(project, file), '# fixture');
  }
  vi.spyOn(process, 'exit').mockImplementation(code => {
    throw new Error(`exit(${code})`);
  });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

const output = () => vi.mocked(console.log).mock.calls.flat().join('\n');

function snapshotTree(directory: string): Record<string, string> {
  const snapshot: Record<string, string> = {};
  const walk = (current: string) => {
    const entries = readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    for (const entry of entries) {
      const full = join(current, entry.name);
      const key = relative(directory, full);
      if (entry.isSymbolicLink()) {
        snapshot[key] = `link:${readlinkSync(full)}`;
      } else if (entry.isDirectory()) {
        snapshot[key] = 'dir';
        walk(full);
      } else {
        snapshot[key] = `${statSync(full).mode}:${readFileSync(full).toString('base64')}`;
      }
    }
  };
  walk(directory);
  return snapshot;
}

async function runDoctor(target = project): Promise<void> {
  const before = snapshotTree(root);
  try {
    await doctor(target);
  } finally {
    expect(snapshotTree(root)).toEqual(before);
  }
}

function writeSkill(directory: string, name: string): void {
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, 'SKILL.md'),
    `---\nname: ${name}\ndescription: fixture\n---\nSkill body`,
  );
}

function installAllSkills(): void {
  const packageRoot = join(
    xdgCache,
    'opencode',
    'packages',
    'superpowers@fixture',
    'node_modules',
    'superpowers',
  );
  for (const name of REQUIRED_SKILLS) {
    if (name === 'ui-ux-pro-max') continue;
    writeSkill(join(packageRoot, 'skills', name), name);
  }
  writeFileSync(
    join(packageRoot, 'package.json'),
    JSON.stringify({ name: 'superpowers', version: TESTED_SUPERPOWERS_VERSION }),
  );
  writeSkill(join(project, '.opencode', 'skills', 'ui-ux-pro-max'), 'ui-ux-pro-max');
}

it('passes with global JSON agents and no project Markdown/plugin copies or routing.json', async () => {
  await runDoctor();
});

it('accepts model inheritance from native OpenCode top-level settings', async () => {
  const config = readOpenCodeSettings(globalDir, true);
  config.model = 'inherited/model';
  delete config.agent['kiki-orchestrator'].model;
  writeFileSync(join(globalDir, 'opencode.jsonc'), JSON.stringify(config));
  await runDoctor();
});

it.each(['lint', 'security', 'build', 'test'])('reports missing %s command', async key => {
  const file = join(project, '.agentic/kiki/config.json');
  const config = JSON.parse(readFileSync(file, 'utf8'));
  config.commands[key] = '';
  writeFileSync(file, JSON.stringify(config));
  await expect(runDoctor()).rejects.toThrow('exit(1)');
  expect(output()).toContain(`commands.${key}`);
  expect(output()).toContain('! skill brainstorming — not found on disk');
  expect(output()).toMatch(/\d+ warnings/);
  expect(output()).toMatch(/\d+ passed, \d+ warnings, 1 failed/);
});

it('reports remaining duplicate plugin copies with a migration instruction', async () => {
  mkdirSync(join(project, '.opencode/plugins'), { recursive: true });
  writeFileSync(join(project, '.opencode/plugins/kiki.ts'), 'legacy');
  await expect(runDoctor()).rejects.toThrow('exit(1)');
  expect(output()).toContain('migrate');
  expect(output()).toContain('! skill brainstorming');
});

it('passes when no agent model is configured anywhere and reports native default inheritance', async () => {
  const config = readOpenCodeSettings(globalDir, true);
  for (const name of Object.keys(config.agent)) delete config.agent[name].model;
  delete config.model;
  writeFileSync(join(globalDir, 'opencode.jsonc'), JSON.stringify(config));
  await runDoctor();
  expect(output()).toContain('agent kiki-orchestrator model — inherits OpenCode default; set via /kiki');
});

it('reports native model inheritance precedence: agent override, then project, then global', async () => {
  const config = readOpenCodeSettings(globalDir, true);
  for (const name of Object.keys(config.agent)) delete config.agent[name].model;
  config.model = 'global/model';
  writeFileSync(join(globalDir, 'opencode.jsonc'), JSON.stringify(config));
  writeFileSync(join(project, 'opencode.json'), JSON.stringify({ model: 'project/model' }));

  await runDoctor();
  expect(output()).toContain('agent kiki-orchestrator model — project/model');

  vi.mocked(console.log).mockClear();
  writeFileSync(
    join(project, 'opencode.json'),
    JSON.stringify({
      model: 'project/model',
      agent: { 'kiki-orchestrator': { model: 'agent/model' } },
    }),
  );
  await runDoctor();
  expect(output()).toContain('agent kiki-orchestrator model — agent/model');
});

it('reports a legacy models section informationally without reading or printing its values', async () => {
  const file = join(project, '.agentic/kiki/config.json');
  const config = JSON.parse(readFileSync(file, 'utf8'));
  config.models = {
    standard: 'legacy/standard',
    critical: 'legacy/critical',
    workhorse: 'legacy/workhorse',
  };
  writeFileSync(file, JSON.stringify(config));
  await runDoctor();
  expect(output()).toContain('legacy models section present; ignored');
  expect(output()).not.toContain('legacy/standard');
  expect(output()).not.toContain('legacy/critical');
  expect(output()).not.toContain('legacy/workhorse');
});

it.each(['', '   '])('still rejects a blank native agent model value %j', async value => {
  const config = readOpenCodeSettings(globalDir, true);
  config.agent['kiki-orchestrator'].model = value;
  writeFileSync(join(globalDir, 'opencode.jsonc'), JSON.stringify(config));
  await expect(runDoctor()).rejects.toThrow(/Invalid agent model/);
});

it('warns for missing skills without changing the successful exit status', async () => {
  await runDoctor();

  expect(output()).toContain('! skill brainstorming — not found on disk');
  expect(output()).toMatch(/\d+ passed, 9 warnings, 0 failed/);
  expect(output()).toContain('superpowers OpenCode package');
  expect(output()).toContain('install the ui-ux-pro-max skill in ~/.opencode/skills');
});

it('prints the disk-only registration caveat exactly once', async () => {
  await runDoctor();

  const caveat =
    /Skill checks verify files on disk; they cannot confirm OpenCode plugin registration or live availability in a running session\./g;
  expect(output().match(caveat)).toHaveLength(1);
});

it('reports no skill warnings when all required skills and the tested version are present', async () => {
  installAllSkills();

  await runDoctor();

  expect(output()).not.toContain('! skill ');
  expect(output()).not.toMatch(/! superpowers version/);
  expect(output()).toContain(
    `✓ superpowers version — ${TESTED_SUPERPOWERS_VERSION} (matches tested version)`,
  );
  expect(output()).toMatch(/\d+ passed, 0 warnings, 0 failed/);
});

it('documents doctor scope without models in CLI help source', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/cli/index.ts'), 'utf8');
  expect(source).toContain('Validate config, paths, agent files, and skills');
  expect(source).not.toContain('Validate config, paths, models, and agent files');
});
