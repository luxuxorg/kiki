# Diagnosis: repeated kiki-planner cancellations (lightweight-outcome-evaluation)

Date: 2026-11-15 · Agent: kiki-escalation (read-only investigation, no fixes applied)

## Sessions diagnosed

- `ses_e207a51d2ffewCAoFKP8RvFvGy` ("Plan lightweight usage diagnostics"), created 14:04:02Z, interrupted 14:04:59Z (57s)
- `ses_e2078b5ecffe4wON75aUPc0P6U` ("Retry diagnostics implementation planning"), created 14:05:47Z, interrupted 14:06:59Z (72s)

## Verified findings (from `~/.local/share/opencode/opencode.db`, session_v2 + session_message; `~/.local/share/opencode/log/opencode.log`; `.agentic/kiki/health_log.jsonl`; `.agentic/kiki/routing_log.jsonl`)

1. Both planner sessions ran **healthy and productively** until the abort: loaded skills, read/grep/glob of config, registry, spec and source, shell and webfetch calls, then multi-second reasoning turns. First/output tokens streamed normally (in ≈44k/40k, out ≈1.2–1.4k per session). No error content, no failed tool result visible in stored records.
2. Both end with an **empty-content assistant message + snapshot immediately followed by `idle outcome: "interrupted"`** (session_message seq 221/223 and 251/253) — the signature of an externally initiated abort, not a model or provider error.
3. **Watchdog ruled out:** health_log.jsonl's last entries are 13:36Z (`watchdog-abort … elapsedMs 300021` for *other* sessions); there are **no health_log entries at all** for either planner session, and the 57s/72s runtimes are far below the ~300s watchdog threshold.
4. **Permission block ruled out:** no permission asks/denies recorded for these sessions (session `permission=None`; latest permission grants in the DB are from Nov 13).
5. **Parent did not cancel:** the parent orchestrator session `ses_e30e7f156ffeU0kSAcyHeG29p9` was `idle outcome=succeeded` at 14:04:25Z and 14:05:59Z — i.e. *idle waiting for the child* at both abort moments. It only learned of the cancellation via the synthetic `state="cancelled"` messages (seq 7267 at 14:05:00Z, seq 7315 at 14:06:59Z). The abort therefore originated from the client/control layer, outside the model chain.
6. **Model is not systematically broken:** the same planner model (`gpt-6.1-sol`, provider `openai`) succeeded on comparable planner runs before ("Plan eval pass one/two", 86s/88s, Nov 13). The failed brainstorm/spec phases of this same task used `z-ai/glm-5.3` and succeeded.
7. **No partial artifacts:** the target plan file `docs/superpowers/plans/2026-11-15-lightweight-usage-diagnostics-plan.md` does not exist; both planners were still in the read/research phase (no write calls before the aborts).

## Root cause statement

**Verified:** the cancellations were external aborts delivered to healthy, on-track planner sessions; not watchdog, not permissions, not a provider error, and not an orchestrator decision.

**Not fully determinable from stored data:** *who/what* issued the abort. OpenCode persists the `interrupted` outcome but not the abort's origin. Remaining hypotheses, in order of plausibility:
- (H1) User/client-side stop (Escape/stop action in the TUI, or client interruption) — consistent with the abort arriving while the parent was idle, and with two fresh CLI starts logged at 14:05:41Z/14:05:44Z between the two attempts (user/client activity in that window).
- (H2) A harness/client-layer defect aborting subagents on some client event (e.g. reconnect/new client connect). Not evidenced, only not excluded.

Evidence that would distinguish: the user confirming/denying a manual stop; or a future dispatch observed live (does the abort coincide with a TUI action?); OpenCode currently stores no abort-origin record, so no stored data can settle this.

## Classification

**User/client-side blocker, not a technical defect in the task, spec, prompt or model.** The spec is approved, the planner model has produced comparable plans successfully, and both runs were progressing normally when aborted.

## Recommendation (one minimum next action)

**Ask the user whether they intentionally stopped the two planner runs** (Escape/stop or client restart around 14:04–14:07). Then re-dispatch the *same* planner prompt once more and let it run uninterrupted (allow ≥3–5 minutes; do not abort while it is reading/reasoning). No redesign, no split, no model change, no config change — none is supported by the evidence.

If the user denies any manual stop, treat H2 as open and capture a live observation of the next dispatch before considering any harness-level change.
