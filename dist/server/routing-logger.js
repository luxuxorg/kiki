import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseDispatchLabels } from '../diagnostics/ledger.js';
const MAX_DECLARED_MODEL_LENGTH = 200;
/**
 * Bounds the declared model string that reaches the ledger. Control characters
 * and over-long values become `unknown`; the routing log keeps its own existing
 * model representation.
 */
function boundedDeclaredModel(value) {
    if (typeof value !== 'string' ||
        value.length === 0 ||
        value.length > MAX_DECLARED_MODEL_LENGTH) {
        return 'unknown';
    }
    return /[\u0000-\u001f\u007f]/.test(value) ? 'unknown' : value;
}
function subagentSelection(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        return null;
    const record = input;
    const agent = record.agent;
    // The routing log has always covered Kiki subagent dispatches only.
    if (typeof agent !== 'string' || !agent.startsWith('kiki-'))
        return null;
    const model = record.model;
    return {
        agent,
        model: typeof model === 'string' && model.length > 0 ? model : 'unknown',
        declaredModel: boundedDeclaredModel(model),
        description: record.description,
    };
}
/**
 * Projects only the observed tool-call identities, the target agent, the
 * bounded declared model and the leading label prefix. The prompt, body and any
 * other tool input never reach the dispatch record.
 */
function dispatchRecord(sessionID, callID, selection) {
    // No identity means no observation: an unknown parent/call ID is not invented.
    if (typeof sessionID !== 'string' || sessionID.length === 0)
        return null;
    if (typeof callID !== 'string' || callID.length === 0)
        return null;
    return {
        v: 1,
        id: `dispatch:${sessionID}:${callID}`,
        timestamp: new Date().toISOString(),
        type: 'dispatch',
        parentSessionId: sessionID,
        callId: callID,
        agent: selection.agent,
        declared: {
            ...parseDispatchLabels(selection.description),
            model: selection.declaredModel,
        },
        childSessionId: 'unknown',
    };
}
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
export async function startRoutingLogger(ctx, onDispatch) {
    const root = ctx.location.directory;
    let disposed = false;
    let disposal = null;
    const registration = await ctx.tool.hook('execute.before', (event) => {
        if (disposed)
            return;
        if (event.tool !== 'subagent')
            return;
        const selection = subagentSelection(event.input);
        if (!selection)
            return;
        const entry = {
            timestamp: new Date().toISOString(),
            agent: selection.agent,
            model: selection.model,
        };
        try {
            const logPath = join(root, '.agentic', 'kiki', 'routing_log.jsonl');
            const directory = dirname(logPath);
            if (!existsSync(directory))
                mkdirSync(directory, { recursive: true });
            appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
        }
        catch {
            // Routing diagnostics must never fail the subagent dispatch.
        }
        if (onDispatch) {
            try {
                const record = dispatchRecord(event.sessionID, event.id, selection);
                if (record)
                    onDispatch(record);
            }
            catch {
                // Observation is isolated from both routing logging and the dispatch.
            }
        }
    });
    return () => {
        if (disposal)
            return disposal;
        disposed = true;
        disposal = (async () => {
            try {
                await registration.dispose();
            }
            catch {
                // Cleanup must not throw during plugin unload/reload.
            }
        })();
        return disposal;
    };
}
//# sourceMappingURL=routing-logger.js.map