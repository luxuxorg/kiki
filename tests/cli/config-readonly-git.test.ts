import { describe, expect, it } from 'vitest';
import { baselineAgents, type PermissionRule } from '../../src/cli/opencode-config';

const agents = baselineAgents();
const ROLES = Object.keys(agents);

function shell(name: string): PermissionRule[] {
  return (agents[name].settings.permissions as PermissionRule[]).filter(rule => rule.action === 'shell');
}

describe('lean shell baseline', () => {
  it('allows routine work through one shell glob for every role', () => {
    for (const name of ROLES) {
      expect(shell(name)[0], name).toEqual({ action: 'shell', resource: '*', effect: 'allow' });
    }
  });

  it('keeps only the two permission-mutation asks and the final push ask', () => {
    for (const name of ROLES) {
      const asks = shell(name).filter(rule => rule.effect === 'ask');
      expect(asks, name).toEqual([
        { action: 'shell', resource: 'kiki permissions add *', effect: 'ask' },
        { action: 'shell', resource: 'kiki permissions remove *', effect: 'ask' },
        { action: 'shell', resource: 'git push *', effect: 'ask' },
      ]);
      // The final role line is the per-role push ask; a top-level ask alone does
      // not bind a role with its own rules.
      expect(shell(name).at(-1), name).toEqual({ action: 'shell', resource: 'git push *', effect: 'ask' });
    }
  });

  it('does not emit list/check rules or read-only git grants', () => {
    for (const name of ROLES) {
      for (const resource of [
        'kiki permissions list',
        'kiki permissions list *',
        'kiki permissions check',
        'kiki permissions check *',
        'git status *',
        'git rev-parse *',
        'git worktree list *',
      ]) {
        expect(shell(name).some(rule => rule.resource === resource), `${name} ${resource}`).toBe(false);
      }
    }
  });

  it('removes publishing asks and force-push denies', () => {
    const removed = [
      'gh pr merge*', 'gh release*', 'gh workflow run*', 'scalingo *deploy*',
      'railway up*', 'railway deploy*', 'ssh*', 'sftp*', 'scp*', 'rsync*',
      'lftp*', 'ftp*', 'curl*', 'wget*', 'npm publish*', 'yarn publish*',
      'pnpm publish*', 'git push --force*', 'git push -f*', 'git push *--force*',
      'git push * -f', 'git push * --force',
    ];
    for (const name of ROLES) {
      for (const resource of removed) {
        expect(shell(name).some(rule => rule.resource === resource), `${name} ${resource}`).toBe(false);
      }
    }
  });

  it('keeps the two managed asks exact, with no addendum-like prefix wildcard', () => {
    for (const name of ROLES) {
      const resources = shell(name).filter(rule => rule.effect === 'ask').map(rule => rule.resource);
      expect(resources, name).not.toContain('kiki permissions add*');
      expect(resources, name).not.toContain('kiki permissions remove*');
      expect(resources.filter(resource => resource.startsWith('kiki permissions')), name).toEqual([
        'kiki permissions add *',
        'kiki permissions remove *',
      ]);
    }
  });
});
