import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
import {
  createLedgerWriter,
  parseDispatchLabels,
  readLedger,
  type ComparisonRecord,
  type DispatchRecord,
  type LedgerRecord,
  type SessionRecord,
} from '../../src/diagnostics/ledger';

const TIMESTAMP = '2026-11-16T10:00:00.000Z';
const SENTINEL = 'PROMPT_BODY_SENTINEL_9f3c';

const UNKNOWN_LABELS = {
  taskId: 'unknown',
  kind: 'unknown',
  comparisonGroup: 'unknown',
} as const;

function dispatchRecord(overrides: Partial<DispatchRecord> = {}): DispatchRecord {
  return {
    v: 1,
    id: 'dispatch:parent-session:call-1',
    timestamp: TIMESTAMP,
    type: 'dispatch',
    parentSessionId: 'parent-session',
    callId: 'call-1',
    agent: 'kiki-implementer',
    declared: {
      taskId: 'diag',
      kind: 'fix',
      comparisonGroup: 'trial',
      model: 'provider/model',
    },
    childSessionId: 'unknown',
    ...overrides,
  };
}

function sessionRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    v: 1,
    id: 'session:child-session:event-1',
    timestamp: TIMESTAMP,
    type: 'session',
    sessionId: 'child-session',
    parentSessionId: 'parent-session',
    agent: 'kiki-implementer',
    startedAt: TIMESTAMP,
    endedAt: null,
    status: 'running',
    tokens: null,
    tokenSource: 'unknown',
    retries: 0,
    partial: true,
    ...overrides,
  };
}

function comparisonRecord(overrides: Partial<ComparisonRecord> = {}): ComparisonRecord {
  return {
    v: 1,
    id: 'comparison:trial',
    timestamp: TIMESTAMP,
    type: 'comparison',
    taskId: 'diag',
    comparisonGroup: 'trial',
    startRevision: 'a1b2c3d',
    endRevision: 'unknown',
    ...overrides,
  };
}

describe('parseDispatchLabels', () => {
  it('reads the leading task, kind and comparison group', () => {
    expect(parseDispatchLabels('[task:diag fix cmp:trial] Check regression')).toEqual({
      taskId: 'diag',
      kind: 'fix',
      comparisonGroup: 'trial',
    });
  });

  it('validates the kind independently of the other fields', () => {
    expect(parseDispatchLabels('[task:diag invalid cmp:trial] Check regression')).toEqual({
      taskId: 'diag',
      kind: 'unknown',
      comparisonGroup: 'trial',
    });
  });

  it('keeps the comparison group independent from the task and kind', () => {
    expect(parseDispatchLabels('[task:diag review cmp:trial] Compare review')).toEqual({
      taskId: 'diag',
      kind: 'review',
      comparisonGroup: 'trial',
    });
  });

  it('uses unknown only for fields that are actually missing', () => {
    expect(parseDispatchLabels('[task:diag]')).toEqual({ ...UNKNOWN_LABELS, taskId: 'diag' });
    expect(parseDispatchLabels('[fix cmp:trial]')).toEqual({
      ...UNKNOWN_LABELS,
      kind: 'fix',
      comparisonGroup: 'trial',
    });
    expect(parseDispatchLabels('[task:diag fix]')).toEqual({
      ...UNKNOWN_LABELS,
      taskId: 'diag',
      kind: 'fix',
    });
  });

  it('treats absent or malformed brackets as unknown', () => {
    expect(parseDispatchLabels('Check regression')).toEqual(UNKNOWN_LABELS);
    expect(parseDispatchLabels('[task:diag fix')).toEqual(UNKNOWN_LABELS);
    expect(parseDispatchLabels('task:diag fix]')).toEqual(UNKNOWN_LABELS);
    expect(parseDispatchLabels('[]')).toEqual(UNKNOWN_LABELS);
    expect(parseDispatchLabels('[task:diag fix][task:other review]')).toEqual({
      taskId: 'diag',
      kind: 'fix',
      comparisonGroup: 'unknown',
    });
  });

  it('never reads labels from the descriptive body', () => {
    expect(parseDispatchLabels(`Check regression ${SENTINEL} [task:body fix]`)).toEqual(UNKNOWN_LABELS);
    expect(parseDispatchLabels(`[task:diag fix] ${SENTINEL}`)).toEqual({
      taskId: 'diag',
      kind: 'fix',
      comparisonGroup: 'unknown',
    });
  });

  it('rejects excessive or invalid IDs without discarding valid sibling fields', () => {
    const max = 'a'.repeat(128);
    expect(parseDispatchLabels(`[task:${max} fix cmp:${max}]`)).toEqual({
      taskId: max,
      kind: 'fix',
      comparisonGroup: max,
    });

    const tooLong = 'a'.repeat(129);
    expect(parseDispatchLabels(`[task:${tooLong} fix cmp:${tooLong}]`)).toEqual({
      taskId: 'unknown',
      kind: 'fix',
      comparisonGroup: 'unknown',
    });
    expect(parseDispatchLabels('[task:bad/id fix cmp:bad/group]')).toEqual({
      taskId: 'unknown',
      kind: 'fix',
      comparisonGroup: 'unknown',
    });
    expect(parseDispatchLabels('[task: fix]')).toEqual({
      taskId: 'unknown',
      kind: 'fix',
      comparisonGroup: 'unknown',
    });
  });

  it('remains safe for non-string input, arrays, null and control characters', () => {
    for (const value of [undefined, null, 42, true, [], ['[task:diag fix]'], {}]) {
      expect(parseDispatchLabels(value)).toEqual(UNKNOWN_LABELS);
    }
    expect(parseDispatchLabels('[task:di\u0000ag fix]')).toEqual({
      ...UNKNOWN_LABELS,
      kind: 'fix',
    });
    expect(parseDispatchLabels('\u0000[task:diag fix]')).toEqual(UNKNOWN_LABELS);
  });

  it('never returns prompt or body sentinels', () => {
    const labels = parseDispatchLabels(`[task:diag fix cmp:trial] ${SENTINEL}`);
    expect(JSON.stringify(labels)).not.toContain(SENTINEL);
  });
});

describe('ledger writer and reader', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kiki-ledger-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const ledgerPath = (): string => join(root, '.agentic', 'kiki', 'run_ledger.jsonl');

  it('creates no directory or file until a valid record is actually written', () => {
    const write = createLedgerWriter(root);
    expect(existsSync(join(root, '.agentic'))).toBe(false);

    expect(write({ ...dispatchRecord(), v: 2 } as unknown as LedgerRecord)).toBe(false);
    expect(existsSync(join(root, '.agentic'))).toBe(false);
    expect(existsSync(ledgerPath())).toBe(false);

    expect(write(dispatchRecord())).toBe(true);
    expect(existsSync(ledgerPath())).toBe(true);
  });

  it('appends one complete JSON line per write and never rewrites earlier lines', () => {
    const write = createLedgerWriter(root);
    expect(write(dispatchRecord())).toBe(true);
    const firstLine = readFileSync(ledgerPath(), 'utf8');
    expect(firstLine.endsWith('\n')).toBe(true);
    expect(firstLine.split('\n').filter(Boolean)).toHaveLength(1);

    expect(write(comparisonRecord())).toBe(true);
    const lines = readFileSync(ledgerPath(), 'utf8').split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(`${lines[0]}\n`).toBe(firstLine);
    for (const line of lines) expect(() => JSON.parse(line)).not.toThrow();
  });

  it('writes allowlisted fields only and drops unknown payload fields', () => {
    const write = createLedgerWriter(root);
    const dirty = {
      ...dispatchRecord(),
      description: SENTINEL,
      prompt: SENTINEL,
      body: { text: SENTINEL },
    } as unknown as LedgerRecord;

    expect(write(dirty)).toBe(true);
    const raw = readFileSync(ledgerPath(), 'utf8');
    expect(raw).not.toContain(SENTINEL);
    const parsed = JSON.parse(raw.trim());
    expect(parsed).toEqual(dispatchRecord());
  });

  it('builds a dispatch record from parsed labels without storing the description', () => {
    const labels = parseDispatchLabels(`[task:diag fix cmp:trial] ${SENTINEL}`);
    const record = dispatchRecord({
      declared: { ...labels, model: 'provider/model' },
    });
    expect(createLedgerWriter(root)(record)).toBe(true);
    expect(readFileSync(ledgerPath(), 'utf8')).not.toContain(SENTINEL);
    expect(readLedger(root).records[0]).toEqual(record);
  });

  it('returns false and does not throw when the ledger path is unwritable', () => {
    writeFileSync(join(root, '.agentic'), 'not a directory');
    const write = createLedgerWriter(root);
    expect(() => write(dispatchRecord())).not.toThrow();
    expect(write(dispatchRecord())).toBe(false);
  });

  it('returns no records and no error for a missing ledger without creating it', () => {
    expect(readLedger(root)).toEqual({ records: [], skipped: 0, readError: null });
    expect(existsSync(ledgerPath())).toBe(false);
    expect(existsSync(join(root, '.agentic'))).toBe(false);
  });

  it('reads one valid JSONL record', () => {
    expect(createLedgerWriter(root)(dispatchRecord())).toBe(true);
    const result = readLedger(root);
    expect(result).toEqual({ records: [dispatchRecord()], skipped: 0, readError: null });
  });

  it('skips truncated, malformed and unsupported lines with a count', () => {
    const valid = dispatchRecord();
    mkdirSync(join(root, '.agentic', 'kiki'), { recursive: true });
    writeFileSync(
      ledgerPath(),
      [
        JSON.stringify(valid),
        `{"v":1,"type":"dispatch","id":"truncated"`,
        'not json at all',
        JSON.stringify({ ...valid, v: 2 }),
        JSON.stringify({ ...valid, type: 'unsupported' }),
        '',
      ].join('\n'),
    );

    const result = readLedger(root);
    expect(result.records).toHaveLength(1);
    expect(result.skipped).toBe(4);
    expect(result.readError).toBeNull();
  });

  it('discards unknown fields from otherwise valid lines without counting them as skipped', () => {
    const valid = dispatchRecord();
    mkdirSync(join(root, '.agentic', 'kiki'), { recursive: true });
    writeFileSync(
      ledgerPath(),
      `${JSON.stringify({ ...valid, prompt: SENTINEL, extra: { nested: SENTINEL } })}\n`,
    );

    const result = readLedger(root);
    expect(result.skipped).toBe(0);
    expect(result.records).toEqual([valid]);
    expect(JSON.stringify(result.records)).not.toContain(SENTINEL);
  });

  it('preserves null versus zero token evidence and unknown versus idle status', () => {
    const write = createLedgerWriter(root);
    const unknownUsage = sessionRecord({ status: 'unknown', tokens: null, tokenSource: 'unknown' });
    const zeroUsage = sessionRecord({
      id: 'session:zero:event-2',
      status: 'idle',
      tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
      tokenSource: 'session.usage.updated',
      retries: 0,
    });
    expect(write(unknownUsage)).toBe(true);
    expect(write(zeroUsage)).toBe(true);

    const [first, second] = readLedger(root).records as SessionRecord[];
    expect(first.tokens).toBeNull();
    expect(first.status).toBe('unknown');
    expect(second.tokens).toEqual({
      input: 0,
      output: 0,
      reasoning: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
    expect(second.status).toBe('idle');
    expect(second.retries).toBe(0);
  });

  it('skips a session line whose token evidence is missing rather than inventing zero', () => {
    const { tokens: _tokens, ...withoutTokens } = sessionRecord();
    mkdirSync(join(root, '.agentic', 'kiki'), { recursive: true });
    writeFileSync(ledgerPath(), `${JSON.stringify(withoutTokens)}\n`);

    expect(readLedger(root)).toEqual({ records: [], skipped: 1, readError: null });
  });

  it('returns a read error without throwing when the ledger is not a readable file', () => {
    mkdirSync(ledgerPath(), { recursive: true });
    const result = readLedger(root);
    expect(result.records).toEqual([]);
    expect(result.skipped).toBe(0);
    expect(typeof result.readError).toBe('string');
    expect(result.readError).not.toBe('');
  });
});
