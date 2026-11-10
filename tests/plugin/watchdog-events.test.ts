import { describe, expect, it } from 'vitest';
import { decodeWatchdogEvent, type OpenCodeEvent } from '../../src/server/watchdog-events';

type EventOf<T extends OpenCodeEvent['type']> = Extract<OpenCodeEvent, { type: T }>;

const meta = { id: 'event-1', created: 1_000 } as const;
const durable = <V extends 1 | 2>(aggregateID: string, version: V) => ({
  aggregateID,
  seq: 1,
  version,
});

describe('decodeWatchdogEvent session lifecycle', () => {
  it('maps session.created data.parentID directly (not .info)', () => {
    const event: EventOf<'session.created'> = {
      ...meta,
      type: 'session.created',
      durable: durable('child-1', 1),
      data: {
        sessionID: 'child-1',
        projectID: 'project-1',
        location: { directory: '/project' },
        parentID: 'parent-1',
        slug: 'child',
        agent: 'kiki-planner',
        version: '1',
      },
    };

    expect(decodeWatchdogEvent(event)).toEqual([
      { type: 'child', id: 'child-1', parentID: 'parent-1', agent: 'kiki-planner' },
    ]);
  });

  it('excludes root sessions that have no parentID', () => {
    const event: EventOf<'session.created'> = {
      ...meta,
      type: 'session.created',
      durable: durable('root-1', 1),
      data: {
        sessionID: 'root-1',
        projectID: 'project-1',
        location: { directory: '/project' },
        slug: 'root',
        version: '1',
      },
    };

    expect(decodeWatchdogEvent(event)).toEqual([]);
  });

  it('records agent selection changes for an already tracked child', () => {
    const event: EventOf<'session.agent.selected'> = {
      ...meta,
      type: 'session.agent.selected',
      durable: durable('child-1', 1),
      data: { sessionID: 'child-1', agent: 'general', previous: 'kiki-planner' },
    };

    expect(decodeWatchdogEvent(event)).toEqual([
      { type: 'child', id: 'child-1', agent: 'general' },
    ]);
  });

  it('maps execution.started to running', () => {
    const event: EventOf<'session.execution.started'> = {
      ...meta,
      type: 'session.execution.started',
      durable: durable('child-1', 1),
      data: { sessionID: 'child-1' },
    };

    expect(decodeWatchdogEvent(event)).toEqual([{ type: 'running', id: 'child-1' }]);
  });

  it('maps execution.succeeded to finished', () => {
    const event: EventOf<'session.execution.succeeded'> = {
      ...meta,
      type: 'session.execution.succeeded',
      durable: durable('child-1', 1),
      data: { sessionID: 'child-1' },
    };

    expect(decodeWatchdogEvent(event)).toEqual([{ type: 'finished', id: 'child-1' }]);
  });

  it('maps execution.failed to finished', () => {
    const event: EventOf<'session.execution.failed'> = {
      ...meta,
      type: 'session.execution.failed',
      durable: durable('child-1', 1),
      data: { sessionID: 'child-1', error: { type: 'unknown', message: 'x' } },
    };

    expect(decodeWatchdogEvent(event)).toEqual([{ type: 'finished', id: 'child-1' }]);
  });

  it('maps execution.interrupted to finished', () => {
    const event: EventOf<'session.execution.interrupted'> = {
      ...meta,
      type: 'session.execution.interrupted',
      durable: durable('child-1', 1),
      data: { sessionID: 'child-1', reason: 'user' },
    };

    expect(decodeWatchdogEvent(event)).toEqual([{ type: 'finished', id: 'child-1' }]);
  });

  it('maps session.deleted to finished', () => {
    const event: EventOf<'session.deleted'> = {
      ...meta,
      type: 'session.deleted',
      durable: durable('child-1', 2),
      data: { sessionID: 'child-1' },
    };

    expect(decodeWatchdogEvent(event)).toEqual([{ type: 'finished', id: 'child-1' }]);
  });

  it('maps busy session.status to running activity', () => {
    const event: EventOf<'session.status'> = {
      ...meta,
      type: 'session.status',
      data: { sessionID: 'child-1', status: { type: 'busy' } },
    };

    expect(decodeWatchdogEvent(event)).toEqual([
      { type: 'running', id: 'child-1', status: 'busy' },
    ]);
  });

  it('maps retry session.status to non-abortable running activity', () => {
    const event: EventOf<'session.status'> = {
      ...meta,
      type: 'session.status',
      data: {
        sessionID: 'child-1',
        status: { type: 'retry', attempt: 1, message: 'retry', next: 0 },
      },
    };

    expect(decodeWatchdogEvent(event)).toEqual([
      { type: 'running', id: 'child-1', status: 'retry' },
    ]);
  });

  it('maps retry.scheduled to non-abortable running activity', () => {
    const event: EventOf<'session.retry.scheduled'> = {
      ...meta,
      type: 'session.retry.scheduled',
      durable: durable('child-1', 1),
      data: {
        sessionID: 'child-1',
        assistantMessageID: 'msg-1',
        attempt: 2,
        at: 1_000,
        error: { type: 'unknown', message: 'x' },
      },
    };

    expect(decodeWatchdogEvent(event)).toEqual([
      { type: 'running', id: 'child-1', status: 'retry' },
    ]);
  });

  it('maps idle session.status to finished', () => {
    const event: EventOf<'session.status'> = {
      ...meta,
      type: 'session.status',
      data: { sessionID: 'child-1', status: { type: 'idle' } },
    };

    expect(decodeWatchdogEvent(event)).toEqual([{ type: 'finished', id: 'child-1' }]);
  });

  it('maps session.idle to finished', () => {
    const event: EventOf<'session.idle'> = {
      ...meta,
      type: 'session.idle',
      data: { sessionID: 'child-1' },
    };

    expect(decodeWatchdogEvent(event)).toEqual([{ type: 'finished', id: 'child-1' }]);
  });
});

describe('decodeWatchdogEvent text and reasoning', () => {
  it('maps text started/delta/ended keyed by assistantMessageID and ordinal', () => {
    const started: EventOf<'session.text.started'> = {
      ...meta,
      type: 'session.text.started',
      durable: durable('child-1', 1),
      data: { sessionID: 'child-1', assistantMessageID: 'msg-1', ordinal: 0 },
    };
    const delta: EventOf<'session.text.delta'> = {
      ...meta,
      type: 'session.text.delta',
      data: { sessionID: 'child-1', assistantMessageID: 'msg-1', ordinal: 0, delta: 'hel' },
    };
    const ended: EventOf<'session.text.ended'> = {
      ...meta,
      type: 'session.text.ended',
      durable: durable('child-1', 1),
      data: { sessionID: 'child-1', assistantMessageID: 'msg-1', ordinal: 0, text: 'hello' },
    };

    expect(decodeWatchdogEvent(started)).toEqual([
      { type: 'text', id: 'child-1', key: 'text:msg-1:0', text: '', mode: 'replace' },
    ]);
    expect(decodeWatchdogEvent(delta)).toEqual([
      { type: 'text', id: 'child-1', key: 'text:msg-1:0', text: 'hel', mode: 'append' },
    ]);
    expect(decodeWatchdogEvent(ended)).toEqual([
      { type: 'text', id: 'child-1', key: 'text:msg-1:0', text: 'hello', mode: 'replace' },
    ]);
  });

  it('maps reasoning started/delta/ended to a separate logical key', () => {
    const started: EventOf<'session.reasoning.started'> = {
      ...meta,
      type: 'session.reasoning.started',
      durable: durable('child-1', 1),
      data: { sessionID: 'child-1', assistantMessageID: 'msg-2', ordinal: 1 },
    };
    const delta: EventOf<'session.reasoning.delta'> = {
      ...meta,
      type: 'session.reasoning.delta',
      data: { sessionID: 'child-1', assistantMessageID: 'msg-2', ordinal: 1, delta: 'thin' },
    };
    const ended: EventOf<'session.reasoning.ended'> = {
      ...meta,
      type: 'session.reasoning.ended',
      durable: durable('child-1', 1),
      data: { sessionID: 'child-1', assistantMessageID: 'msg-2', ordinal: 1, text: 'thinking' },
    };

    expect(decodeWatchdogEvent(started)).toEqual([
      { type: 'text', id: 'child-1', key: 'reasoning:msg-2:1', text: '', mode: 'replace' },
    ]);
    expect(decodeWatchdogEvent(delta)).toEqual([
      { type: 'text', id: 'child-1', key: 'reasoning:msg-2:1', text: 'thin', mode: 'append' },
    ]);
    expect(decodeWatchdogEvent(ended)).toEqual([
      { type: 'text', id: 'child-1', key: 'reasoning:msg-2:1', text: 'thinking', mode: 'replace' },
    ]);
  });
});

describe('decodeWatchdogEvent tool activity', () => {
  it('maps tool input.started/delta/ended keyed by tool id', () => {
    const started: EventOf<'session.tool.input.started'> = {
      ...meta,
      type: 'session.tool.input.started',
      durable: durable('child-1', 1),
      data: { sessionID: 'child-1', assistantMessageID: 'msg-1', id: 'tool-1', name: 'read' },
    };
    const delta: EventOf<'session.tool.input.delta'> = {
      ...meta,
      type: 'session.tool.input.delta',
      data: { sessionID: 'child-1', assistantMessageID: 'msg-1', id: 'tool-1', delta: '{"path"' },
    };
    const ended: EventOf<'session.tool.input.ended'> = {
      ...meta,
      type: 'session.tool.input.ended',
      durable: durable('child-1', 1),
      data: { sessionID: 'child-1', assistantMessageID: 'msg-1', id: 'tool-1', text: '{"path":"/a"}' },
    };

    expect(decodeWatchdogEvent(started)).toEqual([
      { type: 'tool', id: 'child-1', key: 'tool-1', name: 'read', input: undefined },
    ]);
    expect(decodeWatchdogEvent(delta)).toEqual([
      { type: 'tool', id: 'child-1', key: 'tool-1', name: '', input: undefined },
    ]);
    expect(decodeWatchdogEvent(ended)).toEqual([
      { type: 'tool', id: 'child-1', key: 'tool-1', name: '', input: undefined },
    ]);
  });

  it('maps tool.called with the completed input keyed by tool id', () => {
    const event: EventOf<'session.tool.called'> = {
      ...meta,
      type: 'session.tool.called',
      durable: durable('child-1', 1),
      data: {
        sessionID: 'child-1',
        assistantMessageID: 'msg-1',
        id: 'tool-1',
        input: { filePath: '/a' },
        executed: true,
      },
    };

    expect(decodeWatchdogEvent(event)).toEqual([
      { type: 'tool', id: 'child-1', key: 'tool-1', name: '', input: { filePath: '/a' } },
    ]);
  });

  it('maps tool.success and tool.failed keyed by tool id as activity', () => {
    const success: EventOf<'session.tool.success'> = {
      ...meta,
      type: 'session.tool.success',
      durable: durable('child-1', 2),
      data: {
        sessionID: 'child-1',
        assistantMessageID: 'msg-1',
        id: 'tool-1',
        content: [{ type: 'text', text: 'ok' }],
        executed: true,
      },
    };
    const failed: EventOf<'session.tool.failed'> = {
      ...meta,
      type: 'session.tool.failed',
      durable: durable('child-1', 2),
      data: {
        sessionID: 'child-1',
        assistantMessageID: 'msg-1',
        id: 'tool-1',
        error: { type: 'unknown', message: 'x' },
        executed: true,
      },
    };

    expect(decodeWatchdogEvent(success)).toEqual([
      { type: 'tool', id: 'child-1', key: 'tool-1', name: '', input: undefined },
    ]);
    expect(decodeWatchdogEvent(failed)).toEqual([
      { type: 'tool', id: 'child-1', key: 'tool-1', name: '', input: undefined },
    ]);
  });

  it('maps tool.progress to ephemeral running activity, not a tool ring item', () => {
    const event: EventOf<'session.tool.progress'> = {
      ...meta,
      type: 'session.tool.progress',
      data: {
        sessionID: 'child-1',
        assistantMessageID: 'msg-1',
        id: 'tool-1',
        metadata: { percent: 50 },
      },
    };

    expect(decodeWatchdogEvent(event)).toEqual([{ type: 'running', id: 'child-1' }]);
  });
});

describe('decodeWatchdogEvent token observations', () => {
  it('maps step.ended token counters to the original input/output/reasoning/cache semantics', () => {
    const event: EventOf<'session.step.ended'> = {
      ...meta,
      type: 'session.step.ended',
      durable: durable('child-1', 1),
      data: {
        sessionID: 'child-1',
        assistantMessageID: 'msg-1',
        finish: 'stop',
        cost: 0.01,
        tokens: { input: 10, output: 20, reasoning: 30, cache: { read: 40, write: 50 } },
      },
    };

    expect(decodeWatchdogEvent(event)).toEqual([
      {
        type: 'tokens',
        id: 'child-1',
        counters: { input: 10, output: 20, reasoning: 30, cacheRead: 40, cacheWrite: 50 },
      },
    ]);
  });

  it('maps usage.updated token counters', () => {
    const event: EventOf<'session.usage.updated'> = {
      ...meta,
      type: 'session.usage.updated',
      data: {
        sessionID: 'child-1',
        cost: 0.02,
        tokens: { input: 1, output: 2, reasoning: 3, cache: { read: 4, write: 5 } },
      },
    };

    expect(decodeWatchdogEvent(event)).toEqual([
      {
        type: 'tokens',
        id: 'child-1',
        counters: { input: 1, output: 2, reasoning: 3, cacheRead: 4, cacheWrite: 5 },
      },
    ]);
  });
});

describe('decodeWatchdogEvent irrelevant events', () => {
  it('ignores unrelated events without activity', () => {
    const event: EventOf<'agent.updated'> = {
      ...meta,
      type: 'agent.updated',
      data: {},
    };

    expect(decodeWatchdogEvent(event)).toEqual([]);
  });
});
