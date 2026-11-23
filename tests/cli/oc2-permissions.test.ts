import { describe, it, expect } from 'vitest';
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
  projectPermissionRules,
} from '../../src/cli/oc2-permissions';

type Effect = PermissionRule['effect'];
type Rule = PermissionRule;

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

const customConfig: KikiConfig = {
  projectName: 'custom-project',
  language: 'typescript',
  commands: {
    build: 'npm run build',
    test: 'npm test',
    lint: 'npm run lint',
    security: 'npm audit',
  },
  paths: {
    source: 'backend/',
    tests: 'spec/',
    docs: 'documentation/',
    superpowers: 'documentation/superpowers/',
    specs: 'documentation/superpowers/specs/',
    plans: 'documentation/superpowers/plans/',
    changelog: 'HISTORY.md',
    readme: 'ABOUT.md',
    decisions: 'documentation/DECISIONS.md',
    knowledge: 'knowledge/',
    taskRegistry: '.agentic/kiki/TASK_REGISTRY.json',
  },
  health: {
    watchdogEnabled: true,
    stuckThresholdMs: 300000,
    gracePeriodMs: 120000,
    absoluteMaxMs: 3600000,
    checkIntervalMs: 30000,
    loopRepeatCount: 3,
    watchAllSubagents: false,
    logPath: '.agentic/kiki/health_log.jsonl',
  },
} as KikiConfig;

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
  'Behavioral rule: Do not circumvent publishing/Deploy-route approval via scripts, wrappers, alternate tools, APIs, or delegation. Request approval for the intended publishing operation. If approval is rejected, do not retry or work around it; report PERMISSION_BLOCKED: <command> and stop.';

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

describe('ordered native permission translation', () => {
  it('lean_role_matrix_matches_approved_territory_consolidation', () => {
    const expectedTerritories: Record<string, string[]> = {
      orchestrator: ['.agentic/kiki/TASK_REGISTRY.json', '.superpowers/sdd/**'],
      brainstormer: ['docs/superpowers/**'],
      planner: ['docs/superpowers/**'],
      implementer: ['src/**', 'tests/**', '.gitignore', '.superpowers/sdd/**'],
      guiDesigner: ['src/**', 'tests/**', '.superpowers/sdd/**'],
      reviewer: ['.agentic/reviews/*', '.opencode/docs/reviews/*'],
      escalation: ['.agentic/reviews/*', '.opencode/docs/reviews/*'],
      historian: ['docs/**', 'README*', 'CHANGELOG*', '.agentic/**'],
    };
    for (const [role, territories] of Object.entries(expectedTerritories)) {
      const rules = rulesForRole(DEFAULT_CONFIG, role);
      expect(rules.filter(rule => rule.action === 'edit'), role).toEqual([
        { action: 'edit', resource: '*', effect: 'deny' },
        ...territories.map(resource => ({ action: 'edit', resource, effect: 'allow' })),
      ]);
      // The lean consolidation deliberately removes route, read, mirror and
      // secret permission entries; they must not reappear through another path.
      expect(rules.some(rule => routeOnlyActions.has(rule.action)), role).toBe(false);
      expect(rules.some(rule => rule.action === 'read'), role).toBe(false);
      expect(rules.some(rule => rule.resource.startsWith('.worktree')), role).toBe(false);
      expect(rules.some(rule => secretEditPatterns.has(rule.resource)), role).toBe(false);
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
    for (const name of Object.keys(permissions)) {
      expect(permissions[name].filter(rule => rule.action === 'read'), name).toEqual([]);
      expect(permissions[name].filter(rule => rule.action === 'shell' && rule.effect === 'allow'
        && rule.resource.startsWith('git ')), name).toEqual([]);
      // Secret protection lives in the shared policy block, not in role tails.
      expect(permissions[name].filter(rule => secretEditPatterns.has(rule.resource)), name).toEqual([]);
      expect(permissions[name][0], name).toEqual({ action: 'shell', resource: '*', effect: 'allow' });
      expect(permissions[name].at(-1), name).toEqual({ action: 'shell', resource: 'git push *', effect: 'ask' });
    }
  });

  it('security_shell_matrix_all_eight_roles', () => {
    const routineCommands = [
      'git status', 'git diff', 'git log', 'mkdir -p tmp/x', 'npm run build', 'npm test',
      'node script.js', 'printf hello', 'rm -rf /', 'git reset --hard',
      'something-unknown --flag', 'gh pr view 42', 'gh pr list', 'gh issue list',
      'gh repo view', 'gh workflow list', 'scalingo status', 'scalingo logs --app myapp',
      'railway status', 'railway logs',
      // Publishing wrappers are allowed mechanically; the binding prompt is the
      // backstop, and only a real git push asks.
      'npm publish', 'yarn publish', 'pnpm publish', 'ftp example.com',
      'curl https://example.com', 'wget https://example.com', 'ssh deploy@example.com',
      'scalingo deploy', 'railway up', 'gh pr merge 42', 'gh release create v1.0.0',
    ];
    const pushCommands = [
      'git push origin main',
      'git push --force origin main',
      'git push -f origin main',
      'git push origin main --force',
      'git push origin my-feature',
      'git push origin hot-fix',
    ];
    const shellAllowAll: Rule = { action: 'shell', resource: '*', effect: 'allow' };
    for (const role of Object.keys(roleGenerators)) {
      const rules = rulesForRole(DEFAULT_CONFIG, role);
      const shell = rules.filter(rule => rule.action === 'shell');
      expect(shell[0], `${role}: routine local work runs without a prompt`).toEqual(shellAllowAll);
      expect(
        shell.filter(rule => rule.effect === 'ask').map(rule => rule.resource),
        `${role}: managed permission asks + final push`,
      ).toEqual(['kiki permissions add *', 'kiki permissions remove *', 'git push *']);
      expect(shell.filter(rule => rule.effect === 'deny'), `${role}: no shell denies`).toEqual([]);
      for (const command of routineCommands) {
        expect(effectFor(rules, 'shell', command), `${role}: ${command}`).toBe('allow');
      }
      for (const command of pushCommands) {
        // Force pushes are now asks, not hard denies.
        expect(effectFor(rules, 'shell', command), `${role}: ${command}`).toBe('ask');
      }
    }
  });

  it('configured_publishing_commands_run_under_the_shell_baseline', () => {
    // The lean baseline does not sort commands by effect. A project that names
    // a publishing route as build/test still runs it; only the binding prompt
    // and transcript regulate publishing beyond a real git push.
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
      expect(effectFor(rules, 'shell', 'ftp example.com'), `${role}: configured ftp`).toBe('allow');
      expect(effectFor(rules, 'shell', 'npm publish'), `${role}: configured publish`).toBe('allow');
      expect(effectFor(rules, 'shell', 'make check'), `${role}: routine configured command`).toBe('allow');
      expect(effectFor(rules, 'shell', 'npm audit'), `${role}: verification command`).toBe('allow');
      expect(bodyOf(generateImplementerTemplate(config)), role)
        .toContain('publishing/Deploy-route approval');
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

  it('security_alternate_routes_are_mechanically_open', () => {
    // Route controls are prompt-only by approved design: no generated role
    // carries execute, web, MCP, skill, subagent or external-directory rules.
    for (const role of Object.keys(roleGenerators)) {
      const rules = rulesForRole(DEFAULT_CONFIG, role);
      expect(rules.some(rule => routeOnlyActions.has(rule.action)), role).toBe(false);
      expect(rules.some(rule => rule.action === '*_*'), role).toBe(false);
      expect(rules.some(rule => rule.action === '*' && rule.effect === 'deny'), role).toBe(false);
      expect(rules.some(rule => rule.action === 'external_directory'), role).toBe(false);
      expect(rules.some(rule => rule.action === 'read'), role).toBe(false);
      // No route-denial claim: the generated behavior prompt carries the
      // role-specific behavioral boundary instead.
      const body = bodyOf(roleGenerators[role](DEFAULT_CONFIG));
      expect(body, role).toContain('Verhaltensregel:');
      if (role === 'brainstormer' || role === 'planner') {
        expect(body, role).toContain('Web-Recherche ist erlaubt');
      } else {
        expect(body, role).toMatch(/Kein Web/);
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
      ['custom', customConfig],
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
