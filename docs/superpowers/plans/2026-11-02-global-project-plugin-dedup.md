# Global + Project Plugin Deduplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the generated Kiki plugin self-deduplicate when both a global and a project install are loaded by OpenCode, so exactly one watchdog interval, one routing-log writer, and one abort path run per project root per process — with a best-effort diagnostic when the two copies differ in version.

**Architecture:** Add a process-wide ownership registry at `globalThis[Symbol.for('kiki.plugin')]` keyed by resolved project root. The first plugin instance to load for a root owns the watchdog + routing logger; later instances for the same root return no-op hooks (emitting a version-mismatch diagnostic first if versions differ). The generator stamps `KIKI_PLUGIN_VERSION` and `KIKI_PLUGIN_SCOPE` into each generated `kiki.ts`; OpenCode's documented global-before-project load order makes the global copy the canonical owner. All dedup logic is inlined into the generated plugin (zero runtime deps, valid non-strict TypeScript, no backticks/`${` in inlined code), mirroring the existing `WATCHDOG_SOURCE` pattern with a new `DEDUP_SOURCE` constant.

**Tech Stack:** TypeScript (ESM, Node ≥ 18), vitest, `tsc --noEmit` (non-strict) for the generated-plugin syntax check, `npm run build` = `tsc`.

**Spec:** `docs/superpowers/specs/2026-11-02-global-project-plugin-dedup-design.md`
**Task doc:** `docs/tasks/2026-11-02-global-project-plugin-dedup.md`

---

## File Structure

- **`src/plugin/dedup-source.ts`** (new) — exports `DEDUP_SOURCE`, a backtick-free, `${`-free string containing the `OwnershipRecord` interface, `KIKI_OWNERSHIP_KEY` symbol, `acquireOwnership`, `getOwner`, and `reportVersionMismatch`. Inlined verbatim into the generated plugin (mirrors `WATCHDOG_SOURCE`).
- **`src/cli/config.ts`** (modify) — add `export const KIKI_VERSION`; change `generatePluginTemplate()` → `generatePluginTemplate(opts?)`; thread `scope`/`version` through `generateAllTemplates` and `writeOpencodeFiles`; inline `KIKI_PLUGIN_VERSION`/`KIKI_PLUGIN_SCOPE` + `DEDUP_SOURCE` into the template; add `resolve` to the `path` import; wrap the default export in the ownership gate.
- **`src/cli/commands/install.ts`** (modify) — `installGlobal()` calls `generateAllTemplates(DEFAULT_CONFIG, 'global')`. (`installProject()` unchanged.)
- **`src/cli/commands/update.ts`** — unchanged (default scope `'project'` is correct). Listed here for clarity; no edit.
- **`tests/cli/plugin-template.test.ts`** (modify) — add scope/version, dedup-presence, and no-backticks/`${` assertions for the inlined dedup region; keep existing assertions.
- **`tests/cli/plugin-dedup.test.ts`** (new) — behavioral tests loading the generated plugin via temp `.ts` files + `await import` under a shared `globalThis`; covers global-only, project-only, both-installed (same version), version mismatch, and multi-root isolation.
- **`tests/integration/watchdog-plugin-syntax.test.ts`** (modify) — add a `tsc --noEmit` case for the `'global'`-scoped generated plugin.
- **`CHANGELOG.md`** (modify) — add an `### Added` entry under `## [Unreleased]` and a release-checklist note (`KIKI_VERSION` in `src/cli/config.ts` must track `package.json`).

---

## Task 1: Add `KIKI_VERSION` constant and release-checklist note

**Metadata:**
- risk: low
- parallel: true
- depends_on: []

**Files:**
- Modify: `src/cli/config.ts` (add export near other top-level exports, e.g. after `DEFAULT_HEALTH` at line ~71–92 region — place it right after the `DEFAULT_HEALTH` export block)
- Test: `tests/cli/plugin-template.test.ts` (new import + one assertion; this test currently imports `generatePluginTemplate, DEFAULT_HEALTH` from `../../src/cli/config`)

- [ ] **Step 1: Write the failing test**

Append to `tests/cli/plugin-template.test.ts` (and update the import line at the top):

Change the import (line 2) from:
```ts
import { generatePluginTemplate, DEFAULT_HEALTH } from '../../src/cli/config';
```
to:
```ts
import { generatePluginTemplate, DEFAULT_HEALTH, KIKI_VERSION } from '../../src/cli/config';
```

Add a new `describe` block at the end of the file:
```ts
describe('KIKI_VERSION', () => {
  it('matches the version in package.json', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8'));
    expect(KIKI_VERSION).toBe(pkg.version);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli/plugin-template.test.ts`
Expected: FAIL with error like `KIKI_VERSION is not exported from '../../src/cli/config'` (import fails).

- [ ] **Step 3: Write minimal implementation**

In `src/cli/config.ts`, add immediately after the `DEFAULT_HEALTH` export block (after the closing `}` of `export const DEFAULT_HEALTH: KikiHealthConfig = { ... }`):
```ts
/**
 * Kiki version, baked into the generated plugin as KIKI_PLUGIN_VERSION.
 * MUST be kept in sync with package.json on every release. The published
 * package ships only dist/ (see package.json "files"), so a globally
 * installed CLI cannot read its own package.json at runtime — this const
 * is the source of truth for the generator.
 */
export const KIKI_VERSION = '2.1.0';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cli/plugin-template.test.ts`
Expected: PASS (the new `KIKI_VERSION` test passes; existing assertions unchanged).

- [ ] **Step 5: Add the release-checklist note to CHANGELOG.md**

Under `## [Unreleased]` in `CHANGELOG.md`, add an `### Added` entry (the section already exists with the watchdog entry; append after it):
```markdown
- **Plugin deduplication:** when both a global and a project Kiki install are loaded by OpenCode in the same process, the generated plugin now self-deduplicates via a `globalThis[Symbol.for('kiki.plugin')]` ownership registry keyed by resolved project root. The first-loaded (global) instance owns the watchdog and routing logger; later instances for the same root register no-op hooks and emit a `plugin-dedup-version-mismatch` diagnostic (to `console.warn`, `.agentic/kiki/health_log.jsonl`, and `client.app.log`) when their baked-in `KIKI_PLUGIN_VERSION` differs from the owner's.
- **Release checklist note:** `KIKI_VERSION` in `src/cli/config.ts` must be updated alongside `package.json` on every release. A unit test asserts they match at test time.
```

- [ ] **Step 6: Commit**

```bash
git add src/cli/config.ts tests/cli/plugin-template.test.ts CHANGELOG.md
git commit -m "feat: add KIKI_VERSION constant and release-checklist note"
```

---

## Task 2: Create `DEDUP_SOURCE` (inlined dedup logic, template-literal-safe)

**Metadata:**
- risk: medium
- parallel: true
- depends_on: []

**Files:**
- Create: `src/plugin/dedup-source.ts`
- Test: `tests/cli/plugin-dedup-source.test.ts` (new, small — just the no-backticks/`${` and presence assertions for the constant itself)

> This task creates the inlined dedup code as a standalone string constant, exactly like `WATCHDOG_SOURCE`. It references `KIKI_PLUGIN_SCOPE` and `KIKI_PLUGIN_VERSION`, which the generator declares in the template *before* `${DEDUP_SOURCE}` is interpolated. It also uses `join`, `dirname`, `existsSync`, `mkdirSync`, `appendFileSync` — all imported by the generated plugin template from `fs`/`path`. It must contain **no backticks** and **no `${`** sequences, or it will break the outer template literal.

- [ ] **Step 1: Write the failing test**

Create `tests/cli/plugin-dedup-source.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { DEDUP_SOURCE } from '../../src/plugin/dedup-source';

describe('DEDUP_SOURCE', () => {
  it('is a non-empty string', () => {
    expect(typeof DEDUP_SOURCE).toBe('string');
    expect(DEDUP_SOURCE.length).toBeGreaterThan(100);
  });

  it('contains the ownership registry primitives', () => {
    expect(DEDUP_SOURCE).toContain("Symbol.for('kiki.plugin')");
    expect(DEDUP_SOURCE).toContain('function acquireOwnership');
    expect(DEDUP_SOURCE).toContain('function getOwner');
    expect(DEDUP_SOURCE).toContain('function reportVersionMismatch');
    expect(DEDUP_SOURCE).toContain('interface OwnershipRecord');
  });

  it('contains no backticks or template-literal placeholders', () => {
    expect(DEDUP_SOURCE).not.toMatch(/[`]/);
    expect(DEDUP_SOURCE).not.toMatch(/\$\{/);
  });

  it('references the baked-in scope/version constants', () => {
    expect(DEDUP_SOURCE).toContain('KIKI_PLUGIN_SCOPE');
    expect(DEDUP_SOURCE).toContain('KIKI_PLUGIN_VERSION');
  });

  it('emits the plugin-dedup-version-mismatch event and realign hint', () => {
    expect(DEDUP_SOURCE).toContain('plugin-dedup-version-mismatch');
    expect(DEDUP_SOURCE).toContain('kiki install --force');
    expect(DEDUP_SOURCE).toContain('kiki update');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli/plugin-dedup-source.test.ts`
Expected: FAIL with `Cannot find module '../../src/plugin/dedup-source'` or similar.

- [ ] **Step 3: Write minimal implementation**

Create `src/plugin/dedup-source.ts` with exactly this content (note: uses single quotes and string concatenation only — no backticks, no `${`; uses `\\n` for the literal `\n` that must appear in the output plugin):
```ts
/**
 * Plain-JS/TS source of the plugin deduplication logic, inlined verbatim
 * into the generated .opencode/plugins/kiki.ts. Must stay free of backticks
 * and ${ sequences (the outer template literal in config.ts would break).
 * The outer scope provides: appendFileSync, existsSync, mkdirSync, join,
 * dirname (imported by the plugin template from fs/path), and the module-
 * level constants KIKI_PLUGIN_VERSION and KIKI_PLUGIN_SCOPE (declared in the
 * template before this string is interpolated).
 */
export const DEDUP_SOURCE = `
interface OwnershipRecord {
  root: string;
  scope: 'global' | 'project';
  version: string;
  startedAt: number;
}

const KIKI_OWNERSHIP_KEY = Symbol.for('kiki.plugin');

function acquireOwnership(root: string): OwnershipRecord | null {
  var registry: any = null;
  try {
    registry = (globalThis as any)[KIKI_OWNERSHIP_KEY];
  } catch (e) {
    registry = null;
  }
  if (!registry || typeof registry !== 'object') registry = {};
  if (registry[root]) return null;
  var record: OwnershipRecord = {
    root: root,
    scope: KIKI_PLUGIN_SCOPE,
    version: KIKI_PLUGIN_VERSION,
    startedAt: Date.now()
  };
  registry[root] = record;
  (globalThis as any)[KIKI_OWNERSHIP_KEY] = registry;
  return record;
}

function getOwner(root: string): OwnershipRecord | undefined {
  var registry: any = null;
  try {
    registry = (globalThis as any)[KIKI_OWNERSHIP_KEY];
  } catch (e) {
    return undefined;
  }
  if (!registry || typeof registry !== 'object') return undefined;
  return registry[root];
}

function reportVersionMismatch(root: string, owner: OwnershipRecord, client: any, directory: string): void {
  var message = 'kiki plugin-dedup-version-mismatch: owner scope=' + owner.scope + ' version=' + owner.version + ' this scope=' + KIKI_PLUGIN_SCOPE + ' version=' + KIKI_PLUGIN_VERSION + ' at ' + root + ' - run \\'kiki install --force\\' and/or \\'kiki update <project>\\' to realign.';
  try {
    console.warn(message);
  } catch (e) { /* ignore */ }
  try {
    var logPath = join(directory, '.agentic', 'kiki', 'health_log.jsonl');
    var dir = dirname(logPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(logPath, JSON.stringify({
      level: 'warn',
      timestamp: new Date().toISOString(),
      event: 'plugin-dedup-version-mismatch',
      root: root,
      ownerScope: owner.scope,
      ownerVersion: owner.version,
      thisScope: KIKI_PLUGIN_SCOPE,
      thisVersion: KIKI_PLUGIN_VERSION
    }) + '\\n');
  } catch (e) { /* best effort */ }
  try {
    if (client && client.app && client.app.log) {
      client.app.log({ body: { service: 'kiki-plugin', level: 'warn', message: 'plugin-dedup-version-mismatch', extra: { root: root, ownerScope: owner.scope, ownerVersion: owner.version, thisScope: KIKI_PLUGIN_SCOPE, thisVersion: KIKI_PLUGIN_VERSION } } });
    }
  } catch (e2) { /* best effort */ }
}
`;
```

> Notes for the implementer:
> - The `\\n` inside the string literal becomes `\n` in the generated plugin, which is what `appendFileSync` needs.
> - The `\\'` becomes `\'`... no — single quotes inside a backtick template literal do not need escaping. Use plain `'kiki install --force'` (no backslash). The version above uses `\\'` which would emit `\'` into the output — **incorrect**. Fix: replace `\\'kiki install --force\\'` with `'kiki install --force'` and `\\'kiki update <project>\\'` with `'kiki update <project>'`. The single quotes are literal characters in the template string; they do not terminate the backtick literal. (This is the same as `WATCHDOG_SOURCE` using plain single quotes throughout.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cli/plugin-dedup-source.test.ts`
Expected: PASS (all five assertions).

- [ ] **Step 5: Commit**

```bash
git add src/plugin/dedup-source.ts tests/cli/plugin-dedup-source.test.ts
git commit -m "feat: add DEDUP_SOURCE for inlined plugin ownership registry"
```

---

## Task 3: Thread scope/version through the generator and inline the ownership gate

**Metadata:**
- risk: high
- parallel: false
- depends_on: ['Task 1', 'Task 2']

> High risk because this is the core template change: it touches the byte-identical-for-both-scopes invariant, the `path` import, the default-export body, and three call sites (`generateAllTemplates`, `writeOpencodeFiles`, `installGlobal`). A mistake here breaks every generated plugin. The TDD test below pins the contract before the implementation is touched.

**Files:**
- Modify: `src/cli/config.ts` — `generatePluginTemplate` (~line 532), `generateAllTemplates` (~725), `writeOpencodeFiles` (~742), the `path` import line in the template string, the default-export body
- Modify: `src/cli/commands/install.ts` — `installGlobal` (~line 41)
- Test: `tests/cli/plugin-template.test.ts` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `tests/cli/plugin-template.test.ts` (inside the existing top-level `describe('generatePluginTemplate', ...)` and also add a new `describe` for scope/version threading). The existing `const template = generatePluginTemplate();` at line 6 stays (it exercises the default-args backward-compat path).

Add inside the existing `describe('generatePluginTemplate', ...)` block:
```ts
  it('inlines the dedup ownership registry', () => {
    expect(template).toContain("Symbol.for('kiki.plugin')");
    expect(template).toContain('function acquireOwnership');
    expect(template).toContain('function getOwner');
    expect(template).toContain('function reportVersionMismatch');
  });

  it('imports resolve from path (for the ownership root key)', () => {
    expect(template).toContain("import { join, dirname, resolve } from 'path';");
  });

  it('uses resolve() for the ownership root', () => {
    expect(template).toContain('resolve(directory || process.cwd())');
  });

  it('stamps default scope=project and default version when called with no args', () => {
    expect(template).toContain("const KIKI_PLUGIN_SCOPE = 'project';");
    expect(template).toContain("const KIKI_PLUGIN_VERSION = '2.1.0';");
  });

  it('returns no-op hooks on the non-owner path', () => {
    expect(template).toContain('if (!ownership)');
    expect(template).toContain("'tool.execute.before': async (_input: any, _output: any) => {}");
    expect(template).toContain('event: async (_args: { event: any }) => {}');
  });

  it('contains no backticks or ${ in the inlined dedup region', () => {
    // The DEDUP_SOURCE region is everything between theOwnershipRecord
    // interface and the end of reportVersionMismatch. Assert on the whole
    // template minus the watchdog region, which is already guarded.
    const dedupStart = template.indexOf('interface OwnershipRecord');
    const dedupEnd = template.indexOf('function reportVersionMismatch');
    expect(dedupStart).toBeGreaterThan(-1);
    expect(dedupEnd).toBeGreaterThan(dedupStart);
    const dedupRegion = template.slice(dedupStart, template.indexOf('const DEFAULT_HEALTH'));
    expect(dedupRegion).not.toMatch(/[`]/);
    expect(dedupRegion).not.toMatch(/\$\{/);
  });
```

Add a new `describe` block at the end of the file:
```ts
describe('generatePluginTemplate scope/version threading', () => {
  it('stamps scope=global when requested', () => {
    const t = generatePluginTemplate({ scope: 'global', version: KIKI_VERSION });
    expect(t).toContain("const KIKI_PLUGIN_SCOPE = 'global';");
    expect(t).toContain("const KIKI_PLUGIN_VERSION = '2.1.0';");
  });

  it('stamps an arbitrary version string', () => {
    const t = generatePluginTemplate({ scope: 'project', version: '9.9.9' });
    expect(t).toContain("const KIKI_PLUGIN_VERSION = '9.9.9';");
  });

  it('defaults scope to project and version to KIKI_VERSION with empty opts', () => {
    const t = generatePluginTemplate({});
    expect(t).toContain("const KIKI_PLUGIN_SCOPE = 'project';");
    expect(t).toContain("const KIKI_PLUGIN_VERSION = '2.1.0';");
  });
});

describe('generateAllTemplates scope threading', () => {
  it('threads scope=global through to the plugin template', () => {
    const { generateAllTemplates, DEFAULT_CONFIG } = await import('../../src/cli/config') as any;
    const t = generateAllTemplates(DEFAULT_CONFIG, 'global');
    expect(t.plugin).toContain("const KIKI_PLUGIN_SCOPE = 'global';");
  });

  it('defaults to scope=project when scope is omitted', () => {
    const { generateAllTemplates, DEFAULT_CONFIG } = await import('../../src/cli/config') as any;
    const t = generateAllTemplates(DEFAULT_CONFIG);
    expect(t.plugin).toContain("const KIKI_PLUGIN_SCOPE = 'project';");
  });
});
```

> Note: the two `generateAllTemplates` tests use top-level `await import` inside an `it`. Vitest supports top-level await in test bodies; if the project's vitest config disallows it, refactor to a static import at the top of the file (`import { generateAllTemplates, DEFAULT_CONFIG, generatePluginTemplate, DEFAULT_HEALTH, KIKI_VERSION } from '../../src/cli/config';`) and call directly. Prefer the static-import form to match the existing file's style — update the top import line accordingly.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/cli/plugin-template.test.ts`
Expected: FAIL — new assertions about `Symbol.for('kiki.plugin')`, `resolve`, `KIKI_PLUGIN_SCOPE`, no-op hooks, and `generateAllTemplates(..., 'global')` all fail (the current template has none of these).

- [ ] **Step 3: Implement — change `generatePluginTemplate`**

In `src/cli/config.ts`, first add the import of `DEDUP_SOURCE` next to the existing `WATCHDOG_SOURCE` import (line 4):
```ts
import { WATCHDOG_SOURCE } from '../plugin/watchdog-source.js';
import { DEDUP_SOURCE } from '../plugin/dedup-source.js';
```

Replace the entire `generatePluginTemplate` function (lines 532–603) with:
```ts
export function generatePluginTemplate(opts: { scope?: 'global' | 'project'; version?: string } = {}): string {
  const scope = opts.scope ?? 'project';
  const version = opts.version ?? KIKI_VERSION;
  return `import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';

const KIKI_PLUGIN_VERSION = '${version}';
const KIKI_PLUGIN_SCOPE = '${scope}';

${WATCHDOG_SOURCE}

${DEDUP_SOURCE}

const DEFAULT_HEALTH = ${JSON.stringify(DEFAULT_HEALTH, null, 2)};

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && Math.floor(v) === v;
}

function sanitizeHealth(raw: any): typeof DEFAULT_HEALTH {
  const out = Object.assign({}, DEFAULT_HEALTH);
  if (!raw || typeof raw !== 'object') return out;
  if (typeof raw.watchdogEnabled === 'boolean') out.watchdogEnabled = raw.watchdogEnabled;
  if (typeof raw.watchAllSubagents === 'boolean') out.watchAllSubagents = raw.watchAllSubagents;
  if (typeof raw.logPath === 'string' && raw.logPath.length > 0) out.logPath = raw.logPath;
  if (isPositiveInt(raw.stuckThresholdMs)) out.stuckThresholdMs = raw.stuckThresholdMs;
  if (isPositiveInt(raw.gracePeriodMs)) out.gracePeriodMs = raw.gracePeriodMs;
  if (isPositiveInt(raw.absoluteMaxMs)) out.absoluteMaxMs = raw.absoluteMaxMs;
  if (isPositiveInt(raw.checkIntervalMs)) out.checkIntervalMs = raw.checkIntervalMs;
  if (isPositiveInt(raw.loopRepeatCount) && raw.loopRepeatCount >= 2) out.loopRepeatCount = raw.loopRepeatCount;
  return out;
}

function loadHealthConfig(directory: string) {
  try {
    const raw = JSON.parse(readFileSync(join(directory, '.agentic', 'kiki', 'config.json'), 'utf-8'));
    return sanitizeHealth(raw.health);
  } catch {
    return sanitizeHealth(null);
  }
}

interface RoutingLogEntry {
  timestamp: string;
  agent: string;
  model: string;
}

export default function KikiPlugin({ client, directory }: { client: any; directory: string }) {
  // Load-once plugin: interval is unref'd; no teardown hook needed (watchdog.stop unused by design).
  const root = resolve(directory || process.cwd());

  // --- ownership gate: first-loaded instance for this root owns the
  // watchdog and routing logger. Non-owners return no-op hooks so the
  // plugin contract stays stable. Keep the no-op hook names in sync with
  // the owner branch if new hooks are added. ---
  const ownership = acquireOwnership(root);
  if (!ownership) {
    const owner = getOwner(root);
    if (owner && owner.version !== KIKI_PLUGIN_VERSION) {
      reportVersionMismatch(root, owner, client, directory);
    }
    return {
      'tool.execute.before': async (_input: any, _output: any) => {},
      event: async (_args: { event: any }) => {}
    };
  }

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

- [ ] **Step 4: Implement — change `generateAllTemplates`**

Replace `generateAllTemplates` (lines 725–740) with:
```ts
export function generateAllTemplates(config: KikiConfig, scope: 'global' | 'project' = 'project', version: string = KIKI_VERSION): GeneratedTemplates {
  return {
    orchestrator: generateOrchestratorTemplate(config),
    brainstormer: generateBrainstormerTemplate(config),
    planner: generatePlannerTemplate(config),
    implementer: generateImplementerTemplate(config),
    guiDesigner: generateGuiDesignerTemplate(config),
    reviewer: generateReviewerTemplate(config),
    escalation: generateEscalationTemplate(config),
    historian: generateHistorianTemplate(config),
    plugin: generatePluginTemplate({ scope, version }),
    packageJson: OPENCODE_PACKAGE_JSON_TEMPLATE,
    gitignore: OPENCODE_GITIGNORE_TEMPLATE,
    workflow: generateWorkflowTemplate(config),
  };
}
```

- [ ] **Step 5: Implement — change `writeOpencodeFiles`**

Change the signature and the internal `generateAllTemplates` call (lines 742–753). The signature becomes:
```ts
export function writeOpencodeFiles(targetPath: string, config: KikiConfig, scope: 'global' | 'project' = 'project'): void {
```
and the body's `const templates = generateAllTemplates(config);` becomes:
```ts
  const templates = generateAllTemplates(config, scope);
```
Leave everything else in `writeOpencodeFiles` unchanged.

- [ ] **Step 6: Implement — change `installGlobal`**

In `src/cli/commands/install.ts` line 41, change:
```ts
  const templates = generateAllTemplates(DEFAULT_CONFIG);
```
to:
```ts
  const templates = generateAllTemplates(DEFAULT_CONFIG, 'global');
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/cli/plugin-template.test.ts`
Expected: PASS — all existing assertions (watchdog inlined, health baked, hooks present, routing logger, etc.) and all new assertions (scope/version stamping, dedup presence, no-op hooks, no backticks/`${` in dedup region, `generateAllTemplates` threading) pass.

Also run the integration syntax test to confirm the generated plugin still type-checks:
Run: `npx vitest run tests/integration/watchdog-plugin-syntax.test.ts`
Expected: PASS (the existing `tsc --noEmit` check still passes on the now-dedup-bearing project-scoped plugin, and the `writeOpencodeFiles` on-disk test still finds `createWatchdog` and `watchdog.start()`).

- [ ] **Step 8: Run the full suite to check for regressions**

Run: `npm test`
Expected: PASS (no regressions in CLI command tests, config tests, etc.).

- [ ] **Step 9: Commit**

```bash
git add src/cli/config.ts src/cli/commands/install.ts tests/cli/plugin-template.test.ts
git commit -m "feat: thread scope/version through generator and inline ownership gate"
```

---

## Task 4: Behavioral dedup tests (shared `globalThis`)

**Metadata:**
- risk: medium
- parallel: true
- depends_on: ['Task 3']

**Files:**
- Create: `tests/cli/plugin-dedup.test.ts`

> **How these tests load the generated plugin.** The generated plugin is a `.ts` file with `export default function KikiPlugin(...)`. The project is ESM and uses vitest, which transforms `.ts` on import via esbuild. The tests write `generatePluginTemplate({ scope, version })` output to a temp `.ts` file under `tmp/` and `await import(pathToFileURL(absPath).href)` it. Each distinct temp file is a distinct module instance (separate `KIKI_PLUGIN_VERSION`/`KIKI_PLUGIN_SCOPE` constants baked at generation time), but all share the test process's `globalThis` — exactly modeling two separate plugin files in one OpenCode process. Between cases, `delete (globalThis as any)[Symbol.for('kiki.plugin')]` resets the registry.
>
> **How the watchdog interval is observed deterministically.** The inlined `createWatchdog.start()` calls `setInterval(checkNow, cfg.checkIntervalMs)`. The tests `vi.spyOn(globalThis, 'setInterval')` with a `mockImplementation` that returns a stub `{ unref() {} }` object and increments a call counter, so no real timer is scheduled and the count is exact. `cfg.watchdogEnabled` defaults to `true` (the temp dir has no `.agentic/kiki/config.json`, so `loadHealthConfig` returns `DEFAULT_HEALTH`).
>
> **How the routing log is observed.** The `tool.execute.before` hook writes to `join(process.cwd(), '.agentic', 'kiki', 'routing_log.jsonl')` — it uses `process.cwd()`, not the `directory` arg. The tests `vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)` so writes land in the temp dir, then read the file and count lines.

- [ ] **Step 1: Write the tests**

Create `tests/cli/plugin-dedup.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generatePluginTemplate, KIKI_VERSION } from '../../src/cli/config';

const OWNERSHIP_KEY = Symbol.for('kiki.plugin');

function tmpPluginFile(scope: 'global' | 'project', version: string, id: string): string {
  const dir = `tmp/plugin-dedup-${id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `kiki-${scope}-${id}.ts`);
  writeFileSync(filePath, generatePluginTemplate({ scope, version }));
  return filePath;
}

async function loadPlugin(filePath: string): Promise<any> {
  const mod = await import(pathToFileURL(filePath).href);
  return mod.default;
}

describe('plugin dedup behavior', () => {
  let tmpRoots: string[] = [];
  let setIntervalSpy: ReturnType<typeof vi.spyOn>;
  let cwdSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete (globalThis as any)[OWNERSHIP_KEY];
    tmpRoots = [];
    setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockImplementation((() => ({ unref() {} }) as any));
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    setIntervalSpy.mockRestore();
    warnSpy.mockRestore();
    cwdSpy?.mockRestore();
    for (const r of tmpRoots) {
      if (existsSync(r)) rmSync(r, { recursive: true, force: true });
    }
    delete (globalThis as any)[OWNERSHIP_KEY];
  });

  function makeTmpRoot(): string {
    const root = `tmp/dedup-root-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    mkdirSync(root, { recursive: true });
    tmpRoots.push(root);
    return root;
  }

  function fakeClient(): any {
    return {
      app: { log: vi.fn().mockResolvedValue(true) },
      session: { abort: vi.fn(), list: vi.fn().mockResolvedValue([]), messages: vi.fn().mockResolvedValue([]) }
    };
  }

  async function fireTaskHook(pluginFn: any, root: string): Promise<void> {
    const hooks = pluginFn({ client: fakeClient(), directory: root });
    await hooks['tool.execute.before'](
      { tool: 'task' },
      { args: { subagent_type: 'kiki-planner', model: 'test-model' } }
    );
  }

  it('global-only: one owner, one interval, one routing log line', async () => {
    const root = makeTmpRoot();
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);
    const file = tmpPluginFile('global', KIKI_VERSION, 'g1');
    tmpRoots.push(require('node:path').dirname(file));
    const pluginFn = await loadPlugin(file);

    await fireTaskHook(pluginFn, root);

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    const logPath = join(root, '.agentic', 'kiki', 'routing_log.jsonl');
    expect(existsSync(logPath)).toBe(true);
    const lines = readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean);
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]).agent).toBe('kiki-planner');
  });

  it('project-only: one owner, one interval, one routing log line', async () => {
    const root = makeTmpRoot();
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);
    const file = tmpPluginFile('project', KIKI_VERSION, 'p1');
    tmpRoots.push(require('node:path').dirname(file));
    const pluginFn = await loadPlugin(file);

    await fireTaskHook(pluginFn, root);

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    const lines = readFileSync(join(root, '.agentic', 'kiki', 'routing_log.jsonl'), 'utf-8').trim().split('\n').filter(Boolean);
    expect(lines.length).toBe(1);
  });

  it('both installed, same version: second instance yields, single interval, single log line', async () => {
    const root = makeTmpRoot();
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);
    const gFile = tmpPluginFile('global', KIKI_VERSION, 'g2');
    const pFile = tmpPluginFile('project', KIKI_VERSION, 'p2');
    tmpRoots.push(require('node:path').dirname(gFile), require('node:path').dirname(pFile));
    const globalPlugin = await loadPlugin(gFile);
    const projectPlugin = await loadPlugin(pFile);

    const gHooks = globalPlugin({ client: fakeClient(), directory: root });
    const pHooks = projectPlugin({ client: fakeClient(), directory: root });

    await gHooks['tool.execute.before']({ tool: 'task' }, { args: { subagent_type: 'kiki-planner' } });
    await pHooks['tool.execute.before']({ tool: 'task' }, { args: { subagent_type: 'kiki-implementer' } });

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
    const lines = readFileSync(join(root, '.agentic', 'kiki', 'routing_log.jsonl'), 'utf-8').trim().split('\n').filter(Boolean);
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]).agent).toBe('kiki-planner');
  });

  it('version mismatch: non-owner warns and writes health_log, then yields', async () => {
    const root = makeTmpRoot();
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);
    const gFile = tmpPluginFile('global', '2.1.0', 'g3');
    const pFile = tmpPluginFile('project', '2.0.0', 'p3');
    tmpRoots.push(require('node:path').dirname(gFile), require('node:path').dirname(pFile));
    const globalPlugin = await loadPlugin(gFile);
    const projectPlugin = await loadPlugin(pFile);

    const gHooks = globalPlugin({ client: fakeClient(), directory: root });
    const pHooks = projectPlugin({ client: fakeClient(), directory: root });

    // owner ran
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    // non-owner emitted diagnostic
    expect(warnSpy).toHaveBeenCalled();
    const warnMsg = String(warnSpy.mock.calls[0][0]);
    expect(warnMsg).toContain('plugin-dedup-version-mismatch');
    expect(warnMsg).toContain('2.1.0');
    expect(warnMsg).toContain('2.0.0');

    const healthLog = join(root, '.agentic', 'kiki', 'health_log.jsonl');
    expect(existsSync(healthLog)).toBe(true);
    const entry = JSON.parse(readFileSync(healthLog, 'utf-8').trim().split('\n').pop()!);
    expect(entry.event).toBe('plugin-dedup-version-mismatch');
    expect(entry.ownerVersion).toBe('2.1.0');
    expect(entry.thisVersion).toBe('2.0.0');

    // non-owner hook is a no-op (does not append a routing line)
    await pHooks['tool.execute.before']({ tool: 'task' }, { args: { subagent_type: 'kiki-reviewer' } });
    const routingLog = join(root, '.agentic', 'kiki', 'routing_log.jsonl');
    expect(existsSync(routingLog)).toBe(false);
  });

  it('multi-root isolation: two roots each get an owner and an interval', async () => {
    const rootA = makeTmpRoot();
    const rootB = makeTmpRoot();
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(rootA); // cwd only affects routing-log path
    const fileA = tmpPluginFile('global', KIKI_VERSION, 'a');
    const fileB = tmpPluginFile('project', KIKI_VERSION, 'b');
    tmpRoots.push(require('node:path').dirname(fileA), require('node:path').dirname(fileB));
    const pluginA = await loadPlugin(fileA);
    const pluginB = await loadPlugin(fileB);

    pluginA({ client: fakeClient(), directory: rootA });
    pluginB({ client: fakeClient(), directory: rootB });

    expect(setIntervalSpy).toHaveBeenCalledTimes(2);
    const registry = (globalThis as any)[OWNERSHIP_KEY];
    expect(registry[rootA].scope).toBe('global');
    expect(registry[rootB].scope).toBe('project');
  });
});
```

> Notes for the implementer:
> - `require('node:path')` inside the test body works under vitest's ESM+CommonJS interop; if it causes issues, hoist a top-level `import { dirname as dirnameFn } from 'node:path'` and use `dirnameFn(file)`. Prefer the hoisted form to avoid lint noise.
> - The `setInterval` spy must be restored in `afterEach` (it is) so other tests' watchdogs are unaffected.
> - The `process.cwd()` spy is only set in cases that exercise the routing log; restore it in `afterEach` (guarded with `?.`).
> - If `loadPlugin`'s `await import(pathToFileURL(...).href)` caches modules across cases with the same file path, that's fine — each `tmpPluginFile` call generates a unique path (random suffix), so each is a fresh module.

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run tests/cli/plugin-dedup.test.ts`
Expected: PASS — all five `it` blocks pass. If any fail, debug via `systematic-debugging` before changing the implementation; the implementation (Task 3) is the source of truth for the contract these tests assert.

- [ ] **Step 3: Run the full suite to confirm no cross-test interference**

Run: `npm test`
Expected: PASS — the `setInterval`/`process.cwd`/`console.warn` spies are properly restored and do not leak into other tests.

- [ ] **Step 4: Commit**

```bash
git add tests/cli/plugin-dedup.test.ts
git commit -m "test: add behavioral dedup tests for global/project plugin coexistence"
```

---

## Task 5: Extend integration test for the global-scoped plugin `tsc` check

**Metadata:**
- risk: low
- parallel: true
- depends_on: ['Task 3']

**Files:**
- Modify: `tests/integration/watchdog-plugin-syntax.test.ts`

- [ ] **Step 1: Write the failing test**

Add a new `it` block inside the existing `describe('generated plugin file', ...)` in `tests/integration/watchdog-plugin-syntax.test.ts`, after the existing first test:
```ts
  it('global-scoped generated plugin is syntactically valid TypeScript', () => {
    const templates = generateAllTemplates(DEFAULT_CONFIG, 'global');
    const tmpDir = `tmp/watchdog-plugin-syntax-global-${Date.now()}`;
    try {
      mkdirSync(tmpDir, { recursive: true });
      const pluginPath = join(tmpDir, 'kiki-plugin-global.ts');
      writeFileSync(pluginPath, templates.plugin);
      execFileSync('npx', ['tsc', '--noEmit', '--skipLibCheck', '--module', 'esnext', '--target', 'es2020', '--moduleResolution', 'bundler', pluginPath], { stdio: 'pipe' });
    } finally {
      if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 60_000);
```

And extend the `writeOpencodeFiles` test to assert the global-scope stamping path is also exercised. Add after the existing `writeOpencodeFiles` test:
```ts
  it('writeOpencodeFiles with scope=global stamps KIKI_PLUGIN_SCOPE=global on disk', async () => {
    const { writeOpencodeFiles } = await import('../../src/cli/config');
    const tmpDir = `tmp/watchdog-write-files-global-${Date.now()}`;
    try {
      writeOpencodeFiles(tmpDir, DEFAULT_CONFIG, 'global');
      const { readFileSync } = await import('node:fs');
      const content = readFileSync(join(tmpDir, '.opencode', 'plugins', 'kiki.ts'), 'utf-8');
      expect(content).toContain("const KIKI_PLUGIN_SCOPE = 'global';");
      expect(content).toContain('function createWatchdog(deps)');
      expect(content).toContain('watchdog.start()');
      expect(content).toContain("Symbol.for('kiki.plugin')");
    } finally {
      if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run tests/integration/watchdog-plugin-syntax.test.ts`
Expected: PASS — both the existing project-scoped `tsc` check and the new global-scoped check pass (the inlined dedup code is valid non-strict TS), and the `writeOpencodeFiles(..., 'global')` on-disk assertions pass.

> These tests should pass immediately because Task 3 already implemented the generator changes. They are written *after* the implementation here only because Task 5 depends on Task 3; in strict TDD order they would have been written alongside Task 3's tests. They still act as a regression guard for the global scope.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/watchdog-plugin-syntax.test.ts
git commit -m "test: tsc-check the global-scoped generated plugin"
```

---

## Task 6: Final verification and idempotency

**Metadata:**
- risk: low
- parallel: false
- depends_on: ['Task 1', 'Task 2', 'Task 3', 'Task 4', 'Task 5']

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — every test file green, including `tests/cli/plugin-template.test.ts`, `tests/cli/plugin-dedup-source.test.ts`, `tests/cli/plugin-dedup.test.ts`, `tests/integration/watchdog-plugin-syntax.test.ts`, and all pre-existing CLI/config/install/update tests.

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: EXIT 0 — `tsc` compiles `src/` (including the new `src/plugin/dedup-source.ts`) with no errors. `dist/` is produced.

- [ ] **Step 3: Run the generated-plugin `tsc` check manually (belt-and-suspenders)**

Run:
```bash
node -e "const {generateAllTemplates, DEFAULT_CONFIG} = require('./dist/cli/config.js'); require('fs').writeFileSync('/tmp/kiki-global.ts', generateAllTemplates(DEFAULT_CONFIG, 'global').plugin); require('fs').writeFileSync('/tmp/kiki-project.ts', generateAllTemplates(DEFAULT_CONFIG, 'project').plugin);"
npx tsc --noEmit --skipLibCheck --module esnext --target es2020 --moduleResolution bundler /tmp/kiki-global.ts /tmp/kiki-project.ts
```
Expected: EXIT 0, no output. If the project's `dist` does not expose CommonJS (it's ESM), substitute:
```bash
node --input-type=module -e "import('file://' + process.cwd() + '/dist/cli/config.js').then(m => { require('node:fs').writeFileSync('/tmp/kiki-global.ts', m.generateAllTemplates(m.DEFAULT_CONFIG, 'global').plugin); require('node:fs').writeFileSync('/tmp/kiki-project.ts', m.generateAllTemplates(m.DEFAULT_CONFIG, 'project').plugin); });" && npx tsc --noEmit --skipLibCheck --module esnext --target es2020 --moduleResolution bundler /tmp/kiki-global.ts /tmp/kiki-project.ts
```
Expected: EXIT 0, no output. (This confirms the *built* artifact, not just the source, produces valid plugins — important because `installGlobal` runs from `dist/`.)

- [ ] **Step 4: Verify idempotency of `kiki init`/`kiki update`/`kiki install`**

Run in a throwaway temp project:
```bash
mkdir -p /tmp/kiki-idempotency && cd /tmp/kiki-idempotency
# init once (non-interactive: pipe answers or use --force as the CLI supports)
node --input-type=module -e "import('file://' + process.cwd() + '/../../lprojekte/kiki/dist/cli/index.js').then(m => m.main(['init','.']))" || true
# update twice
node /home/lutz/lprojekte/kiki/dist/cli/index.js update . 2>/dev/null || true
node /home/lutz/lprojekte/kiki/dist/cli/index.js update . 2>/dev/null || true
# compare the two plugin files written by successive updates — they must be byte-identical
diff /tmp/kiki-idempotency/.opencode/plugins/kiki.ts /tmp/kiki-idempotency/.opencode/plugins/kiki.ts && echo "idempotent: identical"
```
> Note: the exact CLI invocation depends on how `dist/cli/index.js` exposes `main`. If the binary is linked globally via `npm install -g .`, prefer `kiki init`, `kiki update .`, `kiki install --force`. The implementer should adapt the invocation to the local build but the *assertion* is fixed: two consecutive `kiki update .` runs produce byte-identical `.opencode/plugins/kiki.ts`, and `kiki install --force` produces a global plugin whose scope stamp is `'global'`. Verify the latter:
```bash
grep "const KIKI_PLUGIN_SCOPE" ~/.config/opencode/plugins/kiki.ts
```
Expected output: `const KIKI_PLUGIN_SCOPE = 'global';`
And for the project copy:
```bash
grep "const KIKI_PLUGIN_SCOPE" /tmp/kiki-idempotency/.opencode/plugins/kiki.ts
```
Expected output: `const KIKI_PLUGIN_SCOPE = 'project';`

- [ ] **Step 5: Run `kiki doctor`**

Run: `kiki doctor` (in the kiki repo itself, where `.agentic/kiki/config.json` exists)
Expected: EXIT 0, no errors. If `kiki doctor` validates the generated plugin or health config, confirm it does not flag the new dedup code.

- [ ] **Step 6: Final full-suite re-run after verification**

Run: `npm test`
Expected: PASS (confirms the manual verification steps did not mutate any tracked state that breaks tests).

- [ ] **Step 7: Commit (if any docs/test tweaks were needed during verification)**

If verification surfaced a fix (e.g., a stray `require` in a test), commit it:
```bash
git add -A
git commit -m "chore: verification fixes for plugin dedup"
```
Otherwise, no commit — Task 6 is verification only.

---

## Risks and Open Questions for the Implementer

1. **OpenCode's `directory` argument and load-order assumptions (spec §Risks).** The design keys ownership by `path.resolve(directory || process.cwd())` and relies on OpenCode loading global plugins before project plugins so the global copy is canonical. Both are *documented/observed* but not contractually guaranteed by OpenCode. The implementer **must** verify against a real both-installed project during implementation (per the task doc's "Real-world verification"): install globally (`kiki install --force`), `kiki init` in a scratch project, dispatch a `kiki-*` task, and confirm `.agentic/kiki/routing_log.jsonl` grows by exactly one line and the health log shows one incident per event. If OpenCode ever passes different `directory` values to the two instances, the dedup still produces exactly one owner *per root* but cross-scope dedup could weaken — this is acceptable per the spec and does not block the plan.

2. **`path` import change.** The spec's sample uses `path.resolve(...)` but the existing template imports only `{ join, dirname }` from `'path'`. This plan resolves it by importing `resolve` directly (`import { join, dirname, resolve } from 'path';`) and calling `resolve(directory || process.cwd())`. This keeps the generated plugin self-contained and does not change the `WATCHDOG_SOURCE` (which uses `join`/`dirname` only). The existing `tsc --noEmit` check covers the import.

3. **Template-literal safety of `DEDUP_SOURCE`.** Like `WATCHDOG_SOURCE`, `DEDUP_SOURCE` must contain no backticks and no `${` sequences. Task 2's test asserts this directly on the constant; Task 3's test asserts it on the inlined region of the generated template. **Caveat already flagged in Task 2 Step 3:** the illustrative `\\'` escaping in the diagnostic message string is wrong — single quotes inside a backtick literal do not need escaping; use plain `'kiki install --force'`. The implementer must use plain single quotes, not `\\'…\\'`.

4. **`KIKI_VERSION` drift.** `KIKI_VERSION` in `src/cli/config.ts` must match `package.json`. Task 1's unit test asserts equality at test time (tests have repo-root filesystem access, unlike a globally installed CLI). The release checklist note in `CHANGELOG.md` records the manual requirement. A future enhancement (out of scope here) could add a pre-release CI check.

5. **Non-owner hook names must track the owner.** The non-owner returns no-op `'tool.execute.before'` and `event`. If a future task adds a new hook to the owner branch, the non-owner branch must mirror it as a no-op. A code comment in the template (included in Task 3 Step 3) makes this requirement explicit. Reviewers should watch for this on future plugin changes.

6. **`setInterval` spy isolation in `tests/cli/plugin-dedup.test.ts`.** The test spies on the global `setInterval`. If restoration fails or a test throws before `afterEach`, other tests' watchdogs could be affected. The `afterEach` restores the spy; the implementer should confirm `npm test` is green end-to-end (Task 6 Step 1) — a leak would surface as failures in unrelated watchdog tests.

7. **Loading the generated plugin in tests.** This plan uses `await import(pathToFileURL(tmpFile).href)` under vitest, which transforms `.ts` via esbuild. Each `tmpPluginFile` call uses a unique random path, so each is a fresh module instance with its own baked `KIKI_PLUGIN_VERSION`/`KIKI_PLUGIN_SCOPE` — modeling two separate plugin files. If vitest's module cache ever returns a stale module for a reused path, the unique-suffix strategy prevents it. The implementer should not switch to Node's `vm` module: the generated plugin is TypeScript (interfaces, type annotations) and `vm` cannot parse it without a separate transform step.

8. **No spec-level blockers identified.** Every decision in the task doc and spec is resolved concretely by this plan. The two runtime assumptions in item 1 are documented and verifiable, not blocking.

---

## Verification Commands Summary

| What | Command | Expected |
|---|---|---|
| Unit + behavioral tests | `npx vitest run tests/cli/plugin-template.test.ts tests/cli/plugin-dedup-source.test.ts tests/cli/plugin-dedup.test.ts` | PASS |
| Integration syntax tests | `npx vitest run tests/integration/watchdog-plugin-syntax.test.ts` | PASS |
| Full suite | `npm test` | PASS |
| Build | `npm run build` | EXIT 0 |
| Generated-plugin tsc (from dist) | see Task 6 Step 3 | EXIT 0, no output |
| Idempotency | two `kiki update .` → `diff` identical; `grep KIKI_PLUGIN_SCOPE` global=`'global'`, project=`'project'` | matches |
| Doctor | `kiki doctor` | EXIT 0 |
