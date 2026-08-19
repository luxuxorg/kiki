import type { KikiHealthConfig } from '../cli/config.js';

/**
 * Plain-JS source of the subagent watchdog, inlined verbatim into the
 * generated .opencode/plugins/kiki.ts. Must stay free of backticks and
 * ${ sequences. The outer scope provides: appendFileSync, existsSync,
 * mkdirSync, dirname, join (imported by the plugin template from fs/path).
 */
export const WATCHDOG_SOURCE = `
function createWatchdog(deps) {
  var cfg = deps.config;
  var client = deps.client;
  var directory = deps.directory;
  var now = deps.now;
  var sessions = new Map();
  var interval = null;

  function writeHealth(level, entry) {
    try {
      var logPath = join(directory, cfg.logPath);
      var dir = dirname(logPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      appendFileSync(
        logPath,
        JSON.stringify(Object.assign({ level: level, timestamp: new Date(now()).toISOString() }, entry)) + '\\n'
      );
    } catch (err) {
      try {
        client.app.log({ body: { service: 'kiki-watchdog', level: level, message: entry.event || 'health', extra: entry } });
      } catch (e) { /* give up silently */ }
    }
  }

  function register(info) {
    if (!info || !info.id || !info.parentID) return;
    if (sessions.has(info.id)) return;
    var state = {
      sessionId: info.id,
      parentId: info.parentID,
      agentName: typeof info.title === 'string' ? info.title : null,
      status: 'busy',
      startedAt: now(),
      lastActivityAt: now(),
      lastTokens: null,
      partHashes: [],
      toolSignatures: [],
      lastPartId: null,
      lastToolPartId: null,
      warned50: false
    };
    sessions.set(info.id, state);
  }

  function handleEvent(event) {
    if (!event || !event.type || !event.properties) return;
    var props = event.properties;
    switch (event.type) {
      case 'session.created':
        register(props.info);
        break;
      case 'session.updated':
        if (props.info && props.info.parentID) register(props.info);
        break;
      case 'session.idle':
        sessions.delete(props.sessionID);
        break;
      case 'session.deleted':
        if (props.info) sessions.delete(props.info.id);
        break;
      case 'session.error':
        if (props.sessionID) sessions.delete(props.sessionID);
        break;
    }
  }

  function checkNow() {
    // populated in later tasks
  }

  function start() {
    if (!cfg.watchdogEnabled) return;
    if (interval) return;
    interval = setInterval(checkNow, cfg.checkIntervalMs);
    if (interval && typeof interval.unref === 'function') interval.unref();
  }

  function stop() {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  }

  return {
    handleEvent: handleEvent,
    checkNow: checkNow,
    start: start,
    stop: stop,
    _sessions: sessions
  };
}
`;

export interface WatchdogDeps {
  client: {
    session: {
      abort(input: { path: { id: string } }): Promise<boolean>;
      messages(input: { path: { id: string } }): Promise<Array<{ info: { role: string; agent?: string } }>>;
      list(): Promise<Array<{ id: string; parentID?: string; title?: string }>>;
    };
    app: { log(input: { body: { service: string; level: string; message: string; extra?: unknown } }): Promise<boolean> };
  };
  directory: string;
  config: KikiHealthConfig;
  now(): number;
}
