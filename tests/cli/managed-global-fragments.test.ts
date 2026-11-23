import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'jsonc-parser';

const fsFault = vi.hoisted(() => ({
  rename: undefined as undefined | ((from: string, to: string) => void),
  afterRename: undefined as undefined | ((from: string, to: string) => void),
}));
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    renameSync: (from: unknown, to: unknown) => {
      fsFault.rename?.(String(from), String(to));
      const result = (actual.renameSync as (...args: unknown[]) => unknown)(from, to);
      fsFault.afterRename?.(String(from), String(to));
      return result;
    },
  };
});

const { installGlobalFiles } = await import('../../src/cli/opencode-config');
const { generateGlobalPermissions, generateSecretPolicies } = await import('../../src/cli/config');
import type { PermissionRule } from '../../src/cli/opencode-config';

const PERMISSIONS_BEGIN = '/* kiki managed permissions begin */';
const PERMISSIONS_END = '/* kiki managed permissions end */';
const POLICIES_BEGIN = '/* kiki managed policies begin */';
const POLICIES_END = '/* kiki managed policies end */';

const AGENTS = [
  'kiki-orchestrator', 'kiki-brainstormer', 'kiki-planner', 'kiki-implementer',
  'kiki-gui-designer', 'kiki-reviewer', 'kiki-escalation', 'kiki-historian',
];

function target(global: string): string {
  return join(global, 'opencode.jsonc');
}

function readTarget(global: string): string {
  return readFileSync(target(global), 'utf8');
}

function data(global: string): any {
  return parse(readTarget(global), undefined, { allowTrailingComma: true });
}

function backupCount(global: string): number {
  const root = join(global, 'kiki/backups');
  if (!existsSync(root)) return 0;
  return readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).length;
}

function markdownSnapshot(global: string): Record<string, Buffer> {
  return Object.fromEntries(AGENTS.map(name => {
    const file = join(global, 'agents', `${name}.md`);
    return [file, readFileSync(file)];
  }));
}

function appendUserEntry(text: string, options: {
  permissions?: PermissionRule;
  policy?: Record<string, unknown>;
}): string {
  let result = text;
  if (options.permissions) {
    result = result.replace(
      `${PERMISSIONS_END}\n  ]`,
      `${PERMISSIONS_END},\n    ${JSON.stringify(options.permissions)}\n  ]`,
    );
  }
  if (options.policy) {
    result = result.replace(
      `${POLICIES_END}\n  ]`,
      `${POLICIES_END},\n    ${JSON.stringify(options.policy)}\n  ]`,
    );
  }
  return result;
}

describe('managed global permission and policy fragments', () => {
  let root: string;
  let global: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kiki-fragments-'));
    global = join(root, 'opencode');
    mkdirSync(global, { recursive: true });
  });
  afterEach(() => {
    fsFault.rename = undefined;
    fsFault.afterRename = undefined;
    rmSync(root, { recursive: true, force: true });
  });

  it('append_preserves_user_prefix', () => {
    const userPermissions: PermissionRule[] = [
      { action: 'shell', resource: '*', effect: 'ask' },
      { action: 'shell', resource: 'git status *', effect: 'allow' },
      { action: 'shell', resource: 'git diff *', effect: 'allow' },
    ];
    const userPolicies: Array<Record<string, unknown>> = [
      { action: 'tool.use', resource: 'read:docs/**', effect: 'deny', note: 'custom read' },
      { action: 'tool.use', resource: 'edit:docs/**', effect: 'allow', metadata: { owner: 'user' } },
    ];
    writeFileSync(target(global), `{
  // top-level comment
  "permissions": [
    // user shell rules
    ${JSON.stringify(userPermissions[0])},
    ${JSON.stringify(userPermissions[1])},
    ${JSON.stringify(userPermissions[2])}
  ],
  "policies": [
    // user policies with extra fields
    ${JSON.stringify(userPolicies[0])},
    ${JSON.stringify(userPolicies[1])}
  ]
}
`);

    installGlobalFiles(global);

    const after = data(global);
    expect(after.permissions.slice(0, userPermissions.length)).toEqual(userPermissions);
    expect(after.permissions.slice(userPermissions.length)).toEqual(generateGlobalPermissions());
    expect(after.policies.slice(0, userPolicies.length)).toEqual(userPolicies);
    expect(after.policies.slice(userPolicies.length)).toEqual(generateSecretPolicies());
    const text = readTarget(global);
    for (const marker of ['// top-level comment', '// user shell rules', '// user policies with extra fields',
      PERMISSIONS_BEGIN, PERMISSIONS_END, POLICIES_BEGIN, POLICIES_END]) {
      expect(text, marker).toContain(marker);
    }
    expect(text.indexOf('// user shell rules')).toBeLessThan(text.indexOf(PERMISSIONS_BEGIN));
    expect(text.indexOf('// user policies with extra fields')).toBeLessThan(text.indexOf(POLICIES_BEGIN));
  });

  it('append_preserves_trailing_user_line_comments', () => {
    const user: PermissionRule = { action: 'shell', resource: 'comment-tool *', effect: 'allow' };
    writeFileSync(target(global), `{
  "permissions": [
    ${JSON.stringify(user)} // trailing user comment
  ],
  "policies": [
    // policies comment only
  ]
}
`);

    installGlobalFiles(global);

    const after = data(global);
    expect(after.permissions[0]).toEqual(user);
    expect(after.permissions.slice(1)).toEqual(generateGlobalPermissions());
    expect(after.policies).toEqual(generateSecretPolicies());
    const text = readTarget(global);
    expect(text).toContain('// trailing user comment');
    expect(text).toContain('// policies comment only');
  });

  it('identical_user_tuple_is_not_owned', () => {
    const userPermission = generateGlobalPermissions()[0];
    const userPolicy = generateSecretPolicies()[0];
    writeFileSync(target(global), `{
  "permissions": [${JSON.stringify(userPermission)}],
  "policies": [${JSON.stringify(userPolicy)}]
}
`);

    installGlobalFiles(global);

    const after = data(global);
    // The unmarked user copy survives and a separately marked Kiki copy is
    // appended; no global deduplication happens.
    expect(after.permissions).toHaveLength(2);
    expect(after.permissions.filter((rule: PermissionRule) =>
      JSON.stringify(rule) === JSON.stringify(userPermission))).toHaveLength(2);
    expect(after.policies).toHaveLength(1 + generateSecretPolicies().length);
    expect(after.policies.filter((rule: Record<string, unknown>) =>
      JSON.stringify(rule) === JSON.stringify(userPolicy))).toHaveLength(2);
    const text = readTarget(global);
    expect(text.indexOf(JSON.stringify(userPermission))).toBeLessThan(text.indexOf(PERMISSIONS_BEGIN));
    expect(text.indexOf(JSON.stringify(userPolicy))).toBeLessThan(text.indexOf(POLICIES_BEGIN));
  });

  it('recognize_noop_and_user_additions', () => {
    installGlobalFiles(global);
    const once = readFileSync(target(global));
    const backups = backupCount(global);
    installGlobalFiles(global, true);
    expect(readFileSync(target(global))).toEqual(once);
    expect(backupCount(global)).toBe(backups);

    const userPermission: PermissionRule = { action: 'shell', resource: 'user-tool *', effect: 'allow' };
    const userPolicy = { action: 'tool.use', resource: 'read:user/**', effect: 'deny', custom: true };
    writeFileSync(target(global),
      appendUserEntry(readTarget(global), { permissions: userPermission, policy: userPolicy }));

    installGlobalFiles(global, true);

    const after = data(global);
    expect(after.permissions).toEqual([userPermission, ...generateGlobalPermissions()]);
    expect(after.policies.slice(0, -generateSecretPolicies().length)).toEqual([userPolicy]);
    expect(after.policies.slice(-generateSecretPolicies().length)).toEqual(generateSecretPolicies());
    const moved = readTarget(global);
    expect(moved.indexOf(JSON.stringify(userPermission))).toBeLessThan(moved.indexOf(PERMISSIONS_BEGIN));
    expect(moved.indexOf(JSON.stringify(userPolicy))).toBeLessThan(moved.indexOf(POLICIES_BEGIN));
    expect(after.permissions.filter((rule: PermissionRule) => rule.resource === 'git push *')).toHaveLength(1);

    // The relocated block is byte-stable on the next update.
    const movedOnce = readFileSync(target(global));
    const backupsAfterMove = backupCount(global);
    installGlobalFiles(global, true);
    expect(readFileSync(target(global))).toEqual(movedOnce);
    expect(backupCount(global)).toBe(backupsAfterMove);
  });

  const driftCases: Array<{ name: string; mutate: (text: string) => string }> = [
    {
      name: 'edit action',
      mutate: text => text.replace('"action": "shell", "resource": "git push *"', '"action": "bash", "resource": "git push *"'),
    },
    {
      name: 'edit resource',
      mutate: text => text.replace('"resource": "read:.env*"', '"resource": "read:.env.local"'),
    },
    {
      name: 'edit effect',
      mutate: text => text.replace('"action": "tool.use", "resource": "read:.env*", "effect": "deny"',
        '"action": "tool.use", "resource": "read:.env*", "effect": "ask"'),
    },
    {
      name: 'remove one statement',
      mutate: text => text.replace(/    \{ "action": "tool\.use", "resource": "edit:\.env\*", "effect": "deny" \},\n/, ''),
    },
    {
      name: 'add a field',
      mutate: text => text.replace('"resource": "read:.env*", "effect": "deny"',
        '"resource": "read:.env*", "effect": "deny", "note": "added"'),
    },
    {
      name: 'reorder managed statements',
      mutate: text => {
        const first = '    { "action": "tool.use", "resource": "read:.env*", "effect": "deny" },\n';
        const second = '    { "action": "tool.use", "resource": "edit:.env*", "effect": "deny" },\n';
        return text.replace(`${first}${second}`, `${second}${first}`);
      },
    },
    {
      name: 'duplicate markers',
      mutate: text => text.replace(POLICIES_BEGIN, `${POLICIES_BEGIN}\n    ${POLICIES_BEGIN}`),
    },
    {
      name: 'partially removed markers',
      mutate: text => text.replace(`    ${POLICIES_END}\n`, ''),
    },
  ];

  for (const drift of driftCases) {
    it(`managed_drift_stops_with_evidence: ${drift.name}`, () => {
      installGlobalFiles(global);
      const before = readTarget(global);
      const mutated = drift.mutate(before);
      expect(mutated, drift.name).not.toBe(before);
      writeFileSync(target(global), mutated);
      const markdown = markdownSnapshot(global);
      const backups = backupCount(global);

      let message = '';
      try {
        installGlobalFiles(global, true);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message, drift.name).toMatch(/managed|drift|ambiguous|modified/i);
      expect(message, drift.name).toMatch(/expected|observed/i);
      expect(message, drift.name).toContain(target(global));
      expect(readTarget(global), drift.name).toBe(mutated);
      expect(backupCount(global), drift.name).toBe(backups);
      expect(markdownSnapshot(global), drift.name).toEqual(markdown);
    });
  }

  it('whitespace_and_object_key_reordering_alone_is_not_drift', () => {
    installGlobalFiles(global);
    const text = readTarget(global);
    const reordered = text.replace(
      '{ "action": "tool.use", "resource": "read:.env*", "effect": "deny" }',
      '{   "effect" : "deny", "action": "tool.use", "resource": "read:.env*"   }',
    );
    expect(reordered).not.toBe(text);
    writeFileSync(target(global), reordered);

    installGlobalFiles(global, true);

    expect(readTarget(global)).toBe(reordered);
  });

  const ambiguousCases: Array<{ name: string; text: string; pattern: RegExp }> = [
    { name: 'non-array permissions', text: '{"permissions": {}}', pattern: /Invalid top-level permissions/i },
    { name: 'non-array policies', text: '{"policies": "deny"}', pattern: /Invalid top-level policies/i },
    { name: 'malformed JSONC', text: '{"permissions": [', pattern: /Invalid OpenCode/i },
    {
      name: 'duplicate top-level permissions key',
      text: '{"permissions": [], "permissions": []}',
      pattern: /duplicate top-level permissions/i,
    },
  ];
  for (const ambiguous of ambiguousCases) {
    it(`malformed_or_ambiguous_top_level_stops: ${ambiguous.name}`, () => {
      writeFileSync(target(global), ambiguous.text);
      expect(() => installGlobalFiles(global)).toThrow(ambiguous.pattern);
      expect(readTarget(global)).toBe(ambiguous.text);
      expect(existsSync(join(global, 'agents'))).toBe(false);
      expect(backupCount(global)).toBe(0);
    });
  }

  it('malformed_or_ambiguous_top_level_stops: duplicate keys in a managed entry', () => {
    installGlobalFiles(global);
    const text = readTarget(global).replace(
      '{ "action": "shell", "resource": "git push *", "effect": "ask" }',
      '{ "action": "shell", "action": "shell", "resource": "git push *", "effect": "ask" }',
    );
    writeFileSync(target(global), text);
    const before = readFileSync(target(global));
    expect(() => installGlobalFiles(global, true)).toThrow(/managed|ambiguous|duplicate/i);
    expect(readFileSync(target(global))).toEqual(before);
  });

  it('fragment_write_failure_restores_original_bytes', () => {
    installGlobalFiles(global);
    const user: PermissionRule = { action: 'shell', resource: 'rollback *', effect: 'allow' };
    writeFileSync(target(global), appendUserEntry(readTarget(global), { permissions: user }));
    const before = readTarget(global);
    const markdown = markdownSnapshot(global);

    fsFault.rename = (from, to) => {
      if (to !== target(global)) return;
      if (!existsSync(from)) return;
      if (readFileSync(from, 'utf8').includes(POLICIES_BEGIN)) {
        throw new Error('injected fragment write failure');
      }
    };

    expect(() => installGlobalFiles(global, true)).toThrow(/rolled back|fragment write failure/i);
    expect(readTarget(global)).toBe(before);
    expect(markdownSnapshot(global)).toEqual(markdown);
  });

  it('incorrect_policies_reread_restores_original_bytes', () => {
    installGlobalFiles(global);
    const user: PermissionRule = { action: 'shell', resource: 'reread *', effect: 'allow' };
    writeFileSync(target(global), appendUserEntry(readTarget(global), { permissions: user }));
    const before = readTarget(global);
    const markdown = markdownSnapshot(global);
    let tampered = false;

    fsFault.afterRename = (_from, to) => {
      if (to !== target(global) || tampered) return;
      const current = readFileSync(target(global), 'utf8');
      if (!current.includes(POLICIES_BEGIN)) return;
      tampered = true;
      const parsed = JSON.parse(current);
      delete parsed.policies;
      writeFileSync(target(global), JSON.stringify(parsed));
    };

    expect(() => installGlobalFiles(global, true)).toThrow(/verification|rolled back/i);
    expect(tampered).toBe(true);
    expect(readTarget(global)).toBe(before);
    expect(markdownSnapshot(global)).toEqual(markdown);
  });

  it('backup_includes_original_policies_with_restrictive_modes', () => {
    installGlobalFiles(global);
    const user: PermissionRule = { action: 'shell', resource: 'backup *', effect: 'allow' };
    writeFileSync(target(global), appendUserEntry(readTarget(global), { permissions: user }));
    const original = readTarget(global);

    installGlobalFiles(global, true);

    const root = join(global, 'kiki/backups');
    const dirs = readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory());
    expect(dirs.length).toBeGreaterThan(0);
    const backupDir = join(root, dirs.at(-1)!.name);
    const manifest = JSON.parse(readFileSync(join(backupDir, 'manifest.json'), 'utf8')) as string[];
    expect(manifest).toContain(target(global));
    const entry = readdirSync(backupDir).find(name => name.endsWith('-opencode.jsonc'));
    expect(entry, JSON.stringify(readdirSync(backupDir))).toBeDefined();
    expect(readFileSync(join(backupDir, entry!), 'utf8')).toBe(original);
    expect(statSync(join(backupDir, entry!)).mode & 0o777).toBe(0o600);
  });
});
