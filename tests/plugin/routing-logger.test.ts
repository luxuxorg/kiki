import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startRoutingLogger } from '../../src/server/routing-logger';
import type { ServerContext } from '../../src/server/index';

interface HookRecord {
  name: string;
  handler: (event: { tool: string; input: unknown }) => Promise<void> | void;
  disposeCalls: number;
  disposed: boolean;
}

function makeContext(root: string): { ctx: ServerContext; hooks: HookRecord[] } {
  const hooks: HookRecord[] = [];
  const ctx = {
    location: { directory: root },
    tool: {
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
    },
  } as unknown as ServerContext;
  return { ctx, hooks };
}

function readEntries(root: string): Array<Record<string, unknown>> {
  const file = join(root, '.agentic', 'kiki', 'routing_log.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('startRoutingLogger', () => {
  let root: string;
  let decoy: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kiki-routing-root-'));
    decoy = mkdtempSync(join(tmpdir(), 'kiki-routing-decoy-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(decoy, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('logs only timestamp, kiki agent and model for a subagent dispatch', async () => {
    const { ctx, hooks } = makeContext(root);
    const dispose = await startRoutingLogger(ctx);

    expect(existsSync(join(root, '.agentic', 'kiki', 'routing_log.jsonl'))).toBe(false);
    await hooks[0].handler({
      tool: 'subagent',
      input: {
        agent: 'kiki-reviewer',
        description: 'Review migration safety',
        prompt: 'TOP-SECRET-PROMPT',
        model: 'openai/gpt-6.1-sol',
      },
    });

    const entries = readEntries(root);
    expect(entries).toHaveLength(1);
    expect(Object.keys(entries[0]).sort()).toEqual(['agent', 'model', 'timestamp']);
    expect(entries[0]).toMatchObject({
      agent: 'kiki-reviewer',
      model: 'openai/gpt-6.1-sol',
    });
    expect(typeof entries[0].timestamp).toBe('string');
    expect(JSON.stringify(entries[0])).not.toContain('Review migration safety');
    expect(JSON.stringify(entries[0])).not.toContain('TOP-SECRET-PROMPT');

    await dispose();
  });

  it('falls back to model "unknown" when the subagent input has no model', async () => {
    const { ctx, hooks } = makeContext(root);
    const dispose = await startRoutingLogger(ctx);

    await hooks[0].handler({
      tool: 'subagent',
      input: { agent: 'kiki-implementer', description: 'Implement task' },
    });

    expect(readEntries(root)).toEqual([
      expect.objectContaining({ agent: 'kiki-implementer', model: 'unknown' }),
    ]);
    await dispose();
  });

  it('ignores unrelated tools and non-kiki agents without writing a log', async () => {
    const { ctx, hooks } = makeContext(root);
    const dispose = await startRoutingLogger(ctx);

    await hooks[0].handler({ tool: 'read', input: { agent: 'kiki-reviewer' } });
    await hooks[0].handler({ tool: 'subagent', input: { agent: 'general' } });
    await hooks[0].handler({ tool: 'subagent', input: { description: 'no agent' } });
    await hooks[0].handler({ tool: 'subagent', input: null });

    expect(readEntries(root)).toEqual([]);
    await dispose();
  });

  it('leaves the caller input untouched', async () => {
    const { ctx, hooks } = makeContext(root);
    const dispose = await startRoutingLogger(ctx);
    const input = {
      agent: 'kiki-planner',
      description: 'Plan work',
      prompt: 'PROMPT',
      model: 'anthropic/claude',
      sessionID: 'session-1',
    };
    const before = structuredClone(input);

    await hooks[0].handler({ tool: 'subagent', input });
    expect(input).toEqual(before);
    await dispose();
  });

  it('resolves the project root from ctx.location.directory, not the process cwd', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(decoy);
    const { ctx, hooks } = makeContext(root);
    const dispose = await startRoutingLogger(ctx);

    await hooks[0].handler({
      tool: 'subagent',
      input: { agent: 'kiki-escalation', model: 'openai/gpt' },
    });

    expect(readEntries(root)).toHaveLength(1);
    expect(readEntries(decoy)).toEqual([]);
    await dispose();
  });

  it('appends one JSONL line per matching dispatch', async () => {
    const { ctx, hooks } = makeContext(root);
    const dispose = await startRoutingLogger(ctx);

    await hooks[0].handler({ tool: 'subagent', input: { agent: 'kiki-planner' } });
    await hooks[0].handler({ tool: 'subagent', input: { agent: 'kiki-historian', model: 'x/y' } });

    const entries = readEntries(root);
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.agent)).toEqual(['kiki-planner', 'kiki-historian']);
    await dispose();
  });

  it('stops logging after disposal and disposal is idempotent', async () => {
    const { ctx, hooks } = makeContext(root);
    const dispose = await startRoutingLogger(ctx);

    await dispose();
    await dispose();

    expect(hooks[0].disposed).toBe(true);
    expect(hooks[0].disposeCalls).toBe(1);
    await hooks[0].handler({ tool: 'subagent', input: { agent: 'kiki-reviewer' } });
    expect(readEntries(root)).toEqual([]);
  });
});
