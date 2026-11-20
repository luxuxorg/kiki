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

const SECRET_GLOBS = [
  '.env*',
  '**/.env*',
  '**/*secret*',
  '**/*credential*',
  '**/*.pem',
  '**/*.key',
  '**/id_rsa*',
] as const;

function permissions(name: string): PermissionRule[] {
  return agents[name].settings.permissions as PermissionRule[];
}

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

function effectFor(rules: PermissionRule[], action: string, resource: string): PermissionRule['effect'] | undefined {
  let effect: PermissionRule['effect'] | undefined;
  for (const rule of rules) {
    if (!globToRegExp(rule.action).test(action)) continue;
    if (globToRegExp(rule.resource).test(resource)) effect = rule.effect;
  }
  return effect;
}

describe('global secret edit denials', () => {
  for (const name of ROLE_NAMES) {
    it(`keeps secret paths edit-denied for ${name}`, () => {
      const rules = permissions(name);
      const editRules = rules.filter(rule => rule.action === 'edit');
      expect(editRules.slice(-SECRET_GLOBS.length)).toEqual(
        SECRET_GLOBS.map(resource => ({ action: 'edit', resource, effect: 'deny' })),
      );
    });
  }

  const cases: [string, string][] = [
    ['kiki-brainstormer', 'docs/superpowers/specs/credentials.json'],
    ['kiki-planner', 'docs/superpowers/plans/.env'],
    ['kiki-implementer', 'src/.env.local'],
    ['kiki-gui-designer', 'src/key.pem'],
    ['kiki-reviewer', '.agentic/reviews/secret-notes.md'],
    ['kiki-escalation', '.agentic/reviews/key.pem'],
    ['kiki-historian', 'docs/credentials.json'],
    ['kiki-orchestrator', '.superpowers/sdd/secret.md'],
  ];

  for (const [name, resource] of cases) {
    it(`denies ${resource} for ${name} despite broader edit grants`, () => {
      expect(effectFor(permissions(name), 'edit', resource), `${name} ${resource}`).toBe('deny');
    });
  }

  const allowed: [string, string][] = [
    ['kiki-brainstormer', 'docs/superpowers/specs/design.md'],
    ['kiki-planner', 'docs/superpowers/plans/plan.md'],
    ['kiki-implementer', 'src/index.ts'],
    ['kiki-gui-designer', 'src/component.tsx'],
    ['kiki-reviewer', '.agentic/reviews/review.md'],
    ['kiki-escalation', '.agentic/reviews/escalation.md'],
    ['kiki-historian', 'docs/guide.md'],
    ['kiki-orchestrator', '.superpowers/sdd/report.md'],
  ];

  for (const [name, resource] of allowed) {
    it(`keeps ordinary edit paths allowed for ${name}`, () => {
      expect(effectFor(permissions(name), 'edit', resource), `${name} ${resource}`).toBe('allow');
    });
  }
});
