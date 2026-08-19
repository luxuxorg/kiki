# Kiki Subagent Watchdog — Self-Healing Stuck Subagent Detection and Recovery

**Date:** 2026-08-18
**Status:** Draft (pending user review)

## Motivation

Kiki orchestrates multi-agent pipelines via OpenCode's `task` tool. In production use, subagent sessions (most often `kiki-planner` and `kiki-reviewer`, especially on GLM and KIMI models) intermittently hang: the session remains `busy` but produces no new messages, no token growth, and no tool activity for extended periods — sometimes hours. The parent orchestrator blocks on the `task` tool call and cannot recover on its own. The user must manually press Escape to interrupt the stuck child session, after which the orchestrator retries.

This is not model-specific avoidance; multiple models exhibit the behavior. Known upstream OpenCode issues confirm the phenomenon:

- **#11865** (open): Tasks/Subagents with Codex/OpenAI frequently get stuck with no timeout/retry, hanging the session forever.
- **#37580** (open): SSE stream silently dropped mid-response hangs session/subagents forever; `chunkTimeout` has no default on the OpenAI path.
- **#37312** (closed/consolidated): Sub-agents have no timeout — agents wait forever for stuck sub-agents.
- **#24900** (closed): Time-based inactivity auto-interrupt requested for primary agents.

Even where upstream fixes exist, they do not cover all providers, all hang modes, or Kiki's orchestration model. Kiki needs its own self-healing layer that detects stuck subagent sessions, aborts them safely, and allows the orchestrator to retry or escalate — all without user involvement.

## Product Definition

> The Kiki Subagent Watchdog is an OpenCode plugin extension that observes all child (subagent) sessions, detects hang and loop states using multi-signal heuristics, automatically aborts the offending session, and logs the incident so the orchestrator's existing retry/escalation logic can continue the pipeline.

### Goals

1. **Detect** subagent hangs and loops reliably across all providers and models.
2. **Recover** automatically by aborting the stuck child session, unblocking the parent `task` call.
3. **Integrate** with Kiki's existing task registry and orchestrator retry/escalation flow.
4. **Configure** thresholds and behavior per project without code changes.
5. **Avoid false positives** for legitimate long-thinking or long-running subagent work.

### Non-Goals

- Fixing upstream OpenCode provider/network bugs (e.g., SSE drop handling).
- Recovering the *content* of a stuck session (partial work is abandoned on abort).
- Monitoring or healing primary (non-subagent) sessions.
- Replacing the orchestrator's dispatch logic; the watchdog only unblocks it.

## Root Cause Analysis

The hang occurs inside OpenCode's child session execution. The parent `task` tool call blocks until the child session completes, errors, or is aborted. Three upstream behaviors contribute:

1. **Provider stream hangs:** SSE connections can be silently dropped by intermediaries (CDN/NAT idle timeouts) without delivering FIN/RST. OpenCode's `wrapSSE` only applies a read timeout when `provider.*.options.chunkTimeout` is explicitly configured; there is no default (#37580).
2. **No subagent-level timeout:** OpenCode does not provide a built-in timeout for `task` tool subagent sessions (#11865, #37312).
3. **Retry logic is error-driven:** OpenCode's retry layers only fire on explicit errors. A silent stall throws nothing, so retries never trigger.

Because the orchestrator is blocked inside the `task` tool call, it cannot enforce its own documented 30-minute timeout. Detection and recovery must happen outside the blocked call stack — inside an OpenCode plugin that can observe events and call the SDK.

## Detection Design

### Signals

The watchdog consumes OpenCode bus events via the plugin `event` hook and correlates them per session:

| Signal | Event Type | What It Indicates |
|--------|-----------|-------------------|
| Session lifecycle | `session.created`, `session.updated`, `session.deleted` | Child session start/end, parent linkage |
| Session state | `session.status`, `session.idle` | Whether the session is `busy`, `idle`, or `retry` |
| Content activity | `message.part.updated` | New text, reasoning, tool calls, or other parts |
| Token activity | `message.updated` | Token counts (input, output, reasoning, cache) |
| Errors | `session.error` | Session-level failures |

### State Machine per Child Session

For every session with `parentID` set (i.e., every subagent session), the watchdog maintains:

- `sessionId`, `parentId`, `agentName` (resolved by fetching the session's first user message via `client.session.messages()` and reading its `agent` field; if unavailable, fall back to the session title)
- `status`: `busy | idle | retry | error`
- `startedAt`: timestamp from `session.created`
- `lastActivityAt`: timestamp of most recent relevant event
- `lastTokenCounts`: `{ input, output, reasoning, cacheRead, cacheWrite }`
- `recentPartHashes`: ring buffer of the last 8 text/reasoning part hashes
- `recentToolSignatures`: ring buffer of the last 8 tool call signatures (`tool:JSON.stringify(input)`)
- `warningsIssued`: set of thresholds already warned about

### Stuck Detection (Hang)

A child session is classified as **stuck** when **all** of the following hold:

1. Current status is `busy` (not `idle`, not `error`).
2. Session age is greater than the grace period (`gracePeriodMs`, default 2 minutes).
3. No `message.part.updated` events for `stuckThresholdMs` (default 5 minutes).
4. No `message.updated` events with token count increases for `stuckThresholdMs`.
5. No `session.status` transitions for `stuckThresholdMs`.

**Rationale:** Requiring *both* part silence *and* token silence eliminates false positives during legitimate long reasoning phases where reasoning tokens are growing. If tokens are flat *and* no parts arrive, the session is truly stalled.

### Loop Detection

A child session is classified as **looping** when either:

1. **Content loop:** The last 3 consecutive text or reasoning parts have identical normalized hashes (whitespace trimmed, case-normalized), OR
2. **Tool loop:** The last 3 consecutive tool calls have identical tool names and identical serialized inputs.

**Rationale:** Three repetitions is the user's accepted threshold and matches OpenCode's existing `doom_loop` intuition, but applied to visible output as well as tool calls.

### Absolute Timeout

Regardless of activity, a child session is aborted when its age exceeds `absoluteMaxMs` (default 60 minutes). This is a safety net for pathological cases where activity is technically occurring but the session will never terminate usefully.

### What Counts as "Activity" (Thinking vs. Output)

The following reset the inactivity timer:

- Any `message.part.updated` event, including `type: "reasoning"` (thinking) and `type: "text"`.
- Any `message.updated` event where any token count (input, output, reasoning, cache read/write) increases.
- Any `session.status` transition.

**Rationale:** The user explicitly asked whether thinking counts as output. In OpenCode, reasoning is observable via `ReasoningPart` events and `reasoning` token fields. Therefore active reasoning is treated as legitimate activity and prevents false-positive aborts. Note: `message.part.updated` is the primary activity signal because it streams incrementally. Token counts from `message.updated` are a secondary signal; if a provider does not stream reasoning parts, the absolute timeout remains the backstop.

## Recovery Design

### Abort Procedure

When a session is classified as stuck or looping:

1. Log a `WARN` entry to `.agentic/kiki/health_log.jsonl` with session ID, agent, elapsed time, and detection reason.
2. Call `client.session.abort({ path: { id: sessionId } })` via the plugin's SDK client.
3. Log an `INFO` entry confirming the abort request was issued.
4. Remove the session from the active watch list.

### Parent Unblocking

Aborting the child session causes the parent's `task` tool call to return with a `MessageAbortedError`. The orchestrator's existing failure handling then applies:

1. Retry once with the same prompt.
2. If it fails again, log to `TASK_REGISTRY.json` and dispatch `kiki-escalation`.

No changes to the orchestrator's core flow are required.

### Safety Rails

- **Grace period:** Silence-based checks (stuck, 50% warning) and the absolute-timeout check do not run before `gracePeriodMs`. Loop detection is exempt from the grace period: three distinct identical parts/calls require real output and cannot false-positive on a starting session (the same-part-id guard prevents streaming repeats).
- **Warning before abort:** At 50% of `stuckThresholdMs`, emit a `DEBUG` log noting the session is unusually quiet. This aids tuning without taking action.
- **Agent filter:** By default, only sessions whose resolved agent name starts with `kiki-` are watched. A config option can widen this to all subagent sessions.
- **Single abort:** Once aborted, a session is never re-aborted or re-watched.

## Architecture

### Component Overview

The watchdog is implemented as an extension of the existing Kiki OpenCode plugin (`.opencode/plugins/kiki.ts`), keeping deployment simple: it ships with Kiki and loads automatically.

```
OpenCode Server
  └── Plugin: kiki.ts
        ├── Routing Logger (existing)
        │     └── tool.execute.before → append routing_log.jsonl
        └── Subagent Watchdog (new)
              ├── Event subscriber (session/message/status events)
              ├── In-memory session state map
              ├── Periodic checker (setInterval)
              ├── Abort executor (client.session.abort)
              └── Health logger (.agentic/kiki/health_log.jsonl)
```

### Why a Plugin, Not an External Daemon

- **Automatic:** Loads with OpenCode; no separate process to start or monitor.
- **Co-located:** Shares the OpenCode server process and SDK client.
- **Deployable:** Distributed as part of `kiki init` / `kiki update`.
- **Sufficient:** The plugin API exposes all required events and the `session.abort` SDK method.

An external watchdog daemon was considered and rejected because it adds operational complexity (process management, port discovery, multi-instance races) without adding detection capability.

### Why Not Only Provider/agent Configuration

Setting `chunkTimeout`, `maxSteps`, and `doom_loop` permissions helps some failure modes but does not cover silent SSE stalls (#37580) or provide automatic retry/escalation. The watchdog is the recovery layer; config hardening is defense-in-depth.

## Configuration

Add a `health` section to `.agentic/kiki/config.json`:

```json
{
  "projectName": "my-project",
  "language": "typescript",
  "commands": { ... },
  "paths": { ... },
  "models": { ... },
  "health": {
    "watchdogEnabled": true,
    "stuckThresholdMs": 300000,
    "gracePeriodMs": 120000,
    "absoluteMaxMs": 3600000,
    "checkIntervalMs": 30000,
    "loopRepeatCount": 3,
    "watchAllSubagents": false,
    "logPath": ".agentic/kiki/health_log.jsonl"
  }
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `watchdogEnabled` | `true` | Master switch |
| `stuckThresholdMs` | `300000` (5 min) | Silence duration before abort |
| `gracePeriodMs` | `120000` (2 min) | Min session age before evaluation |
| `absoluteMaxMs` | `3600000` (60 min) | Hard cap on session lifetime |
| `checkIntervalMs` | `30000` (30 s) | Watchdog evaluation interval |
| `loopRepeatCount` | `3` | Identical parts/tool calls that signal a loop |
| `watchAllSubagents` | `false` | If `true`, watch all child sessions, not just `kiki-*` |
| `logPath` | `.agentic/kiki/health_log.jsonl` | Incident log location |

## Data Flow

1. **Session start:** `session.created` with `parentID` → register session, record `startedAt`, resolve agent name.
2. **Activity:** Any relevant event → update `lastActivityAt`, token counts, and part/tool ring buffers.
3. **Evaluation:** Every `checkIntervalMs`, iterate active sessions:
   - Skip if too young.
   - Check absolute timeout → abort if exceeded.
   - Check loop detection → abort if looping.
   - Check stuck criteria → warn at 50%, abort at 100%.
4. **Session end:** `session.idle`, `session.error`, or `session.deleted` → remove from watch list.
5. **Abort:** Issue SDK abort, log incident, remove from watch list.

## Error Handling and Edge Cases

| Scenario | Handling |
|----------|----------|
| Plugin loads before any session exists | Watch list starts empty; no-op until first child session |
| `session.abort` SDK call fails | Log `ERROR` to health log. The abort is terminal: the session is removed from the watch list and never retried (single-abort rail). Rationale: the abort request may still be in flight; re-aborting risks interfering with an in-progress abort and the parent has already been unblocked in the common case. |
| Health log write fails | Fall back to `client.app.log()` so the incident is still recorded in OpenCode logs |
| Multiple OpenCode instances on same project | Each instance watches its own sessions; health log is append-only so concurrent writes are safe |
| Session ends naturally between warning and abort | Removed from watch list on `session.idle`/`session.deleted`; no abort issued |
| Abort during a tool call inside the child | OpenCode handles tool-level abort; parent receives `MessageAbortedError` |
| False positive aborts legitimate task | Tune `stuckThresholdMs` upward; incident is logged for review; orchestrator retries |

## Testing Strategy

1. **Unit tests** for the watchdog module:
   - Stuck detection triggers only when all criteria are met.
   - Loop detection triggers on 3 identical parts and 3 identical tool calls.
   - Token growth resets the inactivity timer.
   - Grace period prevents early evaluation.
   - Absolute timeout fires regardless of activity.

2. **Integration tests** with a mock OpenCode SDK client:
   - Verify `session.abort` is called with the correct session ID.
   - Verify health log entries are appended.
   - Verify parent unblocking is observable via task tool error.

3. **Manual/E2E validation:**
   - Dispatch a `kiki-planner` task with a model known to hang.
   - Confirm the watchdog detects and aborts within the configured threshold.
   - Confirm the orchestrator retries and completes or escalates.

4. **False-positive soak:**
   - Run normal planner/reviewer tasks with thinking-heavy models.
   - Verify no aborts occur during legitimate reasoning.

## Implementation Notes

- The watchdog runs in the same process as OpenCode; `setInterval` is appropriate and does not block the event loop because evaluation is lightweight.
- All timestamps use `Date.now()` (milliseconds since epoch).
- Part hashing can use a simple non-cryptographic hash (e.g., FNV-1a or Node's `crypto.createHash('sha256')` truncated) for loop detection.
- The plugin already imports `appendFileSync`, `existsSync`, `mkdirSync` from `fs`; the watchdog extends this pattern.
- No new runtime dependencies are required beyond the existing `@opencode-ai/plugin` SDK.

## Defense-in-Depth Recommendations (Optional Follow-ups)

These are not part of the watchdog itself but reduce hang frequency:

1. Set `provider.<id>.options.chunkTimeout` (e.g., `120000`) in `opencode.json` for providers that support it, especially OpenAI-compatible endpoints.
2. Set `maxSteps` on `kiki-planner` and `kiki-reviewer` agent frontmatter to bound agentic iterations.
3. Keep `permission.doom_loop` set to `deny` or `ask` to leverage OpenCode's built-in tool-loop detection.
4. Consider upgrading OpenCode to a version that includes upstream subagent timeout improvements when #11865 and #37580 are resolved.

## Open Questions

1. Should the watchdog attempt a "soft recovery" (send a `session.prompt` with `noReply: true` saying "continue") before aborting?  
   *Current answer:* No. A stuck session is unlikely to respond; abort-and-retry is more reliable.
2. Should loop detection use fuzzy similarity instead of exact hash equality?  
   *Current answer:* Start with exact equality; fuzzy matching can be added if false negatives appear.
3. Should aborted sessions record partial diffs to aid debugging?  
   *Current answer:* Out of scope; the health log captures metadata only.
