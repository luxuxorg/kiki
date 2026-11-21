import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'jsonc-parser';

// Deterministic fault injection for the ownership transaction windows. Every
// hook delegates to the real fs call unless a test installs a fault.
const fsFault = vi.hoisted(() => ({
  write: undefined as undefined | ((file: string) => void),
  rename: undefined as undefined | ((from: string, to: string) => void),
  afterRename: undefined as undefined | ((from: string, to: string) => void),
  unlink: undefined as undefined | ((file: string) => void),
}));
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    writeFileSync: (file: unknown, data: unknown, options?: unknown) => {
      fsFault.write?.(String(file));
      return (actual.writeFileSync as (...args: unknown[]) => unknown)(file, data, options);
    },
    renameSync: (from: unknown, to: unknown) => {
      fsFault.rename?.(String(from), String(to));
      const result = (actual.renameSync as (...args: unknown[]) => unknown)(from, to);
      fsFault.afterRename?.(String(from), String(to));
      return result;
    },
    unlinkSync: (file: unknown) => {
      fsFault.unlink?.(String(file));
      return (actual.unlinkSync as (...args: unknown[]) => unknown)(file);
    },
  };
});

const { installGlobalFiles, readOpenCodeSettings } = await import('../../src/cli/opencode-config');
const { generateAgentPermissions } = await import('../../src/cli/config');
const { HISTORICAL_GENERATED_SEQUENCES } = await import('../../src/cli/permission-consolidation');
const {
  hashPermissionField, parseOwnershipState, readOwnershipState,
} = await import('../../src/cli/permission-ownership');
import type { PermissionRule } from '../../src/cli/opencode-config';

const AGENTS = [
  'kiki-orchestrator', 'kiki-brainstormer', 'kiki-planner', 'kiki-implementer',
  'kiki-gui-designer', 'kiki-reviewer', 'kiki-escalation', 'kiki-historian',
];

function stateFile(global: string): string {
  return join(global, 'kiki/state.json');
}

function configFile(global: string): string {
  return join(global, 'opencode.jsonc');
}

function backupCount(dir: string): number {
  const root = join(dir, 'kiki/backups');
  if (!existsSync(root)) return 0;
  return readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).length;
}

function snapshot(files: string[]): Record<string, Buffer> {
  return Object.fromEntries(files.filter(existsSync).map(file => [file, readFileSync(file)]));
}

function rewriteConfig(global: string, mutator: (data: any) => void): void {
  const file = configFile(global);
  const data = parse(readFileSync(file, 'utf8'));
  mutator(data);
  writeFileSync(file, JSON.stringify(data, null, 2));
}

function writeOwnedConfig(global: string, name: string, rules: PermissionRule[]): void {
  const state = JSON.parse(readFileSync(stateFile(global), 'utf8'));
  rewriteConfig(global, data => { data.agents[name].permissions = rules; });
  state.roles[name] = hashPermissionField(rules);
  writeFileSync(stateFile(global), JSON.stringify(state, null, 2));
}

function canonical(): Record<string, PermissionRule[]> {
  return generateAgentPermissions();
}

describe('permission ownership evidence', () => {
  let root: string;
  let global: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kiki-own-'));
    global = join(root, 'opencode');
    vi.stubEnv('XDG_CONFIG_HOME', root);
  });
  afterEach(() => {
    fsFault.write = undefined;
    fsFault.rename = undefined;
    fsFault.afterRename = undefined;
    fsFault.unlink = undefined;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  it('hashPermissionField is order-sensitive and whitespace-insensitive', () => {
    const rules: PermissionRule[] = [
      { action: 'edit', resource: 'src/**', effect: 'allow' },
      { action: 'edit', resource: '**/.env*', effect: 'deny' },
    ];
    expect(hashPermissionField(rules)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashPermissionField(structuredClone(rules))).toBe(hashPermissionField(rules));
    expect(hashPermissionField([...rules].reverse())).not.toBe(hashPermissionField(rules));
    expect(hashPermissionField([{ ...rules[0], effect: 'deny' }, rules[1]]))
      .not.toBe(hashPermissionField(rules));
  });

  it('parseOwnershipState accepts only the exact versioned hash-only shape', () => {
    const state = { version: 1, roles: { 'kiki-reviewer': 'a'.repeat(64) } };
    expect(parseOwnershipState(state)).toEqual(state);
    for (const value of [
      undefined, null, [], 'x', {}, { version: 2, roles: {} },
      { version: 1, roles: [] },
      { version: 1, roles: { 'kiki-reviewer': 1 } },
      { version: 1, roles: { 'kiki-reviewer': 'not-a-hash' } },
      { version: 1, roles: { '__proto__': 'a'.repeat(64) } },
      { version: 1, roles: { 'kiki-reviewer': 'a'.repeat(64) }, rules: [] },
    ]) expect(parseOwnershipState(value)).toBeUndefined();
  });

  it('owned_replace_and_second_run_byte_stable', () => {
    installGlobalFiles(global);
    expect(parseOwnershipState(readOwnershipState(stateFile(global)))).toBeDefined();
    const owned = HISTORICAL_GENERATED_SEQUENCES['kiki-implementer'][0];
    writeOwnedConfig(global, 'kiki-implementer', owned);

    installGlobalFiles(global, true);

    const rules = readOpenCodeSettings(global, true).agents['kiki-implementer'].permissions;
    expect(rules).toEqual(canonical()['kiki-implementer']);
    const state = JSON.parse(readFileSync(stateFile(global), 'utf8'));
    expect(state.roles['kiki-implementer']).toBe(hashPermissionField(rules));
    expect(JSON.stringify(rules)).not.toContain('mkdir*');
    expect(JSON.stringify(state)).not.toContain('"action"');

    const once = snapshot([
      ...AGENTS.map(name => join(global, 'agents', `${name}.md`)),
      configFile(global), stateFile(global), join(global, 'kiki/agentic-workflow.md'),
    ]);
    const backups = backupCount(global);
    installGlobalFiles(global, true);
    expect(snapshot(Object.keys(once))).toEqual(once);
    expect(backupCount(global)).toBe(backups);
  });

  it('manual_drift_all_roles_no_writes', () => {
    installGlobalFiles(global);
    const before = snapshot([
      ...AGENTS.map(name => join(global, 'agents', `${name}.md`)),
      configFile(global), stateFile(global),
    ]);
    const backups = backupCount(global);
    const recorded = JSON.parse(readFileSync(stateFile(global), 'utf8')).roles['kiki-reviewer'];
    rewriteConfig(global, data => {
      data.agents['kiki-reviewer'].permissions = [
        ...data.agents['kiki-reviewer'].permissions,
        { action: 'edit', resource: 'drift/**', effect: 'allow' },
      ];
      data.agents['kiki-planner'].permissions = data.agents['kiki-planner'].permissions.slice(0, -1);
    });
    const changed = snapshot([
      ...AGENTS.map(name => join(global, 'agents', `${name}.md`)),
      configFile(global), stateFile(global),
    ]);

    let message = '';
    try { installGlobalFiles(global, true); } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toMatch(/drift/i);
    expect(message).toContain('kiki-reviewer');
    expect(message).toContain(recorded);
    expect(message).toContain(hashPermissionField(parse(readFileSync(configFile(global), 'utf8')).agents['kiki-reviewer'].permissions));
    expect(snapshot(Object.keys(before))).toEqual(changed);
    expect(backupCount(global)).toBe(backups);
  });

  it('missing_corrupt_unknown_version_bootstrap_preserves_customs', () => {
    installGlobalFiles(global);
    const custom: PermissionRule = { action: 'edit', resource: 'scripts/**', effect: 'allow' };
    rewriteConfig(global, data => {
      data.agents['kiki-implementer'].permissions.push(custom);
    });
    rmSync(stateFile(global));

    installGlobalFiles(global, true);
    expect(readOpenCodeSettings(global, true).agents['kiki-implementer'].permissions).toContainEqual(custom);
    expect(parseOwnershipState(readOwnershipState(stateFile(global)))).toBeDefined();

    const second: PermissionRule = { action: 'edit', resource: 'vendor/**', effect: 'allow' };
    rewriteConfig(global, data => { data.agents['kiki-implementer'].permissions.push(second); });
    writeFileSync(stateFile(global), 'not-json');
    installGlobalFiles(global, true);
    expect(readOpenCodeSettings(global, true).agents['kiki-implementer'].permissions)
      .toEqual(expect.arrayContaining([custom, second]));

    writeFileSync(stateFile(global), JSON.stringify({ version: 2, roles: {} }));
    installGlobalFiles(global, true);
    expect(readOpenCodeSettings(global, true).agents['kiki-implementer'].permissions)
      .toEqual(expect.arrayContaining([custom, second]));
    expect(JSON.parse(readFileSync(stateFile(global), 'utf8')).version).toBe(1);
  });

  it('other_source_or_duplicate_field_not_hidden_by_hash', () => {
    installGlobalFiles(global);
    const before = snapshot([
      ...AGENTS.map(name => join(global, 'agents', `${name}.md`)),
      configFile(global), stateFile(global),
    ]);
    const backups = backupCount(global);
    // A second global config shadows the owned field. A matching hash on the
    // target file must not hide the competing source.
    writeFileSync(join(global, 'opencode.json'), JSON.stringify({
      agents: { 'kiki-reviewer': { permissions: canonical()['kiki-reviewer'] } },
    }));
    expect(() => installGlobalFiles(global, true)).toThrow(/other source|duplicate|drift/i);
    expect(snapshot(Object.keys(before))).toEqual(before);
    expect(backupCount(global)).toBe(backups);
    rmSync(join(global, 'opencode.json'));

    // Duplicate permission fields in the same agent are ambiguous: the parsed
    // last value may match the hash while the source bytes remain ambiguous.
    const file = configFile(global);
    const text = readFileSync(file, 'utf8');
    const agentStart = text.indexOf('"kiki-reviewer": {');
    const propertyStart = text.indexOf('"permissions":', agentStart);
    let cursor = text.indexOf('[', propertyStart);
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (; cursor < text.length; cursor++) {
      const char = text[cursor];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
      } else if (char === '"') {
        inString = true;
      } else if (char === '[') depth++;
      else if (char === ']' && --depth === 0) break;
    }
    expect(cursor).toBeLessThan(text.length);
    const property = text.slice(propertyStart, cursor + 1);
    const duplicate = `${text.slice(0, cursor + 1)},\n      ${property}${text.slice(cursor + 1)}`;
    expect(duplicate).not.toBe(text);
    writeFileSync(file, duplicate);
    const beforeDuplicate = snapshot([...Object.keys(before), file]);
    expect(() => installGlobalFiles(global, true)).toThrow(/duplicate|ambiguous/i);
    expect(readFileSync(file)).toEqual(beforeDuplicate[file]);
    expect(backupCount(global)).toBe(backups);
  });

  it('crash_between_config_and_state_rerun', () => {
    installGlobalFiles(global);
    const stable = snapshot([
      ...AGENTS.map(name => join(global, 'agents', `${name}.md`)),
      configFile(global), stateFile(global),
    ]);

    // Interruption after invalidation, before any config mutation.
    rmSync(stateFile(global));
    installGlobalFiles(global, true);
    expect(snapshot(Object.keys(stable))).toEqual(stable);
    expect(parseOwnershipState(readOwnershipState(stateFile(global)))).toBeDefined();

    // Interruption after config verification, before the state rename.
    rmSync(stateFile(global));
    installGlobalFiles(global, true);
    expect(snapshot(Object.keys(stable))).toEqual(stable);
    const once = snapshot(Object.keys(stable));
    installGlobalFiles(global, true);
    expect(snapshot(Object.keys(once))).toEqual(once);

    // Interruption after the state rename: rerun is a byte-stable no-op.
    const backups = backupCount(global);
    installGlobalFiles(global, true);
    expect(snapshot(Object.keys(once))).toEqual(once);
    expect(backupCount(global)).toBe(backups);
  });

  it('state_and_backup_modes_restrictive_and_no_temp_garbage', () => {
    installGlobalFiles(global);
    // Force one backed-up update; a fresh install has nothing to back up.
    writeFileSync(join(global, 'agents/kiki-reviewer.md'), `---
description: custom
mode: subagent
---
Existing body.
`);
    installGlobalFiles(global, true);
    expect(statSync(stateFile(global)).mode & 0o777).toBe(0o600);
    const backupRoot = join(global, 'kiki/backups');
    const backupDirs = readdirSync(backupRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory());
    expect(backupDirs).toHaveLength(1);
    const backupDir = join(backupRoot, backupDirs[0].name);
    expect(statSync(backupDir).mode & 0o777).toBe(0o700);
    expect(statSync(join(backupDir, 'manifest.json')).mode & 0o777).toBe(0o600);
    const garbage = (directory: string): string[] => readdirSync(directory, { withFileTypes: true })
      .flatMap(entry => entry.isDirectory()
        ? garbage(join(directory, entry.name))
        : entry.name.endsWith('.tmp') ? [join(directory, entry.name)] : []);
    expect(garbage(global)).toEqual([]);
  });

  it('config_verification_failure_restores_matching_evidence', () => {
    installGlobalFiles(global);
    const owned = HISTORICAL_GENERATED_SEQUENCES['kiki-implementer'][0];
    writeOwnedConfig(global, 'kiki-implementer', owned);
    const before = snapshot([configFile(global), stateFile(global)]);
    const target = configFile(global);
    fsFault.afterRename = (_from, to) => {
      if (to !== target) return;
      const data = JSON.parse(readFileSync(target, 'utf8'));
      data.agents['kiki-implementer'].permissions = [];
      writeFileSync(target, JSON.stringify(data, null, 2));
    };
    expect(() => installGlobalFiles(global, true)).toThrow(/verification|rolled back/i);
    expect(snapshot(Object.keys(before))).toEqual(before);
  });

  it('partial_old_new_crash_window_converges_without_state', () => {
    installGlobalFiles(global);
    const fresh = canonical();
    const old = HISTORICAL_GENERATED_SEQUENCES['kiki-implementer'][1];
    rewriteConfig(global, data => {
      data.agents['kiki-implementer'].permissions = old;
      data.agents['kiki-reviewer'].permissions = fresh['kiki-reviewer'];
    });
    rmSync(stateFile(global));
    installGlobalFiles(global, true);
    const settings = readOpenCodeSettings(global, true);
    for (const age of AGENTS) {
      expect(settings.agents[age].permissions, age).toEqual(fresh[age]);
    }
    const once = snapshot([configFile(global), stateFile(global)]);
    installGlobalFiles(global, true);
    expect(snapshot(Object.keys(once))).toEqual(once);
  });

  it('no_change_still_establishes_missing_state_and_never_rewrites_valid_state', () => {
    installGlobalFiles(global);
    const state = readFileSync(stateFile(global));
    const mtime = statSync(stateFile(global)).mtimeMs;
    installGlobalFiles(global, true);
    expect(readFileSync(stateFile(global))).toEqual(state);
    expect(statSync(stateFile(global)).mtimeMs).toBe(mtime);
  });

  it('invalidation_failure_no_target_mutation', () => {
    installGlobalFiles(global);
    const owned = HISTORICAL_GENERATED_SEQUENCES['kiki-reviewer'][0];
    writeOwnedConfig(global, 'kiki-reviewer', owned);
    const before = snapshot([configFile(global), stateFile(global)]);
    fsFault.unlink = file => {
      if (file === stateFile(global)) throw new Error('injected invalidation failure');
    };
    expect(() => installGlobalFiles(global, true)).toThrow(/invalidation failure/i);
    expect(snapshot(Object.keys(before))).toEqual(before);
  });

  it('state_write_failure_restores_config_then_state_last', () => {
    installGlobalFiles(global);
    const owned = HISTORICAL_GENERATED_SEQUENCES['kiki-reviewer'][0];
    writeOwnedConfig(global, 'kiki-reviewer', owned);
    const before = snapshot([configFile(global), stateFile(global)]);
    fsFault.rename = (_from, to) => {
      if (to === stateFile(global)) throw new Error('injected state rename failure');
    };
    expect(() => installGlobalFiles(global, true)).toThrow(/state rename failure|rolled back/i);
    expect(snapshot(Object.keys(before))).toEqual(before);
  });

  it('failed_config_rollback_leaves_evidence_absent_not_stale', () => {
    installGlobalFiles(global);
    const owned = HISTORICAL_GENERATED_SEQUENCES['kiki-implementer'][0];
    writeOwnedConfig(global, 'kiki-implementer', owned);
    const target = configFile(global);
    fsFault.afterRename = (_from, to) => {
      if (to === target) throw new Error('injected strip failure');
    };
    fsFault.write = file => {
      if (file === target) throw new Error('injected target restore failure');
    };

    let message = '';
    try { installGlobalFiles(global, true); } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/rollback was incomplete|recovery required/i);
    expect(message).toContain('injected strip failure');
    expect(message).toContain('injected target restore failure');
    // The old hash would describe the pre-update field, not the config that is
    // still on disk after a failed rollback. Evidence must be absent.
    expect(existsSync(stateFile(global))).toBe(false);
  });
});
