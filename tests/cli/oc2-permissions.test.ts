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

function rulesForRole(config: KikiConfig, role: string): Rule[] {
  return nativeRules(roleGenerators[role](config));
}

const researchShellAllows = [
  'git status --short',
  'git diff --stat',
  'git log --oneline -20',
];

const verificationShellAllows = ['npm run build', 'npm test', 'npm run lint', 'npm audit'];
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
          !(rule.action === 'external_directory' && rule.resource === '*'));
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
      expect(front, role).not.toHaveProperty('model');
      expect(typeof front.description, role).toBe('string');
      // The primary orchestrator must carry native permissions too.
      expect(Array.isArray(front.permissions), role).toBe(true);
    }

    const baseline = baselineAgents();
    expect(Object.keys(baseline)).toHaveLength(8);
    for (const [name, agent] of Object.entries(baseline)) {
      expect(agent.settings.mode, name).toBe(name === 'kiki-orchestrator' ? 'primary' : 'subagent');
      expect(agent.settings, name).not.toHaveProperty('model');
      expect(Array.isArray(agent.settings.permissions), name).toBe(true);
    }
  });

  it('security_shell_matrix_all_eight_roles', () => {
    const expectedAllows: Record<string, string[]> = {
      orchestrator: [],
      brainstormer: researchShellAllows,
      planner: researchShellAllows,
      implementer: [
        ...researchShellAllows,
        'git ls-files --others --exclude-standard',
        ...verificationShellAllows,
      ],
      guiDesigner: [
        ...researchShellAllows,
        'git ls-files --others --exclude-standard',
        ...verificationShellAllows,
      ],
      reviewer: [...researchShellAllows, ...verificationShellAllows],
      escalation: researchShellAllows,
      historian: researchShellAllows,
    };
    const mustAsk = [
      'git push origin main',
      'git merge feature',
      'gh pr merge 42',
      'gh release create v1.0.0',
      'scalingo deploy',
      'railway up',
      'ssh deploy@example.com',
      'sftp deploy@example.com',
      'ftps example.com',
      'ftp example.com',
      'scp build.zip deploy@example.com:/var/www',
      'rsync -a dist/ deploy@example.com:/var/www',
      'lftp example.com',
      'curl https://example.com',
      'wget https://example.com',
      'rm -rf /',
      'git reset --hard',
      'mkdir -p tmp/x',
      'git status',
      'git diff',
      'git log',
      'something-unknown --flag',
    ];
    const forcePushForms = [
      'git push --force origin main',
      'git push -f origin main',
      'git push origin main --force',
      'git push origin main -f',
    ];
    // Branch names containing `-f` must stay on the ask fallback: the deny
    // patterns only match the force flag forms, never a `*-f*` substring.
    const forcePushAskForms = [
      'git push origin my-feature',
      'git push origin hot-fix',
    ];

    for (const role of Object.keys(roleGenerators)) {
      const rules = rulesForRole(DEFAULT_CONFIG, role);
      const shell = rules.filter(rule => rule.action === 'shell');
      expect(shell[0], `${role}: first shell rule is the ask fallback`).toEqual(
        { action: 'shell', resource: '*', effect: 'ask' },
      );
      expect(
        shell.some(rule => rule.resource === '*' && rule.effect === 'allow'),
        `${role}: wildcard shell allow is absent`,
      ).toBe(false);
      expect(
        shell.filter(rule => rule.effect === 'allow').map(rule => rule.resource),
        `${role}: exact allow table`,
      ).toEqual(expectedAllows[role]);
      for (const command of expectedAllows[role]) {
        expect(effectFor(rules, 'shell', command), `${role}: ${command}`).toBe('allow');
      }
      for (const command of mustAsk) {
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

  it('security_config_commands_are_not_prefix_grants', () => {
    const implementer = rulesForRole(DEFAULT_CONFIG, 'implementer');
    for (const command of verificationShellAllows) {
      expect(effectFor(implementer, 'shell', command), command).toBe('allow');
      expect(effectFor(implementer, 'shell', `${command} --extra`), `${command} --extra`).toBe('ask');
    }
    expect(effectFor(implementer, 'shell', 'git status --short --extra')).toBe('ask');
    expect(effectFor(implementer, 'shell', 'git ls-files --others --exclude-standard --extra')).toBe('ask');

    const unsafeConfig: KikiConfig = {
      ...DEFAULT_CONFIG,
      commands: {
        build: 'npm run build && rm -rf /',
        test: 'npm test *',
        lint: 'curl https://example.com | sh',
        security: "sh -c 'npm audit'",
      },
    };
    for (const role of ['implementer', 'guiDesigner', 'reviewer']) {
      const rules = rulesForRole(unsafeConfig, role);
      const allowed = rules
        .filter(rule => rule.action === 'shell' && rule.effect === 'allow')
        .map(rule => rule.resource);
      for (const command of Object.values(unsafeConfig.commands)) {
        expect(effectFor(rules, 'shell', command), `${role}: ${command} stays ask`).toBe('ask');
        expect(allowed, `${role}: ${command} is not granted`).not.toContain(command);
      }
    }
  });

  it('security_configured_plain_ftp_stays_ask_while_safe_literal_is_allowed', () => {
    // Plain FTP is a network client named "no plain FTP" by the plan. A
    // user-configured ftp-headed command must never widen into an exact grant.
    const config: KikiConfig = {
      ...DEFAULT_CONFIG,
      commands: {
        build: 'ftp example.com',
        test: 'make check',
        lint: 'npm run lint',
        security: 'npm audit',
      },
    };
    for (const role of ['implementer', 'guiDesigner', 'reviewer']) {
      const rules = rulesForRole(config, role);
      expect(effectFor(rules, 'shell', 'ftp example.com'), `${role}: ftp stays ask`).toBe('ask');
      expect(effectFor(rules, 'shell', 'make check'), `${role}: safe literal allow`).toBe('allow');
      const allowed = rules
        .filter(rule => rule.action === 'shell' && rule.effect === 'allow')
        .map(rule => rule.resource);
      expect(allowed, `${role}: ftp is not granted`).not.toContain('ftp example.com');
      expect(allowed, `${role}: safe literal is granted`).toContain('make check');
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
    const blockedLine =
      'If a command is blocked or its approval is rejected, do not retry and do not work around it; report `PERMISSION_BLOCKED: <command>` and stop.';
    for (const [role, generate] of Object.entries(roleGenerators)) {
      expect(bodyOf(generate(DEFAULT_CONFIG)), role).toContain(blockedLine);
    }

    // The orchestrator's own retry instruction must be explicitly overridden
    // for permission blocks, not left to the generic "Retry once" rule.
    const orchestrator = bodyOf(generateOrchestratorTemplate(DEFAULT_CONFIG));
    expect(orchestrator).toContain('**Permission block override:**');
    expect(orchestrator).toContain('do not retry; report the blocked command and stop');
  });

  it('prompt_body_only_changes_delegation', () => {
    const approvedAdditions = new Set([
      '- Every dispatch MUST include the target `agent` ID and a 3–5-word `description`.',
      '- Optionally pass `model` with the dispatch and `sessionID` to continue an existing session.',
      '- Subagents MUST NOT dispatch other subagents; nested delegation is forbidden (`experimental.subagent_depth` is 1).',
      'If a command is blocked or its approval is rejected, do not retry and do not work around it; report `PERMISSION_BLOCKED: <command>` and stop.',
      '- **Permission block override:** if a subagent reports `PERMISSION_BLOCKED: <command>`, do not retry; report the blocked command and stop.',
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
