# Plan Review — Global + Project Plugin Deduplication (2026-11-02)

**Reviewer:** Kiki Reviewer (architect gate)
**Artifacts reviewed:**
- `docs/superpowers/plans/2026-11-02-global-project-plugin-dedup.md`
- `docs/superpowers/specs/2026-11-02-global-project-plugin-dedup-design.md`
- `docs/tasks/2026-11-02-global-project-plugin-dedup.md`
- `.agentic/kiki/alignment.json`
- Source inspected: `src/cli/config.ts`, `src/cli/commands/install.ts`, `src/cli/commands/update.ts`, `src/plugin/watchdog-source.ts`, `tests/cli/plugin-template.test.ts`, `tests/integration/watchdog-plugin-syntax.test.ts`, `tsconfig.json`, `package.json`, `CHANGELOG.md`, `src/cli/commands/init.ts`, `src/cli/commands/doctor.ts`

## Verdict

```
Verdict: PASS
Blockers:
(none)
```

## Verification summary

**Alignment guardrails**
- No hardcoded secrets: the plan adds only `KIKI_VERSION`, `KIKI_PLUGIN_SCOPE`, `KIKI_PLUGIN_VERSION`, resolved roots, scope/version strings — none secret. ✓
- Parameterized DB queries: N/A (no DB layer touched). ✓
- No stack-trace leakage: `reportVersionMismatch` writes only a fixed message string and a JSON object with `event/root/ownerScope/ownerVersion/thisScope/thisVersion` — no `error.stack`, no `try/catch` rethrow. Each channel is individually `try/catch`-guarded. ✓

**Dedup mechanism / ownership gate**
- Registry at `globalThis[Symbol.for('kiki.plugin')]` keyed by resolved root; `acquireOwnership` returns `null` if `registry[root]` already set; non-owner branch calls `getOwner`, emits a one-time mismatch diagnostic when `owner.version !== KIKI_PLUGIN_VERSION`, then returns no-op hooks. ✓
- Owner branch runs the existing watchdog + routing-logger body unchanged. Single `setInterval` per owner (watchdog's `start()` is per-instance idempotent; one interval per acquired root). ✓
- `Symbol.for` (not `Symbol()`) ensures both plugin module instances share the registry slot even when loaded as separate ES modules. ✓
- Defensive `try/catch` around `globalThis[KEY]` read handles the spec's "non-object pre-set" edge case. ✓
- Multi-root: each distinct resolved root gets its own owner — verified in Task 4's "multi-root isolation" case. ✓

**Template-literal safety / generated-plugin validity**
- `DEDUP_SOURCE` is a backtick string with no backticks/`${` inside (asserted in Task 2's test on the constant and Task 3's test on the inlined region). ✓
- The generated plugin imports `appendFileSync, existsSync, mkdirSync, readFileSync` from `fs` and `join, dirname, resolve` from `path`; `DEDUP_SOURCE` only references those plus the baked `KIKI_PLUGIN_VERSION`/`KIKI_PLUGIN_SCOPE` declared in the template before `${DEDUP_SOURCE}`. ✓
- The `WATCHDOG_SOURCE` is untouched and still only uses `join`/`dirname`. ✓
- Non-strict `tsc --noEmit --moduleResolution bundler` check (Task 5 + existing test) covers both `'global'` and `'project'` scopes. The literal-typed `const KIKI_PLUGIN_SCOPE = 'global' | 'project'` is assignable to `OwnershipRecord.scope: 'global' | 'project'`; `KIKI_PLUGIN_VERSION` literal is assignable to `string`. The build (`tsc` strict over `src/`) compiles `dedup-source.ts` because it is just a string export. ✓

**Test coverage**
- Task 4 covers all five required cases: global-only, project-only, both-installed (same version), version mismatch, multi-root isolation. ✓
- "Exactly one routing log line and one watchdog interval": `setIntervalSpy.toHaveBeenCalledTimes(1)` and `lines.length === 1` asserted in global-only, project-only, and both-same-version cases. ✓
- Version-mismatch case asserts `console.warn`, `health_log.jsonl` entry, and that the non-owner's `tool.execute.before` does NOT create `routing_log.jsonl`. ✓
- `setInterval` spying via `vi.spyOn(globalThis, 'setInterval').mockImplementation(() => ({ unref() {} }))` correctly prevents real timers and counts exactly one call per owner (watchdog `start()` calls `setInterval` once, then `interval.unref()`). ✓
- ESM/vitest temp-file import via `await import(pathToFileURL(abs).href)` with unique random suffixes avoids module-cache reuse so each generated scope/version is a distinct module instance sharing the test process's `globalThis` — models the real two-copies-in-one-process scenario. ✓

**Parallelization metadata**
- No circular `depends_on`. ✓
- All referenced tasks exist (Task 1–6). ✓
- Parallel-safe: Task 1 (files: `src/cli/config.ts`, `tests/cli/plugin-template.test.ts`, `CHANGELOG.md`) and Task 2 (files: `src/plugin/dedup-source.ts`, `tests/cli/plugin-dedup-source.test.ts`) — no file overlap. ✓
- Task 3 depends_on `['Task 1','Task 2']`, `parallel: false` — correctly sequential because it re-modifies `src/cli/config.ts` and `tests/cli/plugin-template.test.ts` (same files as Task 1). ✓
- Task 4 (`tests/cli/plugin-dedup.test.ts`) and Task 5 (`tests/integration/watchdog-plugin-syntax.test.ts`) both depend on Task 3 and are parallel-safe — no file overlap. ✓
- Task 6 depends on all and is `parallel: false` (verification only). ✓

**Scope discipline**
- No unrelated refactors: changes are limited to `KIKI_VERSION`, the dedup gate, scope/version threading, and the corresponding tests. ✓
- No changes to OpenCode core. ✓
- `init.ts` calls `writeOpencodeFiles(targetPath, config)` (line 209) — unchanged, default scope `'project'` preserves idempotency. ✓
- `update.ts` unchanged (default `'project'` correct). ✓
- `installGlobal` gains `'global'` scope; `installProject` unchanged (does not generate the plugin). ✓
- `kiki doctor` only checks the plugin file exists (no content validation that the dedup code would trip). ✓

**Plan-step compile/pass check**
- `path` import fix: correctly applied only to the *generated* template's import line (not `config.ts`'s own imports — `config.ts` does not use `resolve`). ✓
- ESM/vitest temp-file import approach (Task 4): sound; unique random suffixes prevent module-cache hits. ✓
- `setInterval` spying (Task 4): sound; the mock returns an object with `unref()` so the watchdog's `interval.unref()` call works. ✓
- Backward compat: `generatePluginTemplate()` with no args still returns a valid template (default `scope='project'`, `version=KIKI_VERSION`); the existing `const template = generatePluginTemplate();` at line 6 of `plugin-template.test.ts` keeps working. ✓
- `tsconfig.json` strict + `noUnusedLocals`/`noUnusedParameters`: the new `src/plugin/dedup-source.ts` is a single string export — no unused locals. Catch-clause variables in the inlined string are inside the string body and not compiled. ✓

## Non-blocking recommendations for the implementer

1. **Task 3 Step 1 test code uses `await import(...)` inside non-`async` `it` callbacks** — that is a syntax error as written. The plan's own note already directs you to use the static-import form (`import { generateAllTemplates, DEFAULT_CONFIG, ... } from '../../src/cli/config';` at the top of the file, then call directly). Follow that directive; do not paste the `await import` snippets verbatim. Mark the `it` callbacks `async` only if you keep the dynamic import (unnecessary here).

2. **Task 4 uses `require('node:path')` inside test bodies.** Under `"type": "module"` + vitest, `require` interop usually works but is noisy. The plan already recommends hoisting a top-level `import { dirname } from 'node:path'` — do that to avoid lint/runtime ambiguity.

3. **Task 2 Step 3 `DEDUP_SOURCE` uses `\\'` escaping** in the diagnostic message (`run \\'kiki install --force\\' and/or \\'kiki update <project>\\'`). The plan's note correctly says to use plain single quotes (`'kiki install --force'`) because single quotes inside a backtick template literal do not need escaping. Note: even if left as `\\'`, the emitted `\'` inside a single-quoted JS string is *valid* (escaped single quote), so this is cosmetic, not a correctness bug — but apply the fix anyway since the plan calls for it and it keeps the diagnostic message clean.

4. **Task 6 Step 4 idempotency check is broken as written:** `diff /tmp/kiki-idempotency/.opencode/plugins/kiki.ts /tmp/kiki-idempotency/.opencode/plugins/kiki.ts` compares a file against itself and is always identical. Capture a backup after the first update (e.g. `cp .../kiki.ts /tmp/kiki-before.ts`) and diff against that after the second update. This is verification-only and does not affect the code, but a vacuous pass gives false confidence.

5. **File Structure overview (plan lines 22–24) omits `tests/cli/plugin-dedup-source.test.ts`** (Task 2's test file). Minor doc inconsistency; Task 2 itself is clear about the file. Add it to the overview for completeness.

6. **`reportVersionMismatch` writes the health-log to `join(directory, ...)` while the owner's watchdog writes to `join(root, ...)` (resolved).** In OpenCode's documented model `directory` is the absolute project root for both instances, so these coincide. This matches the spec's documented assumption. No action needed, but keep the `directory`-vs-`root` distinction in mind if OpenCode ever passes a relative `directory`.

7. **Routing log still keys off `process.cwd()`, not the ownership root.** This is pre-existing behavior and intentionally unchanged by this plan. In the multi-root test (Task 4) the second owner's routing log would land in `process.cwd()`'s path, not `rootB` — the test correctly avoids asserting on routing logs in that case. If you want per-root routing logs in the future, that is a separate change.

8. **Non-owner hook contract drift.** The plan's template comment makes the "mirror new hooks as no-op" requirement explicit. Reviewers of future plugin changes should enforce this; consider adding a unit test that asserts the owner and non-owner return the same set of hook keys (currently both return `tool.execute.before` + `event`).
