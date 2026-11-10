import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import plugin, { loadHealthConfig, type ServerContext } from '../../src/server/index';
import { DEFAULT_HEALTH } from '../../src/cli/config';
import type { OpenCodeEvent } from '../../src/server/watchdog-events';

type CreatedEvent = Extract<OpenCodeEvent, { type: 'session.created' }>;
type IdleEvent = Extract<OpenCodeEvent, { type: 'session.idle' }>;

const meta = { id: 'event-1', created: 1_000 } as const;

function childEvent(
  sessionID: string,
  parentID = 'parent-1',
  agent = 'kiki-planner',
): CreatedEvent {
  return {
    ...meta,
    type: 'session.created',
    durable: { aggregateID: sessionID, seq: 1, version: 1 },
    data: {
      sessionID,
      projectID: 'project-1',
      location: { directory: '/project' },
      parentID,
      slug: sessionID,
      agent,
      version: '1',
    },
  };
}

function idleEvent(sessionID: string): IdleEvent {
  return { ...meta, type: 'session.idle', data: { sessionID } };
}

interface HookRecord {
  name: string;
  handler: (event: { tool: string; input: unknown }) => Promise<void> | void;
  disposeCalls: number;
  disposed: boolean;
}

class FakeEventStream implements AsyncIterable<OpenCodeEvent> {
  readonly id: number;
  returnCalls = 0;
  private readonly queue: OpenCodeEvent[] = [];
  private readonly waiters: Array<(result: IteratorResult<OpenCodeEvent>) => void> = [];
  private closed = false;

  constructor(id: number, private readonly signal?: AbortSignal, private readonly stubborn = false) {
    this.id = id;
    signal?.addEventListener('abort', () => this.close());
  }

  get isClosed(): boolean {
    return this.closed;
  }

  [Symbol.asyncIterator](): AsyncIterator<OpenCodeEvent> {
    return this;
  }

  next(): Promise<IteratorResult<OpenCodeEvent>> {
    const next = this.queue.shift();
    if (next !== undefined) return Promise.resolve({ value: next, done: false });
    if (this.closed) return Promise.resolve({ value: undefined, done: true });
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  return(): Promise<IteratorResult<OpenCodeEvent>> {
    this.returnCalls += 1;
    if (this.stubborn) return new Promise(() => {});
    this.close();
    return Promise.resolve({ value: undefined, done: true });
  }

  push(event: OpenCodeEvent): void {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value: event, done: false });
    else this.queue.push(event);
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) waiter({ value: undefined, done: true });
  }
}

interface FakeContext {
  ctx: ServerContext;
  hooks: HookRecord[];
  streams: FakeEventStream[];
  event: { subscribe: (options?: { signal?: AbortSignal }) => FakeEventStream };
  session: {
    list: ReturnType<typeof vi.fn>;
    interrupt: ReturnType<typeof vi.fn>;
  };
}

function makeContext(root: string, options: { stubborn?: boolean } = {}): FakeContext {
  const hooks: HookRecord[] = [];
  const streams: FakeEventStream[] = [];
  const tool = {
    hook: async (
      name: string,
      handler: (event: { tool: string; input: unknown }) => Promise<void> | void,
    ) => {
      const record: HookRecord = { name, handler, disposeCalls: 0, disposed: false };
      hooks.push(record);
      return {
        dispose: async () => {
          record.disposeCalls += 1;
          record.disposed = true;
        },
      };
    },
  };
  const event = {
    subscribe: (subscribeOptions?: { signal?: AbortSignal }) => {
      const stream = new FakeEventStream(streams.length + 1, subscribeOptions?.signal, options.stubborn);
      streams.push(stream);
      return stream;
    },
  };
  const session = {
    list: vi.fn(async () => ({ data: [], cursor: {} })),
    interrupt: vi.fn(async () => ({ interrupted: true })),
  };
  const ctx = {
    location: { directory: root },
    tool,
    event,
    session,
  } as unknown as ServerContext;
  return { ctx, hooks, streams, event, session };
}

function writeHealthConfig(root: string, health: Record<string, unknown>): void {
  const directory = join(root, '.agentic', 'kiki');
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'config.json'), JSON.stringify({ health }));
}

function readHealth(root: string, logPath: string): Array<Record<string, unknown>> {
  const file = join(root, logPath);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

describe('server lifecycle', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kiki-server-lifecycle-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('wires one logger hook and one event subscription, and cleanup releases them plus the watchdog', async () => {
    vi.useFakeTimers();
    writeHealthConfig(root, { checkIntervalMs: 10 });
    const h = makeContext(root);
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    const cleanup = await plugin.setup(h.ctx);

    expect(h.hooks).toHaveLength(1);
    expect(h.streams).toHaveLength(1);
    expect(clearIntervalSpy).not.toHaveBeenCalled();

    await cleanup();

    expect(h.hooks[0].disposed).toBe(true);
    expect(h.streams[0].returnCalls).toBe(1);
    expect(h.streams[0].isClosed).toBe(true);
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('setup -> cleanup -> setup leaves exactly one active logger and stream', async () => {
    vi.useFakeTimers();
    writeHealthConfig(root, { checkIntervalMs: 10 });
    const h = makeContext(root);

    const first = await plugin.setup(h.ctx);
    await first();
    const second = await plugin.setup(h.ctx);

    expect(h.hooks.filter((hook) => !hook.disposed)).toHaveLength(1);
    expect(h.streams.filter((stream) => !stream.isClosed)).toHaveLength(1);

    await second();
    expect(h.hooks.every((hook) => hook.disposed)).toBe(true);
    expect(h.streams.every((stream) => stream.isClosed)).toBe(true);
  });

  it('releases acquired resources when setup fails part way through', async () => {
    vi.useFakeTimers();
    writeHealthConfig(root, { checkIntervalMs: 10 });
    const h = makeContext(root);
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    h.event.subscribe = () => {
      throw new Error('subscribe failed');
    };

    await expect(plugin.setup(h.ctx)).rejects.toThrow('subscribe failed');

    expect(h.hooks).toHaveLength(1);
    expect(h.hooks[0].disposed).toBe(true);
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('repeated cleanup is safe and disposes the logger hook once', async () => {
    vi.useFakeTimers();
    writeHealthConfig(root, { checkIntervalMs: 10 });
    const h = makeContext(root);
    const cleanup = await plugin.setup(h.ctx);

    await cleanup();
    await cleanup();

    expect(h.hooks[0].disposeCalls).toBe(1);
    expect(h.streams[0].returnCalls).toBe(1);
  });

  it('does not process a late stream event after cleanup', async () => {
    vi.useRealTimers();
    writeHealthConfig(root, { checkIntervalMs: 10, gracePeriodMs: 1, stuckThresholdMs: 1 });
    const h = makeContext(root, { stubborn: true });
    const cleanup = await plugin.setup(h.ctx);

    h.streams[0].push(childEvent('late-child'));
    await flushMicrotasks();
    await cleanup();

    h.streams[0].push(idleEvent('late-child'));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(h.session.interrupt).not.toHaveBeenCalled();
    expect(readHealth(root, DEFAULT_HEALTH.logPath)).toEqual([]);
  });

  it('does not let pending discovery resurrect work after cleanup', async () => {
    vi.useFakeTimers();
    writeHealthConfig(root, { checkIntervalMs: 10, gracePeriodMs: 1, stuckThresholdMs: 1 });
    const h = makeContext(root);
    let resolveDiscovery!: (value: unknown) => void;
    h.session.list.mockImplementation(
      () => new Promise((resolve) => {
        resolveDiscovery = resolve;
      }),
    );
    const cleanup = await plugin.setup(h.ctx);

    await vi.advanceTimersByTimeAsync(10);
    const cleanupPromise = cleanup();
    resolveDiscovery({ data: [], cursor: {} });
    await cleanupPromise;

    expect(h.session.interrupt).not.toHaveBeenCalled();
    expect(readHealth(root, DEFAULT_HEALTH.logPath)).toEqual([]);
  });

  it('loads health settings from the project config and writes health entries under the project root', async () => {
    vi.useFakeTimers();
    writeHealthConfig(root, {
      watchdogEnabled: true,
      gracePeriodMs: 1,
      stuckThresholdMs: 1,
      absoluteMaxMs: 100000,
      checkIntervalMs: 10,
      logPath: 'custom/health.jsonl',
    });
    const h = makeContext(root);

    const cleanup = await plugin.setup(h.ctx);
    h.streams[0].push(childEvent('child-health'));
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(10);
    await flushMicrotasks();

    const entries = readHealth(root, 'custom/health.jsonl');
    expect(entries.some((entry) => entry.event === 'watchdog-abort' && entry.sessionId === 'child-health')).toBe(true);
    await cleanup();
  });

  it('sanitizes invalid health values and falls back to defaults', () => {
    writeHealthConfig(root, {
      watchdogEnabled: 'yes',
      stuckThresholdMs: -1,
      gracePeriodMs: 0,
      absoluteMaxMs: 'long',
      checkIntervalMs: 1.5,
      loopRepeatCount: 1,
      watchAllSubagents: 'no',
      logPath: '',
    });

    expect(loadHealthConfig(root)).toEqual(DEFAULT_HEALTH);
  });

  it('merges valid project health overrides over the defaults', () => {
    writeHealthConfig(root, { stuckThresholdMs: 12345, watchAllSubagents: true });

    expect(loadHealthConfig(root)).toEqual({
      ...DEFAULT_HEALTH,
      stuckThresholdMs: 12345,
      watchAllSubagents: true,
    });
  });
});
