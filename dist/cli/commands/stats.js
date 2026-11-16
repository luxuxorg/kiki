import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_HEALTH, DEFAULT_PATHS, loadConfig, } from '../config.js';
import { LEDGER_RELATIVE_PATH, readLedger, } from '../../diagnostics/ledger.js';
const SAFE_IDENTIFIER = /^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_REASON = /^[A-Za-z0-9._:-]{1,64}$/;
const SAFE_REVISION = /^[A-Za-z0-9._:/~^@{}+-]{1,128}$/;
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** Prints only allowlisted, bounded identifiers; anything else becomes unknown. */
function safeIdentifier(value) {
    return typeof value === 'string' && SAFE_IDENTIFIER.test(value) ? value : 'unknown';
}
function safeRevision(value) {
    return typeof value === 'string' && SAFE_REVISION.test(value) ? value : 'unknown';
}
function safePath(value) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 512)
        return null;
    return /[\u0000-\u001f\u007f]/.test(value) ? null : value;
}
function displayTimestamp(value) {
    return value !== null && !Number.isNaN(Date.parse(value)) ? value : 'unknown';
}
function newer(candidate, current) {
    if (!current)
        return true;
    const candidateTime = Date.parse(candidate.record.timestamp);
    const currentTime = Date.parse(current.record.timestamp);
    if (candidateTime !== currentTime)
        return candidateTime > currentTime;
    if (candidate.index !== current.index)
        return candidate.index > current.index;
    return candidate.record.id > current.record.id;
}
function dedupeById(records, type) {
    const byId = new Map();
    records.forEach((record, index) => {
        if (record.type !== type)
            return;
        const item = { record: record, index };
        const current = byId.get(record.id);
        if (newer(item, current))
            byId.set(record.id, item);
    });
    return [...byId.values()];
}
function uniqueDispatches(records) {
    const byInvocation = new Map();
    records.forEach((record, index) => {
        if (record.type !== 'dispatch')
            return;
        const key = `${record.parentSessionId}\u0000${record.callId}`;
        const item = { record, index };
        if (newer(item, byInvocation.get(key)))
            byInvocation.set(key, item);
    });
    return [...byInvocation.values()].map(item => item.record);
}
function latestSessions(records) {
    const uniqueSnapshots = dedupeById(records, 'session');
    const bySession = new Map();
    for (const item of uniqueSnapshots) {
        if (newer(item, bySession.get(item.record.sessionId))) {
            bySession.set(item.record.sessionId, item);
        }
    }
    return [...bySession.values()].map(item => item.record);
}
function declarationCounts(dispatches) {
    const groups = new Map();
    for (const dispatch of dispatches) {
        const { taskId, kind, comparisonGroup } = dispatch.declared;
        const key = `${taskId}\u0000${kind}\u0000${comparisonGroup}`;
        const existing = groups.get(key);
        if (existing)
            existing.count += 1;
        else
            groups.set(key, { taskId, kind, comparisonGroup, count: 1 });
    }
    return [...groups.values()].sort((a, b) => {
        if (a.taskId !== b.taskId)
            return a.taskId < b.taskId ? -1 : 1;
        if (a.kind !== b.kind)
            return a.kind < b.kind ? -1 : 1;
        if (a.comparisonGroup !== b.comparisonGroup) {
            return a.comparisonGroup < b.comparisonGroup ? -1 : 1;
        }
        return 0;
    });
}
function comparisonViews(records, dispatches) {
    const markers = dedupeById(records, 'comparison');
    const latestMarker = new Map();
    for (const item of markers) {
        const key = `${item.record.comparisonGroup}\u0000${item.record.taskId}`;
        if (newer(item, latestMarker.get(key)))
            latestMarker.set(key, item);
    }
    const groups = new Map();
    for (const dispatch of dispatches) {
        const group = dispatch.declared.comparisonGroup;
        if (group === 'unknown')
            continue;
        const key = `${group}\u0000${dispatch.declared.taskId}`;
        const existing = groups.get(key);
        if (existing)
            existing.declaredDispatches += 1;
        else {
            groups.set(key, {
                group,
                taskId: dispatch.declared.taskId,
                declaredDispatches: 1,
                startRevision: 'unknown',
                endRevision: 'unknown',
            });
        }
    }
    for (const [key, item] of latestMarker) {
        const existing = groups.get(key);
        const view = existing ?? {
            group: item.record.comparisonGroup,
            taskId: item.record.taskId,
            declaredDispatches: 0,
            startRevision: 'unknown',
            endRevision: 'unknown',
        };
        view.startRevision = safeRevision(item.record.startRevision);
        view.endRevision = safeRevision(item.record.endRevision);
        groups.set(key, view);
    }
    return [...groups.values()].sort((a, b) => {
        if (a.group !== b.group)
            return a.group < b.group ? -1 : 1;
        if (a.taskId !== b.taskId)
            return a.taskId < b.taskId ? -1 : 1;
        return 0;
    });
}
function taskInvocations(dispatches) {
    const counts = new Map();
    for (const dispatch of dispatches) {
        counts.set(dispatch.declared.taskId, (counts.get(dispatch.declared.taskId) ?? 0) + 1);
    }
    return counts;
}
function readRegistry(projectPath, registryPath) {
    let content;
    try {
        content = readFileSync(join(projectPath, registryPath), 'utf8');
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return { status: 'missing', tasks: new Map() };
        }
        return { status: 'unreadable', tasks: new Map() };
    }
    let parsed;
    try {
        parsed = JSON.parse(content);
    }
    catch {
        return { status: 'malformed', tasks: new Map() };
    }
    if (!isRecord(parsed) || !Array.isArray(parsed.tasks)) {
        return { status: 'malformed', tasks: new Map() };
    }
    const tasks = new Map();
    for (const task of parsed.tasks) {
        if (!isRecord(task) || typeof task.id !== 'string' || task.id.length === 0)
            continue;
        if (tasks.has(task.id))
            continue;
        tasks.set(task.id, {
            spec: safePath(task.spec),
            plan: safePath(task.plan),
        });
    }
    return { status: 'ok', tasks };
}
function readHealth(projectPath, healthPath) {
    let content;
    try {
        content = readFileSync(join(projectPath, healthPath), 'utf8');
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return emptyHealth('missing');
        }
        return emptyHealth('unreadable');
    }
    const aborts = new Map();
    const quiet = new Map();
    const abortOk = new Set();
    const abortFailed = new Set();
    let skipped = 0;
    for (const line of content.split(/\r?\n/)) {
        if (line.trim().length === 0)
            continue;
        let parsed;
        try {
            parsed = JSON.parse(line);
        }
        catch {
            skipped += 1;
            continue;
        }
        if (!isRecord(parsed) || typeof parsed.event !== 'string') {
            skipped += 1;
            continue;
        }
        if (parsed.event !== 'watchdog-abort' &&
            parsed.event !== 'watchdog-abort-ok' &&
            parsed.event !== 'watchdog-abort-failed' &&
            parsed.event !== 'watchdog-quiet') {
            continue;
        }
        if (typeof parsed.sessionId !== 'string' || parsed.sessionId.length === 0) {
            skipped += 1;
            continue;
        }
        const sessionId = parsed.sessionId;
        const timestamp = displayTimestamp(typeof parsed.timestamp === 'string' ? parsed.timestamp : null);
        if (parsed.event === 'watchdog-abort') {
            const reason = typeof parsed.reason === 'string' && SAFE_REASON.test(parsed.reason)
                ? parsed.reason
                : 'unknown';
            aborts.set(`${sessionId}\u0000${timestamp}\u0000${reason}`, { sessionId, reason });
        }
        else if (parsed.event === 'watchdog-abort-ok') {
            abortOk.add(`${sessionId}\u0000${timestamp}`);
        }
        else if (parsed.event === 'watchdog-abort-failed') {
            abortFailed.add(`${sessionId}\u0000${timestamp}`);
        }
        else {
            const silentMs = typeof parsed.silentMs === 'number' ? parsed.silentMs : 'unknown';
            quiet.set(`${sessionId}\u0000${timestamp}\u0000${String(silentMs)}`, sessionId);
        }
    }
    const sessions = new Map();
    const ensureSession = (sessionId) => {
        const existing = sessions.get(sessionId);
        if (existing)
            return existing;
        const created = { aborts: 0, quiet: 0, reasons: new Set() };
        sessions.set(sessionId, created);
        return created;
    };
    for (const abort of aborts.values()) {
        const session = ensureSession(abort.sessionId);
        session.aborts += 1;
        session.reasons.add(abort.reason);
    }
    for (const sessionId of quiet.values()) {
        ensureSession(sessionId).quiet += 1;
    }
    return {
        status: 'ok',
        skipped,
        aborts: aborts.size,
        quiet: quiet.size,
        abortOk: abortOk.size,
        abortFailed: abortFailed.size,
        sessions,
    };
}
function emptyHealth(status) {
    return {
        status,
        skipped: 0,
        aborts: 0,
        quiet: 0,
        abortOk: 0,
        abortFailed: 0,
        sessions: new Map(),
    };
}
function durationMs(session) {
    if (session.startedAt === null || session.endedAt === null)
        return 'unknown';
    const started = Date.parse(session.startedAt);
    const ended = Date.parse(session.endedAt);
    if (Number.isNaN(started) || Number.isNaN(ended) || ended < started)
        return 'unknown';
    return String(ended - started);
}
function tokenLine(session) {
    if (session.tokens === null)
        return 'tokens=unknown';
    return [
        `tokens.input=${session.tokens.input}`,
        `tokens.output=${session.tokens.output}`,
        `tokens.reasoning=${session.tokens.reasoning}`,
        `tokens.cacheRead=${session.tokens.cacheRead}`,
        `tokens.cacheWrite=${session.tokens.cacheWrite}`,
    ].join(' ');
}
function printLedgerSummary(projectPath, config, records, skipped, ledgerExists) {
    console.log(`collection=${config.diagnostics.enabled ? 'enabled' : 'disabled'}`);
    const ledgerPath = join(projectPath, LEDGER_RELATIVE_PATH);
    if (!ledgerExists) {
        console.log(`ledger=${ledgerPath} no ledger data`);
        if (config.diagnostics.enabled) {
            console.log('observationGap=collection enabled but no ledger is available; cannot tell whether writes failed or no child ran');
        }
    }
    else {
        console.log(`ledger=${ledgerPath}`);
        console.log(`ledgerRecords=${records.length} skipped=${skipped}`);
    }
    const dispatches = uniqueDispatches(records);
    const declarations = declarationCounts(dispatches);
    const fixCount = dispatches.filter(d => d.declared.kind === 'fix').length;
    const reviewCount = dispatches.filter(d => d.declared.kind === 'review').length;
    console.log('=== Declared dispatch invocations ===');
    console.log('Note: declared labels are self-reported invocations; they do not prove success, completion, or separate logical review rounds.');
    console.log(`declaredInvocations=${dispatches.length} fix=${fixCount} review=${reviewCount}`);
    if (declarations.length === 0)
        console.log('- none');
    for (const declaration of declarations) {
        console.log(`- task=${safeIdentifier(declaration.taskId)} kind=${declaration.kind} cmp=${safeIdentifier(declaration.comparisonGroup)} invocations=${declaration.count}`);
    }
    const sessions = latestSessions(records);
    console.log('=== Observed child sessions ===');
    console.log('Note: token usage is observed per session and is never attributed to a task or comparison group.');
    console.log(`observedSessions=${sessions.length}`);
    if (sessions.length === 0)
        console.log('- none');
    for (const session of [...sessions].sort((a, b) => {
        if (a.startedAt !== b.startedAt) {
            if (a.startedAt === null)
                return 1;
            if (b.startedAt === null)
                return -1;
            return a.startedAt < b.startedAt ? -1 : 1;
        }
        return a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0;
    })) {
        console.log([
            `- session=${safeIdentifier(session.sessionId)}`,
            `agent=${safeIdentifier(session.agent)}`,
            `status=${session.status}`,
            `startedAt=${displayTimestamp(session.startedAt)}`,
            `endedAt=${displayTimestamp(session.endedAt)}`,
            `durationMs=${durationMs(session)}`,
            `retries=${session.retries}`,
            `partial=${session.partial}`,
            `tokenSource=${session.tokenSource}`,
            tokenLine(session),
        ].join(' '));
    }
    const comparisons = comparisonViews(records, dispatches);
    console.log('=== Comparison groups (declared context only) ===');
    console.log('Note: groups and revisions are declared context only; there is no verified dispatch-to-session link, so task/group token totals are unknown and no cost, quality or equivalence claim is made.');
    if (comparisons.length === 0)
        console.log('- none');
    for (const comparison of comparisons) {
        console.log([
            `- group=${safeIdentifier(comparison.group)}`,
            `task=${safeIdentifier(comparison.taskId)}`,
            `startRevision=${comparison.startRevision}`,
            `endRevision=${comparison.endRevision}`,
            `declaredDispatches=${comparison.declaredDispatches}`,
            'observedSessionTokens=unknown',
        ].join(' '));
    }
    const healthPath = typeof config.health.logPath === 'string' && config.health.logPath.length > 0
        ? config.health.logPath
        : DEFAULT_HEALTH.logPath;
    const resolvedHealthPath = join(projectPath, healthPath);
    const health = readHealth(projectPath, healthPath);
    console.log('=== Watchdog incidents ===');
    console.log(`healthLog=${resolvedHealthPath}`);
    if (health.status !== 'ok') {
        console.log(`abortIncidents=unknown quietWarnings=unknown (${health.status === 'missing' ? 'no health log file' : 'health log unreadable'}; incident counts unknown, not zero)`);
    }
    else {
        console.log(`abortIncidents=${health.aborts}`);
        console.log(`abortOutcomes ok=${health.abortOk} failed=${health.abortFailed}`);
        console.log(`quietWarnings=${health.quiet}`);
        console.log(`healthLogSkipped=${health.skipped}${health.skipped > 0 ? ' (incident counts may be incomplete)' : ''}`);
        const observed = new Set(sessions.map(session => session.sessionId));
        const healthSessions = [...health.sessions.entries()].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
        if (healthSessions.length === 0)
            console.log('- none');
        for (const [sessionId, session] of healthSessions) {
            const reasons = session.reasons.size === 0 ? 'none' : [...session.reasons].sort().join(',');
            const prefix = observed.has(sessionId)
                ? `- session=${safeIdentifier(sessionId)}`
                : `- unmatchedIncidentSession=${safeIdentifier(sessionId)}`;
            console.log(`${prefix} abortIncidents=${session.aborts} quietWarnings=${session.quiet} reasons=${reasons}`);
        }
    }
    const registryPath = typeof config.paths.taskRegistry === 'string' && config.paths.taskRegistry.length > 0
        ? config.paths.taskRegistry
        : DEFAULT_PATHS.taskRegistry;
    const resolvedRegistryPath = join(projectPath, registryPath);
    const registry = readRegistry(projectPath, registryPath);
    const invocations = taskInvocations(dispatches);
    console.log('=== Declared task references (current reference paths, not historical versions) ===');
    console.log('Note: registry paths are current references only; stats does not open them, does not scan source, and does not verify an immutable revision.');
    if (registry.status !== 'ok') {
        console.log(`registry=${resolvedRegistryPath} unavailable: ${registry.status === 'missing' ? 'no registry file' : 'unreadable or malformed registry'}`);
    }
    else {
        console.log(`registry=${resolvedRegistryPath}`);
    }
    const taskIds = [...invocations.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    if (taskIds.length === 0)
        console.log('- none');
    for (const taskId of taskIds) {
        const reference = taskId === 'unknown' ? undefined : registry.tasks.get(taskId);
        const spec = reference?.spec ?? 'unknown';
        const plan = reference?.plan ?? 'unknown';
        let reason = '';
        if (taskId === 'unknown')
            reason = ' (declared task unknown)';
        else if (registry.status !== 'ok')
            reason = ' (registry unavailable)';
        else if (!reference)
            reason = ' (no matching registry task)';
        console.log(`- task=${safeIdentifier(taskId)} invocations=${invocations.get(taskId) ?? 0} spec=${spec} plan=${plan}${reason}`);
    }
}
/**
 * Prints a deterministic, read-only local summary of previously collected
 * diagnostics. It reads the existing ledger regardless of the current
 * collection setting, plus the configured health log and task-registry
 * metadata, and never writes, creates directories, calls a model/network, or
 * opens referenced spec/plan/code contents.
 */
export async function stats(projectPath = '.') {
    const configPath = existsSync(join(projectPath, '.agentic', 'kiki', 'config.json'))
        ? join(projectPath, '.agentic', 'kiki', 'config.json')
        : join(projectPath, '.agentic', 'config.json');
    console.log('Kiki usage diagnostics summary');
    console.log(`project=${projectPath}`);
    if (existsSync(configPath)) {
        try {
            const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
            if (!isRecord(parsed))
                throw new Error('invalid config');
        }
        catch {
            console.log('config=unavailable (malformed or unreadable project config)');
            return 1;
        }
    }
    const config = loadConfig(projectPath);
    const ledger = readLedger(projectPath);
    if (ledger.readError !== null) {
        console.log('ledger=unavailable (read error)');
        return 1;
    }
    printLedgerSummary(projectPath, config, ledger.records, ledger.skipped, existsSync(join(projectPath, LEDGER_RELATIVE_PATH)));
    return 0;
}
//# sourceMappingURL=stats.js.map