import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Plugin } from '@opencode/plugin';
import { DEFAULT_HEALTH } from '../cli/config.js';
import { startRoutingLogger } from './routing-logger.js';
import { createWatchdog, createWatchdogSessionAdapter } from './watchdog.js';
import { decodeWatchdogEvent } from './watchdog-events.js';
const ITERATOR_SHUTDOWN_TIMEOUT_MS = 250;
const WATCHDOG_STOP_TIMEOUT_MS = 1_000;
function isPositiveInt(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 && Math.floor(value) === value;
}
/**
 * Sanitizes a health section exactly like the V1 runtime did: invalid values
 * fall back to the default for that field, never to an unvalidated input.
 */
export function sanitizeHealth(raw) {
    const out = { ...DEFAULT_HEALTH };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return out;
    const source = raw;
    if (typeof source.watchdogEnabled === 'boolean')
        out.watchdogEnabled = source.watchdogEnabled;
    if (typeof source.watchAllSubagents === 'boolean') {
        out.watchAllSubagents = source.watchAllSubagents;
    }
    if (typeof source.logPath === 'string' && source.logPath.length > 0) {
        out.logPath = source.logPath;
    }
    if (isPositiveInt(source.stuckThresholdMs))
        out.stuckThresholdMs = source.stuckThresholdMs;
    if (isPositiveInt(source.gracePeriodMs))
        out.gracePeriodMs = source.gracePeriodMs;
    if (isPositiveInt(source.absoluteMaxMs))
        out.absoluteMaxMs = source.absoluteMaxMs;
    if (isPositiveInt(source.checkIntervalMs))
        out.checkIntervalMs = source.checkIntervalMs;
    if (isPositiveInt(source.loopRepeatCount) && source.loopRepeatCount >= 2) {
        out.loopRepeatCount = source.loopRepeatCount;
    }
    return out;
}
/** Loads only the project-scoped health settings; no global or cwd fallback. */
export function loadHealthConfig(directory) {
    try {
        const raw = JSON.parse(readFileSync(join(directory, '.agentic', 'kiki', 'config.json'), 'utf-8'));
        return sanitizeHealth(raw.health);
    }
    catch {
        return sanitizeHealth(null);
    }
}
function createHealthWriter(directory, config) {
    return (level, entry) => {
        try {
            const logPath = join(directory, config.logPath);
            const logDirectory = dirname(logPath);
            if (!existsSync(logDirectory))
                mkdirSync(logDirectory, { recursive: true });
            appendFileSync(logPath, `${JSON.stringify({ level, timestamp: new Date().toISOString(), ...entry })}\n`);
        }
        catch {
            // A failing health log must never break watchdog evaluation or cleanup.
        }
    };
}
/**
 * Resolves when `promise` settles or after `timeoutMs`, whichever comes first.
 * Cleanup uses this so an idle stream or a stalled discovery cannot block
 * plugin unload forever; the watchdog's own `stopped` latch suppresses any
 * late result.
 */
function settleWithin(promise, timeoutMs) {
    return new Promise((resolve) => {
        let settled = false;
        const timer = setTimeout(() => {
            if (settled)
                return;
            settled = true;
            resolve();
        }, timeoutMs);
        timer.unref?.();
        const finish = () => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve();
        };
        promise.then(finish, finish);
    });
}
export async function setup(ctx) {
    const root = ctx.location.directory;
    const health = loadHealthConfig(root);
    // The logger is acquired first; every later failure must release it.
    const stopLogger = await startRoutingLogger(ctx);
    const controller = new AbortController();
    let watchdog = null;
    let iterator = null;
    let streamLoop = null;
    let disposal = null;
    const dispose = () => {
        if (disposal)
            return disposal;
        disposal = (async () => {
            controller.abort();
            // `stop()` latches `stopped` and clears the interval synchronously before
            // awaiting an in-flight tick, so start it before the iterator waits.
            const watchdogStop = watchdog
                ? settleWithin(watchdog.stop(), WATCHDOG_STOP_TIMEOUT_MS)
                : null;
            const currentIterator = iterator;
            if (currentIterator?.return) {
                try {
                    await settleWithin(Promise.resolve(currentIterator.return()), ITERATOR_SHUTDOWN_TIMEOUT_MS);
                }
                catch {
                    // Cancellation must not reject cleanup.
                }
            }
            if (streamLoop)
                await settleWithin(streamLoop, ITERATOR_SHUTDOWN_TIMEOUT_MS);
            if (watchdogStop)
                await watchdogStop;
            await stopLogger();
        })();
        return disposal;
    };
    try {
        const adapter = createWatchdogSessionAdapter(ctx.session, root);
        watchdog = createWatchdog({
            config: health,
            directory: root,
            now: () => Date.now(),
            interrupt: (id) => adapter.interrupt(id),
            discover: () => adapter.discover(),
            writeHealth: createHealthWriter(root, health),
        });
        watchdog.start();
        const stream = ctx.event.subscribe({ signal: controller.signal });
        iterator = stream[Symbol.asyncIterator]();
        const liveIterator = iterator;
        const liveWatchdog = watchdog;
        streamLoop = (async () => {
            try {
                while (!controller.signal.aborted) {
                    const next = await liveIterator.next();
                    if (next.done)
                        break;
                    if (controller.signal.aborted)
                        break;
                    for (const event of decodeWatchdogEvent(next.value))
                        liveWatchdog.handle(event);
                }
            }
            catch {
                // Aborted/cancelled streams and transport failures are expected during cleanup.
            }
        })();
    }
    catch (error) {
        await dispose();
        throw error;
    }
    return dispose;
}
export default Plugin.define({ id: 'kiki', setup });
//# sourceMappingURL=index.js.map