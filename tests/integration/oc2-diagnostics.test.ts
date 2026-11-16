import { describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createOC2Fixture,
  hasOC2Binary,
  observedOC2Version,
  readJSONC,
  readJsonLines,
  requireOC2Binary,
} from '../helpers/oc2-fixture';
import {
  fixtureProviderConfig,
  hasToolResult,
  startFixtureProvider,
  subagentCall,
  type FixtureReply,
  type FixtureRequest,
} from './fixtures/oc2-provider';
import { createLedgerWriter, type LedgerRecord } from '../../src/diagnostics/ledger';
import { stats } from '../../src/cli/commands/stats';

const LEDGER = '.agentic/kiki/run_ledger.jsonl';
const ROUTING_LOG = '.agentic/kiki/routing_log.jsonl';

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

function writeDiagnostics(
  fixture: ReturnType<typeof createOC2Fixture>,
  enabled: boolean,
): void {
  mkdirSync(join(fixture.project, '.agentic/kiki'), { recursive: true });
  writeFileSync(
    join(fixture.project, '.agentic/kiki/config.json'),
    JSON.stringify({ diagnostics: { enabled } }),
  );
}

function multiStepResponder(): (request: FixtureRequest) => FixtureReply {
  return request => {
    if (request.model === 'fixture-title') return { type: 'text', text: 'Diagnostics fixture' };
    if (request.model === 'fixture-child') {
      if (!hasToolResult(request)) {
        return {
          type: 'tool-calls',
          calls: [{ name: 'bash', arguments: { command: 'printf child-step', description: 'fixture child step' } }],
        };
      }
      return { type: 'text', text: 'Child completed.' };
    }
    if (request.model === 'fixture-orch' && !hasToolResult(request)) {
      return subagentCall(
        'kiki-implementer',
        '[task:diag fix cmp:trial] Correct regression now',
        'Complete the two-step fixture child task.',
      );
    }
    return { type: 'text', text: 'Parent completed.' };
  };
}

function captureConsole(): { output: () => string; restore: () => void } {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  return {
    output: () => log.mock.calls.flat().join('\n'),
    restore: () => log.mockRestore(),
  };
}

describe('synthetic comparison markers and summary plumbing', () => {
  it('keeps two isolated variant roots independent and summarizes one supplied group without inventing tokens', async () => {
    const main = mkdtempSync(join(tmpdir(), 'kiki-compare-main-'));
    const variantA = mkdtempSync(join(tmpdir(), 'kiki-compare-a-'));
    const variantB = mkdtempSync(join(tmpdir(), 'kiki-compare-b-'));
    const startRevision = '0123456789abcdef0123456789abcdef01234567';
    const resultRevision = 'fedcba9876543210fedcba9876543210fedcba98';
    const sentinelA = join(variantA, 'PRISTINE-A');
    const sentinelB = join(variantB, 'PRISTINE-B');
    writeFileSync(sentinelA, 'variant A untouched');
    writeFileSync(sentinelB, 'variant B untouched');

    try {
      const write = createLedgerWriter(main);
      const base = { v: 1 as const, timestamp: '2026-11-16T10:00:00.000Z' };
      const markerA: LedgerRecord = {
        ...base,
        id: 'comparison:trial:variant-a',
        type: 'comparison',
        taskId: 'cmp-task',
        comparisonGroup: 'trial',
        startRevision,
        endRevision: 'unknown',
      };
      const markerB: LedgerRecord = {
        ...base,
        id: 'comparison:trial:variant-b',
        timestamp: '2026-11-16T10:01:00.000Z',
        type: 'comparison',
        taskId: 'cmp-task',
        comparisonGroup: 'trial',
        startRevision,
        endRevision: resultRevision,
      };
      expect(write(markerA)).toBe(true);
      expect(write(markerB)).toBe(true);
      expect(write({
        ...base,
        id: 'dispatch:parent:call-a',
        type: 'dispatch',
        parentSessionId: 'parent',
        callId: 'call-a',
        agent: 'kiki-implementer',
        declared: { taskId: 'cmp-task', kind: 'fix', comparisonGroup: 'trial', model: 'kiki-fixture/fixture-child-a' },
        childSessionId: 'unknown',
      })).toBe(true);
      expect(write({
        ...base,
        id: 'dispatch:parent:call-b',
        timestamp: '2026-11-16T10:01:00.000Z',
        type: 'dispatch',
        parentSessionId: 'parent',
        callId: 'call-b',
        agent: 'kiki-implementer',
        declared: { taskId: 'cmp-task', kind: 'fix', comparisonGroup: 'trial', model: 'kiki-fixture/fixture-child-b' },
        childSessionId: 'unknown',
      })).toBe(true);
      expect(write({
        ...base,
        id: 'session:variant-a:1',
        timestamp: '2026-11-16T10:02:00.000Z',
        type: 'session',
        sessionId: 'variant-a-session',
        parentSessionId: 'parent',
        agent: 'kiki-implementer',
        startedAt: '2026-11-16T10:00:00.000Z',
        endedAt: '2026-11-16T10:02:00.000Z',
        status: 'succeeded',
        tokens: { input: 10, output: 5, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
        tokenSource: 'session.usage.updated',
        retries: 0,
        partial: false,
      })).toBe(true);

      // Variant roots were never written by the preparation ledger.
      expect(existsSync(join(variantA, LEDGER))).toBe(false);
      expect(existsSync(join(variantB, LEDGER))).toBe(false);
      expect(readFileSync(sentinelA, 'utf8')).toBe('variant A untouched');
      expect(readFileSync(sentinelB, 'utf8')).toBe('variant B untouched');

      const ledger = readJsonLines(join(main, LEDGER));
      const markers = ledger.filter(entry => entry.type === 'comparison');
      expect(markers).toHaveLength(2);
      expect(markers.map(marker => marker.startRevision)).toEqual([startRevision, startRevision]);
      expect(markers.map(marker => marker.endRevision)).toEqual(['unknown', resultRevision]);
      for (const marker of markers) {
        expect(Object.keys(marker).sort()).toEqual([
          'comparisonGroup', 'endRevision', 'id', 'startRevision', 'taskId', 'timestamp', 'type', 'v',
        ]);
        expect(JSON.stringify(marker)).not.toContain('Complete the two-step');
        expect(JSON.stringify(marker)).not.toContain('printf child-step');
      }

      const consoleCapture = captureConsole();
      try {
        expect(await stats(main)).toBe(0);
        const output = consoleCapture.output();
        expect(output).toContain('declaredInvocations=2 fix=2 review=0');
        expect(output).toContain('- task=cmp-task kind=fix cmp=trial invocations=2');
        // The latest supplied marker supplies the known start/result revisions;
        // earlier markers are not merged (documented Task 3 behavior).
        expect(output).toContain(
          `- group=trial task=cmp-task startRevision=${startRevision} endRevision=${resultRevision} declaredDispatches=2 observedSessionTokens=unknown`,
        );
        expect(output).toContain('no verified dispatch-to-session link');
        expect(output).toContain('- session=variant-a-session ');
        expect(output).not.toContain('tokens=10 ');
        expect(output).toContain('no cost, quality or equivalence claim is made');
        expect(output).not.toMatch(/savings=|quality=|winner/i);
      } finally {
        consoleCapture.restore();
      }
    } finally {
      rmSync(main, { recursive: true, force: true });
      rmSync(variantA, { recursive: true, force: true });
      rmSync(variantB, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!hasOC2Binary())('real OC2 diagnostics evidence', () => {
  it('records an aggregate child-session snapshot for a labeled dispatch and leaves collection-off runs pristine', async () => {
    // Collection ON: one labeled, multi-step child.
    const fixture = createOC2Fixture(requireOC2Binary());
    const provider = await startFixtureProvider(multiStepResponder());
    try {
      expect(fixture.runCli(['install']).status).toBe(0);
      configureModels(fixture, provider.baseURL);
      writeDiagnostics(fixture, true);

      const result = await fixture.runAsync([
        'run', '--standalone', '--format', 'json', '--agent', 'kiki-orchestrator', 'Diagnostics fixture',
      ], { timeout: 150_000 });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('Parent completed.');

      const ledger = readJsonLines(join(fixture.project, LEDGER));
      const dispatches = ledger.filter(entry => entry.type === 'dispatch');
      const sessions = ledger.filter(entry => entry.type === 'session');
      expect(dispatches, JSON.stringify(dispatches)).toHaveLength(1);
      expect(sessions.length, JSON.stringify(sessions)).toBeGreaterThanOrEqual(2);

      const [dispatch] = dispatches;
      expect(dispatch.agent).toBe('kiki-implementer');
      expect(dispatch.childSessionId).toBe('unknown');
      expect(dispatch.declared).toEqual({
        taskId: 'diag',
        kind: 'fix',
        comparisonGroup: 'trial',
        model: 'unknown',
      });

      const sessionId = sessions[0].sessionId as string;
      const childSessions = sessions.filter(entry => entry.sessionId === sessionId);
      expect(childSessions).toHaveLength(sessions.length);
      expect(childSessions.every(entry => entry.agent === 'kiki-implementer')).toBe(true);
      expect(childSessions.every(entry => entry.parentSessionId === childSessions[0].parentSessionId)).toBe(true);
      expect(childSessions[0].status).toBe('running');
      expect(childSessions[0].partial).toBe(true);
      const finalSession = childSessions[childSessions.length - 1];
      expect(['succeeded', 'idle']).toContain(finalSession.status);
      expect(finalSession.partial).toBe(false);
      expect(finalSession.tokenSource).toBe('session.usage.updated');
      expect(sessions.map(entry => entry.status)[0]).toBe('running');
      expect(childSessions.filter(entry => entry.status !== 'running').length).toBeGreaterThanOrEqual(1);

      const exportedResult = fixture.run([
        'session', 'export', sessionId, '--sanitize', '--standalone',
      ]);
      expect(exportedResult.status, exportedResult.stderr).toBe(0);
      const exported = JSON.parse(exportedResult.stdout) as {
        info: {
          parentID?: string;
          agent?: string;
          outcome?: string;
          tokens?: { input: number; output: number; reasoning: number; cache: { read: number; write: number } };
        };
      };
      expect(exported.info.parentID).toBe(childSessions[0].parentSessionId);
      expect(exported.info.agent).toBe('kiki-implementer');
      expect(exported.info.outcome).toBe('succeeded');
      expect(exported.info.tokens).toBeDefined();

      const observed = {
        input: exported.info.tokens!.input,
        output: exported.info.tokens!.output,
        reasoning: exported.info.tokens!.reasoning,
        cacheRead: exported.info.tokens!.cache.read,
        cacheWrite: exported.info.tokens!.cache.write,
      };
      expect(finalSession.tokens, JSON.stringify({ observed, final: finalSession.tokens, records: childSessions }))
        .toEqual(observed);

      // The fixture served exactly two child steps: 10 input/5 output, then
      // 3 input/2 output. An aggregate snapshot is their cumulative 13/7; it is
      // neither a single step nor the double-counted 26/14.
      expect(observed).toEqual({ input: 13, output: 7, reasoning: 0, cacheRead: 0, cacheWrite: 0 });
      expect(finalSession.tokens).toEqual({ input: 13, output: 7, reasoning: 0, cacheRead: 0, cacheWrite: 0 });

      const routing = readJsonLines(join(fixture.project, ROUTING_LOG));
      expect(routing).toHaveLength(1);
      expect(Object.keys(routing[0]).sort()).toEqual(['agent', 'model', 'timestamp']);
      expect(routing[0].agent).toBe('kiki-implementer');

      const summary = fixture.runCli(['stats', fixture.project]);
      expect(summary.status, summary.stderr).toBe(0);
      expect(summary.stdout).toContain('collection=enabled');
      expect(summary.stdout).toContain('declaredInvocations=1 fix=1 review=0');
      expect(summary.stdout).toContain('- task=diag kind=fix cmp=trial invocations=1');
      expect(summary.stdout).toContain(`- session=${sessionId} `);
      expect(summary.stdout).toContain('tokenSource=session.usage.updated');
      expect(summary.stdout).toContain('tokens.input=13');
      expect(summary.stdout).toContain('tokens.output=7');
      expect(summary.stdout).toContain(
        '- group=trial task=diag startRevision=unknown endRevision=unknown declaredDispatches=1 observedSessionTokens=unknown',
      );
      expect(summary.stdout).toContain('no verified dispatch-to-session link');

      // Task 4 evidence capture only when the caller asks for it; normal test
      // runs keep the disposable fixture entirely inside its temp root.
      const evidenceDir = process.env.KIKI_TASK4_EVIDENCE_DIR;
      if (evidenceDir) {
        mkdirSync(evidenceDir, { recursive: true });
        writeFileSync(
          join(evidenceDir, 'task-4-real-ledger.jsonl'),
          readFileSync(join(fixture.project, LEDGER)),
        );
        writeFileSync(join(evidenceDir, 'task-4-real-stats.txt'), summary.stdout + summary.stderr);
        writeFileSync(join(evidenceDir, 'task-4-exported-session.json'), exportedResult.stdout);
      }

      const version = observedOC2Version();
      // Record the observed 2.x patch in the evidence capture; do not gate on
      // one exact patch release (the harness accepts any OpenCode 2.x).
      expect(version, 'fixture-observed OpenCode 2.x version').toMatch(/^2\.\d+\.\d+$/);
    } finally {
      await provider.stop();
      await fixture.cleanup();
    }
  }, 180_000);

  it('keeps the off default pristine: no ledger file, unchanged routing keys and disabled stats', async () => {
    const fixture = createOC2Fixture(requireOC2Binary());
    const provider = await startFixtureProvider(multiStepResponder());
    try {
      expect(fixture.runCli(['install']).status).toBe(0);
      configureModels(fixture, provider.baseURL);
      writeDiagnostics(fixture, false);

      const result = await fixture.runAsync([
        'run', '--standalone', '--format', 'json', '--agent', 'kiki-orchestrator', 'Diagnostics off fixture',
      ], { timeout: 150_000 });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('Parent completed.');

      expect(existsSync(join(fixture.project, LEDGER))).toBe(false);
      const routing = readJsonLines(join(fixture.project, ROUTING_LOG));
      expect(routing).toHaveLength(1);
      expect(Object.keys(routing[0]).sort()).toEqual(['agent', 'model', 'timestamp']);
      expect(routing[0].agent).toBe('kiki-implementer');

      const summary = fixture.runCli(['stats', fixture.project]);
      expect(summary.status, summary.stderr).toBe(0);
      expect(summary.stdout).toContain('collection=disabled');
      expect(summary.stdout).toContain('no ledger data');
      expect(summary.stdout).not.toContain('observationGap=');
      expect(existsSync(join(fixture.project, LEDGER))).toBe(false);
    } finally {
      await provider.stop();
      await fixture.cleanup();
    }
  }, 180_000);
});
