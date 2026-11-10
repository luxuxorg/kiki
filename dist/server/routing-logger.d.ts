import type { ServerContext } from './index.js';
/**
 * Registers the V2 `execute.before` routing hook. Only the selected Kiki agent
 * and its model are persisted; the subagent description, prompt and any other
 * tool input never reach the log. The project root comes from `ctx.location`,
 * never `process.cwd()`.
 *
 * The returned disposer is idempotent and must be awaited by the plugin
 * cleanup so the hook is gone before OC2 reloads the plugin.
 */
export declare function startRoutingLogger(ctx: ServerContext): Promise<() => Promise<void>>;
//# sourceMappingURL=routing-logger.d.ts.map