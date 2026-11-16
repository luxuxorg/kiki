import type { DispatchRecord } from '../diagnostics/ledger.js';
import type { ServerContext } from './index.js';
/**
 * Registers the V2 `execute.before` routing hook. Only the selected Kiki agent
 * and its model are persisted to the routing log; the subagent description,
 * prompt and any other tool input never reach that log. An optional metadata
 * observer receives one dispatch record at `execute.before`; that observation
 * means the invocation happened, not that a child started or completed.
 *
 * The project root comes from `ctx.location`, never `process.cwd()`. The
 * returned disposer is idempotent and must be awaited by the plugin cleanup so
 * the hook is gone before OC2 reloads the plugin.
 */
export declare function startRoutingLogger(ctx: ServerContext, onDispatch?: (record: DispatchRecord) => void): Promise<() => Promise<void>>;
//# sourceMappingURL=routing-logger.d.ts.map