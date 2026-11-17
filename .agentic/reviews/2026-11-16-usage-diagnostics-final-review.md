# Final Whole-Change Review — Lightweight Usage Diagnostics

**Verdict: PASS_WITH_NOTES**

Report path: this file. Basis: approved spec (2026-11-15), reviewer-approved plan (Global Constraints, Review Focus, Task 4 Step 7/8), `task-4-report.md`, `task-4-docs-proposal.md`, `progress.md` (Tasks 1–4 evidence), `alignment.json`, prior task reviews (PASS/PASS_WITH_NOTES), and direct inspection of the whole worktree diff at `.worktrees/lightweight-usage-diagnostics` (all new/changed src, tests, `.gitignore`, README, CHANGELOG). No commands/tests/builds/audits were run by this reviewer; recorded evidence and files were judged.

## Whole-change spec compliance (verified in code)

- **Off default, no side effects:** `src/server/index.ts:133-141` constructs collector/writer only when `diagnostics.enabled`; routing hook/stream counts unchanged (one hook, one stream); routing log entry stays exactly `{timestamp, agent, model}` (`src/server/routing-logger.ts:109-111`). Off control in real-binary evidence confirms no ledger file.
- **Privacy allowlist:** `parseDispatchLabels` reads only the leading bracket (`src/diagnostics/ledger.ts:98-130`); routing-logger projects only identities, agent, bounded declared model, label prefix (`routing-logger.ts:54-81`); `tokensFrom` reads only the five counters (`src/server/usage-diagnostics.ts:44-81`). No prompt/body/source storage anywhere.
- **Unknown ≠ 0, exact counts, dedupe:** session `tokens:null → unknown`, real zeros printed as `0` (`stats.ts:360-368`); dispatch dedupe by parent+callId, snapshot dedupe by record ID + latest per session (`stats.ts:118-138`); retries deduped by event ID (`usage-diagnostics.ts:230-231`).
- **No inferred joins:** dispatch `childSessionId='unknown'` always (`ledger.ts:39`); collector never joins, `stats.ts:454` prints `observedSessionTokens=unknown` with explicit no-cost/no-quality notes — including sequential dispatches (spec §5).
- **Partial/resume/status ordering:** initial partial snapshot on `session.created`, terminal finish dedupe via `terminalStatus`, resume resets, `session.usage.updated` is sole aggregate source; step events deliberately unobserved (`usage-diagnostics.ts:236-252`). Real-binary evidence (13/7 = aggregate, not 3/2 or 26/14) pins this.
- **Failure isolation:** all writes fail-open (`ledger.ts:332-347`, `usage-diagnostics.ts:101-107`); collector has its own exception boundary after watchdog handling (`index.ts:220-227`); flush occurs during existing bounded cleanup (`index.ts:187`).
- **`stats` read-only:** `node:fs` limited to `existsSync`/`readFileSync`; no model/network/subprocess/Git/HEAD; registry read-only, spec/plan as current reference paths with disclaimer; incident join strict by sessionId, unmatched shown, no raw payloads (`stats.ts:236-337, 493-523`).
- **Prompt grammar:** one orchestrator section, 3–5-word examples, no new args (`src/cli/config.ts:556-557`); `stats [path]` registered (`src/cli/index.ts:37-38`).
- **Docs:** README `### Usage diagnostics (opt-in)` and factual Unreleased CHANGELOG entry match the proposal; default-off, growth/no rotation, unknown joins, worktrees-not-sandboxes, no savings/quality claims all present.
- **Baseline integrity:** HEAD `43d5057`, no commits, lockfile unchanged, `.gitignore` adds only `run_ledger.jsonl`.

## Blocking items

None. One major gap and minor notes:

1. **Major (Reason: plan; environment/permission)** — Plan Task 4 Step 7 requires running the configured `commands.security` check (default `npm audit`) with exact command/exit/output recorded. Task 4's final-gates table records build/lint/tsc/full-suite/768-pass/integration/diff-checks green but **no security audit run** ("dispatch explicitly excluded audit"). This is a genuine, honestly-disclosed plan/test evidence gap, not a pass. Mitigations: zero dependency changes (lockfile sha256 unchanged from baseline), no new network-facing code paths beyond `node:fs` appends. **Required before merge:** run `npm audit` (or record `PERMISSION_BLOCKED`) in the worktree and attach evidence; alternatively an explicit user waiver.

## Minor notes (non-blocking)

- CHANGELOG entry ends with a duplicated "No measured savings" sentence (style only; content accurate).
- Historian's optional SDD report was not produced (lacking historian `.superpowers` grant); the applied docs themselves were inspected and match the proposal.
- Task 3 notes (latest-marker revision display, exact-duplicate abort collapse) remain accepted, documented, unchanged.
- No claim is made here about equal quality, savings, runtime rollout, or causes of earlier cancellations.

## Addendum — Security audit evidence gap resolved (2026-11-16)

The one major gap (configured `commands.security`/npm audit never run) is now closed by parent-recorded evidence in `.superpowers/sdd/2026-11-15-lightweight-usage-diagnostics-plan/task-4-security-audit/`:

- `npm audit --json` run read-only in the worktree; `npm-audit.json` shows auditReportVersion 2, **32 moderate, 0 high, 0 critical**; 454 total dependencies (299 prod, 120 dev, 30 optional, 6 peer). `exit.txt` records EXIT=1 (expected for moderate findings); `npm-audit.stderr` empty.
- Findings are pre-existing toolchain/dependency-chain issues (@npmcli chain incl. minimatch/glob, vitest/eslint toolchain, @opencode/plugin@2.2.6) — not introduced by this change: `package.json` and `package-lock.json` are unchanged versus base commit `43d5057` (lockfile sha256 `b39a5765…` unchanged from baseline recorded in Task 4).

Plan Task 4 Step 7 requires fixing **or reporting** high/critical findings; there are none, and the moderate findings are reported here as a non-blocking, pre-existing risk. No dependency upgrade is demanded. Scope limitation: no dependency-change audit comparison (e.g. `npm audit --json` diff against base lock) was run, so this addendum claims only unchanged dependency manifests/lock and no new dependencies — not that the feature introduced zero vulnerabilities.

**Whole-change verdict: PASS** (upgraded from PASS_WITH_NOTES). The single major evidence gap is resolved; remaining minor notes (CHANGELOG duplicate sentence, historian-report absence) stand as documented, non-blocking. No quality/savings/runtime-rollout claims made.