import { describe, expect, it } from 'vitest';
import { SECRET_GLOBS, generateSecretPolicies } from '../../src/cli/config';
import { baselineAgents, type PermissionRule } from '../../src/cli/opencode-config';

const agents = baselineAgents();
const ROLE_NAMES = Object.keys(agents);

function permissions(name: string): PermissionRule[] {
  return agents[name].settings.permissions as PermissionRule[];
}

describe('shared secret policy block', () => {
  it('emits the exact read-then-edit deny shape for all seven secret globs', () => {
    const policies = generateSecretPolicies();
    expect(policies).toHaveLength(SECRET_GLOBS.length * 2);
    expect(policies).toEqual(SECRET_GLOBS.flatMap(resource => [
      { action: 'tool.use', resource: `read:${resource}`, effect: 'deny' },
      { action: 'tool.use', resource: `edit:${resource}`, effect: 'deny' },
    ]));
    expect(policies.every(rule => rule.action === 'tool.use' && rule.effect === 'deny')).toBe(true);
  });

  it('binds both reading and writing every glob, in order', () => {
    const resources = generateSecretPolicies().map(rule => rule.resource);
    for (const resource of SECRET_GLOBS) {
      const read = resources.indexOf(`read:${resource}`);
      const edit = resources.indexOf(`edit:${resource}`);
      expect(read, resource).toBeGreaterThanOrEqual(0);
      expect(edit, resource).toBe(read + 1);
    }
  });

  it('removes secret permissions from every role array', () => {
    for (const name of ROLE_NAMES) {
      for (const rule of permissions(name)) {
        expect(SECRET_GLOBS.includes(rule.resource), `${name} ${rule.resource}`).toBe(false);
        if (rule.action === 'read') expect.fail(`${name}: no read permission entries remain`);
      }
      // The only edit rules are the broad fallback and the role territories.
      expect(permissions(name).filter(rule => rule.action === 'edit' && rule.effect === 'deny'), name)
        .toEqual([{ action: 'edit', resource: '*', effect: 'deny' }]);
    }
  });
});
