import { describe, expect, it } from 'vitest';
import { baselineAgents, type PermissionRule } from '../../src/cli/opencode-config';

const agents = baselineAgents();
const ROLE_NAMES = Object.keys(agents);

function permissions(name: string): PermissionRule[] {
  return agents[name].settings.permissions as PermissionRule[];
}

function edit(name: string, resource: string): PermissionRule['effect'] | undefined {
  return permissions(name).find(rule => rule.action === 'edit' && rule.resource === resource)?.effect;
}

describe('lean worktree territory behavior', () => {
  it('relies on cwd resolution and adds no worktree mirror rules', () => {
    // The measured probe (`oc2-baseline-worktree.test.ts`) shows the role
    // territory applies when the session runs inside a worktree, so the lean
    // emission carries no mirrored `.worktree/**`/`.worktrees/**` rules and no
    // blanket fallback grant.
    for (const name of ROLE_NAMES) {
      for (const rule of permissions(name)) {
        expect(rule.resource.startsWith('.worktree'), `${name} ${rule.resource}`).not.toBe(true);
      }
    }
  });

  it('does not add the conditional .worktrees/** fallback when the probe passed', () => {
    for (const name of ROLE_NAMES) {
      expect(edit(name, '.worktrees/**'), `${name} fallback`).toBeUndefined();
    }
  });

  it('keeps the broad edit deny as the fallback boundary for every role', () => {
    for (const name of ROLE_NAMES) expect(edit(name, '*'), name).toBe('deny');
  });

  it('keeps the exact role territories as plain workspace patterns', () => {
    expect(edit('kiki-orchestrator', '.agentic/kiki/TASK_REGISTRY.json')).toBe('allow');
    expect(edit('kiki-orchestrator', '.superpowers/sdd/**')).toBe('allow');
    expect(edit('kiki-brainstormer', 'docs/superpowers/**')).toBe('allow');
    expect(edit('kiki-planner', 'docs/superpowers/**')).toBe('allow');
    for (const resource of ['src/**', 'tests/**', '.gitignore', '.superpowers/sdd/**']) {
      expect(edit('kiki-implementer', resource), resource).toBe('allow');
    }
    for (const resource of ['src/**', 'tests/**', '.superpowers/sdd/**']) {
      expect(edit('kiki-gui-designer', resource), resource).toBe('allow');
    }
    for (const name of ['kiki-reviewer', 'kiki-escalation']) {
      for (const resource of ['.agentic/reviews/*', '.opencode/docs/reviews/*']) {
        expect(edit(name, resource), `${name} ${resource}`).toBe('allow');
      }
    }
    for (const resource of ['docs/**', 'README*', 'CHANGELOG*', '.agentic/**']) {
      expect(edit('kiki-historian', resource), resource).toBe('allow');
    }
  });

  it('adds no unrelated grant and keeps every generated agent model-free', () => {
    for (const name of ROLE_NAMES) {
      expect(permissions(name).filter(rule => rule.action !== 'shell' && rule.action !== 'edit'), name)
        .toEqual([]);
      expect(agents[name].settings, name).not.toHaveProperty('model');
      for (const resource of ['opencode.jsonc', '**/opencode.jsonc', 'agents/**', '/tmp/**', 'tmp/**']) {
        expect(edit(name, resource), `${name} ${resource}`).not.toBe('allow');
      }
    }
  });

  it('keeps only the lean shell asks', () => {
    for (const name of ROLE_NAMES) {
      const shell = permissions(name).filter(rule => rule.action === 'shell');
      expect(shell, name).toEqual([
        { action: 'shell', resource: '*', effect: 'allow' },
        { action: 'shell', resource: 'kiki permissions add *', effect: 'ask' },
        { action: 'shell', resource: 'kiki permissions remove *', effect: 'ask' },
        { action: 'shell', resource: 'git push *', effect: 'ask' },
      ]);
    }
  });
});
