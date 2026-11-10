import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'jsonc-parser';
import { init } from '../../src/cli/commands/init';
import { doctor } from '../../src/cli/commands/doctor';
import { installGlobalFiles } from '../../src/cli/opencode-config';

let root: string;
let project: string;
let home: string;
let xdgConfig: string;
let xdgData: string;
let xdgCache: string;
let globalDir: string;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'kiki-doctor-'));
  home = join(root, 'home');
  xdgConfig = join(root, 'xdg-config');
  xdgData = join(root, 'xdg-data');
  xdgCache = join(root, 'xdg-cache');
  mkdirSync(home, { recursive: true });
  mkdirSync(xdgConfig, { recursive: true });
  mkdirSync(xdgData, { recursive: true });
  mkdirSync(xdgCache, { recursive: true });
  vi.stubEnv('HOME', home);
  vi.stubEnv('XDG_CONFIG_HOME', xdgConfig);
  vi.stubEnv('XDG_DATA_HOME', xdgData);
  vi.stubEnv('XDG_CACHE_HOME', xdgCache);
  vi.stubEnv('XDG_STATE_HOME', join(root, 'xdg-state'));
  globalDir = join(xdgConfig, 'opencode');
  installGlobalFiles(globalDir);
  // Doctor recognizes the package-managed registration name. A release
  // candidate checkout basename is not stable, so this setup uses that form
  // rather than assuming the repository directory is named "kiki".
  const serverConfig = join(globalDir, 'opencode.jsonc');
  const serverData = parse(readFileSync(serverConfig, 'utf8')) as { plugins?: unknown };
  serverData.plugins = ['kiki'];
  writeFileSync(serverConfig, JSON.stringify(serverData));
  const cliConfig = join(globalDir, 'cli.json');
  const cliData = parse(readFileSync(cliConfig, 'utf8')) as { plugins?: unknown };
  cliData.plugins = ['kiki'];
  writeFileSync(cliConfig, JSON.stringify(cliData));
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
      if (entry.isSymbolicLink()) snapshot[key] = `link:${readlinkSync(full)}`;
      else if (entry.isDirectory()) { snapshot[key] = 'dir'; walk(full); }
      else snapshot[key] = `${statSync(full).mode}:${readFileSync(full).toString('base64')}`;
    }
  };
  walk(directory);
  return snapshot;
}

async function runDoctor(
  target = project,
  observeVersion: () => string = () => '2.2.6',
): Promise<void> {
  const before = snapshotTree(root);
  try {
    await doctor(target, { observeVersion });
  } finally {
    expect(snapshotTree(root)).toEqual(before);
  }
}

it('passes with native agents, package registration and the exact target version', async () => {
  await runDoctor();
  expect(output()).toContain('✓ OC2 version — 2.2.6');
  expect(output()).toContain('✓ native agent: kiki-orchestrator — primary');
  expect(output()).toContain('✓ native agent: kiki-reviewer — subagent');
  expect(output()).toContain('✓ server plugin registration');
  expect(output()).toContain('✓ cli.json TUI registration');
  expect(output()).toContain('• agent kiki-orchestrator model — inherits OpenCode default; set via /kiki');
});

it('accepts the real raw binary version prefix as exactly the target version', async () => {
  await runDoctor(project, () => 'opencode v2.2.6');
  expect(output()).toContain('✓ OC2 version — 2.2.6');
});

it('reports an observed version mismatch and an unobserved binary honestly', async () => {
  await runDoctor(project, () => '2.3.0');
  expect(output()).toContain('! OC2 version — observed 2.3.0; Kiki 3.0.0 targets exactly 2.2.6');

  vi.mocked(console.log).mockClear();
  await runDoctor(project, () => { throw new Error('missing'); });
  expect(output()).toContain('! OC2 version — not observed; Kiki 3.0.0 targets exactly 2.2.6');
});

it('fails closed on overlapping OC2 roots without writing', async () => {
  vi.stubEnv('XDG_CONFIG_HOME', root);
  vi.stubEnv('XDG_DATA_HOME', root);
  vi.stubEnv('XDG_CACHE_HOME', root);
  vi.stubEnv('XDG_STATE_HOME', root);
  await expect(runDoctor()).rejects.toThrow('exit(1)');
  expect(output()).toContain('✗ OC2 roots');
  expect(output()).toMatch(/overlap|same|nested|inside/i);
});

it('warns when OPENCODE_CONFIG_DIR and XDG_CONFIG_HOME disagree', async () => {
  vi.stubEnv('OPENCODE_CONFIG_DIR', join(root, 'isolated', 'config', 'opencode'));
  await expect(runDoctor()).rejects.toThrow('exit(1)');
  expect(output()).toContain('! OC2 environment — OPENCODE_CONFIG_DIR and XDG_CONFIG_HOME disagree; the config root is overridden');
});

it('accepts an isolated root with a legacy TUI config while still reporting registration state', async () => {
  writeFileSync(join(globalDir, 'tui.json'), '{"theme":"custom"}');
  await runDoctor();
  expect(output()).toContain('✓ OC2 roots');
  expect(output()).toContain('✓ server plugin registration');
});

it('fails an unparsable native agent file and a non-native mode', async () => {
  writeFileSync(join(globalDir, 'agents/kiki-planner.md'), '---\ninvalid: [\n---\nbody');
  await expect(runDoctor()).rejects.toThrow('exit(1)');
  expect(output()).toContain('✗ native agent: kiki-planner — missing or unparsable');

  vi.mocked(console.log).mockClear();
  writeFileSync(join(globalDir, 'agents/kiki-planner.md'), '---\ndescription: bad\nmode: primary\n---\nbody');
  await expect(runDoctor()).rejects.toThrow('exit(1)');
  expect(output()).toContain('✗ native agent: kiki-planner — mode primary; expected subagent');
});

it('reports a configured model informationally without requiring one', async () => {
  const file = join(globalDir, 'opencode.jsonc');
  const data = parse(readFileSync(file, 'utf8'));
  data.agents = {
    ...(data.agents || {}),
    'kiki-orchestrator': { model: { providerID: 'openai', model: 'gpt' } },
  };
  writeFileSync(file, JSON.stringify(data));

  await runDoctor();
  expect(output()).toContain('• agent kiki-orchestrator model — openai/gpt');
  expect(output()).toContain('0 failed');
});

it('fails duplicate local/global/package server sources and a missing cli.json registration', async () => {
  mkdirSync(join(project, '.opencode/plugins'), { recursive: true });
  writeFileSync(join(project, '.opencode/plugins/kiki.ts'), 'legacy');
  await expect(runDoctor()).rejects.toThrow('exit(1)');
  expect(output()).toContain('✗ server plugin registration — duplicate Kiki server plugin sources; keep exactly one');

  rmSync(join(project, '.opencode'), { recursive: true, force: true });
  vi.mocked(console.log).mockClear();
  rmSync(join(globalDir, 'cli.json'));
  await expect(runDoctor()).rejects.toThrow('exit(1)');
  expect(output()).toContain('✗ cli.json TUI registration — missing; run kiki update');
});

it('checks credential presence by metadata only and never reads the file', async () => {
  mkdirSync(join(xdgData, 'opencode', 'auth.json'), { recursive: true });
  await runDoctor();
  expect(output()).toContain('• provider credentials — present in OC2 data root (metadata only; user-owned)');
  expect(output()).not.toContain('sk-live-secret');
});

it('reports missing project commands as failures while missing skills remain warnings', async () => {
  const file = join(project, '.agentic/kiki/config.json');
  const config = JSON.parse(readFileSync(file, 'utf8'));
  config.commands.security = '';
  writeFileSync(file, JSON.stringify(config));
  await expect(runDoctor()).rejects.toThrow('exit(1)');
  expect(output()).toContain('config.commands.security');
  expect(output()).toContain('! skill brainstorming — not found on disk');
  expect(output()).toMatch(/\d+ passed, \d+ warnings, 1 failed/);
});

it('prints the disk-only registration caveat exactly once', async () => {
  await runDoctor();
  const caveat =
    /Skill checks verify files on disk; they cannot confirm OpenCode plugin registration or live availability in a running session\./g;
  expect(output().match(caveat)).toHaveLength(1);
});

it('documents doctor scope without models in CLI help source', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/cli/index.ts'), 'utf8');
  expect(source).toContain('Validate config, paths, agent files, and skills');
  expect(source).not.toContain('Validate config, paths, models, and agent files');
});
