import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'jsonc-parser';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

// Record fs operations so the suite can prove the retired ownership state path
// is never read, written, unlinked, renamed, stat'ed or backed up. Every hook
// delegates to the real call; the test's own file access uses `node:fs` and is
// therefore not recorded.
const fsCalls = vi.hoisted(() => ({
  paths: [] as { op: string; path: string }[],
}));
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  const record = (op: string, value: unknown): void => {
    if (typeof value === 'string') fsCalls.paths.push({ op, path: value });
  };
  return {
    ...actual,
    readFileSync: (file: unknown, ...args: unknown[]) => {
      record('read', file);
      return (actual.readFileSync as (...a: unknown[]) => unknown)(file, ...args);
    },
    writeFileSync: (file: unknown, ...args: unknown[]) => {
      record('write', file);
      return (actual.writeFileSync as (...a: unknown[]) => unknown)(file, ...args);
    },
    unlinkSync: (file: unknown) => {
      record('unlink', file);
      return actual.unlinkSync(file as string);
    },
    renameSync: (from: unknown, to: unknown) => {
      record('rename-from', from);
      record('rename-to', to);
      return actual.renameSync(from as string, to as string);
    },
    existsSync: (file: unknown) => {
      record('exists', file);
      return actual.existsSync(file as string);
    },
    statSync: (file: unknown, ...args: unknown[]) => {
      record('stat', file);
      return (actual.statSync as (...a: unknown[]) => unknown)(file, ...args);
    },
  };
});

const { installGlobalFiles, parseAgent, readOpenCodeSettings } = await import('../../src/cli/opencode-config');
const { DEFAULT_CONFIG, generateAgentPermissions } = await import('../../src/cli/config');
const { HISTORICAL_GENERATED_SEQUENCES, splitSecretTail } = await import(
  '../../src/cli/permission-consolidation'
);
import type { PermissionRule } from '../../src/cli/opencode-config';

const AGENTS = [
  'kiki-orchestrator', 'kiki-brainstormer', 'kiki-planner', 'kiki-implementer',
  'kiki-gui-designer', 'kiki-reviewer', 'kiki-escalation', 'kiki-historian',
];

const customAllow: PermissionRule = { action: 'edit', resource: 'vendor/**', effect: 'allow' };
const customAsk: PermissionRule = { action: 'shell', resource: 'vendor-tool *', effect: 'ask' };
const customDeny: PermissionRule = { action: 'edit', resource: 'vendor/**', effect: 'deny' };

function configFile(global: string, name = 'opencode.jsonc'): string {
  return join(global, name);
}

function stateFile(global: string): string {
  return join(global, 'kiki/state.json');
}

function keyOf(rule: PermissionRule): string {
  return `${rule.action}\u0000${rule.resource}\u0000${rule.effect}`;
}

function readConfig(file: string): any {
  return parse(readFileSync(file, 'utf8'));
}

function writeConfig(file: string, data: any): void {
  writeFileSync(file, JSON.stringify(data, null, 2));
}

function setRole(global: string, agent: string, rules: PermissionRule[], name = 'opencode.jsonc'): void {
  const file = configFile(global, name);
  const data = readConfig(file);
  data.agents ??= {};
  data.agents[agent] ??= {};
  data.agents[agent].permissions = rules;
  writeConfig(file, data);
}

function rulesOf(global: string, agent: string): PermissionRule[] {
  return readOpenCodeSettings(global, true).agents[agent].permissions;
}

function addPermissions(text: string, rules: PermissionRule[]): string {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error('missing frontmatter');
  const settings = parseYaml(match[1], { uniqueKeys: false }) as Record<string, unknown>;
  settings.permissions = rules;
  return `---\n${stringifyYaml(settings, { lineWidth: 0 }).trimEnd()}\n---\n${match[2]}`;
}

function snapshot(files: string[]): Record<string, Buffer> {
  return Object.fromEntries(files.filter(existsSync).map(file => [file, readFileSync(file)]));
}

function backupCount(global: string): number {
  const root = join(global, 'kiki/backups');
  if (!existsSync(root)) return 0;
  return readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).length;
}

/** Historical defaults interleaved with unknown allow/ask/deny customs. */
function mixedRules(agent: string): PermissionRule[] {
  const sequence = HISTORICAL_GENERATED_SEQUENCES[agent][0];
  const middle = Math.floor(sequence.length / 2);
  return [
    customAllow,
    ...sequence.slice(0, middle),
    customAsk,
    ...sequence.slice(middle),
    customDeny,
  ];
}

function expectedTarget(agent: string): PermissionRule[] {
  const canonical = generateAgentPermissions(DEFAULT_CONFIG)[agent];
  const { prefix, tail } = splitSecretTail(canonical);
  return [...prefix, customAllow, customAsk, customDeny, ...tail];
}

describe('permission baseline reconciliation', () => {
  let root: string;
  let global: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kiki-reconcile-'));
    global = join(root, 'opencode');
    vi.stubEnv('XDG_CONFIG_HOME', root);
    fsCalls.paths.length = 0;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it('mixed_old_defaults_refresh_with_customs', () => {
    const agent = 'kiki-reviewer';
    installGlobalFiles(global);
    setRole(global, agent, mixedRules(agent));

    installGlobalFiles(global, true);

    const rules = rulesOf(global, agent);
    expect(rules).toEqual(expectedTarget(agent));

    // Retired historical defaults disappear even when no complete historical
    // sequence remains.
    const canonicalKeys = new Set(generateAgentPermissions(DEFAULT_CONFIG)[agent].map(keyOf));
    for (const historical of HISTORICAL_GENERATED_SEQUENCES[agent][0]) {
      if (canonicalKeys.has(keyOf(historical))) continue;
      expect(rules.some(rule => keyOf(rule) === keyOf(historical))).toBe(false);
    }

    // Fresh defaults appear exactly once in their canonical positions.
    const canonical = generateAgentPermissions(DEFAULT_CONFIG)[agent];
    for (const rule of canonical) {
      expect(rules.filter(candidate => keyOf(candidate) === keyOf(rule)), keyOf(rule)).toHaveLength(1);
    }
    expect(rules.slice(0, canonical.length)).toEqual(canonical);
    expect(rules.slice(canonical.length)).toEqual([customAllow, customAsk, customDeny]);
  });

  it('current_retired_defaults_disappear_in_custom_mixed_arrays', () => {
    installGlobalFiles(global);
    for (const agent of AGENTS) {
      const sequences = HISTORICAL_GENERATED_SEQUENCES[agent];
      const current = sequences.at(-1)!;
      const middle = Math.floor(current.length / 2);
      // Current 569-rule defaults interleaved, reordered and truncated with
      // unknown allow/ask/deny customs in the target config.
      setRole(global, agent, [
        customAllow,
        ...current.slice(0, middle),
        customAsk,
        ...current.slice(middle).reverse().slice(0, -2),
        customDeny,
      ]);
      // A different historical sequence, truncated/reordered, plus duplicate
      // custom tuples in the crash-window markdown source.
      const markdown = join(global, 'agents', `${agent}.md`);
      writeFileSync(markdown, addPermissions(readFileSync(markdown, 'utf8'), [
        customDeny,
        ...sequences[1].slice(-8).reverse(),
        customAllow,
      ]));
    }

    installGlobalFiles(global, true);

    for (const agent of AGENTS) {
      const canonical = generateAgentPermissions(DEFAULT_CONFIG)[agent];
      const canonicalKeys = new Set(canonical.map(keyOf));
      const rules = rulesOf(global, agent);
      expect(rules.slice(0, canonical.length), agent).toEqual(canonical);
      expect(rules.slice(canonical.length), agent).toEqual([customAllow, customAsk, customDeny]);
      for (const sequence of HISTORICAL_GENERATED_SEQUENCES[agent]) {
        for (const historical of sequence) {
          if (canonicalKeys.has(keyOf(historical))) continue;
          expect(rules.some(rule => keyOf(rule) === keyOf(historical)), `${agent}: ${keyOf(historical)}`)
            .toBe(false);
        }
      }
      for (const rule of canonical) {
        expect(rules.filter(candidate => keyOf(candidate) === keyOf(rule)), `${agent}: ${keyOf(rule)}`)
          .toHaveLength(1);
      }
      expect(parseAgent(readFileSync(join(global, 'agents', `${agent}.md`), 'utf8'), agent).settings, agent)
        .not.toHaveProperty('permissions');
    }
  });

  it('multiple_sources_converge_without_state_gate', () => {
    const agent = 'kiki-implementer';
    installGlobalFiles(global);

    // A non-target config file carries the same Kiki field plus a custom.
    const secondary = {
      agents: {
        [agent]: { permissions: [customAllow, ...HISTORICAL_GENERATED_SEQUENCES[agent][0]] },
        'other-agent': { model: { providerID: 'keep', model: 'model' } },
      },
    };
    writeFileSync(configFile(global, 'opencode.json'), JSON.stringify(secondary));

    // The target file carries historical defaults and a second custom.
    setRole(global, agent, [...HISTORICAL_GENERATED_SEQUENCES[agent][1], customAsk, customAllow]);

    // The native markdown still carries a third custom and the same duplicates.
    const markdown = join(global, 'agents', `${agent}.md`);
    writeFileSync(markdown, addPermissions(
      readFileSync(markdown, 'utf8'),
      [...HISTORICAL_GENERATED_SEQUENCES[agent][0], customDeny, customAllow],
    ));

    installGlobalFiles(global, true);

    // One target field, in encounter order across configs and markdown.
    const expected = (() => {
      const canonical = generateAgentPermissions(DEFAULT_CONFIG)[agent];
      const { prefix, tail } = splitSecretTail(canonical);
      return [...prefix, customAllow, customAsk, customDeny, ...tail];
    })();
    expect(rulesOf(global, agent)).toEqual(expected);
    expect(readConfig(configFile(global, 'opencode.json')).agents[agent]?.permissions).toBeUndefined();
    expect(readConfig(configFile(global, 'opencode.json')).agents['other-agent'].model)
      .toEqual({ providerID: 'keep', model: 'model' });
    const settings = parseAgent(readFileSync(markdown, 'utf8'), agent).settings;
    expect(settings).not.toHaveProperty('permissions');
    expect(settings).not.toHaveProperty('permission');

    // Second update is byte-stable and creates no new backup.
    const tracked = [
      ...AGENTS.map(name => join(global, 'agents', `${name}.md`)),
      configFile(global),
      configFile(global, 'opencode.json'),
      join(global, 'kiki/agentic-workflow.md'),
    ];
    const once = snapshot(tracked);
    const backups = backupCount(global);
    installGlobalFiles(global, true);
    expect(snapshot(tracked)).toEqual(once);
    expect(backupCount(global)).toBe(backups);
  });

  it('state_is_inert', () => {
    const agent = 'kiki-reviewer';
    installGlobalFiles(global);
    const expected = expectedTarget(agent);
    const outputs = new Set<string>();

    const variants: { name: string; bytes?: Buffer; mode?: number }[] = [
      { name: 'absent' },
      { name: 'version-1 hash evidence', bytes: Buffer.from(JSON.stringify({
        version: 1,
        roles: { 'kiki-reviewer': 'a'.repeat(64) },
      }, null, 2)) },
      { name: 'corrupt text', bytes: Buffer.from('not-json\n') },
      { name: 'unknown version', bytes: Buffer.from(JSON.stringify({ version: 2, roles: {} }, null, 2)) },
    ];

    for (const variant of variants) {
      if (variant.bytes === undefined) {
        rmSync(stateFile(global), { force: true });
      } else {
        writeFileSync(stateFile(global), variant.bytes, { mode: 0o600 });
        chmodSync(stateFile(global), 0o600);
      }
      const before = variant.bytes === undefined
        ? undefined
        : {
          bytes: readFileSync(stateFile(global)),
          mode: statSync(stateFile(global)).mode & 0o777,
          mtime: statSync(stateFile(global)).mtimeMs,
        };

      setRole(global, agent, mixedRules(agent));
      fsCalls.paths.length = 0;
      installGlobalFiles(global, true);
      // Capture only calls made by the update itself; the assertions below use
      // the test's own file access and must not pollute this evidence.
      const producedCalls = [...fsCalls.paths];

      expect(rulesOf(global, agent), variant.name).toEqual(expected);
      outputs.add(JSON.stringify(rulesOf(global, agent)));

      if (before === undefined) {
        expect(existsSync(stateFile(global)), variant.name).toBe(false);
      } else {
        expect(readFileSync(stateFile(global)), variant.name).toEqual(before.bytes);
        expect(statSync(stateFile(global)).mode & 0o777, variant.name).toBe(before.mode);
        expect(statSync(stateFile(global)).mtimeMs, variant.name).toBe(before.mtime);
      }

      // The legacy path is never read, written, unlinked, renamed, stat'ed or
      // backed up by the update.
      expect(producedCalls.filter(call => call.path === stateFile(global)), variant.name).toEqual([]);
      expect(producedCalls.filter(call => call.path.endsWith('state.json')), variant.name).toEqual([]);

      const backupRoot = join(global, 'kiki/backups');
      if (existsSync(backupRoot)) {
        for (const entry of readdirSync(backupRoot, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const manifest = join(backupRoot, entry.name, 'manifest.json');
          if (!existsSync(manifest)) continue;
          const files = JSON.parse(readFileSync(manifest, 'utf8')) as string[];
          expect(files.some(file => file.endsWith('state.json')), variant.name).toBe(false);
        }
      }
    }

    expect(outputs.size).toBe(1);
  });

  it('fresh_install_has_no_state', () => {
    installGlobalFiles(global);
    const canonical = generateAgentPermissions(DEFAULT_CONFIG);
    for (const agent of AGENTS) {
      expect(rulesOf(global, agent), agent).toEqual(canonical[agent]);
    }
    expect(existsSync(stateFile(global))).toBe(false);
  });
});
