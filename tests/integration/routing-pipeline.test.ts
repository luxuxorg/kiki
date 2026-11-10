import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createOC2Fixture, hasOC2Binary, readJSONC, readJsonLines, requireOC2Binary,
} from '../helpers/oc2-fixture';
import {
  fixtureProviderConfig, hasToolResult, startFixtureProvider, subagentCall,
} from './fixtures/oc2-provider';

const ROUTING_LOG = '.agentic/kiki/routing_log.jsonl';

function configureProvider(
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

describe.skipIf(!hasOC2Binary())('routing pipeline against the real packaged plugin', () => {
  it('logs exactly one unchanged-format entry for a foreground subagent dispatch', async () => {
    const fixture = createOC2Fixture(requireOC2Binary());
    const provider = await startFixtureProvider(request => {
      if (request.model === 'fixture-title') return { type: 'text', text: 'Routing fixture' };
      if (request.model === 'fixture-child') return { type: 'text', text: 'Child completed.' };
      if (request.model === 'fixture-orch' && !hasToolResult(request)) {
        return subagentCall('kiki-implementer', 'Probe routing log', 'Complete the fixture task.');
      }
      return { type: 'text', text: 'Parent completed.' };
    });
    try {
      expect(fixture.runCli(['install']).status).toBe(0);
      configureProvider(fixture, provider.baseURL);

      const result = await fixture.runAsync([
        'run', '--standalone', '--format', 'json', '--agent', 'kiki-orchestrator', 'Routing fixture',
      ]);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('Parent completed.');

      const log = readJsonLines(join(fixture.project, ROUTING_LOG));
      expect(log).toHaveLength(1);
      const [entry] = log;
      expect(Object.keys(entry).sort()).toEqual(['agent', 'model', 'timestamp']);
      expect(entry.agent).toBe('kiki-implementer');
      expect(entry.model).toBe('unknown');
      expect(Number.isNaN(Date.parse(entry.timestamp))).toBe(false);
      expect(entry.domain).toBeUndefined();
      expect(entry.risk).toBeUndefined();

      // Every model request stayed on the loopback fixture.
      expect(provider.requests()).toBeGreaterThan(0);
      expect(provider.bodies().every(body => body.url === '/v1/chat/completions')).toBe(true);
    } finally {
      await provider.stop();
      await fixture.cleanup();
    }
  }, 120_000);

  it('logs exactly one entry for a background dispatch without changing the format', async () => {
    const fixture = createOC2Fixture(requireOC2Binary());
    const provider = await startFixtureProvider(request => {
      if (request.model === 'fixture-title') return { type: 'text', text: 'Background routing' };
      if (request.model === 'fixture-child') return { type: 'text', text: 'Background child done.' };
      if (request.model === 'fixture-orch' && !hasToolResult(request)) {
        return subagentCall(
          'kiki-implementer',
          'Probe background log',
          'Complete the background fixture task.',
          { background: true },
        );
      }
      return { type: 'text', text: 'Parent returned idle.' };
    });
    try {
      expect(fixture.runCli(['install']).status).toBe(0);
      configureProvider(fixture, provider.baseURL);

      const result = await fixture.runAsync([
        'run', '--standalone', '--format', 'json', '--agent', 'kiki-orchestrator', 'Background routing',
      ]);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('Parent returned idle.');

      const log = readJsonLines(join(fixture.project, ROUTING_LOG));
      expect(log).toHaveLength(1);
      const [entry] = log;
      expect(Object.keys(entry).sort()).toEqual(['agent', 'model', 'timestamp']);
      expect(entry.agent).toBe('kiki-implementer');
      expect(entry.model).toBe('unknown');

      // The background child ran as a child session, not as a parent-level log.
      const bodies = provider.bodies();
      expect(bodies.some(body => body.model === 'fixture-child')).toBe(true);
      // The parent returned its own model response after the background tool
      // result, so logging did not have to wait for the child.
      const parentRequests = bodies.filter(body => body.model === 'fixture-orch');
      expect(parentRequests.length).toBeGreaterThanOrEqual(2);
      expect(existsSync(join(fixture.project, ROUTING_LOG))).toBe(true);
      expect(readFileSync(join(fixture.project, ROUTING_LOG), 'utf8').trim().split('\n')).toHaveLength(1);
    } finally {
      await provider.stop();
      await fixture.cleanup();
    }
  }, 120_000);
});
