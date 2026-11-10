import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ServerContext } from './index.js';

interface RoutingLogEntry {
  timestamp: string;
  agent: string;
  model: string;
}

interface SubagentSelection {
  agent: string;
  model: string;
}

function subagentSelection(input: unknown): SubagentSelection | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  const agent = record.agent;
  // The routing log has always covered Kiki subagent dispatches only.
  if (typeof agent !== 'string' || !agent.startsWith('kiki-')) return null;
  const model = record.model;
  return {
    agent,
    model: typeof model === 'string' && model.length > 0 ? model : 'unknown',
  };
}

/**
 * Registers the V2 `execute.before` routing hook. Only the selected Kiki agent
 * and its model are persisted; the subagent description, prompt and any other
 * tool input never reach the log. The project root comes from `ctx.location`,
 * never `process.cwd()`.
 *
 * The returned disposer is idempotent and must be awaited by the plugin
 * cleanup so the hook is gone before OC2 reloads the plugin.
 */
export async function startRoutingLogger(ctx: ServerContext): Promise<() => Promise<void>> {
  const root = ctx.location.directory;
  let disposed = false;
  let disposal: Promise<void> | null = null;

  const registration = await ctx.tool.hook('execute.before', (event) => {
    if (disposed) return;
    if (event.tool !== 'subagent') return;
    const selection = subagentSelection(event.input);
    if (!selection) return;

    const entry: RoutingLogEntry = {
      timestamp: new Date().toISOString(),
      agent: selection.agent,
      model: selection.model,
    };
    try {
      const logPath = join(root, '.agentic', 'kiki', 'routing_log.jsonl');
      const directory = dirname(logPath);
      if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
      appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
    } catch {
      // Routing diagnostics must never fail the subagent dispatch.
    }
  });

  return () => {
    if (disposal) return disposal;
    disposed = true;
    disposal = (async () => {
      try {
        await registration.dispose();
      } catch {
        // Cleanup must not throw during plugin unload/reload.
      }
    })();
    return disposal;
  };
}
