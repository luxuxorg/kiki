import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import plugin, {
  loadDiagnosticsConfig,
  type ServerContext,
} from '../../src/server/index';
import { createUsageDiagnostics } from '../../src/server/usage-diagnostics';
import { readLedger, type DispatchRecord, type LedgerRecord, type SessionRecord } from '../../src/diagnostics/ledger';
import type { OpenCodeEvent, TokenCounters } from '../../src/server/watchdog-events';

type EventOf<T extends OpenCodeEvent['type']> = Extract<OpenCodeEvent, { type: T }>;

const START = Date.parse('2026-11-16T10:00:00.000Z');
const SENTINEL = 'PROMPT_BODY_ERROR_SENTINEL_9f3c';

interface Clock {
  now: number;
}

let eventSequence = 1;

function meta(id: string): { id: string; created: number } {
  return { id, created: 1_000 };
}

function durable(aggregateID: string) {
  return { aggregateID, seq: eventSequence++, version: 1 };
}

function tokens(
  input: number,
  output = 0,
  reasoning = 0,
  cacheRead = 0,
  cacheWrite = 0,
): TokenCounters {
  return { input, output, reasoning, cacheRead, cacheWrite };
}

function rawTokens(value: TokenCounters): {
  input: number;
  output: number;
  reasoning: number;
  cache: { read: number; write: number };
} {
  return {
    input: value.input,
    output: value.output,
    reasoning: value.reasoning,
    cache: { read: value.cacheRead, write: value.cacheWrite },
  };
}

function createdEvent(
  sessionID: string,
  parentID: string | undefined,
  agent?: string,
  id = `created-${sessionID}`,
): EventOf<'session.created'> {
  return {
    ...meta(id),
    type: 'session.created',
    durable: durable(sessionID),
    data: {
      sessionID,
      projectID: 'project-1',
      location: { directory: '/project' },
      ...(parentID === undefined ? {} : { parentID }),
      slug: sessionID,
      ...(agent === undefined ? {} : { agent }),
      version: '1',
    },
  };
}

function agentSelectedEvent(
  sessionID: string,
  agent: string,
  id = `agent-${sessionID}`,
): EventOf<'session.agent.selected'> {
  return {
    ...meta(id),
    type: 'session.agent.selected',
    durable: durable(sessionID),
    data: { sessionID, agent },
  };
}

function usageEvent(
  sessionID: string,
  counters: TokenCounters,
  id = `usage-${sessionID}`,
): EventOf<'session.usage.updated'> {
  return {
    ...meta(id),
    type: 'session.usage.updated',
    data: { sessionID, cost: 0, tokens: rawTokens(counters) },
  };
}

function stepEndedEvent(
  sessionID: string,
  counters: TokenCounters,
  id = `step-${sessionID}`,
): EventOf<'session.step.ended'> {
  return {
    ...meta(id),
    type: 'session.step.ended',
    durable: durable(sessionID),
    data: {
      sessionID,
      assistantMessageID: 'msg-1',
      finish: 'stop',
      cost: 0,
      tokens: rawTokens(counters),
    },
  };
}

function succeededEvent(
  sessionID: string,
  id = `succeeded-${sessionID}`,
): EventOf<'session.execution.succeeded'> {
  return {
    ...meta(id),
    type: 'session.execution.succeeded',
    durable: durable(sessionID),
    data: { sessionID },
  };
}

function failedEvent(
  sessionID: string,
  id = `failed-${sessionID}`,
): EventOf<'session.execution.failed'> {
  return {
    ...meta(id),
    type: 'session.execution.failed',
    durable: durable(sessionID),
    data: {
      sessionID,
      error: { type: 'unknown', message: SENTINEL },
    },
  };
}

function interruptedEvent(
  sessionID: string,
  id = `interrupted-${sessionID}`,
): EventOf<'session.execution.interrupted'> {
  return {
    ...meta(id),
    type: 'session.execution.interrupted',
    durable: durable(sessionID),
    data: { sessionID, reason: 'user' },
  };
}

function deletedEvent(
  sessionID: string,
  id = `deleted-${sessionID}`,
): EventOf<'session.deleted'> {
  return {
    ...meta(id),
    type: 'session.deleted',
    durable: durable(sessionID),
    data: { sessionID },
  };
}

function idleEvent(
  sessionID: string,
  id = `idle-${sessionID}`,
): EventOf<'session.idle'> {
  return { ...meta(id), type: 'session.idle', data: { sessionID } };
}

function startedEvent(
  sessionID: string,
  id = `started-${sessionID}`,
): EventOf<'session.execution.started'> {
  return {
    ...meta(id),
    type: 'session.execution.started',
    durable: durable(sessionID),
    data: { sessionID },
  };
}

function retryEvent(
  sessionID: string,
  id = `retry-${sessionID}`,
): EventOf<'session.retry.scheduled'> {
  return {
    ...meta(id),
    type: 'session.retry.scheduled',
    durable: durable(sessionID),
    data: {
      sessionID,
      assistantMessageID: 'msg-1',
      attempt: 1,
      at: 1_000,
      error: { type: 'unknown', message: SENTINEL },
    },
  };
}

function dispatchRecord(overrides: Partial<DispatchRecord> = {}): DispatchRecord {
  return {
    v: 1,
    id: 'dispatch:parent-session:call-1',
    timestamp: '2026-11-16T10:00:00.000Z',
    type: 'dispatch',
    parentSessionId: 'parent-session',
    callId: 'call-1',
    agent: 'kiki-implementer',
    declared: {
      taskId: 'diag',
      kind: 'fix',
      comparisonGroup: 'trial',
      model: 'openai/gpt-6.1-sol',
    },
    childSessionId: 'unknown',
    ...overrides,
  };
}

interface CollectorHarness {
  records: LedgerRecord[];
  usage: ReturnType<typeof createUsageDiagnostics>;
  clock: Clock;
  advance(ms?: number): void;
}

function makeCollector(options: { fail?: boolean; throw?: boolean } = {}): CollectorHarness {
  const records: LedgerRecord[] = [];
  const clock: Clock = { now: START };
  const usage = createUsageDiagnostics({
    write: (record) => {
      if (options.throw) throw new Error('writer failed');
      if (options.fail) return false;
      records.push(record);
      return true;
    },
    now: () => clock.now,
  });
  return {
    records,
    usage,
    clock,
    advance: (ms = 1_000) => {
      clock.now += ms;
    },
  };
}

function sessionRecords(records: LedgerRecord[], sessionId: string): SessionRecord[] {
  return records.filter(
    (record): record is SessionRecord =>
      record.type === 'session' && record.sessionId === sessionId,
  );
}

function latestSession(records: LedgerRecord[], sessionId: string): SessionRecord {
  const matches = sessionRecords(records, sessionId);
  expect(matches.length).toBeGreaterThan(0);
  return matches[matches.length - 1];
}

describe('createUsageDiagnostics', () => {
  it('writes an observed dispatch and stops accepting late records', () => {
    const h = makeCollector();
    const record = dispatchRecord();

    h.usage.dispatch(record);
    h.usage.stop();
    h.usage.dispatch(dispatchRecord({ id: 'dispatch:late' }));
    h.usage.event(createdEvent('later-child', 'parent-session'));

    expect(h.records).toEqual([record]);
  });

  it('registers only child sessions, persisting an initial partial snapshot', () => {
    const h = makeCollector();

    h.usage.event(createdEvent('root-session', undefined, 'kiki-orchestrator'));
    expect(h.records).toEqual([]);

    h.usage.event(createdEvent('child-session', 'parent-session', 'kiki-planner'));
    expect(h.records).toHaveLength(1);
    const record = h.records[0] as SessionRecord;
    expect(record).toMatchObject({
      v: 1,
      id: 'session:child-session:created-child-session',
      type: 'session',
      sessionId: 'child-session',
      parentSessionId: 'parent-session',
      agent: 'kiki-planner',
      endedAt: null,
      status: 'running',
      tokens: null,
      tokenSource: 'unknown',
      retries: 0,
      partial: true,
    });
    expect(record.timestamp).toBe('2026-11-16T10:00:00.000Z');
    expect(record.startedAt).toBe('2026-11-16T10:00:00.000Z');
  });

  it('keeps agent updates and persists the final snapshot on success', () => {
    const h = makeCollector();
    h.usage.event(createdEvent('child-session', 'parent-session', 'kiki-planner'));
    h.usage.event(agentSelectedEvent('child-session', 'kiki-reviewer'));
    h.usage.event(usageEvent('child-session', tokens(10, 20, 30, 40, 50)));
    h.advance(2_000);
    h.usage.event(succeededEvent('child-session'));

    const latest = latestSession(h.records, 'child-session');
    expect(latest).toMatchObject({
      id: 'session:child-session:succeeded-child-session',
      sessionId: 'child-session',
      parentSessionId: 'parent-session',
      agent: 'kiki-reviewer',
      status: 'succeeded',
      tokens: tokens(10, 20, 30, 40, 50),
      tokenSource: 'session.usage.updated',
      retries: 0,
      partial: false,
    });
    expect(latest.endedAt).toBe('2026-11-16T10:00:02.000Z');
  });

  it('retains the latest aggregate and never sums or replaces it with step counters', () => {
    const h = makeCollector();
    h.usage.event(createdEvent('child-session', 'parent-session'));
    h.usage.event(usageEvent('child-session', tokens(10), 'usage-1'));
    h.usage.event(usageEvent('child-session', tokens(20), 'usage-2'));
    h.usage.event(stepEndedEvent('child-session', tokens(999)));
    h.usage.event(succeededEvent('child-session'));

    expect(latestSession(h.records, 'child-session').tokens?.input).toBe(20);
  });

  it('leaves missing aggregates null and preserves a real zero snapshot', () => {
    const h = makeCollector();
    h.usage.event(createdEvent('missing-usage', 'parent-session'));
    h.usage.event(succeededEvent('missing-usage'));

    const missing = latestSession(h.records, 'missing-usage');
    expect(missing.tokens).toBeNull();
    expect(missing.tokenSource).toBe('unknown');

    h.usage.event(createdEvent('zero-usage', 'parent-session'));
    h.usage.event(usageEvent('zero-usage', tokens(0, 0, 0, 0, 0)));
    h.usage.event(succeededEvent('zero-usage'));

    const zero = latestSession(h.records, 'zero-usage');
    expect(zero.tokens).toEqual(tokens(0, 0, 0, 0, 0));
    expect(zero.tokenSource).toBe('session.usage.updated');
  });

  it('counts retries once by event id and records distinct terminal statuses', () => {
    const h = makeCollector();
    h.usage.event(createdEvent('retry-session', 'parent-session'));
    h.usage.event(retryEvent('retry-session', 'retry-1'));
    h.usage.event(retryEvent('retry-session', 'retry-1'));
    h.usage.event(retryEvent('retry-session', 'retry-2'));
    h.usage.event(succeededEvent('retry-session'));

    expect(latestSession(h.records, 'retry-session').retries).toBe(2);

    h.usage.event(createdEvent('failed-session', 'parent-session'));
    h.usage.event(failedEvent('failed-session'));
    expect(latestSession(h.records, 'failed-session').status).toBe('failed');

    h.usage.event(createdEvent('interrupted-session', 'parent-session'));
    h.usage.event(interruptedEvent('interrupted-session'));
    expect(latestSession(h.records, 'interrupted-session').status).toBe('interrupted');

    h.usage.event(createdEvent('deleted-session', 'parent-session'));
    h.usage.event(deletedEvent('deleted-session'));
    expect(latestSession(h.records, 'deleted-session').status).toBe('deleted');
  });

  it('does not multiply records or tokens for repeated idle/finish signals', () => {
    const h = makeCollector();
    h.usage.event(createdEvent('idle-session', 'parent-session'));
    h.usage.event(usageEvent('idle-session', tokens(5)));
    h.usage.event(idleEvent('idle-session', 'idle-1'));
    h.usage.event(idleEvent('idle-session', 'idle-2'));
    h.usage.event({ ...meta('status-idle'), type: 'session.status', data: { sessionID: 'idle-session', status: { type: 'idle' } } });

    const records = sessionRecords(h.records, 'idle-session');
    expect(records).toHaveLength(2);
    expect(records[1]).toMatchObject({ status: 'idle', tokens: tokens(5), partial: false });
  });

  it('treats a resumed session as one lifetime row and flushes partials on cleanup', () => {
    const h = makeCollector();
    h.usage.event(createdEvent('resumed-session', 'parent-session'));
    h.usage.event(usageEvent('resumed-session', tokens(5), 'usage-first'));
    h.usage.event(succeededEvent('resumed-session', 'succeeded-first'));
    h.advance();
    h.usage.event(startedEvent('resumed-session'));
    h.usage.event(usageEvent('resumed-session', tokens(7), 'usage-second'));

    h.usage.stop();
    const afterStop = h.records.length;

    const latest = latestSession(h.records, 'resumed-session');
    expect(latest).toMatchObject({
      id: 'session:resumed-session:stop',
      status: 'running',
      endedAt: null,
      partial: true,
      tokens: tokens(7),
      tokenSource: 'session.usage.updated',
    });
    expect(sessionRecords(h.records, 'resumed-session').every((row) => row.sessionId === 'resumed-session')).toBe(true);

    h.usage.stop();
    h.usage.event(usageEvent('resumed-session', tokens(99), 'usage-late'));
    expect(h.records).toHaveLength(afterStop);
  });

  it('keeps two same-agent children separate without guessing dispatch ownership', () => {
    const h = makeCollector();
    h.usage.dispatch(dispatchRecord({ id: 'dispatch:parent-session:call-1' }));
    h.usage.dispatch(dispatchRecord({ id: 'dispatch:parent-session:call-2' }));
    h.usage.event(createdEvent('child-a', 'parent-session', 'kiki-implementer'));
    h.usage.event(createdEvent('child-b', 'parent-session', 'kiki-implementer'));
    h.usage.event(usageEvent('child-a', tokens(1), 'usage-a'));
    h.usage.event(usageEvent('child-b', tokens(2), 'usage-b'));
    h.usage.event(succeededEvent('child-a'));
    h.usage.event(succeededEvent('child-b'));

    const dispatchRecords = h.records.filter(
      (record): record is DispatchRecord => record.type === 'dispatch',
    );
    expect(dispatchRecords).toHaveLength(2);
    expect(dispatchRecords.every((row) => row.childSessionId === 'unknown')).toBe(true);
    expect(latestSession(h.records, 'child-a').tokens?.input).toBe(1);
    expect(latestSession(h.records, 'child-b').tokens?.input).toBe(2);
  });

  it('never persists prompt, description or error content sentinels', () => {
    const h = makeCollector();
    h.usage.event(createdEvent('private-session', 'parent-session'));
    h.usage.event(failedEvent('private-session'));
    h.usage.stop();

    expect(JSON.stringify(h.records)).not.toContain(SENTINEL);
  });

  it('does not throw when the writer fails or throws', () => {
    const failing = makeCollector({ fail: true });
    expect(() => {
      failing.usage.dispatch(dispatchRecord());
      failing.usage.event(createdEvent('child-session', 'parent-session'));
      failing.usage.stop();
    }).not.toThrow();
    expect(failing.records).toEqual([]);

    const throwing = makeCollector({ throw: true });
    expect(() => {
      throwing.usage.dispatch(dispatchRecord());
      throwing.usage.event(createdEvent('child-session', 'parent-session'));
      throwing.usage.event(usageEvent('child-session', tokens(1)));
      throwing.usage.stop();
    }).not.toThrow();
    expect(throwing.records).toEqual([]);
  });
});

function writeConfig(root: string, config: Record<string, unknown>): void {
  const directory = join(root, '.agentic', 'kiki');
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'config.json'), JSON.stringify(config));
}

describe('loadDiagnosticsConfig', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kiki-diagnostics-config-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('defaults to disabled when the project config is absent or malformed', () => {
    expect(loadDiagnosticsConfig(root)).toEqual({ enabled: false });

    mkdirSync(join(root, '.agentic', 'kiki'), { recursive: true });
    writeFileSync(join(root, '.agentic', 'kiki', 'config.json'), '{not json');
    // The file exists but is malformed.
    expect(loadDiagnosticsConfig(root)).toEqual({ enabled: false });
  });

  it('reads only an explicit boolean enable flag from the modern project config', () => {
    writeConfig(root, { diagnostics: { enabled: true } });
    expect(loadDiagnosticsConfig(root)).toEqual({ enabled: true });

    writeConfig(root, { diagnostics: { enabled: 'true' } });
    expect(loadDiagnosticsConfig(root)).toEqual({ enabled: false });

    // The legacy config path is not consulted for diagnostics.
    rmSync(join(root, '.agentic', 'kiki'), { recursive: true, force: true });
    mkdirSync(join(root, '.agentic'), { recursive: true });
    writeFileSync(
      join(root, '.agentic', 'config.json'),
      JSON.stringify({ diagnostics: { enabled: true } }),
    );
    expect(loadDiagnosticsConfig(root)).toEqual({ enabled: false });
  });
});

function readLedgerRecords(root: string): LedgerRecord[] {
  return readLedger(root).records;
}

function readRoutingEntries(root: string): Array<Record<string, unknown>> {
  const file = join(root, '.agentic', 'kiki', 'routing_log.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

interface HookRecord {
  name: string;
  handler: (event: {
    tool: string;
    sessionID?: string;
    id?: string;
    input: unknown;
  }) => Promise<void> | void;
  disposeCalls: number;
  disposed: boolean;
}

class FakeEventStream implements AsyncIterable<OpenCodeEvent> {
  readonly id: number;
  returnCalls = 0;
  private readonly queue: OpenCodeEvent[] = [];
  private readonly waiters: Array<(result: IteratorResult<OpenCodeEvent>) => void> = [];
  private closed = false;

  constructor(id: number, private readonly signal?: AbortSignal) {
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
    for (const waiter of this.waiters.splice(0)) {
      waiter({ value: undefined, done: true });
    }
  }
}

interface FakeContext {
  ctx: ServerContext;
  hooks: HookRecord[];
  streams: FakeEventStream[];
  event: {
    subscribe: (options?: { signal?: AbortSignal }) => FakeEventStream;
  };
}

function makeContext(root: string): FakeContext {
  const hooks: HookRecord[] = [];
  const streams: FakeEventStream[] = [];
  const tool = {
    hook: async (
      name: string,
      handler: (event: {
        tool: string;
        sessionID?: string;
        id?: string;
        input: unknown;
      }) => Promise<void> | void,
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
    subscribe: (options?: { signal?: AbortSignal }) => {
      const stream = new FakeEventStream(streams.length + 1, options?.signal);
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
  return { ctx, hooks, streams, event };
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}

describe('usage diagnostics plugin wiring', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kiki-usage-diagnostics-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('adds no ledger and keeps exactly one hook and stream when collection is off', async () => {
    const h = makeContext(root);
    const cleanup = await plugin.setup(h.ctx);

    expect(h.hooks).toHaveLength(1);
    expect(h.streams).toHaveLength(1);

    await h.hooks[0].handler({
      tool: 'subagent',
      sessionID: 'parent-session',
      id: 'call-1',
      input: { agent: 'kiki-reviewer', model: 'openai/gpt', description: '[task:diag review] Check changes' },
    });
    h.streams[0].push(createdEvent('child-session', 'parent-session', 'kiki-reviewer'));
    await flushMicrotasks();
    await cleanup();

    expect(readRoutingEntries(root)).toHaveLength(1);
    expect(existsSync(join(root, '.agentic', 'kiki', 'run_ledger.jsonl'))).toBe(false);
    expect(readLedgerRecords(root)).toEqual([]);
  });

  it('reuses the existing hook and stream to write dispatch and session records when enabled', async () => {
    writeConfig(root, { diagnostics: { enabled: true } });
    const h = makeContext(root);
    const cleanup = await plugin.setup(h.ctx);

    expect(h.hooks).toHaveLength(1);
    expect(h.streams).toHaveLength(1);

    await h.hooks[0].handler({
      tool: 'subagent',
      sessionID: 'parent-session',
      id: 'call-1',
      input: {
        agent: 'kiki-implementer',
        model: 'openai/gpt-6.1-sol',
        description: '[task:diag fix cmp:trial] Correct regression now',
        prompt: SENTINEL,
      },
    });
    h.streams[0].push(createdEvent('child-session', 'parent-session', 'kiki-implementer'));
    await flushMicrotasks();
    h.streams[0].push(usageEvent('child-session', tokens(11, 22, 33, 44, 55)));
    await flushMicrotasks();
    h.streams[0].push(succeededEvent('child-session'));
    await flushMicrotasks();
    await cleanup();

    const ledger = readLedgerRecords(root);
    const dispatches = ledger.filter(
      (record): record is DispatchRecord => record.type === 'dispatch',
    );
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]).toMatchObject({
      id: 'dispatch:parent-session:call-1',
      parentSessionId: 'parent-session',
      callId: 'call-1',
      agent: 'kiki-implementer',
      declared: {
        taskId: 'diag',
        kind: 'fix',
        comparisonGroup: 'trial',
        model: 'openai/gpt-6.1-sol',
      },
      childSessionId: 'unknown',
    });
    expect(JSON.stringify(ledger)).not.toContain(SENTINEL);

    const sessions = sessionRecords(ledger, 'child-session');
    expect(sessions).toHaveLength(2);
    expect(sessions[1]).toMatchObject({
      status: 'succeeded',
      tokens: tokens(11, 22, 33, 44, 55),
      tokenSource: 'session.usage.updated',
      partial: false,
    });

    const routes = readRoutingEntries(root);
    expect(routes).toHaveLength(1);
    expect(Object.keys(routes[0]).sort()).toEqual(['agent', 'model', 'timestamp']);
  });

  it('flushes a running session once on cleanup and ignores late events', async () => {
    writeConfig(root, { diagnostics: { enabled: true } });
    const h = makeContext(root);
    const cleanup = await plugin.setup(h.ctx);

    h.streams[0].push(createdEvent('running-child', 'parent-session', 'kiki-planner'));
    await flushMicrotasks();
    h.streams[0].push(usageEvent('running-child', tokens(4, 5)));
    await flushMicrotasks();
    await cleanup();

    const beforeLate = readLedgerRecords(root);
    const sessions = sessionRecords(beforeLate, 'running-child');
    expect(sessions).toHaveLength(2);
    expect(sessions[1]).toMatchObject({
      status: 'running',
      endedAt: null,
      partial: true,
      tokens: tokens(4, 5),
    });

    h.streams[0].push(usageEvent('running-child', tokens(999), 'late-usage'));
    await flushMicrotasks();
    await cleanup();

    expect(readLedgerRecords(root)).toHaveLength(beforeLate.length);
  });

  it('releases the logger and collector when enabled setup fails', async () => {
    writeConfig(root, { diagnostics: { enabled: true } });
    const h = makeContext(root);
    h.event.subscribe = () => {
      throw new Error('subscribe failed');
    };

    await expect(plugin.setup(h.ctx)).rejects.toThrow('subscribe failed');

    expect(h.hooks).toHaveLength(1);
    expect(h.hooks[0].disposed).toBe(true);
    expect(readLedgerRecords(root)).toEqual([]);
  });

  it('leaves exactly one active hook and stream after an enabled reload', async () => {
    writeConfig(root, { diagnostics: { enabled: true } });
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

  it('keeps routing and dispatch working when the ledger path is unwritable', async () => {
    writeConfig(root, { diagnostics: { enabled: true } });
    // A directory at the ledger file path makes every ledger append fail.
    mkdirSync(join(root, '.agentic', 'kiki', 'run_ledger.jsonl'), { recursive: true });
    const h = makeContext(root);
    const cleanup = await plugin.setup(h.ctx);

    await expect(
      Promise.resolve(
        h.hooks[0].handler({
          tool: 'subagent',
          sessionID: 'parent-session',
          id: 'call-1',
          input: { agent: 'kiki-reviewer', model: 'openai/gpt', description: '[task:diag review] Check changes' },
        }),
      ),
    ).resolves.toBeUndefined();

    expect(readRoutingEntries(root)).toHaveLength(1);
    expect(readLedger(root).records).toEqual([]);
    expect(readLedger(root).readError).not.toBeNull();

    await cleanup();
  });
});
