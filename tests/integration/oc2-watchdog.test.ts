import { describe, expect, it } from 'vitest';
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createOC2Fixture, hasOC2Binary, readJSONC, readJsonLines, requireOC2Binary,
} from '../helpers/oc2-fixture';
import {
  fixtureProviderConfig, hasToolResult, startFixtureProvider, subagentCall,
} from './fixtures/oc2-provider';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const HEALTH_LOG = '.agentic/kiki/health_log.jsonl';
const ROUTING_LOG = '.agentic/kiki/routing_log.jsonl';

const HEALTH = {
  watchdogEnabled: true,
  stuckThresholdMs: 1_500,
  gracePeriodMs: 500,
  absoluteMaxMs: 15_000,
  checkIntervalMs: 200,
  loopRepeatCount: 3,
  watchAllSubagents: false,
  logPath: HEALTH_LOG,
};

function configureModels(
  fixture: ReturnType<typeof createOC2Fixture>,
  baseURL: string,
): void {
  const global = readJSONC(fixture.globalFile);
  global.providers = fixtureProviderConfig(baseURL, {
    'fixture-orch': 'Orchestrator',
    'fixture-child': 'Child',
    'fixture-title': 'Title',
  });
  global.agents = {
    ...(global.agents ?? {}),
    title: { model: { providerID: 'kiki-fixture', model: 'fixture-title' } },
    'kiki-orchestrator': {
      model: { providerID: 'kiki-fixture', model: 'fixture-orch' },
    },
    'kiki-implementer': {
      model: { providerID: 'kiki-fixture', model: 'fixture-child' },
    },
  };
  writeFileSync(fixture.globalFile, `${JSON.stringify(global, null, 2)}\n`);
}

function writeHealth(fixture: ReturnType<typeof createOC2Fixture>): void {
  mkdirSync(join(fixture.project, '.agentic/kiki'), { recursive: true });
  writeFileSync(join(fixture.project, '.agentic/kiki/config.json'), JSON.stringify({ health: HEALTH }));
}

function sessionIDs(stdout: string): { parent?: string; child?: string } {
  const parent = stdout.match(/ses_[A-Za-z0-9]+/)?.[0];
  let child: string | undefined;
  for (const line of stdout.split(/\r?\n/).filter(Boolean)) {
    let entry: any;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type !== 'tool_use') continue;
    const output = String(entry.part?.state?.output ?? '');
    const error = String(entry.part?.state?.error ?? '');
    const matches = `${output}\n${error}`.match(/ses_[A-Za-z0-9]+/g);
    if (matches?.length) {
      child = matches[matches.length - 1];
      break;
    }
  }
  return { parent, child };
}

function exportedSession(
  fixture: ReturnType<typeof createOC2Fixture>,
  session: string,
): Record<string, any> {
  const result = fixture.run(['session', 'export', session, '--sanitize', '--standalone']);
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate a fixture port.'));
        return;
      }
      const port = address.port;
      server.close(() => resolvePort(port));
    });
  });
}

function prepareRevision(root: string, name: string, marker?: string): string {
  const directory = join(root, name);
  cpSync(join(repoRoot, 'dist'), join(directory, 'dist'), { recursive: true });
  cpSync(join(repoRoot, 'package.json'), join(directory, 'package.json'));
  symlinkSync(join(repoRoot, 'node_modules'), join(directory, 'node_modules'), 'dir');
  if (marker) {
    const entry = join(directory, 'dist/server/index.js');
    renameSync(entry, join(directory, 'dist/server/index.original.js'));
    writeFileSync(entry, [
      "import base from './index.original.js';",
      "import { writeFileSync } from 'node:fs';",
      'export default {',
      '  id: base.id,',
      `  setup: async (ctx) => { writeFileSync(new URL('../../${marker}', import.meta.url), 'loaded'); return base.setup(ctx); },`,
      '};',
      '',
    ].join('\n'));
  }
  return directory;
}

describe.skipIf(!hasOC2Binary())('real OC2 watchdog against the packaged plugin', () => {
  it('interrupts a stuck foreground child through session.interrupt and records health', async () => {
    const fixture = createOC2Fixture(requireOC2Binary());
    const provider = await startFixtureProvider(request => {
      if (request.model === 'fixture-title') return { type: 'text', text: 'Watchdog fixture' };
      if (request.model === 'fixture-child') return { type: 'hold' };
      if (request.model === 'fixture-orch' && !hasToolResult(request)) {
        return subagentCall('kiki-implementer', 'Stuck foreground child', 'Hold the fixture stream.');
      }
      return { type: 'text', text: 'Parent recovered.' };
    });
    try {
      expect(fixture.runCli(['install']).status).toBe(0);
      configureModels(fixture, provider.baseURL);
      writeHealth(fixture);

      const result = await fixture.runAsync([
        'run', '--standalone', '--format', 'json', '--agent', 'kiki-orchestrator', 'Foreground watchdog',
      ]);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('Parent recovered.');
      expect(provider.heldAborted()).toBeGreaterThan(0);

      const ids = sessionIDs(result.stdout);
      expect(ids.parent).toBeDefined();
      expect(ids.child).toBeDefined();
      const child = exportedSession(fixture, ids.child!);
      expect(child.info.parentID).toBe(ids.parent);
      expect(child.info.agent).toBe('kiki-implementer');
      expect(child.info.outcome).toBe('interrupted');

      const health = readJsonLines(join(fixture.project, HEALTH_LOG));
      expect(health.map(entry => entry.event)).toEqual(
        expect.arrayContaining(['watchdog-quiet', 'watchdog-abort', 'watchdog-abort-ok']),
      );
      const abort = health.find(entry => entry.event === 'watchdog-abort');
      expect(abort.sessionId).toBe(ids.child);
      expect(abort.reason).toBe('stuck');
      expect(abort.agent).toBe('kiki-implementer');
      expect(health.find(entry => entry.event === 'watchdog-abort-ok').sessionId).toBe(ids.child);

      const routing = readJsonLines(join(fixture.project, ROUTING_LOG));
      expect(routing).toHaveLength(1);
      expect(routing[0].agent).toBe('kiki-implementer');
    } finally {
      await provider.stop();
      await fixture.cleanup();
    }
  }, 120_000);

  it('interrupts a held background child after the parent returns idle', async () => {
    const fixture = createOC2Fixture(requireOC2Binary());
    const provider = await startFixtureProvider(request => {
      if (request.model === 'fixture-title') return { type: 'text', text: 'Background watchdog' };
      if (request.model === 'fixture-child') return { type: 'hold' };
      if (request.model === 'fixture-orch' && !hasToolResult(request)) {
        return subagentCall(
          'kiki-implementer',
          'Held background child',
          'Hold the background fixture stream.',
          { background: true },
        );
      }
      return { type: 'text', text: 'Parent returned idle.' };
    });
    try {
      expect(fixture.runCli(['install']).status).toBe(0);
      configureModels(fixture, provider.baseURL);
      writeHealth(fixture);

      const result = await fixture.runAsync([
        'run', '--standalone', '--format', 'json', '--agent', 'kiki-orchestrator', 'Background watchdog',
      ]);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('Parent returned idle.');
      expect(provider.heldAborted()).toBeGreaterThan(0);

      const ids = sessionIDs(result.stdout);
      expect(ids.parent).toBeDefined();
      expect(ids.child).toBeDefined();
      const child = exportedSession(fixture, ids.child!);
      expect(child.info.parentID).toBe(ids.parent);
      expect(child.info.outcome).toBe('interrupted');

      const health = readJsonLines(join(fixture.project, HEALTH_LOG));
      const abort = health.find(entry => entry.event === 'watchdog-abort');
      expect(abort).toBeDefined();
      expect(abort.sessionId).toBe(ids.child);
      expect(abort.reason).toBe('stuck');
      expect(health.some(entry => entry.event === 'watchdog-abort-ok')).toBe(true);

      const routing = readJsonLines(join(fixture.project, ROUTING_LOG));
      expect(routing).toHaveLength(1);
      expect(routing[0].agent).toBe('kiki-implementer');

      // The parent answered its own model turn before the child interruption
      // notification arrived: dispatch mode did not delay watchdog tracking.
      const requests = provider.bodies();
      const parentRequests = requests.filter(body => body.model === 'fixture-orch');
      expect(parentRequests.length).toBeGreaterThanOrEqual(3);
      const cancelledNotification = parentRequests.some(body => body.messages.some(
        message => /subagent/i.test(String(message.content)) && /cancelled/i.test(String(message.content)),
      ));
      expect(cancelledNotification).toBe(true);
    } finally {
      await provider.stop();
      await fixture.cleanup();
    }
  }, 120_000);

  it('reloads a replacement plugin revision once, stopping the old subscription and diagnosing duplicates', async () => {
    const fixture = createOC2Fixture(requireOC2Binary());
    const revisionOne = prepareRevision(fixture.root, 'rev1/kiki');
    const revisionTwo = prepareRevision(fixture.root, 'rev2/kiki', 'rev2-loaded');
    const provider = await startFixtureProvider(request => {
      if (request.model === 'fixture-title') return { type: 'text', text: 'Reload fixture' };
      if (request.model === 'fixture-child') return { type: 'text', text: 'Child completed.' };
      if (request.model === 'fixture-orch' && !hasToolResult(request)) {
        return subagentCall('kiki-implementer', 'Probe reload log', 'Complete the reload fixture.');
      }
      return { type: 'text', text: 'Parent completed.' };
    });
    let started = false;
    try {
      expect(fixture.runCli(['install']).status).toBe(0);
      configureModels(fixture, provider.baseURL);
      const global = readJSONC(fixture.globalFile);
      global.plugins = [revisionOne];
      writeFileSync(fixture.globalFile, `${JSON.stringify(global, null, 2)}\n`);

      const port = await freePort();
      expect(fixture.run(['service', 'set', 'port', String(port)]).status).toBe(0);
      const start = fixture.run(['service', 'start'], { timeout: 30_000 });
      expect(start.status, start.stderr).toBe(0);
      started = true;

      const first = await fixture.runAsync([
        'run', '--format', 'json', '--agent', 'kiki-orchestrator', 'Reload fixture one',
      ], { timeout: 60_000 });
      expect(first.status, first.stderr).toBe(0);
      expect(first.stdout).toContain('Parent completed.');

      const switched = readJSONC(fixture.globalFile);
      switched.plugins = [revisionTwo];
      writeFileSync(fixture.globalFile, `${JSON.stringify(switched, null, 2)}\n`);
      const reload = await fixture.runAsync(['reload'], { timeout: 30_000 });
      expect(reload.status, reload.stderr).toBe(0);
      expect(reload.stdout).toMatch(/reload/i);

      const second = await fixture.runAsync([
        'run', '--format', 'json', '--agent', 'kiki-orchestrator', 'Reload fixture two',
      ], { timeout: 60_000 });
      expect(second.status, second.stderr).toBe(0);
      expect(second.stdout).toContain('Parent completed.');
      expect(existsSync(join(revisionTwo, 'rev2-loaded'))).toBe(true);

      const log = readJsonLines(join(fixture.project, ROUTING_LOG));
      expect(log).toHaveLength(2);
      expect(log.every(entry => entry.agent === 'kiki-implementer')).toBe(true);

      // Duplicate server registration is diagnosed by the backend doctor.
      const duplicated = readJSONC(fixture.globalFile);
      duplicated.plugins = [revisionOne, revisionTwo];
      writeFileSync(fixture.globalFile, `${JSON.stringify(duplicated, null, 2)}\n`);
      const doctor = fixture.runCli(['doctor', fixture.project]);
      expect(doctor.status).not.toBe(0);
      expect(`${doctor.stdout}\n${doctor.stderr}`).toMatch(/duplicate Kiki server plugin sources/i);
    } finally {
      if (started) {
        try {
          fixture.run(['service', 'stop'], { timeout: 30_000 });
        } catch {
          // The fixture root is removed below; a stopped service has no state.
        }
      }
      await provider.stop();
      await fixture.cleanup();
    }
  }, 180_000);
});
