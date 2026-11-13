# Kiki: improvement brief for brainstorming

Nov 11, 2026 · @Lutz

This brief is the input for a brainstorming agent. The main part states the problems, goals and constraints of Kiki, a multi-agent pipeline on OpenCode 2. Develop your own solutions from it. Appendix A holds solution proposals from a first analysis: use them as one option to compare against and challenge, not as the answer. Appendices B and C hold a proposed rule set and proposed parameter values, each with its rationale.

Basis: [luxuxorg/kiki](https://github.com/luxuxorg/kiki/tree/6213905) at `6213905` (v3.0.1), the OpenCode source at tag `v2.2.7`, OpenCode 2.2.7 itself run against a test provider, and statements by the user. Markers: **\[Run\]** = executed against OpenCode 2.2.7 · **\[Code\]** = read in the Kiki repository or the OpenCode source, with location · **\[User\]** = stated by the user, not verified · **\[Assumption\]** = inference without direct evidence · **\[Open\]** = unknown.

## 1. Context

- **System:** Kiki is a CLI plus an OpenCode 2 server plugin (`src/server`) and a TUI plugin (src/tui). Roles: orchestrator (primary), brainstormer, planner, reviewer, implementer, gui-designer, escalation, historian. Models and permissions live in the native OpenCode configuration. \[Code\]
- **Pipeline:** intake → spec → plan → plan review → implement → code review → documentation → complete. The orchestrator runs it through the `subagent` tool. \[Code: `generateOrchestratorTemplate`, `src/cli/config.ts`\]
- **User:** sole developer, not a programmer. Controls the pipeline at two points: spec approval, and manual acceptance of all use cases before each commit. Cannot judge backend logic, security or effort technically; no solution may require that. \[User\]
- **Projects on Kiki, with different stacks:** a chatbot processing highly sensitive user data (PoC with test users), a public voice agent, a WordPress plugin, a public card-sorting SaaS, a test server with MCP access for agentic testing, and Kiki itself (public repository). \[User\]
- **Operations:** local development, production on Scalingo, a staging server is planned. Runtime models of the products are EU-hosted under a data processing agreement; this constraint does not apply to development agents, as long as no user data reaches them. \[User\]
- **Permissions:** agents run with deliberately restrictive permissions. \[User\]

**Usage:** 2–3 projects, coded on 2–3 days a week; an agent run lasts 1–4 hours. Kiki is not a 24/7 pipeline. \[User\]

## 2. Goals

A solution is good if it reaches these goals. Goals 1–3 can be tested with the eval cases of WP8 (Appendix A); the others need their own checks.

1. **Every task is bounded.** It either finishes within defined limits or hands over to the user; no model decision can extend it.
2. **Deterministic failures cost one attempt.** A missing permission, a dependency defect or a provider protocol error leads to a request to the user without retries or escalation.
3. **Blockers are evidence-based.** A review blocks only with a concrete scenario and a cited rule.
4. **Defects are fixed at the source.** No workaround code around a dependency or the design system.
5. **Changes are measured.** Prompt, rule and model changes are compared on an eval set before adoption.
6. **Any stack works.** Nothing Kiki requires from a project assumes a language, package manager or framework.
7. **The user only decides what they can judge.** Requests are in plain language and ask for a decision, never for a technical assessment.
8. **The rule set is validated.** The user works alone, has no security expertise and no expert to consult. The baseline is therefore validated without a human expert: every rule is traced to a requirement of an externally reviewed standard (OWASP ASVS 5.0 level 1 at minimum, WCAG 2.2), and compliance is checked by deterministic tools wherever possible.

### Scope for a one-person operation

The user works alone, does not program, and every component is built and maintained by agents of the same pipeline it is meant to fix. Each added component is a new place for the failures this brief addresses. Several proposals in Appendix A entered over successive review rounds of this brief; the stages below are the correction. Build only stage 1 now; later stages start only when their trigger occurs. Use is part-time (section 1), so evals and monitoring run on demand, not as a standing process.

| Stage | Content | Starts when | Why |
| --- | --- | --- | --- |
| 1 Stop the cost | WP1 stop protocol, including the full-deny case. WP2 hard caps per task on dispatches, review rounds (2, Appendix C), tokens and wall-clock time; at any cap, stop and ask the user. Until own data exists, the user sets the dispatch, token and time caps as the most one session may use, cost or take. Routing log with task, tokens and rounds. Reviewer prompt: scenario and rule required, PASS allowed, `alignment.json` read in code review too. Baseline `alignment.json` (WP5). Eval cases 1–3 and control cases as recorded replays, run when the model, a prompt or the Kiki version changes. | now | Covers both observed cost incidents. |
| 2 Measure | Findings ledger. After each stop that reaches the user, one question: was this stop justified (yes/no)? These answers are the labels. A metrics summary on demand, as a script without a model step. Caps reset to the 75th percentile. | once enough tasks are logged to compute a 75th percentile | Needs the data stage 1 produces; without it, thresholds and verdicts are guesses. |
| 3 On demand | WP6 dependency agent and exception register (until then `DEPENDENCY_BLOCKED` simply goes to the user). Release-age checks for ecosystems without a native setting. WP7 `ask` zone and preflight. Model step in the retro. Hold-out cases. Structured JSON reviewer output with parser. Code-derived check that every endpoint has an authorization test. Per-project profiles. Reviewer cases on frozen diffs, verdicts by another model family with calibration, and repeated live runs, only if reviewer findings stay unreliable. | only when the problem it solves recurs in the logs | Each item adds code or an agent role to maintain. Without its trigger it is speculative. |

Not deferred, because they are one-line settings or already part of normal work: the native release-age setting where a package manager has one, and authorization tests per endpoint written as part of normal TDD.

## 3. Design principles

Every solution must follow these principles; one that breaks a principle needs an explicit reason.

1. **Stop decisions are code, not model judgment.** Every observed cost overrun came from a model deciding whether to continue. Counters, limits and state transitions are deterministic; models only classify and propose.
2. **Classify a failure before reacting to it.** A retry only helps transient failures. Deterministic failures (missing permission, dependency defect, provider protocol error) fail the same way every time and go straight to the user.
3. **The user decides at defined points, in plain language.** A request to the user states what is needed, why, and the exact change to approve. It never asks for a technical judgment the user cannot make.
4. **Findings need evidence.** A blocker names a concrete scenario (who does what, and what goes wrong) and the rule it violates. Everything else is advisory.
5. **Fix at the source.** Defects in a dependency or the design system are fixed there, not worked around in project code.
6. **Measure before changing.** Prompt, rule and model changes are adopted only if the eval set does not get worse.
7. **Stack-agnostic project interface.** Kiki itself may depend on OpenCode. Everything Kiki asks of a project (commands, manifests, checks, rules) is configured per project and works for any stack.

## 4. Problems and root causes

Problems A–C share one root: Kiki knows a single failure class and leaves every reaction to it to a model. Problem D concerns the content of the default rules.

### A. Review loops without a brake

Observed: after spec and plan, the reviewer rated unrealistic risks as critical and demanded extreme countermeasures. Escalation wanted to stop, the orchestrator continued. Cost: about 48 hours and 200 million tokens. A weaker orchestrator model had been introduced at the same time, without measurement. \[User\]

- Reviewer output is binary (`PASS | FAIL` plus numbered blockers): no severity, no required scenario. \[Code: `generateReviewerTemplate`\]
- Only the plan review uses `alignment.json`, and the reviewer checklist covers only code. Code review, implementer and gui-designer never read `alignment.json`. \[Code: orchestrator and reviewer templates\]
- The reviewer may only run `git diff` and `git log`. It judges claims about lint, tests and scans instead of running them. \[Code: `buildReviewerPermissions`\]
- Nothing defines what happens after FAIL. Review rounds do not count as failures, so “fails twice → escalation” does not reliably trigger. \[Code: orchestrator template\]
- Fixed findings are deleted from `reviewNotes`, so recurring or escalating findings are invisible. \[Code: registry schema in the workflow template\]
- The escalation verdict is advisory; nothing binds the orchestrator to it. \[Code: `generateEscalationTemplate`\]
- The watchdog checks single subagent sessions for silence, identical repetition and maximum duration. There is no limit on tokens, rounds or dispatches per task, although the watchdog already receives token events. \[Code: `src/server/watchdog.ts`, `watchdog-events.ts`\]
- The routing log records only time, agent and model; the model is `unknown` in every entry in the repository. \[Code: `src/server/routing-logger.ts`, `.agentic/kiki/routing_log.jsonl`\]

External evidence: the incident matches failure modes of the MAST taxonomy, built from more than 1,600 annotated traces of 7 multi-agent frameworks: step repetition, unawareness of termination conditions, ignoring other agents’ input, and incomplete verification (Cemri et al., arXiv 2503.13657, reported as NeurIPS 2025).

### B. Missing permissions are retried and escalated

Observed: with restrictive permissions, agents are blocked repeatedly, and escalation then runs up to three expensive loops instead of stopping. \[User\] The same pattern occurred with a deterministic provider protocol error: 7 counted failures and three escalations in one day. \[Code: `.agentic/reviews/2026-11-09-kiki-implementer-protocol-failure.md`\]

- Generated rules deny everything not explicitly allowed. OpenCode blocks a denied call without asking the user. \[Code: `build*Permissions`; OpenCode `packages/core/src/permission.ts`\]
- No agent prompt says what to do when blocked.
- The orchestrator’s only failure rule is “retry once, then escalate”; it does not distinguish deterministic failures.
- Escalation can only recommend redesign, split or stop. “Permission needed, ask the user” is not an outcome, and with `git diff`/`git log` only it cannot inspect the block.

External evidence: endless retries after permission errors are a documented agent weakness; on existing benchmarks GPT-4o recovered from tool errors in only 17–54% of cases (CRITICTOOL, preprint). Safety prompts alone were insufficient in Agent-SafetyBench (preprint; 349 environments, no agent above 60%). Both support enforcing the stop in code (WP1).

### C. Workarounds around defective dependencies

When a design-system component or another dependency is not accessible or not secure, agents can write replacement code instead of fixing the source. Workarounds accumulate and break later. Nothing in Kiki forbids or detects this. \[User; Code: no such rule in any template\]

### D. The default rules do not fit the projects

The default `alignment.json` lists SOC 2 Type II, an audit of organisational controls by an external auditor that cannot be judged from a plan or a diff, and contains no accessibility requirement. Hosting-level rules (encryption at rest, TLS) are not marked as such, which invites blockers without a checkable scenario. \[Code: `DEFAULT_ALIGNMENT`, `src/cli/config.ts`\]

## 5. Checked facts

These facts constrain any solution; each row says how it was checked. **Run** means executed on 2026-11-11 against OpenCode 2.2.7 (`@opencode/cli` from npm) in an isolated home, with a local test provider that scripts the model’s tool calls and a probe plugin that logs every hook and event. Two points could not be run because they need the interactive terminal UI: whether the TUI shows a subagent’s `ask`, and how the Kiki watchdog treats a session waiting for it.

| Question | Answer | Checked by | Where |
| --- | --- | --- | --- |
| Does a thrown error in `tool.execute.before` stop the call? | Yes. The subagent was not started, and the model received the thrown message as the tool error. | Run | Probe “block”; OpenCode `packages/plugin/src/promise/adapter.ts` |
| Does `permission.evaluate` see configured denies? | No. It fired for allowed and `ask` decisions, never for a configured deny (neither `edit` nor `subagent`). | Run, Code | Probes “deny”, “primary”; OpenCode `packages/core/src/permission.ts` |
| How can a plugin detect a blocked call? | In `tool.execute.after` with `status: error`: the cause `error.error` has `_tag` “Permission.BlockedError” and carries `permission` and `resources` (for example `edit`, `x.txt`). Replacing `event.error` changes what the model sees. | Run | Probes “deny”, “rewrite”; same pattern as OpenCode’s built-in Plan plugin, `packages/core/src/plugin/plan.ts` |
| What happens if an action is denied for every resource (`deny edit *` with no allow)? | The tool is removed for that agent. The model gets “No tool named … is currently available”, and `tool.execute.after` does not fire. | Run | Probe “deny” with full deny |
| What does the model see on a deny? | “Permission denied: edit” (or `subagent`), unless a reason is set. | Run | Probes “deny”, “primary” |
| What happens to `ask` in a subagent? | `permission.asked` carries the child session id. For a file write it proposes saving the pattern `*`, so answering “always” would allow every edit in the project. In `opencode run` the request is rejected automatically and the model is told to continue without the action. In the TUI the root session lists requests of all descendant sessions. | Run (headless); Code (TUI) | Probe “ask”; OpenCode `packages/tui/src/routes/session/index.tsx` |
| Where do token counts come from? | Event `session.usage.updated`, cumulative per session, for parent and child sessions. | Run | Probes; Kiki `src/server/watchdog-events.ts` already decodes it |
| Can a primary agent have its own permissions? | Yes. A primary agent with `subagent` rules was refused a dispatch to a non-allowed subagent (“Subagent denied”). | Run | Probe “primary”; [OpenCode docs: Agents](https://opencode.ai/docs/agents/) |
| Plugin API 2.2.6 (pinned by Kiki) vs. 2.2.7 (in use) | Tool, permission, event and registration types are identical; 2.2.7 only adds an experimental model-resolve hook. | Type diff | `@opencode/plugin` 2.2.6 and 2.2.7 from npm |
| Current OWASP Top 10 | The 2025 edition is current. New: Software Supply Chain Failures (A03, broadened from vulnerable components) and Mishandling of Exceptional Conditions (A10, includes failing open). SSRF is rolled into Broken Access Control (A01). The official pages give no release date. | Docs | [OWASP Top 10:2025, Introduction](https://top10.owasp.org/2025/0x00_2025-Introduction/); [A10](https://owasp.org/Top10/2025/A10_2025-Mishandling_of_Exceptional_Conditions/) |
| ASVS levels | ASVS 5.0 has three levels; level 1 holds 70 of 345 requirements as first-layer defence. Unlike 4.x, 5.0 no longer ties sensitive data to level 2 and leaves the target level to the organisation. The OWASP Developer Guide, still based on 4.0.3, describes level 2 as the level for applications with sensitive data. Security event logging (V16.3) and secure error handling (V16.5) are level 2. | Docs | [ASVS 5.0: changes from 4.x](https://github.com/OWASP/ASVS/blob/master/5.0/en/0x05-For-Users-Of-4.0.md); [ASVS 5.0 V16](https://github.com/OWASP/ASVS/blob/v5.0.0/5.0/en/0x25-V16-Security-Logging-and-Error-Handling.md); [OWASP Developer Guide: ASVS](https://devguide.owasp.org/en/03-requirements/05-asvs/) |
| Native release-age gates | npm `min-release-age` (days), pnpm `minimumReleaseAge` (minutes), Yarn `npmMinimalAgeGate`, Bun `minimumReleaseAge` (seconds), pip `--uploaded-prior-to`, uv `exclude-newer`, Cargo `registry.global-min-publish-age` (from 1.100), Bundler `cooldown` (days). Composer, Go, Maven and NuGet have no built-in equivalent. These gates do not exempt security fixes automatically. | Docs | [Socket: Dependency cooldown](https://socket.dev/glossary/dependency-cooldown) |
| Does G12 match WCAG 2.2 AA? | Yes. Each listed item maps to a level A or AA success criterion: text alternatives 1.1.1 (A); semantic markup 1.3.1 (A) and 4.1.2 (A); labelled fields 3.3.2 (A); keyboard 2.1.1 (A); no trap 2.1.2 (A); visible focus 2.4.7 (AA); contrast 1.4.3 and 1.4.11 (AA); errors 3.3.1 (A), 3.3.3 (AA) and 4.1.3 (AA). WCAG2ICT applies the same criteria to native software. The list is a minimum, not the whole of AA. | Docs | [WCAG 2.2](https://www.w3.org/TR/WCAG22/); [WCAG2ICT](https://www.w3.org/TR/wcag2ict-22/); [Understanding 2.1.2](https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html), [2.4.7](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html), [3.3.1](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html), [4.1.3](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) |

## 6. Stack-agnostic requirements

Kiki may depend on OpenCode; nothing it asks of a project may assume a stack. Checked against the current code and this brief:

| Item | Today | Required |
| --- | --- | --- |
| Check commands | `config.commands` for build, test, lint, security; the security default is `npm audit` | Keep per project; add `accessibility`; `kiki doctor` warns when a default belongs to a different ecosystem than `language` |
| Dependency commands | none | `dependencies.outdated`, `dependencies.info`, `dependencies.update` per project |
| Manifests and lockfiles | `package.json` hard-coded in the project’s implementer grants | `dependencies.manifests[]` per project, generated into `kiki-dependency` permissions |
| Release-age gate | none | Native package-manager setting where supported, otherwise a registry-metadata adapter per ecosystem |
| Shell allow-lists of reviewer and dependency agent | fixed `git` patterns | Generated from `config.commands` and `dependencies.*` |
| Baseline wording | – | All rules in Appendix B are phrased stack-neutrally; G12 covers web and native UIs through “semantic markup or the platform accessibility API” |

## 7. Open questions and decisions

Questions 1–5 are decisions for the user; each has a proposal. Questions 6–14 are technical and need a design or a short spike. Items 15–16 need input only the user can give.

**Decisions for the user**

1. **Budget defaults per task** (dispatches, review rounds, tokens, wall-clock). Proposal: caps set by the user until own data exists, then the 75th percentile of successful tasks (Appendix C).
2. **Release-age window.** Proposal: 3 days; security fixes may bypass the wait after user approval (Appendix C).
3. **ASVS as reference.** Proposal: OWASP ASVS 5.0 level 1 in the baseline `compliance`; level 2 for projects with sensitive data (chatbot). ASVS 5.0 leaves the level to the user; level 2 adds security logging and secure error handling, which G7 and G9 already require.
4. **May `kiki-dependency` apply non-breaking updates without asking?** Proposal: install command on `ask` until WP7 is verified, then `allow` for updates that pass the gate.
5. **Migration of existing projects:** rewrite each project’s `alignment.json` automatically, or let `kiki doctor` report the difference.

**Technical questions**

6. How to map child sessions to a task reliably: task id in the dispatch description, session `parentID` chain, or registry state.
7. How to parse structured reviewer output robustly when a model deviates from the schema (reject and re-ask once, or downgrade all findings to advisory).
8. How to give findings a stable identity across rewording, so recurring findings are detected.
9. Two gaps found by running OpenCode 2.2.7: (a) a deny on every resource removes the tool, so no hook sees the block; should Kiki forbid such rules in generated permissions, or classify “No tool named …” as permission\_blocked? (b) “always” on a file-write ask saves the pattern \*; how does Kiki keep approvals narrow?
10. Release-age gate for Composer (WordPress plugin): Composer has no built-in cooldown, so the gate needs a check of release dates in the registry metadata (Packagist).
11. Which accessibility check runs per stack; no single tool covers web, WordPress and native UIs.
12. How to make replays reproducible: record and inject reviewer outputs instead of regenerating them.
13. How to grade “overstated” automatically: candidates are missing scenario, missing rule id, rule in `beforeProduction`, and recurrence after a fix.
14. Which deterministic tools (static analysis with OWASP rule sets, dependency and secret scanning, a dynamic scan against the staging server, an accessibility checker) cover which baseline rules for each stack, and which rules remain checkable only by a model? Logic rules such as G3 are covered by automated tests, not scanners: for every endpoint that reads or changes user data, a test requests another user’s object and expects a denial. The endpoint list must be derived from the code (for example the route definitions), and a deterministic check must confirm that every endpoint has such a test, so the agent that writes code and tests cannot miss the same endpoint in both.

**Input needed from the user**

15. Artifacts of incident A (spec, plan, reviewer outputs, registry, logs) for eval case 1.
16. Whether TUI auto-accept mode is used; if so, the `ask` zone of WP7 has no effect.

## 8. Sources

Each source is cited where it is used. All were opened, except those marked (extract): those were read from the full-page extract the search tool returned.

**Kiki and OpenCode**

- [luxuxorg/kiki at 6213905](https://github.com/luxuxorg/kiki/tree/6213905): agent templates, permissions, plugin, watchdog, registry schema, review reports, routing log
- [OpenCode source, tag v2.2.7](https://github.com/anomalyco/opencode/tree/v2.2.7): files as cited in section 5
- `@opencode/plugin` 2.2.6 and 2.2.7 and `@opencode/cli` 2.2.7 from npm: hook type definitions, and the binary used for the runs
- [OpenCode docs: Permissions](https://opencode.ai/docs/permissions/) and [Agents](https://opencode.ai/docs/agents/); probe runs of 2026-11-11 (scenarios block, deny, full deny, rewrite, primary, ask), set up after Kiki’s own integration fixture

**Security and accessibility standards**

- [OWASP Top 10:2025, Introduction](https://top10.owasp.org/2025/0x00_2025-Introduction/); [A03 Software Supply Chain Failures](https://owasp.org/Top10/2025/A03_2025-Software_Supply_Chain_Failures/) (extract); [A10 Mishandling of Exceptional Conditions](https://owasp.org/Top10/2025/A10_2025-Mishandling_of_Exceptional_Conditions/) (extract)
- [OWASP ASVS 5.0: changes compared to 4.x](https://github.com/OWASP/ASVS/blob/master/5.0/en/0x05-For-Users-Of-4.0.md); [ASVS 5.0 V16 Security Logging and Error Handling](https://github.com/OWASP/ASVS/blob/v5.0.0/5.0/en/0x25-V16-Security-Logging-and-Error-Handling.md); [OWASP Developer Guide: ASVS](https://devguide.owasp.org/en/03-requirements/05-asvs/) (based on ASVS 4.0.3)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) (extract), [WCAG2ICT](https://www.w3.org/TR/wcag2ict-22/) (extract) and the Understanding pages linked in section 5 (extract)

**Dependency release age**

- [GitHub blog: The case for a cooldown (2026-07-23)](https://github.blog/security/supply-chain-security/the-case-for-a-cooldown-why-dependabot-now-waits-before-issuing-version-updates/)
- [GitHub Docs: Dependabot options reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference) (extract)
- [Renovate: Minimum Release Age](https://docs.renovatebot.com/key-concepts/minimum-release-age/) and [Renovate: config presets](https://docs.renovatebot.com/presets-config/)
- [Socket: Dependency cooldown](https://socket.dev/glossary/dependency-cooldown)

**Agent loops**

- [Anthropic: Building effective agents (2024-12-19)](https://www.anthropic.com/research/building-effective-agents)
- [Madaan et al.: Self-Refine, NeurIPS 2023](https://arxiv.org/abs/2303.17651) (extract of the full text)
- [Arimbur: How Many Tries Does It Take? (arXiv preprint, 2026)](https://arxiv.org/abs/2604.10508)

**Evals and agent reliability** (taken from a research report compiled for this brief; papers not reopened individually)

- [Anthropic: Demystifying evals for AI agents (2026-01-09)](https://www.anthropic.com/research/demystifying-evals-for-ai-agents), engineering guide
- [Miller: Adding Error Bars to Evals](https://arxiv.org/abs/2411.00640), preprint
- [Yao et al.: τ-bench](https://arxiv.org/abs/2406.12045), ICLR 2025
- [Shankar et al.: Who Validates the Validators?](https://dl.acm.org/doi/fullHtml/10.1145/3654777.3676450), UIST 2024
- [Zheng et al.: Judging LLM-as-a-Judge](https://arxiv.org/abs/2306.05685), NeurIPS 2023
- [Panickssery, Bowman, Feng: LLM Evaluators Recognize and Favor Their Own Generations](https://arxiv.org/abs/2404.13076), NeurIPS 2024
- [Olausson et al.: Is Self-Repair a Silver Bullet for Code Generation?](https://arxiv.org/abs/2306.09896), ICLR 2024
- [Huang et al.: Large Language Models Cannot Self-Correct Reasoning Yet](https://arxiv.org/abs/2310.01798), ICLR 2024
- [Cemri et al.: Why Do Multi-Agent LLM Systems Fail? (MAST)](https://arxiv.org/abs/2503.13657), reported as NeurIPS 2025
- [More with Less: Turn-Control Strategies for Efficient Coding Agents](https://arxiv.org/abs/2510.16786), ICSE 2026
- [Cihan et al.: Automated Code Review in Practice](https://arxiv.org/abs/2412.18531), industrial study, preprint
- [SWR-Bench](https://arxiv.org/abs/2509.01494), preprint
- [Aleithan et al.: SWE-Bench+](https://arxiv.org/abs/2410.06992), preprint; [Terminal-Bench 2.0 audit](https://arxiv.org/abs/2611.08417), preprint
- [Atil et al.: non-determinism of “deterministic” LLM settings](https://arxiv.org/abs/2408.04667), preprint; [Thinking Machines: Defeating Nondeterminism in LLM Inference](https://thinkingmachines.ai/blog/defeating-nondeterminism-in-llm-inference/), blog
- [Yang et al.: OPRO](https://arxiv.org/abs/2309.03409), ICLR 2024
- [CRITICTOOL](https://arxiv.org/abs/2506.13977), preprint; [Agent-SafetyBench](https://arxiv.org/abs/2412.14470), preprint

## Appendix A. Solution proposals

These are proposals from a first analysis, not decisions; compare them with your own designs. The order below follows dependencies; the stage plan in section 2 decides what is built when, and most of this appendix belongs to stages 2 and 3. WP1 and the dispatch and token caps of WP2 come first because they cap cost regardless of how well any model behaves; WP2’s review-round counting needs WP4; WP3 runs in parallel because every later package needs its data.

| Order | Work package | Solves | Depends on |
| --- | --- | --- | --- |
| 1 | WP1 Failure classes and stop protocol | B, C (stop), A (escalation outcome) | – |
| 2 | WP2 Budget and loop limits | A | WP1 (`needs_human` state); review-round counting also needs WP4 (structured verdict) |
| 2 | WP3 Telemetry and findings ledger | A, input for WP2 limits and WP8 | – |
| 3 | WP5 Baseline `alignment.json` | D, C (rule) | – |
| 3 | WP4 Review quality | A | WP5 (rule ids), WP3 (ledger) |
| 4 | WP6 Dependency steward | C | WP1, WP5 |
| 5 | WP7 Permission zones and preflight | B (fewer blocks, approval in place) | WP1 |
| 6 | WP8 Eval and learning loop | all | WP1–WP4 |

Out of scope here: per-project security profiles (data, reachability, distribution) that extend the baseline with modules such as LLM, multi-tenancy or public exposure. They are a separate task; WP4 and WP8 work with the baseline alone. Automating the user’s manual acceptance tests as end-to-end tests on the staging server is a project task, not a Kiki task.

## WP1 Failure classes and stop protocol

**Why:** missing permissions, dependency defects and provider protocol errors fail identically on every retry. Treating them as transient causes the retry and escalation loops of problem B (principles 1, 2, 3).

**What:**

1. Failure classes: `transient` (timeout, empty output, flaky test) keeps the existing retry; `permission_blocked`, `dependency_blocked`, `provider_error` and `budget_exceeded` (WP2) never retry.
2. Detection in the plugin, not the model: `tool.execute.after` with `status: error` and a permission block as cause. The built-in Plan plugin of OpenCode uses exactly this hook to rewrite permission errors. The `permission.evaluate` hook is not usable for this, because configured denies return before it runs. A deny on every resource removes the tool entirely: the model sees “No tool named …” and no hook fires, so generated rules must never deny an action on \* without an allow, or the plugin must classify that error too. \[Run\] \[Code: OpenCode `packages/core/src/permission.ts`, `packages/core/src/plugin/plan.ts`\]
3. The plugin replaces the tool error with a fixed instruction: blocked by policy, try no alternative, end with `PERMISSION_BLOCKED: <action> <resource>`. Implementer and gui-designer prompts define the parallel signal `DEPENDENCY_BLOCKED: <component> <version> <rule> <scenario>`.
4. Every block is appended to `.agentic/kiki/permission_requests.jsonl`: agent, action, resource, task, and a ready-to-paste rule.
5. Orchestrator rule: for every non-transient class no retry, no escalation, no failure increment. The task goes to `needs_human`, and the user sees the request in plain language.
6. Enforcement in code: while a task has an open request, the plugin rejects further `subagent` dispatches for it in `tool.execute.before`. A thrown error there rejects the call. \[Code: OpenCode `packages/plugin/src/promise/adapter.ts`, `packages/core/src/plugin/hooks.ts`\]
7. Escalation gets a fourth outcome, `needs_human`, with the concrete request.

**Acceptance:** a provoked permission block ends in `needs_human` after one dispatch, with zero retries and zero escalations, and the request file holds the exact rule.

## WP2 Budget and loop limits

**Why:** nothing in code limits a task, so one model decision can keep a loop alive indefinitely (problem A, principle 1).

**What:**

1. Per-task counters in the plugin: dispatches, review rounds per phase, tokens (from `session.usage.updated`), wall-clock time.
2. When a limit is reached, the plugin rejects further dispatches and sets `needs_human` with class `budget_exceeded`.
3. FAIL path as a state rule: every review FAIL increments `reviewRounds[phase]`; after 2 rounds escalation is mandatory.
4. The escalation verdict is binding: it is written to the registry, the plugin lets through only dispatches consistent with it, and `stop` goes to the user.
5. Limits are a brake, not an estimate. Proposed values and their rationale are in Appendix C.

**Needs:** deterministic FAIL detection, which requires the structured reviewer output from WP4, parsed in `tool.execute.after` of the `subagent` call. A reliable mapping from child sessions to a task (see open question 6).

**Acceptance:** a replay of incident A stops after at most 2 review rounds.

## WP3 Telemetry and findings ledger

**Why:** cost, rounds and recurring findings cannot be reconstructed today, so neither the limits of WP2 nor the learning loop of WP8 can rest on data (principle 6).

**What:**

1. Routing log per dispatch: task, phase, round, agent, resolved model, tokens, duration, failure class.
2. Findings ledger: every finding with a stable id, round, severity, scenario present yes/no, cited rule, status and verdict (valid, overstated, out of scope). Fixed findings stay; `reviewNotes` remains a view of the open ones.
3. A finding that returns after being fixed counts as an escalation signal.
4. Metadata only: no prompt content, no code, no user data.

## WP4 Review quality

**Why:** a binary verdict without a scenario turns every remark into a blocker; rules checked only at plan level leave the code unchecked; a reviewer that cannot run checks has to judge claims (problem A, principle 4).

**What:**

1. Structured reviewer output (JSON), per finding: `severity` (blocker | advisory), `scenario`, `rule` (guardrail id from WP5), `evidence`, `verification` (code | manual). PASS without findings is explicitly allowed. A blocker without scenario or rule is downgraded to advisory automatically, in code. Why: published studies find low precision for LLM review comments (best F1 about 19% in SWR-Bench, preprint) and many irrelevant or unnecessary comments in industrial use (Cihan et al., 4,335 pull requests, preprint). The downgrade rule itself is untested by any study; treat it as a hypothesis and measure blocker precision before and after on the reviewer cases of WP8.
2. `alignment.json` is read by the reviewer in plan review and code review, and by implementer and gui-designer while working.
3. Separate checklists for plan review and code review.
4. The reviewer runs the project’s configured checks itself (build, test, lint, security, accessibility). Its shell permissions are generated from `config.commands`, not hard-coded.
5. Rules that live in hosting or infrastructure are judged in plan review. In code review they are reported with `verification: manual` and never block.

**Acceptance:** a replay of incident A produces no blocker without scenario and rule.

## WP5 Baseline alignment.json

**Why:** the default must apply to every project, state only requirements on the result, and cite standards that can be judged from a plan or code. SOC 2 does not meet this, accessibility was missing, and the OWASP reference was out of date (problem D).

**What:**

1. Replace `DEFAULT_ALIGNMENT` with the baseline in Appendix B.
2. Each guardrail gets a stable id so findings can cite it (WP4).
3. `beforeProduction` stays empty in the baseline; project profiles fill it later, and its rules are advisory only.
4. Criterion for what belongs here: requirements the result must meet. Conditions on when an agent may act (release age, check results, registry) are process and belong in code (WP1, WP6).
5. Existing projects need a migration: `kiki install` writes `alignment.json` only when the file is absent and never merges it. \[Code: `src/cli/commands/install.ts`\]

## WP6 Dependency steward

**Why:** fixing at the source (principle 5) needs a role that is allowed to update dependencies, with far narrower rights than the implementer, which has `shell *` (problem C).

**What:**

1. New agent `kiki-dependency`. Given a `DEPENDENCY_BLOCKED` report, it checks newer versions, changelog, known issues and alternatives.
2. It may apply an update only if it is non-breaking. Kiki code checks deterministically: same major version; released at least the minimum release age ago (Appendix C); from the configured registry; all configured checks pass; the reported defect is verified as fixed. The model reads the changelog for breaking changes; that part is advisory input, not the gate.
3. Otherwise it presents the options (major update, replacement, upstream fix, exception) with consequences to the user, and the task goes to `needs_human`.
4. Exception register `.agentic/kiki/exceptions.json`: component, version, rule, reason, owner, removal condition. The reviewer checks workarounds against it.
5. Permissions generated from project config: edit only the listed manifests and lockfiles; shell only the configured dependency commands; the install command on `ask`.
6. Release-age gate: use the package manager’s native cooldown setting where it exists, otherwise a registry-metadata check per ecosystem (section 5).

**Acceptance:** a defective component with a fixed patch release is updated without workaround code; a defect that needs a major update ends in `needs_human` with the options listed.

## WP7 Permission zones and preflight

**Why:** WP1 makes a block cheap; WP7 makes blocks rare and lets the user approve in place instead of editing configuration files (problem B, principle 3).

**What:**

1. Three zones: `allow` for routine work, `deny` only for hard taboos (secrets, `.env`, keys, credentials), `ask` for everything else.
2. An `ask` from a subagent reaches the user: in the TUI, the root session lists pending permission requests of all descendant sessions. Answering “always” stores a project-level allow rule that never overrides a configured deny. For a file write it proposes the pattern \*, so “always” would allow every edit in the project; Kiki must steer the user to “once” or to a narrow rule (open question 9). In opencode run (headless) every ask is rejected automatically, so this zone only works in the TUI. \[Run\] In TUI auto-accept mode every request is accepted, which bypasses this zone. \[Code: OpenCode `packages/tui/src/routes/session/index.tsx`; OpenCode permissions docs\]
3. Watchdog fix \[Assumption from code, not run\]: a subagent waiting for an answer emits no activity and would be aborted after the stuck threshold (5 min by default), and in any case after the absolute maximum (60 min). A pending `permission.asked` must pause the watchdog for that session until `permission.replied`.
4. Preflight: the planner lists the files and commands each task needs; Kiki compares them with the agent’s rules before implementation and shows all missing rights at once.
5. The orchestrator gets an explicit permissions block that denies edits to OpenCode configuration. A primary agent’s own permissions are enforced on 2.2.7 (section 5). \[Run\]

**Acceptance:** an `ask` from a subagent appears in the TUI, the watchdog does not abort the waiting session, and “always” removes the need for a second approval.

## WP8 Eval and learning loop

**Why:** incident A started with an unmeasured model switch. Without measurement every prompt, rule or model change is a guess (principle 6).

**Scale:** this is the full design for reference. Kiki runs part-time (section 1), so stage 1 needs only the recorded replay cases and a few control cases, run when something changes; the rest follows the stage plan in section 2.

**What:**

1. **Eval set, about 20 cases to start.** Anthropic recommends 20–50 tasks drawn from real failures as a starting point.
   - Case 1: replay of incident A with recorded reviewer outputs. It tests orchestrator and escalation only. Expect a stop after at most 2 review rounds.
   - Case 2: a provoked permission block. Expect `needs_human`, 0 retries, 0 escalations.
   - Case 3: a provider protocol error. Expect `needs_human` after the first failure.
   - Reviewer cases: frozen diffs with known real defects and known non-issues. Score how many blockers are real and how many real defects are found. Needed because case 1 never tests the reviewer itself.
   - Control cases: situations where nothing may trigger, such as a clean diff without blockers or a permitted access that proceeds. One-sided sets optimise in one direction only.
   - Slipped defects, added as they occur.
2. **Each case** has a fixed input snapshot, a deterministic expected outcome, a reference run proven to pass and a known-bad variant proven to fail. Audits of public benchmarks found many broken tasks: weak tests let 31% of passing patches through in SWE-Bench+, and 28 of 89 Terminal-Bench 2.0 tasks had issues.
3. **Runs per case:** 1 run for recorded replays, which are deterministic by construction; several runs for live cases, because resampling each case reduces variance (Miller). Temperature 0 is not deterministic: accuracy varied by up to 15% across runs (Atil et al., preprint), and 1,000 identical requests gave 80 different outputs (Thinking Machines). Safety cases count as passed only if all runs pass (pass^k, τ-bench); capability cases use the mean.
4. **Verdicts on reviewer findings** come from a model of a different family than the reviewer, because models favour their own outputs (Panickssery et al., NeurIPS 2024). The verdict model is calibrated against user labels given with non-technical questions only (Is a concrete scenario named? Is a rule cited? Is the file in the diff?), and re-checked with spot checks, because grading criteria shift while grading (Shankar et al., UIST 2024).
5. **Retro**, local, by command, monthly or after a stop that felt wrong: tokens and rounds per task, share of blockers without scenario, recurring findings, most frequent permission requests, pass^k per case. Change proposals are never applied automatically. This is a precaution: no study shows a reviewer drifting when it edits its own rules, but prompt optimisers overfit (training accuracy 5–20% above test, OPRO, ICLR 2024).
6. **Adoption rule:** old and new configuration run on the same cases (paired comparison, Miller). Reject a change if any safety case fails. Rejection thresholds for the other cases and for token use are fixed before the comparison runs. Some cases stay hidden from the retro’s proposal step, because optimised prompts overfit the cases they are tuned on (OPRO).
7. **Limits of a small set:** small sets detect only large effects; in Miller’s worked example, detecting a 3-point difference needs about 969 questions. That is acceptable at the start, because early changes usually have large effects (Anthropic).

## Appendix B. Proposed baseline alignment.json

Proposed default for every project. The user has no security expertise, so every rule here is a proposal with its rationale, not a validated standard: challenge it. Validation works without a human expert (goal 8): map each rule to the ASVS or WCAG requirement it implements, flag rules without such a source, and list ASVS level 1 requirements the baseline misses. It holds requirements on the result only; project profiles add modules later. Rules with `"verification": "manual"` live in hosting or infrastructure and never block a code review.

```json
{
  "guardrails": [
    { "id": "G1", "rule": "No secrets (keys, tokens, passwords) in code, repository, logs or error messages; secrets are provided only via environment variables or a secret store." },
    { "id": "G2", "rule": "No dependencies with known high or critical vulnerabilities; dependency versions are pinned by a lockfile." },
    { "id": "G3", "rule": "Every non-public access requires authentication and checks authorization on the server; a user can only see and change their own data." },
    { "id": "G4", "rule": "Passwords are stored only as salted hashes with a current algorithm; sessions and tokens expire and can be revoked." },
    { "id": "G5", "rule": "All external input is validated on the server; database queries are parameterized; shell commands, file paths and outgoing request URLs are never built from unvalidated input." },
    { "id": "G6", "rule": "All output into HTML, scripts, queries or any other interpreter is encoded or escaped for its context." },
    { "id": "G7", "rule": "Errors and unexpected conditions fail closed: access is denied, no partial or inconsistent state is left behind, and clients get a generic message." },
    { "id": "G8", "rule": "Production configuration has debug output disabled, no default credentials and only the network exposure the feature needs." },
    { "id": "G9", "rule": "No personal or sensitive content in logs; no stack traces or internal details in responses to clients; failed logins and authorization errors are logged without personal content." },
    { "id": "G10", "rule": "Sensitive data is encrypted in transit (TLS for all network traffic outside localhost) and at rest.", "verification": "manual" },
    { "id": "G11", "rule": "Only data needed for the purpose is stored; stored user data can be deleted." },
    { "id": "G12", "rule": "Every user interface meets WCAG 2.2 level AA, including at least: semantic markup or the platform accessibility API, labelled form fields, full keyboard operability with visible focus and no keyboard traps, text alternatives for non-text content, sufficient contrast, and errors that are announced and explained." },
    { "id": "G13", "rule": "Defects in the design system or in any dependency (accessibility, security or functional) are never worked around in project code: no re-implementation, override, monkey patch, copied fork or bypass. Allowed remedies are an update, a replacement, an upstream fix, or an exception approved by the user and recorded in the exception register." },
    { "id": "G14", "rule": "Dependency updates never cross a major version unless the user approved it." }
  ],
  "compliance": ["OWASP Top 10:2025", "WCAG 2.2 AA"],
  "beforeProduction": [],
  "reviewRule": "A finding is a blocker only if it names a concrete scenario (who does what, and what goes wrong) and cites a guardrail id. Rules marked manual are reported for manual verification and never block. Everything in beforeProduction and everything else is advisory."
}
```

Why each rule is there:

- The rules cover the OWASP Top 10:2025 categories that can be stated as rules: access control incl. server-side request forgery (G3, G5), security misconfiguration (G8), supply chain and software integrity (G2, G13, G14, plus the release-age gate in WP6), cryptographic failures (G4, G10), injection (G5, G6), authentication (G4), logging and alerting (G9), mishandling of exceptional conditions (G7). Insecure design cannot be a code rule and is covered only through the `compliance` reference. G7 and G9 match ASVS 5.0 level 2 requirements (V16.3, V16.5), so the baseline already goes beyond level 1 there.
- G1, G5 and G9 carry over the three rules of the current default (secrets, parameterized queries, no stack traces).
- G12 adds accessibility for every project with a user interface.
- G13 and G14 implement principle 5; the process around them is WP6.
- SOC 2 Type II is removed: it certifies organisational controls and cannot be judged from a plan or a diff. A customer or funder may still require such a certification later; that is a business decision, not a code rule.

## Appendix C. Proposed parameter values

Each value cites its source; where no source gives a value, the value is left to the user or to own data. Tune every value with WP3 data.

| Parameter | Proposal | Rationale | Evidence |
| --- | --- | --- | --- |
| Minimum release age before an update | 3 days | Dependabot applies 3 days by default to version updates since July 2026, and Renovate’s best-practice preset waits 3 days for npm. GitHub’s reasoning: most malicious releases are caught within hours. | [GitHub blog, 2026-07-23](https://github.blog/security/supply-chain-security/the-case-for-a-cooldown-why-dependabot-now-waits-before-issuing-version-updates/); [Dependabot options](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference); [Renovate presets](https://docs.renovatebot.com/presets-config/) |
| Security fixes vs. release age | may bypass, exact version only, approved by the user | Dependabot and Renovate exempt security updates from the wait. Package-manager gates do not; Socket recommends exempting only the exact fixed version and removing the exemption once it has aged. User approval follows goal 7. | [Dependabot options](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference); [Renovate: Minimum Release Age](https://docs.renovatebot.com/key-concepts/minimum-release-age/); [Socket](https://socket.dev/glossary/dependency-cooldown) |
| Review rounds per phase before escalation is mandatory | 2 | A preprint on repair from test failures found that two rounds capture 76–95% of the achievable gain. Self-Refine found diminishing returns over up to 4 iterations; self-repair gains depended mainly on feedback quality (Olausson et al.); without external feedback, self-correction often failed (Huang et al.). None measured reviewer-driven loops. | [Arimbur 2026, preprint](https://arxiv.org/abs/2604.10508); [Madaan et al., NeurIPS 2023](https://arxiv.org/abs/2303.17651); [Olausson et al., ICLR 2024](https://arxiv.org/abs/2306.09896); [Huang et al., ICLR 2024](https://arxiv.org/abs/2310.01798) |
| Retries for a transient failure | 1 | Current Kiki behaviour; deterministic failures get 0 (goal 2). | Kiki orchestrator template |
| Dispatches per task | a hard cap; value set by the user until own data exists | Anthropic recommends a maximum number of iterations as a stopping condition. No published value exists for multi-agent coding pipelines. | [Anthropic, 2024-12-19](https://www.anthropic.com/research/building-effective-agents) |
| Token, round and wall-clock caps per task | set by the user as the most one session may cost or take until enough tasks are logged; then the 75th percentile of successful tasks. At any cap, stop and ask the user | In a study of coding agents, a turn cap at the 75th percentile of the uncapped baseline cut cost by 24–68% with minimal loss in solve rate. Single-agent setting, 100 tasks. | [More with Less, ICSE 2026](https://arxiv.org/abs/2510.16786) |
