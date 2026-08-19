import { describe, it, expect, vi } from 'vitest';
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

describe('watchdog activity signals', () => {
  function createChild(watchdog: ReturnType<typeof buildWatchdog>['watchdog'], id = 'child-1') {
    watchdog.handleEvent({ type: 'session.created', properties: { info: { id, parentID: 'p', title: 'kiki-planner' } } });
    return watchdog._sessions.get(id);
  }

  it('message.part.updated updates lastActivityAt', () => {
    const { watchdog, setTime } = buildWatchdog();
    const state = createChild(watchdog);
    setTime(1_000_000 + 4000);
    watchdog.handleEvent({
      type: 'message.part.updated',
      properties: { part: { id: 'p1', sessionID: 'child-1', messageID: 'm1', type: 'text', text: 'hello' } },
    });
    expect(state.lastActivityAt).toBe(1_000_000 + 4000);
  });

  it('message.updated with token growth updates lastActivityAt', () => {
    const { watchdog, setTime } = buildWatchdog();
    const state = createChild(watchdog);
    setTime(1_000_000 + 4000);
    watchdog.handleEvent({
      type: 'message.updated',
      properties: {
        info: {
          id: 'm1', sessionID: 'child-1', role: 'assistant',
          tokens: { input: 10, output: 5, reasoning: 3, cache: { read: 0, write: 0 } },
        },
      },
    });
    expect(state.lastActivityAt).toBe(1_000_000 + 4000);
  });

  it('message.updated without token growth does NOT update lastActivityAt', () => {
    const { watchdog, setTime } = buildWatchdog();
    const state = createChild(watchdog);
    const msg = {
      id: 'm1', sessionID: 'child-1', role: 'assistant',
      tokens: { input: 10, output: 5, reasoning: 3, cache: { read: 0, write: 0 } },
    };
    watchdog.handleEvent({ type: 'message.updated', properties: { info: msg } });
    const first = state.lastActivityAt;
    setTime(1_000_000 + 9000);
    watchdog.handleEvent({ type: 'message.updated', properties: { info: msg } });
    expect(state.lastActivityAt).toBe(first);
  });

  it('reasoning token growth counts as activity (thinking is not a hang)', () => {
    const { watchdog, setTime } = buildWatchdog();
    const state = createChild(watchdog);
    watchdog.handleEvent({
      type: 'message.updated',
      properties: {
        info: { id: 'm1', sessionID: 'child-1', role: 'assistant', tokens: { input: 10, output: 0, reasoning: 1, cache: { read: 0, write: 0 } } },
      },
    });
    setTime(1_000_000 + 8000);
    watchdog.handleEvent({
      type: 'message.updated',
      properties: {
        info: { id: 'm1', sessionID: 'child-1', role: 'assistant', tokens: { input: 10, output: 0, reasoning: 50, cache: { read: 0, write: 0 } } },
      },
    });
    expect(state.lastActivityAt).toBe(1_000_000 + 8000);
  });

  it('session.status updates status and activity', () => {
    const { watchdog, setTime } = buildWatchdog();
    const state = createChild(watchdog);
    setTime(1_000_000 + 2000);
    watchdog.handleEvent({ type: 'session.status', properties: { sessionID: 'child-1', status: { type: 'retry', attempt: 1, message: 'x', next: 0 } } });
    expect(state.status).toBe('retry');
    expect(state.lastActivityAt).toBe(1_000_000 + 2000);
  });
});

describe('watchdog stuck detection and abort', () => {
  function createBusyChild(watchdog: ReturnType<typeof buildWatchdog>['watchdog'], id = 'child-1') {
    watchdog.handleEvent({ type: 'session.created', properties: { info: { id, parentID: 'p', title: 'kiki-planner' } } });
    watchdog.handleEvent({ type: 'session.status', properties: { sessionID: id, status: { type: 'busy' } } });
    return watchdog._sessions.get(id);
  }

  it('does not abort during the grace period', () => {
    const { watchdog, client, setTime, getTime } = buildWatchdog();
    createBusyChild(watchdog);
    setTime(getTime() + 500); // < gracePeriodMs (1000)
    watchdog.checkNow();
    expect(client.session.abort).not.toHaveBeenCalled();
  });

  it('does not abort a busy session with recent activity', () => {
    const { watchdog, client, setTime, getTime } = buildWatchdog();
    createBusyChild(watchdog);
    setTime(getTime() + 4000); // past grace, < stuckThresholdMs (5000)
    watchdog.checkNow();
    expect(client.session.abort).not.toHaveBeenCalled();
  });

  it('aborts a stuck session and logs warn + info health entries', async () => {
    const { watchdog, client, fakes, setTime, getTime } = buildWatchdog();
    createBusyChild(watchdog);
    setTime(getTime() + 6000); // > stuckThresholdMs (5000), < absoluteMaxMs (60000)
    watchdog.checkNow();
    await flushPromises();
    expect(client.session.abort).toHaveBeenCalledWith({ path: { id: 'child-1' } });
    const written = fakes.appendFileSync.mock.calls.map((c: unknown[]) => String(c[1])).join('');
    expect(written).toContain('watchdog-abort');
    expect(written).toContain('"reason":"stuck"');
    expect(written).toContain('watchdog-abort-ok');
    expect(watchdog._sessions.has('child-1')).toBe(false);
  });

  it('aborts on absolute timeout even with recent activity', () => {
    const { watchdog, client, setTime, getTime } = buildWatchdog();
    createBusyChild(watchdog);
    setTime(getTime() + 59000);
    watchdog.handleEvent({
      type: 'message.part.updated',
      properties: { part: { id: 'p1', sessionID: 'child-1', messageID: 'm1', type: 'text', text: 'still working' } },
    });
    setTime(getTime() + 2000); // age 61000 > absoluteMaxMs (60000), silence only 2000
    watchdog.checkNow();
    expect(client.session.abort).toHaveBeenCalledWith({ path: { id: 'child-1' } });
  });

  it('emits a debug warning at 50% silence before aborting', () => {
    const { watchdog, client, fakes, setTime, getTime } = buildWatchdog();
    createBusyChild(watchdog);
    setTime(getTime() + 3000); // 50% of stuckThresholdMs=5000 is 2500; 3000 >= 2500, < 5000
    watchdog.checkNow();
    expect(client.session.abort).not.toHaveBeenCalled();
    const written = fakes.appendFileSync.mock.calls.map((c: unknown[]) => String(c[1])).join('');
    expect(written).toContain('watchdog-quiet');
  });

  it('does not abort a session in retry status', () => {
    const { watchdog, client, setTime, getTime } = buildWatchdog();
    createBusyChild(watchdog);
    watchdog.handleEvent({ type: 'session.status', properties: { sessionID: 'child-1', status: { type: 'retry', attempt: 2, message: 'm', next: 0 } } });
    setTime(getTime() + 30000);
    watchdog.checkNow();
    expect(client.session.abort).not.toHaveBeenCalled();
  });

  it('is a no-op when watchdogEnabled is false', () => {
    const { watchdog, client, setTime, getTime } = buildWatchdog({}, { watchdogEnabled: false });
    createBusyChild(watchdog);
    setTime(getTime() + 30000);
    watchdog.checkNow();
    expect(client.session.abort).not.toHaveBeenCalled();
  });

  it('logs an error entry when abort fails and does not throw', async () => {
    const { watchdog, client, fakes, setTime, getTime } = buildWatchdog();
    client.session.abort.mockRejectedValueOnce(new Error('boom'));
    createBusyChild(watchdog);
    setTime(getTime() + 6000);
    watchdog.checkNow();
    await flushPromises();
    const written = fakes.appendFileSync.mock.calls.map((c: unknown[]) => String(c[1])).join('');
    expect(written).toContain('watchdog-abort-failed');
    expect(written).toContain('boom');
  });

  it('falls back to client.app.log when the health log write fails', async () => {
    const { watchdog, client, fakes, setTime, getTime } = buildWatchdog();
    fakes.appendFileSync.mockImplementation(() => { throw new Error('disk full'); });
    createBusyChild(watchdog);
    setTime(getTime() + 6000);
    watchdog.checkNow();
    await flushPromises();
    expect(client.app.log).toHaveBeenCalled();
    const logCalls = client.app.log.mock.calls.map((c: unknown[]) => (c[0] as { body: { service: string } }).body.service);
    expect(logCalls).toContain('kiki-watchdog');
  });

  it('aborts multiple stuck sessions in a single tick', () => {
    const { watchdog, client, setTime, getTime } = buildWatchdog();
    createBusyChild(watchdog, 'child-a');
    createBusyChild(watchdog, 'child-b');
    setTime(getTime() + 6000);
    watchdog.checkNow();
    expect(client.session.abort).toHaveBeenCalledTimes(2);
    expect(client.session.abort).toHaveBeenCalledWith({ path: { id: 'child-a' } });
    expect(client.session.abort).toHaveBeenCalledWith({ path: { id: 'child-b' } });
  });

  it('logs an error entry when abort throws synchronously', () => {
    const { watchdog, client, fakes, setTime, getTime } = buildWatchdog();
    client.session.abort.mockImplementationOnce(() => { throw new Error('sync boom'); });
    createBusyChild(watchdog);
    setTime(getTime() + 6000);
    expect(() => watchdog.checkNow()).not.toThrow();
    const written = fakes.appendFileSync.mock.calls.map((c: unknown[]) => String(c[1])).join('');
    expect(written).toContain('watchdog-abort-failed');
    expect(written).toContain('sync boom');
  });

  it('does not abort the same session twice across consecutive ticks', () => {
    const { watchdog, client, setTime, getTime } = buildWatchdog();
    createBusyChild(watchdog);
    setTime(getTime() + 6000);
    watchdog.checkNow();
    watchdog.checkNow();
    watchdog.checkNow();
    expect(client.session.abort).toHaveBeenCalledTimes(1);
  });
});

describe('watchdog loop detection', () => {
  function createBusyChild(watchdog: ReturnType<typeof buildWatchdog>['watchdog'], id = 'child-1') {
    watchdog.handleEvent({ type: 'session.created', properties: { info: { id, parentID: 'p', title: 'kiki-planner' } } });
    watchdog.handleEvent({ type: 'session.status', properties: { sessionID: id, status: { type: 'busy' } } });
    return watchdog._sessions.get(id);
  }

  function sendTextParts(watchdog: ReturnType<typeof buildWatchdog>['watchdog'], texts: string[]) {
    texts.forEach((text, i) => {
      watchdog.handleEvent({
        type: 'message.part.updated',
        properties: { part: { id: 'part-' + i, sessionID: 'child-1', messageID: 'm1', type: 'text', text } },
      });
    });
  }

  function sendToolParts(watchdog: ReturnType<typeof buildWatchdog>['watchdog'], calls: Array<{ tool: string; input: unknown }>) {
    calls.forEach((c, i) => {
      watchdog.handleEvent({
        type: 'message.part.updated',
        properties: {
          part: { id: 'tool-' + i, sessionID: 'child-1', messageID: 'm1', type: 'tool', tool: c.tool, state: { status: 'running', input: c.input } },
        },
      });
    });
  }

  it('aborts on 3 consecutive identical text parts (content loop)', () => {
    const { watchdog, client } = buildWatchdog();
    createBusyChild(watchdog);
    sendTextParts(watchdog, ['same output', 'same output', 'same output']);
    watchdog.checkNow();
    expect(client.session.abort).toHaveBeenCalledWith({ path: { id: 'child-1' } });
  });

  it('normalizes whitespace and case for content loop detection', () => {
    const { watchdog, client } = buildWatchdog();
    createBusyChild(watchdog);
    sendTextParts(watchdog, ['Same   Output', 'same output', '  SAME OUTPUT ']);
    watchdog.checkNow();
    expect(client.session.abort).toHaveBeenCalled();
  });

  it('does NOT flag 3 updates to the SAME part id as a loop', () => {
    const { watchdog, client } = buildWatchdog();
    createBusyChild(watchdog);
    for (let i = 0; i < 3; i++) {
      watchdog.handleEvent({
        type: 'message.part.updated',
        properties: { part: { id: 'same-part', sessionID: 'child-1', messageID: 'm1', type: 'text', text: 'identical' } },
      });
    }
    watchdog.checkNow();
    expect(client.session.abort).not.toHaveBeenCalled();
  });

  it('does not flag varied text as a loop', () => {
    const { watchdog, client } = buildWatchdog();
    createBusyChild(watchdog);
    sendTextParts(watchdog, ['one', 'two', 'three']);
    watchdog.checkNow();
    expect(client.session.abort).not.toHaveBeenCalled();
  });

  it('aborts on 3 consecutive identical tool calls (tool loop)', () => {
    const { watchdog, client } = buildWatchdog();
    createBusyChild(watchdog);
    sendToolParts(watchdog, [
      { tool: 'read', input: { filePath: '/a' } },
      { tool: 'read', input: { filePath: '/a' } },
      { tool: 'read', input: { filePath: '/a' } },
    ]);
    watchdog.checkNow();
    expect(client.session.abort).toHaveBeenCalledWith({ path: { id: 'child-1' } });
  });

  it('does NOT flag repeated updates to the SAME tool part as a loop', () => {
    const { watchdog, client } = buildWatchdog();
    createBusyChild(watchdog);
    const statuses = ['pending', 'running', 'completed'];
    for (const status of statuses) {
      watchdog.handleEvent({
        type: 'message.part.updated',
        properties: {
          part: { id: 'one-tool', sessionID: 'child-1', messageID: 'm1', type: 'tool', tool: 'read', state: { status, input: { filePath: '/a' } } },
        },
      });
    }
    watchdog.checkNow();
    expect(client.session.abort).not.toHaveBeenCalled();
  });

  it('does not flag same tool with different inputs as a loop', () => {
    const { watchdog, client } = buildWatchdog();
    createBusyChild(watchdog);
    sendToolParts(watchdog, [
      { tool: 'read', input: { filePath: '/a' } },
      { tool: 'read', input: { filePath: '/b' } },
      { tool: 'read', input: { filePath: '/c' } },
    ]);
    watchdog.checkNow();
    expect(client.session.abort).not.toHaveBeenCalled();
  });

  it('logs the loop reason when aborting', () => {
    const { watchdog, fakes } = buildWatchdog();
    createBusyChild(watchdog);
    sendTextParts(watchdog, ['x', 'x', 'x']);
    watchdog.checkNow();
    const written = fakes.appendFileSync.mock.calls.map((c: unknown[]) => String(c[1])).join('');
    expect(written).toContain('"reason":"content-loop"');
  });
});

describe('watchdog agent filtering and discovery', () => {
  function createBusyChild(watchdog: ReturnType<typeof buildWatchdog>['watchdog'], id = 'child-1') {
    watchdog.handleEvent({ type: 'session.created', properties: { info: { id, parentID: 'p', title: id } } });
    watchdog.handleEvent({ type: 'session.status', properties: { sessionID: id, status: { type: 'busy' } } });
  }

  it('does not abort a resolved non-kiki agent when watchAllSubagents is false', async () => {
    const { watchdog, client, setTime, getTime } = buildWatchdog();
    client.session.messages.mockResolvedValue([{ info: { role: 'user', agent: 'general' } }]);
    createBusyChild(watchdog);
    await flushPromises();
    setTime(getTime() + 30000);
    watchdog.checkNow();
    expect(client.session.abort).not.toHaveBeenCalled();
  });

  it('aborts a resolved kiki agent', async () => {
    const { watchdog, client, setTime, getTime } = buildWatchdog();
    client.session.messages.mockResolvedValue([{ info: { role: 'user', agent: 'kiki-planner' } }]);
    createBusyChild(watchdog);
    await flushPromises();
    setTime(getTime() + 6000);
    watchdog.checkNow();
    expect(client.session.abort).toHaveBeenCalledWith({ path: { id: 'child-1' } });
  });

  it('watches a non-kiki agent when watchAllSubagents is true', async () => {
    const { watchdog, client, setTime, getTime } = buildWatchdog({}, { watchAllSubagents: true });
    client.session.messages.mockResolvedValue([{ info: { role: 'user', agent: 'general' } }]);
    createBusyChild(watchdog);
    await flushPromises();
    setTime(getTime() + 6000);
    watchdog.checkNow();
    expect(client.session.abort).toHaveBeenCalled();
  });

  it('discovers child sessions via client.session.list on checkNow', async () => {
    const { watchdog, client, setTime, getTime } = buildWatchdog();
    client.session.list.mockResolvedValue([{ id: 'missed-1', parentID: 'p', title: 'kiki-reviewer' }]);
    watchdog.checkNow(); // tick 1: discovers and registers 'missed-1'
    await flushPromises();
    setTime(getTime() + 6000); // now past grace + stuck threshold for the discovered session
    watchdog.checkNow(); // tick 2: evaluates and aborts
    expect(client.session.abort).toHaveBeenCalledWith({ path: { id: 'missed-1' } });
  });

  it('tolerates session.list failures', async () => {
    const { watchdog, client } = buildWatchdog();
    client.session.list.mockRejectedValue(new Error('offline'));
    expect(() => watchdog.checkNow()).not.toThrow();
    await flushPromises();
  });
});
