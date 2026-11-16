import type {
  DispatchRecord,
  LedgerRecord,
  SessionRecord,
  SessionStatus,
} from '../diagnostics/ledger.js';
import type { OpenCodeEvent, TokenCounters } from './watchdog-events.js';

export interface UsageDiagnosticsOptions {
  write: (record: LedgerRecord) => boolean;
  now: () => number;
}

export interface UsageDiagnostics {
  dispatch(record: DispatchRecord): void;
  event(event: OpenCodeEvent): void;
  stop(): void;
}

interface SessionState {
  sessionId: string;
  parentSessionId: string;
  agent: string;
  startedAt: string;
  endedAt: string | null;
  status: SessionStatus;
  tokens: TokenCounters | null;
  tokenSource: 'session.usage.updated' | 'unknown';
  retries: number;
  partial: boolean;
  terminalStatus: SessionStatus | null;
  hasSnapshot: boolean;
  dirty: boolean;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Reads only the five allowlisted counters. A partial or malformed object is
 * unavailable (`null`), never a fabricated zero or a partially trusted total.
 */
function tokensFrom(value: unknown): TokenCounters | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const counters = value as Record<string, unknown>;
  const cache = counters.cache;
  if (!cache || typeof cache !== 'object' || Array.isArray(cache)) return null;
  const cacheCounters = cache as Record<string, unknown>;

  if (
    typeof counters.input !== 'number' ||
    typeof counters.output !== 'number' ||
    typeof counters.reasoning !== 'number'
  ) {
    return null;
  }
  if (
    typeof cacheCounters.read !== 'number' ||
    typeof cacheCounters.write !== 'number'
  ) {
    return null;
  }
  if (
    !Number.isFinite(counters.input) ||
    !Number.isFinite(counters.output) ||
    !Number.isFinite(counters.reasoning) ||
    !Number.isFinite(cacheCounters.read) ||
    !Number.isFinite(cacheCounters.write)
  ) {
    return null;
  }

  return {
    input: counters.input,
    output: counters.output,
    reasoning: counters.reasoning,
    cacheRead: cacheCounters.read,
    cacheWrite: cacheCounters.write,
  };
}

/**
 * Builds the optional metadata collector for one plugin lifetime.
 *
 * The collector reads only raw event discriminants, so the watchdog's lossy
 * `finished`/`tokens` projection is never the source of truth. Dispatch labels
 * and child sessions remain unjoined: no parent/agent/timing heuristic creates
 * a task-to-session attribution. All failures are swallowed so diagnostics can
 * never disturb routing, watchdog handling or cleanup.
 */
export function createUsageDiagnostics(
  options: UsageDiagnosticsOptions,
): UsageDiagnostics {
  const sessions = new Map<string, SessionState>();
  const seenRetryEventIds = new Set<string>();
  let stopped = false;

  const timestamp = (): string => new Date(options.now()).toISOString();

  const write = (record: LedgerRecord): boolean => {
    try {
      return options.write(record) === true;
    } catch {
      return false;
    }
  };

  const writeSnapshot = (state: SessionState, sourceEventId: string): void => {
    const record: SessionRecord = {
      v: 1,
      id: `session:${state.sessionId}:${sourceEventId}`,
      timestamp: timestamp(),
      type: 'session',
      sessionId: state.sessionId,
      parentSessionId: state.parentSessionId,
      agent: state.agent,
      startedAt: state.startedAt,
      endedAt: state.endedAt,
      status: state.status,
      tokens: state.tokens === null ? null : { ...state.tokens },
      tokenSource: state.tokenSource,
      retries: state.retries,
      partial: state.partial,
    };
    if (write(record)) {
      state.hasSnapshot = true;
      state.dirty = false;
    }
  };

  const finish = (
    state: SessionState | undefined,
    status: SessionStatus,
    eventId: string,
  ): void => {
    if (!state) return;
    // Duplicate idle/finish signals must not add runs, snapshots or tokens.
    if (state.terminalStatus === status) return;
    state.status = status;
    state.terminalStatus = status;
    state.endedAt = timestamp();
    state.partial = false;
    state.dirty = true;
    writeSnapshot(state, eventId);
  };

  const resume = (state: SessionState): void => {
    state.status = 'running';
    state.terminalStatus = null;
    state.endedAt = null;
    state.partial = true;
    state.dirty = true;
  };

  const handle = (event: OpenCodeEvent): void => {
    switch (event.type) {
      case 'session.created': {
        const { data } = event;
        // Root and unknown-parent sessions are never registered: the collector
        // does not invent a parent identity.
        if (!isNonEmptyString(data.parentID)) return;
        if (sessions.has(data.sessionID)) return;

        const state: SessionState = {
          sessionId: data.sessionID,
          parentSessionId: data.parentID,
          agent: isNonEmptyString(data.agent) ? data.agent : 'unknown',
          startedAt: timestamp(),
          endedAt: null,
          status: 'running',
          tokens: null,
          tokenSource: 'unknown',
          retries: 0,
          partial: true,
          terminalStatus: null,
          hasSnapshot: false,
          dirty: true,
        };
        sessions.set(data.sessionID, state);
        writeSnapshot(state, event.id);
        return;
      }
      case 'session.agent.selected': {
        const state = sessions.get(event.data.sessionID);
        if (!state) return;
        if (isNonEmptyString(event.data.agent)) state.agent = event.data.agent;
        state.dirty = true;
        return;
      }
      case 'session.execution.started': {
        const state = sessions.get(event.data.sessionID);
        if (!state) return;
        resume(state);
        return;
      }
      case 'session.execution.succeeded':
        finish(sessions.get(event.data.sessionID), 'succeeded', event.id);
        return;
      case 'session.execution.failed':
        finish(sessions.get(event.data.sessionID), 'failed', event.id);
        return;
      case 'session.execution.interrupted':
        finish(sessions.get(event.data.sessionID), 'interrupted', event.id);
        return;
      case 'session.deleted':
        finish(sessions.get(event.data.sessionID), 'deleted', event.id);
        return;
      case 'session.idle':
        finish(sessions.get(event.data.sessionID), 'idle', event.id);
        return;
      case 'session.status': {
        const state = sessions.get(event.data.sessionID);
        if (!state) return;
        switch (event.data.status.type) {
          case 'idle':
            finish(state, 'idle', event.id);
            return;
          case 'busy':
          case 'retry':
            resume(state);
            return;
          default:
            return;
        }
      }
      case 'session.retry.scheduled': {
        const state = sessions.get(event.data.sessionID);
        if (!state) return;
        if (seenRetryEventIds.has(event.id)) return;
        seenRetryEventIds.add(event.id);
        state.retries += 1;
        resume(state);
        return;
      }
      case 'session.usage.updated': {
        const state = sessions.get(event.data.sessionID);
        if (!state) return;
        const counters = tokensFrom(event.data.tokens);
        if (!counters) return;
        // Aggregate usage is authoritative; step counters below never replace it.
        state.tokens = counters;
        state.tokenSource = 'session.usage.updated';
        state.dirty = true;
        return;
      }
      case 'session.step.ended':
      case 'session.step.failed':
        // Per-step counters also carry an assistantMessageID and are not
        // verified session totals. Recording them as the session aggregate
        // would silently double count or undercount; they stay unobserved.
        return;
      default:
        return;
    }
  };

  const flushAndStop = (): void => {
    if (stopped) return;
    stopped = true;
    for (const state of sessions.values()) {
      const needsSnapshot =
        state.terminalStatus === null || state.dirty || !state.hasSnapshot;
      if (!needsSnapshot) continue;
      if (state.terminalStatus === null) state.partial = true;
      state.dirty = true;
      // Bounded, synchronous last-known flush during existing cleanup.
      writeSnapshot(state, 'stop');
    }
  };

  return {
    dispatch(record: DispatchRecord): void {
      if (stopped) return;
      write(record);
    },
    event(event: OpenCodeEvent): void {
      if (stopped) return;
      try {
        handle(event);
      } catch {
        // Late or malformed events must never interrupt watchdog handling.
      }
    },
    stop(): void {
      try {
        flushAndStop();
      } catch {
        // Cleanup must never reject or throw.
      }
    },
  };
}
