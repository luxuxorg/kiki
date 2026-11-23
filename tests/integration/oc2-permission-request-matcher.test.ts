import { describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createOC2Fixture, hasOC2Binary, observedOC2Version, readJSONC, requireOC2Binary,
} from '../helpers/oc2-fixture';
import {
  fixtureProviderConfig, hasToolResult, startFixtureProvider, subagentCall,
} from './fixtures/oc2-provider';
import { DEFAULT_CONFIG, generateAgentPermissions } from '../../src/cli/config';
import type { PermissionRule } from '../../src/cli/opencode-config';

// Spike evidence for the draft managed-permission-request design (§4/5).
// Measured against the actual installed OpenCode 2.x evaluator: no `kiki
// permissions` implementation exists, so a fixture-local stub answers any
// allowed invocation; only the permission decision string is measured.

const AGENTS = [
  'kiki-orchestrator', 'kiki-brainstormer', 'kiki-planner', 'kiki-implementer',
  'kiki-gui-designer', 'kiki-reviewer', 'kiki-escalation', 'kiki-historian',
];

// Proposed generator patterns: exact bare + space-delimited wildcard only, so
// `kiki permissions addendum` cannot match `kiki permissions add*`.
const LIST = 'kiki permissions list';
const CHECK = 'kiki permissions check';
const ADD = 'kiki permissions add';
const REMOVE = 'kiki permissions remove';
const PROPOSED: PermissionRule[] = [
  { action: 'shell', resource: LIST, effect: 'allow' },
  { action: 'shell', resource: `${LIST} *`, effect: 'allow' },
  { action: 'shell', resource: CHECK, effect: 'allow' },
  { action: 'shell', resource: `${CHECK} *`, effect: 'allow' },
  { action: 'shell', resource: ADD, effect: 'ask' },
  { action: 'shell', resource: `${ADD} *`, effect: 'ask' },
  { action: 'shell', resource: REMOVE, effect: 'ask' },
  { action: 'shell', resource: `${REMOVE} *`, effect: 'ask' },
];

type Decision = 'allow' | 'ask' | 'deny' | 'unknown';

interface Case {
  command: string;
  /** Omitted for matcher-limit probes that are recorded, not asserted. */
  expected?: Decision;
  note: string;
}

function cases(project: string, binKiki: string, fakeCli: string): Case[] {
  return [
    { command: LIST, expected: 'allow', note: 'bare list' },
    { command: `${LIST} --json`, expected: 'allow', note: 'list flag' },
    { command: CHECK, expected: 'allow', note: 'bare check' },
    { command: `${CHECK} foo.ts`, expected: 'allow', note: 'check target' },
    { command: ADD, expected: 'ask', note: 'bare add' },
    { command: `${ADD} --path src/x.ts --action edit`, expected: 'ask', note: 'add options' },
    { command: `${ADD} --apply`, expected: 'ask', note: 'add apply' },
    { command: REMOVE, expected: 'ask', note: 'bare remove' },
    { command: `${REMOVE} src/x.ts`, expected: 'ask', note: 'remove target' },
    { command: `${REMOVE} --yes`, expected: 'ask', note: 'remove flag' },
    { command: 'echo routine-probe', expected: 'allow', note: 'routine control' },
    { command: 'kiki permissions addendum', expected: 'allow', note: 'no add* false positive' },
    { command: `kiki permissions list && ${ADD} src/x.ts`, note: 'LIMIT: compound list+add evaluated as one request; decision only' },
    { command: `${ADD} src/x.ts && ${LIST}`, expected: 'ask', note: 'mutation suffix still ask' },
    { command: `cd ${project} && ${ADD} src/x.ts`, note: 'LIMIT: cwd-prefixed compound' },
    { command: `kiki --log-level debug permissions add src/x.ts`, note: 'LIMIT: leading global flag' },
    { command: `${binKiki} permissions add src/x.ts`, note: 'LIMIT: absolute executable path' },
    { command: `sh -c '${ADD} src/x.ts'`, note: 'LIMIT: shell wrapper' },
    { command: `node ${fakeCli} permissions add src/x.ts`, note: 'LIMIT: node wrapper' },
    { command: 'git push --force origin main', expected: 'ask', note: 'lean baseline: force push asks' },
  ];
}

function toolStates(stdout: string): Array<{ tool: string; input: any; state: any }> {
  return stdout.split(/\r?\n/).filter(Boolean).flatMap(line => {
    try {
      const entry = JSON.parse(line) as Record<string, any>;
      if (entry.type !== 'tool_use') return [];
      return [{ tool: entry.part.tool as string, input: entry.part.state?.input, state: entry.part.state }];
    } catch {
      return [];
    }
  });
}

/**
 * Fixture-local plugin acting as the deterministic permission client. It is not
 * a TUI: it observes the real server event stream, records the owning session,
 * and answers the pending request through the supported permission reply API.
 * The test never uses `--auto`, so an unanswered ask would stall the run.
 */
function writePermissionProbePlugin(fixture: ReturnType<typeof createOC2Fixture>): string {
  const directory = join(fixture.root, 'permission-probe-plugin');
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'package.json'), JSON.stringify({
    name: 'permission-probe', type: 'module', main: 'index.js',
  }));
  writeFileSync(join(directory, 'index.js'), `import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
export default {
  id: 'permission-probe',
  async setup(ctx) {
    const root = ctx.location.directory;
    const logFile = join(root, '.agentic/kiki/permission-probe-events.jsonl');
    const decisionFile = join(root, '.agentic/kiki/permission-probe-decision');
    mkdirSync(dirname(logFile), { recursive: true });
    const log = (type, data, extra = {}) => appendFileSync(logFile, JSON.stringify({ type, data, ...extra }) + '\\n');
    const controller = new AbortController();
    (async () => {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        if (event.type === 'session.created') {
          log('session.created', {
            sessionID: event.data.sessionID,
            parentID: event.data.parentID ?? null,
            agent: event.data.agent ?? null,
          });
        } else if (event.type === 'permission.asked') {
          log('permission.asked', event.data);
          const resources = Array.isArray(event.data.resources) ? event.data.resources : [];
          if (event.data.action !== 'shell' || !resources.some((value) => value.startsWith('kiki permissions add'))) {
            log('permission.unhandled', { sessionID: event.data.sessionID, id: event.data.id });
            continue;
          }
          const decision = existsSync(decisionFile) ? readFileSync(decisionFile, 'utf8').trim() : 'reject';
          await ctx.permission.reply({
            sessionID: event.data.sessionID,
            requestID: event.data.id,
            decision,
            message: 'fixture permission probe',
          });
          log('permission.replied.by.probe', {
            sessionID: event.data.sessionID,
            requestID: event.data.id,
            decision,
          });
        } else if (event.type === 'permission.replied') {
          log('permission.replied', event.data);
        }
      }
    })().catch((error) => log('probe.error', { message: String(error) }));
    return async () => { controller.abort(); };
  },
};
`);
  return directory;
}

function readProbeEvents(project: string): Array<Record<string, any>> {
  const file = join(project, '.agentic/kiki/permission-probe-events.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
}

describe.skipIf(!hasOC2Binary())('pending kiki permissions matcher on real OpenCode', () => {
  it('measures proposed allow/ask resource strings across all eight roles', async () => {
    const binary = requireOC2Binary();
    const fixture = createOC2Fixture(binary);
    const binKiki = join(fixture.root, 'bin', 'kiki');
    const fakeCli = join(fixture.root, 'fake-cli', 'index.js');
    writeFileSync(binKiki, '#!/bin/sh\nexit 0\n');
    chmodSync(binKiki, 0o755);
    writeFileSync(join(fixture.project, 'kiki'), '#!/bin/sh\nexit 0\n');
    chmodSync(join(fixture.project, 'kiki'), 0o755);
    mkdirSync(join(fixture.root, 'fake-cli'), { recursive: true });
    writeFileSync(fakeCli, 'process.exit(0);\n');

    const probeCases = cases(fixture.project, binKiki, fakeCli);
    const provider = await startFixtureProvider(request => {
      if (request.model === 'fixture-title') return { type: 'text', text: 'Permission matcher title' };
      if (request.model !== 'fixture-permissions') return { type: 'text', text: 'Fixture reply' };
      const results = request.messages.filter(message => message.role === 'tool').length;
      if (results < probeCases.length) {
        return {
          type: 'tool-calls',
          calls: [{
            id: `perm_${results}`,
            name: 'shell',
            arguments: { command: probeCases[results].command },
          }],
        };
      }
      return { type: 'text', text: 'Permission probe complete' };
    });

    const global: Record<string, any> = { providers: fixtureProviderConfig(provider.baseURL, {
      'fixture-permissions': 'Permission matcher probe',
      'fixture-title': 'Title',
    }), agents: {} };
    const canonical = generateAgentPermissions(DEFAULT_CONFIG);
    for (const name of AGENTS) {
      global.agents[name] = {
        mode: 'primary',
        description: 'permission matcher probe',
        model: { providerID: 'kiki-fixture', model: 'fixture-permissions' },
        permissions: [...canonical[name], ...PROPOSED],
      };
    }
    fixture.writeGlobal(global);

    const runProbe = async (agent: string, auto: boolean, selected: Case[]) => {
      provider.script(request => {
        if (request.model === 'fixture-title') return { type: 'text', text: 'Permission matcher title' };
        if (request.model !== 'fixture-permissions') return { type: 'text', text: 'Fixture reply' };
        const results = request.messages.filter(message => message.role === 'tool').length;
        if (results < selected.length) {
          return {
            type: 'tool-calls',
            calls: [{ id: `perm_${results}`, name: 'shell', arguments: { command: selected[results].command } }],
          };
        }
        return { type: 'text', text: 'Permission probe complete' };
      });
      const args = ['run', '--standalone', '--format', 'json', '--agent', agent];
      if (auto) args.push('--auto');
      args.push('Run permission probe');
      const result = await fixture.runAsync(args, {
        timeout: 90_000,
        extraEnv: { PATH: `${join(fixture.root, 'bin')}:${fixture.env.PATH ?? ''}` },
      });
      expect(result.status, `${agent} auto=${auto}: ${result.stderr}`).toBe(0);
      const shells = toolStates(result.stdout).filter(entry => entry.tool === 'shell');
      expect(shells.length, `${agent} auto=${auto}: shell calls`).toBe(selected.length);
      return shells;
    };

    const table: Array<Record<string, string>> = [];
    try {
      for (const agent of AGENTS) {
        const first = await runProbe(agent, false, probeCases);
        const decisions: Decision[] = first.map((shell, i) => {
          const status = shell.state?.status;
          if (status === 'completed') return 'allow';
          const message = String(shell.state?.error ?? shell.state?.output ?? '');
          if (/denied|not permitted|forbidden/i.test(message) && !/ask/i.test(message)) return 'deny';
          return 'unknown';
        });
        const unknown = probeCases.filter((_, i) => decisions[i] === 'unknown');
        let autoResults: typeof first = [];
        if (unknown.length > 0) {
          autoResults = await runProbe(agent, true, unknown);
          unknown.forEach((_, i) => {
            const original = probeCases.indexOf(unknown[i]);
            decisions[original] = autoResults[i].state?.status === 'completed' ? 'ask' : 'deny';
          });
        }
        probeCases.forEach((probe, i) => {
          table.push({
            role: agent, command: probe.command, decision: decisions[i], expected: probe.expected ?? 'measured', note: probe.note,
          });
          expect(decisions[i], `${agent}: ${probe.command} (${probe.note})`).not.toBe('unknown');
          if (probe.expected) {
            expect(decisions[i], `${agent}: ${probe.command} (${probe.note})`).toBe(probe.expected);
          }
        });
      }
      console.info(`[permission-matcher] observed OpenCode ${observedOC2Version(binary)}`);
      for (const row of table) {
        console.info(`[permission-matcher] ${row.role}\t${row.decision}\t${row.command}\t${row.note}`);
      }
    } finally {
      await provider.stop();
      fixture.cleanup();
    }
  }, 300_000);

  it('dispatches a real child and rejects/approves its pending ask through the permission API', async () => {
    const fixture = createOC2Fixture(requireOC2Binary());
    const provider = await startFixtureProvider(request => {
      if (request.model === 'fixture-title') return { type: 'text', text: 'Subagent permission title' };
      if (request.model === 'fixture-child') {
        if (!hasToolResult(request)) {
          return {
            type: 'tool-calls',
            calls: [{ id: 'child_permissions_add', name: 'shell', arguments: { command: 'kiki permissions add src/x.ts' } }],
          };
        }
        return { type: 'text', text: 'Child saw the permission outcome.' };
      }
      if (request.model === 'fixture-orch') {
        if (!hasToolResult(request)) {
          return subagentCall(
            'kiki-implementer',
            'Fixture permission request child',
            'Invoke the fixture permission command once.',
          );
        }
        return { type: 'text', text: 'Parent completed after child.' };
      }
      return { type: 'text', text: 'Fixture reply' };
    });
    try {
      expect(fixture.runCli(['install']).status).toBe(0);
      const probeDir = writePermissionProbePlugin(fixture);
      const marker = join(fixture.root, 'kiki-stub-marker');
      const binKiki = join(fixture.root, 'bin', 'kiki');
      writeFileSync(binKiki, `#!/bin/sh\nprintf '%s\\n' "$*" >> '${marker}'\nexit 0\n`);
      chmodSync(binKiki, 0o755);
      const projectKikiDir = join(fixture.project, '.agentic/kiki');
      mkdirSync(projectKikiDir, { recursive: true });
      const decisionFile = join(projectKikiDir, 'permission-probe-decision');
      const eventLog = join(projectKikiDir, 'permission-probe-events.jsonl');

      const global = readJSONC(fixture.globalFile);
      global.providers = fixtureProviderConfig(provider.baseURL, {
        'fixture-orch': 'Orchestrator',
        'fixture-child': 'Child',
        'fixture-title': 'Title',
      });
      const orchestrator = global.agents['kiki-orchestrator'];
      const implementer = global.agents['kiki-implementer'];
      global.agents = {
        ...global.agents,
        title: { model: { providerID: 'kiki-fixture', model: 'fixture-title' } },
        'kiki-orchestrator': { ...orchestrator, model: { providerID: 'kiki-fixture', model: 'fixture-orch' } },
        'kiki-implementer': {
          ...implementer,
          model: { providerID: 'kiki-fixture', model: 'fixture-child' },
          permissions: [
            ...(implementer.permissions ?? []),
            { action: 'shell', resource: 'kiki permissions add *', effect: 'ask' },
          ],
        },
      };
      global.plugins = [...(global.plugins ?? []), probeDir];
      writeFileSync(fixture.globalFile, `${JSON.stringify(global, null, 2)}\n`);

      const runCase = async (decision: 'reject' | 'once') => {
        writeFileSync(decisionFile, `${decision}\n`);
        rmSync(marker, { force: true });
        rmSync(eventLog, { force: true });
        const bodyStart = provider.bodies().length;
        const result = await fixture.runAsync([
          'run', '--standalone', '--format', 'json', '--agent', 'kiki-orchestrator', 'Subagent permission probe',
        ], {
          timeout: 90_000,
          extraEnv: { PATH: `${join(fixture.root, 'bin')}:${fixture.env.PATH ?? ''}` },
        });
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain('Parent completed after child.');

        const events = readProbeEvents(fixture.project);
        expect(events.filter(entry => entry.type === 'probe.error'), JSON.stringify(events)).toEqual([]);
        const created = events.filter(entry => entry.type === 'session.created').map(entry => entry.data);
        // The root session may predate the plugin's event subscription; the
        // child's parentID still identifies it, and the exported root session
        // verifies the linkage and agent instead of inventing an event row.
        const child = created.find(entry => typeof entry.parentID === 'string');
        expect(child, JSON.stringify(created)).toBeDefined();
        expect(child!.agent).toBe('kiki-implementer');
        const rootSession = child!.parentID as string;

        const asks = events.filter(entry => entry.type === 'permission.asked');
        expect(asks, JSON.stringify(events)).toHaveLength(1);
        const ask = asks[0].data;
        expect(ask.sessionID).toBe(child!.sessionID);
        expect(ask.sessionID).not.toBe(rootSession);
        expect(ask.action).toBe('shell');
        expect(ask.resources).toEqual(['kiki permissions add src/x.ts']);

        const replies = events.filter(entry => entry.type === 'permission.replied');
        expect(replies).toHaveLength(1);
        expect(replies[0].data.sessionID).toBe(child!.sessionID);
        expect(replies[0].data.requestID).toBe(ask.id);
        expect(replies[0].data.reply).toBe(decision);

        if (decision === 'reject') {
          expect(existsSync(marker), 'rejected command must not execute').toBe(false);
        } else {
          expect(readFileSync(marker, 'utf8')).toBe('permissions add src/x.ts\n');
        }

        const exportedResult = fixture.run([
          'session', 'export', child!.sessionID, '--sanitize', '--standalone',
        ]);
        expect(exportedResult.status, exportedResult.stderr).toBe(0);
        const childExport = JSON.parse(exportedResult.stdout) as {
          info: Record<string, any>;
          messages?: Array<{ content?: Array<Record<string, any>> }>;
        };
        const info = childExport.info;
        expect(info.parentID).toBe(rootSession);
        expect(info.agent).toBe('kiki-implementer');
        const childShellParts = (childExport.messages ?? [])
          .flatMap(message => message.content ?? [])
          .filter(part => part.type === 'tool' && part.name === 'shell');
        expect(childShellParts, 'child shell tool part').toHaveLength(1);
        const childShellState = childShellParts[0].state as Record<string, any>;
        const childShellError = JSON.stringify(childShellState.error ?? childShellState.output ?? '');
        console.info(`[subagent-permission] decision=${decision} childShellStatus=${childShellState.status} childShellError=${childShellError.slice(0, 200)}`);
        if (decision === 'reject') {
          expect(childShellState.status).toBe('error');
          expect(childShellError).toMatch(/permission|rejected|denied|not allowed/i);
        } else {
          expect(childShellState.status).toBe('completed');
        }
        const rootResult = fixture.run([
          'session', 'export', rootSession, '--sanitize', '--standalone',
        ]);
        expect(rootResult.status, rootResult.stderr).toBe(0);
        const rootInfo = (JSON.parse(rootResult.stdout) as { info: Record<string, any> }).info;
        expect(rootInfo.agent).toBe('kiki-orchestrator');
        expect(rootInfo.parentID).toBeUndefined();

        const parentBodies = provider.bodies().slice(bodyStart).filter(body => body.model === 'fixture-orch');
        const outcomeMessages = parentBodies.filter(body =>
          body.messages.some(message => /<subagent|permission|child/i.test(JSON.stringify(message))));
        expect(outcomeMessages.length, 'parent resumes after the child outcome').toBeGreaterThan(0);
        console.info(`[subagent-permission] decision=${decision} root=${rootSession} child=${child!.sessionID} ask=${ask.id} marker=${decision === 'once' ? 'present-once' : 'absent'}`);
      };

      await runCase('reject');
      await runCase('once');
    } finally {
      await provider.stop();
      await fixture.cleanup();
    }
  }, 240_000);
});
