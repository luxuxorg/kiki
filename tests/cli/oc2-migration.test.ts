import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync,
  statSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse as parseJsonc } from 'jsonc-parser';
import { parse as parseYaml } from 'yaml';
import { migrateOC1 } from '../../src/cli/oc2-migration';
import { translatePermissions } from '../../src/cli/oc2-permissions';
import { migrateProject, mergeSettings } from '../../src/cli/opencode-config';
import { migrate } from '../../src/cli/commands/migrate';
import { parseMigrationArgs } from '../../src/cli/args';
import { KIKI_VERSION } from '../../src/cli/config';

// Deterministic, post-backup I/O fault injection for the transaction rollback
// tests. The real rename is always delegated unless a test installs a hook.
const fsFault = vi.hoisted(() => ({
  rename: undefined as undefined | ((from: string, to: string) => void),
}));
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    renameSync: (from: string, to: string) => {
      fsFault.rename?.(from, to);
      return actual.renameSync(from, to);
    },
  };
});

const fixture = JSON.parse(readFileSync(join(__dirname, '../fixtures/oc1-permission-templates.json'), 'utf8'));

function readJson(file: string): any {
  return parseJsonc(readFileSync(file, 'utf8'));
}
function writeJson(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2));
}
function backupDirs(root: string): string[] {
  const directory = join(root, '.agentic/kiki/backups');
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory())
    .map(entry => join(directory, entry.name));
}
function permissionMap(builder: string): Record<string, unknown> {
  return (parseYaml(builder, { uniqueKeys: false }) as { permission: Record<string, unknown> }).permission;
}

describe('one-time OC1 to OC2 migration', () => {
  let root: string;
  let source: string;
  let destination: string;
  let project: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kiki-migrate-'));
    source = join(root, 'oc1');
    destination = join(root, 'oc2');
    project = join(root, 'project');
    mkdirSync(source);
    mkdirSync(destination);
    mkdirSync(project);
  });
  afterEach(() => {
    fsFault.rename = undefined;
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it('migrates Kiki models, ordered permissions, defaults, title, plugins and names-only reports without touching the source', () => {
    const sourceFile = join(source, 'opencode.json');
    writeFileSync(sourceFile, JSON.stringify({
      model: 'legacy-default/model',
      small_model: 'legacy-small/model',
      permission: { read: { '*': 'allow', '**/*.pem': 'deny' } },
      agent: {
        'kiki-implementer': {
          model: 'azure-cognitive-services/gpt-4o',
          variant: 'high',
          permission: {
            bash: { '*': 'ask', 'rm -rf *': 'deny' },
            write: { 'src/**': 'allow' },
            task: { 'kiki-reviewer': 'allow' },
            read: { '*': 'allow' },
          },
        },
        'kiki-reviewer': {
          model: 'google-vertex-anthropic/org/claude',
          permission: { edit: 'deny', read: { 'secret/**': 'deny' } },
        },
        scientist: { model: 'provider/private-model' },
      },
      plugin: [
        './plugins/kiki.ts',
        'other-plugin@1.0.0',
        'https://token:synthetic@example.test/repo/other-plugin.git?x=1',
      ],
    }));
    writeJson(join(destination, 'opencode.jsonc'), { theme: 'keep', agents: { other: { model: 'keep/model' } } });
    const before = readFileSync(sourceFile);
    const beforeMtime = statSync(sourceFile).mtimeMs;

    const report = migrateOC1({ from: source, destination, force: false });

    expect(report.exitCode).toBe(0);
    expect(report.rejected).toEqual([]);
    expect(report.migrated).toEqual(expect.arrayContaining(['kiki-implementer', 'kiki-reviewer']));
    expect(report.manual).toEqual(expect.arrayContaining(['scientist', 'other-plugin@1.0.0', 'other-plugin.git']));
    expect(JSON.stringify(report)).not.toContain('provider/private-model');
    expect(JSON.stringify(report)).not.toContain('synthetic');

    const target = join(destination, 'opencode.jsonc');
    const data = readJson(target);
    expect(data.theme).toBe('keep');
    expect(data.agents.other.model).toBe('keep/model');
    expect(data.model).toEqual({ providerID: 'legacy-default', model: 'model' });
    expect(data.agents.title.model).toEqual({ providerID: 'legacy-small', model: 'model' });
    expect(data.agents['kiki-implementer'].model).toEqual({ providerID: 'azure', model: 'gpt-4o', variant: 'high' });
    expect(data.agents['kiki-reviewer'].model).toEqual({ providerID: 'google-vertex', model: 'org/claude' });
    expect(data.permission).toBeUndefined();
    expect(data.plugins).toContain('kiki');
    expect(data.plugins).not.toContain('other-plugin@1.0.0');
    expect(data.agents['kiki-implementer'].permissions).toEqual(expect.arrayContaining([
      { action: 'read', resource: '*', effect: 'allow' },
      { action: 'read', resource: '**/*.pem', effect: 'deny' },
      { action: 'shell', resource: '*', effect: 'ask' },
      { action: 'shell', resource: 'rm -rf *', effect: 'deny' },
      { action: 'edit', resource: 'src/**', effect: 'allow' },
      { action: 'subagent', resource: 'kiki-reviewer', effect: 'allow' },
    ]));
    expect(data.agents['kiki-reviewer'].permissions).toEqual(expect.arrayContaining([
      { action: 'edit', resource: '*', effect: 'deny' },
      { action: 'read', resource: '*', effect: 'allow' },
      { action: 'read', resource: '**/*.pem', effect: 'deny' },
      { action: 'read', resource: 'secret/**', effect: 'deny' },
    ]));
    expect(data.agents.scientist).toBeUndefined();

    expect(readFileSync(sourceFile)).toEqual(before);
    expect(statSync(sourceFile).mtimeMs).toBe(beforeMtime);

    const markerFile = join(destination, '.agentic/kiki/migration.json');
    const marker = readJson(markerFile);
    expect(marker.source).toBe(source);
    expect(marker.version).toBe(KIKI_VERSION);
    expect(typeof marker.timestamp).toBe('string');

    const backups = backupDirs(destination);
    expect(backups).toHaveLength(1);
    expect(statSync(backups[0]).mode & 0o777).toBe(0o700);
    const files = readdirSync(backups[0]);
    expect(files).toContain('manifest.json');
    expect(statSync(join(backups[0], 'manifest.json')).mode & 0o777).toBe(0o600);
    for (const file of files) expect(statSync(join(backups[0], file)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(join(backups[0], 'manifest.json'), 'utf8'))).toContain(target);
  });

  it('migrates every Task 4 permission builder map with the shared ordered translator', () => {
    const roles: Record<string, string> = {
      'kiki-brainstormer': 'brainstormer',
      'kiki-planner': 'brainstormer',
      'kiki-implementer': 'implementer',
      'kiki-gui-designer': 'implementer',
      'kiki-reviewer': 'reviewer',
      'kiki-escalation': 'escalation',
      'kiki-historian': 'historian',
    };
    const agent = Object.fromEntries(Object.entries(roles).map(([name, builder]) =>
      [name, { permission: permissionMap(fixture.permissionBuilders[builder]) }]));
    writeJson(join(source, 'opencode.json'), { agent });

    const report = migrateOC1({ from: source, destination, force: false });
    expect(report.exitCode).toBe(0);
    expect(report.rejected).toEqual([]);

    const data = readJson(join(destination, 'opencode.jsonc'));
    for (const [name, builder] of Object.entries(roles)) {
      const expected = translatePermissions(permissionMap(fixture.permissionBuilders[builder]));
      expect(expected.ok).toBe(true);
      if (expected.ok) expect(data.agents[name].permissions).toEqual(expected.rules);
    }
  });

  it('rejects an untranslatable agent without writing its model or baseline grants and keeps partial writes marker-free', () => {
    writeJson(join(destination, 'opencode.jsonc'), {
      agents: { 'kiki-reviewer': { prompt: 'keep', model: { providerID: 'dest', model: 'keep' } } },
    });
    writeJson(join(source, 'opencode.json'), {
      agent: {
        'kiki-reviewer': { model: 'provider/invalid-permission', permission: { edit: 'sometimes' } },
        'kiki-implementer': { model: 'provider/implementer', permission: { edit: { 'src/**': 'allow' } } },
      },
    });
    const destinationBefore = readFileSync(join(destination, 'opencode.jsonc'), 'utf8');

    const report = migrateOC1({ from: source, destination, force: false });

    expect(report.exitCode).toBe(1);
    expect(report.migrated).toEqual(['kiki-implementer']);
    expect(report.rejected.map(entry => entry.agent)).toEqual(['kiki-reviewer']);
    expect(report.rejected[0].reason).toMatch(/permission/i);
    expect(JSON.stringify(report)).not.toContain('sometimes');

    const data = readJson(join(destination, 'opencode.jsonc'));
    expect(data.agents['kiki-reviewer']).toEqual({ prompt: 'keep', model: { providerID: 'dest', model: 'keep' } });
    expect(data.agents['kiki-implementer'].model).toEqual({ providerID: 'provider', model: 'implementer' });
    expect(data.agents['kiki-implementer'].permissions).toEqual([
      { action: 'edit', resource: 'src/**', effect: 'allow' },
    ]);
    expect(readFileSync(join(destination, 'opencode.jsonc'), 'utf8')).not.toBe(destinationBefore);
    expect(existsSync(join(destination, '.agentic/kiki/migration.json'))).toBe(false);
  });

  it('rejects invalid models, variants and unknown permission actions per agent', () => {
    writeJson(join(source, 'opencode.json'), {
      agent: {
        'kiki-brainstormer': { variant: 'high' },
        'kiki-planner': { model: 'provider/model#variant' },
        'kiki-escalation': { permission: { teleport: 'allow' } },
        'kiki-reviewer': { model: 'provider/reviewer' },
      },
    });

    const report = migrateOC1({ from: source, destination, force: false });

    expect(report.exitCode).toBe(1);
    expect(report.rejected.map(entry => entry.agent).sort())
      .toEqual(['kiki-brainstormer', 'kiki-escalation', 'kiki-planner']);
    expect(report.rejected.some(entry => /Unknown permission action: teleport/.test(entry.reason))).toBe(true);
    expect(report.rejected.every(entry => !entry.reason.includes('model#variant'))).toBe(true);
    expect(report.migrated).toEqual(['kiki-reviewer']);
    const data = readJson(join(destination, 'opencode.jsonc'));
    expect(data.agents['kiki-reviewer'].model).toEqual({ providerID: 'provider', model: 'reviewer' });
    expect(data.agents['kiki-planner']).toBeUndefined();
    expect(existsSync(join(destination, '.agentic/kiki/migration.json'))).toBe(false);
  });

  it('rejects a conflicting destination model or permission without overwriting either value', () => {
    writeJson(join(destination, 'opencode.jsonc'), {
      agents: {
        'kiki-planner': { model: { providerID: 'destination', model: 'choice' } },
        'kiki-implementer': { permissions: [{ action: 'edit', resource: '*', effect: 'deny' }] },
      },
    });
    writeJson(join(source, 'opencode.json'), {
      agent: {
        'kiki-planner': { model: 'source/choice' },
        'kiki-implementer': { model: 'source/implementer', permission: { edit: { 'src/**': 'allow' } } },
      },
    });
    const before = readFileSync(join(destination, 'opencode.jsonc'), 'utf8');

    const report = migrateOC1({ from: source, destination, force: false });

    expect(report.exitCode).toBe(1);
    expect(report.rejected.map(entry => entry.agent).sort()).toEqual(['kiki-implementer', 'kiki-planner']);
    expect(JSON.stringify(report)).not.toContain('destination/choice');
    expect(JSON.stringify(report)).not.toContain('source/choice');
    expect(readFileSync(join(destination, 'opencode.jsonc'), 'utf8')).toBe(before);
    expect(existsSync(join(destination, '.agentic/kiki/migration.json'))).toBe(false);
  });

  it('preserves equivalent destination-native values and recognises a byte-identical rerun', () => {
    writeJson(join(source, 'opencode.json'), {
      agent: { 'kiki-reviewer': { model: 'provider/reviewer', permission: { edit: 'deny' } } },
    });
    writeJson(join(destination, 'opencode.jsonc'), {
      agents: {
        'kiki-reviewer': {
          model: { providerID: 'provider', model: 'reviewer' },
          permissions: [{ action: 'edit', resource: '*', effect: 'deny' }],
          prompt: 'keep',
        },
      },
    });
    const before = readFileSync(join(destination, 'opencode.jsonc'), 'utf8');
    const first = migrateOC1({ from: source, destination, force: false });
    expect(first.exitCode).toBe(0);
    expect(first.migrated).toEqual(['kiki-reviewer']);
    expect(readFileSync(join(destination, 'opencode.jsonc'), 'utf8')).toBe(before);
    expect(existsSync(join(destination, '.agentic/kiki/migration.json'))).toBe(true);

    expect(() => migrateOC1({ from: source, destination, force: false })).toThrow(/already|force/i);
    expect(readFileSync(join(destination, 'opencode.jsonc'), 'utf8')).toBe(before);
  });

  it('forces a fresh backup run without changing source bytes', () => {
    writeJson(join(source, 'opencode.json'), { agent: { 'kiki-reviewer': { model: 'provider/reviewer' } } });
    const before = readFileSync(join(source, 'opencode.json'));
    expect(migrateOC1({ from: source, destination, force: false }).exitCode).toBe(0);
    const firstBackups = backupDirs(destination).length;
    expect(migrateOC1({ from: source, destination, force: true }).exitCode).toBe(0);
    expect(backupDirs(destination).length).toBe(firstBackups + 1);
    expect(readFileSync(join(source, 'opencode.json'))).toEqual(before);
  });

  it('refuses credential-bearing source configuration without echoing values or writing the destination', () => {
    const secret = 'sk-synthetic-never-print';
    writeJson(join(source, 'opencode.json'), {
      provider: { private: { options: { apiKey: secret } } },
      agent: { 'kiki-reviewer': { model: 'provider/reviewer' } },
    });
    const before = readFileSync(join(source, 'opencode.json'));

    expect(() => migrateOC1({ from: source, destination, force: false }))
      .toThrow(/secret-free|credential/i);
    try {
      migrateOC1({ from: source, destination, force: false });
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
    }
    expect(readFileSync(join(source, 'opencode.json'))).toEqual(before);
    expect(existsSync(join(destination, 'opencode.jsonc'))).toBe(false);
    expect(existsSync(join(destination, 'opencode.json'))).toBe(false);
  });

  it('refuses aliased or nesting source and destination roots before writing', () => {
    writeJson(join(source, 'opencode.json'), { agent: { 'kiki-reviewer': { model: 'provider/reviewer' } } });
    const before = readFileSync(join(source, 'opencode.json'));
    expect(() => migrateOC1({ from: source, destination: source, force: false }))
      .toThrow(/overlap|Refusing|isolat/i);
    expect(() => migrateOC1({ from: join(source, 'nested'), destination: source, force: false }))
      .toThrow(/overlap|Refusing|isolat/i);
    const alias = join(root, 'alias');
    symlinkSync(source, alias);
    expect(() => migrateOC1({ from: source, destination: alias, force: false }))
      .toThrow(/overlap|Refusing|isolat/i);
    expect(readFileSync(join(source, 'opencode.json'))).toEqual(before);
    expect(existsSync(join(source, '.agentic/kiki/migration.json'))).toBe(false);
  });

  it('does not write anything when the backup directory cannot be created', () => {
    writeJson(join(source, 'opencode.json'), { agent: { 'kiki-reviewer': { model: 'provider/reviewer' } } });
    writeJson(join(destination, 'opencode.jsonc'), { theme: 'keep' });
    mkdirSync(join(destination, '.agentic/kiki'), { recursive: true });
    writeFileSync(join(destination, '.agentic/kiki/backups'), 'not-a-directory');
    const before = readFileSync(join(destination, 'opencode.jsonc'), 'utf8');

    expect(() => migrateOC1({ from: source, destination, force: false })).toThrow();
    expect(readFileSync(join(destination, 'opencode.jsonc'), 'utf8')).toBe(before);
    expect(existsSync(join(destination, '.agentic/kiki/migration.json'))).toBe(false);
  });

  it('restores already-written destination files when the marker write fails after the config apply', () => {
    writeJson(join(source, 'opencode.json'), { agent: { 'kiki-reviewer': { model: 'provider/reviewer' } } });
    writeJson(join(destination, 'opencode.jsonc'), { theme: 'keep' });
    const target = join(destination, 'opencode.jsonc');
    const marker = join(destination, '.agentic/kiki/migration.json');
    const sourceFile = join(source, 'opencode.json');
    const before = readFileSync(target);
    const sourceBefore = readFileSync(sourceFile);
    let injected = false;
    let observedDuringFailure = '';
    fsFault.rename = (from, to) => {
      if (to !== marker || !from.endsWith('.tmp')) return;
      injected = true;
      // The config apply already succeeded; capture it before failing the marker.
      observedDuringFailure = readFileSync(target, 'utf8');
      throw new Error('injected marker failure');
    };

    expect(() => migrateOC1({ from: source, destination, force: false }))
      .toThrow(/injected marker failure/);

    expect(injected).toBe(true);
    expect(observedDuringFailure).toContain('kiki-reviewer');
    expect(observedDuringFailure).toContain('theme');
    expect(readFileSync(target)).toEqual(before);
    expect(readFileSync(sourceFile)).toEqual(sourceBefore);
    expect(existsSync(marker)).toBe(false);
    const backups = backupDirs(destination);
    expect(backups).toHaveLength(1);
    expect(existsSync(join(backups[0], 'manifest.json'))).toBe(true);
    expect(JSON.parse(readFileSync(join(backups[0], 'manifest.json'), 'utf8'))).toContain(target);
  });

  it('rejects malformed, duplicate native/legacy and prototype-key source definitions per agent', () => {
    const dangerous = JSON.parse('{"agent":{"kiki-reviewer":{"permission":{"__proto__":{"polluted":"allow"}}}}}');
    writeJson(join(source, 'opencode.json'), {
      agents: { 'kiki-planner': { model: { providerID: 'provider', model: 'planner' } } },
      agent: {
        'kiki-planner': { model: 'provider/duplicate' },
        'kiki-brainstormer': { model: 'provider/brainstormer-json' },
        'kiki-reviewer': { model: 'provider/reviewer', permissions: [{ action: 'edit', resource: '*', effect: 'deny' }] },
        'kiki-historian': dangerous.agent['kiki-reviewer'],
      },
    });
    writeJson(join(source, 'opencode.jsonc'), {
      agent: { 'kiki-brainstormer': { model: 'provider/brainstormer-jsonc' } },
    });

    const report = migrateOC1({ from: source, destination, force: false });
    expect(report.exitCode).toBe(1);
    expect(report.rejected.map(entry => entry.agent).sort()).toEqual([
      'kiki-brainstormer', 'kiki-historian', 'kiki-planner',
    ]);
    expect(report.migrated).toEqual(['kiki-reviewer']);
    expect(report.rejected.every(entry => !entry.reason.includes('provider/'))).toBe(true);
  });

  it('runs global mode from the CLI when no --project flag is given', async () => {
    writeJson(join(source, 'opencode.json'), { agent: { 'kiki-reviewer': { model: 'provider/reviewer' } } });
    vi.stubEnv('OPENCODE_CONFIG_DIR', destination);
    await migrate(['--from', source]);
    expect(readJson(join(destination, 'opencode.jsonc')).agents['kiki-reviewer'].model)
      .toEqual({ providerID: 'provider', model: 'reviewer' });
    expect(existsSync(join(destination, '.agentic/kiki/migration.json'))).toBe(true);
  });

  it('parses migration flags strictly and keeps project mode on the explicit parser', async () => {
    expect(parseMigrationArgs(['--from', '/tmp/oc1', '--force'])).toEqual({ from: '/tmp/oc1', force: true, help: false });
    expect(parseMigrationArgs(['--project', '/tmp/project'])).toEqual({ project: '/tmp/project', force: false, help: false });
    expect(parseMigrationArgs(['--help'])).toEqual({ force: false, help: true });
    expect(() => parseMigrationArgs(['--from'])).toThrow(/--from/);
    expect(() => parseMigrationArgs(['--from', 'a', '--from', 'b'])).toThrow(/duplicate|--from/i);
    expect(() => parseMigrationArgs(['--project', 'a', '--project', 'b'])).toThrow(/duplicate|--project/i);
    expect(() => parseMigrationArgs(['--force', '--force'])).toThrow(/duplicate|--force/i);
    expect(() => parseMigrationArgs(['--unknown'])).toThrow(/unsupported|unknown/i);
    await expect(migrate(['--project', join(root, 'missing')])).rejects.toThrow();
  });

  it('merges model objects as whole selections so a higher tier cannot invent a stale variant', () => {
    const merged = mergeSettings(
      { agents: { 'kiki-reviewer': { model: { providerID: 'provider', model: 'reviewer', variant: 'high' } } } },
      { agents: { 'kiki-reviewer': { model: { providerID: 'provider', model: 'reviewer' } } } },
    );
    expect(merged.agents['kiki-reviewer'].model).toEqual({ providerID: 'provider', model: 'reviewer' });
  });

  describe('project mode', () => {
    function globalFixture(): void {
      writeJson(join(source, 'opencode.json'), {
        agent: {
          'kiki-implementer': { permission: { edit: { '*': 'deny', 'src/**': 'allow' } } },
        },
      });
    }

    it('extracts local Markdown/routing with destination override precedence, inherited masking and full-success cleanup', () => {
      globalFixture();
      mkdirSync(join(project, '.opencode/agents'), { recursive: true });
      mkdirSync(join(project, '.opencode/plugins'), { recursive: true });
      mkdirSync(join(project, '.agentic/kiki'), { recursive: true });
      writeFileSync(join(project, '.opencode/agents/kiki-implementer.md'),
        '---\nmodel: source/model\npermissions:\n  - action: edit\n    resource: "*"\n    effect: deny\n  - action: edit\n    resource: "backend/**"\n    effect: allow\n---\nImplementer');
      writeFileSync(join(project, '.opencode/agents/unrelated.md'), 'keep');
      writeFileSync(join(project, '.opencode/agents/scientist.md'), '---\nmodel: other/model\n---\nprivate prompt');
      writeFileSync(join(project, '.opencode/plugins/kiki.ts'), 'legacy plugin');
      writeFileSync(join(project, '.agentic/kiki/routing.json'), JSON.stringify({
        agents: { 'kiki-planner': 'azure-cognitive-services/planner' },
      }));
      writeFileSync(join(project, '.agentic/kiki/TASK_REGISTRY.json'), '{"tasks":[{"id":"keep"}]}');
      writeJson(join(project, 'opencode.jsonc'), {
        model: 'ancestor/default',
        agents: {
          'kiki-implementer': { model: { providerID: 'existing', model: 'choice' } },
          other: { model: { providerID: 'keep', model: 'other' } },
        },
      });
      const ancestor = join(root, 'opencode.json');
      writeJson(ancestor, { agents: { 'kiki-planner': { model: { providerID: 'ancestor', model: 'base' } } } });
      const ancestorBefore = readFileSync(ancestor);
      const sourceConfig = readFileSync(join(source, 'opencode.json'));

      const report = migrateOC1({ from: source, project, destination: project, force: false });

      expect(report.exitCode).toBe(0);
      expect(report.rejected).toEqual([]);
      expect(report.manual).toContain('scientist');
      expect(JSON.stringify(report)).not.toContain('private prompt');
      const data = readJson(join(project, 'opencode.jsonc'));
      expect(data.model).toBe('ancestor/default');
      expect(data.agents['kiki-implementer'].model).toEqual({ providerID: 'existing', model: 'choice' });
      expect(data.agents['kiki-implementer'].permissions).toEqual(expect.arrayContaining([
        { action: 'edit', resource: '*', effect: 'deny' },
        { action: 'edit', resource: 'backend/**', effect: 'allow' },
        { action: 'edit', resource: 'src/**', effect: 'deny' },
      ]));
      expect(data.agents['kiki-planner'].model).toEqual({ providerID: 'azure', model: 'planner' });
      expect(data.agents.other.model).toEqual({ providerID: 'keep', model: 'other' });
      expect(readFileSync(join(source, 'opencode.json'))).toEqual(sourceConfig);
      expect(readFileSync(ancestor)).toEqual(ancestorBefore);

      expect(existsSync(join(project, '.opencode/agents/kiki-implementer.md'))).toBe(false);
      expect(existsSync(join(project, '.opencode/plugins/kiki.ts'))).toBe(false);
      expect(existsSync(join(project, '.agentic/kiki/routing.json'))).toBe(false);
      expect(existsSync(join(project, '.opencode/agents/unrelated.md'))).toBe(true);
      expect(existsSync(join(project, '.opencode/agents/scientist.md'))).toBe(true);
      expect(readFileSync(join(project, '.agentic/kiki/TASK_REGISTRY.json'), 'utf8')).toContain('keep');
      expect(existsSync(join(project, '.agentic/kiki/migration.json'))).toBe(true);
      expect(backupDirs(project).length).toBe(1);
    });

    it('does not remove local Kiki files or write a marker when one agent is rejected', () => {
      globalFixture();
      mkdirSync(join(project, '.opencode/agents'), { recursive: true });
      mkdirSync(join(project, '.opencode/plugins'), { recursive: true });
      writeFileSync(join(project, '.opencode/agents/kiki-implementer.md'),
        '---\npermissions:\n  - action: edit\n    resource: "*"\n    effect: deny\n  - action: edit\n    resource: "src/**"\n    effect: allow\n---\nImplementer');
      const reviewer = join(project, '.opencode/agents/kiki-reviewer.md');
      writeFileSync(reviewer, '---\nmodel: provider/model\npermission:\n  edit: sometimes\n---\nReviewer');
      const plugin = join(project, '.opencode/plugins/kiki.ts');
      writeFileSync(plugin, 'legacy plugin');

      const report = migrateOC1({ from: source, project, destination: project, force: false });

      expect(report.exitCode).toBe(1);
      expect(report.rejected.map(entry => entry.agent)).toEqual(['kiki-reviewer']);
      expect(existsSync(reviewer)).toBe(true);
      expect(existsSync(plugin)).toBe(true);
      expect(existsSync(join(project, '.agentic/kiki/migration.json'))).toBe(false);
      expect(readJson(join(project, 'opencode.jsonc')).agents['kiki-implementer'].permissions).toEqual([
        { action: 'edit', resource: '*', effect: 'deny' },
        { action: 'edit', resource: 'src/**', effect: 'allow' },
      ]);
      const once = readFileSync(join(project, 'opencode.jsonc'), 'utf8');
      const second = migrateOC1({ from: source, project, destination: project, force: false });
      expect(second.exitCode).toBe(1);
      expect(second.rejected.map(entry => entry.agent)).toEqual(['kiki-reviewer']);
      expect(readFileSync(join(project, 'opencode.jsonc'), 'utf8')).toBe(once);
      expect(existsSync(join(project, '.agentic/kiki/migration.json'))).toBe(false);
    });

    it('refuses an aliased project source and destination before cleanup', () => {
      globalFixture();
      expect(() => migrateOC1({ from: project, project, destination: project, force: false }))
        .toThrow(/overlap|Refusing|isolat/i);
      expect(existsSync(join(project, '.agentic/kiki/migration.json'))).toBe(false);
    });

    it('restores deleted project files and removes a newly written config when the marker write fails', () => {
      globalFixture();
      mkdirSync(join(project, '.opencode/agents'), { recursive: true });
      mkdirSync(join(project, '.opencode/plugins'), { recursive: true });
      mkdirSync(join(project, '.agentic/kiki'), { recursive: true });
      const agentFile = join(project, '.opencode/agents/kiki-implementer.md');
      const pluginFile = join(project, '.opencode/plugins/kiki.ts');
      const routing = join(project, '.agentic/kiki/routing.json');
      const target = join(project, 'opencode.jsonc');
      const marker = join(project, '.agentic/kiki/migration.json');
      const sourceFile = join(source, 'opencode.json');
      writeFileSync(agentFile, '---\nmodel: source/model\npermissions:\n  - action: edit\n    resource: "src/**"\n    effect: allow\n---\nImplementer');
      writeFileSync(pluginFile, 'legacy plugin');
      writeFileSync(routing, JSON.stringify({ agents: { 'kiki-planner': 'provider/planner' } }));
      const agentBefore = readFileSync(agentFile);
      const pluginBefore = readFileSync(pluginFile);
      const routingBefore = readFileSync(routing);
      const sourceBefore = readFileSync(sourceFile);
      let injected = false;
      let observedDuringFailure = '';
      fsFault.rename = (from, to) => {
        if (to !== marker || !from.endsWith('.tmp')) return;
        injected = true;
        // Config writes and removals already ran; the marker is the final step.
        observedDuringFailure = readFileSync(target, 'utf8');
        throw new Error('injected marker failure');
      };

      expect(() => migrateOC1({ from: source, project, destination: project, force: false }))
        .toThrow(/injected marker failure/);

      expect(injected).toBe(true);
      expect(observedDuringFailure).toContain('kiki-implementer');
      expect(observedDuringFailure).toContain('"permissions"');
      expect(existsSync(target)).toBe(false);
      expect(readFileSync(agentFile)).toEqual(agentBefore);
      expect(readFileSync(pluginFile)).toEqual(pluginBefore);
      expect(readFileSync(routing)).toEqual(routingBefore);
      expect(readFileSync(sourceFile)).toEqual(sourceBefore);
      expect(existsSync(marker)).toBe(false);
      const backups = backupDirs(project);
      expect(backups).toHaveLength(1);
      expect(existsSync(join(backups[0], 'manifest.json'))).toBe(true);
      const manifest = JSON.parse(readFileSync(join(backups[0], 'manifest.json'), 'utf8'));
      expect(manifest).toEqual(expect.arrayContaining([agentFile, pluginFile, routing]));
    });

    it('rejects duplicate native and legacy destination definitions for one agent', () => {
      globalFixture();
      writeJson(join(project, 'opencode.jsonc'), {
        agent: { 'kiki-reviewer': { model: 'source/model' } },
        agents: { 'kiki-reviewer': { model: { providerID: 'native', model: 'choice' } } },
      });

      const report = migrateOC1({ from: source, project, destination: project, force: false });
      expect(report.exitCode).toBe(1);
      expect(report.rejected.map(entry => entry.agent)).toEqual(['kiki-reviewer']);
    });

    it('delegates the existing migrateProject signature to the transaction', () => {
      globalFixture();
      mkdirSync(join(project, '.opencode/agents'), { recursive: true });
      writeFileSync(join(project, '.opencode/agents/kiki-implementer.md'),
        '---\nmodel: source/model\npermissions:\n  - action: edit\n    resource: "src/**"\n    effect: allow\n---\nImplementer');
      migrateProject(project, source);
      expect(readJson(join(project, 'opencode.jsonc')).agents['kiki-implementer'].model)
        .toEqual({ providerID: 'source', model: 'model' });
      expect(existsSync(join(project, '.opencode/agents/kiki-implementer.md'))).toBe(false);
    });
  });
});
