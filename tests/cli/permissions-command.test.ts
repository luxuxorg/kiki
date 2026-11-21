import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'jsonc-parser';

const fsMutations = vi.hoisted(() => [] as string[]);
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  const record = (name: string) => (...args: unknown[]) => {
    fsMutations.push(`${name}:${String(args[0] ?? '')}`);
    return (actual[name as keyof typeof actual] as (...callArgs: unknown[]) => unknown)(...args);
  };
  return {
    ...actual,
    writeFileSync: record('writeFileSync'),
    renameSync: record('renameSync'),
    unlinkSync: record('unlinkSync'),
    mkdirSync: record('mkdirSync'),
    chmodSync: record('chmodSync'),
    appendFileSync: record('appendFileSync'),
  };
});

const { permissions } = await import('../../src/cli/commands/permissions');
const { generateAgentPermissions } = await import('../../src/cli/config');
import type { PermissionRule } from '../../src/cli/opencode-config';

const implementer = generateAgentPermissions()['kiki-implementer'];

function globalConfig(global: string): string {
  return join(global, 'opencode.jsonc');
}

function projectConfig(project: string, name = 'opencode.jsonc'): string {
  return join(project, name);
}

describe('kiki permissions command', () => {
  let root: string;
  let global: string;
  let project: string;
  let output: string[];
  let errors: string[];
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kiki-perm-cli-'));
    global = join(root, 'opencode');
    project = join(root, 'project');
    mkdirSync(global, { recursive: true });
    mkdirSync(project, { recursive: true });
    vi.stubEnv('XDG_CONFIG_HOME', root);
    fsMutations.length = 0;
    output = [];
    errors = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { output.push(args.join(' ')); });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { errors.push(args.join(' ')); });
    writeFileSync(globalConfig(global), JSON.stringify({
      agents: Object.fromEntries(Object.entries(generateAgentPermissions()).map(([name, rules]) => [name, { permissions: rules }])),
    }));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  async function run(args: string[]): Promise<number> {
    return permissions(args);
  }

  it('metadata_only_zero_fs_mutations_all_eight_roles', async () => {
    writeFileSync(projectConfig(project), JSON.stringify({
      agents: { 'kiki-implementer': { permissions: [{ action: 'edit', resource: 'vendor/**', effect: 'allow' }] } },
    }));
    fsMutations.length = 0;
    expect(await run(['list', '--project', project])).toBe(0);
    expect(await run(['check', '--project', project])).toBe(0);
    expect(fsMutations).toEqual([]);
    const text = [...output, ...errors].join('\n');
    for (const role of Object.keys(generateAgentPermissions())) expect(text).toContain(role);
    expect(text).toContain('vendor/**');
  });

  it('malformed_provider_config_no_disclosure', async () => {
    writeFileSync(projectConfig(project), '{"provider":{"key":"sk-SENTINEL-SECRET"');
    fsMutations.length = 0;
    expect(await run(['list', '--project', project])).toBe(1);
    const text = [...output, ...errors].join('\n');
    expect(text).not.toContain('sk-SENTINEL-SECRET');
    expect(text).toMatch(/invalid|configuration/i);
    expect(fsMutations).toEqual([]);
  });

  it('coverage_refuses_src_tests_redundancy', async () => {
    fsMutations.length = 0;
    for (const resource of ['src/new.ts', 'tests/new.test.ts']) {
      expect(await run([
        'add', resource, '--agent', 'kiki-implementer', '--action', 'edit', '--project', project, '--apply',
      ])).toBe(1);
    }
    expect(existsSync(projectConfig(project))).toBe(false);
    expect(fsMutations.filter(item => item.startsWith('writeFileSync') || item.startsWith('renameSync'))).toEqual([]);
  });

  it('narrow_literal_add_only', async () => {
    expect(await run([
      'add', 'scripts/new.ts', '--agent', 'kiki-implementer', '--action', 'edit', '--project', project, '--apply',
    ])).toBe(0);
    const rules = parse(readFileSync(projectConfig(project), 'utf8'))
      .agents['kiki-implementer'].permissions as PermissionRule[];
    expect(rules).toContainEqual({ action: 'edit', resource: 'scripts/new.ts', effect: 'allow' });
    expect(rules.some(rule => rule.resource === '*')).toBe(false);
    expect(rules.slice(-7)).toEqual(implementer.slice(-7));
  });

  it('validator_rejects_secrets_boundaries_publishing', async () => {
    for (const args of [
      ['add', '.env', '--agent', 'kiki-implementer', '--action', 'edit', '--project', project, '--apply'],
      ['add', 'docs/superpowers/x.md', '--agent', 'kiki-implementer', '--action', 'edit', '--project', project, '--apply'],
      ['add', 'git push*', '--agent', 'kiki-implementer', '--action', 'shell', '--project', project, '--apply'],
    ]) {
      expect(await run(args)).toBe(1);
    }
    expect(existsSync(projectConfig(project))).toBe(false);
  });

  it('unknown_target_action_agent_refused', async () => {
    writeFileSync(projectConfig(project), '{}');
    const before = readFileSync(projectConfig(project));
    for (const args of [
      ['add', 'scripts/x.ts', '--agent', 'not-a-role', '--action', 'edit', '--project', project, '--apply'],
      ['add', 'scripts/x.ts', '--agent', 'kiki-implementer', '--action', 'execute', '--project', project, '--apply'],
      ['add', 'scripts/x.ts', '--agent', 'kiki-implementer', '--action', 'edit', '--project', project, '--apply', '--bogus'],
      ['remove', '--agent', 'kiki-implementer', '--entry', '0', '--action', 'edit', '--resource', 'nope/**', '--effect', 'allow', '--project', project, '--apply'],
      ['remove', '--agent', 'kiki-implementer', '--entry', '9', '--action', 'edit', '--resource', 'vendor/**', '--effect', 'allow', '--project', project, '--apply'],
      ['bogus'],
    ]) expect(await run(args)).toBe(1);
    expect(readFileSync(projectConfig(project))).toEqual(before);
  });

  it('symlink_alias_not_global_write', async () => {
    const before = readFileSync(globalConfig(global));
    symlinkSync(globalConfig(global), projectConfig(project));
    expect(await run([
      'add', 'scripts/x.ts', '--agent', 'kiki-implementer', '--action', 'edit', '--project', project, '--apply',
    ])).toBe(1);
    expect(readFileSync(globalConfig(global))).toEqual(before);
  });

  it('ambiguous_configs_no_write', async () => {
    writeFileSync(projectConfig(project, 'opencode.json'), '{}');
    writeFileSync(projectConfig(project, 'opencode.jsonc'), '{}');
    const before = [readFileSync(projectConfig(project, 'opencode.json')), readFileSync(projectConfig(project, 'opencode.jsonc'))];
    expect(await run([
      'add', 'scripts/x.ts', '--agent', 'kiki-implementer', '--action', 'edit', '--project', project, '--apply',
    ])).toBe(1);
    expect(readFileSync(projectConfig(project, 'opencode.json'))).toEqual(before[0]);
    expect(readFileSync(projectConfig(project, 'opencode.jsonc'))).toEqual(before[1]);
  });

  it('remove_selected_handwritten_allow_ask_deny', async () => {
    const entries: PermissionRule[] = [
      { action: 'edit', resource: 'vendor/**', effect: 'allow' },
      { action: 'edit', resource: 'vendor/private/**', effect: 'deny' },
      { action: 'edit', resource: 'scripts/**', effect: 'ask' },
    ];
    for (const [index, selected] of entries.entries()) {
      writeFileSync(projectConfig(project), JSON.stringify({
        agents: { 'kiki-implementer': { permissions: entries } },
      }, null, 2));
      expect(await run([
        'remove', '--agent', 'kiki-implementer', '--entry', String(index),
        '--action', selected.action, '--resource', selected.resource, '--effect', selected.effect,
        '--project', project, '--apply',
      ]), `remove ${index}`).toBe(0);
      const rules = parse(readFileSync(projectConfig(project), 'utf8'))
        .agents['kiki-implementer'].permissions as PermissionRule[];
      expect(rules).not.toContainEqual(selected);
      for (const survivor of entries.filter((_rule, position) => position !== index)) {
        expect(rules).toContainEqual(survivor);
      }
    }
  });

  it('global_or_inherited_selection_refused', async () => {
    const local = [implementer[0], { action: 'edit', resource: 'vendor/**', effect: 'allow' }];
    writeFileSync(projectConfig(project), JSON.stringify({
      agents: { 'kiki-implementer': { permissions: local } },
    }));
    const before = readFileSync(projectConfig(project));
    expect(await run([
      'remove', '--agent', 'kiki-implementer', '--entry', '0',
      '--action', local[0].action, '--resource', local[0].resource, '--effect', local[0].effect,
      '--project', project, '--apply',
    ])).toBe(1);
    expect(readFileSync(projectConfig(project))).toEqual(before);
  });

  it('stale_index_or_tuple_zero_writes', async () => {
    const local = [{ action: 'edit', resource: 'vendor/**', effect: 'allow' }];
    writeFileSync(projectConfig(project), JSON.stringify({
      agents: { 'kiki-implementer': { permissions: local } },
    }));
    const before = readFileSync(projectConfig(project));
    for (const args of [
      ['remove', '--agent', 'kiki-implementer', '--entry', '3', '--action', 'edit', '--resource', 'vendor/**', '--effect', 'allow', '--project', project, '--apply'],
      ['remove', '--agent', 'kiki-implementer', '--entry', '0', '--action', 'edit', '--resource', 'vendor/other/**', '--effect', 'allow', '--project', project, '--apply'],
      ['remove', '--agent', 'kiki-implementer', '--entry', '0', '--action', 'edit', '--resource', 'vendor/**', '--effect', 'deny', '--project', project, '--apply'],
    ]) expect(await run(args)).toBe(1);
    expect(readFileSync(projectConfig(project))).toEqual(before);
  });

  it('unsupported_selected_ask_can_be_removed', async () => {
    const local = [{ action: 'shell', resource: 'docker push*', effect: 'ask' as const }];
    writeFileSync(projectConfig(project), JSON.stringify({
      agents: { 'kiki-implementer': { permissions: local } },
    }));
    expect(await run([
      'remove', '--agent', 'kiki-implementer', '--entry', '0',
      '--action', 'shell', '--resource', 'docker push*', '--effect', 'ask',
      '--project', project, '--apply',
    ])).toBe(0);
    const rules = parse(readFileSync(projectConfig(project), 'utf8'))
      .agents['kiki-implementer'].permissions;
    expect(rules ?? []).toEqual([]);
  });

  it('no_consent_or_auto_flags_are_accepted', async () => {
    writeFileSync(projectConfig(project), JSON.stringify({
      agents: { 'kiki-implementer': { permissions: [{ action: 'edit', resource: 'vendor/**', effect: 'allow' }] } },
    }));
    const before = readFileSync(projectConfig(project));
    for (const flagName of ['--auto', '--yes', '--force', '--token', '--approve']) {
      expect(await run([
        'remove', '--agent', 'kiki-implementer', '--entry', '0',
        '--action', 'edit', '--resource', 'vendor/**', '--effect', 'allow',
        '--project', project, '--apply', flagName,
      ]), flagName).toBe(1);
    }
    expect(readFileSync(projectConfig(project))).toEqual(before);
  });

  it('help_and_unknown_commands_have_stable_exit_codes', async () => {
    expect(await run(['--help'])).toBe(0);
    expect(await run(['list', '--help'])).toBe(0);
    expect(await run(['list', '--project'])).toBe(1);
    expect(await run([])).toBe(1);
  });

  it('without_apply_previews_metadata_and_writes_nothing', async () => {
    fsMutations.length = 0;
    expect(await run([
      'add', 'scripts/new.ts', '--agent', 'kiki-implementer', '--action', 'edit', '--project', project,
    ])).toBe(0);
    expect(existsSync(projectConfig(project))).toBe(false);
    expect(fsMutations.filter(item => item.startsWith('writeFileSync') || item.startsWith('renameSync'))).toEqual([]);
    expect(output.join('\n')).toContain('scripts/new.ts');
  });
});
