# Critical Review: Kiki Improvement Brief and WP8 Evidence Base

- **Date:** 2026-11-12
- **Status:** Research review. Candidate inputs for the next brainstorm, not approved implementation.
- **Reviewed documents (unchanged):**
  - `docs/research/Kiki improvement brief for brainstorming.md` (390 lines; dated Nov 11, 2026; basis commit `6213905`, v3.0.1)
  - `docs/research/Evidence Base for Kiki's WP8 Eval and Learning Loop_ What the Studies Support and What to Change.md` (175 lines)
- **Provenance:** Reviewer handoff recorded as session `ses_e30e76bebffeEmOWJSaCYQG0ma`; local code/log spot checks performed for this artifact. The reviewer had read-only access. This pass could read files but not run shell commands, Git, tests, or live OpenCode probes.
- **Not implied:** approval, certification, security audit, test result, runtime verification, or independent replication of the cited papers. No blanket "no false claims" or "PASS" verdict is adopted here.

## 1. Short assessment

The documents are a candid and useful starting point, especially where they mark claims as `[Run]`, `[Code]`, `[User]`, or `[Assumption]`. They are not a validated design. The main weaknesses are:

1. No threat model for untrusted repository content (README, changelogs, docs) as prompt injection, or for model-mediated permission requests.
2. Reviewer evaluation can measure finding *form* rather than defect *validity* if user calibration asks only whether a scenario/rule/file was named.
3. Small repeat counts are treated too readily as reliability evidence; they are smoke/regression signals.
4. Several proposed limits describe controls that are not present in current code, and native OpenCode controls are not verified against Kiki's pinned runtime.

The local code observations are largely accurate. The research claims are not independently reproduced here.

## 2. Source-confirmed local observations

These were checked against the current checkout. They describe both **generated defaults** and the **live project configuration**; the two differ.

| Observation | Local evidence | Classification |
|---|---|---|
| Generated implementer and gui-designer allow all shell commands. File edit denials therefore do not constrain shell equivalents (for example `cat`, `sed`, redirection, `node -e`). | `src/cli/config.ts:187-205`; `allow('shell', '*')` at line 203. `generateGuiDesignerTemplate` reuses `buildImplementerPermissions` at lines 452-457. | Source-confirmed generated default |
| The live project also allows broad shell access for implementer and gui-designer. | `opencode.jsonc:128` (`"bash": "allow"` for implementer), `opencode.jsonc:158` (gui-designer). | Source-confirmed project-specific config |
| The generated reviewer shell policy is Git-only (`git diff*`, `git log*`). | `src/cli/config.ts:207-224`, especially lines 220-222. | Source-confirmed generated default |
| The live reviewer is broader than the generated one: it also allows `git status/show/ls-files/rev-parse/...`, `npm test/build/lint/audit/pack`, `npx --no-install ...`, and some `kiki release` checks. | `opencode.jsonc:188-214`. | Source-confirmed project-specific divergence |
| The generated orchestration prompt does not define what happens after a review FAIL. It goes from review to document; the only failure handling is "retry once", "task fails twice → escalation", and a 3-retry/30-minute dispatch definition. | `src/cli/config.ts:336-344` (process), `355-362` (failure handling). | Source-confirmed generated default |
| Fixed review findings are deleted rather than retained as history. | `src/cli/config.ts:588` (schema example) and `597` ("remove fixed findings instead of preserving them as history"). | Source-confirmed generated default |
| No per-task dispatch, review-round, or token cap exists. The watchdog uses tokens only as an activity signal, not a budget. | Orchestrator limits: `src/cli/config.ts:355-362`. Watchdog evaluation: `src/server/watchdog.ts:287-311`; token handling: `263-279`; decoded token events: `src/server/watchdog-events.ts:154-161`. | Source-confirmed absence |
| The watchdog is session-level: silence, repeated content/tool signatures, and absolute session duration. | `src/server/watchdog.ts:114-127` (per-session state), `203-225` (registration), `287-311` (evaluation), `341-365` (tick). | Source-confirmed |
| The routing log records only timestamp, agent, and model. The logger does not resolve native configuration; it uses the dispatch input's model or `"unknown"`. | `src/server/routing-logger.ts:5-26` (entry and fallback), `43-58` (execute-before hook and append). | Source-confirmed |
| Historical routing-log entries include many identical pairs with the same timestamp, agent, and model (for example lines 1-2 and 3-4). The cause is not established here. | `.agentic/kiki/routing_log.jsonl:1-2`, `3-4`; similar pairs recur through line 44, while later entries are mostly single. | Source-observed; cause unverified |
| `paper_index.json` points to `docs/research/wiki/papers/...` files that are absent from this checkout. | `docs/research/paper_index.json:5`, `14`, `23`, etc.; `docs/research/wiki/**` has no files. | Source-confirmed broken path; separate research thread |
| The version is 3.0.1, with `@opencode/plugin` pinned at 2.2.6. | `package.json:3`, `58`; `src/cli/config.ts:74`. | Source-confirmed |

**Caution on the live config shape:** the live `opencode.jsonc` uses singular `permission` objects with a `bash` key, while generated frontmatter uses a `permissions` array with a `shell` action. This review did not verify whether both shapes are runtime-equivalent in the pinned OpenCode version. The shape difference alone is not evidence of a bug.

## 3. Research-design critiques

### 3.1 Replay tests orchestration, not reviewer quality

The brief defers reviewer-precision cases to stage 3, "only if reviewer findings stay unreliable" (brief line 41). The evidence document recommends 3-5 reviewer-precision cases as part of the initial ~20 cases, not 3-5 total cases (evidence lines 9, 93, 104).

- **Critique:** a recorded replay with injected reviewer outputs tests the orchestrator and escalation path. It does not test whether a live reviewer finds real defects or invents false ones.
- **Recommendation to consider:** a small known-defect/known-non-issue reviewer set alongside deterministic replay, not as a replacement for live reviewer assessment.
- **Classification:** design recommendation; not validated by the reviewed studies for Kiki's pipeline.

### 3.2 Calibration on finding form is not defect-validity ground truth

The evidence document proposes user labels such as "Is a concrete scenario named?", "Is a rule cited?", and "Is the file in the diff?" (evidence lines 94, 110). These are useful *form* checks, and they suit a non-programmer. They do not establish that the finding is a real defect.

- A judge can agree with a user on form while both miss a false positive or a missed defect.
- Better ground truth would be independently validated defects and known non-issues: seeded defects, expert-confirmed frozen diffs, or real incidents with confirmed root causes.
- If only form labels are feasible, label them as form agreement, not defect-validity calibration, and record the uncertainty.
- **Classification:** critique/hypothesis; the documents themselves do not claim the form questions are defect ground truth, but the surrounding text can be read that way.

### 3.3 Five repeats are smoke signals, not reliability proof

The evidence document is mostly honest here: five clean runs bound the failure rate only below roughly 60% at 95% confidence by the rule of three; ten clean runs only below roughly 30% (evidence lines 106-108).

- Use repeats to catch large regressions and to exercise variance.
- Do not present 5/5 as proof of reliability, safety, or generalisation.
- Small suites detect only large effects; that is acceptable early, but weak for fine comparisons.

### 3.4 Public-case contamination and sample uncertainty

- Public benchmarks and reused public cases may be contaminated in model training or prior exposure. Incident-derived private cases and held-out cases reduce this risk; the documents mention held-out cases but do not quantify contamination for Kiki's own set.
- Small samples make rankings unstable. Paired comparisons help, but they do not remove case-selection bias.

### 3.5 Stage trigger: "enough tasks" beats a fixed month

The brief says caps reset once "enough tasks" are logged (line 40). The evidence document says re-set caps "after a month" (line 109). A calendar month is not a data-sufficiency criterion. Prefer a pre-declared minimum number of successful tasks and rounds, then compute the percentile. This is a recommendation, not an established finding.

## 4. Gaps in both documents

### 4.1 Prompt injection through repository content

Neither document analyzes repository text as an attack surface. Kiki agents read READMEs, changelogs, docs, plans, review notes, and dependency changelogs. A malicious or compromised repository could place instructions in those files that steer a reviewer, implementer, or historian. This is especially relevant because Kiki is used on a public repository and on projects with third-party dependencies.

- **Classification:** gap/threat-model requirement. No exploit was demonstrated here.
- **Implication:** permission rules alone do not address content-level injection; review and approval design must treat repository text as untrusted input.

### 4.2 Model-generated permission requests

WP1 writes blocked actions to `.agentic/kiki/permission_requests.jsonl` and proposes a "ready-to-paste rule" (brief lines 232-233). A model can influence the reported action or resource string.

- Deterministic rendering of the request is a useful mitigation, but not a complete defence: a request can still be over-broad, misleading, or socially engineered.
- The user is explicitly not a programmer and cannot be expected to validate a path/glob technically.
- Any approval flow should normalise and validate resource paths, show the effective scope in plain language, and never treat model-authored request text as trusted.
- **Classification:** proposed control/design concern; not a proven exploit.

### 4.3 Native `steps` and restrictive `policies`

The reviewer handoff reports that native OpenCode `steps` and restrictive `policies` may be partial controls per current documentation.

- **Not verified in this pass** against the pinned `@opencode/plugin@2.2.6` or a live runtime.
- A step limit is not a whole-task token or wall-clock budget; orchestration-level accounting across dispatches and review rounds would still be needed.
- Adoption requires pinned-version documentation/source checks and runtime tests, not inference from a newer OpenCode version.
- **Classification:** unverified proposal.

### 4.4 No current whole-task bound

The brief's goal 1 says every task is bounded. Current code does not enforce a per-task dispatch, review-round, token, or wall-clock cap. The watchdog bounds individual sessions by silence, repetition, and duration only. The goal is therefore aspirational, not current behaviour.

## 5. Claim-status ledger

| Claim | Status |
|---|---|
| Generated implementer/gui shell allow-all weakens file-edit denials | Source-confirmed |
| Live project also has broad shell access | Source-confirmed project-specific |
| Generated reviewer is Git-only; live reviewer is broader | Source-confirmed |
| Review FAIL path is undefined in the generated orchestration prompt | Source-confirmed |
| Fixed findings are removed from `reviewNotes` | Source-confirmed |
| No per-task dispatch/review-round/token caps | Source-confirmed absence |
| Watchdog is session-level silence/repetition/duration | Source-confirmed |
| Routing log records `"unknown"` when no model is passed; it does not resolve native config | Source-confirmed |
| Historical identical-pair log entries prove a current duplicate-event bug | **Not established.** Duplicates are visible; cause is unknown. Deduplicate/investigate before using the log for baselines. |
| `steps`/`policies` are viable partial controls | **Unverified.** Needs pinned-version verification and runtime tests. |
| Reviewer-precision cases should start earlier than stage 3 | Recommendation/hypothesis, not a study result for Kiki |
| Form-based user labels validate defect findings | **Not supported.** They validate form, not defect truth. |
| Five repeats prove reliability | **Not supported.** Smoke/regression signal only. |
| Incident cost of ~48 h / ~200M tokens | User-reported (`[User]` in the brief); not independently verified |
| Paper findings and venue details | Not independently replicated; body-level statistics and some venue details were not re-opened |
| `paper_index.json` references missing wiki papers | Source-confirmed broken paths; appears to be a separate research thread. Do not delete blindly. |

## 6. Limitations of this review

- Shell access was denied: no Git identification, no commit check of `6213905`, no test suite, no `kiki doctor`, no live OpenCode probe.
- The brief's OpenCode source/runtime checks use tag/runtime 2.2.7; Kiki pins `@opencode/plugin@2.2.6`. The brief claims the relevant types are identical; that is not equivalence proof for all runtime behaviour.
- External papers, URLs, body-level statistics, and venue details were not re-opened. The reviewer reported most checked claims supported; that is not independent replication.
- The live project's `opencode.jsonc` permission shape differs from generated frontmatter; runtime semantics were not tested.
- The working tree is version 3.0.1, but it was not verified to match commit `6213905`.
- No claim is made that the reviewed documents are free of false statements, nor that their proposals are safe or effective.

## 7. Candidate inputs for the next brainstorm

These are prompts for discussion, not an approved backlog:

1. Define a threat model for repository-content prompt injection and model-mediated permission requests.
2. Decide whether a small reviewer-precision set belongs in stage 1 alongside replay, and how to obtain defect-validity ground truth without requiring technical judgement from the user.
3. Relabel or replace form-based "calibration" so it is not mistaken for defect validity.
4. Replace calendar-based cap resets with a data-sufficiency trigger.
5. If native `steps`/`policies` are considered, pin the version, verify the semantics, and test them; do not treat them as a total task budget.
6. Investigate the historical duplicate routing-log entries before using them for baselines.

## 8. Documentation decision

- **README:** unchanged. No setup, feature, API, or user-facing behaviour changed. This is a research-review artifact only.
- **CHANGELOG:** unchanged. No product change was made; a changelog entry would misrepresent research notes as shipped behaviour.
- **`docs/DECISIONS.md`:** not created or changed. No architecture decision or phase-status decision was made, and the file does not exist in this checkout. Creating one solely for a review would add root-document churn without a decision to record.
- **Original research documents:** unchanged.
- **Task registry:** unchanged.

## 9. Local citations checked

- `src/cli/config.ts:74` — `KIKI_VERSION`
- `src/cli/config.ts:180-184` — brainstormer/planner shell rules
- `src/cli/config.ts:187-205` — implementer permissions; `shell *` at 203
- `src/cli/config.ts:207-224` — reviewer permissions; Git-only shell at 220-222
- `src/cli/config.ts:226-240` — escalation permissions
- `src/cli/config.ts:242-287` — historian permissions
- `src/cli/config.ts:316-363` — orchestrator template
- `src/cli/config.ts:417-450` — implementer template
- `src/cli/config.ts:452-461` — gui-designer template; reuses implementer permissions
- `src/cli/config.ts:464-490` — reviewer template
- `src/cli/config.ts:493-512` — escalation template
- `src/cli/config.ts:588,597` — `reviewNotes` schema and deletion instruction
- `src/server/routing-logger.ts:5-26,43-58` — log entry shape and `unknown` fallback
- `src/server/watchdog.ts:4-33,114-127,203-225,263-311,341-365` — session-level watchdog state and evaluation
- `src/server/watchdog-events.ts:154-161` — token events from `session.usage.updated` / `session.step.ended`
- `.agentic/kiki/routing_log.jsonl:1-2,3-4` — historical identical pairs
- `opencode.jsonc:128,158,188-214` — live project shell permissions
- `docs/research/paper_index.json:5,14,23` — missing wiki paths
- `package.json:3,58` — version and plugin pin
