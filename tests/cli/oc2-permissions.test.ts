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
  generateAgentPermissions,
} from '../../src/cli/config';
import { baselineAgents, parseAgent, type PermissionRule } from '../../src/cli/opencode-config';
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

// OpenCode 2 matches action names as whole-value wildcards too (the
// `*_*` generic MCP rule depends on it), so the test helper must not compare
// actions literally. Only this helper is widened; generated rules stay exact.
function effectFor(rules: Rule[], action: string, resource: string): Effect | undefined {
  let effect: Effect | undefined;
  for (const rule of rules) {
    if (!globToRegExp(rule.action).test(action)) continue;
    if (globToRegExp(rule.resource).test(resource)) effect = rule.effect;
  }
  return effect;
}

const roleToAgent: Record<string, string> = {
  orchestrator: 'kiki-orchestrator',
  brainstormer: 'kiki-brainstormer',
  planner: 'kiki-planner',
  implementer: 'kiki-implementer',
  guiDesigner: 'kiki-gui-designer',
  reviewer: 'kiki-reviewer',
  escalation: 'kiki-escalation',
  historian: 'kiki-historian',
};

function rulesForRole(config: KikiConfig, role: string): Rule[] {
  return generateAgentPermissions(config)[roleToAgent[role]];
}

const publishAskPatterns = [
  'git push*',
  'gh pr merge*',
  'gh release*',
  'gh workflow run*',
  'scalingo *deploy*',
  'railway up*',
  'railway deploy*',
  'ssh*',
  'sftp*',
  'scp*',
  'rsync*',
  'lftp*',
  'ftp*',
  'curl*',
  'wget*',
  'npm publish*',
  'yarn publish*',
  'pnpm publish*',
];

const noCircumventionLine =
  'Do not circumvent publishing-route approval via scripts, wrappers, alternate tools, APIs, or delegation. Request approval for the intended publishing operation. If approval is rejected, do not retry or work around it; report PERMISSION_BLOCKED: <command> and stop.';

const researchRoles = new Set(['brainstormer', 'planner']);
// Roles whose pre-existing narrow external-directory grants are retained after
// the generic `*_*` deny (implementer's builder also serves guiDesigner). Every
// other role gets `external_directory` denied by that generic rule.
const externalDirectoryRoles = new Set(['implementer', 'guiDesigner', 'reviewer', 'escalation']);
const kikiSubagents = [
  'kiki-brainstormer',
  'kiki-planner',
  'kiki-implementer',
  'kiki-gui-designer',
  'kiki-reviewer',
  'kiki-escalation',
  'kiki-historian',
];

// Route actions are new policy, not legacy V1 scopes. The legacy translator
// has no concept of execute/MCP/web/skill/subagent rules.
// Global secret edit denials are a new policy addition, not legacy V1
// behavior; config-secret-edit.test.ts verifies them directly.
const secretEditPatterns = new Set([
  '.env*',
  '**/.env*',
  '**/*secret*',
  '**/*credential*',
  '**/*.pem',
  '**/*.key',
  '**/id_rsa*',
]);

const READ_ONLY_SPECIALISTS = [
  'kiki-brainstormer',
  'kiki-planner',
  'kiki-implementer',
  'kiki-gui-designer',
  'kiki-reviewer',
  'kiki-escalation',
  'kiki-historian',
];

const routeOnlyActions = new Set([
  'execute',
  'opencode_list_mcp_resources',
  'opencode_read_mcp_resource',
  'webfetch',
  'websearch',
  'skill',
  'subagent',
]);

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
        // Task 2 intentionally narrows shell policy; only the unchanged
        // non-shell scopes are compared with the legacy V1 maps here.
        // Task 3's generic `*_*` action deny is route-only policy: it does not
        // participate when replaying the legacy rule matrix. Narrower
        // external-directory grants still do, so they remain verified.
        const legacyActual = actual.filter(rule =>
          !rule.action.includes('*') &&
          !(rule.action === 'external_directory' && rule.resource === '*') &&
          !(rule.action === 'edit' && secretEditPatterns.has(rule.resource)));
        const actions = [...new Set([...legacyActual, ...expected].map(rule => rule.action))]
          .filter(action => action !== 'shell' && !routeOnlyActions.has(action));
        const oldPatterns = Object.entries(oldPermissionBlock(variant.builders[builderForRole[role]]))
          .filter(([action]) => action !== 'bash')
          .flatMap(([, value]) => typeof value === 'object' && value ? Object.keys(value) : []);
        const probes = [...new Set([...probeResources, ...oldPatterns])];
        for (const action of actions) {
          for (const resource of probes) {
            expect(effectFor(legacyActual, action, resource), `${role} ${action} ${resource}`)
              .toBe(effectFor(expected, action, resource));
          }
        }
        // Every original non-shell resource pattern survives at least once.
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
      expect(front, role).not.toHaveProperty('permissions');
      expect(front, role).not.toHaveProperty('model');
      expect(typeof front.description, role).toBe('string');
    }

    const baseline = baselineAgents();
    expect(Object.keys(baseline)).toHaveLength(8);
    for (const [name, agent] of Object.entries(baseline)) {
      expect(agent.settings.mode, name).toBe(name === 'kiki-orchestrator' ? 'primary' : 'subagent');
      expect(agent.settings, name).not.toHaveProperty('model');
      // Internal consumers keep the canonical array even though markdown is
      // prompt-only.
      expect(Array.isArray(agent.settings.permissions), name).toBe(true);
    }
  });

  it('canonical_rules_without_markdown_permissions', () => {
    const permissions = generateAgentPermissions();
    for (const [role, generate] of Object.entries(roleGenerators)) {
      const settings = parseAgent(generate(DEFAULT_CONFIG), role).settings;
      expect(settings, role).not.toHaveProperty('permissions');
      expect(settings, role).not.toHaveProperty('permission');
    }
    const baseline = baselineAgents();
    expect(permissions['kiki-planner']).toEqual(baseline['kiki-planner'].settings.permissions);
    expect(permissions['kiki-implementer']).toEqual(
      baseline['kiki-implementer'].settings.permissions,
    );
    for (const name of READ_ONLY_SPECIALISTS) {
      expect(
        permissions[name].filter(rule => rule.action === 'shell' && rule.effect === 'allow'
          && rule.resource.startsWith('git ')).map(rule => rule.resource),
        name,
      ).toEqual(['git status *', 'git rev-parse *', 'git worktree list *']);
    }
    expect(
      permissions['kiki-orchestrator'].filter(rule => rule.action === 'shell' && rule.effect === 'allow'
        && rule.resource.startsWith('git ')),
    ).toEqual([]);
    for (const name of Object.keys(permissions)) {
      expect(permissions[name].slice(-7), name).toEqual(
        [...secretEditPatterns].map(resource => ({ action: 'edit', resource, effect: 'deny' })),
      );
    }
  });

  it('security_shell_matrix_all_eight_roles', () => {
    const routineCommands = [
      'git status',
      'git diff',
      'git log',
      'mkdir -p tmp/x',
      'npm run build',
      'npm test',
      'node script.js',
      'printf hello',
      'rm -rf /',
      'git reset --hard',
      'something-unknown --flag',
      // Read-only provider inspection is routine local work, not a publishing
      // route, so it must not be caught by a blanket CLI ask.
      'gh pr view 42',
      'gh pr list',
      'gh issue list',
      'gh repo view',
      'gh workflow list',
      'scalingo status',
      'scalingo logs --app myapp',
      'railway status',
      'railway logs',
    ];
    const publishCommands = [
      'git push origin main',
      'gh pr merge 42',
      'gh release create v1.0.0',
      'gh workflow run ci',
      'scalingo deploy',
      'scalingo --app myapp deploy',
      'railway up',
      'railway deploy',
      'ssh deploy@example.com',
      'sftp deploy@example.com',
      'ftps example.com',
      'ftp example.com',
      'scp build.zip deploy@example.com:/var/www',
      'rsync -a dist/ deploy@example.com:/var/www',
      'lftp example.com',
      'curl https://example.com',
      'wget https://example.com',
      'npm publish',
      'yarn publish',
      'pnpm publish',
    ];
    const forcePushForms = [
      'git push --force origin main',
      'git push -f origin main',
      'git push origin main --force',
      'git push origin main -f',
    ];
    // Branch names containing `-f` must stay on the publishing ask: the deny
    // patterns only match the force flag forms, never a `*-f*` substring.
    const forcePushAskForms = [
      'git push origin my-feature',
      'git push origin hot-fix',
    ];
    const shellAllowAll: Rule = { action: 'shell', resource: '*', effect: 'allow' };
    const forcePushDenies: Rule[] = [
      'git push --force*',
      'git push -f*',
      'git push *--force*',
      'git push * -f',
      'git push * --force',
    ].map(resource => ({ action: 'shell', resource, effect: 'deny' }));

    for (const role of Object.keys(roleGenerators)) {
      const rules = rulesForRole(DEFAULT_CONFIG, role);
      const shell = rules.filter(rule => rule.action === 'shell');
      expect(shell[0], `${role}: routine local work runs without a prompt`).toEqual(shellAllowAll);
      expect(
        shell.filter(rule => rule.effect === 'ask').map(rule => rule.resource),
        `${role}: publishing ask table`,
      ).toEqual(publishAskPatterns);
      expect(
        shell.slice(-forcePushDenies.length),
        `${role}: force-push denies stay last`,
      ).toEqual(forcePushDenies);
      for (const command of routineCommands) {
        expect(effectFor(rules, 'shell', command), `${role}: ${command}`).toBe('allow');
      }
      for (const command of publishCommands) {
        expect(effectFor(rules, 'shell', command), `${role}: ${command}`).toBe('ask');
      }
      for (const command of forcePushForms) {
        expect(effectFor(rules, 'shell', command), `${role}: ${command}`).toBe('deny');
      }
      for (const command of forcePushAskForms) {
        expect(effectFor(rules, 'shell', command), `${role}: ${command}`).toBe('ask');
      }
    }
  });

  it('security_publish_asks_override_configured_commands', () => {
    // A project that names a publishing route as its build/test command must
    // still be asked: the ask rules follow the allow baseline.
    const config: KikiConfig = {
      ...DEFAULT_CONFIG,
      commands: {
        build: 'ftp example.com',
        test: 'npm publish',
        lint: 'make check',
        security: 'npm audit',
      },
    };
    for (const role of ['implementer', 'guiDesigner', 'reviewer']) {
      const rules = rulesForRole(config, role);
      expect(effectFor(rules, 'shell', 'ftp example.com'), `${role}: configured ftp stays ask`).toBe('ask');
      expect(effectFor(rules, 'shell', 'npm publish'), `${role}: configured publish stays ask`).toBe('ask');
      expect(effectFor(rules, 'shell', 'make check'), `${role}: routine configured command runs`).toBe('allow');
      expect(effectFor(rules, 'shell', 'npm audit'), `${role}: verification command runs`).toBe('allow');
    }
  });

  it('route_action_wildcards_match_underscore_actions_only', () => {
    // Proves the helper widened for the `*_*` rule is not tautological: it
    // matches underscore-bearing MCP-style actions and rejects plain actions.
    const rules: Rule[] = [{ action: '*_*', resource: '*', effect: 'deny' }];
    expect(effectFor(rules, 'probe_echo', '*')).toBe('deny');
    expect(effectFor(rules, 'filesystem_read_file', '*')).toBe('deny');
    expect(effectFor(rules, 'external_directory', '/tmp/x')).toBe('deny');
    expect(effectFor(rules, 'execute', '*')).toBeUndefined();
    expect(effectFor(rules, 'webfetch', '*')).toBeUndefined();
    expect(effectFor(rules, 'skill', 'probe-skill')).toBeUndefined();
  });

  it('security_alternate_routes_all_eight_roles', () => {
    for (const role of Object.keys(roleGenerators)) {
      const rules = rulesForRole(DEFAULT_CONFIG, role);
      const genericDeny = rules.findIndex(
        rule => rule.action === '*_*' && rule.resource === '*' && rule.effect === 'deny',
      );
      expect(genericDeny, `${role}: generic MCP wildcard deny`).toBeGreaterThan(-1);
      expect(
        rules.some(rule => rule.action === '*' && rule.effect === 'deny'),
        `${role}: no blanket action deny`,
      ).toBe(false);
      if (externalDirectoryRoles.has(role)) {
        const lastExternalAllow = rules.reduce(
          (index, rule, current) =>
            rule.action === 'external_directory' && rule.effect === 'allow' ? current : index,
          -1,
        );
        // Each role's narrow grants must follow the generic deny so the later
        // allow wins (last matching rule wins), without any blanket grant.
        expect(lastExternalAllow, `${role}: narrow external-directory allow follows generic deny`)
          .toBeGreaterThan(genericDeny);
      } else {
        expect(
          rules.some(rule => rule.action === 'external_directory'),
          `${role}: no external-directory grant`,
        ).toBe(false);
      }

      expect(effectFor(rules, 'execute', '*'), `${role}: execute action`).toBe('deny');
      expect(
        effectFor(rules, 'opencode_list_mcp_resources', 'probe-server'),
        `${role}: list MCP resources`,
      ).toBe('deny');
      expect(
        effectFor(rules, 'opencode_read_mcp_resource', 'probe-server:file:///a'),
        `${role}: read MCP resource`,
      ).toBe('deny');

      const research = researchRoles.has(role);
      expect(effectFor(rules, 'webfetch', 'https://example.com'), `${role}: webfetch`).toBe(
        research ? 'allow' : 'deny',
      );
      expect(effectFor(rules, 'websearch', 'probe query'), `${role}: websearch`).toBe(
        research ? 'allow' : 'deny',
      );
      expect(effectFor(rules, 'skill', 'probe-skill'), `${role}: skill`).toBe('allow');

      if (role === 'orchestrator') {
        for (const agent of kikiSubagents) {
          expect(effectFor(rules, 'subagent', agent), `${role}: ${agent}`).toBe('allow');
        }
        expect(effectFor(rules, 'subagent', 'unknown-agent'), `${role}: unknown agent`).toBe('deny');
        expect(effectFor(rules, 'subagent', 'kiki-orchestrator'), `${role}: self dispatch`).toBe('deny');
      } else {
        for (const agent of kikiSubagents) {
          expect(effectFor(rules, 'subagent', agent), `${role}: ${agent}`).toBe('deny');
        }
        expect(effectFor(rules, 'subagent', 'unknown-agent'), `${role}: unknown agent`).toBe('deny');
      }

      // Every MCP server tool action is `<server>_<tool>`, so the generic
      // `*_*` deny closes arbitrary servers without a blanket `*` rule.
      expect(effectFor(rules, 'probe_echo', '*'), `${role}: MCP server tool action`).toBe('deny');
      expect(effectFor(rules, 'unknown_server_tool', '*'), `${role}: arbitrary MCP action`).toBe('deny');

      // `external_directory` also contains an underscore, so the generic `*_*`
      // deny closes it. Only the four roles with pre-existing narrow grants
      // reopen /tmp; everywhere else the generic deny stays in force.
      expect(
        effectFor(rules, 'external_directory', 'outside/a.ts'),
        `${role}: external-directory outside the narrow grants is denied`,
      ).toBe('deny');
      for (const resource of ['/tmp/kiki/a', 'tmp/kiki/a']) {
        expect(
          effectFor(rules, 'external_directory', resource),
          `${role}: ${resource}`,
        ).toBe(externalDirectoryRoles.has(role) ? 'allow' : 'deny');
      }
    }
  });

  it('security_sdd_workspace_edit_grant_is_permanent_for_implementer_and_orchestrator', () => {
    const sddGrant: Rule = { action: 'edit', resource: '.superpowers/sdd/**', effect: 'allow' };
    const grantedRoles = ['implementer', 'guiDesigner', 'orchestrator'];
    const ledgerPath = '.superpowers/sdd/2026-11-12-security-boundaries-plan/progress.md';
    const briefPath = '.superpowers/sdd/2026-11-12-security-boundaries-plan/task-5-brief.md';

    for (const role of grantedRoles) {
      const rules = rulesForRole(DEFAULT_CONFIG, role);
      expect(effectFor(rules, 'edit', ledgerPath), `${role}: ledger`).toBe('allow');
      expect(effectFor(rules, 'edit', briefPath), `${role}: brief`).toBe('allow');
      expect(rules, `${role}: explicit permanent grant`).toContainEqual(sddGrant);
    }

    // Permanent means it is generated by the role builders, not a one-off
    // migrated grant: Task 5's `baselineAgents()` owner must carry it.
    const baseline = baselineAgents(DEFAULT_CONFIG);
    for (const name of ['kiki-implementer', 'kiki-gui-designer', 'kiki-orchestrator']) {
      expect(
        baseline[name].settings.permissions as Rule[],
        `${name}: generated baseline grant`,
      ).toContainEqual(sddGrant);
    }

    // Narrow: the SDD workspace is not granted to any other role.
    for (const role of ['brainstormer', 'planner', 'reviewer', 'escalation', 'historian']) {
      const rules = rulesForRole(DEFAULT_CONFIG, role);
      expect(effectFor(rules, 'edit', ledgerPath), `${role}: denied`).toBe('deny');
      expect(rules, `${role}: no grant`).not.toContainEqual(sddGrant);
    }
  });

  it('security_blocked_prompt_all_roles', () => {
    for (const [role, generate] of Object.entries(roleGenerators)) {
      const body = bodyOf(generate(DEFAULT_CONFIG));
      expect(body, role).toContain(noCircumventionLine);
      expect(body.split(noCircumventionLine).length - 1, `${role}: instruction appears once`).toBe(1);
    }

    // The orchestrator's own retry instruction must be explicitly overridden
    // for permission blocks, not left to the generic "Retry once" rule.
    const orchestrator = bodyOf(generateOrchestratorTemplate(DEFAULT_CONFIG));
    expect(orchestrator).toContain('**Permission block override:**');
    expect(orchestrator).toContain('do not retry; report the blocked command and stop');
  });

  it('prompt_bodies_preserve_native_delegation_contract', () => {
    const skillLoadingRoles: Record<string, string[]> = {
      brainstormer: ['`brainstorming` superpowers skill', 'follow it **inline**'],
      planner: ['`writing-plans` superpowers skill', 'follow it **inline**'],
      implementer: [
        '`executing-plans`',
        '`test-driven-development`',
        '`systematic-debugging`',
        'follow them **inline**',
      ],
      guiDesigner: [
        '`ui-ux-pro-max`',
        '`executing-plans`',
        '`test-driven-development`',
        '`systematic-debugging`',
        'Follow all four exactly',
      ],
      reviewer: [
        '`receiving-code-review`',
        '`requesting-code-review`',
        'follow it **inline**',
      ],
      escalation: ['`systematic-debugging` superpowers skill', 'follow it **inline**'],
    };

    for (const [label, config] of [
      ['default', DEFAULT_CONFIG],
      ['custom', fixture.customConfig],
    ] as const) {
      const orchestrator = bodyOf(generateOrchestratorTemplate(config));
      expect(orchestrator, label).toContain('`subagent` tool');
      expect(orchestrator, label).toContain(
        'Every dispatch MUST include the target `agent` ID and a 3–5-word `description`.',
      );
      expect(orchestrator, label).toContain(
        'Optionally pass `model` with the dispatch and `sessionID` to continue an existing session.',
      );
      expect(orchestrator, label).toContain(
        'Subagents MUST NOT dispatch other subagents; nested delegation is forbidden',
      );
      expect(orchestrator, label).toContain('**Permission block override:**');
      expect(orchestrator, label).not.toContain('`task` tool');
      expect(orchestrator, label).not.toContain('subagent_type');

      for (const [role, expectedFragments] of Object.entries(skillLoadingRoles)) {
        const body = bodyOf(roleGenerators[role](config));
        for (const fragment of expectedFragments) {
          expect(body, `${label} ${role}: ${fragment}`).toContain(fragment);
        }
      }

      for (const [role, generate] of Object.entries(roleGenerators)) {
        const body = bodyOf(generate(config));
        expect(body, `${label} ${role}: no legacy task tool`).not.toContain('`task` tool');
        expect(body, `${label} ${role}: no legacy subagent_type`).not.toContain('subagent_type');
      }
    }
  });

  it('workflow_uses_v2_delegation_and_config_keys', () => {
    const workflow = generateWorkflowTemplate(DEFAULT_CONFIG);
    expect(workflow).toContain('`subagent` tool');
    expect(workflow).not.toContain('`task` tool');
    expect(workflow).toContain('agents.<id>.model');
    expect(workflow).toContain('"agents"');
    expect(workflow).not.toContain('"agent": {');
  });

  it('project_rules_keep_only_validated_additions_and_protect_secrets', () => {
    const inherited: Rule[] = [
      { action: 'edit', resource: '*', effect: 'deny' },
      { action: 'edit', resource: 'src/**', effect: 'deny' },
      { action: 'read', resource: 'protected/**', effect: 'deny' },
      { action: 'read', resource: 'maybe/**', effect: 'ask' },
    ];
    const local: Rule[] = [
      ...inherited,
      { action: 'edit', resource: 'backend/**', effect: 'allow' },
      { action: 'edit', resource: 'scripts/**', effect: 'allow' },
      { action: 'read', resource: 'docs/**', effect: 'allow' },
    ];
    const result = projectPermissionRules(local, inherited);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rules = result.rules;

    expect(effectFor(rules, 'edit', 'backend/a.ts')).toBe('allow');
    expect(effectFor(rules, 'edit', 'scripts/foo.sh')).toBe('allow');
    expect(effectFor(rules, 'read', 'docs/guide.md')).toBe('allow');
    // The broad fallback and generated copies are never replayed.
    expect(rules.some(rule => rule.action === 'edit' && rule.resource === '*')).toBe(false);
    expect(rules.some(rule => rule.action === 'read' && rule.resource === 'protected/**')).toBe(false);
    expect(rules.some(rule => rule.action === 'read' && rule.resource === 'maybe/**')).toBe(false);
    // Secret descendants stay denied after the addition.
    expect(effectFor(rules, 'edit', 'scripts/.env')).toBe('deny');
    expect(effectFor(rules, 'edit', 'backend/key.pem')).toBe('deny');
    expect(effectFor(rules, 'edit', 'backend/credentials.json')).toBe('deny');

    // Role-boundary crossings, wildcard/action and non-allow forms fail closed.
    const crossing = projectPermissionRules(
      [{ action: 'edit', resource: 'src/special.ts', effect: 'allow' }], inherited);
    expect(crossing.ok).toBe(false);
    const wildcard = projectPermissionRules(
      [{ action: 'edit', resource: 'foo/*', effect: 'allow' }], inherited);
    expect(wildcard.ok).toBe(false);
    const shell = projectPermissionRules(
      [{ action: 'shell', resource: 'git push*', effect: 'allow' }], inherited);
    expect(shell.ok).toBe(false);
    const deny = projectPermissionRules(
      [{ action: 'edit', resource: 'vendor/**', effect: 'deny' }], inherited);
    expect(deny.ok).toBe(false);
    const traversal = projectPermissionRules(
      [{ action: 'edit', resource: '../outside/**', effect: 'allow' }], inherited);
    expect(traversal.ok).toBe(false);
  });
});
