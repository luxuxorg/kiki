import { describe, expect, it } from 'vitest';
import { baselineAgents, type PermissionRule } from '../../src/cli/opencode-config';

const agents = baselineAgents();
const ROLE_NAMES = [
  'kiki-orchestrator',
  'kiki-brainstormer',
  'kiki-planner',
  'kiki-implementer',
  'kiki-gui-designer',
  'kiki-reviewer',
  'kiki-escalation',
  'kiki-historian',
] as const;

function permissions(name: string): PermissionRule[] {
  return agents[name].settings.permissions as PermissionRule[];
}

function effect(name: string, action: string, resource: string): PermissionRule['effect'] | undefined {
  return permissions(name).find(rule => rule.action === action && rule.resource === resource)?.effect;
}

function edit(name: string, resource: string): PermissionRule['effect'] | undefined {
  return effect(name, 'edit', resource);
}

describe('generated worktree permission parity', () => {
  it('grants both singular and plural worktree docs to brainstormer and planner only', () => {
    for (const name of ['kiki-brainstormer', 'kiki-planner']) {
      for (const root of ['.worktree/**/', '.worktrees/**/']) {
        expect(edit(name, `${root}docs/superpowers/**`), `${name} ${root}docs`).toBe('allow');
        expect(edit(name, `${root}docs/superpowers/plans/**`), `${name} ${root}plans`).toBe('allow');
        expect(edit(name, `${root}docs/superpowers/specs/**`), `${name} ${root}specs`).toBe('allow');
        expect(edit(name, `${root}src/**`), `${name} ${root}src`).not.toBe('allow');
        expect(edit(name, `${root}tests/**`), `${name} ${root}tests`).not.toBe('allow');
      }
    }
  });

  it('grants both singular and plural worktree source/tests to implementer and gui-designer only', () => {
    for (const name of ['kiki-implementer', 'kiki-gui-designer']) {
      for (const root of ['.worktree/**/', '.worktrees/**/']) {
        expect(edit(name, `${root}src/**`), `${name} ${root}src`).toBe('allow');
        expect(edit(name, `${root}tests/**`), `${name} ${root}tests`).toBe('allow');
      }
    }
    for (const name of ['kiki-orchestrator', 'kiki-brainstormer', 'kiki-planner', 'kiki-reviewer', 'kiki-escalation']) {
      expect(edit(name, '.worktrees/**/src/**'), `${name} plural src`).not.toBe('allow');
      expect(edit(name, '.worktrees/**/tests/**'), `${name} plural tests`).not.toBe('allow');
    }
  });

  it('grants both singular and plural task registry edits to the orchestrator only', () => {
    for (const root of ['.worktree/**/', '.worktrees/**/']) {
      expect(edit('kiki-orchestrator', `${root}.agentic/kiki/TASK_REGISTRY.json`)).toBe('allow');
    }
    for (const name of ROLE_NAMES.filter(name => name !== 'kiki-orchestrator')) {
      expect(edit(name, '.worktrees/**/.agentic/kiki/TASK_REGISTRY.json'), `${name} registry`).not.toBe('allow');
    }
    for (const root of ['.worktree/**/', '.worktrees/**/']) {
      expect(edit('kiki-orchestrator', `${root}src/**`), `${root}src`).not.toBe('allow');
      expect(edit('kiki-orchestrator', `${root}docs/superpowers/**`), `${root}docs`).not.toBe('allow');
    }
  });

  it('grants both singular and plural worktree review locations to reviewer and escalation only', () => {
    for (const name of ['kiki-reviewer', 'kiki-escalation']) {
      for (const root of ['.worktree/**/', '.worktrees/**/']) {
        expect(edit(name, `${root}.agentic/reviews/*`), `${name} ${root}agentic reviews`).toBe('allow');
        expect(edit(name, `${root}.opencode/docs/reviews/*`), `${name} ${root}opencode reviews`).toBe('allow');
        expect(edit(name, `${root}src/**`), `${name} ${root}src`).not.toBe('allow');
        expect(edit(name, `${root}tests/**`), `${name} ${root}tests`).not.toBe('allow');
        expect(edit(name, `${root}docs/**`), `${name} ${root}docs`).not.toBe('allow');
      }
    }
    for (const name of ROLE_NAMES.filter(name => name !== 'kiki-reviewer' && name !== 'kiki-escalation')) {
      expect(edit(name, '.worktrees/**/.agentic/reviews/*'), `${name} reviews`).not.toBe('allow');
    }
  });

  it('grants historian both singular and plural doc/metadata paths while denying source and tests', () => {
    for (const root of ['.worktree/**/', '.worktrees/**/']) {
      expect(edit('kiki-historian', `${root}README*`), `${root}README`).toBe('allow');
      expect(edit('kiki-historian', `${root}CHANGELOG*`), `${root}CHANGELOG`).toBe('allow');
      expect(edit('kiki-historian', `${root}docs/**`), `${root}docs`).toBe('allow');
      expect(edit('kiki-historian', `${root}.agentic/**`), `${root}agentic`).toBe('allow');
      expect(edit('kiki-historian', `${root}src/**`), `${root}src`).toBe('deny');
      expect(edit('kiki-historian', `${root}tests/**`), `${root}tests`).toBe('deny');
    }
  });

  it('adds .gitignore edit grants to the implementer only', () => {
    expect(edit('kiki-implementer', '.gitignore')).toBe('allow');
    for (const root of ['.worktree/**/', '.worktrees/**/']) {
      expect(edit('kiki-implementer', `${root}.gitignore`), `${root}.gitignore`).toBe('allow');
    }
    for (const name of ROLE_NAMES.filter(name => name !== 'kiki-implementer')) {
      expect(edit(name, '.gitignore'), `${name} root .gitignore`).not.toBe('allow');
      expect(edit(name, '.worktree/**/.gitignore'), `${name} singular .gitignore`).not.toBe('allow');
      expect(edit(name, '.worktrees/**/.gitignore'), `${name} plural .gitignore`).not.toBe('allow');
    }
  });

  it('never adds a blanket worktree write grant', () => {
    for (const name of ROLE_NAMES) {
      expect(edit(name, '.worktree/**'), `${name} singular blanket`).not.toBe('allow');
      expect(edit(name, '.worktrees/**'), `${name} plural blanket`).not.toBe('allow');
    }
  });

  it('keeps the broad edit deny as the fallback boundary for every role', () => {
    for (const name of ROLE_NAMES) expect(edit(name, '*'), name).toBe('deny');
  });

  it('keeps every generated agent model-free', () => {
    for (const name of ROLE_NAMES) expect(agents[name].settings, name).not.toHaveProperty('model');
  });

  it('grants no role an opencode.jsonc or agent-policy edit right', () => {
    for (const name of ROLE_NAMES) {
      for (const resource of ['opencode.jsonc', '**/opencode.jsonc', '.worktrees/**/opencode.jsonc', '.worktrees/**/agents/**']) {
        expect(edit(name, resource), `${name} ${resource}`).not.toBe('allow');
      }
    }
  });

  it('preserves publishing asks, force-push denies, execute/MCP limits and secret read denials', () => {
    for (const name of ROLE_NAMES) {
      expect(effect(name, 'shell', '*'), `${name} shell baseline`).toBe('allow');
      expect(effect(name, 'shell', 'git push*'), `${name} push ask`).toBe('ask');
      expect(effect(name, 'shell', 'gh pr merge*'), `${name} merge ask`).toBe('ask');
      expect(effect(name, 'shell', 'npm publish*'), `${name} publish ask`).toBe('ask');
      expect(effect(name, 'shell', 'git push --force*'), `${name} force deny`).toBe('deny');
      expect(effect(name, 'shell', 'git push -f*'), `${name} force shorthand deny`).toBe('deny');
      expect(effect(name, 'execute', '*'), `${name} execute deny`).toBe('deny');
      expect(effect(name, 'opencode_list_mcp_resources', '*'), `${name} MCP list deny`).toBe('deny');
      expect(effect(name, 'opencode_read_mcp_resource', '*'), `${name} MCP read deny`).toBe('deny');
      expect(effect(name, 'read', '**/.env*'), `${name} env deny`).toBe('deny');
      expect(effect(name, 'subagent', '*'), `${name} nested agent deny`).toBe('deny');
    }
  });
});
