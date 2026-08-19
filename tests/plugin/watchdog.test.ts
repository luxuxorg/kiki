import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WATCHDOG_SOURCE } from '../../src/plugin/watchdog-source';

interface Fakes {
  appendFileSync: ReturnType<typeof vi.fn>;
  existsSync: ReturnType<typeof vi.fn>;
  mkdirSync: ReturnType<typeof vi.fn>;
}

function buildWatchdog(depsOverrides: Record<string, unknown> = {}, configOverrides: Record<string, unknown> = {}) {
  const fakes: Fakes = {
    appendFileSync: vi.fn(),
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
  };
  const join = (...parts: string[]) => parts.join('/');
  const dirname = (p: string) => p.split('/').slice(0, -1).join('/');

  const factory = new Function(
    'appendFileSync', 'existsSync', 'mkdirSync', 'dirname', 'join',
    WATCHDOG_SOURCE + '\nreturn createWatchdog;'
  );
  const createWatchdog = factory(fakes.appendFileSync, fakes.existsSync, fakes.mkdirSync, dirname, join);

  let currentTime = 1_000_000;
  const client = {
    session: {
      abort: vi.fn(() => Promise.resolve(true)),
      messages: vi.fn(() => Promise.resolve([])),
      list: vi.fn(() => Promise.resolve([])),
    },
    app: { log: vi.fn(() => Promise.resolve(true)) },
  };
  const config = {
    watchdogEnabled: true,
    stuckThresholdMs: 5000,
    gracePeriodMs: 1000,
    absoluteMaxMs: 60000,
    checkIntervalMs: 100,
    loopRepeatCount: 3,
    watchAllSubagents: false,
    logPath: '.agentic/kiki/health_log.jsonl',
    ...configOverrides,
  };
  const watchdog = createWatchdog({
    client,
    directory: '/proj',
    config,
    now: () => currentTime,
    ...depsOverrides,
  });
  return { watchdog, client, fakes, setTime: (t: number) => { currentTime = t; }, getTime: () => currentTime };
}

async function flushPromises() {
  await new Promise((r) => setTimeout(r, 0));
}

describe('watchdog session lifecycle', () => {
  it('registers a child session on session.created with parentID', () => {
    const { watchdog } = buildWatchdog();
    watchdog.handleEvent({
      type: 'session.created',
      properties: { info: { id: 'child-1', parentID: 'parent-1', title: 'kiki-planner' } },
    });
    expect(watchdog._sessions.has('child-1')).toBe(true);
  });

  it('ignores sessions without a parentID', () => {
    const { watchdog } = buildWatchdog();
    watchdog.handleEvent({
      type: 'session.created',
      properties: { info: { id: 'root-1', title: 'main' } },
    });
    expect(watchdog._sessions.has('root-1')).toBe(false);
  });

  it('registers a child session discovered via session.updated', () => {
    const { watchdog } = buildWatchdog();
    watchdog.handleEvent({
      type: 'session.updated',
      properties: { info: { id: 'child-2', parentID: 'parent-1', title: 'x' } },
    });
    expect(watchdog._sessions.has('child-2')).toBe(true);
  });

  it('removes the session on session.idle, session.deleted, and session.error', () => {
    const { watchdog } = buildWatchdog();
    for (const id of ['c1', 'c2', 'c3']) {
      watchdog.handleEvent({ type: 'session.created', properties: { info: { id, parentID: 'p', title: 't' } } });
    }
    watchdog.handleEvent({ type: 'session.idle', properties: { sessionID: 'c1' } });
    watchdog.handleEvent({ type: 'session.deleted', properties: { info: { id: 'c2' } } });
    watchdog.handleEvent({ type: 'session.error', properties: { sessionID: 'c3' } });
    expect(watchdog._sessions.size).toBe(0);
  });
});
