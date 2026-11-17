# Review — async subagent completion test correction (2026-11-16)

**Verdict: PASS_WITH_NOTES**

Scope: `tests/integration/oc2-security-boundaries.test.ts` (+129/-1) in `/home/lutz/lprojekte/kiki/.worktrees/lightweight-usage-diagnostics`. Reviewed artifact `async-dispatch-test.diff` against actual worktree file (sha256 `56dc4013…` — identical to report). Report: `async-dispatch-test-report.md`. alignment.json guardrails unaffected (test-only change).

## Basis (spec + user authorization)

Authorized fix: old assertion expected synchronous `child done` from `named.output`; OpenCode 2.3.0 returns a background-launch notice. Required: preserve all allowed/denied security route assertions; verify the dispatched named child's **actual terminal** completed result bound to the launched sessionID — not a launch notice, echoed prompt, parent reply, other session, blank body, or nonterminal status.

## Findings — compliant

1. **Security assertions preserved:** diff touches only the named-dispatch block; all allowed/denied route, ask-rejected, counter and `other-agent` assertions (file lines ~585–1127) unchanged.
2. **Provenance/identity checks sound:** `completedSubagentReport` requires sessionID parsed from the dispatch launch notice (`ses_[A-Za-z0-9]+`), `state="completed"`, matching description, non-empty body — arbitrary parent text, fake markup from another session/description, or blank output cannot satisfy it (negative test covers all cases plus running/pending/error/cancelled).
3. **Expected result verified:** route asserts `completedChild.body` contains `child done` and `state === 'completed'` — not merely "some output". Added `exitStatus === 0` and launch-notice match strengthen the check.
4. **Bounded termination/failure diagnostics:** non-null assertions carry role-prefixed messages; reverse scan (most recent first) avoids stale matches.
5. **Evidence honest:** RED exit 1, targeted exit 0 (1/5), whole file exit 0 (5/5), tsc exit 0. Full suite correctly reported UNKNOWN (log only RUN header); no full-suite-pass claim. Watchdog cause not generalized; permission overlay excluded.

## Notes (non-blocking)

- **Minor:** `completedSubagentReport` hardcodes `state: 'completed'` in its return, so the route test's `completedChild.state === 'completed'` assertion is tautological — identity is actually enforced by the `attribute()` comparison inside the helper. Cosmetic.
- **Minor:** no failing-first TDD run exists for the helper test (disclosed in report).
- **Unverifiable:** eslint exit 0 came with "File ignored" — file was not actually linted; no lint evidence exists for the changed file (disclosed).
- Reverse scan could match an older completed message with identical sessionID+description in the same fixture, but sessionIDs are per-dispatch unique in practice.

## Claims NOT made

No full-suite pass, no production fix, no completed diagnostics Task 1, no permission/watchdog changes.