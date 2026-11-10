# Task 7 review — package server setup, routing logger and lifecycle

Date: 2026-11-09
Reviewer: `kiki-reviewer` (independent spec + quality/security review)
Plan: `docs/superpowers/plans/2026-11-09-kiki-opencode2-migration-plan.md` (Task 7, lines 201–220; Global Constraints; Review Focus 5, items 1–5 of the Evidence section)
Spec: `docs/superpowers/specs/2026-11-09-kiki-opencode2-migration-design.md` §6.3, §11
Contract: `docs/migrations/kiki-3-oc2-api-contract.md` §3 (incl. 3.1–3.3)
Inputs reviewed: `/tmp/opencode/kiki-oc2-task7-report.md`, `/tmp/opencode/kiki-oc2-task7.diff` (2294 lines, read in full — 17 file diffs, exactly the reported task-owned set), and the actual tree: `src/server/{index,routing-logger,watchdog,watchdog-events}.ts`, `tests/plugin/{routing-logger,server-lifecycle,watchdog,watchdog-events}.test.ts`, `tests/cli/plugin-template.test.ts`, `tests/cli/release-gates.test.ts`, `tests/integration/watchdog-plugin-syntax.test.ts`, `src/cli/{config,opencode-config,release-gates}.ts` (on-disk content matches the diff for every file I opened), the disposable `/tmp/opencode/kiki-oc2-task7/tsconfig.server.json`, and the **installed** `@opencode/plugin@2.2.6` type declarations (`promise/{tool,registration,session}.d.ts`, nested `@opencode/client` generated `SessionListInput`/`ToolHooks`/`Registration`).

## Verdicts

- **Spec compliance: PASS**
- **Quality/security: PASS** — no blockers. Deferred observations in the last section; all are carried to Tasks 8/10/11/13 or are inert leftovers.

## 1. Verification I re-ran (not just read from the report)

| Check | Result | Report claim |
|---|---|---|
| `npx --no-install vitest run tests/plugin/{routing-logger,server-lifecycle,watchdog,watchdog-events}.test.ts tests/cli/plugin-template.test.ts tests/integration/watchdog-plugin-syntax.test.ts` (exact plan line 218 list) | 6 files / **95 passed** | 95 ✅ |
| Same 6 + `tests/cli/release-gates.test.ts tests/cli/release-gates-safety-spy.test.ts tests/cli/oc2-sdk-contract.test.ts` (extended set) | 9 files / **180 passed** | 180 ✅ |
| `npm run lint` | exit 0, no output | ✅ |
| `npx --no-install tsc --noEmit` (full tree, diagnostic only) | exit 2, **exactly the 15 known diagnostics, all in `src/tui/index.ts` / `src/tui/model-menu.ts`**; zero `src/server/*`, `src/cli/*` or other backend errors | ✅ byte-identical error list |
| `npx --no-install tsc --project /tmp/opencode/kiki-oc2-task7/tsconfig.server.json --noEmit` | exit 0, empty | ✅ |
| Same command without `--noEmit` | exit 0, empty | ✅ |
| Emitted disposable output | `server/{index,routing-logger,watchdog,watchdog-events}.{js,d.ts,map}` plus the imported `cli/` closure, **only** under `/tmp/opencode/kiki-oc2-task7/dist` | ✅ |
| Repo `dist/` | contains no `server/` (still the stale pre-Task-7 V1 build: `cli/ core/ plugin/ tui/`), `git status --porcelain dist` empty | "104 files, hash-identical" ✅ (hash re-computation is outside my command allowlist; `dist-before/after.sha256` evidence files exist and nothing contradicts them — no server emission, no git-visible change) |
| `npm audit --json` | **0 high / 0 critical / 32 moderate** — same vulnerability graph as the Task 4/5/6-reviewed state (`@vitest/mocker`/vitest 4.1.0, transitive `glob`/`minimatch`/`@npmcli/*`/`@opencode/util` chain); no dependency change in the task diff | ✅ report includes the audit line this time (prior reviewers' gap closed) |
| `git log` / `git status` | HEAD still `e2bf396`, **no commits**; `src/plugin/` gone; dirty set = pre-existing Task 2–6 files + the 17 Task 7 files; `routing_log.jsonl`/`TASK_REGISTRY.json` pre-existing/orchestrator-owned, outside the task diff | ✅ |
| Full suite | **not re-run** (evidence reuse per instruction); arithmetic consistency verified instead: 639→628 total and 579→568 passed = exactly the 11 deleted obsolete dedup tests; six-suite failure signature (doctor 14, global-policy 5, install 2, status 1, update 2, release suite-level tsc) identical to the Task 6 review's independent reproduction | ✅ consistent |

The disposable `tsconfig.server.json` satisfies the plan's requirements exactly: extends the unchanged checkout `tsconfig.json`, absolute `files: [<checkout>/src/server/index.ts]`, `include: []`, absolute `outDir` under `/tmp`, checkout-pinned `typeRoots`/`types` so `@types/node` resolves from the checkout while the config lives outside it. `package.json` declares `"./server"` → `dist/server/index.js` + `dist/server/index.d.ts` with `@opencode/plugin@2.2.6` in dependencies — declared export target names verified. Real package-consumer/binary resolution is correctly **not** claimed (Task 10/11).

## 2. SDK conformance of the new server plugin (verified against installed types, not just the contract doc)

- `export default Plugin.define({ id: 'kiki', setup })` with `setup: (ctx) => Promise<Plugin.Cleanup>` — matches contract §3 and the installed `Plugin.Plugin` shape; emitted `dist/server/index.js` (disposable) carries `export default Plugin.define({ id: 'kiki', setup })` and imports **only** `@opencode/plugin` (no `@opencode-ai/plugin`, no `src/plugin/*`, no V1 server imports). `tests/integration/watchdog-plugin-syntax.test.ts` now imports the real entrypoint and dependency closure — a stronger check than the retired tsc-on-generated-string test it replaces.
- **Ruling 1 (`startRoutingLogger` is async) is contract-correct, not an unapproved deviation.** Installed `registration.d.ts`: `Hooks<Spec> = <Name>(name, cb) => Promise<Registration>` with `Registration.dispose(): Promise<void>`. `ctx.tool.hook('execute.before', …)` **must** be awaited and its disposal is a promise; the plan's `() => void` shorthand is superseded by the Task 2 pinned contract (plan line 46 explicitly makes Task 2 signatures authoritative over plan snippets). The setup path awaits it; the returned disposer is idempotent and awaited by cleanup.
- Hook event shape: installed `ToolHooks["execute.before"] = { tool: string; sessionID; agent; messageID; id; input: unknown }` — the logger narrows `event.tool !== 'subagent'` and treats `event.input` as `unknown` exactly as the contract prescribes; subagent input fields `{agent, description, prompt, model?}` per contract §3.1.
- **Ruling 2 (pagination/location) verified against the installed generated client types:** `SessionListInput = { limit?; order?; search?; parentID?; archived?; directory?; project?; subpath?; cursor? }`. The adapter's `list({limit, archived: false, directory, cursor})` calls are real SDK fields; `SessionsResponse` carries `cursor.next`. Client-side archived/location filtering plus the seen-cursor/seen-id guards make discovery robust even if a server ignored the optional filters (the report's cost-if-wrong statement is accurate).
- `ServerContext` canonical derivation `Parameters<typeof Plugin.define>[0]['setup'] extends (ctx: infer C) => unknown ? C : never` lives in `src/server/index.ts`; the duplicate alias in `watchdog-events.ts` was removed (Task 6 review note 4 resolved); the `oc2-sdk-contract.test.ts` compile-time proof that it equals `Plugin.Context` still passes (in my 180-test run).

## 3. Routing logger — security and spec requirements (plan bullet 214)

All six assertions of the bullet are implemented and tested (`tests/plugin/routing-logger.test.ts`, all use `mkdtemp` OS temp roots):

- Dispatch `{agent:'kiki-reviewer', description:'Review migration safety', prompt:'TOP-SECRET-PROMPT', model:…}` appends **only** `{timestamp, agent, model}` — the test asserts the exact key set `['agent','model','timestamp']` and that both sentinel strings never appear in the serialized log.
- No model → `'unknown'`; explicit model retained.
- Unrelated tools, non-`kiki-` agents, agent-less input, and `null` input are ignored without writing a log.
- Caller input is untouched (deep-equal against a `structuredClone` baseline; the handler only reads).
- Root comes from `ctx.location.directory` — proven by the decoy test that mocks `process.cwd()` to a different temp dir and asserts the decoy gets no log. (V1's `process.cwd()` root is gone.)
- Write failures are swallowed (`catch`) so routing diagnostics can never fail a dispatch; the hook early-returns after disposal (no post-dispose write), and disposal is idempotent with exactly one `dispose()` call.

## 4. Lifecycle, cancellation and bounded shutdown (plan bullets 215/219; Review Focus 5, Task 7 slice)

`src/server/index.ts`:

- **Partial setup failure:** the logger is acquired first; any later failure (adapters, `subscribe` throw) enters `catch { await dispose(); throw }` — tested with a throwing `subscribe` (hook disposed, interval cleared).
- **Idempotent cleanup:** single `disposal` promise latch; repeated `cleanup()` disposes the hook once, returns the iterator once — tested.
- **Reload ownership:** setup→cleanup→setup leaves exactly one active hook and one open stream; all state is closure-scoped (no `globalThis`, no `registration.dispose()` ownership shim — spec §6.3). Duplicate *concurrent* setup remains OC2 registry's responsibility, as the plan states; the one-source doctor diagnostic is Task 8 (already in its test matrix) and duplicate-registration diagnosis is Task 11.
- **Cancellable idle subscription:** `ctx.event.subscribe({ signal: controller.signal })` per contract §3.2; cleanup aborts the controller, calls `iterator.return()`, and awaits the stream loop.
- **Bounded shutdown:** `settleWithin` caps the iterator/stream-loop waits at 250 ms and `watchdog.stop()` at 1000 ms; its timeout timer is `unref()`'d so it can never keep the process alive; the "stubborn stream" test (a `return()` that never resolves) confirms cleanup still completes.
- **No resurrect:** a terminal event delivered mid-abort-loop can no longer trigger a stale second interruption — `runTick` re-checks `sessions.has(state.sessionId)` before each `abortSession` (exactly the one-line hardening Task 6 review note 2 requested, plus a regression test). Late stream events after cleanup and pending discovery resolving after cleanup produce no interrupts and no health writes (both tested); the watchdog's `stopped` latch (cleared interval synchronously, in-flight tick awaited, post-stop writes suppressed) is preserved from Task 6.
- **No unhandled rejections / no leaked errors:** the stream loop wraps its entire body in try/catch (never rejects); `settleWithin` attaches `then(finish, finish)` synchronously to every promise it bounds; `scheduleTick` has a `.catch`; `stopLogger`'s disposal catches; `abortSession` catches and logs only the constant `'interrupt failed'` (Task 6 sanitization intact); the health writer and routing writer swallow write failures. Health entries remain `{level, timestamp, sessionId, agent, reason, elapsedMs, silentMs}` — no upstream/config/provider data.

## 5. Health config (plan bullet 217)

`loadHealthConfig` reads **only** `<ctx.location.directory>/.agentic/kiki/config.json` (`raw.health`), no global or cwd fallback; `sanitizeHealth` replicates the V1 runtime field-by-field (I compared it line-by-line against the deleted V1 template body in the diff: boolean gates for `watchdogEnabled`/`watchAllSubagents`, non-empty `logPath`, `isPositiveInt` for the four timers, `loopRepeatCount` integer ≥ 2 — plus a new array guard, strictly narrower). Tests: all-invalid input returns exactly `DEFAULT_HEALTH`; valid overrides merge. Health log format is unchanged (`level`+`timestamp`+entry, written under the project root, custom `logPath` honored).

## 6. Task 6 carried concerns — closure audit

| Task 6 review concern | Task 7 disposition |
|---|---|
| 1. `session.list` pagination / page cap could hide older children | Closed: `cursor.next` loop with seen-cursor and seen-id guards, explicit `limit: 100`; tested (two-page fixture; repeated-cursor fixture stops paging). SDK field verified (§2 above). Real-binary confirmation remains Task 11 as planned. |
| 2. Mid-abort-loop terminal delivery | Closed: the suggested guard + regression test (`does not interrupt a child that finished while an earlier interrupt was in flight`). |
| 3. Subscription wiring / awaited `watchdog.stop()` | Closed: `index.ts` owns subscribe/AbortSignal/iterator.return and the bounded awaited stop (§4). |
| 4. Duplicate `ServerContext` alias | Closed: canonical alias in `src/server/index.ts`; `watchdog-events.ts` alias removed; no other importer existed (grep-verified — only `src/server/*` and the new tests import it). |

## 7. V1 removal, coupled edits and test-weakening assessment

- Deleted: `src/plugin/{watchdog-source,dedup-source}.ts`, the `generatePluginTemplate`/package-json/gitignore templates and scope/version plumbing, and the two obsolete dedup test files — **after** replacement coverage existed (lifecycle one-active-logger/watchdog, idempotent disposal, reload ownership, no-post-cleanup effects). The V1 dedup machinery's *safety outcome* (one active instance per root) is now owned by OC2's registry (spec §6.3) and re-tested through the setup/cleanup lifecycle. `tests/cli/plugin-template.test.ts` positively asserts the V2 agent/workflow-only template set and the absence of V1 APIs/source strings; `globalThis`/`Symbol.for('kiki.plugin')` are asserted absent.
- `src/cli/opencode-config.ts`: dropping the `plugins/kiki.ts` write is required for the tree to compile (the template no longer exists); the rest of V1 install/update behavior is left for Task 8 per plan line 220's deferral rule. Ruling 5 documents exactly this.
- `src/cli/release-gates.ts`: the generated-plugin stamp check consumed a retired artifact (`generateAllTemplates(...).plugin` would be `undefined`); its removal together with the now-unused `execFile`/`promisify`/`defaultRunner` plumbing is a necessary coupled edit under "Remove obsolete generator fields/consumers together" (plan line 220). **No weakening:** version synchronization is still gated by `KIKI_VERSION === package.json` (plugin-template test) and the release-gates version/export/invariant tests (which passed in my 180-test run); the removed test case could only test a string that no longer exists. Task 13 adds the server-artifact invariant in the already-scoped release-gate change.
- Removed 11 dedup tests account exactly for the full-suite count delta (639→628 / 579→568) with the same six-suite pre-existing failure signature — no other suite's results changed.

## 8. Boundary compliance

No commits (HEAD `e2bf396`), no build to repo `dist` (scoped emit went only to the disposable `/tmp` outDir; repo `dist` untouched and unchanged), no installs, no global/user config edits, no secret-bearing file reads (all fixtures synthetic; `mkdtemp` roots), no registry edits by the implementer (registry/task-log files are pre-existing or orchestrator-owned and outside the task diff), no code fixes by this reviewer, no real-binary/package acceptance claimed. Task 7 is released on scoped green plus the explicit 15-diagnostic `src/tui/*` deferral, as the plan prescribes; Tasks 10/11 must close it.

## Non-blocking notes / deferred observations

1. **`src/cli/opencode-config.ts:508`** still excludes `plugins/kiki.ts` from update-time cleanup although nothing writes it anymore — a stale V1-generated plugin file in an existing install is now spared instead of removed. Task 8's install/update redesign (which already owns "remove remaining V1 install prompt/loader behavior") should decide removal; also note `src/cli/commands/{status,doctor}.ts` still report the V1 `plugins/kiki.ts` (their suites are among the known-red Task 2–5 deferrals).
2. **`tests/cli/release-gates.test.ts`** retains the now-inert `pluginVersion` plumbing in `fakeConfigModule`/`prepareInvariantCandidate` (the only consumer, the stamp test, is gone). Harmless; prune it when Task 13 adds the server-artifact invariant tests so the helper's dead parameter doesn't suggest a live gate.
3. **Stream-loop error containment:** a throwing `watchdog.handle`/`decodeWatchdogEvent` would be swallowed by the loop's generic catch and silently end event processing (no crash, no unhandled rejection). Both functions are internal and defensive (Task 6 tested), so this is theoretical; noting it so Task 11's real-binary watchdog trip implicitly covers the live path.
4. **Repo `dist/` still contains stale V1 artifacts** (`dist/plugin/*.d.ts` etc.) — required to remain byte-unchanged by this task's constraints; Task 10's full build regenerates it and Task 11's manifest captures it.
5. **Hash evidence** (`dist-before/after.sha256`, `evidence.sha256`, `files.sha256`) exists in `/tmp/opencode/kiki-oc2-task7/`; my command allowlist excludes hash recomputation, so I verified the load-bearing consequences instead (no `dist/server` emission, clean git status for `dist`). If the orchestrator wants hash equality independently confirmed, it needs a shell with `sha256sum` allowed.
6. **`archived: false` + `directory` discovery filters** are verified against the installed SDK types and double-protected by client-side filtering; the report correctly does not claim real-binary behavior — Task 11's live watchdog trip confirms them.

## Parallelization / dependency check (checklist)

Task 7 metadata: `risk: medium`, `parallel: false`, `depends_on: ['Task 4', 'Task 6']` — both released (Task 4 PASS/PASS, Task 6 PASS/PASS). No circular chain. File ownership: Task 7's edits to `src/server/{watchdog,watchdog-events}.ts` and `tests/plugin/watchdog.test.ts` (Task 6's files) are the Task 6 review's explicitly assigned follow-ups (concerns 1, 2, 4) — no concurrent task touches them (Task 9 owns `src/tui/*`, untouched; Task 8 not started). All referenced exports exist (`startRoutingLogger`, `createWatchdog`, `createWatchdogSessionAdapter`, `decodeWatchdogEvent` asserted live by the syntax test); `generateAllTemplates`' remaining callers compile (full-tree tsc clean outside TUI).
