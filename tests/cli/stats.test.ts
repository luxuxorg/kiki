import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { dirname, join, relative } from 'node:path';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync, execSync, spawn, spawnSync } from 'node:child_process';
import { stats } from '../../src/cli/commands/stats';
import type {
  ComparisonRecord,
  DispatchRecord,
  LedgerRecord,
  SessionRecord,
} from '../../src/diagnostics/ledger';

const fsReadSpy = vi.hoisted(() => vi.fn());
const actualFs = vi.hoisted(() => ({
  readFileSync: undefined as unknown as typeof import('node:fs').readFileSync,
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  actualFs.readFileSync = actual.readFileSync;
  fsReadSpy.mockImplementation(actual.readFileSync);
  return { ...actual, readFileSync: fsReadSpy };
});

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  execFileSync: vi.fn(),
  spawnSync: vi.fn(),
  spawn: vi.fn(),
}));

const T = {
  t0: '2026-11-16T10:00:00.000Z',
  t1: '2026-11-16T10:00:20.000Z',
  t2: '2026-11-16T10:01:00.000Z',
  t3: '2026-11-16T10:02:00.000Z',
  t4: '2026-11-16T10:03:00.000Z',
  t5: '2026-11-16T10:04:59.000Z',
  t6: '2026-11-16T10:06:00.000Z',
  t7: '2026-11-16T10:10:00.000Z',
};

const SENTINEL = 'SECRET_SENTINEL_e41d';
const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'kiki-stats-'));
  roots.push(root);
  return root;
}

function writeAt(root: string, rel: string, content: string): void {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content, 'utf8');
}

function writeJson(root: string, rel: string, value: unknown): void {
  writeAt(root, rel, JSON.stringify(value));
}

function writeLedger(root: string, lines: string[]): void {
  writeAt(root, '.agentic/kiki/run_ledger.jsonl', lines.join('\n'));
}

function writeConfig(root: string, value: unknown): void {
  writeJson(root, '.agentic/kiki/config.json', value);
}

function declared(
  taskId: string,
  kind: DispatchRecord['declared']['kind'],
  comparisonGroup = 'unknown',
): DispatchRecord['declared'] {
  return { taskId, kind, comparisonGroup, model: 'provider/model' };
}

function dispatchRecord(overrides: Partial<DispatchRecord> = {}): DispatchRecord {
  return {
    v: 1,
    id: 'dispatch:p1:call-1',
    timestamp: T.t0,
    type: 'dispatch',
    parentSessionId: 'p1',
    callId: 'call-1',
    agent: 'kiki-implementer',
    declared: declared('diag', 'fix'),
    childSessionId: 'unknown',
    ...overrides,
  };
}

function sessionRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    v: 1,
    id: 'session:c1:event-1',
    timestamp: T.t1,
    type: 'session',
    sessionId: 'c1',
    parentSessionId: 'p1',
    agent: 'kiki-implementer',
    startedAt: T.t1,
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
    timestamp: T.t0,
    type: 'comparison',
    taskId: 'diag',
    comparisonGroup: 'trial',
    startRevision: 'abc1234',
    endRevision: 'unknown',
    ...overrides,
  };
}

function toLines(records: LedgerRecord[]): string[] {
  return records.map(record => JSON.stringify(record));
}

function captureConsole(): { output: () => string } {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  return { output: () => log.mock.calls.flat().join('\n') };
}

function outputRow(output: string, prefix: string): string {
  const row = output.split('\n').find(line => line.startsWith(prefix));
  expect(row, `missing output row starting with ${prefix}`).toBeDefined();
  return row as string;
}

function snapshotFiles(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const full = join(directory, entry);
      if (statSync(full).isDirectory()) walk(full);
      else files[relative(root, full)] = createHash('sha256').update(readFileSync(full)).digest('hex');
    }
  };
  walk(root);
  return files;
}

beforeEach(() => {
  fsReadSpy.mockImplementation(actualFs.readFileSync);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true });
});

describe('stats declared invocations and observed sessions', () => {
  it('prints separate declared and session tables while preserving task, kind and comparison fields', async () => {
    const root = makeRoot();
    writeLedger(root, toLines([
      dispatchRecord(),
      dispatchRecord({
        id: 'dispatch:p1:call-2', callId: 'call-2', timestamp: T.t2,
        agent: 'kiki-reviewer', declared: declared('diag', 'review', 'trial'),
      }),
      dispatchRecord({
        id: 'dispatch:p1:call-3', callId: 'call-3', timestamp: T.t3,
        agent: 'kiki-reviewer', declared: declared('diag', 'review', 'trial'),
      }),
      sessionRecord(),
      sessionRecord({
        id: 'session:c1:finished', timestamp: T.t5, status: 'succeeded',
        endedAt: T.t5, tokenSource: 'session.usage.updated', retries: 1, partial: false,
        tokens: { input: 10, output: 20, reasoning: 3, cacheRead: 4, cacheWrite: 5 },
      }),
      sessionRecord({
        id: 'session:c2:event-1', timestamp: T.t6, sessionId: 'c2',
        startedAt: T.t6, agent: 'kiki-implementer',
      }),
      comparisonRecord(),
    ]));

    const consoleCapture = captureConsole();
    try {
      expect(await stats(root)).toBe(0);
      const output = consoleCapture.output();

      expect(output).toContain('=== Declared dispatch invocations ===');
      expect(output).toContain('=== Observed child sessions ===');
      expect(output).toContain('declaredInvocations=3 fix=1 review=2');
      expect(output).toContain('- task=diag kind=fix cmp=unknown invocations=1');
      expect(output).toContain('- task=diag kind=review cmp=trial invocations=2');
      expect(output).toContain('observedSessions=2');

      const finished = outputRow(output, '- session=c1 ');
      expect(finished).toContain('agent=kiki-implementer');
      expect(finished).toContain('status=succeeded');
      expect(finished).toContain(`startedAt=${T.t1}`);
      expect(finished).toContain(`endedAt=${T.t5}`);
      expect(finished).toContain('durationMs=279000');
      expect(finished).toContain('retries=1');
      expect(finished).toContain('partial=false');
      expect(finished).toContain('tokenSource=session.usage.updated');
      expect(finished).toContain('tokens.input=10');
      expect(finished).toContain('tokens.output=20');
      expect(finished).toContain('tokens.reasoning=3');
      expect(finished).toContain('tokens.cacheRead=4');
      expect(finished).toContain('tokens.cacheWrite=5');
      expect(finished).not.toContain('task=');
      expect(finished).not.toContain('childSessionId');

      const running = outputRow(output, '- session=c2 ');
      expect(running).toContain('agent=kiki-implementer');
      expect(running).toContain('status=running');
      expect(running).toContain('durationMs=unknown');
      expect(running).toContain('tokens=unknown');
      expect(running).not.toContain('task=');

      const comparison = outputRow(output, '- group=trial ');
      expect(comparison).toContain('task=diag');
      expect(comparison).toContain('startRevision=abc1234');
      expect(comparison).toContain('endRevision=unknown');
      expect(comparison).toContain('declaredDispatches=2');
      expect(comparison).toContain('observedSessionTokens=unknown');
      expect(comparison).not.toContain('tokens.input=');
      expect(output).toContain('no verified dispatch-to-session link');
    } finally {
      consoleCapture.output();
    }
  });

  it('deduplicates replayed dispatches and keeps only the latest session snapshot', async () => {
    const root = makeRoot();
    const oldSnapshot = sessionRecord({
      id: 'session:c1:event-1', timestamp: T.t1,
      tokens: { input: 5, output: 5, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
      tokenSource: 'session.usage.updated',
    });
    const latestSnapshot = sessionRecord({
      id: 'session:c1:event-2', timestamp: T.t7, status: 'succeeded', endedAt: T.t7,
      tokens: { input: 9, output: 9, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
      tokenSource: 'session.usage.updated', partial: false,
    });
    writeLedger(root, toLines([
      dispatchRecord(),
      dispatchRecord(),
      oldSnapshot,
      latestSnapshot,
      sessionRecord(oldSnapshot),
    ]));

    const consoleCapture = captureConsole();
    try {
      expect(await stats(root)).toBe(0);
      const output = consoleCapture.output();
      expect(output).toContain('declaredInvocations=1 fix=1 review=0');
      expect(output).toContain('observedSessions=1');
      expect(output).toContain('skipped=0');
      const sessionLines = output.split('\n').filter(line => line.startsWith('- session=c1 '));
      expect(sessionLines).toHaveLength(1);
      expect(sessionLines[0]).toContain('tokens.input=9');
      expect(sessionLines[0]).not.toContain('tokens.input=14');
      expect(output).not.toContain('tokens.input=5 ');
    } finally {
      consoleCapture.output();
    }
  });
});

describe('stats tolerant input handling', () => {
  it('skips truncated, future-version and invalid-number lines without echoing invalid data', async () => {
    const root = makeRoot();
    const validDispatch = dispatchRecord();
    const zeroSession = sessionRecord({
      id: 'session:zero:event-1', sessionId: 'zero', status: 'succeeded', endedAt: T.t5,
      tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
      tokenSource: 'session.usage.updated', partial: false,
    });
    const unknownSession = sessionRecord({
      id: 'session:unknown:event-1', sessionId: 'unknown-tokens', timestamp: T.t6,
      startedAt: T.t6,
    });
    writeLedger(root, [
      JSON.stringify(validDispatch),
      '{"v":1,"type":"dispatch"',
      JSON.stringify({ v: 2, type: 'session', id: 'future', sessionId: SENTINEL }),
      JSON.stringify({
        ...sessionRecord({ id: 'session:invalid:event-1', sessionId: SENTINEL }),
        tokens: { input: SENTINEL, output: 1, reasoning: 1, cacheRead: 1, cacheWrite: 1 },
        secret: SENTINEL,
      }),
      JSON.stringify(zeroSession),
      JSON.stringify(unknownSession),
    ]);

    const consoleCapture = captureConsole();
    try {
      expect(await stats(root)).toBe(0);
      const output = consoleCapture.output();
      expect(output).toContain('ledgerRecords=3 skipped=3');
      expect(output).toContain('observedSessions=2');
      expect(outputRow(output, '- session=zero ')).toContain('tokens.input=0');
      expect(outputRow(output, '- session=unknown-tokens ')).toContain('tokens=unknown');
      expect(output).not.toContain(SENTINEL);
      expect(output).not.toContain('"v":1,"type":"dispatch"');
      expect(output).not.toContain('"v":2');
    } finally {
      consoleCapture.output();
    }
  });

  it('returns 1 with a sanitized message for an unreadable ledger', async () => {
    const root = makeRoot();
    writeConfig(root, { diagnostics: { enabled: true } });
    mkdirSync(join(root, '.agentic/kiki/run_ledger.jsonl'), { recursive: true });

    const consoleCapture = captureConsole();
    try {
      expect(await stats(root)).toBe(1);
      const output = consoleCapture.output();
      expect(output).toContain('ledger=unavailable (read error)');
      expect(output).not.toContain('EISDIR');
      expect(output).not.toContain('    at ');
      expect(output).not.toContain(SENTINEL);
    } finally {
      consoleCapture.output();
    }
  });

  it('returns 1 with a sanitized message for malformed project config', async () => {
    const root = makeRoot();
    writeAt(root, '.agentic/kiki/config.json', `{ not-json ${SENTINEL}`);

    const consoleCapture = captureConsole();
    try {
      expect(await stats(root)).toBe(1);
      const output = consoleCapture.output();
      expect(output).toContain('config=unavailable (malformed or unreadable project config)');
      expect(output).not.toContain(SENTINEL);
      expect(output).not.toContain('    at ');
    } finally {
      consoleCapture.output();
    }
  });
});

describe('stats watchdog incident join', () => {
  it('joins aborts by session id, counts abort once and keeps quiet warnings separate', async () => {
    const root = makeRoot();
    writeLedger(root, toLines([
      dispatchRecord(),
      sessionRecord({ status: 'succeeded', endedAt: T.t5, partial: false }),
    ]));
    const abort = {
      level: 'warn', timestamp: T.t2, event: 'watchdog-abort',
      sessionId: 'c1', agent: 'kiki-implementer', reason: 'stuck',
      elapsedMs: 100, message: SENTINEL,
    };
    writeAt(root, '.agentic/kiki/health_log.jsonl', [
      JSON.stringify(abort),
      JSON.stringify(abort),
      JSON.stringify({ level: 'info', timestamp: T.t3, event: 'watchdog-abort-ok', sessionId: 'c1' }),
      JSON.stringify({
        level: 'error', timestamp: T.t4, event: 'watchdog-abort-failed',
        sessionId: 'c1', message: SENTINEL,
      }),
      JSON.stringify({
        level: 'debug', timestamp: T.t4, event: 'watchdog-quiet',
        sessionId: 'c1', silentMs: 500,
      }),
      JSON.stringify({
        level: 'warn', timestamp: T.t6, event: 'watchdog-abort',
        sessionId: 'missing-child', agent: 'kiki-implementer',
        reason: 'absolute-timeout', elapsedMs: 200,
      }),
      `not-json ${SENTINEL}`,
    ].join('\n'));

    const consoleCapture = captureConsole();
    try {
      expect(await stats(root)).toBe(0);
      const output = consoleCapture.output();
      expect(output).toContain('abortIncidents=2');
      expect(output).toContain('abortOutcomes ok=1 failed=1');
      expect(output).toContain('quietWarnings=1');
      expect(output).toContain('healthLogSkipped=1');
      expect(output).toContain('- session=c1 abortIncidents=1 quietWarnings=1 reasons=stuck');
      expect(output).toContain('- unmatchedIncidentSession=missing-child abortIncidents=1 quietWarnings=0 reasons=absolute-timeout');
      expect(output).not.toContain(SENTINEL);
      expect(output).not.toContain('"message"');
    } finally {
      consoleCapture.output();
    }
  });

  it('reports an unavailable health log as unknown, never as zero incidents', async () => {
    const root = makeRoot();
    writeLedger(root, toLines([sessionRecord()]));

    const consoleCapture = captureConsole();
    try {
      expect(await stats(root)).toBe(0);
      const output = consoleCapture.output();
      expect(output).toContain('healthLog=');
      expect(output).toContain('abortIncidents=unknown');
      expect(output).toContain('quietWarnings=unknown');
      expect(output).toContain('incident counts unknown, not zero');
    } finally {
      consoleCapture.output();
    }
  });
});

describe('stats registry references and custom paths', () => {
  it('resolves current spec/plan paths and leaves missing task and revision references unknown', async () => {
    const root = makeRoot();
    writeConfig(root, {
      diagnostics: { enabled: true },
      paths: { taskRegistry: 'custom/registry.json' },
      health: { logPath: 'custom/health.jsonl' },
    });
    writeJson(root, 'custom/registry.json', {
      tasks: [
        {
          id: 'diag',
          spec: 'docs/specs/current-spec.md',
          plan: 'docs/plans/current-plan.md',
        },
      ],
    });
    writeAt(root, 'custom/health.jsonl', JSON.stringify({
      level: 'warn', timestamp: T.t2, event: 'watchdog-abort',
      sessionId: 'c1', reason: 'stuck', elapsedMs: 100,
    }));
    writeLedger(root, toLines([
      dispatchRecord({ declared: declared('diag', 'review', 'trial') }),
      dispatchRecord({
        id: 'dispatch:p1:call-2', callId: 'call-2', timestamp: T.t2,
        declared: declared('missing-task', 'initial'),
      }),
      sessionRecord(),
      comparisonRecord(),
    ]));

    const consoleCapture = captureConsole();
    try {
      expect(await stats(root)).toBe(0);
      const output = consoleCapture.output();
      expect(output).toContain(`registry=${join(root, 'custom/registry.json')}`);
      expect(output).toContain(`healthLog=${join(root, 'custom/health.jsonl')}`);
      expect(output).not.toContain('.agentic/kiki/health_log.jsonl');
      expect(output).toContain('current reference paths, not historical versions');
      expect(output).toContain(
        '- task=diag invocations=1 spec=docs/specs/current-spec.md plan=docs/plans/current-plan.md',
      );
      expect(output).toContain(
        '- task=missing-task invocations=1 spec=unknown plan=unknown (no matching registry task)',
      );
      expect(outputRow(output, '- group=trial ')).toContain('startRevision=abc1234');
      expect(outputRow(output, '- group=trial ')).toContain('endRevision=unknown');
      expect(output).toContain('abortIncidents=1');
      expect(output).not.toContain('HEAD');
    } finally {
      consoleCapture.output();
    }
  });

  it('shows an unavailable registry without inventing paths', async () => {
    const root = makeRoot();
    writeLedger(root, toLines([dispatchRecord()]));

    const consoleCapture = captureConsole();
    try {
      expect(await stats(root)).toBe(0);
      const output = consoleCapture.output();
      expect(output).toContain('registry=');
      expect(output).toContain('unavailable: no registry file');
      expect(output).toContain(
        '- task=diag invocations=1 spec=unknown plan=unknown (registry unavailable)',
      );
    } finally {
      consoleCapture.output();
    }
  });
});

describe('stats read-only and side-effect boundaries', () => {
  it('does not write, create, attribute, call out or read referenced document contents', async () => {
    const root = makeRoot();
    writeConfig(root, { diagnostics: { enabled: true } });
    writeJson(root, '.agentic/kiki/TASK_REGISTRY.json', {
      tasks: [{ id: 'diag', spec: 'docs/specs/ref.md', plan: 'docs/plans/ref.md' }],
    });
    writeAt(root, 'docs/specs/ref.md', `spec body ${SENTINEL}`);
    writeAt(root, 'docs/plans/ref.md', `plan body ${SENTINEL}`);
    writeAt(root, '.agentic/kiki/health_log.jsonl', JSON.stringify({
      level: 'warn', timestamp: T.t2, event: 'watchdog-abort',
      sessionId: 'c1', reason: 'stuck', elapsedMs: 100,
    }));
    writeLedger(root, toLines([
      dispatchRecord(),
      sessionRecord({ status: 'succeeded', endedAt: T.t5, partial: false }),
    ]));

    const before = snapshotFiles(root);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    fsReadSpy.mockClear();

    const consoleCapture = captureConsole();
    try {
      expect(await stats(root)).toBe(0);
      const output = consoleCapture.output();
      expect(output).not.toContain(SENTINEL);
      expect(output).not.toContain('spec body');
      expect(output).not.toContain('plan body');
    } finally {
      consoleCapture.output();
    }

    const readPaths = fsReadSpy.mock.calls.map(call => String(call[0]));
    expect(readPaths).not.toContain(join(root, 'docs/specs/ref.md'));
    expect(readPaths).not.toContain(join(root, 'docs/plans/ref.md'));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(execSync).not.toHaveBeenCalled();
    expect(execFileSync).not.toHaveBeenCalled();
    expect(spawnSync).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
    expect(snapshotFiles(root)).toEqual(before);
  });

  it('reports an enabled collection observation gap when no ledger exists', async () => {
    const root = makeRoot();
    writeConfig(root, { diagnostics: { enabled: true } });
    const consoleCapture = captureConsole();
    try {
      expect(await stats(root)).toBe(0);
      const output = consoleCapture.output();
      expect(output).toContain('collection=enabled');
      expect(output).toContain('no ledger data');
      expect(output).toContain('observationGap=');
      expect(output).toContain('cannot tell whether writes failed or no child ran');
    } finally {
      consoleCapture.output();
    }
    expect(existsSync(join(root, '.agentic/kiki/run_ledger.jsonl'))).toBe(false);
  });

  it('creates no directories or files when the project has no diagnostics data', async () => {
    const root = makeRoot();
    const consoleCapture = captureConsole();
    try {
      expect(await stats(root)).toBe(0);
      const output = consoleCapture.output();
      expect(output).toContain('collection=disabled');
      expect(output).toContain('no ledger data');
      expect(output).toContain('abortIncidents=unknown');
    } finally {
      consoleCapture.output();
    }
    expect(readdirSync(root)).toEqual([]);
  });
});
