import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'jsonc-parser';

const fsFault = vi.hoisted(() => ({
  afterRename: undefined as undefined | ((from: string, to: string) => void),
}));
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    renameSync: (from: unknown, to: unknown) => {
      const result = (actual.renameSync as (...args: unknown[]) => unknown)(from, to);
      fsFault.afterRename?.(String(from), String(to));
      return result;
    },
  };
});

const {
  applyProjectPermissions,
  inspectPermissions,
  planPermissionAdd,
  planPermissionRemoval,
  protectProjectSurvivors,
  selectProjectTarget,
  inheritedPermissionRules,
} = await import('../../src/cli/permission-requests');
const { generateAgentPermissions } = await import('../../src/cli/config');
import type { PermissionRule } from '../../src/cli/opencode-config';

const implementer = generateAgentPermissions()['kiki-implementer'];
const planner = generateAgentPermissions()['kiki-planner'];
const scriptsAllow: PermissionRule = { action: 'edit', resource: 'scripts/**', effect: 'allow' };
const scriptsFile: PermissionRule = { action: 'edit', resource: 'scripts/new.ts', effect: 'allow' };
const secretDeny: PermissionRule = { action: 'edit', resource: '.env*', effect: 'deny' };

function rule(action: string, resource: string, effect: PermissionRule['effect']): PermissionRule {
  return { action, resource, effect };
}

describe('project permission planning', () => {
  it('adds a narrow literal grant with the derived protective suffix', () => {
    const result = planPermissionAdd([], implementer, scriptsFile);
    expect(result.ok, result.ok ? '' : result.reason).toBe(true);
    if (!result.ok) return;
    expect(result.rules).toContainEqual(scriptsFile);
    expect(result.rules.slice(-7)).toEqual(implementer.slice(-7));
  });

  it('repeated_add_and_remove_accept_their_own_trailing_protection', () => {
    const first = planPermissionAdd([], implementer, scriptsFile);
    expect(first.ok, first.ok ? '' : first.reason).toBe(true);
    if (!first.ok) return;
    const secondGrant = rule('edit', 'vendor/new.ts', 'allow');
    const second = planPermissionAdd(first.rules, implementer, secondGrant);
    expect(second.ok, second.ok ? '' : second.reason).toBe(true);
    if (!second.ok) return;
    expect(second.rules).toContainEqual(scriptsFile);
    expect(second.rules).toContainEqual(secondGrant);
    expect(second.rules.slice(-7)).toEqual(implementer.slice(-7));
    expect(second.rules.filter(item => JSON.stringify(item) === JSON.stringify(secretDeny))).toHaveLength(1);
    const secondIndex = second.rules.findIndex(item =>
      item.action === secondGrant.action
      && item.resource === secondGrant.resource
      && item.effect === secondGrant.effect);
    expect(secondIndex).toBeGreaterThanOrEqual(0);
    const removed = planPermissionRemoval(second.rules, implementer, secondIndex, secondGrant);
    expect(removed.ok, removed.ok ? '' : removed.reason).toBe(true);
  });

  it('coverage_refuses_src_tests_redundancy', () => {
    for (const grant of [
      rule('edit', 'src/new.ts', 'allow'),
      rule('edit', 'src/nested/**', 'allow'),
      rule('edit', 'tests/new.test.ts', 'allow'),
      rule('read', 'src/new.ts', 'allow'),
    ]) {
      const result = planPermissionAdd([], implementer, grant);
      expect(result.ok, grant.resource).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/covered|redundant/i);
    }
  });

  it('validator_rejects_secrets_boundaries_and_non_file_actions', () => {
    for (const grant of [
      rule('edit', '.env', 'allow'),
      rule('edit', 'scripts/.env.production', 'allow'),
      rule('edit', 'docs/superpowers/x.md', 'allow'),
      rule('shell', 'git push*', 'allow'),
      rule('edit', 'scripts/**', 'deny'),
      rule('edit', 'scripts/*', 'allow'),
      rule('edit', '../outside/**', 'allow'),
    ]) {
      expect(planPermissionAdd([], implementer, grant).ok, JSON.stringify(grant)).toBe(false);
    }
    expect(planPermissionAdd([], planner, rule('edit', 'src/special.ts', 'allow')).ok).toBe(false);
  });

  it('protectProjectSurvivors preserves supported handwritten deny and ask entries', () => {
    const local = [
      rule('edit', 'vendor/**', 'deny'),
      rule('edit', 'scripts/**', 'ask'),
    ];
    const result = protectProjectSurvivors(local, implementer);
    expect(result.ok, result.ok ? '' : result.reason).toBe(true);
    if (!result.ok) return;
    expect(result.rules.slice(0, 2)).toEqual(local);
  });

  it('protectProjectSurvivors rejects unsafe asks that could override a deny', () => {
    const result = protectProjectSurvivors([rule('edit', 'docs/superpowers/**', 'ask')], implementer);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/boundary|unsafe ask/i);
    const shellAsk = protectProjectSurvivors([rule('shell', 'docker push*', 'ask')], implementer);
    expect(shellAsk.ok).toBe(false);
  });

  it('protectProjectSurvivors rejects legacy baseline mirrors and malformed rules', () => {
    expect(protectProjectSurvivors([implementer[0]], implementer).ok).toBe(false);
    expect(protectProjectSurvivors([rule('edit', '', 'allow')], implementer).ok).toBe(false);
    expect(protectProjectSurvivors([rule('edit', 'scripts/**', 'ask')], implementer).ok).toBe(true);
  });

  it('remove_selected_handwritten_allow_ask_deny', () => {
    const local = [
      rule('edit', 'vendor/**', 'allow'),
      rule('edit', 'vendor/secret/**', 'deny'),
      rule('edit', 'scripts/**', 'ask'),
    ];
    for (const [index, expected] of local.entries()) {
      const result = planPermissionRemoval(local, implementer, index, expected);
      expect(result.ok, `${index}: ${result.ok ? '' : result.reason}`).toBe(true);
      if (!result.ok) continue;
      expect(result.rules).not.toContainEqual(expected);
      for (const survivor of local.filter((_rule, position) => position !== index)) {
        expect(result.rules).toContainEqual(survivor);
      }
    }
  });

  it('duplicate_tuple_only_selected_index_removed', () => {
    const local = [scriptsAllow, scriptsAllow];
    const result = planPermissionRemoval(local, implementer, 1, scriptsAllow);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rules.filter(item => JSON.stringify(item) === JSON.stringify(scriptsAllow))).toHaveLength(1);
  });

  it('survivors_preserved_without_provenance_claim', () => {
    const local = [
      rule('edit', 'vendor/**', 'allow'),
      rule('edit', 'vendor/private/**', 'deny'),
      rule('edit', 'scripts/**', 'ask'),
      rule('edit', 'scripts/run.sh', 'allow'),
    ];
    const result = planPermissionRemoval(local, implementer, 0, local[0]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rules).toEqual(expect.arrayContaining(local.slice(1)));
  });

  it('stale_index_or_tuple_zero_writes', () => {
    expect(planPermissionRemoval([scriptsAllow], implementer, 1, scriptsAllow).ok).toBe(false);
    expect(planPermissionRemoval([scriptsAllow], implementer, -1, scriptsAllow).ok).toBe(false);
    expect(planPermissionRemoval([scriptsAllow], implementer, 0, scriptsFile).ok).toBe(false);
  });

  it('required_mask_or_secret_deny_removal_refused', () => {
    const local = [scriptsAllow, secretDeny];
    const result = planPermissionRemoval(local, implementer, 1, secretDeny);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/inherited|required|protection/i);

    const inheritedWithAsk: PermissionRule[] = [
      rule('edit', '*', 'deny'),
      rule('edit', 'scripts/**', 'ask'),
    ];
    const withMask = [scriptsFile, rule('edit', 'scripts/**', 'ask')];
    const maskResult = planPermissionRemoval(withMask, inheritedWithAsk, 1, withMask[1]);
    expect(maskResult.ok).toBe(false);
  });

  it('survivor_protection_last_match_preserved', () => {
    const local = [
      scriptsAllow,
      rule('edit', 'scripts/public/**', 'deny'),
    ];
    const result = protectProjectSurvivors(local, implementer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rules.slice(0, 2)).toEqual(local);
    expect(result.rules.slice(-7)).toEqual(implementer.slice(-7));
    expect(result.rules.at(-7)).toEqual(secretDeny);
  });

  it('unsupported_surviving_allow_no_silent_cleanup', () => {
    const unsupported = rule('edit', 'scripts/*', 'allow');
    const local = [scriptsAllow, unsupported];
    expect(planPermissionRemoval(local, implementer, 0, local[0]).ok).toBe(false);
    expect(protectProjectSurvivors(local, implementer).ok).toBe(false);
  });

  it('redundant_retained_restriction_reported_not_removed', () => {
    const inherited: PermissionRule[] = [
      rule('edit', '*', 'deny'),
      rule('edit', 'scripts/**', 'ask'),
    ];
    const result = planPermissionAdd([], inherited, scriptsFile);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/ineffective|retained restriction/i);
  });

  it('global_or_inherited_selection_refused', () => {
    const local = [implementer[0], scriptsAllow];
    const result = planPermissionRemoval(local, implementer, 0, implementer[0]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/inherited|global/i);
  });

  it('unsupported_selected_ask_can_be_removed_when_survivors_validate', () => {
    const unsupportedAsk = rule('shell', 'docker push*', 'ask');
    const local = [scriptsAllow, unsupportedAsk];
    const result = planPermissionRemoval(local, implementer, 1, unsupportedAsk);
    expect(result.ok, result.ok ? '' : result.reason).toBe(true);
    if (!result.ok) return;
    expect(result.rules).toContainEqual(scriptsAllow);
    expect(result.rules).not.toContainEqual(unsupportedAsk);
  });

  it('final grant removal returns an empty project rule array', () => {
    const result = planPermissionRemoval([scriptsAllow], implementer, 0, scriptsAllow);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rules).toEqual([]);
  });
});

describe('project permission inspection and application', () => {
  let root: string;
  let global: string;
  let project: string;
  let file: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kiki-perm-req-'));
    global = join(root, 'opencode');
    project = join(root, 'project');
    file = join(project, 'opencode.jsonc');
    mkdirSync(global, { recursive: true });
    mkdirSync(project, { recursive: true });
  });
  afterEach(() => {
    fsFault.afterRename = undefined;
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  function writeGlobal(): void {
    writeFileSync(join(global, 'opencode.jsonc'), JSON.stringify({
      agents: Object.fromEntries(Object.entries(generateAgentPermissions()).map(([name, permissions]) => [name, { permissions }])),
    }));
  }

  it('lists metadata for all eight roles and all scopes without provider settings', () => {
    writeGlobal();
    writeFileSync(file, `{
  "provider": { "secret": { "apiKey": "never-print-this" } },
  "agents": {
    "kiki-implementer": { "permissions": [
      // handwritten rule
      { "action": "edit", "resource": "vendor/**", "effect": "allow" }
    ] }
  }
}`);
    const rows = inspectPermissions({ projectDirectory: project, globalConfigDirectory: global });
    expect(rows.some(row => row.scope === 'global' && row.agent === 'kiki-reviewer')).toBe(true);
    expect(rows.some(row => row.scope === 'project' && row.agent === 'kiki-implementer')).toBe(true);
    expect(JSON.stringify(rows)).not.toContain('never-print-this');
    expect(rows.find(row => row.scope === 'project')).toMatchObject({ file, index: 0 });
  });

  it('selects a sole project config and refuses ambiguous candidates', () => {
    expect(selectProjectTarget({ projectDirectory: project, globalConfigDirectory: global }).file).toBe(file);
    writeFileSync(file, '{}');
    expect(selectProjectTarget({ projectDirectory: project, globalConfigDirectory: global }).file).toBe(file);
    writeFileSync(join(project, 'opencode.json'), '{}');
    expect(() => selectProjectTarget({ projectDirectory: project, globalConfigDirectory: global }))
      .toThrow(/ambiguous|--file/i);
    expect(selectProjectTarget({ projectDirectory: project, globalConfigDirectory: global }, file).file).toBe(file);
    expect(() => selectProjectTarget({ projectDirectory: project, globalConfigDirectory: global },
      join(global, 'opencode.jsonc'))).toThrow(/outside|project|global|target/i);
  });

  it('drift_before_write_zero_target_changes', () => {
    writeGlobal();
    const text = '{\n  // keep\n  "agents": {}\n}\n';
    writeFileSync(file, text);
    const expected = readFileSync(file);
    writeFileSync(file, text.replace('keep', 'changed'));
    const changed = readFileSync(file);
    expect(() => applyProjectPermissions(
      { projectDirectory: project, globalConfigDirectory: global },
      file, 'kiki-implementer', expected, [scriptsFile],
    )).toThrow(/changed|drift|abort/i);
    expect(readFileSync(file)).toEqual(changed);
  });

  it('missing_target_created_concurrently_abort', () => {
    writeGlobal();
    expect(() => applyProjectPermissions(
      { projectDirectory: project, globalConfigDirectory: global },
      file, 'kiki-implementer', undefined, [scriptsFile],
    )).not.toThrow();
    const expected = readFileSync(file);
    rmSync(file);
    writeFileSync(file, '{}');
    // expected bytes now describe a file that was deleted and recreated
    expect(() => applyProjectPermissions(
      { projectDirectory: project, globalConfigDirectory: global },
      file, 'kiki-implementer', expected, [scriptsFile],
    )).toThrow(/changed|drift|abort|missing/i);
  });

  it('jsonc_unrelated_bytes_and_modes_preserved', () => {
    writeGlobal();
    const text = `{
  // project comment
  "provider": { "custom": { "apiKey": "sentinel-provider-value" } },
  "agents": {
    "kiki-reviewer": { "model": { "providerID": "custom", "model": "reviewer" } },
    "kiki-implementer": {
      // role comment
      "permissions": [
        // inner rule comment
        { "action": "edit", "resource": "vendor/**", "effect": "allow" }
      ]
    }
  }
}
`;
    writeFileSync(file, text);
    chmodSync(file, 0o640);
    writeFileSync(file, text.replace('// inner rule comment\n        ', ''));
    chmodSync(file, 0o640);
    const before = readFileSync(file);
    chmodSync(file, 0o640);
    const localRules = parse(before.toString(), undefined, { allowTrailingComma: true })
      .agents['kiki-implementer'].permissions as PermissionRule[];
    const local = planPermissionAdd(localRules, inheritedPermissionRules(
      { projectDirectory: project, globalConfigDirectory: global }, 'kiki-implementer',
    ), scriptsFile);
    expect(local.ok).toBe(true);
    if (!local.ok) return;
    const result = applyProjectPermissions(
      { projectDirectory: project, globalConfigDirectory: global },
      file, 'kiki-implementer', before, local.rules,
    );
    expect(result.changed).toBe(true);
    const after = readFileSync(file, 'utf8');
    expect(after).toContain('// project comment');
    expect(after).toContain('// role comment');
    expect(after).toContain('sentinel-provider-value');
    expect(after).toContain('"kiki-reviewer"');
    expect(after).toContain('vendor/**');
    expect(statSync(file).mode & 0o777).toBe(0o640);
    expect(parse(after).agents['kiki-reviewer'].model)
      .toEqual({ providerID: 'custom', model: 'reviewer' });
  });

  it('verify_failure_safe_rollback', () => {
    writeGlobal();
    const text = `{
  "agents": {
    "kiki-implementer": { "permissions": [] }
  }
}
`;
    writeFileSync(file, text);
    const expected = readFileSync(file);
    fsFault.afterRename = (_from, to) => {
      if (to === file) writeFileSync(file, JSON.stringify({ agents: { 'kiki-implementer': { permissions: [] } } }));
    };
    expect(() => applyProjectPermissions(
      { projectDirectory: project, globalConfigDirectory: global },
      file, 'kiki-implementer', expected, [scriptsFile],
    )).toThrow(/verification|rolled back|recovery/i);
    expect(readFileSync(file)).toEqual(expected);
  });

  it('symlink_resource_stays_literal_no_target_read', () => {
    writeGlobal();
    const outside = join(root, 'outside');
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'secret.txt'), 'do-not-read');
    symlinkSync(outside, join(project, 'linked'));
    writeFileSync(file, '{}');
    const expected = readFileSync(file);
    const grant = rule('edit', 'linked/**', 'allow');
    const plan = planPermissionAdd([], implementer, grant);
    expect(plan.ok, plan.ok ? '' : plan.reason).toBe(true);
    if (!plan.ok) return;
    applyProjectPermissions(
      { projectDirectory: project, globalConfigDirectory: global },
      file, 'kiki-implementer', expected, plan.rules,
    );
    expect(parse(readFileSync(file, 'utf8')).agents['kiki-implementer'].permissions).toContainEqual(grant);
    expect(readFileSync(join(outside, 'secret.txt'), 'utf8')).toBe('do-not-read');
  });

  it('inheritedPermissionRules merges global and ancestor tiers in order', () => {
    writeFileSync(join(root, 'opencode.json'), JSON.stringify({
      agents: { 'kiki-implementer': { permissions: [rule('edit', 'ancestor/**', 'allow')] } },
    }));
    writeGlobal();
    const inherited = inheritedPermissionRules(
      { projectDirectory: project, globalConfigDirectory: global }, 'kiki-implementer',
    );
    expect(inherited).toContainEqual(rule('edit', 'ancestor/**', 'allow'));
    expect(inherited).toContainEqual({ action: 'read', resource: '*', effect: 'allow' });
  });
});
