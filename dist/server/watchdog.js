const DISCOVERY_PAGE_LIMIT = 100;
/**
 * Adapts the published OC2 session domain to the watchdog. Child discovery uses
 * `session.list()` and the `parentID` field, follows `cursor.next` so a default
 * server page cap cannot hide older children, and ignores archived or
 * foreign-location sessions. Interruption uses `session.interrupt({ sessionID })`.
 * The OC1 `session.messages`/`session.abort` surface is intentionally absent.
 */
export function createWatchdogSessionAdapter(session, directory) {
    return {
        async discover() {
            const events = [];
            const seenCursors = new Set();
            const seenIds = new Set();
            let cursor;
            for (;;) {
                const page = await session.list({
                    limit: DISCOVERY_PAGE_LIMIT,
                    archived: false,
                    ...(directory === undefined ? {} : { directory }),
                    ...(cursor === undefined ? {} : { cursor }),
                });
                for (const child of page.data) {
                    if (child.parentID === undefined)
                        continue;
                    if (child.time?.archived !== undefined)
                        continue;
                    if (directory !== undefined &&
                        child.location?.directory !== undefined &&
                        child.location.directory !== directory) {
                        continue;
                    }
                    if (seenIds.has(child.id))
                        continue;
                    seenIds.add(child.id);
                    const event = {
                        type: 'child',
                        id: child.id,
                        parentID: child.parentID,
                    };
                    if (child.agent !== undefined)
                        event.agent = child.agent;
                    events.push(event);
                }
                const next = page.cursor?.next ?? undefined;
                if (!next || seenCursors.has(next))
                    break;
                seenCursors.add(next);
                cursor = next;
            }
            return events;
        },
        async interrupt(id) {
            await session.interrupt({ sessionID: id });
        },
    };
}
const RING_SIZE = 8;
const MAX_TRACKED_TEXT_ITEMS = 64;
const MAX_FINISHED_SESSIONS = 1024;
function normalize(text) {
    return String(text == null ? '' : text)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}
function hashText(text) {
    let hash = 0x811c9dc5;
    const normalized = normalize(text);
    for (let i = 0; i < normalized.length; i++) {
        hash ^= normalized.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(36);
}
function toolSignature(name, input) {
    try {
        return `${name}:${JSON.stringify(input ?? {})}`;
    }
    catch {
        return `${name}:?`;
    }
}
function recordRing(entries, key, value) {
    const existing = entries.find((entry) => entry.key === key);
    if (existing) {
        // A streaming fragment updates the same logical item instead of adding a
        // new ring entry, so fragments can never masquerade as repeated output.
        existing.value = value;
        return;
    }
    entries.push({ key, value });
    while (entries.length > RING_SIZE)
        entries.shift();
}
function tailAllSame(values, count) {
    if (count <= 0 || values.length < count)
        return false;
    const first = values[values.length - 1];
    for (let i = values.length - count; i < values.length; i++) {
        if (values[i] !== first)
            return false;
    }
    return true;
}
/**
 * Typed replacement for the generated V1 watchdog. The thresholds, rings,
 * content normalization/hash, grace/absolute/silence gates, agent filtering,
 * root exclusion and health-log fields are unchanged; only the input event
 * shape and interrupt call are V2-native.
 */
export function createWatchdog(deps) {
    const config = deps.config;
    const now = deps.now;
    const sessions = new Map();
    const finishedSessions = new Set();
    let interval = null;
    let stopped = false;
    let ticking = null;
    function writeHealth(level, entry) {
        try {
            deps.writeHealth(level, entry);
        }
        catch {
            // A failing health log must never break watchdog evaluation or cleanup.
        }
    }
    function register(event) {
        if (finishedSessions.has(event.id))
            return;
        const existing = sessions.get(event.id);
        if (existing) {
            if (event.agent !== undefined)
                existing.agentName = event.agent;
            return;
        }
        if (!event.parentID)
            return;
        sessions.set(event.id, {
            sessionId: event.id,
            parentId: event.parentID,
            agentName: event.agent !== undefined ? event.agent : null,
            status: 'busy',
            startedAt: now(),
            lastActivityAt: now(),
            lastTokens: null,
            partEntries: [],
            toolEntries: [],
            toolNames: new Map(),
            texts: new Map(),
            warned50: false,
        });
    }
    function markFinished(id) {
        sessions.delete(id);
        finishedSessions.delete(id);
        finishedSessions.add(id);
        while (finishedSessions.size > MAX_FINISHED_SESSIONS) {
            const oldest = finishedSessions.values().next();
            if (oldest.done)
                break;
            finishedSessions.delete(oldest.value);
        }
    }
    function recordText(state, event) {
        state.lastActivityAt = now();
        const previous = state.texts.get(event.key) ?? '';
        const next = event.mode === 'append' ? previous + event.text : event.text;
        state.texts.set(event.key, next);
        // Only the current/recent logical items are needed for streaming
        // accumulation; the loop ring itself stays at RING_SIZE.
        while (state.texts.size > MAX_TRACKED_TEXT_ITEMS) {
            const oldest = state.texts.keys().next();
            if (oldest.done)
                break;
            state.texts.delete(oldest.value);
        }
        recordRing(state.partEntries, event.key, hashText(next));
    }
    function recordTool(state, event) {
        state.lastActivityAt = now();
        if (event.name)
            state.toolNames.set(event.key, event.name);
        if (event.input === undefined)
            return;
        const name = event.name || state.toolNames.get(event.key) || '';
        recordRing(state.toolEntries, event.key, toolSignature(name, event.input));
        // The name was only needed until the completed call arrived.
        state.toolNames.delete(event.key);
    }
    function recordTokens(state, counters) {
        const previous = state.lastTokens;
        state.lastTokens = counters;
        if (!previous) {
            state.lastActivityAt = now();
            return;
        }
        if (counters.input > previous.input ||
            counters.output > previous.output ||
            counters.reasoning > previous.reasoning ||
            counters.cacheRead > previous.cacheRead ||
            counters.cacheWrite > previous.cacheWrite) {
            state.lastActivityAt = now();
        }
    }
    function shouldWatch(state) {
        if (config.watchAllSubagents)
            return true;
        if (state.agentName == null)
            return true;
        return String(state.agentName).indexOf('kiki-') === 0;
    }
    function evaluate(state) {
        if (!shouldWatch(state))
            return null;
        if (state.status !== 'busy')
            return null;
        const time = now();
        const age = time - state.startedAt;
        const partHashes = state.partEntries.map((entry) => entry.value);
        const toolSignatures = state.toolEntries.map((entry) => entry.value);
        // Loops bypass the grace gate: a loop is real output, not a startup artifact.
        if (tailAllSame(partHashes, config.loopRepeatCount))
            return 'content-loop';
        if (tailAllSame(toolSignatures, config.loopRepeatCount))
            return 'tool-loop';
        if (age < config.gracePeriodMs)
            return null;
        if (age >= config.absoluteMaxMs)
            return 'absolute-timeout';
        const silentMs = time - state.lastActivityAt;
        if (silentMs >= config.stuckThresholdMs)
            return 'stuck';
        if (!state.warned50 && silentMs >= config.stuckThresholdMs / 2) {
            state.warned50 = true;
            writeHealth('debug', {
                event: 'watchdog-quiet',
                sessionId: state.sessionId,
                agent: state.agentName,
                silentMs,
            });
        }
        return null;
    }
    async function abortSession(state, reason) {
        // Remove first: prevents double-interrupt across ticks while the interrupt
        // promise is still in flight, and prevents late discovery from re-adding it.
        markFinished(state.sessionId);
        writeHealth('warn', {
            event: 'watchdog-abort',
            sessionId: state.sessionId,
            agent: state.agentName,
            reason,
            elapsedMs: now() - state.startedAt,
        });
        if (stopped)
            return;
        try {
            await deps.interrupt(state.sessionId);
            if (!stopped) {
                writeHealth('info', { event: 'watchdog-abort-ok', sessionId: state.sessionId });
            }
        }
        catch {
            if (!stopped) {
                writeHealth('error', {
                    event: 'watchdog-abort-failed',
                    sessionId: state.sessionId,
                    message: 'interrupt failed',
                });
            }
        }
    }
    async function runTick() {
        if (stopped || !config.watchdogEnabled)
            return;
        let discovered;
        try {
            discovered = await deps.discover();
        }
        catch {
            return;
        }
        if (stopped)
            return;
        for (const event of discovered ?? [])
            handle(event);
        if (stopped)
            return;
        const toAbort = [];
        sessions.forEach((state) => {
            const verdict = evaluate(state);
            if (verdict)
                toAbort.push({ state, reason: verdict });
        });
        for (const { state, reason } of toAbort) {
            if (stopped)
                break;
            // A terminal event may have arrived while an earlier interrupt was in
            // flight; do not issue a stale second interruption for that child.
            if (!sessions.has(state.sessionId))
                continue;
            await abortSession(state, reason);
        }
    }
    function scheduleTick() {
        if (ticking)
            return;
        ticking = runTick()
            .catch(() => {
            // Evaluation/discovery failures are tolerated; no upstream detail leaks.
        })
            .finally(() => {
            ticking = null;
        });
    }
    function handle(event) {
        if (stopped)
            return;
        switch (event.type) {
            case 'child':
                register(event);
                return;
            case 'finished':
                markFinished(event.id);
                return;
            case 'running': {
                const state = sessions.get(event.id);
                if (state) {
                    state.status = event.status ?? 'busy';
                    state.lastActivityAt = now();
                }
                return;
            }
            case 'text': {
                const state = sessions.get(event.id);
                if (state)
                    recordText(state, event);
                return;
            }
            case 'tool': {
                const state = sessions.get(event.id);
                if (state)
                    recordTool(state, event);
                return;
            }
            case 'tokens': {
                const state = sessions.get(event.id);
                if (state)
                    recordTokens(state, event.counters);
                return;
            }
        }
    }
    function start() {
        if (stopped)
            return;
        if (!config.watchdogEnabled)
            return;
        if (interval)
            return;
        interval = setInterval(scheduleTick, config.checkIntervalMs);
        interval.unref?.();
    }
    async function stop() {
        stopped = true;
        if (interval) {
            clearInterval(interval);
            interval = null;
        }
        const pending = ticking;
        if (pending) {
            try {
                await pending;
            }
            catch {
                // Cleanup must not reject; failures were already tolerated per tick.
            }
        }
    }
    return { handle, start, stop };
}
//# sourceMappingURL=watchdog.js.map