# Implementation Review — Global + Project Plugin Deduplication (2026-11-02)

**Reviewer:** Kiki Reviewer (implementation gate)
**Skill followed inline:** superpowers `receiving-code-review`
**Artifacts reviewed:**
- Plan: `docs/superpowers/plans/2026-11-02-global-project-plugin-dedup.md`
- Spec: `docs/superpowers/specs/2026-11-02-global-project-plugin-dedup-design.md`
- Task: `docs/tasks/2026-11-02-global-project-plugin-dedup.md`
- Plan review: `.agentic/reviews/2026-11-02-global-project-plugin-dedup-plan-review.md`
- Alignment: `.agentic/kiki/alignment.json`
- Code diff (full): `src/cli/config.ts`, `src/cli/commands/install.ts`, `src/plugin/dedup-source.ts` (new), `tests/cli/plugin-template.test.ts`, `tests/cli/plugin-dedup-source.test.ts` (new), `tests/cli/plugin-dedup.test.ts` (new), `tests/integration/watchdog-plugin-syntax.test.ts`, `dist/**` regenerated, plus two unrelated `.opencode/` files (see non-blocker #2).
- `package.json` version confirmed = `2.1.0` (matches `KIKI_VERSION`).

## Verdict

```
Verdict: PASS
Blockers:
(none)
```

## Verification summary

### Ownership gate correctness
- Registry at `globalThis[Symbol.for('kiki.plugin')]` keyed by `resolve(directory || process.cwd())`. `Symbol.for` (not `Symbol()`) so both plugin module instances share the slot. ✓
- `acquireOwnership` returns `null` when `registry[root]` is already set → exactly one owner per root. ✓
- Both the watchdog and the routing logger sit **behind the same gate**: the non-owner branch `return`s before `createWatchdog(...)` is ever called, so no second `setInterval` and no second routing-log writer can run for the same root. ✓
- Non-owner branch calls `getOwner(root)` and, when `owner.version !== KIKI_PLUGIN_VERSION`, calls `reportVersionMismatch` once, then returns no-op hooks. ✓
- Non-owner no-op hook keys mirror the owner's exactly: `'tool.execute.before'` and `event`. A code comment in the template makes the "keep in sync" requirement explicit. ✓
- Defensive `try/catch` around every `globalThis[KEY]` read; falsy / non-object values reset to `{}` (the spec's "non-object pre-set" edge case is handled). ✓

### Scope / version stamping
- `generatePluginTemplate(opts: { scope?; version? } = {})` defaults `scope='project'`, `version=KIKI_VERSION`. ✓
- `generateAllTemplates(config, scope='project', version=KIKI_VERSION)` threads both through to `generatePluginTemplate({ scope, version })`. ✓
- `writeOpencodeFiles(target, config, scope='project')` threads scope to `generateAllTemplates(config, scope)`. ✓
- `installGlobal()` calls `generateAllTemplates(DEFAULT_CONFIG, 'global')`; `installProject()` unchanged. ✓
- `init.ts` and `update.ts` untouched — default `'project'` preserves existing idempotency. ✓
- Backward compat: the pre-existing `const template = generatePluginTemplate();` (no args) at `plugin-template.test.ts:6` still passes; new assertions confirm it stamps `'project'` / `'2.1.0'`. ✓
- `KIKI_VERSION = '2.1.0'` matches `package.json` `"version": "2.1.0"`; the unit test `KIKI_VERSION matches the version in package.json` pins this at test time. ✓

### Version-mismatch diagnostic
- Best-effort: three independent `try/catch` channels (`console.warn`, `health_log.jsonl` append, `client.app.log`). No rethrow, no `error.stack`, no stack-trace leakage. ✓
- Matching versions stay silent — the `if (owner && owner.version !== KIKI_PLUGIN_VERSION)` guard skips `reportVersionMismatch` entirely. The "both same-version" test asserts `expect(warnSpy).not.toHaveBeenCalled()`. ✓
- Diagnostic payload contains only `event/root/ownerScope/ownerVersion/thisScope/thisVersion` — no secrets, no paths beyond the root that is already used as the registry key. ✓

### Template-literal safety / generated-plugin validity
- `DEDUP_SOURCE` contains no backticks and no `${` sequences — asserted both on the constant (`plugin-dedup-source.test.ts`) and on the inlined region of the generated template (`plugin-template.test.ts`, sliced from `interface OwnershipRecord` to `const DEFAULT_HEALTH`). ✓
- The generated plugin imports only `appendFileSync, existsSync, mkdirSync, readFileSync` from `fs` and `join, dirname, resolve` from `path`; `DEDUP_SOURCE` references only those plus the baked `KIKI_PLUGIN_VERSION` / `KIKI_PLUGIN_SCOPE` declared in the template before `${DEDUP_SOURCE}` is interpolated. Self-contained, zero external runtime deps. ✓
- `WATCHDOG_SOURCE` untouched; still uses only `join`/`dirname`. ✓
- Non-strict `tsc --noEmit --skipLibCheck --module esnext --target es2020 --moduleResolution bundler` passes for **both** the project-scoped and global-scoped generated plugin (existing + new `it` in `watchdog-plugin-syntax.test.ts`). The `writeOpencodeFiles(..., 'global')` on-disk test confirms `KIKI_PLUGIN_SCOPE = 'global'`, `createWatchdog`, `watchdog.start()`, and `Symbol.for('kiki.plugin')` all land on disk. ✓

### `\\'` escaping (plan-review non-blocking #3)
- The implementer kept `run \\'kiki install --force\\' and/or \\'kiki update <project>\\'` in `DEDUP_SOURCE`. Inside the outer backtick template literal, `\\'` emits the two characters `\'` into the generated plugin. The generated plugin then has `var message = '... run \'kiki install --force\' ...'` — `\'` inside a single-quoted JS string is a valid escaped single quote producing a literal `'`. The rendered message is `run 'kiki install --force' and/or 'kiki update <project>' to realign.` — correct.
- The plan-review's "plain single quotes" note was therefore **technically optional**, not a correctness bug (the plan-review's own non-blocking #3 already corrected the overstatement in the plan body). The `tsc` integration test confirms the generated plugin is valid TS with the `\\'` form. Non-blocking, cosmetic.

### Test quality
- All five required cases present in `plugin-dedup.test.ts`: global-only, project-only, both-installed same-version, version-mismatch, multi-root isolation. ✓
- Exactly-one interval: `expect(setIntervalSpy).toHaveBeenCalledTimes(1)` in global-only, project-only, and both-same-version cases. The `setInterval` spy returns `{ unref() {} }` so the watchdog's `interval.unref()` call works and no real timer is scheduled. ✓
- Exactly-one routing log line: `lines.length === 1` asserted in the same three cases; the both-same-version case fires **both** instances' `tool.execute.before` and still gets one line — this is the direct proof the non-owner is a no-op. ✓
- Tests would fail if dedup were removed: without the gate, the both-installed case would see 2 intervals and 2 routing lines; the version-mismatch case would not emit the warn / health_log. ✓
- Multi-root isolation: two distinct resolved roots each acquire ownership and start their own interval (`toHaveBeenCalledTimes(2)`); registry entries record the correct scopes. ✓
- `setInterval` / `process.cwd` / `console.warn` spies are installed in `beforeEach` and restored in `afterEach`; the shared `globalThis[OWNERSHIP_KEY]` is deleted before and after each case. No cross-test leak. ✓
- ESM loading via `await import(pathToFileURL(uniquePath).href)` with random-suffix temp files gives each generated scope/version its own module instance sharing the test process's `globalThis` — accurately models two plugin files in one OpenCode process. ✓

### Scope discipline / no unrelated refactors
- The dedup changes are limited to `KIKI_VERSION`, the ownership gate, scope/version threading, and the corresponding tests. No OpenCode core changes. ✓
- `init.ts`, `update.ts`, `installProject`, and the watchdog source are untouched. ✓
- `dist/**` regeneration is consistent with `src/` (verified `dist/cli/config.js` and `dist/plugin/dedup-source.js` reflect the source changes). ✓

### Security / alignment guardrails
- No hardcoded secrets; the diagnostic emits only scope/version/root strings. ✓
- No DB layer touched (parameterized-queries guardrail N/A). ✓
- No stack-trace leakage: every diagnostic channel is individually `try/catch`-guarded; no `error.stack` is read or written. ✓
- No unsafe `globalThis` assumptions that crash — all reads are `try/catch`-wrapped and non-object values are reset to `{}`. ✓

## Non-blocking recommendations

1. **Deferred plan step: CHANGELOG / release-checklist note (Task 1 Step 5).** The plan explicitly listed `CHANGELOG.md` as a file to modify in Task 1 (add an `### Added` entry under `## [Unreleased]` plus a release-checklist note that `KIKI_VERSION` in `src/cli/config.ts` must track `package.json`). The implementer deferred this to `kiki-historian`. The automated guard (the `KIKI_VERSION == package.json` unit test) IS in place, so the drift risk is bounded, but the **doc/checklist step itself must be handed to the historian explicitly**, not silently dropped. Flag for the orchestrator.

2. **Unrelated uncommitted changes present in the working tree.** `git diff HEAD --numstat` shows modifications to `.opencode/agents/kiki-orchestrator.md` (+2) and `.opencode/plugins/kiki.ts` (+355/-2). Neither is in the dedup implementer's reported file list. The orchestrator change is documentation-dispatch routing (`@kiki-historian`, `documentation.status` gating) — that is a **different task's** work. The `.opencode/plugins/kiki.ts` regeneration is a **stale, inconsistent** artifact: it has the watchdog inlined but uses `import { join, dirname } from 'path'` (no `resolve`), no `KIKI_PLUGIN_VERSION` / `KIKI_PLUGIN_SCOPE`, no `acquireOwnership` — i.e. it was NOT produced by the new generator (which would emit all of those). It must not be committed with the dedup work. The orchestrator / historian should segregate or discard these. Not a dedup code defect.

3. **`\\'` escaping in the diagnostic message** (plan-review non-blocking #3). Verified non-buggy: the emitted `\'` is valid inside the generated single-quoted JS string and produces the intended literal `'kiki install --force'` rendering; the `tsc` integration test confirms the generated plugin is valid TS. Cosmetic only — switching to plain `'kiki install --force'` would clean up the source string but is not required.

4. **Version-mismatch test's `expect(existsSync(routingLog)).toBe(false)` is weaker than it looks.** In that case the owner's `tool.execute.before` is never fired, so `routing_log.jsonl` would be absent regardless of whether the non-owner is a no-op. The "both same-version" test carries the actual no-op proof (both hooks fired, one line). Not a defect — just a slightly redundant assertion that could be strengthened by firing the owner's hook first and then asserting no second line from the non-owner.

5. **No dedicated test for the non-owner hook-key mirror invariant** (plan-review non-blocking #8). The owner and non-owner both return `tool.execute.before` + `event` today, and the existing tests indirectly cover this, but a focused unit test asserting the two branches return identical hook key sets would harden against future drift when a new hook is added to one branch and not the other. Optional.

6. **`reportVersionMismatch` writes the health-log to `join(directory, ...)` while the owner's watchdog writes to `join(root, ...)` (root = `resolve(directory || process.cwd())`).** In OpenCode's documented model `directory` is the absolute project root for both instances, so these coincide. This matches the spec's documented assumption and the plan-review's non-blocking #6. No action needed; keep the distinction in mind if OpenCode ever passes a relative `directory`.

7. **Independent re-verification was restricted by the environment.** The bash tool in this session only permits `git diff*` / `git log*`; I could not re-run `npm test`, `npm run build`, or lint myself. I relied on (a) the requestor's attested independent re-run (`npm test` → 145 passed / 16 files), (b) the implementer's build/lint claims, and (c) my own inspection of the full diff and the new source/test files. The `dist/` diff I inspected is consistent with `src/`. If the orchestrator wants a belt-and-suspenders re-run, it should be executed in an unrestricted shell.

## Conclusion

The implementation matches the plan and spec task-for-task. The ownership gate is correct (one owner per resolved root; watchdog + routing logger behind the same gate; no-op hooks mirror owner keys), scope/version stamping is threaded with full backward compatibility, the version-mismatch diagnostic is best-effort and silent on match, the generated plugin is self-contained and valid non-strict TS (both scopes), and the behavioral tests cover all five required cases and would fail if dedup were removed. No blockers. The two items the orchestrator must carry forward are the deferred CHANGELOG/release-checklist doc (hand to `kiki-historian`) and the segregation of the unrelated `.opencode/` working-tree changes from the dedup commit.
