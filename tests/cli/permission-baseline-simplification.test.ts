import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  PERMISSION_REQUEST_FRAGMENT,
  SECRET_GLOBS,
  generateAgentPermissions,
  generateAllTemplates,
  generateGlobalPermissions,
  generateSecretPolicies,
  withBaselineBehaviorPrompt,
} from '../../src/cli/config';
import type { PermissionRule } from '../../src/cli/opencode-config';

type Effect = PermissionRule['effect'];
type Rule = PermissionRule;

function rule(action: string, resource: string, effect: Effect): Rule {
  return { action, resource, effect };
}

const pushAsk = rule('shell', 'git push *', 'ask');
const bracketHead: Rule[] = [
  rule('shell', '*', 'allow'),
  rule('shell', 'kiki permissions add *', 'ask'),
  rule('shell', 'kiki permissions remove *', 'ask'),
  rule('edit', '*', 'deny'),
];

// Independently specified territories; production helpers must not be used to
// derive the expected values or the assertions become tautological.
const TERRITORIES: Record<string, string[]> = {
  'kiki-orchestrator': ['.agentic/kiki/TASK_REGISTRY.json', '.superpowers/sdd/**'],
  'kiki-brainstormer': ['docs/superpowers/**'],
  'kiki-planner': ['docs/superpowers/**'],
  'kiki-implementer': ['src/**', 'tests/**', '.gitignore', '.superpowers/sdd/**'],
  'kiki-gui-designer': ['src/**', 'tests/**', '.superpowers/sdd/**'],
  'kiki-reviewer': ['.agentic/reviews/*', '.opencode/docs/reviews/*'],
  'kiki-escalation': ['.agentic/reviews/*', '.opencode/docs/reviews/*'],
  'kiki-historian': ['docs/**', 'README*', 'CHANGELOG*', '.agentic/**'],
};

const ROLES = Object.keys(TERRITORIES);

function expectedRole(territories: string[]): Rule[] {
  return [...bracketHead, ...territories.map(resource => rule('edit', resource, 'allow')), pushAsk];
}

describe('lean global permission baseline', () => {
  it('exact_lean_role_brackets', () => {
    const permissions = generateAgentPermissions(DEFAULT_CONFIG);
    expect(Object.keys(permissions).sort()).toEqual([...ROLES].sort());
    let total = 0;
    for (const role of ROLES) {
      expect(permissions[role], role).toEqual(expectedRole(TERRITORIES[role]));
      expect(permissions[role].length, role).toBe(TERRITORIES[role].length + bracketHead.length + 1);
      total += permissions[role].length;
    }
    // 59 role entries: 4 shared bracket lines + every role's territories + push.
    expect(total).toBe(59);
  });

  it('emits each role at most nine lines with no duplicate tuple', () => {
    for (const [role, rules] of Object.entries(generateAgentPermissions(DEFAULT_CONFIG))) {
      expect(rules.length, role).toBeLessThanOrEqual(9);
      const keys = rules.map(item => `${item.action}\u0000${item.resource}\u0000${item.effect}`);
      expect(new Set(keys).size, role).toBe(keys.length);
    }
  });

  it('shared_protection_exact_shape_and_total', () => {
    expect(generateGlobalPermissions()).toEqual([pushAsk]);
    const policies = generateSecretPolicies();
    expect(policies).toEqual(SECRET_GLOBS.flatMap(resource => [
      { action: 'tool.use', resource: `read:${resource}`, effect: 'deny' },
      { action: 'tool.use', resource: `edit:${resource}`, effect: 'deny' },
    ]));
    expect(policies).toHaveLength(14);

    const permissions = generateAgentPermissions(DEFAULT_CONFIG);
    const roleTotal = Object.values(permissions).reduce((sum, rules) => sum + rules.length, 0);
    expect(roleTotal + generateGlobalPermissions().length + policies.length).toBe(74);
  });

  it('has no read, route, secret-tail or mirror permission entries', () => {
    const all = Object.values(generateAgentPermissions(DEFAULT_CONFIG)).flat();
    expect(all.filter(item => item.action === 'read')).toEqual([]);
    expect(all.filter(item => ['execute', 'webfetch', 'websearch', 'skill', 'subagent', 'external_directory']
      .includes(item.action))).toEqual([]);
    expect(all.filter(item => item.action.includes('*'))).toEqual([]);
    expect(all.filter(item => SECRET_GLOBS.includes(item.resource))).toEqual([]);
    expect(all.filter(item => item.resource.startsWith('.worktree'))).toEqual([]);
    expect(all.filter(item => item.resource === 'tmp/**' || item.resource === '/tmp/**')).toEqual([]);
  });

  it('covers routine git, list and check through the shell baseline', () => {
    for (const role of ROLES) {
      const rules = generateAgentPermissions(DEFAULT_CONFIG)[role];
      const shell = rules.filter(item => item.action === 'shell');
      expect(shell[0], role).toEqual(rule('shell', '*', 'allow'));
      expect(shell.filter(item => item.effect === 'ask'), role).toEqual([
        rule('shell', 'kiki permissions add *', 'ask'),
        rule('shell', 'kiki permissions remove *', 'ask'),
        pushAsk,
      ]);
      // Only real pushes ask; wrappers, force pushes and routine inspection run
      // under the shell baseline.
      expect(shell.some(item => /--force| -f$/.test(item.resource)), role).toBe(false);
      expect(shell.some(item => item.resource === 'git status *'), role).toBe(false);
      expect(shell.some(item => item.resource === 'kiki permissions list'), role).toBe(false);
      expect(shell.some(item => item.resource === 'kiki permissions check'), role).toBe(false);
      expect(rules.some(item => item.resource === 'gh pr merge*'), role).toBe(false);
      expect(rules.some(item => item.resource === 'npm publish*'), role).toBe(false);
    }
  });

  const WORKTREE_SENTENCE = 'Die Regeln aus Main gelten auch im Worktree.';
  const BEHAVIOR_HEADING = '## Kiki baseline behavior (v1)';
  const CONSENT = 'Behavioral rule: Do not circumvent publishing/Deploy-route approval via scripts, wrappers, alternate tools, APIs, or delegation. Request approval for the intended publishing operation. If approval is rejected, do not retry or work around it; report PERMISSION_BLOCKED: <command> and stop.';
  const TOOL_LINES: Record<string, string> = {
    orchestrator: 'Verhaltensregel: Kein Web, kein MCP, kein Code Mode; Delegation nur an die sieben Kiki-Rollen.',
    brainstormer: 'Verhaltensregel: Web-Recherche ist erlaubt; kein MCP, keine Delegation, kein Code Mode.',
    planner: 'Verhaltensregel: Web-Recherche ist erlaubt; kein MCP, keine Delegation, kein Code Mode.',
    implementer: 'Verhaltensregel: Kein Web, kein MCP, keine Delegation, kein Code Mode.',
    guiDesigner: 'Verhaltensregel: Kein Web, kein MCP, keine Delegation, kein Code Mode.',
    reviewer: 'Verhaltensregel: Kein Web, kein MCP, keine Delegation, kein Code Mode.',
    escalation: 'Verhaltensregel: Kein Web, kein MCP, keine Delegation, kein Code Mode.',
    historian: 'Verhaltensregel: Kein Web, kein MCP, keine Delegation, kein Code Mode.',
  };

  it('all_role_behavior_lines', () => {
    const templates = generateAllTemplates(DEFAULT_CONFIG);
    for (const [role, toolLine] of Object.entries(TOOL_LINES)) {
      const prompt = templates[role as keyof typeof templates];
      expect(prompt, role).toContain(WORKTREE_SENTENCE);
      expect(prompt.split(WORKTREE_SENTENCE).length - 1, `${role}: worktree line once`).toBe(1);
      expect(prompt, role).toContain(toolLine);
      expect(prompt.split(toolLine).length - 1, `${role}: tool line once`).toBe(1);
      expect(prompt.split(BEHAVIOR_HEADING).length - 1, `${role}: heading once`).toBe(1);
      expect(prompt, role).toContain(CONSENT);
      expect(prompt.split(CONSENT).length - 1, `${role}: consent once`).toBe(1);
      expect(prompt, role).not.toContain('Do not circumvent publishing-route approval');
      expect(prompt.trimEnd().endsWith(PERMISSION_REQUEST_FRAGMENT.trimEnd()), role).toBe(true);
      expect(prompt.indexOf(BEHAVIOR_HEADING), role)
        .toBeLessThan(prompt.indexOf('## Kiki managed permission requests (v1)'));
    }
    expect(templates.orchestrator).toContain('Delegation nur an die sieben Kiki-Rollen.');
    expect(templates.orchestrator).toContain('Subagents MUST NOT dispatch other subagents; nested delegation is forbidden');
  });

  it('withBaselineBehaviorPrompt is idempotent, CRLF-safe and minimally migrates consent', () => {
    const custom = `---
description: custom
mode: subagent
---
Custom body.

Do not circumvent publishing-route approval via scripts, wrappers, alternate tools, APIs, or delegation. Request approval for the intended publishing operation. If approval is rejected, do not retry or work around it; report PERMISSION_BLOCKED: <command> and stop.
`;
    const once = withBaselineBehaviorPrompt(custom, 'kiki-planner');
    expect(once).toContain('Custom body.');
    expect(once).toContain(WORKTREE_SENTENCE);
    expect(once).toContain(TOOL_LINES.planner);
    expect(once.split(CONSENT).length - 1).toBe(1);
    expect(once).not.toContain('Do not circumvent publishing-route approval');
    expect(withBaselineBehaviorPrompt(once, 'kiki-planner')).toBe(once);

    const crlf = custom.split('\n').join('\r\n');
    const crlfOnce = withBaselineBehaviorPrompt(crlf, 'kiki-reviewer');
    expect(crlfOnce).toContain('\r\n');
    expect(crlfOnce).toContain(WORKTREE_SENTENCE);
    expect(crlfOnce).toContain(TOOL_LINES.reviewer);
    expect(crlfOnce).not.toMatch(/[^\r]\n/);
    expect(withBaselineBehaviorPrompt(crlfOnce, 'kiki-reviewer')).toBe(crlfOnce);
  });

  it('withBaselineBehaviorPrompt adds missing consent and refuses conflicting headings', () => {
    const bare = 'Custom body only.\n';
    const added = withBaselineBehaviorPrompt(bare, 'kiki-historian');
    expect(added).toContain(WORKTREE_SENTENCE);
    expect(added).toContain(CONSENT);
    expect(added.split(CONSENT).length - 1).toBe(1);

    const conflicting = `${bare}\n${BEHAVIOR_HEADING}\n\nDifferent managed content.\n`;
    expect(() => withBaselineBehaviorPrompt(conflicting, 'kiki-historian')).toThrow(/managed|conflict|duplicate/i);
    const duplicate = `${bare}\n${BEHAVIOR_HEADING}\n\n${WORKTREE_SENTENCE}\n\n${TOOL_LINES.historian}\n\n${BEHAVIOR_HEADING}\n`;
    expect(() => withBaselineBehaviorPrompt(duplicate, 'kiki-historian')).toThrow(/managed|conflict|duplicate/i);
  });

  it('preserves configured path substitutions without adding decisions/knowledge grants', () => {
    const config = {
      ...DEFAULT_CONFIG,
      paths: {
        ...DEFAULT_CONFIG.paths,
        source: 'backend/',
        tests: 'spec/',
        superpowers: 'design/',
        docs: 'documentation/',
        readme: 'HISTORY.md',
        changelog: 'ABOUT.md',
        taskRegistry: 'registry/tasks.json',
        decisions: 'documentation/DECISIONS.md',
        knowledge: 'documentation/knowledge/',
      },
    };
    const permissions = generateAgentPermissions(config);
    expect(permissions['kiki-implementer']).toEqual(expectedRole(
      ['backend/**', 'spec/**', '.gitignore', '.superpowers/sdd/**']));
    expect(permissions['kiki-gui-designer']).toEqual(expectedRole(
      ['backend/**', 'spec/**', '.superpowers/sdd/**']));
    expect(permissions['kiki-brainstormer']).toEqual(expectedRole(['design/**']));
    expect(permissions['kiki-planner']).toEqual(expectedRole(['design/**']));
    expect(permissions['kiki-historian']).toEqual(expectedRole(
      ['documentation/**', 'HISTORY*', 'ABOUT*', '.agentic/**']));
    expect(permissions['kiki-orchestrator']).toEqual(expectedRole(
      ['registry/tasks.json', '.superpowers/sdd/**']));
  });
});
