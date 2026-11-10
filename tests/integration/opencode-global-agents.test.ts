import { describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createOC2Fixture, hasOC2Binary, readJSONC, requireOC2Binary,
} from '../helpers/oc2-fixture';
import {
  fixtureProviderConfig, hasToolResult, startFixtureProvider,
} from './fixtures/oc2-provider';

const ORCHESTRATOR = 'kiki-orchestrator';
const KIKI_AGENTS = [
  'kiki-orchestrator', 'kiki-brainstormer', 'kiki-planner', 'kiki-implementer',
  'kiki-gui-designer', 'kiki-reviewer', 'kiki-escalation', 'kiki-historian',
];

function jsonLines(stdout: string): Array<Record<string, any>> {
  return stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap(line => {
      try {
        return [JSON.parse(line) as Record<string, any>];
      } catch {
        return [];
      }
    });
}

function toolStates(stdout: string): Array<{ tool: string; state: any }> {
  return jsonLines(stdout)
    .filter(entry => entry.type === 'tool_use')
    .map(entry => ({ tool: entry.part.tool as string, state: entry.part.state }));
}

describe.skipIf(!hasOC2Binary())('real OC2 global agents', () => {
  it('loads all eight native agents, the primary orchestrator, and project model precedence', async () => {
    const fixture = createOC2Fixture(requireOC2Binary());
    const provider = await startFixtureProvider(request => {
      if (request.model === 'fixture-orch') return { type: 'text', text: 'Orchestrator selected' };
      if (request.model === 'fixture-title') return { type: 'text', text: 'Fixture title' };
      return { type: 'text', text: 'Fixture reply' };
    });
    try {
      const installed = fixture.runCli(['install']);
      expect(installed.status, installed.stderr).toBe(0);

      const global = readJSONC(fixture.globalFile);
      global.providers = fixtureProviderConfig(provider.baseURL, {
        'fixture-orch': 'Orchestrator',
        'fixture-global': 'Global model',
        'fixture-project': 'Project model',
        'fixture-title': 'Title model',
      });
      global.agents = {
        ...(global.agents ?? {}),
        title: { model: { providerID: 'kiki-fixture', model: 'fixture-title' } },
        'kiki-orchestrator': {
          model: { providerID: 'kiki-fixture', model: 'fixture-orch' },
        },
        'kiki-reviewer': {
          model: { providerID: 'kiki-fixture', model: 'fixture-global' },
        },
      };
      writeFileSync(fixture.globalFile, `${JSON.stringify(global, null, 2)}\n`);
      writeFileSync(join(fixture.project, 'opencode.json'), `${JSON.stringify({
        $schema: 'https://opencode.ai/config.json',
        agents: {
          'kiki-implementer': {
            model: { providerID: 'kiki-fixture', model: 'fixture-project' },
          },
        },
      }, null, 2)}\n`);

      const agentsResult = fixture.run(['debug', 'agents', '--standalone']);
      expect(agentsResult.status, agentsResult.stderr).toBe(0);
      const agents = JSON.parse(agentsResult.stdout) as Array<Record<string, any>>;
      const kikiAgents = agents.filter(agent => String(agent.id).startsWith('kiki-'));
      expect(kikiAgents.map(agent => agent.id).sort()).toEqual([...KIKI_AGENTS].sort());
      for (const agent of kikiAgents) {
        expect(agent.mode).toBe(agent.id === ORCHESTRATOR ? 'primary' : 'subagent');
      }
      const implementer = agents.find(agent => agent.id === 'kiki-implementer');
      const reviewer = agents.find(agent => agent.id === 'kiki-reviewer');
      expect(implementer.model).toEqual({ providerID: 'kiki-fixture', id: 'fixture-project' });
      expect(reviewer.model).toEqual({ providerID: 'kiki-fixture', id: 'fixture-global' });

      // Install never seeds top-level permissions (OC2 appends those to every agent).
      const installedGlobal = readJSONC(fixture.globalFile);
      expect(installedGlobal.permissions).toBeUndefined();
      const installedProject = readJSONC(join(fixture.project, 'opencode.json'));
      expect(installedProject.permissions).toBeUndefined();

      const run = await fixture.runAsync([
        'run', '--standalone', '--format', 'json', '--agent', ORCHESTRATOR, 'Select orchestrator',
      ]);
      expect(run.status, run.stderr).toBe(0);
      expect(run.stdout).toContain('Orchestrator selected');
      expect(provider.requestsFor('fixture-orch')).toBeGreaterThan(0);
    } finally {
      await provider.stop();
      await fixture.cleanup();
    }
  }, 120_000);

  it('evaluates appended file, config and global permission rules as real deny/allow/ask', async () => {
    const fixture = createOC2Fixture(requireOC2Binary());
    const provider = await startFixtureProvider(request => {
      if (request.model === 'fixture-title') return { type: 'text', text: 'Fixture title' };
      if (request.model !== 'fixture-policy') return { type: 'text', text: 'Fixture reply' };
      const results = request.messages.filter(message => message.role === 'tool').length;
      const scripts = [
        { tool: 'edit', arguments: { path: 'src/allowed.txt', oldString: 'old', newString: 'new' } },
        { tool: 'edit', arguments: { path: '.worktree/allowed.txt', oldString: 'tree', newString: 'branch' } },
        { tool: 'edit', arguments: { path: 'secret/denied.txt', oldString: 'secret', newString: 'changed' } },
        { tool: 'shell', arguments: { command: 'echo policy-probe' } },
      ];
      if (results < scripts.length) {
        const call = scripts[results];
        return {
          type: 'tool-calls',
          calls: [{ id: `call_policy_${results}`, name: call.tool, arguments: call.arguments }],
        };
      }
      return { type: 'text', text: 'Policy probe complete' };
    });
    try {
      const installed = fixture.runCli(['install']);
      expect(installed.status, installed.stderr).toBe(0);

      mkdirSync(join(fixture.project, 'src'), { recursive: true });
      mkdirSync(join(fixture.project, 'secret'), { recursive: true });
      mkdirSync(join(fixture.project, '.worktree'), { recursive: true });
      writeFileSync(join(fixture.project, 'src/allowed.txt'), 'old\n');
      writeFileSync(join(fixture.project, '.worktree/allowed.txt'), 'tree\n');
      writeFileSync(join(fixture.project, 'secret/denied.txt'), 'secret\n');

      mkdirSync(join(fixture.config, 'agents'), { recursive: true });
      writeFileSync(join(fixture.config, 'agents/policy-file.md'), [
        '---',
        'description: Policy probe agent',
        'mode: primary',
        'permissions:',
        '  - action: edit',
        '    resource: "*"',
        '    effect: deny',
        '---',
        'Policy probe body.',
        '',
      ].join('\n'));

      const global = readJSONC(fixture.globalFile);
      global.providers = fixtureProviderConfig(provider.baseURL, {
        'fixture-policy': 'Policy model',
        'fixture-title': 'Title model',
      });
      global.permissions = [
        { action: 'shell', resource: '*', effect: 'ask' },
        { action: 'webfetch', resource: '*', effect: 'deny' },
      ];
      global.agents = {
        ...(global.agents ?? {}),
        title: { model: { providerID: 'kiki-fixture', model: 'fixture-title' } },
      };
      writeFileSync(fixture.globalFile, `${JSON.stringify(global, null, 2)}\n`);
      // Project-tier agent permissions are appended after the global agent-file
      // rules by the real binary, so the later path grant can narrow the deny.
      writeFileSync(join(fixture.project, 'opencode.json'), `${JSON.stringify({
        $schema: 'https://opencode.ai/config.json',
        agents: {
          'policy-file': {
            model: { providerID: 'kiki-fixture', model: 'fixture-policy' },
            permissions: [
              { action: 'edit', resource: 'src/**', effect: 'allow' },
              { action: 'edit', resource: '.worktree/**', effect: 'allow' },
            ],
          },
        },
      }, null, 2)}\n`);

      // Effective rules: agent-file deny precedes the config allow, and the
      // top-level rules are appended to every agent.
      const agentsResult = fixture.run(['debug', 'agents', '--standalone']);
      expect(agentsResult.status, agentsResult.stderr).toBe(0);
      const allAgents = JSON.parse(agentsResult.stdout) as Array<Record<string, any>>;
      const policy = allAgents.find(agent => agent.id === 'policy-file')!;
      const ruleText = (rules: Array<Record<string, any>>) =>
        rules.map(rule => `${rule.action}:${rule.resource}:${rule.effect}`);
      const rules = ruleText(policy.permissions);
      expect(rules).toContain('edit:*:deny');
      expect(rules).toContain('edit:src/**:allow');
      expect(rules).toContain('edit:.worktree/**:allow');
      expect(rules).toContain('shell:*:ask');
      expect(rules).toContain('webfetch:*:deny');
      expect(rules.indexOf('edit:*:deny')).toBeLessThan(rules.indexOf('edit:src/**:allow'));
      // Top-level rules are merged into every agent, not just this fixture one.
      for (const agent of allAgents.filter(entry => String(entry.id).startsWith('kiki-'))) {
        const agentRules = ruleText(agent.permissions);
        expect(agentRules, agent.id).toContain('shell:*:ask');
        expect(agentRules, agent.id).toContain('webfetch:*:deny');
      }

      const run = await fixture.runAsync([
        'run', '--standalone', '--format', 'json', '--agent', 'policy-file', 'Policy probe',
      ]);
      expect(run.status, run.stderr).toBe(0);
      expect(run.stdout).toContain('Policy probe complete');
      const tools = toolStates(run.stdout);
      const byTool = (name: string) => tools.filter(entry => entry.tool === name);

      const allowedEdit = byTool('edit')[0];
      expect(allowedEdit.state.status).toBe('completed');
      expect(String(allowedEdit.state.output)).toContain('Edited');

      const worktreeEdit = byTool('edit')[1];
      expect(worktreeEdit.state.status).toBe('completed');
      expect(String(worktreeEdit.state.output)).toContain('Edited');

      const deniedEdit = byTool('edit')[2];
      expect(deniedEdit.state.status).toBe('error');
      expect(String(deniedEdit.state.error)).toMatch(/permission|denied|not available/i);
      expect(readFileSync(join(fixture.project, 'secret/denied.txt'), 'utf8')).toBe('secret\n');

      const askedShell = byTool('shell')[0];
      expect(askedShell.state.status).toBe('error');
      expect(String(askedShell.state.error)).toMatch(/cannot ask|permission|rejected/i);
    } finally {
      await provider.stop();
      await fixture.cleanup();
    }
  }, 120_000);

  it('keeps file-discovered agents available when the server plugin deliberately fails', () => {
    const fixture = createOC2Fixture(requireOC2Binary());
    try {
      const installed = fixture.runCli(['install']);
      expect(installed.status, installed.stderr).toBe(0);
      const broken = join(fixture.root, 'broken-plugin');
      mkdirSync(broken, { recursive: true });
      writeFileSync(join(broken, 'package.json'), JSON.stringify({
        name: 'kiki-broken-fixture',
        type: 'module',
        exports: { './server': './server.js' },
      }, null, 2));
      writeFileSync(join(broken, 'server.js'), 'throw new Error("deliberate fixture plugin failure");\n');
      const global = readJSONC(fixture.globalFile);
      global.plugins = [...(global.plugins ?? []), broken];
      writeFileSync(fixture.globalFile, `${JSON.stringify(global, null, 2)}\n`);

      const result = fixture.run(['debug', 'agents', '--standalone']);
      expect(result.status, result.stderr).toBe(0);
      const agents = JSON.parse(result.stdout) as Array<Record<string, any>>;
      const kikiAgents = agents.filter(agent => String(agent.id).startsWith('kiki-'));
      expect(kikiAgents.map(agent => agent.id).sort()).toEqual([...KIKI_AGENTS].sort());
    } finally {
      fixture.cleanup();
    }
  }, 120_000);
});
