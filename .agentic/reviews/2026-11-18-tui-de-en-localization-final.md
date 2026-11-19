# Final Diff Review — TUI DE/EN Localization + Global Override Marker

**Date:** 2026-11-18 · **Reviewer:** Kiki Reviewer (independent) · **Builder session:** ses_e11e4570effejyyNrDeSWBHidM
**Artifacts:** no persistent spec/plan (user-requested lightweight workflow, scope approved in conversation)

## Verdict: PASS_WITH_NOTES

**Basis:** Read the full task diff (`src/tui/{strings,model-menu,index}.ts`, `tests/tui/{strings,model-menu,setup}.test.ts`, `tests/integration/fixtures/kiki-tui-smoke.py`, all `dist/tui` outputs) against the conversation-approved scope: all visible Kiki TUI strings DE/EN; LC_ALL > LC_MESSAGES > LANG first nonempty; German for `de`/`de_*`/`de-*`, English otherwise incl. unset/C/POSIX; startup resolution only, no manual config or live switching; global rows with `projectOverride !== undefined` append exact `(lokal überschrieben)` / `(locally overwritten)`, stackable with the inherited marker, no project-row marker; no CLI/server localization, no identifier changes, dependencies, or permission changes. Guardrails per `.agentic/kiki/alignment.json` checked. Builder evidence judged as recorded; nothing re-run.

## Verified against the diff

- **Locale handling** (`src/tui/strings.ts:129-137`): exact approved rule — first non-empty of LC_ALL/LC_MESSAGES/LANG, trimmed, lowercased, `.`/`@` suffix stripped, `de`/`de_`/`de-` → German, otherwise English; empty/unset fall through to the next variable. Resolved once in `setup()` (`src/tui/index.ts:90-92`) and passed to `registerKikiMenu`; no config surface, no live switching. `registerKikiMenu`'s optional `language` defaulting to `resolveTuiLanguage(process.env)` matches the builder's stated design; `setup` always passes it explicitly.
- **Marker feature** (`src/tui/model-menu.ts:238-239`): `scope === 'global' && row.projectOverride !== undefined` appends the exact marker after a possible inherited marker; project rows carry no marker. Semantics verified against `listAgentModels` (`src/cli/opencode-config.ts:330`): global rows get `projectOverride: projectModel` (`string | undefined`), so `!== undefined` is exactly the requested condition. Stacking `(geerbt) (lokal überschrieben)`, override-only, inherited-only, no-marker project rows, and the English marker are all covered by `tests/tui/model-menu.test.ts:262-299`.
- **Translation completeness:** all German dictionary entries are verbatim-identical to the pre-change hardcoded literals (compared each removed literal in the diff against `strings.ts`); parity and non-empty-copy tests enforce de/en key/type parity (`tests/tui/strings.test.ts:46-60`). English copy is complete and idiomatic. No German strings remain in `src/tui` outside `strings.ts` (grep-verified).
- **Compatibility:** `SETUP_ERROR_MESSAGE` retained with the identical German value via `tuiStrings('de').setupError`; runtime toast is localized. `LocationNotReadyError` and other identifiers untouched.
- **Scope:** `src/cli` untouched (its German error strings remain, correctly — no CLI/server localization); no new dependencies, persistence, or permissions. Unrelated preexisting README/opencode.jsonc/TASK_REGISTRY diffs are not from this task and were left intact. Necessity: the change adds no dependency and no persistence; one dependency-free dictionary module is the smallest sufficient shape for the approved request; the fixture's Python mirror of the resolution rule is bounded, documented duplication needed for an independent end-to-end oracle.
- **Guardrails:** catch paths show fixed localized copy only; the new English test additionally asserts the error toast does not contain thrown fixture details. No secrets, no DB, no stack-trace leakage.
- **Dist consistency (read directly):** `dist/tui/{strings.js, strings.d.ts, index.js, index.d.ts, model-menu.js, model-menu.d.ts}` all match the src changes line-for-line in substance (marker line, language param, localized copy, `SETUP_ERROR_MESSAGE` retention); source maps regenerated. The focused run's SDK-host entrypoint test additionally asserts `dist/tui/index.js` resolves through the pinned host.
- **Evidence (judged as recorded, not re-run):** RED → GREEN sequence recorded; final focused `npx --no-install vitest run tests/tui tests/integration/kiki-tui.test.ts` EXIT 0, 65 passed, 1 real-PTY binary-gated skip — the skip claim is structurally honest (`describe.skipIf(!hasOC2Binary())` at `tests/integration/kiki-tui.test.ts:43`) and no real-PTY success was claimed. `npm run build`/`lint` EXIT 0; `py_compile` EXIT 0. Full suite/audit not run — proportionate omission; grep confirms no test outside the focused scope references the changed strings, so the focused run covers exactly the affected surface.
- **Fixture drift:** fixture resolves expected language from the same environment the TUI process inherits (spawn env → `execv`), so expectations cannot diverge from the plugin's resolution; `expected_language()` mirrors the TS rule faithfully (same order, strip/lower/`[.@]`-split, `de`/`de_`/`de-`).

## Notes (non-blocking)

1. **Type widening of `SETUP_ERROR_MESSAGE`** (`dist/tui/index.d.ts`): was the string literal type, now `string`. Value is unchanged; only out-of-repo compile-time consumers depending on the literal type would notice. Deliberate compatibility tradeoff, disclosed by the builder.
2. **Real-PTY smoke path unexercised here:** the binary-gated E2E (both languages) did not run in this environment; unit/integration coverage substitutes, and the skip was honestly reported. The fixture's language-adaptive expectations remain unverified against a real binary until that gate passes.
3. **`savedMessage` uses truthiness for `projectOverride`** while the row marker uses `!== undefined`: preserves pre-change toast semantics; the `!== undefined` condition was specified only for the row marker. An empty-string override would show the marker but omit the toast note — unreachable via normal flows (`selectionString` returns real IDs).
4. **Dialog search collation** switched from hardcoded `toLocaleLowerCase('de')` to the resolved language (`model-menu.ts:65,68`): a behavior tie-in beyond visible strings, but required for a consistent English path and harmless for de/en.
5. **Documentation pending historian** (per task instructions, not counted against the builder): README's German-only menu/smoke statements, the migration guide, and the changelog are now stale relative to the English path; historical specs should remain historical.

**Blocking findings:** none.

---

# Follow-up Review — English Marker Clipping Mitigation ('(local overwrite!)')

**Date:** 2026-11-18 (same day, second pass) · **Scope:** narrow delta only per instruction; broad checks not repeated.
**Trigger:** user reported the English closing ')' visually missing (row clipping); user requested the literal `(local overwrite!)`.

## Verdict: PASS_WITH_NOTES

**Basis:** Read the follow-up delta — `src/tui/strings.ts:118`, `tests/tui/strings.test.ts:75`, `tests/tui/model-menu.test.ts:297`, `dist/tui/strings.js:66` (+regenerated map) — against the user's request and the previously reviewed state. Statically reconciled the recorded test counts against the actual suite composition; nothing re-run.

## Verified

- **Exact delta as stated:** the English `projectOverrideMarker` is the only source change (`' (locally overwritten)'` → `' (local overwrite!)'`, leading-space convention preserved); the other 35 English entries are byte-identical to the first-review state; German dictionary untouched (`' (lokal überschrieben)'` at line 77). Only the two English marker assertions changed in tests; the German stacking test and all other assertions are untouched. `dist/tui/strings.js` regenerated with the new literal; other dist outputs reference `strings.projectOverrideMarker` symbolically and correctly did not change.
- **User request honored verbatim:** visible text is exactly `(local overwrite!)`; 22→18 visible chars reduce clipping risk on the host renderer the builder inspected (plain span, overflow hidden, wrap none). The builder disclosed that clipping was judged plausible, not live-reproduced, and that no universal fitting guarantee exists — accurate reporting of a user-directed copy decision.
- **Evidence reconciliation (static):** RED 2 failed/46 passed → GREEN 48 passed matches the two affected files exactly (strings.test.ts 21 + model-menu.test.ts 27 = 48; the 2 RED failures are precisely the two changed marker assertions). The "all TUI 65 pass 1 skip" total matches a `tui`-substring filter scope exactly: 57 (tests/tui) + 6 (tests/cli/tui-install.test.ts, 3 + it.each×3) + 2 (non-gated kiki-tui) + 1 binary-gated skip = 66. build/lint EXIT 0 consistent with the verified regenerated `dist/tui/strings.js`.
- **Guardrails/scope:** copy-only delta; no identifiers, dependencies, permissions, or German text affected; guardrails untouched.

## Notes (non-blocking)

1. **Stated command vs. recorded totals:** the stated command (`vitest run tests/tui tests/integration/kiki-tui.test.ts`) statically yields 59 passed + 1 skip; the reported 65+1 implies the actual run used a broader `tui` filter (a superset that also ran `tests/cli/tui-install.test.ts`). Coverage was a superset — no affected check was skipped — but future evidence should quote the exact invocation.
2. **Docs still carry the old literal (pending historian, per task routing — not a code blocker):** `README.md:129` and `CHANGELOG.md:18` still say `(locally overwritten)`; the CHANGELOG "Added" entry appeared after the first review and now needs the `(local overwrite!)` replacement together with the README.
3. **Mitigation, not guaranteed fix:** the row still ends with `)` (now preceded by `!`); shortening reduces but does not ensure fit, and no automated narrow-width rendering check exists — unit tests assert the literal, not host-rendered width. If clipping persists in real use, a renderer/row-width fix would be the next step (outside this delta).

**Blocking findings:** none.
