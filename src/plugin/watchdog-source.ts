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

  function recordPart(state, part) {
    state.lastActivityAt = now();
    if (part.type === 'text' || part.type === 'reasoning') {
      var h = hashText(part.text || '');
      if (state.lastPartId !== part.id) {
        pushRing(state.partHashes, h, 8);
        state.lastPartId = part.id;
      } else if (state.partHashes.length > 0) {
        state.partHashes[state.partHashes.length - 1] = h;
      }
    } else if (part.type === 'tool') {
      var sig = toolSignature(part);
      if (state.lastToolPartId !== part.id) {
        pushRing(state.toolSignatures, sig, 8);
        state.lastToolPartId = part.id;
      } else if (state.toolSignatures.length > 0) {
        state.toolSignatures[state.toolSignatures.length - 1] = sig;
      }
    }
  }

  function recordMessage(state, info) {
    var t = info.tokens;
    if (!t) return;
    var prev = state.lastTokens;
    var next = {
      input: t.input || 0,
      output: t.output || 0,
      reasoning: t.reasoning || 0,
      cacheRead: t.cache && t.cache.read ? t.cache.read : 0,
      cacheWrite: t.cache && t.cache.write ? t.cache.write : 0
    };
    state.lastTokens = next;
    if (!prev) {
      state.lastActivityAt = now();
      return;
    }
    if (
      next.input > prev.input ||
      next.output > prev.output ||
      next.reasoning > prev.reasoning ||
      next.cacheRead > prev.cacheRead ||
      next.cacheWrite > prev.cacheWrite
    ) {
      state.lastActivityAt = now();
    }
  }

  function normalize(text) {
    return String(text == null ? '' : text).trim().toLowerCase().replace(/\\s+/g, ' ');
  }

  function hashText(text) {
    var h = 0x811c9dc5;
    var s = normalize(text);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return h.toString(36);
  }

  function toolSignature(part) {
    try {
      return String(part.tool) + ':' + JSON.stringify((part.state && part.state.input) || {});
    } catch (e) {
      return String(part.tool) + ':?';
    }
  }

  function pushRing(arr, value, max) {
    arr.push(value);
    while (arr.length > max) arr.shift();
  }

  function tailAllSame(arr, n) {
    if (n <= 0 || arr.length < n) return false;
    var first = arr[arr.length - 1];
    for (var i = arr.length - n; i < arr.length; i++) {
      if (arr[i] !== first) return false;
    }
    return true;
  }

  function shouldWatch(state) {
    if (cfg.watchAllSubagents) return true;
    if (state.agentName == null) return true;
    return String(state.agentName).indexOf('kiki-') === 0;
  }

  function evaluate(state) {
    if (!shouldWatch(state)) return null;
    if (state.status !== 'busy') return null;
    var t = now();
    var age = t - state.startedAt;
    // Loops bypass the grace gate: a loop is real output, not a startup artifact.
    if (tailAllSame(state.partHashes, cfg.loopRepeatCount)) return 'content-loop';
    if (tailAllSame(state.toolSignatures, cfg.loopRepeatCount)) return 'tool-loop';
    if (age < cfg.gracePeriodMs) return null;
    if (age >= cfg.absoluteMaxMs) return 'absolute-timeout';
    var silentMs = t - state.lastActivityAt;
    if (silentMs >= cfg.stuckThresholdMs) return 'stuck';
    if (!state.warned50 && silentMs >= cfg.stuckThresholdMs / 2) {
      state.warned50 = true;
      writeHealth('debug', {
        event: 'watchdog-quiet',
        sessionId: state.sessionId,
        agent: state.agentName,
        silentMs: silentMs
      });
    }
    return null;
  }

  function abortSession(state, reason) {
    // Delete first: prevents double-abort across ticks while the abort promise is still in flight.
    sessions.delete(state.sessionId);
    writeHealth('warn', {
      event: 'watchdog-abort',
      sessionId: state.sessionId,
      agent: state.agentName,
      reason: reason,
      elapsedMs: now() - state.startedAt
    });
    try {
      var p = client.session.abort({ path: { id: state.sessionId } });
      if (p && typeof p.then === 'function') {
        p.then(function () {
          writeHealth('info', { event: 'watchdog-abort-ok', sessionId: state.sessionId });
        }, function (err) {
          writeHealth('error', {
            event: 'watchdog-abort-failed',
            sessionId: state.sessionId,
            message: String((err && err.message) || err)
          });
        });
      }
    } catch (e) {
      writeHealth('error', {
        event: 'watchdog-abort-failed',
        sessionId: state.sessionId,
        message: String((e && e.message) || e)
      });
    }
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
      case 'message.part.updated':
        if (props.part && props.part.sessionID) {
          var sp = sessions.get(props.part.sessionID);
          if (sp) recordPart(sp, props.part);
        }
        break;
      case 'message.updated':
        if (props.info && props.info.sessionID && props.info.role === 'assistant') {
          var sm = sessions.get(props.info.sessionID);
          if (sm) recordMessage(sm, props.info);
        }
        break;
      case 'session.status':
        var ss = sessions.get(props.sessionID);
        if (ss && props.status && props.status.type) {
          ss.status = props.status.type;
          ss.lastActivityAt = now();
        }
        break;
    }
  }

  function checkNow() {
    if (!cfg.watchdogEnabled) return;
    var toAbort = [];
    sessions.forEach(function (state) {
      var verdict = evaluate(state);
      if (verdict) toAbort.push([state, verdict]);
    });
    for (var i = 0; i < toAbort.length; i++) {
      abortSession(toAbort[i][0], toAbort[i][1]);
    }
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
