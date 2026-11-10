import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWatchdog, createWatchdogSessionAdapter } from '../../src/server/watchdog';
import type { WatchdogEvent } from '../../src/server/watchdog-events';
import type { KikiHealthConfig } from '../../src/cli/config';

type Watchdog = ReturnType<typeof createWatchdog>;
type Interrupt = (id: string) => Promise<void>;
type Discover = () => Promise<WatchdogEvent[]>;
type WriteHealth = (level: string, entry: Record<string, unknown>) => void;

const BASE_CONFIG: KikiHealthConfig = {
  watchdogEnabled: true,
  stuckThresholdMs: 5000,
  gracePeriodMs: 1000,
  absoluteMaxMs: 60000,
  checkIntervalMs: 100,
  loopRepeatCount: 3,
  watchAllSubagents: false,
  logPath: '.agentic/kiki/health_log.jsonl',
};

const watchdogs: Watchdog[] = [];

interface Harness {
  watchdog: Watchdog;
  interrupt: ReturnType<typeof vi.fn<Interrupt>>;
  discover: ReturnType<typeof vi.fn<Discover>>;
  writeHealth: ReturnType<typeof vi.fn<WriteHealth>>;
  setTime: (time: number) => void;
  getTime: () => number;
  tick: () => Promise<void>;
  start: () => void;
  stop: () => Promise<void>;
}

function buildWatchdog(options: {
  autoStart?: boolean;
  config?: Partial<KikiHealthConfig>;
  interrupt?: ReturnType<typeof vi.fn<Interrupt>>;
  discover?: ReturnType<typeof vi.fn<Discover>>;
  writeHealth?: ReturnType<typeof vi.fn<WriteHealth>>;
} = {}): Harness {
  let currentTime = 1_000_000;
  const config: KikiHealthConfig = { ...BASE_CONFIG, ...options.config };
  const interrupt = options.interrupt ?? vi.fn<Interrupt>(async () => {});
  const discover = options.discover ?? vi.fn<Discover>(async () => []);
  const writeHealth = options.writeHealth ?? vi.fn<WriteHealth>();

  const watchdog = createWatchdog({
    config,
    directory: '/project',
    now: () => currentTime,
    interrupt,
    discover,
    writeHealth,
  });
  watchdogs.push(watchdog);

  if (options.autoStart !== false) watchdog.start();

  return {
    watchdog,
    interrupt,
    discover,
    writeHealth,
    setTime: (time) => {
      currentTime = time;
    },
    getTime: () => currentTime,
    tick: async () => {
      await vi.advanceTimersByTimeAsync(config.checkIntervalMs);
    },
    start: () => watchdog.start(),
    stop: () => watchdog.stop(),
  };
}

function createChild(
  h: Harness,
  options: { id?: string; parentID?: string; agent?: string } = {},
): void {
  const id = options.id ?? 'child-1';
  const parentID = options.parentID ?? 'parent-1';
  const agent = options.agent ?? 'kiki-planner';
  h.watchdog.handle({ type: 'child', id, parentID, agent });
}

function sendText(
  h: Harness,
  options: {
    id?: string;
    key?: string;
    text?: string;
    mode?: 'append' | 'replace';
  } = {},
): void {
  h.watchdog.handle({
    type: 'text',
    id: options.id ?? 'child-1',
    key: options.key ?? 'text:msg-1:0',
    text: options.text ?? 'x',
    mode: options.mode ?? 'replace',
  });
}

function sendTool(
  h: Harness,
  options: {
    id?: string;
    key?: string;
    name?: string;
    input?: unknown;
  } = {},
): void {
  h.watchdog.handle({
    type: 'tool',
    id: options.id ?? 'child-1',
    key: options.key ?? 'tool-1',
    name: options.name ?? 'read',
    input: options.input === undefined ? { filePath: '/a' } : options.input,
  });
}

function sendCallStarted(
  h: Harness,
  options: { id?: string; key?: string; name?: string } = {},
): void {
  h.watchdog.handle({
    type: 'tool',
    id: options.id ?? 'child-1',
    key: options.key ?? 'tool-1',
    name: options.name ?? 'read',
    input: undefined,
  });
}

function sendTokens(
  h: Harness,
  counters: {
    input: number;
    output: number;
    reasoning: number;
    cacheRead: number;
    cacheWrite: number;
  },
  id = 'child-1',
): void {
  h.watchdog.handle({ type: 'tokens', id, counters });
}

function healthEvents(h: Harness): string[] {
  return h.writeHealth.mock.calls.map(([, entry]) => String(entry.event));
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  watchdogs.length = 0;
});

afterEach(async () => {
  for (const watchdog of watchdogs.splice(0)) await watchdog.stop();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('watchdog session lifecycle', () => {
  it('tracks a child with parentID and aborts a stuck kiki agent', async () => {
    const h = buildWatchdog();
    createChild(h);
    h.setTime(h.getTime() + 6000);
    await h.tick();

    expect(h.interrupt).toHaveBeenCalledWith('child-1');
  });

  it('ignores sessions without a parentID (root exclusion)', async () => {
    const h = buildWatchdog();
    h.watchdog.handle({ type: 'child', id: 'root-1', agent: 'kiki-planner' });
    h.setTime(h.getTime() + 6000);
    await h.tick();

    expect(h.interrupt).not.toHaveBeenCalled();
  });

  it('removes a session on a terminal event and does not renew it from late discovery', async () => {
    const h = buildWatchdog();
    createChild(h);
    h.watchdog.handle({ type: 'finished', id: 'child-1' });
    h.discover.mockResolvedValue([
      { type: 'child', id: 'child-1', parentID: 'parent-1', agent: 'kiki-planner' },
    ]);
    h.setTime(h.getTime() + 6000);
    await h.tick();

    expect(h.interrupt).not.toHaveBeenCalled();
  });

  it('does not reset startedAt when discovery re-finds an already tracked session', async () => {
    const h = buildWatchdog();
    createChild(h);
    h.discover.mockResolvedValue([
      { type: 'child', id: 'child-1', parentID: 'parent-1', agent: 'kiki-planner' },
    ]);
    h.setTime(h.getTime() + 3000);
    await h.tick();
    h.setTime(1_000_000 + 6000);
    await h.tick();

    expect(h.interrupt).toHaveBeenCalledWith('child-1');
  });

  it('records an agent selection change without resetting the session', async () => {
    const h = buildWatchdog();
    createChild(h, { agent: 'kiki-planner' });
    h.watchdog.handle({ type: 'child', id: 'child-1', agent: 'general' });
    h.setTime(h.getTime() + 6000);
    await h.tick();

    expect(h.interrupt).not.toHaveBeenCalled();
  });

  it('starts watching a session when the selected agent changes to kiki', async () => {
    const h = buildWatchdog();
    createChild(h, { agent: 'general' });
    h.watchdog.handle({ type: 'child', id: 'child-1', agent: 'kiki-planner' });
    h.setTime(h.getTime() + 6000);
    await h.tick();

    expect(h.interrupt).toHaveBeenCalledWith('child-1');
  });
});

describe('watchdog activity signals', () => {
  it('text activity refreshes lastActivityAt', async () => {
    const h = buildWatchdog();
    createChild(h);
    h.setTime(h.getTime() + 4000);
    sendText(h, { text: 'hello' });
    h.setTime(1_000_000 + 6000);
    await h.tick();

    expect(h.interrupt).not.toHaveBeenCalled();
  });

  it('token growth refreshes lastActivityAt', async () => {
    const h = buildWatchdog();
    createChild(h);
    sendTokens(h, { input: 10, output: 5, reasoning: 3, cacheRead: 0, cacheWrite: 0 });
    h.setTime(h.getTime() + 4000);
    sendTokens(h, { input: 10, output: 15, reasoning: 3, cacheRead: 0, cacheWrite: 0 });
    h.setTime(1_000_000 + 6000);
    await h.tick();

    expect(h.interrupt).not.toHaveBeenCalled();
  });

  it('token observations without growth do not refresh lastActivityAt', async () => {
    const h = buildWatchdog();
    createChild(h);
    const counters = { input: 10, output: 5, reasoning: 3, cacheRead: 0, cacheWrite: 0 };
    sendTokens(h, counters);
    h.setTime(h.getTime() + 9000);
    sendTokens(h, counters);
    await h.tick();

    expect(h.interrupt).toHaveBeenCalledWith('child-1');
  });

  it('reasoning token growth counts as activity', async () => {
    const h = buildWatchdog();
    createChild(h);
    sendTokens(h, { input: 10, output: 0, reasoning: 1, cacheRead: 0, cacheWrite: 0 });
    h.setTime(h.getTime() + 8000);
    sendTokens(h, { input: 10, output: 0, reasoning: 50, cacheRead: 0, cacheWrite: 0 });
    h.setTime(1_000_000 + 10000);
    await h.tick();

    expect(h.interrupt).not.toHaveBeenCalled();
  });

  it('running activity refreshes lastActivityAt', async () => {
    const h = buildWatchdog();
    createChild(h);
    h.setTime(h.getTime() + 2000);
    h.watchdog.handle({ type: 'running', id: 'child-1' });
    h.setTime(1_000_000 + 6000);
    await h.tick();

    expect(h.interrupt).not.toHaveBeenCalled();
  });
});

describe('watchdog stuck detection and abort', () => {
  it('does not abort during the grace period', async () => {
    const h = buildWatchdog();
    createChild(h);
    h.setTime(h.getTime() + 500);
    await h.tick();

    expect(h.interrupt).not.toHaveBeenCalled();
  });

  it('does not abort a busy session with recent activity', async () => {
    const h = buildWatchdog();
    createChild(h);
    h.setTime(h.getTime() + 4000);
    await h.tick();

    expect(h.interrupt).not.toHaveBeenCalled();
  });

  it('does not abort a session in retry status', async () => {
    const h = buildWatchdog();
    createChild(h);
    h.watchdog.handle({ type: 'running', id: 'child-1', status: 'retry' });
    h.setTime(h.getTime() + 30000);
    await h.tick();

    expect(h.interrupt).not.toHaveBeenCalled();
  });

  it('resumes abort evaluation when a retry returns to busy', async () => {
    const h = buildWatchdog();
    createChild(h);
    h.watchdog.handle({ type: 'running', id: 'child-1', status: 'retry' });
    h.watchdog.handle({ type: 'running', id: 'child-1', status: 'busy' });
    h.setTime(h.getTime() + 30000);
    await h.tick();

    expect(h.interrupt).toHaveBeenCalledWith('child-1');
  });

  it('aborts a stuck session and logs warn + info health entries', async () => {
    const h = buildWatchdog();
    createChild(h);
    h.setTime(h.getTime() + 6000);
    await h.tick();

    expect(h.interrupt).toHaveBeenCalledWith('child-1');
    expect(healthEvents(h)).toContain('watchdog-abort');
    expect(healthEvents(h)).toContain('watchdog-abort-ok');
    expect(h.writeHealth).toHaveBeenCalledWith(
      'warn',
      expect.objectContaining({
        event: 'watchdog-abort',
        sessionId: 'child-1',
        agent: 'kiki-planner',
        reason: 'stuck',
      }),
    );
  });

  it('aborts on absolute timeout even with recent activity', async () => {
    const h = buildWatchdog();
    createChild(h);
    h.setTime(h.getTime() + 59000);
    sendText(h, { text: 'still working' });
    h.setTime(1_000_000 + 61000);
    await h.tick();

    expect(h.interrupt).toHaveBeenCalledWith('child-1');
    expect(h.writeHealth).toHaveBeenCalledWith(
      'warn',
      expect.objectContaining({ event: 'watchdog-abort', reason: 'absolute-timeout' }),
    );
  });

  it('emits a debug warning at 50% silence before aborting', async () => {
    const h = buildWatchdog();
    createChild(h);
    h.setTime(h.getTime() + 3000);
    await h.tick();

    expect(h.interrupt).not.toHaveBeenCalled();
    expect(h.writeHealth).toHaveBeenCalledWith(
      'debug',
      expect.objectContaining({ event: 'watchdog-quiet', sessionId: 'child-1', silentMs: 3000 }),
    );
  });

  it('is a no-op when watchdogEnabled is false', async () => {
    const h = buildWatchdog({ config: { watchdogEnabled: false } });
    createChild(h);
    h.setTime(h.getTime() + 30000);
    await h.tick();

    expect(h.interrupt).not.toHaveBeenCalled();
  });

  it('logs a sanitized error entry when interrupt rejects and does not throw', async () => {
    const interrupt = vi.fn<Interrupt>(async () => {
      throw new Error('boom upstream detail');
    });
    const h = buildWatchdog({ interrupt });
    createChild(h);
    h.setTime(h.getTime() + 6000);
    await h.tick();

    expect(healthEvents(h)).toContain('watchdog-abort-failed');
    const written = JSON.stringify(h.writeHealth.mock.calls);
    expect(written).not.toContain('boom upstream detail');
    expect(h.interrupt).toHaveBeenCalledTimes(1);
  });

  it('survives a health log write failure', async () => {
    const writeHealth = vi.fn<WriteHealth>(() => {
      throw new Error('disk full');
    });
    const h = buildWatchdog({ writeHealth });
    createChild(h);
    h.setTime(h.getTime() + 6000);

    await expect(h.tick()).resolves.toBeUndefined();
    expect(h.interrupt).toHaveBeenCalledWith('child-1');
  });

  it('aborts multiple stuck sessions in a single tick', async () => {
    const h = buildWatchdog();
    createChild(h, { id: 'child-a' });
    createChild(h, { id: 'child-b' });
    h.setTime(h.getTime() + 6000);
    await h.tick();

    expect(h.interrupt).toHaveBeenCalledTimes(2);
    expect(h.interrupt).toHaveBeenCalledWith('child-a');
    expect(h.interrupt).toHaveBeenCalledWith('child-b');
  });

  it('logs a sanitized error when interrupt throws synchronously', async () => {
    const interrupt = vi.fn<Interrupt>(() => {
      throw new Error('sync upstream detail');
    });
    const h = buildWatchdog({ interrupt });
    createChild(h);
    h.setTime(h.getTime() + 6000);

    await expect(h.tick()).resolves.toBeUndefined();
    expect(healthEvents(h)).toContain('watchdog-abort-failed');
    expect(JSON.stringify(h.writeHealth.mock.calls)).not.toContain('sync upstream detail');
  });

  it('interrupts each child at most once across consecutive ticks', async () => {
    const h = buildWatchdog();
    createChild(h);
    h.setTime(h.getTime() + 6000);
    await h.tick();
    await h.tick();
    await h.tick();

    expect(h.interrupt).toHaveBeenCalledTimes(1);
  });
});

describe('watchdog loop detection', () => {
  it('aborts on 3 consecutive identical logical text items', async () => {
    const h = buildWatchdog();
    createChild(h);
    sendText(h, { key: 'text:m1:0', text: 'same output' });
    sendText(h, { key: 'text:m1:1', text: 'same output' });
    sendText(h, { key: 'text:m1:2', text: 'same output' });
    await h.tick();

    expect(h.interrupt).toHaveBeenCalledWith('child-1');
    expect(h.writeHealth).toHaveBeenCalledWith(
      'warn',
      expect.objectContaining({ event: 'watchdog-abort', reason: 'content-loop' }),
    );
  });

  it('normalizes whitespace and case for content loop detection', async () => {
    const h = buildWatchdog();
    createChild(h);
    sendText(h, { key: 'text:m1:0', text: 'Same   Output' });
    sendText(h, { key: 'text:m1:1', text: 'same output' });
    sendText(h, { key: 'text:m1:2', text: '  SAME OUTPUT ' });
    await h.tick();

    expect(h.interrupt).toHaveBeenCalled();
  });

  it('does not flag repeated updates to the same logical text item', async () => {
    const h = buildWatchdog();
    createChild(h);
    for (const fragment of ['i', 'iden', 'identical']) {
      sendText(h, { key: 'text:m1:0', text: fragment, mode: 'append' });
    }
    await h.tick();

    expect(h.interrupt).not.toHaveBeenCalled();
  });

  it('does not flag varied text as a loop', async () => {
    const h = buildWatchdog();
    createChild(h);
    sendText(h, { key: 'text:m1:0', text: 'one' });
    sendText(h, { key: 'text:m1:1', text: 'two' });
    sendText(h, { key: 'text:m1:2', text: 'three' });
    await h.tick();

    expect(h.interrupt).not.toHaveBeenCalled();
  });

  it('accumulates streaming deltas into one logical ring item', async () => {
    const h = buildWatchdog();
    createChild(h);
    sendText(h, { key: 'text:m1:0', text: '', mode: 'replace' });
    for (const delta of ['s', 'a', 'm', 'e']) {
      sendText(h, { key: 'text:m1:0', text: delta, mode: 'append' });
    }
    sendText(h, { key: 'text:m1:0', text: 'same', mode: 'replace' });
    await h.tick();

    expect(h.interrupt).not.toHaveBeenCalled();
  });

  it('detects three logical streaming items with the same accumulated text', async () => {
    const h = buildWatchdog();
    createChild(h);
    for (const key of ['text:m1:0', 'text:m1:1', 'text:m1:2']) {
      sendText(h, { key, text: 'sa', mode: 'replace' });
      sendText(h, { key, text: 'me', mode: 'append' });
    }
    await h.tick();

    expect(h.interrupt).toHaveBeenCalledWith('child-1');
  });

  it('aborts on 3 consecutive identical tool calls', async () => {
    const h = buildWatchdog();
    createChild(h);
    sendTool(h, { key: 'tool-1', name: 'read', input: { filePath: '/a' } });
    sendTool(h, { key: 'tool-2', name: 'read', input: { filePath: '/a' } });
    sendTool(h, { key: 'tool-3', name: 'read', input: { filePath: '/a' } });
    await h.tick();

    expect(h.interrupt).toHaveBeenCalledWith('child-1');
    expect(h.writeHealth).toHaveBeenCalledWith(
      'warn',
      expect.objectContaining({ event: 'watchdog-abort', reason: 'tool-loop' }),
    );
  });

  it('does not flag repeated lifecycle updates to the same tool id', async () => {
    const h = buildWatchdog();
    createChild(h);
    sendCallStarted(h, { key: 'tool-1', name: 'read' });
    sendTool(h, { key: 'tool-1', name: '', input: { filePath: '/a' } });
    h.watchdog.handle({ type: 'tool', id: 'child-1', key: 'tool-1', name: '', input: undefined });
    await h.tick();

    expect(h.interrupt).not.toHaveBeenCalled();
  });

  it('does not flag the same tool with different inputs as a loop', async () => {
    const h = buildWatchdog();
    createChild(h);
    sendTool(h, { key: 'tool-1', name: 'read', input: { filePath: '/a' } });
    sendTool(h, { key: 'tool-2', name: 'read', input: { filePath: '/b' } });
    sendTool(h, { key: 'tool-3', name: 'read', input: { filePath: '/c' } });
    await h.tick();

    expect(h.interrupt).not.toHaveBeenCalled();
  });
});

describe('watchdog agent filtering and discovery', () => {
  it('does not abort a resolved non-kiki agent when watchAllSubagents is false', async () => {
    const h = buildWatchdog();
    createChild(h, { agent: 'general' });
    h.setTime(h.getTime() + 30000);
    await h.tick();

    expect(h.interrupt).not.toHaveBeenCalled();
  });

  it('watches a non-kiki agent when watchAllSubagents is true', async () => {
    const h = buildWatchdog({ config: { watchAllSubagents: true } });
    createChild(h, { agent: 'general' });
    h.setTime(h.getTime() + 6000);
    await h.tick();

    expect(h.interrupt).toHaveBeenCalled();
  });

  it('discovers child sessions through the public list adapter', async () => {
    const h = buildWatchdog();
    h.discover.mockResolvedValue([
      { type: 'child', id: 'missed-1', parentID: 'parent-1', agent: 'kiki-reviewer' },
    ]);
    await h.tick();
    h.setTime(h.getTime() + 6000);
    await h.tick();

    expect(h.interrupt).toHaveBeenCalledWith('missed-1');
  });

  it('tolerates discovery failures', async () => {
    const h = buildWatchdog();
    h.discover.mockRejectedValue(new Error('offline'));
    h.setTime(h.getTime() + 6000);

    await expect(h.tick()).resolves.toBeUndefined();
    expect(h.interrupt).not.toHaveBeenCalled();
  });

  it('uses the discovered agent to apply the watch policy', async () => {
    const h = buildWatchdog();
    h.discover.mockResolvedValue([
      { type: 'child', id: 'missed-1', parentID: 'parent-1', agent: 'general' },
    ]);
    await h.tick();
    h.setTime(h.getTime() + 30000);
    await h.tick();

    expect(h.interrupt).not.toHaveBeenCalled();
  });

  it('uses the public session adapter for discovery and interruption', async () => {
    const session = {
      list: vi.fn(async () => ({
        data: [
          { id: 'root-1', parentID: undefined, agent: 'kiki-orchestrator' },
          { id: 'child-1', parentID: 'root-1', agent: 'kiki-reviewer' },
        ],
      })),
      interrupt: vi.fn(async (_input: { sessionID: string }) => ({ interrupted: true })),
    };

    const adapter = createWatchdogSessionAdapter(session);

    await expect(adapter.discover()).resolves.toEqual([
      { type: 'child', id: 'child-1', parentID: 'root-1', agent: 'kiki-reviewer' },
    ]);
    await adapter.interrupt('child-1');
    expect(session.interrupt).toHaveBeenCalledWith({ sessionID: 'child-1' });
  });

  it('pages through session.list and filters archived or foreign-location children', async () => {
    const session = {
      list: vi.fn(async (input?: { cursor?: string; limit?: number; archived?: boolean; directory?: string }) => {
        if (!input?.cursor) {
          return {
            data: [
              { id: 'root-1', parentID: undefined, location: { directory: '/project' } },
              {
                id: 'child-1',
                parentID: 'root-1',
                agent: 'kiki-reviewer',
                location: { directory: '/project' },
                time: { created: 1, updated: 1 },
              },
              {
                id: 'archived-1',
                parentID: 'root-1',
                agent: 'kiki-reviewer',
                location: { directory: '/project' },
                time: { created: 1, updated: 1, archived: 2 },
              },
              {
                id: 'foreign-1',
                parentID: 'root-1',
                agent: 'kiki-reviewer',
                location: { directory: '/elsewhere' },
                time: { created: 1, updated: 1 },
              },
            ],
            cursor: { next: 'page-2' },
          };
        }
        return {
          data: [
            {
              id: 'child-2',
              parentID: 'root-1',
              agent: 'kiki-planner',
              location: { directory: '/project' },
              time: { created: 1, updated: 1 },
            },
          ],
          cursor: {},
        };
      }),
      interrupt: vi.fn(async (_input: { sessionID: string }) => ({ interrupted: true })),
    };

    const adapter = createWatchdogSessionAdapter(session, '/project');

    await expect(adapter.discover()).resolves.toEqual([
      { type: 'child', id: 'child-1', parentID: 'root-1', agent: 'kiki-reviewer' },
      { type: 'child', id: 'child-2', parentID: 'root-1', agent: 'kiki-planner' },
    ]);
    expect(session.list).toHaveBeenCalledTimes(2);
    expect(session.list.mock.calls[0][0]).toMatchObject({ archived: false, directory: '/project' });
    expect(session.list.mock.calls[0][0]?.limit).toBeGreaterThan(0);
    expect(session.list.mock.calls[1][0]).toMatchObject({
      cursor: 'page-2',
      archived: false,
      directory: '/project',
    });
  });

  it('stops paging when the cursor repeats', async () => {
    const session = {
      list: vi.fn(async () => ({
        data: [{ id: 'child-1', parentID: 'root-1', agent: 'kiki-planner' }],
        cursor: { next: 'same' },
      })),
      interrupt: vi.fn(async (_input: { sessionID: string }) => ({ interrupted: true })),
    };

    const adapter = createWatchdogSessionAdapter(session);

    await expect(adapter.discover()).resolves.toEqual([
      { type: 'child', id: 'child-1', parentID: 'root-1', agent: 'kiki-planner' },
    ]);
    expect(session.list).toHaveBeenCalledTimes(2);
  });

  it('does not interrupt a child that finished while an earlier interrupt was in flight', async () => {
    let releaseFirst!: () => void;
    const interrupt = vi.fn<Interrupt>((id) => {
      if (id === 'child-a') {
        return new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      }
      return Promise.resolve();
    });
    const h = buildWatchdog({ interrupt });
    createChild(h, { id: 'child-a' });
    createChild(h, { id: 'child-b' });
    h.setTime(h.getTime() + 6000);

    await h.tick();
    await flushMicrotasks();
    expect(interrupt).toHaveBeenCalledTimes(1);
    expect(interrupt).toHaveBeenCalledWith('child-a');

    h.watchdog.handle({ type: 'finished', id: 'child-b' });
    releaseFirst();
    await flushMicrotasks();

    expect(interrupt).not.toHaveBeenCalledWith('child-b');
    expect(interrupt).toHaveBeenCalledTimes(1);
  });

  it('keeps at most one interrupt when discovery re-reports a finished child', async () => {
    const h = buildWatchdog();
    h.discover.mockResolvedValue([
      { type: 'child', id: 'child-1', parentID: 'parent-1', agent: 'kiki-planner' },
    ]);
    await h.tick();
    h.setTime(h.getTime() + 6000);
    await h.tick();
    await h.tick();
    await h.tick();

    expect(h.interrupt).toHaveBeenCalledTimes(1);
  });
});

describe('watchdog lifecycle and cleanup races', () => {
  it('stop before start is safe and prevents later ticks', async () => {
    const h = buildWatchdog({ autoStart: false });
    await h.stop();
    h.start();
    await h.tick();

    expect(h.discover).not.toHaveBeenCalled();
    expect(h.interrupt).not.toHaveBeenCalled();
  });

  it('double stop resolves safely', async () => {
    const h = buildWatchdog();
    await expect(h.stop()).resolves.toBeUndefined();
    await expect(h.stop()).resolves.toBeUndefined();
  });

  it('never handles late discovery results after awaited stop', async () => {
    let resolveDiscover!: (events: WatchdogEvent[]) => void;
    const discover = vi.fn<Discover>(
      () =>
        new Promise<WatchdogEvent[]>((resolve) => {
          resolveDiscover = resolve;
        }),
    );
    const h = buildWatchdog({ discover });

    vi.advanceTimersByTime(100);
    const stopping = h.stop();
    resolveDiscover([
      { type: 'child', id: 'late-1', parentID: 'parent-1', agent: 'kiki-planner' },
    ]);
    await stopping;

    expect(h.interrupt).not.toHaveBeenCalled();
    expect(h.writeHealth).not.toHaveBeenCalled();
  });

  it('suppresses post-stop health writes from an in-flight interrupt', async () => {
    let resolveInterrupt!: () => void;
    const interrupt = vi.fn<Interrupt>(
      () =>
        new Promise<void>((resolve) => {
          resolveInterrupt = resolve;
        }),
    );
    const h = buildWatchdog({ interrupt });
    createChild(h);
    h.setTime(h.getTime() + 6000);

    vi.advanceTimersByTime(100);
    await flushMicrotasks();
    expect(h.interrupt).toHaveBeenCalledWith('child-1');

    const stopping = h.stop();
    resolveInterrupt();
    await stopping;

    expect(healthEvents(h)).toContain('watchdog-abort');
    expect(healthEvents(h)).not.toContain('watchdog-abort-ok');
    expect(healthEvents(h)).not.toContain('watchdog-abort-failed');
    const interrupts = h.interrupt.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.interrupt.mock.calls.length).toBe(interrupts);
  });

  it('does not start an interrupt when stop happens while discovery is pending', async () => {
    let resolveDiscover!: (events: WatchdogEvent[]) => void;
    const discover = vi.fn<Discover>(
      () =>
        new Promise<WatchdogEvent[]>((resolve) => {
          resolveDiscover = resolve;
        }),
    );
    const h = buildWatchdog({ discover });
    createChild(h);
    h.setTime(h.getTime() + 6000);

    vi.advanceTimersByTime(100);
    const stopping = h.stop();
    resolveDiscover([]);
    await stopping;

    expect(h.interrupt).not.toHaveBeenCalled();
    expect(healthEvents(h)).not.toContain('watchdog-abort');
  });

  it('does not interrupt a session after an interrupted terminal event', async () => {
    const h = buildWatchdog();
    createChild(h);
    h.watchdog.handle({ type: 'finished', id: 'child-1' });
    h.setTime(h.getTime() + 6000);
    await h.tick();

    expect(h.interrupt).not.toHaveBeenCalled();
  });
});
