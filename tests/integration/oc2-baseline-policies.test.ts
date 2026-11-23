import { describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  createOC2Fixture, hasOC2Binary, observedOC2Version, requireOC2Binary, type OC2Fixture,
} from '../helpers/oc2-fixture';
import {
  fixtureProviderConfig, startFixtureProvider, type FixtureProvider, type FixtureReply, type FixtureRequest,
} from './fixtures/oc2-provider';
import {
  DEFAULT_CONFIG,
  generateAgentPermissions,
  generateGlobalPermissions,
  generateSecretPolicies,
} from '../../src/cli/config';
import type { PermissionRule } from '../../src/cli/opencode-config';

/**
 * Final generator-state policy battery. The fixture uses the exact Task 3
 * outputs (role arrays, top-level push ask, shared policy block), a loopback
 * provider and placeholder files only. No live global configuration, credential
 * or real secret is read or written.
 *
 * Policy decisions are asserted as hard denials with the measured policy
 * evidence, not as asks. Open controls prove the deny is not vacuous.
 */

const ROLE_SECRETS: Record<string, { path: string; calls: Array<{ tool: string; path: string }> }> = {
  'kiki-orchestrator': { path: '.superpowers/sdd/key.pem', calls: [] },
  'kiki-brainstormer': { path: 'docs/superpowers/credentials.json', calls: [] },
  'kiki-planner': { path: 'docs/superpowers/secret.txt', calls: [] },
  'kiki-implementer': { path: 'src/.env.local', calls: [] },
  'kiki-gui-designer': { path: 'src/key.pem', calls: [] },
  'kiki-reviewer': { path: '.agentic/reviews/secret-notes.md', calls: [] },
  'kiki-escalation': { path: '.agentic/reviews/key.pem', calls: [] },
  'kiki-historian': { path: 'docs/credentials.json', calls: [] },
};

const ALL_PATTERN_PATHS = [
  '.env',
  'src/.env',
  'src/secret.txt',
  'src/credentials.json',
  'src/key.pem',
  'src/private.key',
  'src/id_rsa',
];

interface State {
  tool: string;
  status: string;
  error: string;
  output: string;
}

function toolStates(stdout: string): State[] {
  return stdout.split(/\r?\n/).filter(Boolean).flatMap(line => {
    try {
      const entry = JSON.parse(line) as Record<string, any>;
      if (entry.type !== 'tool_use') return [];
      const state = entry.part?.state ?? {};
      return [{
        tool: String(entry.part?.tool ?? ''),
        status: String(state.status ?? ''),
        error: String(state.error ?? ''),
        output: String(state.output ?? ''),
      }];
    } catch {
      return [];
    }
  });
}

function writePlaceholder(fixture: OC2Fixture, relative: string): void {
  const file = join(fixture.project, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, 'old\n');
}

function writeGlobal(
  fixture: OC2Fixture,
  provider: FixtureProvider,
  options: {
    withPolicies: boolean;
    extraAgent?: Record<string, unknown>;
    projectAllow?: { agent: string; rule: PermissionRule };
  } = { withPolicies: true },
): void {
  const permissions = generateAgentPermissions(DEFAULT_CONFIG);
  const agents: Record<string, any> = {
    title: { model: { providerID: 'kiki-fixture', model: 'fixture-title' } },
    'no-own-rules': {
      mode: 'primary',
      description: 'no own permission rules',
      model: { providerID: 'kiki-fixture', model: 'fixture-policy' },
      permissions: [],
    },
  };
  for (const [role, rules] of Object.entries(permissions)) {
    agents[role] = {
      mode: role === 'kiki-orchestrator' ? 'primary' : 'subagent',
      description: 'baseline policy probe',
      model: { providerID: 'kiki-fixture', model: 'fixture-policy' },
      // A later handwritten exact allow must not beat the policy block.
      permissions: role === 'kiki-implementer'
        ? [...rules, { action: 'edit', resource: 'src/.env.local', effect: 'allow' }]
        : rules,
    };
  }
  if (options.extraAgent) agents['extra-policy-agent'] = options.extraAgent;
  const userPolicy = { action: 'tool.use', resource: 'read:user-private/**', effect: 'deny', custom: true };
  fixture.writeGlobal({
    $schema: 'https://opencode.ai/config.json',
    providers: fixtureProviderConfig(provider.baseURL, {
      'fixture-policy': 'Policy probe',
      'fixture-title': 'Title',
    }),
    permissions: [
      { action: 'shell', resource: '*', effect: 'ask' },
      { action: 'shell', resource: 'git status *', effect: 'allow' },
      { action: 'shell', resource: 'git diff *', effect: 'allow' },
      ...generateGlobalPermissions(),
    ],
    ...(options.withPolicies
      ? { policies: [userPolicy, ...generateSecretPolicies()] }
      : {}),
    agents,
  });
  const projectConfig = join(fixture.project, 'opencode.json');
  if (options.projectAllow) {
    writeFileSync(projectConfig, `${JSON.stringify({
      $schema: 'https://opencode.ai/config.json',
      agents: {
        [options.projectAllow.agent]: { permissions: [options.projectAllow.rule] },
      },
    }, null, 2)}\n`);
  } else {
    rmSync(projectConfig, { force: true });
  }
}

async function runCalls(
  fixture: OC2Fixture,
  provider: FixtureProvider,
  agent: string,
  calls: Array<{ tool: string; arguments: Record<string, unknown> }>,
): Promise<State[]> {
  provider.script((request: FixtureRequest): FixtureReply => {
    if (request.model === 'fixture-title') return { type: 'text', text: 'Baseline policy title' };
    if (request.model !== 'fixture-policy') return { type: 'text', text: 'Fixture reply' };
    const results = request.messages.filter(message => message.role === 'tool').length;
    if (results < calls.length) {
      const call = calls[results];
      return {
        type: 'tool-calls',
        calls: [{ id: `policy_${results}`, name: call.tool, arguments: call.arguments }],
      };
    }
    return { type: 'text', text: 'Baseline policy probe complete' };
  });
  const result = await fixture.runAsync([
    'run', '--standalone', '--format', 'json', '--agent', agent, 'Run baseline policy probe',
  ], { timeout: 90_000 });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain('Baseline policy probe complete');
  const states = toolStates(result.stdout);
  expect(states, result.stdout.slice(-2000)).toHaveLength(calls.length);
  return states;
}

function expectPolicyDeny(state: State, label: string): void {
  expect(state.status, `${label}: ${state.error}`).toBe('error');
  expect(`${state.error} ${state.output}`, label).toMatch(/configuration policy|Blocked by configuration/i);
  expect(state.status, `${label}: policy denial is not an ask`).not.toBe('ask');
}

describe.skipIf(!hasOC2Binary())('final generator policy battery on real OpenCode', () => {
  it('policy_binding_all_roles_and_all_secret_patterns', async () => {
    const binary = requireOC2Binary();
    const version = observedOC2Version(binary);
    expect(version, 'observed OpenCode version').toBe('2.3.2');
    const fixture = createOC2Fixture(binary);
    const provider = await startFixtureProvider();
    try {
      for (const [role, config] of Object.entries(ROLE_SECRETS)) {
        writePlaceholder(fixture, config.path);
        writeGlobal(fixture, provider, { withPolicies: true });
        const calls = [
          { tool: 'read', arguments: { path: config.path } },
          { tool: 'edit', arguments: { path: config.path, oldString: 'old', newString: 'new' } },
        ];
        const states = await runCalls(fixture, provider, role, calls);
        expectPolicyDeny(states[0], `${role} read ${config.path}`);
        expectPolicyDeny(states[1], `${role} edit ${config.path}`);
        console.info(`[baseline-policies] ${role} secret read/edit denied ${config.path}`);
      }

      // All seven secret globs, both read and edit, against a broad territory
      // allow so only the policy block can be the denying mechanism.
      writeGlobal(fixture, provider, {
        withPolicies: true,
        extraAgent: {
          mode: 'primary',
          description: 'broad territory policy probe',
          model: { providerID: 'kiki-fixture', model: 'fixture-policy' },
          permissions: [{ action: 'edit', resource: '*', effect: 'allow' }],
        },
      });
      for (const path of ALL_PATTERN_PATHS) writePlaceholder(fixture, path);
      const patternCalls = ALL_PATTERN_PATHS.flatMap(path => ([
        { tool: 'read', arguments: { path } },
        { tool: 'edit', arguments: { path, oldString: 'old', newString: 'new' } },
      ]));
      const patternStates = await runCalls(fixture, provider, 'extra-policy-agent', patternCalls);
      patternCalls.forEach((call, index) => {
        expectPolicyDeny(patternStates[index], `broad allow ${call.tool} ${String(call.arguments.path)}`);
      });
    } finally {
      await provider.stop();
      await fixture.cleanup();
    }
  }, 300_000);

  it('policy_binds_against_later_exact_allows_and_persisted_project_grants', async () => {
    const binary = requireOC2Binary();
    const fixture = createOC2Fixture(binary);
    const provider = await startFixtureProvider();
    try {
      writePlaceholder(fixture, 'src/.env.local');
      // The global implementer array already carries a later exact allow; add a
      // project-tier persisted allow for the same resource.
      writeGlobal(fixture, provider, {
        withPolicies: true,
        projectAllow: {
          agent: 'kiki-implementer',
          rule: { action: 'edit', resource: 'src/.env.local', effect: 'allow' },
        },
      });
      const states = await runCalls(fixture, provider, 'kiki-implementer', [
        { tool: 'edit', arguments: { path: 'src/.env.local', oldString: 'old', newString: 'new' } },
      ]);
      expectPolicyDeny(states[0], 'exact allow does not override policy');
      console.info('[baseline-policies] exact and project allow still denied by policy');
    } finally {
      await provider.stop();
      await fixture.cleanup();
    }
  }, 180_000);

  it('native_env_ask_becomes_policy_deny_and_agent_with_no_rules_is_covered', async () => {
    const binary = requireOC2Binary();
    const fixture = createOC2Fixture(binary);
    const provider = await startFixtureProvider();
    try {
      writePlaceholder(fixture, 'src/.env.local');
      // Without the policy block the native `.env` read behaviour is an ask.
      writeGlobal(fixture, provider, { withPolicies: false });
      const askStates = await runCalls(fixture, provider, 'no-own-rules', [
        { tool: 'read', arguments: { path: 'src/.env.local' } },
      ]);
      expect(askStates[0].status, askStates[0].error).toBe('error');
      expect(askStates[0].error).toMatch(/cannot ask the user for permission/i);

      // With the generated policies the same action is a hard policy denial.
      writeGlobal(fixture, provider, { withPolicies: true });
      const denyStates = await runCalls(fixture, provider, 'no-own-rules', [
        { tool: 'read', arguments: { path: 'src/.env.local' } },
      ]);
      expectPolicyDeny(denyStates[0], 'agent without own rules');
    } finally {
      await provider.stop();
      await fixture.cleanup();
    }
  }, 180_000);

  it('user_top_level_entries_and_user_policy_survive_and_open_controls_stay_open', async () => {
    const binary = requireOC2Binary();
    const fixture = createOC2Fixture(binary);
    const provider = await startFixtureProvider();
    try {
      writePlaceholder(fixture, 'src/control.ts');
      writePlaceholder(fixture, 'docs/guide.md');
      writePlaceholder(fixture, 'user-private/private.txt');
      writeGlobal(fixture, provider, { withPolicies: true });
      const states = await runCalls(fixture, provider, 'kiki-implementer', [
        // Open controls: the role territory edit and an ordinary read outside
        // the territory both remain allowed.
        { tool: 'edit', arguments: { path: 'src/control.ts', oldString: 'old', newString: 'nonsecret' } },
        { tool: 'read', arguments: { path: 'docs/guide.md' } },
        // The arbitrary user policy survives alongside Kiki entries.
        { tool: 'read', arguments: { path: 'user-private/private.txt' } },
      ]);
      expect(states[0].status, states[0].error).toBe('completed');
      expect(states[1].status, states[1].error).toBe('completed');
      expectPolicyDeny(states[2], 'arbitrary user policy');
      console.info('[baseline-policies] open controls and user policy verified');
    } finally {
      await provider.stop();
      await fixture.cleanup();
    }
  }, 180_000);
});
