import { describe, expect, it } from 'vitest';
import { projectPermissionRules } from '../../src/cli/oc2-permissions';
import { DEFAULT_CONFIG, generateAgentPermissions } from '../../src/cli/config';
import { HISTORICAL_GENERATED_SEQUENCES } from '../../src/cli/permission-consolidation';
import type { PermissionRule } from '../../src/cli/opencode-config';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function globToRegExp(glob: string): RegExp {
  let source = '';
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === '*') {
      source += '.*';
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') i++;
      }
    } else if (char === '?') {
      source += '.';
    } else {
      source += escapeRegExp(char);
    }
  }
  return new RegExp(`^${source}$`);
}

function effect(rules: PermissionRule[], action: string, resource: string) {
  let result: PermissionRule['effect'] | undefined;
  for (const rule of rules) {
    if (!globToRegExp(rule.action).test(action)) continue;
    if (globToRegExp(rule.resource).test(resource)) result = rule.effect;
  }
  return result;
}

const permissions = generateAgentPermissions(DEFAULT_CONFIG);
const implementer = permissions['kiki-implementer'];
const planner = permissions['kiki-planner'];
// Explicit cross-role denies are a measured historical inherited shape; the
// lean bracket expresses the boundary as `deny edit *` plus territory allows.
const historicalImplementer = HISTORICAL_GENERATED_SEQUENCES['kiki-implementer'][2];
const historicalPlanner = HISTORICAL_GENERATED_SEQUENCES['kiki-planner'][2];

function ok(local: PermissionRule[], inherited = implementer): PermissionRule[] {
  const result = projectPermissionRules(local, inherited);
  expect(result.ok, result.ok ? '' : result.reason).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.rules;
}

describe('bounded additive project permission validation', () => {
  it('allows ordinary directory additions past the broad edit fallback and protects secret descendants', () => {
    const rules = ok([{ action: 'edit', resource: 'scripts/**', effect: 'allow' }]);
    expect(rules).toContainEqual({ action: 'edit', resource: 'scripts/**', effect: 'allow' });
    expect(effect(rules, 'edit', 'scripts/deploy.sh')).toBe('allow');
    expect(effect(rules, 'edit', 'scripts/.env')).toBe('deny');
    expect(effect(rules, 'edit', 'scripts/key.pem')).toBe('deny');
    expect(effect(rules, 'edit', 'scripts/credentials.json')).toBe('deny');
    // No broad fallback or full baseline mirror is replayed.
    expect(rules.some(rule => rule.resource === '*' && rule.effect === 'deny')).toBe(false);
    expect(rules.length).toBeLessThan(implementer.length);
  });

  it('rejects explicit role-boundary crossings and unsupported forms', () => {
    // The pinned historical planner carries an explicit `src/**` deny.
    expect(projectPermissionRules(
      [{ action: 'edit', resource: 'src/special.ts', effect: 'allow' }], historicalPlanner).ok).toBe(false);
    // The pinned historical implementer carries an explicit `docs/superpowers/**` deny.
    expect(projectPermissionRules(
      [{ action: 'edit', resource: 'docs/superpowers/x.md', effect: 'allow' }], historicalImplementer).ok)
      .toBe(false);
    // The lean bracket intentionally permits project-level widening; the
    // project ask/native approval is the authorization boundary.
    expect(projectPermissionRules(
      [{ action: 'edit', resource: 'src/special.ts', effect: 'allow' }], planner).ok).toBe(true);
    expect(projectPermissionRules(
      [{ action: 'edit', resource: 'docs/superpowers/x.md', effect: 'allow' }], implementer).ok).toBe(true);
    for (const rule of [
      { action: 'edit', resource: '.env', effect: 'allow' },
      { action: 'edit', resource: 'scripts/.env', effect: 'allow' },
      { action: 'edit', resource: 'foo/*', effect: 'allow' },
      { action: 'edit', resource: '*', effect: 'allow' },
      { action: 'shell', resource: 'git push*', effect: 'allow' },
      { action: 'execute', resource: '*', effect: 'allow' },
      { action: 'probe_echo', resource: '*', effect: 'allow' },
      { action: 'subagent', resource: 'kiki-planner', effect: 'allow' },
      { action: 'edit', resource: '../outside/**', effect: 'allow' },
      { action: 'edit', resource: '/home/user/../outside/**', effect: 'allow' },
      { action: 'edit', resource: 'scripts/**', effect: 'deny' },
    ] as PermissionRule[]) {
      expect(projectPermissionRules([rule], planner).ok, JSON.stringify(rule)).toBe(false);
    }
  });

  it('supports literal files, absolute paths, both worktree spellings and inventoried tmp forms', () => {
    const safe: PermissionRule[] = [
      { action: 'edit', resource: '.worktree/**/scripts/voice/cleanup.ts', effect: 'allow' },
      { action: 'edit', resource: '.worktrees/**/scripts/voice/cleanup.ts', effect: 'allow' },
      { action: 'edit', resource: '/tmp/opencode/scratch/**', effect: 'allow' },
      { action: 'edit', resource: '**/tmp/opencode/**', effect: 'allow' },
      { action: 'external_directory', resource: '/tmp/**', effect: 'allow' },
      { action: 'external_directory', resource: 'tmp/**', effect: 'allow' },
    ];
    const rules = ok(safe);
    for (const rule of safe.filter(rule => rule.action === 'edit')) {
      expect(rules).toContainEqual(rule);
    }
    // The existing /tmp external-directory grants are already in the inherited
    // baseline; they stay effective rather than duplicated.
    const merged = [...implementer, ...rules];
    expect(effect(merged, 'external_directory', '/tmp/x')).toBe('allow');
    expect(effect(merged, 'external_directory', 'tmp/x')).toBe('allow');
    expect(effect(rules, 'edit', '.worktree/wt/scripts/voice/cleanup.ts')).toBe('allow');
    expect(effect(rules, 'edit', '.worktrees/wt/scripts/voice/cleanup.ts')).toBe('allow');
  });

  it('preserves inherited asks through a trailing mask', () => {
    const inherited: PermissionRule[] = [
      { action: 'edit', resource: '*', effect: 'deny' },
      { action: 'edit', resource: 'scripts/**', effect: 'ask' },
    ];
    const result = projectPermissionRules(
      [{ action: 'edit', resource: 'scripts/deploy.sh', effect: 'allow' }], inherited);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(effect(result.rules, 'edit', 'scripts/deploy.sh')).toBe('ask');
  });

  it('is stable when its own safety masks are fed back in', () => {
    const first = ok([{ action: 'edit', resource: 'scripts/**', effect: 'allow' }]);
    const second = ok(first);
    expect(second).toEqual(first);
  });
});
