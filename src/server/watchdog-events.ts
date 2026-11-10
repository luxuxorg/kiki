import type { Plugin } from '@opencode/plugin';

type EventStream = ReturnType<Plugin.Context['event']['subscribe']>;

/** The published `OpenCodeEvent` union, extracted through the subscribe result. */
export type OpenCodeEvent = EventStream extends AsyncIterable<infer Event> ? Event : never;

/** Client-observed token counters, preserving the original V1 field semantics. */
export interface TokenCounters {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
}

/**
 * SDK-independent watchdog input. The event adapter normalizes the published
 * OC2 event union into this small discriminated union; the engine owns all
 * accumulation and timing state.
 *
 * `parentID` is optional on `child` so the stateless adapter can forward
 * `session.agent.selected` (which carries no parent) as an agent update for an
 * already tracked child. The engine never registers a session without a
 * parentID, preserving root-session exclusion.
 *
 * `running.status` is optional and defaults to `busy`. It exists only so the
 * V2 explicit retry status keeps the original "retrying is active but not
 * abortable" outcome without adding another top-level variant.
 */
export type WatchdogEvent =
  | { type: 'child'; id: string; parentID?: string; agent?: string }
  | { type: 'running'; id: string; status?: 'busy' | 'retry' }
  | { type: 'finished'; id: string }
  | { type: 'text'; id: string; key: string; text: string; mode: 'append' | 'replace' }
  | { type: 'tool'; id: string; key: string; name: string; input: unknown }
  | { type: 'tokens'; id: string; counters: TokenCounters };

function textEvent(
  kind: 'text' | 'reasoning',
  data: { sessionID: string; assistantMessageID: string; ordinal: number },
  text: string,
  mode: 'append' | 'replace',
): WatchdogEvent {
  return {
    type: 'text',
    id: data.sessionID,
    key: `${kind}:${data.assistantMessageID}:${data.ordinal}`,
    text,
    mode,
  };
}

function tokenEvent(
  sessionID: string,
  tokens: { input: number; output: number; reasoning: number; cache: { read: number; write: number } },
): WatchdogEvent {
  return {
    type: 'tokens',
    id: sessionID,
    counters: {
      input: tokens.input,
      output: tokens.output,
      reasoning: tokens.reasoning,
      cacheRead: tokens.cache.read,
      cacheWrite: tokens.cache.write,
    },
  };
}

/**
 * Stateless OC2 event decoder. No state, no V1 payload shapes, no casts: every
 * branch narrows the published union and reads payload fields from `.data`.
 */
export function decodeWatchdogEvent(event: OpenCodeEvent): WatchdogEvent[] {
  switch (event.type) {
    case 'session.created': {
      const { data } = event;
      if (!data.parentID) return [];
      const child: WatchdogEvent = {
        type: 'child',
        id: data.sessionID,
        parentID: data.parentID,
      };
      if (data.agent !== undefined) child.agent = data.agent;
      return [child];
    }
    case 'session.agent.selected':
      return [{ type: 'child', id: event.data.sessionID, agent: event.data.agent }];
    case 'session.execution.started':
      return [{ type: 'running', id: event.data.sessionID }];
    case 'session.execution.succeeded':
    case 'session.execution.failed':
    case 'session.execution.interrupted':
    case 'session.deleted':
      return [{ type: 'finished', id: event.data.sessionID }];
    case 'session.status': {
      const type = event.data.status.type;
      if (type === 'idle') return [{ type: 'finished', id: event.data.sessionID }];
      // Keep the original outcome that a retrying session is active but not
      // abortable. `busy` remains the default running state.
      return [{ type: 'running', id: event.data.sessionID, status: type }];
    }
    case 'session.idle':
      return [{ type: 'finished', id: event.data.sessionID }];
    case 'session.text.started':
      return [textEvent('text', event.data, '', 'replace')];
    case 'session.text.delta':
      return [textEvent('text', event.data, event.data.delta, 'append')];
    case 'session.text.ended':
      return [textEvent('text', event.data, event.data.text, 'replace')];
    case 'session.reasoning.started':
      return [textEvent('reasoning', event.data, '', 'replace')];
    case 'session.reasoning.delta':
      return [textEvent('reasoning', event.data, event.data.delta, 'append')];
    case 'session.reasoning.ended':
      return [textEvent('reasoning', event.data, event.data.text, 'replace')];
    case 'session.tool.input.started':
      return [
        {
          type: 'tool',
          id: event.data.sessionID,
          key: event.data.id,
          name: event.data.name,
          input: undefined,
        },
      ];
    case 'session.tool.input.delta':
    case 'session.tool.input.ended':
      return [
        { type: 'tool', id: event.data.sessionID, key: event.data.id, name: '', input: undefined },
      ];
    case 'session.tool.called':
      return [
        {
          type: 'tool',
          id: event.data.sessionID,
          key: event.data.id,
          name: '',
          input: event.data.input,
        },
      ];
    case 'session.tool.success':
    case 'session.tool.failed':
      return [
        { type: 'tool', id: event.data.sessionID, key: event.data.id, name: '', input: undefined },
      ];
    case 'session.tool.progress':
      // Progress is ephemeral activity only: it must not create or refresh a
      // completed tool ring item.
      return [{ type: 'running', id: event.data.sessionID }];
    case 'session.retry.scheduled':
      return [{ type: 'running', id: event.data.sessionID, status: 'retry' }];
    case 'session.step.ended':
      return [tokenEvent(event.data.sessionID, event.data.tokens)];
    case 'session.step.failed':
      return event.data.tokens
        ? [tokenEvent(event.data.sessionID, event.data.tokens)]
        : [];
    case 'session.usage.updated':
      return [tokenEvent(event.data.sessionID, event.data.tokens)];
    default:
      return [];
  }
}
