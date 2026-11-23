import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import {
  chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../../src/cli/config';
import { baselineAgents, type PermissionRule } from '../../src/cli/opencode-config';
import {
  createOC2Fixture,
  observedOC2Version,
  requireOC2Binary,
  type OC2Fixture,
} from '../helpers/oc2-fixture';
import {
  fixtureProviderConfig,
  startFixtureProvider,
  type FixtureMessage,
  type FixtureProvider,
  type FixtureReply,
  type FixtureRequest,
} from './fixtures/oc2-provider';

/**
 * Task 1 gate for the security-boundaries plan. These tests probe an available
 * OpenCode 2.x runtime in an isolated HOME/XDG fixture, with a loopback
 * provider, PATH-shimmed local stubs and a local bare remote only. No real
 * hosting CLI, credential or network write is used.
 *
 * `security_shape_precedence` intentionally asserts the *proposed* generated
 * policy as soft expectations. Before Task 2 that exposes today's
 * `allow shell *` implementer and the orchestrator's missing permissions block,
 * so the test is expected to be RED on those policy assertions while the
 * measured runtime assertions run and pass. This file must never report a pass
 * when the binary is missing, a scenario is skipped, or only the unit matcher
 * ran.
 */

const RUN_TIMEOUT = 60_000;
const COUNTER_NAMES = ['safe', 'net', 'payload', 'ssh', 'curl', 'deploy', 'git-status', 'git-push'];

type Decision = 'executed' | 'ask-rejected' | 'tool-removed' | 'scanner-error' | 'rejected-other' | 'no-tool-event';

interface Observation {
  decision: Decision;
  status: number | null;
  stderr: string;
  toolError: string;
}

interface Stubs {
  bin: string;
  counters: string;
}

interface ProbeConfig {
  agentSettings: Record<string, unknown>;
  globalPermissions?: PermissionRule[];
  projectPermissions?: PermissionRule[];
  ancestorPermissions?: PermissionRule[];
  plugins?: string[];
}

interface ReplyPlugin {
  dir: string;
  askedFile: string;
}

const ask: PermissionRule = { action: 'shell', resource: '*', effect: 'ask' };
const allowAll: PermissionRule = { action: 'shell', resource: '*', effect: 'allow' };
const denyAll: PermissionRule = { action: 'shell', resource: '*', effect: 'deny' };
const allowExact = (resource: string): PermissionRule => ({ action: 'shell', resource, effect: 'allow' });

const ROLES = [
  'kiki-orchestrator',
  'kiki-brainstormer',
  'kiki-planner',
  'kiki-implementer',
  'kiki-gui-designer',
  'kiki-reviewer',
  'kiki-escalation',
  'kiki-historian',
];

const ROUTE_RESEARCH = new Set(['kiki-brainstormer', 'kiki-planner']);
const ROUTE_EXTERNAL_DIRECTORY = new Set([
  'kiki-implementer',
  'kiki-gui-designer',
  'kiki-reviewer',
  'kiki-escalation',
]);
const ROUTE_MCP_SERVER = fileURLToPath(new URL('./fixtures/oc2-mcp-server.mjs', import.meta.url));

function gate(): { binary: string; version: string } {
  // Missing, relative, V1, malformed and future-major binaries throw here.
  const binary = requireOC2Binary();
  const version = observedOC2Version(binary);
  if (!version) throw new Error('The OC2 harness did not record the observed version.');
  expect(version, 'observed OpenCode version').toMatch(/^2\.\d+\.\d+$/);
  return { binary, version };
}

function cleanStderr(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, '').trim();
}

function observe(result: { status: number | null; stdout: string; stderr: string }): Observation {
  const line = result.stdout.split(/\r?\n/).find(entry => entry.includes('"type":"tool"'));
  if (!line) {
    return {
      decision: result.status !== 0 ? 'rejected-other' : 'no-tool-event',
      status: result.status,
      stderr: cleanStderr(result.stderr),
      toolError: '',
    };
  }
  const event = JSON.parse(line) as { part?: { state?: { status?: string; error?: unknown } } };
  const state = event.part?.state ?? {};
  const toolError = String(state.error ?? '');
  const decision: Decision = state.status === 'completed'
    ? 'executed'
    : /Portable shell scanner cannot analyze command/.test(toolError)
      ? 'scanner-error'
      : /cannot ask the user for permission/.test(toolError)
        ? 'ask-rejected'
        : /No tool named .* is currently available/.test(toolError)
          ? 'tool-removed'
          : 'rejected-other';
  return { decision, status: result.status, stderr: cleanStderr(result.stderr), toolError };
}

function record(entry: Record<string, unknown>): void {
  // Machine-readable evidence for the probe document; no external sink.
  console.info(`[security-boundary-probe] ${JSON.stringify(entry)}`);
}

function installStubs(root: string): Stubs {
  const counters = join(root, 'probe-counters');
  const bin = join(root, 'probe-bin');
  mkdirSync(counters, { recursive: true });
  mkdirSync(bin, { recursive: true });
  for (const name of ['safe', 'net', 'payload', 'ssh', 'curl', 'deploy']) {
    const file = join(bin, `stub-${name}`);
    writeFileSync(file, `#!/bin/sh\nprintf '%s\\n' "${name}" >> "$COUNTER_DIR/${name}"\n`);
    chmodSync(file, 0o755);
  }
  // A local git stub records read status and refuses every push, so even a
  // runtime regression cannot write to the local bare remote.
  const git = join(bin, 'git');
  writeFileSync(git, [
    '#!/bin/sh',
    'case "$1" in',
    '  status) printf "%s\\n" status >> "$COUNTER_DIR/git-status"; exit 0 ;;',
    '  push) printf "%s\\n" push >> "$COUNTER_DIR/git-push"; echo REFUSED; exit 1 ;;',
    '  *) exit 0 ;;',
    'esac',
    '',
  ].join('\n'));
  chmodSync(git, 0o755);
  return { bin, counters };
}

function count(counters: string, name: string): number {
  const file = join(counters, name);
  if (!existsSync(file)) return 0;
  return readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).length;
}

function resetCounters(stubs: Stubs): void {
  for (const name of COUNTER_NAMES) rmSync(join(stubs.counters, name), { force: true });
}

interface PersistedMatch {
  path: string;
  content: string;
}

/**
 * Locate a persisted grant inside the disposable fixture. The scan is local and
 * size-capped; probe-generated evidence files and the reply plugin are skipped
 * so only runtime state can match. Binary stores are reported by path with the
 * content marked as a binary match rather than decoded.
 */
function findPersistedGrant(root: string, needle: string): PersistedMatch[] {
  const matches: PersistedMatch[] = [];
  const walk = (directory: string): void => {
    for (const name of readdirSync(directory)) {
      const file = join(directory, name);
      const info = statSync(file);
      if (info.isDirectory()) {
        if (name === 'probe-reply-plugin' || name === 'probe-counters' || name === 'probe-bin') continue;
        walk(file);
        continue;
      }
      if (name.startsWith('probe-reply-evidence')) continue;
      if (info.size > 2 * 1024 * 1024) continue;
      const bytes = readFileSync(file);
      if (!bytes.includes(Buffer.from(needle))) continue;
      const text = bytes.toString('utf8');
      const printable = /^[\t\n\r\x20-\x7e]*$/.test(text);
      matches.push({
        path: file.slice(root.length + 1),
        content: printable ? text : '<binary match>',
      });
    }
  };
  walk(root);
  return matches;
}

/** Keep the permission.asked sample but drop volatile correlation identifiers. */
function redactAsked(payload: Record<string, unknown>): Record<string, unknown> {
  const source = payload.source;
  return {
    ...payload,
    ...(typeof payload.sessionID === 'string' ? { sessionID: '<redacted-session>' } : {}),
    ...(typeof payload.id === 'string' ? { id: '<redacted-request>' } : {}),
    ...(source && typeof source === 'object'
      ? {
        source: {
          ...(source as Record<string, unknown>),
          ...(typeof (source as Record<string, unknown>).messageID === 'string'
            ? { messageID: '<redacted-message>' }
            : {}),
        },
      }
      : {}),
  };
}

/**
 * Read the disposable permission store without mutating it. Rows containing the
 * granted resource are returned by table so Task 4 can correlate the persisted
 * grant. Any failure is reported as PENDING instead of inferred.
 */
async function inspectPermissionStore(file: string): Promise<unknown> {
  let sqlite: any;
  try {
    sqlite = await import('node:sqlite');
  } catch (error) {
    return `PENDING: node:sqlite unavailable (${String(error)})`;
  }
  try {
    const db = new sqlite.DatabaseSync(file, { readOnly: true });
    try {
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      ).all() as Array<{ name: string }>;
      const hits: Array<{ table: string; row: Record<string, unknown> }> = [];
      for (const table of tables) {
        let rows: Array<Record<string, unknown>> = [];
        try {
          rows = db.prepare(`SELECT * FROM "${table.name}"`).all() as Array<Record<string, unknown>>;
        } catch {
          continue;
        }
        for (const row of rows) {
          if (JSON.stringify(row).includes('stub-safe') && hits.length < 10) {
            hits.push({ table: table.name, row });
          }
        }
      }
      return { tables: tables.map(table => table.name), hits };
    } finally {
      db.close();
    }
  } catch (error) {
    return `PENDING: store could not be read (${String(error)})`;
  }
}

function commandResponder(command: string) {
  return (request: FixtureRequest): FixtureReply => {
    if (request.model === 'fixture-title') return { type: 'text', text: 'Security boundary probe' };
    if (request.messages.some(message => message.role === 'tool')) {
      return { type: 'text', text: 'Probe complete.' };
    }
    return {
      type: 'tool-calls',
      calls: [{ name: 'bash', arguments: { command, description: 'security boundary probe' } }],
    };
  };
}

function writeProbeConfig(
  fixture: OC2Fixture,
  provider: FixtureProvider,
  config: ProbeConfig,
): void {
  const global: Record<string, unknown> = {
    $schema: 'https://opencode.ai/config.json',
    ...(config.globalPermissions ? { permissions: config.globalPermissions } : {}),
    ...(config.plugins ? { plugins: config.plugins } : {}),
    providers: fixtureProviderConfig(provider.baseURL, {
      'fixture-probe': 'Security Probe',
      'fixture-title': 'Title',
    }),
    agents: {
      title: { model: { providerID: 'kiki-fixture', model: 'fixture-title' } },
      'security-probe': {
        mode: 'primary',
        description: 'security boundary probe',
        model: { providerID: 'kiki-fixture', model: 'fixture-probe' },
        ...config.agentSettings,
      },
    },
  };
  fixture.writeGlobal(global);
  if (config.projectPermissions) {
    writeFileSync(
      join(fixture.project, 'opencode.jsonc'),
      `${JSON.stringify({ permissions: config.projectPermissions }, null, 2)}\n`,
    );
  }
  if (config.ancestorPermissions) {
    writeFileSync(
      join(fixture.root, 'opencode.jsonc'),
      `${JSON.stringify({ permissions: config.ancestorPermissions }, null, 2)}\n`,
    );
  }
}

async function runProbe(
  fixture: OC2Fixture,
  provider: FixtureProvider,
  stubs: Stubs,
  command: string,
  options: { auto?: boolean } = {},
): Promise<Observation> {
  provider.script(commandResponder(command));
  const args = ['run', '--standalone'];
  if (options.auto) args.push('--auto');
  args.push('--format', 'json', '--agent', 'security-probe', 'Run the security boundary probe');
  const result = await fixture.runAsync(args, {
    timeout: RUN_TIMEOUT,
    extraEnv: {
      PATH: `${stubs.bin}:${fixture.env.PATH ?? ''}`,
      COUNTER_DIR: stubs.counters,
    },
  });
  return observe(result);
}

function writeReplyPlugin(root: string, decision: 'once' | 'always' | 'reject'): ReplyPlugin {
  const dir = join(root, 'probe-reply-plugin');
  const evidence = join(root, 'probe-reply-evidence');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: 'kiki-security-reply-probe',
    version: '1.0.0',
    type: 'module',
    main: 'index.mjs',
  }));
  writeFileSync(join(dir, 'index.mjs'), [
    "import { writeFileSync } from 'node:fs';",
    'export default {',
    "  id: 'kiki-security-reply-probe',",
    '  setup: async (ctx) => {',
    '    const loop = async () => {',
    '      for await (const event of ctx.event.subscribe()) {',
    "        if (event.type !== 'permission.asked') continue;",
    `        writeFileSync(${JSON.stringify(`${evidence}.asked`)}, JSON.stringify(event.data));`,
    '        try {',
    '          await ctx.permission.reply({',
    '            sessionID: event.data.sessionID,',
    '            requestID: event.data.id,',
    `            decision: '${decision}',`,
    '          });',
    `          writeFileSync(${JSON.stringify(`${evidence}.replied`)}, 'replied');`,
    '        } catch (error) {',
    `          writeFileSync(${JSON.stringify(`${evidence}.error`)}, String(error));`,
    '        }',
    '      }',
    '    };',
    '    void loop();',
    '  },',
    '};',
    '',
  ].join('\n'));
  return { dir, askedFile: `${evidence}.asked` };
}

function generatedPermissions(role: string): PermissionRule[] {
  const settings = baselineAgents(DEFAULT_CONFIG)[role].settings as Record<string, unknown>;
  return Array.isArray(settings.permissions) ? settings.permissions as PermissionRule[] : [];
}

function routeResponder(toolName: string, args: Record<string, unknown>) {
  return (request: FixtureRequest): FixtureReply => {
    if (request.model === 'fixture-title') return { type: 'text', text: 'Security route probe' };
    if (request.model === 'fixture-child') return { type: 'text', text: 'child done' };
    if (request.messages.some(message => message.role === 'tool')) {
      return { type: 'text', text: 'Route probe complete.' };
    }
    return { type: 'tool-calls', calls: [{ name: toolName, arguments: args }] };
  };
}

interface RouteObservation {
  exitStatus: number | null;
  toolStatus?: string;
  error: string;
  output: string;
}

interface SubagentReport {
  sessionID: string;
  state: string;
  description: string;
  body: string;
}

const SUBAGENT_MESSAGE = /<subagent\b([^>]*)>([\s\S]*?)<\/subagent>/g;

function attribute(attributes: string, name: string): string | undefined {
  return attributes.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];
}

/**
 * OpenCode 2.x always dispatches subagents in the background: the `subagent`
 * tool result is only a launch notice. When the child goes idle, the runtime
 * injects a synthetic `<subagent ... state="completed">child output</subagent>`
 * user message into the parent session. That message, bound to the launched
 * child session, is the terminal-result evidence. Launch notices, running /
 * pending / error / cancelled states, echoed task text and the parent's own
 * replies are deliberately not accepted.
 */
function completedSubagentReport(
  bodies: FixtureRequest[],
  sessionID: string,
  description: string,
): SubagentReport | undefined {
  for (const request of [...bodies].reverse()) {
    if (request.model !== 'fixture-probe') continue;
    for (const message of request.messages) {
      if (message.role !== 'user' || typeof message.content !== 'string') continue;
      for (const match of message.content.matchAll(SUBAGENT_MESSAGE)) {
        const attributes = match[1] ?? '';
        if (
          attribute(attributes, 'sessionID') !== sessionID
          || attribute(attributes, 'state') !== 'completed'
          || attribute(attributes, 'description') !== description
        ) continue;
        const body = match[2].trim();
        if (!body) continue;
        return { sessionID, state: 'completed', description, body };
      }
    }
  }
  return undefined;
}

async function routeRun(
  fixture: OC2Fixture,
  provider: FixtureProvider,
  toolName: string,
  args: Record<string, unknown>,
  agent = 'security-probe',
): Promise<RouteObservation> {
  provider.script(routeResponder(toolName, args));
  const result = await fixture.runAsync(
    ['run', '--standalone', '--format', 'json', '--agent', agent, 'Run the route probe'],
    { timeout: RUN_TIMEOUT },
  );
  const line = result.stdout.split(/\r?\n/).find(entry => entry.includes('"type":"tool"'));
  if (!line) {
    return {
      exitStatus: result.status,
      error: cleanStderr(result.stderr),
      output: '',
    };
  }
  const event = JSON.parse(line) as {
    part?: { state?: { status?: string; error?: unknown; output?: unknown } };
  };
  const state = event.part?.state ?? {};
  return {
    exitStatus: result.status,
    toolStatus: state.status,
    error: String(state.error ?? ''),
    output: String(state.output ?? ''),
  };
}

function writeRouteConfig(
  fixture: OC2Fixture,
  provider: FixtureProvider,
  permissions: PermissionRule[],
  counterFile: string,
): void {
  const skillDirectory = join(fixture.config, 'skills', 'probe-skill');
  mkdirSync(skillDirectory, { recursive: true });
  writeFileSync(
    join(skillDirectory, 'SKILL.md'),
    '---\nname: probe-skill\ndescription: route probe skill\n---\nPROBE SKILL BODY\n',
  );
  const childAgent = {
    mode: 'subagent',
    description: 'route probe child',
    model: { providerID: 'kiki-fixture', model: 'fixture-child' },
    permissions: [{ action: '*', resource: '*', effect: 'allow' }],
  };
  fixture.writeGlobal({
    $schema: 'https://opencode.ai/config.json',
    providers: fixtureProviderConfig(provider.baseURL, {
      'fixture-probe': 'Security Route Probe',
      'fixture-title': 'Title',
      'fixture-child': 'Child',
    }),
    mcp: {
      servers: {
        probe: {
          type: 'local',
          command: [process.execPath, ROUTE_MCP_SERVER],
          codemode: false,
          environment: { PROBE_COUNTER: counterFile },
        },
      },
    },
    agents: {
      title: { model: { providerID: 'kiki-fixture', model: 'fixture-title' } },
      'kiki-reviewer': childAgent,
      'other-agent': childAgent,
      'mcp-control': {
        mode: 'primary',
        description: 'MCP positive control',
        model: { providerID: 'kiki-fixture', model: 'fixture-probe' },
        permissions: [{ action: 'probe_*', resource: '*', effect: 'allow' }],
      },
      // Proves `*_*` also catches the underscore-bearing external_directory
      // action, and that a later external_directory allow restores access.
      'external-deny-control': {
        mode: 'primary',
        description: 'external directory negative control',
        model: { providerID: 'kiki-fixture', model: 'fixture-probe' },
        permissions: [
          { action: 'read', resource: '*', effect: 'allow' },
          { action: '*_*', resource: '*', effect: 'deny' },
        ],
      },
      'external-control': {
        mode: 'primary',
        description: 'external directory positive control',
        model: { providerID: 'kiki-fixture', model: 'fixture-probe' },
        permissions: [
          { action: 'read', resource: '*', effect: 'allow' },
          { action: '*_*', resource: '*', effect: 'deny' },
          { action: 'external_directory', resource: '*', effect: 'allow' },
        ],
      },
      'security-probe': {
        mode: 'primary',
        description: 'security route probe',
        model: { providerID: 'kiki-fixture', model: 'fixture-probe' },
        permissions,
      },
    },
  });
}

function counterFileCount(file: string): number {
  if (!existsSync(file)) return 0;
  return readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).length;
}

describe('OpenCode 2.x security boundaries', () => {
  it('security_gate_rejects_unsafe_execution', async () => {
    const { binary, version } = gate();
    const fixture = createOC2Fixture(binary);
    const stubs = installStubs(fixture.root);
    const provider = await startFixtureProvider();
    try {
      const bare = join(fixture.root, 'remote.git');
      execFileSync('git', ['init', '--bare', bare], { stdio: 'ignore' });
      execFileSync('git', ['init'], { cwd: fixture.project, stdio: 'ignore' });
      writeProbeConfig(fixture, provider, {
        agentSettings: { permissions: [ask, allowExact('stub-safe')] },
      });

      // Positive control: the same execution path must work when allowed, so
      // the zero counters below are not vacuous.
      const control = await runProbe(fixture, provider, stubs, 'stub-safe');
      expect(control.decision, 'allowed exact command').toBe('executed');
      expect(count(stubs.counters, 'safe'), 'allowed exact command count').toBe(1);
      record({
        scenario: 'gate/allowed-control',
        version,
        configuration: 'V2 permissions: ask shell *; allow shell stub-safe',
        decision: control.decision,
        stubCount: count(stubs.counters, 'safe'),
      });

      const rejected: Array<{ command: string; counter: string }> = [
        { command: 'stub-net', counter: 'net' },
        { command: 'stub-ssh', counter: 'ssh' },
        { command: 'stub-curl', counter: 'curl' },
        { command: 'stub-deploy', counter: 'deploy' },
        { command: `git push ${bare} HEAD:refs/heads/main`, counter: 'git-push' },
      ];
      for (const entry of rejected) {
        const observation = await runProbe(fixture, provider, stubs, entry.command);
        expect(observation.decision, entry.command).toBe('ask-rejected');
        expect(observation.stderr, entry.command).toMatch(/permission requested.*auto-rejecting/);
        expect(observation.toolError, entry.command).toMatch(/cannot ask the user for permission/);
        record({
          scenario: `gate/${entry.command}`,
          version,
          configuration: 'V2 permissions: ask shell *; allow shell stub-safe',
          decision: observation.decision,
          stubCount: count(stubs.counters, entry.counter),
        });
      }

      for (const counter of ['net', 'ssh', 'curl', 'deploy', 'git-push']) {
        expect(count(stubs.counters, counter), `${counter} write counter`).toBe(0);
      }
      expect(count(stubs.counters, 'safe'), 'positive control remains the only execution').toBe(1);
      expect(
        execFileSync('git', ['--git-dir', bare, 'for-each-ref']).toString().trim(),
        'local bare remote refs',
      ).toBe('');
    } finally {
      await provider.stop();
      await fixture.cleanup();
    }
  }, 180_000);

  it('security_shape_precedence', async () => {
    const { binary, version } = gate();

    const cases: Array<{
      name: string;
      config: ProbeConfig;
      auto?: boolean;
      expected: Decision;
      note: string;
    }> = [
      { name: 'v2-agent-allow', config: { agentSettings: { permissions: [allowAll] } }, expected: 'executed', note: 'V2 permissions.shell allow is enforced' },
      { name: 'v2-agent-ask', config: { agentSettings: { permissions: [ask] } }, expected: 'ask-rejected', note: 'V2 permissions.shell ask is enforced' },
      { name: 'v2-agent-deny-auto', config: { agentSettings: { permissions: [denyAll] } }, auto: true, expected: 'tool-removed', note: 'deny removes the tool even with --auto' },
      { name: 'v1-agent-bash-allow', config: { agentSettings: { permission: { bash: 'allow' } } }, expected: 'executed', note: 'V1 permission.bash allow is ignored on OC2' },
      { name: 'v1-agent-bash-ask', config: { agentSettings: { permission: { bash: 'ask' } } }, expected: 'executed', note: 'V1 permission.bash ask is ignored on OC2' },
      { name: 'v1-agent-bash-deny-auto', config: { agentSettings: { permission: { bash: 'deny' } } }, auto: true, expected: 'executed', note: 'V1 permission.bash deny is ignored on OC2' },
      { name: 'global-ask-agent-allow', config: { globalPermissions: [ask], agentSettings: { permissions: [allowAll] } }, expected: 'executed', note: 'agent rules win over global top-level' },
      { name: 'global-allow-agent-ask', config: { globalPermissions: [allowAll], agentSettings: { permissions: [ask] } }, expected: 'ask-rejected', note: 'agent rules win over global top-level' },
      { name: 'project-ask-global-allow', config: { globalPermissions: [allowAll], projectPermissions: [ask], agentSettings: {} }, expected: 'ask-rejected', note: 'project top-level wins over global top-level' },
      { name: 'project-allow-global-ask', config: { globalPermissions: [ask], projectPermissions: [allowAll], agentSettings: {} }, expected: 'executed', note: 'project top-level wins over global top-level' },
      // Ancestor isolation: with no project/agent override, an ancestor ask must
      // reject. If it executes, the ancestor config file was not read at all.
      { name: 'ancestor-ask-only', config: { ancestorPermissions: [ask], agentSettings: {} }, expected: 'ask-rejected', note: 'ancestor top-level alone is read and its ask is enforced' },
      // Direct ancestor-vs-global pair: both directions disambiguate whether the
      // ancestor level or the global level wins when no nearer config exists.
      { name: 'ancestor-ask-global-allow', config: { globalPermissions: [allowAll], ancestorPermissions: [ask], agentSettings: {} }, expected: 'ask-rejected', note: 'ancestor top-level wins over global top-level' },
      { name: 'ancestor-allow-global-ask', config: { globalPermissions: [ask], ancestorPermissions: [allowAll], agentSettings: {} }, expected: 'executed', note: 'ancestor top-level wins over global top-level' },
      { name: 'ancestor-ask-project-allow', config: { ancestorPermissions: [ask], projectPermissions: [allowAll], agentSettings: {} }, expected: 'executed', note: 'project decision observed over ancestor top-level' },
      { name: 'ancestor-allow-project-ask', config: { ancestorPermissions: [allowAll], projectPermissions: [ask], agentSettings: {} }, expected: 'ask-rejected', note: 'project decision observed over ancestor top-level' },
      { name: 'agent-ask-project-allow', config: { projectPermissions: [allowAll], agentSettings: { permissions: [ask] } }, expected: 'ask-rejected', note: 'agent rules win over project top-level' },
      { name: 'agent-allow-project-ask', config: { projectPermissions: [ask], agentSettings: { permissions: [allowAll] } }, expected: 'executed', note: 'agent rules win over project top-level' },
      { name: 'rules-ask-then-allow-prefix', config: { agentSettings: { permissions: [ask, allowExact('stub-safe*')] } }, expected: 'executed', note: 'last matching rule wins within a ruleset' },
      { name: 'rules-allow-prefix-then-ask', config: { agentSettings: { permissions: [allowExact('stub-safe*'), ask] } }, expected: 'ask-rejected', note: 'last matching rule wins within a ruleset' },
    ];

    for (const entry of cases) {
      const fixture = createOC2Fixture(binary);
      const stubs = installStubs(fixture.root);
      const provider = await startFixtureProvider();
      try {
        writeProbeConfig(fixture, provider, entry.config);
        const observation = await runProbe(fixture, provider, stubs, 'stub-safe', { auto: entry.auto });
        record({
          scenario: `shape/${entry.name}`,
          version,
          configuration: entry.note,
          decision: observation.decision,
          stubCount: count(stubs.counters, 'safe'),
        });
        expect(observation.decision, entry.name).toBe(entry.expected);
      } finally {
        await provider.stop();
        await fixture.cleanup();
      }
    }

    // Native approval replies through the local plugin API (not the TUI):
    // once executes only that run, always saves a project grant, reject stops.
    for (const decision of ['once', 'always', 'reject'] as const) {
      const fixture = createOC2Fixture(binary);
      const stubs = installStubs(fixture.root);
      const plugin = writeReplyPlugin(fixture.root, decision);
      const provider = await startFixtureProvider();
      try {
        const base: ProbeConfig = { agentSettings: { permissions: [ask] } };
        writeProbeConfig(fixture, provider, { ...base, plugins: [plugin.dir] });
        const first = await runProbe(fixture, provider, stubs, 'stub-safe');
        if (decision === 'reject') {
          expect(first.decision, 'reject tool decision').toBe('rejected-other');
          expect(first.status, 'reject exit status').not.toBe(0);
          expect(first.toolError, 'reject reason').toMatch(/declined/i);
          expect(count(stubs.counters, 'safe'), 'reject stub count').toBe(0);
        } else {
          expect(first.decision, `${decision} first run`).toBe('executed');
          expect(count(stubs.counters, 'safe'), `${decision} first stub count`).toBe(1);
        }
        const askedPayload = JSON.parse(readFileSync(plugin.askedFile, 'utf8')) as Record<string, unknown>;
        const asked = askedPayload as {
          action?: string;
          resources?: string[];
          save?: string[];
        };
        expect(asked.action, 'asked action').toBe('shell');
        expect(asked.resources, 'asked resources').toEqual(['stub-safe']);
        expect(asked.save, 'proposed saved pattern').toEqual(['stub-safe *']);
        // Retain one full permission.asked payload for Task 4 correlation;
        // volatile session/request identifiers are redacted.
        record({
          scenario: `saved-grant/${decision}/permission-asked`,
          version,
          payload: redactAsked(askedPayload),
        });

        resetCounters(stubs);
        writeProbeConfig(fixture, provider, base);
        const second = await runProbe(fixture, provider, stubs, 'stub-safe');
        if (decision === 'always') {
          expect(second.decision, 'saved always grant').toBe('executed');
          expect(count(stubs.counters, 'safe'), 'saved always stub count').toBe(1);
          expect(second.stderr, 'saved always should not ask').not.toMatch(/permission requested/);
        } else {
          expect(second.decision, `${decision} second run`).toBe('ask-rejected');
          expect(count(stubs.counters, 'safe'), `${decision} second stub count`).toBe(0);
        }
        const persisted = decision === 'always' ? findPersistedGrant(fixture.root, 'stub-safe') : [];
        const persistedEvidence: Array<Record<string, unknown>> = [];
        for (const match of persisted) {
          const evidence: Record<string, unknown> = { ...match };
          if (/\.(db|sqlite|sqlite3)$/i.test(match.path)) {
            const store = await inspectPermissionStore(join(fixture.root, match.path));
            evidence.store = store;
            const hits = typeof store === 'object' && store !== null
              ? (store as { hits?: Array<{ table: string; row: Record<string, unknown> }> }).hits
              : undefined;
            const permissionRow = hits?.find(hit => hit.table === 'permission')?.row;
            const sessionMessageIds = (hits ?? [])
              .filter(hit => hit.table === 'session_message')
              .map(hit => hit.row.id);
            const sourceMessageId = (askedPayload.source as Record<string, unknown> | undefined)?.messageID;
            // Correlate without echoing the volatile identifiers themselves.
            evidence.correlation = permissionRow
              ? {
                requestIdMatchesPersistedId: permissionRow.id === askedPayload.id,
                sourceMessageIdMatchesSessionMessageId: typeof sourceMessageId === 'string'
                  && sessionMessageIds.includes(sourceMessageId),
                persistedAction: permissionRow.action,
                persistedResource: permissionRow.resource,
              }
              : 'PENDING: no permission row observed';
          }
          persistedEvidence.push(evidence);
        }
        record({
          scenario: `saved-grant/${decision}`,
          version,
          configuration: `ask shell *; native reply ${decision}; second run without plugin`,
          decision: second.decision,
          stubCount: count(stubs.counters, 'safe'),
          savedPattern: asked.save,
          // Only the durable `always` grant is expected to persist. An empty
          // scan is reported as PENDING rather than inferred from behavior.
          persistedGrant: decision === 'always'
            ? (persistedEvidence.length ? persistedEvidence : 'PENDING: not observed in fixture')
            : 'not applicable',
        });
      } finally {
        await provider.stop();
        await fixture.cleanup();
      }
    }

    // Applied lean policy: routine local work runs without a prompt, only the
    // two permission-mutation asks and a real per-role push ask remain, and no
    // force-push deny or route rule is generated.
    for (const role of ROLES) {
      const rules = generatedPermissions(role);
      const shell = rules.filter(rule => rule.action === 'shell');
      expect.soft(shell[0], `${role}: routine local work is allowed`).toEqual(allowAll);
      expect.soft(
        shell.some(rule => rule.resource === '*' && rule.effect === 'ask'),
        `${role}: no blanket shell ask`,
      ).toBe(false);
      expect.soft(
        shell.filter(rule => rule.effect === 'ask').map(rule => rule.resource),
        `${role}: lean asks`,
      ).toEqual(['kiki permissions add *', 'kiki permissions remove *', 'git push *']);
      expect.soft(
        shell[shell.length - 1],
        `${role}: final push ask stays last`,
      ).toEqual({ action: 'shell', resource: 'git push *', effect: 'ask' });
      expect.soft(shell.some(rule => rule.effect === 'deny'), `${role}: no shell denies`).toBe(false);
      expect.soft(rules.some(rule => rule.action === 'read'), `${role}: no read grants`).toBe(false);
      expect.soft(
        rules.some(rule => ['execute', 'webfetch', 'websearch', 'skill', 'subagent', '*_*']
          .includes(rule.action)),
        `${role}: no route rules`,
      ).toBe(false);
      const settings = baselineAgents(DEFAULT_CONFIG)[role].settings as Record<string, unknown>;
      expect.soft(settings.permission, `${role}: generated V1 permission block`).toBeUndefined();
    }
    expect.soft(
      Array.isArray((baselineAgents(DEFAULT_CONFIG)['kiki-orchestrator'].settings as Record<string, unknown>).permissions),
      'orchestrator: primary permissions block',
    ).toBe(true);
  }, 300_000);

  it('security_scanner_does_not_execute_hidden_network', async () => {
    const { binary, version } = gate();
    const fixture = createOC2Fixture(binary);
    const stubs = installStubs(fixture.root);
    const provider = await startFixtureProvider();
    try {
      const bare = join(fixture.root, 'remote.git');
      execFileSync('git', ['init', '--bare', bare], { stdio: 'ignore' });
      execFileSync('git', ['init'], { cwd: fixture.project, stdio: 'ignore' });
      writeProbeConfig(fixture, provider, {
        agentSettings: {
          permissions: [ask, allowExact('stub-safe'), allowExact('git status --short')],
        },
      });

      const rejected: Array<{
        name: string;
        command: string;
        decision: 'ask-rejected' | 'scanner-error';
        counters: string[];
        scannerReason?: RegExp;
      }> = [
        { name: 'compound-and', command: 'stub-safe && stub-net', decision: 'ask-rejected', counters: ['safe', 'net'] },
        { name: 'compound-semicolon', command: 'stub-safe; stub-net', decision: 'ask-rejected', counters: ['safe', 'net'] },
        { name: 'substitution', command: 'stub-safe $(stub-payload)', decision: 'ask-rejected', counters: ['safe', 'payload'] },
        { name: 'backticks', command: 'stub-safe `stub-net`', decision: 'ask-rejected', counters: ['safe', 'net'] },
        { name: 'eval', command: 'eval stub-net', decision: 'ask-rejected', counters: ['net'] },
        { name: 'redirect', command: 'stub-safe > redir.txt', decision: 'ask-rejected', counters: ['safe'] },
        { name: 'interpreter-wrapper', command: "sh -c 'stub-net'", decision: 'ask-rejected', counters: ['net'] },
        { name: 'extra-arguments', command: 'stub-safe --extra', decision: 'ask-rejected', counters: ['safe'] },
        { name: 'git-compound-push', command: `git status --short && git push ${bare} HEAD:refs/heads/main`, decision: 'ask-rejected', counters: ['git-push'] },
        // OpenCode 2.4.1 routes every malformed-structure command below (and an
        // unterminated quote) to the permission ask path instead of the scanner
        // error path; the headless run still auto-rejects each ask, so execution
        // stays prevented (counters 0, no redirect file, bare remote untouched).
        // The scanner-error branch and its reason assertions are kept as a
        // defensive expectation in case a later 2.x binary restores that path.
        { name: 'scanner-unterminated-quote', command: 'stub-safe "', decision: 'ask-rejected', counters: ['safe'] },
        { name: 'scanner-trailing-and', command: 'stub-safe &&', decision: 'ask-rejected', counters: ['safe'] },
        { name: 'scanner-trailing-pipe', command: 'stub-safe |', decision: 'ask-rejected', counters: ['safe'] },
        { name: 'scanner-command-substitution', command: 'stub-safe $(', decision: 'ask-rejected', counters: ['safe'] },
      ];

      for (const entry of rejected) {
        resetCounters(stubs);
        rmSync(join(fixture.project, 'redir.txt'), { force: true });
        const observation = await runProbe(fixture, provider, stubs, entry.command);
        expect(observation.decision, entry.name).toBe(entry.decision);
        if (entry.decision === 'ask-rejected') {
          expect(observation.stderr, entry.name).toMatch(/permission requested.*auto-rejecting/);
          expect(observation.toolError, entry.name).toMatch(/cannot ask the user for permission/);
        } else {
          expect(observation.toolError, entry.name).toMatch(/Portable shell scanner cannot analyze command/);
          expect(observation.toolError, entry.name).toMatch(entry.scannerReason!);
        }
        for (const counter of entry.counters) {
          expect(count(stubs.counters, counter), `${entry.name}: ${counter} write counter`).toBe(0);
        }
        if (entry.name === 'redirect') {
          expect(existsSync(join(fixture.project, 'redir.txt')), 'redirect target').toBe(false);
        }
        record({
          scenario: `scanner/${entry.name}`,
          version,
          configuration: 'V2 permissions: ask shell *; allow exact stub-safe; allow exact git status --short',
          decision: observation.decision,
          stubCount: Object.fromEntries(entry.counters.map(counter => [counter, count(stubs.counters, counter)])),
        });
      }
      expect(
        execFileSync('git', ['--git-dir', bare, 'for-each-ref']).toString().trim(),
        'local bare remote refs after rejected push',
      ).toBe('');

      // Positive controls: --auto is the headless auto-approval path. It proves
      // the rejected scenarios above would execute if the ask gate were absent.
      const controls: Array<{ name: string; command: string; expected: Record<string, number> }> = [
        { name: 'auto-compound', command: 'stub-safe && stub-net', expected: { safe: 1, net: 1 } },
        { name: 'auto-substitution', command: 'stub-safe $(stub-safe)', expected: { safe: 2 } },
        { name: 'auto-git-push-wrapper', command: `git status --short; git push ${bare} HEAD:refs/heads/main`, expected: { 'git-push': 1 } },
      ];
      for (const control of controls) {
        resetCounters(stubs);
        const observation = await runProbe(fixture, provider, stubs, control.command, { auto: true });
        expect(observation.decision, control.name).toBe('executed');
        for (const [counter, expected] of Object.entries(control.expected)) {
          expect(count(stubs.counters, counter), `${control.name}: ${counter}`).toBe(expected);
        }
        expect(
          execFileSync('git', ['--git-dir', bare, 'for-each-ref']).toString().trim(),
          `${control.name}: bare remote stays untouched`,
        ).toBe('');
        record({
          scenario: `scanner-control/${control.name}`,
          version,
          configuration: 'V2 permissions: ask shell *; allow exact stub-safe; --auto headless auto-approval',
          decision: observation.decision,
          stubCount: control.expected,
        });
      }
    } finally {
      await provider.stop();
      await fixture.cleanup();
    }
  }, 300_000);

  it('security_runtime_subagent_completion_evidence', () => {
    const sessionID = 'ses_fixturechild';
    const description = 'review route';
    const synthetic = (
      state: string,
      body: string,
      id = sessionID,
      label = description,
    ): string => `<subagent sessionID="${id}" state="${state}" description="${label}">\n${body}\n</subagent>`;
    const request = (...messages: FixtureMessage[]): FixtureRequest => ({
      model: 'fixture-probe',
      messages,
      body: {},
      url: '/v1/chat/completions',
    });
    const launchNotice = `The subagent is working in the background (sessionID: ${sessionID}). You will receive a <subagent> message when it goes idle, and again after each later round of work.`;

    expect(completedSubagentReport([], sessionID, description), 'no child evidence')
      .toBeUndefined();
    expect(
      completedSubagentReport([
        request(
          { role: 'user', content: 'review' },
          { role: 'tool', content: launchNotice },
          { role: 'assistant', content: 'child done' },
        ),
      ], sessionID, description),
      'launch notice, echoed task and parent reply are not completion',
    ).toBeUndefined();

    for (const state of ['running', 'pending', 'error', 'cancelled']) {
      expect(
        completedSubagentReport([
          request({ role: 'user', content: synthetic(state, 'child done') }),
        ], sessionID, description),
        `${state} child is not a terminal success`,
      ).toBeUndefined();
    }

    expect(
      completedSubagentReport([
        request({ role: 'user', content: synthetic('completed', 'child done', 'ses_other') }),
      ], sessionID, description),
      'completion must bind to the launched child session',
    ).toBeUndefined();
    expect(
      completedSubagentReport([
        request({ role: 'user', content: synthetic('completed', 'child done', sessionID, 'other route') }),
      ], sessionID, description),
      'completion must bind to the launched description',
    ).toBeUndefined();
    expect(
      completedSubagentReport([
        request({ role: 'user', content: synthetic('completed', '   ') }),
      ], sessionID, description),
      'completed child without output is not success',
    ).toBeUndefined();

    const completed = completedSubagentReport([
      request({ role: 'user', content: synthetic('completed', 'child done') }),
    ], sessionID, description);
    expect(completed, 'completed child with fixture output').toBeDefined();
    expect(completed!.state).toBe('completed');
    expect(completed!.body).toBe('child done');
  });

  it('security_runtime_routes_are_mechanically_open', async () => {
    const { binary, version } = gate();
    const routeActions = ['execute', 'webfetch', 'websearch', 'skill', 'subagent', '*_*', 'external_directory'];
    for (const role of ROLES) {
      const rules = generatedPermissions(role);
      expect(rules.some(rule => routeActions.includes(rule.action)), `${role}: no route rules`).toBe(false);
    }

    let webHits = 0;
    const webServer = createServer((_request, response) => {
      webHits += 1;
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('route-body');
    });
    await new Promise<void>(resolve => webServer.listen(0, '127.0.0.1', () => resolve()));
    const address = webServer.address();
    const webUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/route`;
    const fixture = createOC2Fixture(binary);
    const provider = await startFixtureProvider();
    try {
      const counterFile = join(fixture.root, 'route-mcp-counter');
      // One representative generated role proves the routes are mechanically
      // open; the per-role structural assertions above cover every role.
      writeRouteConfig(fixture, provider, generatedPermissions('kiki-implementer'), counterFile);

      const web = await routeRun(fixture, provider, 'webfetch', { url: webUrl });
      expect(web.toolStatus, 'webfetch is open without a route deny').toBe('completed');
      expect(webHits, 'loopback fetch hit').toBe(1);
      record({ scenario: 'route/open/webfetch', version, decision: web.toolStatus, hitCount: webHits });

      const mcp = await routeRun(fixture, provider, 'probe_echo', {});
      expect(mcp.toolStatus, 'MCP server tool is open').toBe('completed');
      expect(counterFileCount(counterFile), 'MCP tool executed').toBe(1);
      record({ scenario: 'route/open/mcp', version, decision: mcp.toolStatus, stubCount: 1 });

      const execute = await routeRun(fixture, provider, 'execute', { code: 'return 1' });
      expect(execute.toolStatus, 'Code Mode is not removed by a permission deny').not.toBe('error');
      record({ scenario: 'route/open/execute', version, decision: execute.toolStatus });

      const subagent = await routeRun(fixture, provider, 'subagent', {
        agent: 'kiki-reviewer', description: 'review route', prompt: 'review',
      });
      expect(subagent.exitStatus, 'delegation probe exit').toBe(0);
      expect(subagent.toolStatus, 'delegation is open for a non-primary role').toBe('completed');
      record({ scenario: 'route/open/subagent', version, decision: subagent.toolStatus });
    } finally {
      await provider.stop();
      await fixture.cleanup();
      await new Promise<void>(resolve => webServer.close(() => resolve()));
    }
  }, 180_000);

});
