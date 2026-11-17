# Kiki Necessity Gate — Design

- **Date:** 2026-11-17 (revised same day: replaces the earlier "necessity record" artifact, rejected by the user as duplicate content — the gate is now review criteria, not document structure)
- **Status:** design for user approval. Enforcement and placement are user-settled; how-level choices marked **proposed default** are the author's, not the user's.
- **Out of scope:** implementation, planning, prompt edits, tests, commits, Superpowers skill files (read-only), unrelated dirty files. The merged usage-diagnostics feature stays unchanged.

## 1. Intent and why

The lightweight usage diagnostics feature (merged 2026-11-16) stores session
tokens, terminal status and timing in a new JSONL ledger even though the
OpenCode platform already exposes session data through `opencode session
export <session>` and `opencode stats` (both verified present in the installed
OpenCode 2.x CLI). The planner and the reviewer both approved the change,
because everything they were contracted to check was fine. Neither asked
whether existing sources could serve the need, because no contract item asked
that question.

Kiki's reviewer has a standing **scope-creep** check, but scope creep only
catches *unrequested expansion*. It cannot catch a requested feature that
should have been "read it from the platform" instead of "build a second copy".
Superpowers supplies the method but cannot know OpenCode-specific sources.
Kiki must add that dimension **without forking or editing Superpowers** — as
Kiki review criteria that run in addition to the loaded skill.

What was rejected, and is not in this design: a mandatory extra spec/plan
section, a five-slot artifact, a second evidence checklist, copying reasoning
from spec to plan, N/A or waiver subsections. A spec or plan that carries a
separate Necessity section duplicates content that already belongs in its
intent, current-state, alternatives and architecture prose. Existing relevant
spec prose **is** the evidence, wherever it already lives. The gate therefore
changes only what the reviewer, planner and brainstormer are asked to look at.

## 2. Goals / non-goals / anti-goals

- **Goal:** the reviewer applies standing **necessity criteria** in every plan
  review and final review, decidable from existing spec/plan/code evidence.
- **Goal:** the planner uses existing approved spec evidence by reference when
  helpful and documents only genuinely new implementation-level choices.
- **Goal:** the brainstormer covers the criteria within its existing spec
  prose (intent, current state, alternatives, architecture/data tradeoffs) —
  no new mandatory section.
- **Goal:** delivery stays prompt-level: generated agent prompts and the
  generated workflow document, plus static tests and docs. No runtime
  behavior, config schema, dependency, permission, subagent, CLI command, or
  new phase/review pass.
- **Non-goals:** editing Superpowers skill files; gating no-spec maintenance
  work; judging **product goals** (what the user wants built is the user's
  decision — including explicitly informed tradeoffs). Technical necessity,
  viability and soundness **are** the reviewer's to judge: a written
  rationale and prior spec approval are not proof of technical soundness and
  never an automatic PASS — the reviewer must reject provably unnecessary,
  duplicative, insecure or disproportionately complex technical choices,
  with concrete evidence and the existing severity/downgrade rules, and no
  taste veto.
- **Anti-goals (failure even if it works):** a fourth verdict, a new FAIL
  reason, a mandatory record heading, a parallel review pass, an exhaustive
  per-field catalog demanded of every change, a blanket waiver regime.

## 3. Approach selected

**Kiki review criteria on existing substance** — the reviewer's standing-check
pattern (scope creep, alignment) gains a third check; the planner and
brainstormer prompts gain short duty lines; the workflow document documents
the criteria. FAIL routes through the existing `spec` / `plan` /
`implementation` reasons and the existing revision loops.

Rejected alternatives: forking a Superpowers skill (forbidden, and
Superpowers cannot carry OpenCode source knowledge); a separate necessity
document with its own review pass (duplicate content and a parallel system);
and the earlier spec-embedded record (the user rejected the mandatory section
and slot template as duplicate content — this design replaces it, not
relabels it).

**Proposed default:** one small shared `NECESSITY_CRITERIA` constant (the
pattern of `PERMISSION_BLOCK_PROMPT` / `ALIGNMENT_GUARDRAIL_PROMPT`),
interpolated into brainstormer, reviewer and workflow, so the producer-side
expectation and the checker-side wording cannot drift. It carries the
criteria, never a document template. **Proposed default:** only brainstormer,
planner, reviewer prompts and the workflow document change; implementer,
gui-designer, escalation and historian stay untouched (implementation
deviations are covered by the existing scope-creep check; escalation reads
the reviewer's FAIL evidence). The orchestrator gains no gate text at all:
it must not become a second architecture reviewer or block a dispatch solely
because a named record is absent — the reviewer's FAIL is the gate.

## 4. The necessity criteria

The reviewer checks, from existing spec/plan/code substance, that the change
shows — where applicable, proportionally to the change:

1. **Existing capabilities/sources:** what already exposes the needed data or
   behavior — platform CLI/API (e.g. `opencode` subcommands), existing repo
   modules, logs/ledgers, adjacent tools — with bounded evidence (file/line,
   doc location, or the command and observed output). **A claim that no source
   exists must cite what was actually checked** — the exact command, lookup or
   search tried and what it returned — never a bare assumption. Probes are
   safe, bounded and their limits disclosed (e.g. `--help` text or local docs;
   not automatic capability commands that would need permissions or network).
   In the diagnostics incident, `opencode session export --help` and
   `opencode stats --help` were cheap runnable probes that would have answered
   the question.
2. **Null/reuse alternative:** what happens if nothing is built, and whether
   an existing source can be reused as-is or read at query time instead.
3. **Rationale for additions:** where the change adds persistence that
   duplicates another source, or a dependency, or a new abstraction — the
   actual tradeoff that justifies it. **Additional persistence is not
   categorically forbidden**; it must argue its real reasons (cost,
   availability, correlation), and the argument lives wherever it already
   fits: no per-field catalog is demanded of every change.
4. **Unique value:** the user-visible capability that disappears if the
   addition is removed; if nothing disappears, the addition is unjustified.
5. **Coupling cost:** what must be maintained (format/version coupling,
   second source of truth, migration/removal path), stated as far as the
   change makes it matter.

**Proportionality is part of the criteria.** A change touching no data,
dependency or architecture justifies itself in one sentence wherever that
fits in existing prose. The criteria scale with the change's footprint, not
with a template.

That the evidence lives distributed across existing prose is **not a
Necessity-specific disadvantage** (user-settled): the reviewer already reads
spec and plan substance this way for security, alignment and scope. Necessity
is an equal substantive standing check — no mandatory extra sections, catalogs,
copied analysis, new gates or phases, and no new waiver formats.

**Scrutiny is cumulative, not siloed** (user-settled). One reviewer, three
artifact focuses, shared contract, no new agent or review pass:

- **Spec substance:** technical necessity and viability, alternatives/reuse,
  risks/constraints — not just the presence of a rationale.
- **Plan:** concrete technical choices, decomposition and feasibility within
  the approved boundaries, each with a justified need.
- **Code:** the delivered diff's actual need, correctness, security and
  regressions — including new storage, dependencies and abstractions — not
  mere plan adherence.

At plan review the reviewer **reassesses the spec's** technical assumptions,
necessity and soundness using the new evidence the concrete plan exposes;
the approved spec is a comparison target, never an unquestionable one. At
code review the reviewer checks the diff **and** the actual adequacy of
plan and spec in light of the implementation evidence — a discovered upstream
flaw reopens the upstream artifact. Reassess relevant assumptions and reuse
existing evidence; no full re-investigation of every prior decision, no
duplicate analysis each round. The pipeline is unchanged: the spec is assessed
with the plan at the existing plan-review gate and rechecked later as
relevant — no standing spec-review dispatch exists or is added.

**Root-cause ownership.** A FAIL's Reason follows the flaw's root cause, not
the review phase it surfaced in: a spec flaw is `Reason: spec` (user-owned
revision, explicit approval); a plan flaw is `Reason: plan` (planner revises,
re-review); an implementation flaw is `Reason: implementation` (existing one
fix round). A code-review discovery of a spec or plan error must never force
the builder to satisfy faulty upstream instructions. A concretely evidenced
upstream flaw is a blocker; it does not downgrade to a note merely because
the artifact previously passed review. Only unsupported suspicions are notes
(existing downgrade rule).

**Example (no template implied).** Passing: a spec's current-state paragraph
names `opencode session export <session>` with its observed output and
explains why a separate ledger is still wanted (event correlation the export
does not carry). Failing: a plan chooses a new JSONL store of token totals
while the spec's current state never mentions the platform sources — the
reviewer FAILs. If the spec itself lacks the analysis and the plan cannot
remedy it, `Reason: spec`; if the plan's choice is unjustified against
adequate spec evidence, `Reason: plan`. Note that a technically avoidable
duplication can be implemented correctly and still be unsound: correct
implementation does not rescue an unnecessary design.

## 5. Enforcement mapping (user-settled; no new verdicts or reasons)

| Situation | Where caught | Verdict / Reason | Loop |
| --- | --- | --- | --- |
| Spec's substantive analysis is inadequate (e.g. negative source claim without the probe, additions with no stated tradeoff, unsound technical assumption the plan now evidences) — with concrete evidence | Plan review (reassessing spec with plan), or code review in light of implementation evidence | FAIL, `Reason: spec`, Evidence quotes the missing/faulty passage and why the flaw is in the spec (not "no implementation can satisfy it" — a technically avoidable duplication is implementable yet unsound) | Stop and ask the user → revised spec via brainstormer, explicit user approval (existing user-owned loop) |
| Plan makes persistence/dependency/abstraction choices the existing spec evidence does not justify, or unsound/infeasible technical choices | Plan review, or code review in light of implementation evidence | FAIL, `Reason: plan`, offending passage quoted | Planner revises, then the reviewer loop; existing caps unchanged |
| Implementation deviates from the approved spec/plan substance (unjustified persistence, new dependency) or is itself incorrect/insecure | Code review | FAIL, `Reason: implementation` via the **existing scope-creep rule** | Existing one fix round |
| Reviewer merely suspects the analysis is thin, no concrete evidence | any review | **Downgrade rule as-is** — incomplete evidence becomes a note, never a speculative new FAIL; but a concretely evidenced upstream flaw never downgrades merely because the artifact was previously approved | none |

The three verdicts, five Reasons, routing, caps and the downgrade rule stay
byte-identical. The reviewer FAILs on quoted, concretely evidenced inadequacy
in the existing substance — never on the absence of a heading, a named
record, or a formula. The orchestrator gains no gate text: it routes the
reviewer's FAIL by its Reason — the root-cause routing above — exactly as
today and blocks nothing on its own judgment.

## 6. Exact prompt changes (`src/cli/config.ts`)

All changes are inside the template generators; no permission array,
frontmatter or exported type changes. Line anchors at HEAD 03e7bc7.

**(a) New shared constant** after `ALIGNMENT_GUARDRAIL_PROMPT` (~L482):

```ts
// Kiki necessity criteria, interpolated into brainstormer, reviewer and
// workflow. In addition to the loaded superpowers skill, never a replacement.
const NECESSITY_CRITERIA = `...criteria lines (§4)...`;
```

Wording constraints (test hazards): keep "duplication" lowercase —
`tests/cli/loop-controls.test.ts` R1 forbids uppercase `DUPLICATE` /
`CANNOT_VERIFY` / `PARTIAL` / `OUT_OF_SCOPE` / `PLAN_BUG` in the reviewer body
and workflow; never add a fourth verdict or sixth Reason; touch no phrase
R1–R18 pins.

**(b) `generateBrainstormerTemplate` (~L642)** — after Instructions item 4
(~L656), a short paragraph, no section template:

```md
## Necessity (Kiki-specific, in addition to the loaded skill)
In the existing spec prose — intent, current state, alternatives,
architecture/data tradeoffs — cover, proportionally to the change:
${NECESSITY_CRITERIA}
Use bounded, safe probes (e.g. --help, local docs) and state their limits.
No extra section is required; the analysis lives where it already belongs.
```

**(c) `generatePlannerTemplate` (~L663)** — between `## Ownership` (~L679)
and `## Task Metadata` (~L682):

```md
## Necessity (Kiki-specific, in addition to the loaded skill)
Ground persistence, dependency and abstraction choices in the approved
spec's existing evidence, cited by reference where helpful. New technical
details — including persistence, dependency and abstraction choices within
the approved spec's boundaries — are yours to choose and justify: give the
actual tradeoff for each, referencing existing spec evidence and recording
genuinely new tradeoffs, without copying the spec's analysis into the plan.
Not being mentioned in the spec does not make a technical choice a spec
change. Report BLOCKED only when a choice would change the approved spec's
requirements, scope, security intent, acceptance criteria, or what is
delivered or allowed — that is a spec change under the existing user-owned
loop — or when evidence you need for a decision is genuinely unavailable;
never invent evidence.
```

**(d) `generateReviewerTemplate` (~L749)** — third bullet in
`## Standing Checks` (~L776–778), before `## Output Format` (~L780):

```md
- **Necessity (Kiki-specific, in addition to the loaded skill):** In every
  plan review and final review, check the approved spec, plan and delivered
  code substance against: ${NECESSITY_CRITERIA}
  Focus per artifact — spec: technical necessity/viability, alternatives,
  risks; plan: concrete choices, decomposition, feasibility within the
  approved boundaries, justified need; code: actual need, correctness,
  security, regressions of the diff, not mere plan adherence. Scrutiny is
  cumulative: at plan review reassess the spec's technical assumptions with
  the plan's new evidence (an approved spec is a comparison target, never
  unquestionable); at code review recheck plan and spec adequacy in light of
  the implementation evidence — reuse evidence, reassess relevant
  assumptions, do not re-investigate everything or duplicate analysis. A
  FAIL's Reason follows the flaw's root cause, not the phase it surfaced in:
  spec flaw → `spec`, plan flaw → `plan`, implementation flaw →
  `implementation` (existing scope-creep rule); never force the builder to
  satisfy faulty upstream instructions. Rationale presence or prior approval
  is never proof of soundness or an automatic PASS: reject provably
  unnecessary, duplicative, insecure or disproportionately complex technical
  choices. Judge from existing substance, never from headings or sections;
  uncertain findings downgrade to notes, but a concretely evidenced upstream
  flaw never downgrades merely because the artifact previously passed.
```

**(e) `generateOrchestratorTemplate` (~L534)** — unchanged. No gate text; the
reviewer's FAIL is the gate, routed exactly as today.

**(f) `generateWorkflowTemplate` (~L859):**

- Phase 2 Brainstorm (~L874–875): note that the spec's existing prose covers
  the necessity criteria proportionally.
- Phase 4 Architect Review (~L880–881): name the necessity check among the
  reviewer's plan-review duties, including the cumulative reassessment of
  the spec with the plan's evidence.
- Phase 6 Review (~L886–887): add "standing necessity check" alongside the
  test-pinned "standing scope-creep check" and "standing alignment check",
  including the recheck of plan/spec adequacy in light of implementation
  evidence.
- New short `## Necessity Gate` section after `## Ownership and Revised
  Plans` (~L897–899), before `## Orchestrator Routing and Loop Caps` (~L901):
  documents §4–§5 — the criteria (`${NECESSITY_CRITERIA}`), proportionality,
  cumulative scrutiny with root-cause Reasons, and that existing spec/plan
  prose is the evidence (no extra record, section or review pass).

## 7. Scope, weight, and delivery

- **Default scope:** spec-bearing new features and behavior changes.
  Bugfixes and refactors justify themselves in a sentence of existing prose
  when they touch data, dependencies or architecture at all.
- **Pre-gate specs** meet the check at their next plan review on their
  existing substance; an evidenced inadequacy FAILs with `Reason: spec` and
  stops at the user, as every spec FAIL does. The user's existing explicit
  decision and ownership rules suffice for any decline — if a user decision
  is referenced, it is referenced truthfully; no invented waiver regime.
- **Delivery:** normal `kiki update`; no migration or config change. The
  historian updates the README "Loop controls and review governance"
  standing-checks paragraph and the CHANGELOG; no test pins README prose.

## 8. Acceptance checklist

- [ ] Brainstormer, planner and reviewer prompts carry their necessity text,
  and the workflow its `## Necessity Gate` section, under default and custom
  path configs; the criteria block appears verbatim exactly once in each of
  brainstormer, reviewer and workflow.
- [ ] The orchestrator prompt and permission arrays are byte-identical
  (`tests/cli/oc2-permissions.test.ts` unchanged and green).
- [ ] No new text demands a record, section, checklist, per-field catalog,
  or waiver format; all new sentences use "in addition to the loaded skill"
  framing without restating Superpowers instructions.
- [ ] Reviewer body and workflow match no fourth-verdict/new-reason
  vocabulary and avoid R1's uppercase forbidden tokens; `Verdict: PASS |
  PASS_WITH_NOTES | FAIL` stays the only verdict line; the workflow registry
  schema block is untouched (R13); all R1–R18 pinned phrases are identical.
- [ ] README and CHANGELOG updated by the historian in the same change.

## 9. Test strategy (identify only)

- **`tests/cli/loop-controls.test.ts`** — primary surface: an R19-style test
  over `bodyOf(...)` for default and custom configs, pinning the criteria
  phrases, the artifact focuses, the cumulative-reassessment and
  root-cause-Reason sentences, the "heading or section" non-requirement, and
  the downgrade-rule sentence; negative assertions for forbidden vocabulary;
  workflow assertions extend the R9/R16 pattern with "standing necessity
  check". Existing R1–R18 must stay green untouched.
- **`tests/cli/install.test.ts`** — extend installed-file and
  `kiki/agentic-workflow.md` assertions (~L81–99) with one representative
  necessity phrase per prompt, `toContain` pattern.
- **`tests/cli/init.test.ts` / `update.test.ts`** — stay green; optional one
  phrase each.
- **No README-prose test exists or is added.**

## 10. Risks

- **Reviewer overreach into taste vetoes.** The reviewer might FAIL choices it
  merely dislikes. Mitigation: FAIL requires quoted concrete evidence of a
  substantive flaw (unnecessary, duplicative, insecure or disproportionately
  complex); product goals and explicitly informed user tradeoffs stay the
  user's; uncertain findings downgrade to notes.
- **Over-blocking.** The gate could stall small changes. Mitigation:
  proportionality is part of the criteria; the earlier N/A/waiver machinery is
  gone; the orchestrator blocks nothing on its own.
- **Boilerplate analysis.** Prose can satisfy the letter without the spirit;
  the probe requirement for negative claims is the main teeth. Residual risk
  accepted — the gate raises the floor, it does not guarantee honesty.
- **Wording collisions with pinned tests** — inventoried in §6(a)/§8.
- **Still guidance.** Prompt text proves presence, not obedience — the same
  honest status as every existing loop control.

## 11. Open questions / proposed defaults

- **Proposed defaults (not user-approved):** the `NECESSITY_CRITERIA` shared
  constant; the four criteria phrases as worded; which prompts change
  (brainstormer, planner, reviewer + workflow; orchestrator unchanged); the
  `## Necessity Gate` workflow heading.
- **Not changed:** verdicts, reasons, routing, caps, permissions, registry
  schema, runtime code, Superpowers files, the usage-diagnostics feature.
- **No contradiction found** with the user-settled enforcement: `FAIL +
  Reason spec` / `Reason plan` already route through the existing user-owned
  and planner loops, and uncertain findings already downgrade under the
  existing rule. Nothing was reopened; no unresolved questions remain.