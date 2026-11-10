import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import {
  DEFAULT_CONFIG,
  KikiConfig,
  generateOrchestratorTemplate,
  generateBrainstormerTemplate,
  generatePlannerTemplate,
  generateImplementerTemplate,
  generateGuiDesignerTemplate,
  generateReviewerTemplate,
  generateEscalationTemplate,
  generateHistorianTemplate,
  generateWorkflowTemplate,
} from '../../src/cli/config';
import { baselineAgents, type PermissionRule } from '../../src/cli/opencode-config';
import {
  translatePermissions,
  projectPermissionRules,
} from '../../src/cli/oc2-permissions';

type Effect = PermissionRule['effect'];
type Rule = PermissionRule;

interface Fixture {
  broadRead: string;
  permissionBuilders: Record<string, string>;
  templates: Record<string, string>;
  promptBodies: Record<string, string>;
  customConfig: KikiConfig;
  customPermissionBuilders: Record<string, string>;
  customTemplates: Record<string, string>;
  customPromptBodies: Record<string, string>;
}

const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/oc1-permission-templates.json', import.meta.url), 'utf8'),
) as Fixture;

function frontmatter(template: string): Record<string, unknown> {
  const match = template.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error('missing frontmatter');
  return parseYaml(match[1], { uniqueKeys: false }) as Record<string, unknown>;
}

function bodyOf(template: string): string {
  const match = template.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) throw new Error('missing frontmatter');
  return match[2];
}

function nativeRules(template: string): Rule[] {
  const data = frontmatter(template);
  if (data.permissions === undefined) return [];
  expect(Array.isArray(data.permissions)).toBe(true);
  return data.permissions as Rule[];
}

function oldPermissionBlock(block: string): Record<string, unknown> {
  const parsed = parseYaml(block, { uniqueKeys: false }) as { permission: Record<string, unknown> };
  return parsed.permission;
}

function translatedOld(block: string): Rule[] {
  const result = translatePermissions(oldPermissionBlock(block));
  expect(result.ok, result.ok ? '' : result.reason).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.rules;
}

const roleGenerators: Record<string, (config: KikiConfig) => string> = {
  orchestrator: generateOrchestratorTemplate,
  brainstormer: generateBrainstormerTemplate,
  planner: generatePlannerTemplate,
  implementer: generateImplementerTemplate,
  guiDesigner: generateGuiDesignerTemplate,
  reviewer: generateReviewerTemplate,
  escalation: generateEscalationTemplate,
  historian: generateHistorianTemplate,
};

const builderForRole: Record<string, string> = {
  brainstormer: 'brainstormer',
  planner: 'brainstormer',
  implementer: 'implementer',
  guiDesigner: 'implementer',
  reviewer: 'reviewer',
  escalation: 'escalation',
  historian: 'historian',
};

const probeResources = [
  'src/index.ts', 'src/.env', 'tests/a.test.ts', 'docs/guide.md',
  'docs/superpowers/specs/a.md', 'docs/superpowers/plans/a.md',
  '.worktree/wt/src/a.ts', '.worktree/wt/tests/a.ts',
  '.worktree/wt/docs/superpowers/specs/a.md', '.worktree/wt/docs/guide.md',
  '.agentic/reviews/r.md', '.opencode/docs/reviews/r.md',
  '.worktree/wt/.agentic/reviews/r.md', '.worktree/wt/.opencode/docs/reviews/r.md',
  '.agentic/kiki/TASK_REGISTRY.json', 'README.md', 'CHANGELOG.md',
  'documentation/guide.md', 'documentation/superpowers/specs/a.md', 'knowledge/a.md',
  'backend/a.ts', 'spec/a.test.ts', 'HISTORY.md', 'ABOUT.md',
  '.env', '.env.local', 'config/.env', 'secret.txt', 'credentials.json',
  'key.pem', 'id_rsa', 'id_rsa.pub', 'src/secret.ts',
  '/tmp/kiki/a', 'tmp/kiki/a', 'outside/a.ts',
  'git diff --stat', 'git log --oneline', 'mkdir -p x', 'rm -rf /', 'npm test',
];

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

function effectFor(rules: Rule[], action: string, resource: string): Effect | undefined {
  let effect: Effect | undefined;
  for (const rule of rules) {
    if (rule.action !== action) continue;
    if (globToRegExp(rule.resource).test(resource)) effect = rule.effect;
  }
  return effect;
}

function rulesForRole(config: KikiConfig, role: string): Rule[] {
  return nativeRules(roleGenerators[role](config));
}

function translatedForRole(config: KikiConfig, builders: Record<string, string>, role: string): Rule[] {
  return translatedOld(builders[builderForRole[role]]);
}

describe('ordered native permission translation', () => {
  it('translates scalar and map values in entry order, preserving effects', () => {
    expect(translatePermissions({ bash: 'allow' })).toEqual({
      ok: true,
      rules: [{ action: 'shell', resource: '*', effect: 'allow' }],
    });
    expect(translatePermissions({
      read: { '*': 'allow', '**/.env*': 'deny' },
      edit: 'deny',
    })).toEqual({
      ok: true,
      rules: [
        { action: 'read', resource: '*', effect: 'allow' },
        { action: 'read', resource: '**/.env*', effect: 'deny' },
        { action: 'edit', resource: '*', effect: 'deny' },
      ],
    });
    expect(translatePermissions(undefined)).toEqual({ ok: true, rules: [] });
  });

  it('maps V1 action aliases to native actions', () => {
    expect(translatePermissions({ write: { 'src/**': 'allow' } })).toEqual({
      ok: true, rules: [{ action: 'edit', resource: 'src/**', effect: 'allow' }],
    });
    expect(translatePermissions({ patch: 'deny' })).toEqual({
      ok: true, rules: [{ action: 'edit', resource: '*', effect: 'deny' }],
    });
    expect(translatePermissions({ apply_patch: { 'x/**': 'ask' } })).toEqual({
      ok: true, rules: [{ action: 'edit', resource: 'x/**', effect: 'ask' }],
    });
    expect(translatePermissions({ task: { 'kiki-reviewer': 'allow' } })).toEqual({
      ok: true, rules: [{ action: 'subagent', resource: 'kiki-reviewer', effect: 'allow' }],
    });
    expect(translatePermissions({ bash: { 'git diff*': 'allow' } })).toEqual({
      ok: true, rules: [{ action: 'shell', resource: 'git diff*', effect: 'allow' }],
    });
  });

  it('passes explicitly verified V1 tool actions through unchanged', () => {
    const input = {
      read: 'ask', edit: 'allow', webfetch: 'deny',
      external_directory: { '/tmp/**': 'allow' },
      glob: 'allow', grep: 'deny', list: 'ask', todowrite: 'allow',
      question: 'ask', websearch: 'deny', lsp: 'ask', doom_loop: 'deny', skill: 'allow',
    };
    const result = translatePermissions(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rules.map(rule => rule.action)).toEqual([
      'read', 'edit', 'webfetch', 'external_directory', 'glob', 'grep',
      'list', 'todowrite', 'question', 'websearch', 'lsp', 'doom_loop', 'skill',
    ]);
  });

  it('fails closed for unknown actions and malformed values without echoing values', () => {
    for (const input of [
      { imaginary: 'allow' },
      { read: 'sometimes' },
      { read: [] },
      { read: { '': 'allow' } },
      { read: { '*': 1 } },
      JSON.parse('{"__proto__":{"x":"allow"}}'),
      null,
    ]) {
      const result = translatePermissions(input);
      expect(result.ok, JSON.stringify(input)).toBe(false);
      if (!result.ok) {
        expect(result.reason.length).toBeGreaterThan(0);
        expect(result.reason).not.toContain('sometimes');
      }
    }
  });

  it('fails when aliases collapse to one native action with conflicting effects', () => {
    const conflict = translatePermissions({
      edit: { 'src/**': 'deny' },
      write: { 'src/**': 'allow' },
    });
    expect(conflict.ok).toBe(false);

    const wildcardConflict = translatePermissions({
      edit: 'allow',
      write: { 'src/**': 'deny' },
    });
    expect(wildcardConflict.ok).toBe(false);

    const equivalent = translatePermissions({ write: 'allow', edit: 'allow' });
    expect(equivalent.ok).toBe(true);
    if (equivalent.ok) {
      expect(equivalent.rules).toEqual([{ action: 'edit', resource: '*', effect: 'allow' }]);
    }
  });

  it('template_rule_matrix_preserves_effective_policy', () => {
    const variants: { config: KikiConfig; builders: Record<string, string> }[] = [
      { config: DEFAULT_CONFIG, builders: fixture.permissionBuilders },
      { config: fixture.customConfig, builders: fixture.customPermissionBuilders },
    ];
    for (const variant of variants) {
      for (const role of Object.keys(builderForRole)) {
        const actual = rulesForRole(variant.config, role);
        const expected = translatedForRole(variant.config, variant.builders, role);
        const actions = [...new Set([...actual, ...expected].map(rule => rule.action))];
        const oldPatterns = Object.values(oldPermissionBlock(variant.builders[builderForRole[role]]))
          .flatMap(value => typeof value === 'object' && value ? Object.keys(value) : []);
        const probes = [...new Set([...probeResources, ...oldPatterns])];
        for (const action of actions) {
          for (const resource of probes) {
            expect(effectFor(actual, action, resource), `${role} ${action} ${resource}`)
              .toBe(effectFor(expected, action, resource));
          }
        }
        // Every original resource pattern survives at least once in the native array.
        for (const pattern of oldPatterns) {
          expect(actual.some(rule => rule.resource === pattern), `${role} ${pattern}`).toBe(true);
        }
      }
    }
  });

  it('native_agent_modes', () => {
    for (const [role, generate] of Object.entries(roleGenerators)) {
      const front = frontmatter(generate(DEFAULT_CONFIG));
      expect(front.mode, role).toBe(role === 'orchestrator' ? 'primary' : 'subagent');
      expect(front, role).not.toHaveProperty('permission');
      expect(front, role).not.toHaveProperty('model');
      expect(typeof front.description, role).toBe('string');
      if (role === 'orchestrator') {
        expect(front, role).not.toHaveProperty('permissions');
      } else {
        expect(Array.isArray(front.permissions), role).toBe(true);
      }
    }

    const baseline = baselineAgents();
    expect(Object.keys(baseline)).toHaveLength(8);
    for (const [name, agent] of Object.entries(baseline)) {
      expect(agent.settings.mode, name).toBe(name === 'kiki-orchestrator' ? 'primary' : 'subagent');
      expect(agent.settings, name).not.toHaveProperty('model');
      if (name === 'kiki-orchestrator') {
        expect(agent.settings, name).not.toHaveProperty('permissions');
      } else {
        expect(Array.isArray(agent.settings.permissions), name).toBe(true);
      }
    }
  });

  it('prompt_body_only_changes_delegation', () => {
    const approvedAdditions = new Set([
      '- Every dispatch MUST include the target `agent` ID and a 3–5-word `description`.',
      '- Optionally pass `model` with the dispatch and `sessionID` to continue an existing session.',
      '- Subagents MUST NOT dispatch other subagents; nested delegation is forbidden (`experimental.subagent_depth` is 1).',
    ]);
    const canonical = (value: string) => value
      .replace(/`task`/g, '`DELEGATE`')
      .replace(/`subagent`/g, '`DELEGATE`')
      .replace(/subagent_type/g, 'agent');
    const withoutApprovedAdditions = (value: string) => value
      .split('\n')
      .filter(line => !approvedAdditions.has(line.trim()))
      .join('\n');

    for (const [config, templates, bodies] of [
      [DEFAULT_CONFIG, fixture.templates, fixture.promptBodies],
      [fixture.customConfig, fixture.customTemplates, fixture.customPromptBodies],
    ] as const) {
      for (const [role, generate] of Object.entries(roleGenerators)) {
        const actual = bodyOf(generate(config));
        expect(canonical(withoutApprovedAdditions(actual)), role)
          .toBe(canonical(bodies[role]));
      }
    }

    const orchestrator = bodyOf(generateOrchestratorTemplate(DEFAULT_CONFIG));
    for (const line of approvedAdditions) expect(orchestrator).toContain(line);
    expect(orchestrator).toContain('`subagent` tool');
    expect(orchestrator).not.toContain('`task` tool');
  });

  it('workflow_uses_v2_delegation_and_config_keys', () => {
    const workflow = generateWorkflowTemplate(DEFAULT_CONFIG);
    expect(workflow).toContain('`subagent` tool');
    expect(workflow).not.toContain('`task` tool');
    expect(workflow).toContain('agents.<id>.model');
    expect(workflow).toContain('"agents"');
    expect(workflow).not.toContain('"agent": {');
  });

  it('project_rules_do_not_restore_inherited_grants', () => {
    const inherited = translatedOld(fixture.permissionBuilders.implementer);
    inherited.push(
      { action: 'edit', resource: 'outside/**', effect: 'allow' },
      { action: 'read', resource: 'protected/**', effect: 'deny' },
      { action: 'read', resource: 'maybe/**', effect: 'ask' },
      { action: 'edit', resource: 'backend/locked.ts', effect: 'deny' },
      // Same resource as a local allow: the inherited deny/ask must survive.
      { action: 'edit', resource: '/tmp/**', effect: 'ask' },
      { action: 'edit', resource: 'tmp/**', effect: 'deny' },
    );
    const local = translatedOld(fixture.customPermissionBuilders.implementer);
    const project = projectPermissionRules(local, inherited);

    expect(effectFor(project, 'edit', 'outside/foo.ts')).toBe('deny');
    expect(effectFor(project, 'read', 'protected/secret.txt')).toBe('deny');
    expect(effectFor(project, 'read', 'maybe/x')).toBe('ask');
    expect(effectFor(project, 'edit', 'backend/locked.ts')).toBe('deny');
    expect(effectFor(project, 'edit', '/tmp/kiki/a')).toBe('ask');
    expect(effectFor(project, 'edit', 'tmp/kiki/a')).toBe('deny');
    expect(effectFor(project, 'edit', 'backend/a.ts')).toBe('allow');
    expect(effectFor(project, 'edit', 'src/a.ts')).toBe('deny');
    expect(effectFor(project, 'edit', 'spec/a.test.ts')).toBe('allow');
    expect(project.some(rule =>
      rule.action === 'edit' && rule.resource === 'outside/**' && rule.effect === 'allow')).toBe(false);
  });
});
