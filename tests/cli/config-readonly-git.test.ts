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

const KIKI_PERMISSION_RULES: { action: string; resource: string; effect: 'allow' | 'ask' }[] = [
  { action: 'shell', resource: 'kiki permissions list', effect: 'allow' },
  { action: 'shell', resource: 'kiki permissions list *', effect: 'allow' },
  { action: 'shell', resource: 'kiki permissions check', effect: 'allow' },
  { action: 'shell', resource: 'kiki permissions check *', effect: 'allow' },
  { action: 'shell', resource: 'kiki permissions add', effect: 'ask' },
  { action: 'shell', resource: 'kiki permissions add *', effect: 'ask' },
  { action: 'shell', resource: 'kiki permissions remove', effect: 'ask' },
  { action: 'shell', resource: 'kiki permissions remove *', effect: 'ask' },
];

const PUBLISHING_ASKS = [
  'git push*', 'gh pr merge*', 'gh release*', 'gh workflow run*', 'scalingo *deploy*',
  'railway up*', 'railway deploy*', 'ssh*', 'sftp*', 'scp*', 'rsync*', 'lftp*',
  'ftp*', 'curl*', 'wget*', 'npm publish*', 'yarn publish*', 'pnpm publish*',
] as const;

const FORCE_PUSH_DENIES = [
  'git push --force*', 'git push -f*', 'git push *--force*', 'git push * -f', 'git push * --force',
] as const;

function globToRegExp(glob: string): RegExp {
  let source = '';
  for (let index = 0; index < glob.length; index++) {
    const char = glob[index];
    if (char === '*') {
      source += '.*';
      if (glob[index + 1] === '*') {
        index++;
        if (glob[index + 1] === '/') index++;
      }
    } else if (char === '?') {
      source += '.';
    } else {
      source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

function effectiveShellEffect(rules: PermissionRule[], command: string): PermissionRule['effect'] | undefined {
  let effect: PermissionRule['effect'] | undefined;
  for (const rule of rules) {
    if (rule.action === 'shell' && globToRegExp(rule.resource).test(command)) effect = rule.effect;
  }
  return effect;
}

describe('managed permission command rules', () => {
  for (const name of Object.keys(agents)) {
    it(`emits the exact eight rules after the shell baseline for ${name}`, () => {
      const rules = shell(name);
      const baselineIndex = rules.findIndex(rule =>
        rule.action === 'shell' && rule.resource === '*' && rule.effect === 'allow');
      expect(baselineIndex, name).toBeGreaterThanOrEqual(0);
      expect(rules.slice(baselineIndex + 1, baselineIndex + 1 + KIKI_PERMISSION_RULES.length))
        .toEqual(KIKI_PERMISSION_RULES);
      for (const expected of KIKI_PERMISSION_RULES) {
        expect(rules.filter(rule => rule.action === expected.action
          && rule.resource === expected.resource && rule.effect === expected.effect), `${name} ${expected.resource}`)
          .toHaveLength(1);
      }
    });
  }

  it('keeps publishing asks and force-push denies unchanged for all eight roles', () => {
    for (const name of Object.keys(agents)) {
      const rules = shell(name);
      for (const resource of PUBLISHING_ASKS) {
        expect(rules.filter(rule => rule.resource === resource && rule.effect === 'ask'), `${name} ${resource}`)
          .toHaveLength(1);
      }
      for (const resource of FORCE_PUSH_DENIES) {
        expect(rules.filter(rule => rule.resource === resource && rule.effect === 'deny'), `${name} ${resource}`)
          .toHaveLength(1);
      }
    }
  });

  it('does not ask for an addendum-like prefix and preserves last-match behavior', () => {
    for (const name of Object.keys(agents)) {
      const rules = shell(name);
      expect(effectiveShellEffect(rules, 'kiki permissions list'), `${name}: list`).toBe('allow');
      expect(effectiveShellEffect(rules, 'kiki permissions list --json'), `${name}: list flags`).toBe('allow');
      expect(effectiveShellEffect(rules, 'kiki permissions check'), `${name}: check`).toBe('allow');
      expect(effectiveShellEffect(rules, 'kiki permissions check src'), `${name}: check target`).toBe('allow');
      expect(effectiveShellEffect(rules, 'kiki permissions add src/x.ts'), `${name}: add`).toBe('ask');
      expect(effectiveShellEffect(rules, 'kiki permissions add'), `${name}: bare add`).toBe('ask');
      expect(effectiveShellEffect(rules, 'kiki permissions remove src/x.ts'), `${name}: remove`).toBe('ask');
      expect(effectiveShellEffect(rules, 'kiki permissions remove'), `${name}: bare remove`).toBe('ask');
      // Exact bare + space-wildcard only: no `add*`/`list*` prefix globs.
      expect(effectiveShellEffect(rules, 'kiki permissions addendum'), `${name}: addendum`).toBe('allow');
      expect(effectiveShellEffect(rules, 'kiki permissions listing'), `${name}: listing`).toBe('allow');
    }
  });
});
