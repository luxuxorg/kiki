import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { TokenCounters } from '../server/watchdog-events.js';

/** The single metadata-only ledger, relative to a project root. */
export const LEDGER_RELATIVE_PATH = '.agentic/kiki/run_ledger.jsonl';

export type DeclaredKind = 'initial' | 'fix' | 'review' | 'unknown';

/** Declared dispatch labels parsed from the leading bracketed metadata. */
export interface DeclaredLabels {
  taskId: string;
  kind: DeclaredKind;
  comparisonGroup: string;
}

export type SessionStatus =
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'interrupted'
  | 'idle'
  | 'deleted'
  | 'partial'
  | 'unknown';

interface LedgerRecordBase {
  v: 1;
  id: string;
  timestamp: string;
}

interface DispatchRecordShape extends LedgerRecordBase {
  type: 'dispatch';
  parentSessionId: string;
  callId: string;
  agent: string;
  declared: DeclaredLabels & { model: string };
  childSessionId: 'unknown';
}

interface SessionRecordShape extends LedgerRecordBase {
  type: 'session';
  sessionId: string;
  parentSessionId: string;
  agent: string;
  startedAt: string | null;
  endedAt: string | null;
  status: SessionStatus;
  tokens: TokenCounters | null;
  tokenSource: 'session.usage.updated' | 'unknown';
  retries: number;
  partial: boolean;
}

interface ComparisonRecordShape extends LedgerRecordBase {
  type: 'comparison';
  taskId: string;
  comparisonGroup: string;
  startRevision: string;
  endRevision: string;
}

export type LedgerRecord =
  | DispatchRecordShape
  | SessionRecordShape
  | ComparisonRecordShape;
export type DispatchRecord = Extract<LedgerRecord, { type: 'dispatch' }>;
export type SessionRecord = Extract<LedgerRecord, { type: 'session' }>;
export type ComparisonRecord = Extract<LedgerRecord, { type: 'comparison' }>;

const DECLARED_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const DECLARED_KINDS: readonly string[] = ['initial', 'fix', 'review'];
const SESSION_STATUSES: readonly string[] = [
  'running',
  'succeeded',
  'failed',
  'interrupted',
  'idle',
  'deleted',
  'partial',
  'unknown',
];
const TOKEN_COUNTER_KEYS = ['input', 'output', 'reasoning', 'cacheRead', 'cacheWrite'] as const;

const UNKNOWN_LABELS = (): DeclaredLabels => ({
  taskId: 'unknown',
  kind: 'unknown',
  comparisonGroup: 'unknown',
});

/**
 * Reads only the leading bracketed metadata, never the descriptive body.
 * Every field is validated independently: an invalid task ID or kind does not
 * discard a valid comparison group, and each missing/invalid field becomes
 * `unknown` instead of a guessed value.
 */
export function parseDispatchLabels(description: unknown): DeclaredLabels {
  const labels = UNKNOWN_LABELS();
  if (typeof description !== 'string') return labels;

  const leading = description.search(/\S/);
  if (leading === -1 || description[leading] !== '[') return labels;
  const close = description.indexOf(']', leading + 1);
  if (close === -1) return labels;

  for (const token of description.slice(leading + 1, close).split(/\s+/)) {
    if (token.startsWith('task:')) {
      if (labels.taskId === 'unknown') {
        const taskId = token.slice('task:'.length);
        if (DECLARED_ID_PATTERN.test(taskId)) labels.taskId = taskId;
      }
      continue;
    }
    if (token.startsWith('cmp:')) {
      if (labels.comparisonGroup === 'unknown') {
        const comparisonGroup = token.slice('cmp:'.length);
        if (DECLARED_ID_PATTERN.test(comparisonGroup)) {
          labels.comparisonGroup = comparisonGroup;
        }
      }
      continue;
    }
    if (labels.kind === 'unknown' && DECLARED_KINDS.includes(token)) {
      labels.kind = token as DeclaredKind;
    }
  }

  return labels;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !Number.isNaN(Date.parse(value))
  );
}

function isNullableIsoTimestamp(value: unknown): value is string | null {
  return value === null || isIsoTimestamp(value);
}

function isDeclaredKind(value: unknown): value is DeclaredKind {
  return (
    value === 'initial' ||
    value === 'fix' ||
    value === 'review' ||
    value === 'unknown'
  );
}

function isSessionStatus(value: unknown): value is SessionStatus {
  return typeof value === 'string' && SESSION_STATUSES.includes(value);
}

function normalizeTokens(value: unknown): TokenCounters | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  if (!TOKEN_COUNTER_KEYS.every((key) => typeof value[key] === 'number')) {
    return undefined;
  }
  if (!TOKEN_COUNTER_KEYS.every((key) => Number.isFinite(value[key]))) {
    return undefined;
  }
  return {
    input: value.input as number,
    output: value.output as number,
    reasoning: value.reasoning as number,
    cacheRead: value.cacheRead as number,
    cacheWrite: value.cacheWrite as number,
  };
}

function normalizeDeclared(
  value: unknown,
): (DeclaredLabels & { model: string }) | null {
  if (!isRecord(value)) return null;
  const { taskId, kind, comparisonGroup, model } = value;
  if (
    !isNonEmptyString(taskId) ||
    !isDeclaredKind(kind) ||
    !isNonEmptyString(comparisonGroup) ||
    !isNonEmptyString(model)
  ) {
    return null;
  }
  return { taskId, kind, comparisonGroup, model };
}

function normalizeDispatch(
  value: Record<string, unknown>,
): DispatchRecord | null {
  const { id, timestamp, parentSessionId, callId, agent, childSessionId } = value;
  if (
    !isNonEmptyString(id) ||
    !isIsoTimestamp(timestamp) ||
    !isNonEmptyString(parentSessionId) ||
    !isNonEmptyString(callId) ||
    !isNonEmptyString(agent) ||
    childSessionId !== 'unknown'
  ) {
    return null;
  }
  const declared = normalizeDeclared(value.declared);
  if (!declared) return null;
  return {
    v: 1,
    id,
    timestamp,
    type: 'dispatch',
    parentSessionId,
    callId,
    agent,
    declared,
    childSessionId: 'unknown',
  };
}

function normalizeSession(
  value: Record<string, unknown>,
): SessionRecord | null {
  const {
    id,
    timestamp,
    sessionId,
    parentSessionId,
    agent,
    startedAt,
    endedAt,
    status,
    tokenSource,
    retries,
    partial,
  } = value;
  if (
    !isNonEmptyString(id) ||
    !isIsoTimestamp(timestamp) ||
    !isNonEmptyString(sessionId) ||
    !isNonEmptyString(parentSessionId) ||
    !isNonEmptyString(agent) ||
    !isNullableIsoTimestamp(startedAt) ||
    !isNullableIsoTimestamp(endedAt) ||
    !isSessionStatus(status) ||
    (tokenSource !== 'session.usage.updated' && tokenSource !== 'unknown') ||
    typeof retries !== 'number' ||
    !Number.isInteger(retries) ||
    retries < 0 ||
    typeof partial !== 'boolean'
  ) {
    return null;
  }
  const tokens = normalizeTokens(value.tokens);
  if (tokens === undefined) return null;
  return {
    v: 1,
    id,
    timestamp,
    type: 'session',
    sessionId,
    parentSessionId,
    agent,
    startedAt,
    endedAt,
    status,
    tokens,
    tokenSource,
    retries,
    partial,
  };
}

function normalizeComparison(
  value: Record<string, unknown>,
): ComparisonRecord | null {
  const { id, timestamp, taskId, comparisonGroup, startRevision, endRevision } =
    value;
  if (
    !isNonEmptyString(id) ||
    !isIsoTimestamp(timestamp) ||
    !isNonEmptyString(taskId) ||
    !isNonEmptyString(comparisonGroup) ||
    !isNonEmptyString(startRevision) ||
    !isNonEmptyString(endRevision)
  ) {
    return null;
  }
  return {
    v: 1,
    id,
    timestamp,
    type: 'comparison',
    taskId,
    comparisonGroup,
    startRevision,
    endRevision,
  };
}

/**
 * Rebuilds a record from the allowlisted primitive fields. Unknown keys,
 * nested payloads and unsupported versions/types are discarded rather than
 * serialized.
 */
function normalizeLedgerRecord(value: unknown): LedgerRecord | null {
  if (!isRecord(value) || value.v !== 1) return null;
  switch (value.type) {
    case 'dispatch':
      return normalizeDispatch(value);
    case 'session':
      return normalizeSession(value);
    case 'comparison':
      return normalizeComparison(value);
    default:
      return null;
  }
}

/**
 * Returns a fail-open writer. The directory and file are created lazily on the
 * first valid write; an invalid record or filesystem failure returns false and
 * never throws into the caller.
 */
export function createLedgerWriter(
  root: string,
): (record: LedgerRecord) => boolean {
  const ledgerPath = join(root, LEDGER_RELATIVE_PATH);
  return (record) => {
    try {
      const normalized = normalizeLedgerRecord(record);
      if (!normalized) return false;
      mkdirSync(dirname(ledgerPath), { recursive: true });
      appendFileSync(ledgerPath, `${JSON.stringify(normalized)}\n`, 'utf8');
      return true;
    } catch {
      return false;
    }
  };
}

/**
 * Read-only, tolerant reader. A missing ledger is simply "no data" (empty
 * records, no error); unreadable paths surface only through `readError`.
 * Malformed, truncated, unknown-version and unknown-type lines are skipped and
 * counted, never repaired or echoed.
 */
export function readLedger(root: string): {
  records: LedgerRecord[];
  skipped: number;
  readError: string | null;
} {
  const ledgerPath = join(root, LEDGER_RELATIVE_PATH);
  let content: string;
  try {
    content = readFileSync(ledgerPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { records: [], skipped: 0, readError: null };
    }
    return {
      records: [],
      skipped: 0,
      readError:
        error instanceof Error
          ? error.message
          : 'Unable to read diagnostics ledger',
    };
  }

  const records: LedgerRecord[] = [];
  let skipped = 0;
  for (const line of content.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      skipped += 1;
      continue;
    }
    const record = normalizeLedgerRecord(parsed);
    if (!record) {
      skipped += 1;
      continue;
    }
    records.push(record);
  }
  return { records, skipped, readError: null };
}
