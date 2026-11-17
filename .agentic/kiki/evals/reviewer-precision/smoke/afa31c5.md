# Smoke case `afa31c5` — health config validation (form-only test)

**Non-metric smoke only.** Not scored, not gated, not counted.

- **Introducer:** `10912e6` — "feat: integrate subagent watchdog into generated kiki plugin"
- **Fix:** `afa31c5` — "fix: validate health config values, fall back to defaults on invalid
  input"
- **Base for smoke replay:** `10912e6` (apply nothing; the change is HEAD)
- **Frozen change:** `git diff 10912e6^ 10912e6 -- src tests`
- **Why not ground truth:** the fix's added test asserts only that a template string contains a
  function name — form, not behavior. It is documented here as an example of insufficient proof.

## Neutral task prompt

> Review the attached change integrating the subagent watchdog into the generated plugin and
> agent configuration in the provided repository context.

Do not mention validation, fallback, the defect, the fix or expected verdict.

## Frozen diff (src+tests only)

```diff
diff --git a/src/cli/config.ts b/src/cli/config.ts
index f509b81..a712363 100644
--- a/src/cli/config.ts
+++ b/src/cli/config.ts
@@ -1,6 +1,7 @@
 import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
 import { join, dirname } from 'path';
 import type { StaticRoutingTable } from '../types.js';
+import { WATCHDOG_SOURCE } from '../plugin/watchdog-source.js';
 
 export interface KikiPaths {
   source: string;
@@ -527,16 +528,34 @@ ${responsibilities}
 }
 
 export function generatePluginTemplate(): string {
-  return `import { appendFileSync, existsSync, mkdirSync } from 'fs';
+  return `import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
 import { join, dirname } from 'path';
 
+${WATCHDOG_SOURCE}
+
+const DEFAULT_HEALTH = ${JSON.stringify(DEFAULT_HEALTH, null, 2)};
+
+function loadHealthConfig(directory: string) {
+  try {
+    const raw = JSON.parse(readFileSync(join(directory, '.agentic', 'kiki', 'config.json'), 'utf-8'));
+    return Object.assign({}, DEFAULT_HEALTH, raw.health || {});
+  } catch {
+    return Object.assign({}, DEFAULT_HEALTH);
+  }
+}
+
 interface RoutingLogEntry {
   timestamp: string;
   agent: string;
   model: string;
 }
 
-export default function KikiPlugin({ client }: { client: any }) {
+export default function KikiPlugin({ client, directory }: { client: any; directory: string }) {
+  const root = directory || process.cwd();
+  const health = loadHealthConfig(root);
+  const watchdog = createWatchdog({ client, directory: root, config: health, now: () => Date.now() });
+  watchdog.start();
+
   return {
     'tool.execute.before': async (input: any, output: any) => {
       if (input.tool !== 'task') return;
@@ -553,6 +572,9 @@ export default function KikiPlugin({ client }: { client: any }) {
         model: output.args?.model ?? 'unknown',
       };
       appendFileSync(logPath, JSON.stringify(entry) + '\\n');
+    },
+    event: async ({ event }: { event: any }) => {
+      watchdog.handleEvent(event);
     }
   };
 }
diff --git a/tests/cli/install.test.ts b/tests/cli/install.test.ts
index 98c97af..4ae8fae 100644
--- a/tests/cli/install.test.ts
+++ b/tests/cli/install.test.ts
@@ -1,6 +1,7 @@
 import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
 import fs from 'node:fs/promises';
 import path from 'node:path';
+import { DEFAULT_HEALTH } from '../../src/cli/config';
 
 describe('cli install', () => {
   let tmpDir: string;
@@ -58,7 +59,9 @@ describe('cli install', () => {
           models: {
             standard: 'moonshotai/kimi-k2.6',
             critical: 'anthropic/claude-sonnet-4.6',
+            workhorse: 'deepseek/deepseek-v4-pro',
           },
+          health: { ...DEFAULT_HEALTH },
         }),
       };
     });
diff --git a/tests/cli/plugin-template.test.ts b/tests/cli/plugin-template.test.ts
new file mode 100644
index 0000000..56282ff
--- /dev/null
+++ b/tests/cli/plugin-template.test.ts
@@ -0,0 +1,37 @@
+import { describe, it, expect } from 'vitest';
+import { generatePluginTemplate, DEFAULT_HEALTH } from '../../src/cli/config';
+
+describe('generatePluginTemplate', () => {
+  const template = generatePluginTemplate();
+
+  it('inlines the watchdog source', () => {
+    expect(template).toContain('function createWatchdog(deps)');
+  });
+
+  it('bakes in the default health config', () => {
+    expect(template).toContain('"stuckThresholdMs": 300000');
+    expect(template).toContain('"absoluteMaxMs": 3600000');
+    expect(template).toContain(String(DEFAULT_HEALTH.loopRepeatCount));
+  });
+
+  it('starts the watchdog and wires the event hook', () => {
+    expect(template).toContain('watchdog.start()');
+    expect(template).toContain('watchdog.handleEvent(event)');
+  });
+
+  it('keeps the routing logger for kiki task dispatches', () => {
+    expect(template).toContain("input.tool !== 'task'");
+    expect(template).toContain("subagentType.startsWith('kiki-')");
+    expect(template).toContain('routing_log.jsonl');
+  });
+
+  it('loads runtime health config from .agentic/kiki/config.json', () => {
+    expect(template).toContain('loadHealthConfig');
+    expect(template).toContain(".agentic', 'kiki', 'config.json");
+  });
+
+  it('creates the watchdog with client, directory, config, and now', () => {
+    expect(template).toContain('createWatchdog({');
+    expect(template).toContain('now: () => Date.now()');
+  });
+});
```
