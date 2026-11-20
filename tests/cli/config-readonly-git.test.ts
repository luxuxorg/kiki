import { describe, expect, it } from 'vitest';
import { baselineAgents, type PermissionRule } from '../../src/cli/opencode-config';

const agents = baselineAgents();

// Every role except the coordination-only orchestrator may inspect repository
// state without a prompt. The orchestrator stays unchanged.
const READ_ONLY_ROLES = [
  'kiki-brainstormer',
  'kiki-planner',
  'kiki-implementer',
  'kiki-gui-designer',
  'kiki-reviewer',
  'kiki-escalation',
  'kiki-historian',
] as const;

const READ_ONLY_PATTERNS = ['git status *', 'git rev-parse *', 'git worktree list *'] as const;

function shell(name: string): PermissionRule[] {
  return (agents[name].settings.permissions as PermissionRule[]).filter(rule => rule.action === 'shell');
}

describe('read-only git shell grants', () => {
  for (const name of READ_ONLY_ROLES) {
    it(`allows the exact read-only git inspection patterns for ${name}`, () => {
      for (const resource of READ_ONLY_PATTERNS) {
        expect(shell(name).find(rule => rule.resource === resource)?.effect, `${name} ${resource}`).toBe('allow');
      }
    });
  }

  it('does not grant the read-only git patterns to the orchestrator', () => {
    for (const resource of READ_ONLY_PATTERNS) {
      expect(shell('kiki-orchestrator').some(rule => rule.resource === resource), resource).toBe(false);
    }
  });

  it('grants only the read-only worktree list form, never the writable family', () => {
    for (const name of Object.keys(agents)) {
      const worktreeAllows = shell(name)
        .filter(rule => rule.effect === 'allow' && rule.resource.startsWith('git worktree'))
        .map(rule => rule.resource);
      expect(worktreeAllows, name).toEqual(name === 'kiki-orchestrator' ? [] : ['git worktree list *']);
    }
  });
});
