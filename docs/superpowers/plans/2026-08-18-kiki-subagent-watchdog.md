# Kiki Subagent Watchdog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-healing subagent watchdog to the Kiki OpenCode plugin that detects hung/looping subagent sessions and aborts them automatically, per `docs/superpowers/specs/2026-08-18-kiki-subagent-watchdog-design.md`.

**Architecture:** The watchdog logic ships as a plain-JavaScript source string (`WATCHDOG_SOURCE`) that is inlined into the generated `.opencode/plugins/kiki.ts` plugin. The plugin subscribes to OpenCode bus events, tracks child (subagent) sessions in an in-memory map, evaluates them on a `setInterval` tick, and calls `client.session.abort()` when a session is stuck, looping, or past its absolute timeout. Health config lives in `.agentic/kiki/config.json` and is read by the plugin at runtime (falling back to baked-in defaults). The watchdog source string is unit-tested in kiki's vitest suite by evaluating it with `new Function` and injecting mocks.

**Tech Stack:** TypeScript (kiki CLI), vitest, plain JavaScript (embedded plugin source), OpenCode plugin SDK (`client.session.*`, `client.app.log`).

**Key constraints:**

- The generated plugin must be fully self-contained (it is also installed globally to `~/.config/opencode/plugins/kiki.ts` where no kiki modules resolve). Therefore ALL watchdog code must live inside `WATCHDOG_SOURCE` and may only use the `fs`/`path` functions the plugin template imports (`appendFileSync`, `existsSync`, `mkdirSync`, `dirname`, `join`).
- `WATCHDOG_SOURCE` is authored inside a TypeScript template literal. Its content MUST NOT contain backticks (`` ` ``) or `${` sequences, or it would break the outer literal. Use single-quoted strings and `+` concatenation only. Write ES5-style JS (`var`, `function`) so it evaluates identically via `new Function` in tests and inside OpenCode/Bun.
- No changes are needed to `update.ts`, `install.ts`, `doctor.ts`, or the orchestrator agent template — the plugin regeneration path picks up the new template automatically.

---

### Task 1: Health config plumbing

Add the `health` section to `KikiConfig`, defaults, `loadConfig` merge, and the init wizard's config object.

**Files:**
- Modify: `src/cli/config.ts:25-36` (`KikiConfig` interface), `src/cli/config.ts:58-69` (`DEFAULT_CONFIG`), `src/cli/config.ts:114-131` (`loadConfig`)
- Modify: `src/cli/commands/init.ts:119-146` (wizard-built config object)
- Test: `tests/cli/config-health.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/cli/config-health.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, DEFAULT_HEALTH } from '../../src/cli/config';

describe('loadConfig health section', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = `tmp/config-health-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await fs.mkdir(path.join(tmpDir, '.agentic', 'kiki'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns default health config when config file is missing', () => {
    expect(loadConfig(tmpDir).health).toEqual(DEFAULT_HEALTH);
  });

  it('returns default health config when config file has no health section', async () => {
    const configPath = path.join(tmpDir, '.agentic', 'kiki', 'config.json');
    await fs.writeFile(configPath, JSON.stringify({
      projectName: 'x',
      language: 'typescript',
      commands: { build: 'b', test: 't', lint: 'l', security: 's' },
    }));
    expect(loadConfig(tmpDir).health).toEqual(DEFAULT_HEALTH);
  });

  it('merges partial health overrides with defaults', async () => {
    const configPath = path.join(tmpDir, '.agentic', 'kiki', 'config.json');
    await fs.writeFile(configPath, JSON.stringify({
      health: { stuckThresholdMs: 60000, watchAllSubagents: true },
    }));
    const cfg = loadConfig(tmpDir);
    expect(cfg.health.stuckThresholdMs).toBe(60000);
    expect(cfg.health.watchAllSubagents).toBe(true);
    expect(cfg.health.absoluteMaxMs).toBe(DEFAULT_HEALTH.absoluteMaxMs);
    expect(cfg.health.loopRepeatCount).toBe(DEFAULT_HEALTH.loopRepeatCount);
  });

  it('exposes expected default values', () => {
    expect(DEFAULT_HEALTH).toEqual({
      watchdogEnabled: true,
      stuckThresholdMs: 300000,
      gracePeriodMs: 120000,
      absoluteMaxMs: 3600000,
      checkIntervalMs: 30000,
      loopRepeatCount: 3,
      watchAllSubagents: false,
      logPath: '.agentic/kiki/health_log.jsonl',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli/config-health.test.ts`
Expected: FAIL — `DEFAULT_HEALTH` is not exported from `src/cli/config.ts`.

- [ ] **Step 3: Add health config types, defaults, and loadConfig merge**

In `src/cli/config.ts`, after the `KikiModels` interface (line 23), add:

```typescript
export interface KikiHealthConfig {
  watchdogEnabled: boolean;
  stuckThresholdMs: number;
  gracePeriodMs: number;
  absoluteMaxMs: number;
  checkIntervalMs: number;
  loopRepeatCount: number;
  watchAllSubagents: boolean;
  logPath: string;
}
```

Change the `KikiConfig` interface (lines 25-36) to include health:

```typescript
export interface KikiConfig {
  projectName: string;
  language: string;
  commands: {
    build: string;
    test: string;
    lint: string;
    security: string;
  };
  paths: KikiPaths;
  models: KikiModels;
  health: KikiHealthConfig;
}
```

After `DEFAULT_MODELS` (line 56), add:

```typescript
export const DEFAULT_HEALTH: KikiHealthConfig = {
  watchdogEnabled: true,
  stuckThresholdMs: 300_000,
  gracePeriodMs: 120_000,
  absoluteMaxMs: 3_600_000,
  checkIntervalMs: 30_000,
  loopRepeatCount: 3,
  watchAllSubagents: false,
  logPath: '.agentic/kiki/health_log.jsonl',
};
```

In `DEFAULT_CONFIG` (lines 58-69), add `health: DEFAULT_HEALTH,` after `models: DEFAULT_MODELS,`.

In `loadConfig` (lines 114-131), change the returned object to also merge health:

```typescript
    return {
      ...DEFAULT_CONFIG,
      ...rest,
      paths: { ...DEFAULT_PATHS, ...(rest.paths ?? {}) },
      models: { ...DEFAULT_MODELS, ...(rest.models ?? {}) },
      health: { ...DEFAULT_HEALTH, ...(rest.health ?? {}) },
    };
```

In `src/cli/commands/init.ts`, add `health: { ...DEFAULT_HEALTH },` to the wizard-built config object (after `models: { ... }`, around line 145), and update the import from `../config.js` to include `DEFAULT_HEALTH`. The import currently reads `import { ... DEFAULT_MODELS ... } from '../config.js'` — add `DEFAULT_HEALTH` to that import list.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cli/config-health.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full suite to catch config-shape breakage**

Run: `npm test`
Expected: PASS. If any existing test constructs a `KikiConfig` literally and now fails typecheck/runtime, add `health: { ...DEFAULT_HEALTH }` to that construction.

- [ ] **Step 6: Commit**

```bash
git add src/cli/config.ts src/cli/commands/init.ts tests/cli/config-health.test.ts
git commit -m "feat: add health config section for subagent watchdog"
```

---

### Task 2: Watchdog source skeleton — factory, session registration, lifecycle

Create the `WATCHDOG_SOURCE` module with the `createWatchdog` factory, session registration on `session.created`/`session.updated`, and removal on `session.idle`/`session.deleted`/`session.error`.

**Files:**
- Create: `src/plugin/watchdog-source.ts`
- Test: `tests/plugin/watchdog.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/plugin/watchdog.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WATCHDOG_SOURCE } from '../../src/plugin/watchdog-source';

interface Fakes {
  appendFileSync: ReturnType<typeof vi.fn>;
  existsSync: ReturnType<typeof vi.fn>;
  mkdirSync: ReturnType<typeof vi.fn>;
}

function buildWatchdog(depsOverrides: Record<string, unknown> = {}, configOverrides: Record<string, unknown> = {}) {
  const fakes: Fakes = {
    appendFileSync: vi.fn(),
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
  };
  const join = (...parts: string[]) => parts.join('/');
  const dirname = (p: string) => p.split('/').slice(0, -1).join('/');

  const factory = new Function(
    'appendFileSync', 'existsSync', 'mkdirSync', 'dirname', 'join',
    WATCHDOG_SOURCE + '\nreturn createWatchdog;'
  );
  const createWatchdog = factory(fakes.appendFileSync, fakes.existsSync, fakes.mkdirSync, dirname, join);

  let currentTime = 1_000_000;
  const client = {
    session: {
      abort: vi.fn(() => Promise.resolve(true)),
      messages: vi.fn(() => Promise.resolve([])),
      list: vi.fn(() => Promise.resolve([])),
    },
    app: { log: vi.fn(() => Promise.resolve(true)) },
  };
  const config = {
    watchdogEnabled: true,
    stuckThresholdMs: 5000,
    gracePeriodMs: 1000,
    absoluteMaxMs: 60000,
    checkIntervalMs: 100,
    loopRepeatCount: 3,
    watchAllSubagents: false,
    logPath: '.agentic/kiki/health_log.jsonl',
    ...configOverrides,
  };
  const watchdog = createWatchdog({
    client,
    directory: '/proj',
    config,
    now: () => currentTime,
    ...depsOverrides,
  });
  return { watchdog, client, fakes, setTime: (t: number) => { currentTime = t; }, getTime: () => currentTime };
}

async function flushPromises() {
  await new Promise((r) => setTimeout(r, 0));
}

describe('watchdog session lifecycle', () => {
  it('registers a child session on session.created with parentID', () => {
    const { watchdog } = buildWatchdog();
    watchdog.handleEvent({
      type: 'session.created',
      properties: { info: { id: 'child-1', parentID: 'parent-1', title: 'kiki-planner' } },
    });
    expect(watchdog._sessions.has('child-1')).toBe(true);
  });

  it('ignores sessions without a parentID', () => {
    const { watchdog } = buildWatchdog();
    watchdog.handleEvent({
      type: 'session.created',
      properties: { info: { id: 'root-1', title: 'main' } },
    });
    expect(watchdog._sessions.has('root-1')).toBe(false);
  });

  it('registers a child session discovered via session.updated', () => {
    const { watchdog } = buildWatchdog();
    watchdog.handleEvent({
      type: 'session.updated',
      properties: { info: { id: 'child-2', parentID: 'parent-1', title: 'x' } },
    });
    expect(watchdog._sessions.has('child-2')).toBe(true);
  });

  it('removes the session on session.idle, session.deleted, and session.error', () => {
    const { watchdog } = buildWatchdog();
    for (const id of ['c1', 'c2', 'c3']) {
      watchdog.handleEvent({ type: 'session.created', properties: { info: { id, parentID: 'p', title: 't' } } });
    }
    watchdog.handleEvent({ type: 'session.idle', properties: { sessionID: 'c1' } });
    watchdog.handleEvent({ type: 'session.deleted', properties: { info: { id: 'c2' } } });
    watchdog.handleEvent({ type: 'session.error', properties: { sessionID: 'c3' } });
    expect(watchdog._sessions.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/plugin/watchdog.test.ts`
Expected: FAIL — `../../src/plugin/watchdog-source` does not exist.

- [ ] **Step 3: Create the watchdog source skeleton**

Create `src/plugin/watchdog-source.ts`. REMEMBER: the string content must contain NO backticks and NO `${` sequences.

```typescript
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
```

Note the `\\n` inside `writeHealth`: in the TS template literal, `\\n` produces a literal backslash-n in the source string, which the evaluated JS then reads as the newline escape `'\n'`. This is intentional.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/plugin/watchdog.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/plugin/watchdog-source.ts tests/plugin/watchdog.test.ts
git commit -m "feat: watchdog source skeleton with session lifecycle tracking"
```

---

### Task 3: Activity signals — parts, tokens, status

Extend `handleEvent` to record activity from `message.part.updated`, `message.updated` (token growth), and `session.status`.

**Files:**
- Modify: `src/plugin/watchdog-source.ts`
- Test: `tests/plugin/watchdog.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/plugin/watchdog.test.ts`:

```typescript
describe('watchdog activity signals', () => {
  function createChild(watchdog: ReturnType<typeof buildWatchdog>['watchdog'], id = 'child-1') {
    watchdog.handleEvent({ type: 'session.created', properties: { info: { id, parentID: 'p', title: 'kiki-planner' } } });
    return watchdog._sessions.get(id);
  }

  it('message.part.updated updates lastActivityAt', () => {
    const { watchdog, setTime } = buildWatchdog();
    const state = createChild(watchdog);
    setTime(1_000_000 + 4000);
    watchdog.handleEvent({
      type: 'message.part.updated',
      properties: { part: { id: 'p1', sessionID: 'child-1', messageID: 'm1', type: 'text', text: 'hello' } },
    });
    expect(state.lastActivityAt).toBe(1_000_000 + 4000);
  });

  it('message.updated with token growth updates lastActivityAt', () => {
    const { watchdog, setTime } = buildWatchdog();
    const state = createChild(watchdog);
    setTime(1_000_000 + 4000);
    watchdog.handleEvent({
      type: 'message.updated',
      properties: {
        info: {
          id: 'm1', sessionID: 'child-1', role: 'assistant',
          tokens: { input: 10, output: 5, reasoning: 3, cache: { read: 0, write: 0 } },
        },
      },
    });
    expect(state.lastActivityAt).toBe(1_000_000 + 4000);
  });

  it('message.updated without token growth does NOT update lastActivityAt', () => {
    const { watchdog, setTime } = buildWatchdog();
    const state = createChild(watchdog);
    const msg = {
      id: 'm1', sessionID: 'child-1', role: 'assistant',
      tokens: { input: 10, output: 5, reasoning: 3, cache: { read: 0, write: 0 } },
    };
    watchdog.handleEvent({ type: 'message.updated', properties: { info: msg } });
    const first = state.lastActivityAt;
    setTime(1_000_000 + 9000);
    watchdog.handleEvent({ type: 'message.updated', properties: { info: msg } });
    expect(state.lastActivityAt).toBe(first);
  });

  it('reasoning token growth counts as activity (thinking is not a hang)', () => {
    const { watchdog, setTime } = buildWatchdog();
    const state = createChild(watchdog);
    watchdog.handleEvent({
      type: 'message.updated',
      properties: {
        info: { id: 'm1', sessionID: 'child-1', role: 'assistant', tokens: { input: 10, output: 0, reasoning: 1, cache: { read: 0, write: 0 } } },
      },
    });
    setTime(1_000_000 + 8000);
    watchdog.handleEvent({
      type: 'message.updated',
      properties: {
        info: { id: 'm1', sessionID: 'child-1', role: 'assistant', tokens: { input: 10, output: 0, reasoning: 50, cache: { read: 0, write: 0 } } },
      },
    });
    expect(state.lastActivityAt).toBe(1_000_000 + 8000);
  });

  it('session.status updates status and activity', () => {
    const { watchdog, setTime } = buildWatchdog();
    const state = createChild(watchdog);
    setTime(1_000_000 + 2000);
    watchdog.handleEvent({ type: 'session.status', properties: { sessionID: 'child-1', status: { type: 'retry', attempt: 1, message: 'x', next: 0 } } });
    expect(state.status).toBe('retry');
    expect(state.lastActivityAt).toBe(1_000_000 + 2000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/plugin/watchdog.test.ts`
Expected: FAIL — the 5 new tests fail because part/message/status events are not handled.

- [ ] **Step 3: Implement activity tracking in WATCHDOG_SOURCE**

In `src/plugin/watchdog-source.ts`, add these functions inside `createWatchdog`, after the `register` function:

```javascript
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
    return String(text == null ? '' : text).trim().toLowerCase().replace(/\s+/g, ' ');
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
```

And extend the `switch` in `handleEvent` with these cases (before the closing brace of the switch):

```javascript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/plugin/watchdog.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/plugin/watchdog-source.ts tests/plugin/watchdog.test.ts
git commit -m "feat: watchdog activity signals for parts, tokens, and status"
```

---

### Task 4: Stuck detection, absolute timeout, abort execution, health log

Implement `evaluate` (grace period, absolute timeout, stuck silence, 50% warning), `checkNow` iteration, and `abortSession`.

**Files:**
- Modify: `src/plugin/watchdog-source.ts`
- Test: `tests/plugin/watchdog.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/plugin/watchdog.test.ts`:

```typescript
describe('watchdog stuck detection and abort', () => {
  function createBusyChild(watchdog: ReturnType<typeof buildWatchdog>['watchdog'], id = 'child-1') {
    watchdog.handleEvent({ type: 'session.created', properties: { info: { id, parentID: 'p', title: 'kiki-planner' } } });
    watchdog.handleEvent({ type: 'session.status', properties: { sessionID: id, status: { type: 'busy' } } });
    return watchdog._sessions.get(id);
  }

  it('does not abort during the grace period', () => {
    const { watchdog, client, setTime, getTime } = buildWatchdog();
    createBusyChild(watchdog);
    setTime(getTime() + 500); // < gracePeriodMs (1000)
    watchdog.checkNow();
    expect(client.session.abort).not.toHaveBeenCalled();
  });

  it('does not abort a busy session with recent activity', () => {
    const { watchdog, client, setTime, getTime } = buildWatchdog();
    createBusyChild(watchdog);
    setTime(getTime() + 4000); // past grace, < stuckThresholdMs (5000)
    watchdog.checkNow();
    expect(client.session.abort).not.toHaveBeenCalled();
  });

  it('aborts a stuck session and logs warn + info health entries', async () => {
    const { watchdog, client, fakes, setTime, getTime } = buildWatchdog();
    createBusyChild(watchdog);
    setTime(getTime() + 6000); // > stuckThresholdMs (5000), < absoluteMaxMs (60000)
    watchdog.checkNow();
    await flushPromises();
    expect(client.session.abort).toHaveBeenCalledWith({ path: { id: 'child-1' } });
    const written = fakes.appendFileSync.mock.calls.map((c: unknown[]) => String(c[1])).join('');
    expect(written).toContain('watchdog-abort');
    expect(written).toContain('"reason":"stuck"');
    expect(written).toContain('watchdog-abort-ok');
    expect(watchdog._sessions.has('child-1')).toBe(false);
  });

  it('aborts on absolute timeout even with recent activity', () => {
    const { watchdog, client, setTime, getTime } = buildWatchdog();
    createBusyChild(watchdog);
    setTime(getTime() + 59000);
    watchdog.handleEvent({
      type: 'message.part.updated',
      properties: { part: { id: 'p1', sessionID: 'child-1', messageID: 'm1', type: 'text', text: 'still working' } },
    });
    setTime(getTime() + 2000); // age 61000 > absoluteMaxMs (60000), silence only 2000
    watchdog.checkNow();
    expect(client.session.abort).toHaveBeenCalledWith({ path: { id: 'child-1' } });
  });

  it('emits a debug warning at 50% silence before aborting', () => {
    const { watchdog, client, fakes, setTime, getTime } = buildWatchdog();
    createBusyChild(watchdog);
    setTime(getTime() + 3000); // 50% of stuckThresholdMs=5000 is 2500; 3000 >= 2500, < 5000
    watchdog.checkNow();
    expect(client.session.abort).not.toHaveBeenCalled();
    const written = fakes.appendFileSync.mock.calls.map((c: unknown[]) => String(c[1])).join('');
    expect(written).toContain('watchdog-quiet');
  });

  it('does not abort a session in retry status', () => {
    const { watchdog, client, setTime, getTime } = buildWatchdog();
    createBusyChild(watchdog);
    watchdog.handleEvent({ type: 'session.status', properties: { sessionID: 'child-1', status: { type: 'retry', attempt: 2, message: 'm', next: 0 } } });
    setTime(getTime() + 30000);
    watchdog.checkNow();
    expect(client.session.abort).not.toHaveBeenCalled();
  });

  it('is a no-op when watchdogEnabled is false', () => {
    const { watchdog, client, setTime, getTime } = buildWatchdog({}, { watchdogEnabled: false });
    createBusyChild(watchdog);
    setTime(getTime() + 30000);
    watchdog.checkNow();
    expect(client.session.abort).not.toHaveBeenCalled();
  });

  it('logs an error entry when abort fails and does not throw', async () => {
    const { watchdog, client, fakes, setTime, getTime } = buildWatchdog();
    client.session.abort.mockRejectedValueOnce(new Error('boom'));
    createBusyChild(watchdog);
    setTime(getTime() + 6000);
    watchdog.checkNow();
    await flushPromises();
    const written = fakes.appendFileSync.mock.calls.map((c: unknown[]) => String(c[1])).join('');
    expect(written).toContain('watchdog-abort-failed');
    expect(written).toContain('boom');
  });

  it('falls back to client.app.log when the health log write fails', async () => {
    const { watchdog, client, fakes, setTime, getTime } = buildWatchdog();
    fakes.appendFileSync.mockImplementation(() => { throw new Error('disk full'); });
    createBusyChild(watchdog);
    setTime(getTime() + 6000);
    watchdog.checkNow();
    await flushPromises();
    expect(client.app.log).toHaveBeenCalled();
    const logCalls = client.app.log.mock.calls.map((c: unknown[]) => (c[0] as { body: { service: string } }).body.service);
    expect(logCalls).toContain('kiki-watchdog');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/plugin/watchdog.test.ts`
Expected: FAIL — `checkNow` is an empty stub, nothing aborts.

- [ ] **Step 3: Implement evaluate, checkNow, and abortSession**

In `src/plugin/watchdog-source.ts`, add these functions inside `createWatchdog`, after `pushRing`:

```javascript
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
    if (age < cfg.gracePeriodMs) return null;
    if (age >= cfg.absoluteMaxMs) return 'absolute-timeout';
    if (tailAllSame(state.partHashes, cfg.loopRepeatCount)) return 'content-loop';
    if (tailAllSame(state.toolSignatures, cfg.loopRepeatCount)) return 'tool-loop';
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
```

Replace the empty `checkNow` stub with:

```javascript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/plugin/watchdog.test.ts`
Expected: PASS (18 tests).

- [ ] **Step 5: Commit**

```bash
git add src/plugin/watchdog-source.ts tests/plugin/watchdog.test.ts
git commit -m "feat: watchdog stuck detection, absolute timeout, and abort execution"
```

---

### Task 5: Loop detection

Tests for content-loop and tool-loop detection, including the same-part false-positive guard. (`evaluate` and `tailAllSame` already exist; this task pins the behavior and may require no source changes beyond Task 3/4 — treat any failure as a bug to fix in `recordPart`/`evaluate`.)

**Files:**
- Modify: `src/plugin/watchdog-source.ts` (only if tests reveal bugs)
- Test: `tests/plugin/watchdog.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/plugin/watchdog.test.ts`:

```typescript
describe('watchdog loop detection', () => {
  function createBusyChild(watchdog: ReturnType<typeof buildWatchdog>['watchdog'], id = 'child-1') {
    watchdog.handleEvent({ type: 'session.created', properties: { info: { id, parentID: 'p', title: 'kiki-planner' } } });
    watchdog.handleEvent({ type: 'session.status', properties: { sessionID: id, status: { type: 'busy' } } });
    return watchdog._sessions.get(id);
  }

  function sendTextParts(watchdog: ReturnType<typeof buildWatchdog>['watchdog'], texts: string[]) {
    texts.forEach((text, i) => {
      watchdog.handleEvent({
        type: 'message.part.updated',
        properties: { part: { id: 'part-' + i, sessionID: 'child-1', messageID: 'm1', type: 'text', text } },
      });
    });
  }

  function sendToolParts(watchdog: ReturnType<typeof buildWatchdog>['watchdog'], calls: Array<{ tool: string; input: unknown }>) {
    calls.forEach((c, i) => {
      watchdog.handleEvent({
        type: 'message.part.updated',
        properties: {
          part: { id: 'tool-' + i, sessionID: 'child-1', messageID: 'm1', type: 'tool', tool: c.tool, state: { status: 'running', input: c.input } },
        },
      });
    });
  }

  it('aborts on 3 consecutive identical text parts (content loop)', () => {
    const { watchdog, client } = buildWatchdog();
    createBusyChild(watchdog);
    sendTextParts(watchdog, ['same output', 'same output', 'same output']);
    watchdog.checkNow();
    expect(client.session.abort).toHaveBeenCalledWith({ path: { id: 'child-1' } });
  });

  it('normalizes whitespace and case for content loop detection', () => {
    const { watchdog, client } = buildWatchdog();
    createBusyChild(watchdog);
    sendTextParts(watchdog, ['Same   Output', 'same output', '  SAME OUTPUT ']);
    watchdog.checkNow();
    expect(client.session.abort).toHaveBeenCalled();
  });

  it('does NOT flag 3 updates to the SAME part id as a loop', () => {
    const { watchdog, client } = buildWatchdog();
    createBusyChild(watchdog);
    for (let i = 0; i < 3; i++) {
      watchdog.handleEvent({
        type: 'message.part.updated',
        properties: { part: { id: 'same-part', sessionID: 'child-1', messageID: 'm1', type: 'text', text: 'identical' } },
      });
    }
    watchdog.checkNow();
    expect(client.session.abort).not.toHaveBeenCalled();
  });

  it('does not flag varied text as a loop', () => {
    const { watchdog, client } = buildWatchdog();
    createBusyChild(watchdog);
    sendTextParts(watchdog, ['one', 'two', 'three']);
    watchdog.checkNow();
    expect(client.session.abort).not.toHaveBeenCalled();
  });

  it('aborts on 3 consecutive identical tool calls (tool loop)', () => {
    const { watchdog, client } = buildWatchdog();
    createBusyChild(watchdog);
    sendToolParts(watchdog, [
      { tool: 'read', input: { filePath: '/a' } },
      { tool: 'read', input: { filePath: '/a' } },
      { tool: 'read', input: { filePath: '/a' } },
    ]);
    watchdog.checkNow();
    expect(client.session.abort).toHaveBeenCalledWith({ path: { id: 'child-1' } });
  });

  it('does NOT flag repeated updates to the SAME tool part as a loop', () => {
    const { watchdog, client } = buildWatchdog();
    createBusyChild(watchdog);
    const statuses = ['pending', 'running', 'completed'];
    for (const status of statuses) {
      watchdog.handleEvent({
        type: 'message.part.updated',
        properties: {
          part: { id: 'one-tool', sessionID: 'child-1', messageID: 'm1', type: 'tool', tool: 'read', state: { status, input: { filePath: '/a' } } },
        },
      });
    }
    watchdog.checkNow();
    expect(client.session.abort).not.toHaveBeenCalled();
  });

  it('does not flag same tool with different inputs as a loop', () => {
    const { watchdog, client } = buildWatchdog();
    createBusyChild(watchdog);
    sendToolParts(watchdog, [
      { tool: 'read', input: { filePath: '/a' } },
      { tool: 'read', input: { filePath: '/b' } },
      { tool: 'read', input: { filePath: '/c' } },
    ]);
    watchdog.checkNow();
    expect(client.session.abort).not.toHaveBeenCalled();
  });

  it('logs the loop reason when aborting', () => {
    const { watchdog, fakes } = buildWatchdog();
    createBusyChild(watchdog);
    sendTextParts(watchdog, ['x', 'x', 'x']);
    watchdog.checkNow();
    const written = fakes.appendFileSync.mock.calls.map((c: unknown[]) => String(c[1])).join('');
    expect(written).toContain('"reason":"content-loop"');
  });
});
```

- [ ] **Step 2: Run tests to verify behavior**

Run: `npx vitest run tests/plugin/watchdog.test.ts`
Expected: PASS — Tasks 3–4 already implemented the required logic. If any test FAILS, fix the bug in `recordPart`, `tailAllSame`, or `evaluate` (most likely: part-id dedup or ring-buffer handling). Do NOT weaken the tests to make them pass.

- [ ] **Step 3: Commit**

```bash
git add tests/plugin/watchdog.test.ts src/plugin/watchdog-source.ts
git commit -m "test: watchdog loop detection for content and tool calls"
```

---

### Task 6: Agent name resolution, agent filter, session discovery

Resolve agent names from the child session's first user message, apply the `kiki-` filter when `watchAllSubagents` is false, and discover missed child sessions via `client.session.list()` on each tick.

**Files:**
- Modify: `src/plugin/watchdog-source.ts`
- Test: `tests/plugin/watchdog.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/plugin/watchdog.test.ts`:

```typescript
describe('watchdog agent filtering and discovery', () => {
  function createBusyChild(watchdog: ReturnType<typeof buildWatchdog>['watchdog'], id = 'child-1') {
    watchdog.handleEvent({ type: 'session.created', properties: { info: { id, parentID: 'p', title: id } } });
    watchdog.handleEvent({ type: 'session.status', properties: { sessionID: id, status: { type: 'busy' } } });
  }

  it('does not abort a resolved non-kiki agent when watchAllSubagents is false', async () => {
    const { watchdog, client, setTime, getTime } = buildWatchdog();
    client.session.messages.mockResolvedValue([{ info: { role: 'user', agent: 'general' } }]);
    createBusyChild(watchdog);
    await flushPromises();
    setTime(getTime() + 30000);
    watchdog.checkNow();
    expect(client.session.abort).not.toHaveBeenCalled();
  });

  it('aborts a resolved kiki agent', async () => {
    const { watchdog, client, setTime, getTime } = buildWatchdog();
    client.session.messages.mockResolvedValue([{ info: { role: 'user', agent: 'kiki-planner' } }]);
    createBusyChild(watchdog);
    await flushPromises();
    setTime(getTime() + 6000);
    watchdog.checkNow();
    expect(client.session.abort).toHaveBeenCalledWith({ path: { id: 'child-1' } });
  });

  it('watches a non-kiki agent when watchAllSubagents is true', async () => {
    const { watchdog, client, setTime, getTime } = buildWatchdog({}, { watchAllSubagents: true });
    client.session.messages.mockResolvedValue([{ info: { role: 'user', agent: 'general' } }]);
    createBusyChild(watchdog);
    await flushPromises();
    setTime(getTime() + 6000);
    watchdog.checkNow();
    expect(client.session.abort).toHaveBeenCalled();
  });

  it('discovers child sessions via client.session.list on checkNow', async () => {
    const { watchdog, client, setTime, getTime } = buildWatchdog();
    client.session.list.mockResolvedValue([{ id: 'missed-1', parentID: 'p', title: 'kiki-reviewer' }]);
    setTime(getTime() + 6000);
    watchdog.checkNow();
    await flushPromises();
    watchdog.checkNow(); // second tick: discovered session is evaluated
    expect(client.session.abort).toHaveBeenCalledWith({ path: { id: 'missed-1' } });
  });

  it('tolerates session.list failures', async () => {
    const { watchdog, client } = buildWatchdog();
    client.session.list.mockRejectedValue(new Error('offline'));
    expect(() => watchdog.checkNow()).not.toThrow();
    await flushPromises();
  });
});
```

Note on the discovery test: the discovered session is registered with `startedAt = now()` at tick 1, so it is still inside the grace period on tick 1. Tick 2 at the same mocked time still violates grace. To make the test deterministic, advance time between ticks: change the test body to:

```typescript
    client.session.list.mockResolvedValue([{ id: 'missed-1', parentID: 'p', title: 'kiki-reviewer' }]);
    watchdog.checkNow(); // tick 1: discovers and registers 'missed-1'
    await flushPromises();
    setTime(getTime() + 6000); // now past grace + stuck threshold for the discovered session
    watchdog.checkNow(); // tick 2: evaluates and aborts
    expect(client.session.abort).toHaveBeenCalledWith({ path: { id: 'missed-1' } });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/plugin/watchdog.test.ts`
Expected: FAIL — no agent resolution or discovery exists yet (the "resolved non-kiki" and "discovery" tests fail).

- [ ] **Step 3: Implement agent resolution and discovery**

In `src/plugin/watchdog-source.ts`, inside the `register` function, replace the `agentName` line and add a resolution call. The updated tail of `register` becomes:

```javascript
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
    resolveAgentName(state);
```

Add these functions after `register`:

```javascript
  function resolveAgentName(state) {
    try {
      var p = client.session.messages({ path: { id: state.sessionId } });
      if (p && typeof p.then === 'function') {
        p.then(function (msgs) {
          var name = null;
          if (msgs && msgs.length) {
            for (var i = 0; i < msgs.length; i++) {
              var m = msgs[i];
              if (m && m.info && m.info.role === 'user' && m.info.agent) {
                name = m.info.agent;
                break;
              }
            }
          }
          if (name) state.agentName = name;
        }, function () { /* keep title fallback */ });
      }
    } catch (e) { /* keep title fallback */ }
  }

  function discoverSessions() {
    try {
      var p = client.session.list();
      if (p && typeof p.then === 'function') {
        p.then(function (list) {
          if (!list) return;
          for (var i = 0; i < list.length; i++) {
            if (list[i] && list[i].parentID) register(list[i]);
          }
        }, function () { /* tolerate */ });
      }
    } catch (e) { /* tolerate */ }
  }
```

In `checkNow`, add `discoverSessions();` as the first statement after the enabled check:

```javascript
  function checkNow() {
    if (!cfg.watchdogEnabled) return;
    discoverSessions();
    var toAbort = [];
    sessions.forEach(function (state) {
      var verdict = evaluate(state);
      if (verdict) toAbort.push([state, verdict]);
    });
    for (var i = 0; i < toAbort.length; i++) {
      abortSession(toAbort[i][0], toAbort[i][1]);
    }
  }
```

Note on agent filtering semantics: `shouldWatch` already treats `agentName == null` as watched (fail-closed). Since `register` seeds `agentName` from the session title and `resolveAgentName` overwrites it with the real agent when available, a resolved non-kiki agent (e.g. `general`) will fail the `kiki-` prefix check and be skipped — while an unresolvable session keeps its title (e.g. `kiki-planner`) or `null`, both of which are watched. This matches the spec's safety-rail intent while never silently disabling protection.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/plugin/watchdog.test.ts`
Expected: PASS (23 tests).

- [ ] **Step 5: Commit**

```bash
git add src/plugin/watchdog-source.ts tests/plugin/watchdog.test.ts
git commit -m "feat: watchdog agent name resolution, kiki filter, and session discovery"
```

---

### Task 7: Plugin template integration

Rewrite `generatePluginTemplate()` to inline `WATCHDOG_SOURCE`, bake in `DEFAULT_HEALTH`, load runtime health config from `.agentic/kiki/config.json`, keep the existing routing logger, and wire the `event` hook + watchdog start.

**Files:**
- Modify: `src/cli/config.ts:504-535` (`generatePluginTemplate`)
- Test: `tests/cli/plugin-template.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/cli/plugin-template.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generatePluginTemplate, DEFAULT_HEALTH } from '../../src/cli/config';

describe('generatePluginTemplate', () => {
  const template = generatePluginTemplate();

  it('inlines the watchdog source', () => {
    expect(template).toContain('function createWatchdog(deps)');
  });

  it('bakes in the default health config', () => {
    expect(template).toContain('"stuckThresholdMs": 300000');
    expect(template).toContain('"absoluteMaxMs": 3600000');
    expect(template).toContain(String(DEFAULT_HEALTH.loopRepeatCount));
  });

  it('starts the watchdog and wires the event hook', () => {
    expect(template).toContain('watchdog.start()');
    expect(template).toContain('watchdog.handleEvent(event)');
  });

  it('keeps the routing logger for kiki task dispatches', () => {
    expect(template).toContain("input.tool !== 'task'");
    expect(template).toContain("subagentType.startsWith('kiki-')");
    expect(template).toContain('routing_log.jsonl');
  });

  it('loads runtime health config from .agentic/kiki/config.json', () => {
    expect(template).toContain('loadHealthConfig');
    expect(template).toContain(".agentic', 'kiki', 'config.json");
  });

  it('creates the watchdog with client, directory, config, and now', () => {
    expect(template).toContain('createWatchdog({');
    expect(template).toContain('now: () => Date.now()');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli/plugin-template.test.ts`
Expected: FAIL — current template contains none of the watchdog wiring.

- [ ] **Step 3: Rewrite generatePluginTemplate**

In `src/cli/config.ts`, add the import at the top of the file:

```typescript
import { WATCHDOG_SOURCE } from '../plugin/watchdog-source.js';
```

Replace the entire `generatePluginTemplate()` function (lines 504-535) with:

```typescript
export function generatePluginTemplate(): string {
  return `import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';

${WATCHDOG_SOURCE}

const DEFAULT_HEALTH = ${JSON.stringify(DEFAULT_HEALTH, null, 2)};

function loadHealthConfig(directory: string) {
  try {
    const raw = JSON.parse(readFileSync(join(directory, '.agentic', 'kiki', 'config.json'), 'utf-8'));
    return Object.assign({}, DEFAULT_HEALTH, raw.health || {});
  } catch {
    return Object.assign({}, DEFAULT_HEALTH);
  }
}

interface RoutingLogEntry {
  timestamp: string;
  agent: string;
  model: string;
}

export default function KikiPlugin({ client, directory }: { client: any; directory: string }) {
  const root = directory || process.cwd();
  const health = loadHealthConfig(root);
  const watchdog = createWatchdog({ client, directory: root, config: health, now: () => Date.now() });
  watchdog.start();

  return {
    'tool.execute.before': async (input: any, output: any) => {
      if (input.tool !== 'task') return;
      const subagentType = output.args?.subagent_type ?? '';
      if (!subagentType.startsWith('kiki-')) return;

      const logPath = join(process.cwd(), '.agentic', 'kiki', 'routing_log.jsonl');
      const dir = dirname(logPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      const entry: RoutingLogEntry = {
        timestamp: new Date().toISOString(),
        agent: subagentType,
        model: output.args?.model ?? 'unknown',
      };
      appendFileSync(logPath, JSON.stringify(entry) + '\\n');
    },
    event: async ({ event }: { event: any }) => {
      watchdog.handleEvent(event);
    }
  };
}
`;
}
```

Note: `\\n` in the routing logger line is intentional — it produces `\n` in the generated file (unchanged from the previous template).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cli/plugin-template.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the full suite and build**

Run: `npm test && npm run build`
Expected: PASS and a clean `tsc` build. Fix any type errors (e.g., test files referencing the old plugin template shape).

- [ ] **Step 6: Commit**

```bash
git add src/cli/config.ts tests/cli/plugin-template.test.ts
git commit -m "feat: integrate subagent watchdog into generated kiki plugin"
```

---

### Task 8: End-to-end verification and CHANGELOG

Verify the generated plugin file is syntactically valid, regenerate a scratch installation, and document the feature.

**Files:**
- Test: `tests/integration/watchdog-plugin-syntax.test.ts` (new)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Write the syntax validation test**

Create `tests/integration/watchdog-plugin-syntax.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { generateAllTemplates, DEFAULT_CONFIG } from '../../src/cli/config';

describe('generated plugin file', () => {
  it('is syntactically valid JavaScript/TypeScript as evaluated structure', () => {
    const templates = generateAllTemplates(DEFAULT_CONFIG);
    const tmpDir = `tmp/watchdog-plugin-syntax-${Date.now()}`;
    try {
      mkdirSync(tmpDir, { recursive: true });
      const pluginPath = join(tmpDir, 'kiki-plugin-check.ts');
      writeFileSync(pluginPath, templates.plugin);
      // Type-check the generated plugin with tsc (noEmit, lenient libs).
      execFileSync('npx', ['tsc', '--noEmit', '--strict', '--skipLibCheck', '--module', 'esnext', '--target', 'es2020', '--moduleResolution', 'bundler', pluginPath], { stdio: 'pipe' });
    } finally {
      if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('writeOpencodeFiles produces the watchdog-enabled plugin on disk', async () => {
    const { writeOpencodeFiles } = await import('../../src/cli/config');
    const tmpDir = `tmp/watchdog-write-files-${Date.now()}`;
    try {
      writeOpencodeFiles(tmpDir, DEFAULT_CONFIG);
      const { readFileSync } = await import('node:fs');
      const content = readFileSync(join(tmpDir, '.opencode', 'plugins', 'kiki.ts'), 'utf-8');
      expect(content).toContain('function createWatchdog(deps)');
      expect(content).toContain('watchdog.start()');
    } finally {
      if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
```

Note: the generated plugin references `process` (Node global) and uses a default export — the `tsc --noEmit` flags above are chosen to accept that. If `tsc` rejects the default-export plugin shape in your environment, adjust the flags (never the tests' intent) and record why in the commit message.

- [ ] **Step 2: Run integration tests**

Run: `npx vitest run tests/integration/watchdog-plugin-syntax.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 3: Update CHANGELOG.md**

Add to the top of `CHANGELOG.md` under a new `## [Unreleased]` section (follow the existing Keep a Changelog format — check the file's current headings first and match them):

```markdown
## [Unreleased]

### Added
- Subagent watchdog in the generated OpenCode plugin: automatically detects hung subagent sessions (no message parts or token growth for `health.stuckThresholdMs`, default 5 min), output/tool loops (3 identical repetitions), and sessions exceeding `health.absoluteMaxMs` (default 60 min), then aborts them so the orchestrator's retry/escalation flow resumes without manual intervention. Incidents are logged to `.agentic/kiki/health_log.jsonl`. Configurable via the new `health` section in `.agentic/kiki/config.json`.
```

- [ ] **Step 4: Run the complete verification**

Run: `npm run build && npm test`
Expected: clean build, all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/watchdog-plugin-syntax.test.ts CHANGELOG.md
git commit -m "test+docs: watchdog plugin syntax validation and changelog entry"
```

---

## Manual validation (post-implementation, not part of CI)

1. In a kiki-initialized scratch project, run `kiki update` and confirm `.opencode/plugins/kiki.ts` contains the watchdog.
2. Start OpenCode, dispatch `@kiki-orchestrator` with a small task, and confirm `.agentic/kiki/health_log.jsonl` stays empty during healthy execution (no false positives).
3. Temporarily set `health.stuckThresholdMs` to `20000` and `health.gracePeriodMs` to `5000` in `.agentic/kiki/config.json`, dispatch a long `kiki-planner` task, and observe the watchdog aborting it within ~30 s of silence; confirm the orchestrator retries.
4. Restore the default health config afterward.

## Self-Review Notes

- **Spec coverage:** Detection (stuck/loop/absolute/thinking-as-activity) → Tasks 3–5. Recovery (abort + parent unblocking) → Task 4 (abort; parent unblocking is OpenCode behavior, asserted via `session.abort` call). Health log + fallback → Task 4. Config → Tasks 1, 7. Agent filter → Task 6. Plugin architecture → Task 7. Testing strategy → unit tests throughout, integration syntax test in Task 8. Defense-in-depth items are explicitly out of scope per spec.
- **Placeholder scan:** All code steps contain complete code; no TBD/TODO.
- **Type consistency:** `KikiHealthConfig`/`DEFAULT_HEALTH` defined in Task 1 and reused in Tasks 2 (deps type) and 7 (template bake-in). `createWatchdog(deps)` factory signature identical in source, tests, and template. `handleEvent`/`checkNow`/`start`/`stop`/`_sessions` return shape consistent across tasks.
