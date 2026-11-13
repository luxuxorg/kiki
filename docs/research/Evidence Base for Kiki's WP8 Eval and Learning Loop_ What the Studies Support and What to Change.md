# Evidence Base for Kiki's WP8 "Eval and Learning Loop": What the Studies Support, What to Change

The literature largely supports the brief's eval design: incident-derived cases, repeated runs, recorded replays, deterministic metrics, and gating every prompt, rule or model change on a fixed eval set. Three things should change: case 1 needs a separate reviewer-precision eval because replaying recorded reviewer outputs tests the orchestrator but not the reviewer; the escalation agent that judges reviewer findings must not be the same model family as the reviewer, and its verdicts must be calibrated against a small human-labelled set; and the "max 2 review rounds" cap should be backed by measured cost/success data, not only by Self-Refine.

## TL;DR

- **Mostly confirmed:** Anthropic's January 2026 engineering guide recommends starting with 20–50 tasks drawn from real failures, running multiple trials per task, preferring deterministic graders, and calibrating LLM graders against humans.\[1\] Peer-reviewed work (τ-bench, ICLR 2024 self-repair and self-correction papers, NeurIPS 2024 self-preference study) backs repeated runs, bounded feedback loops and distrust of same-model judging.
- **Change three things:** (1) evaluate the reviewer separately on frozen diffs with known ground truth, because LLM reviewers have high false-positive rates in published studies; (2) use a different model family for verdicts on reviewer findings and validate it against 30–50 user-confirmed labels; (3) set loop caps from your own round distribution — a peer-reviewed ICSE 2026 study found a turn cap at the 75th percentile of baseline cut cost 24–68% with minimal loss in solve rate.
- **Minimal design for a solo developer:** about 20 cases (the 3 incident cases plus slipped defects plus "should-not-trigger" controls), 5 runs per case for behavioural cases and 1 run for fully replayed deterministic cases, paired before/after comparison on the same cases, report pass^k and tokens/rounds per case, and adopt a change only if no case loses ≥2 of 5 runs and total tokens do not rise beyond a set budget. Small eval sets can only detect large effects; that is acceptable early on and is explicitly what Anthropic recommends.

## Kurzfassung (Deutsch)

Die Studienlage bestätigt den Kern von WP8: ein kleines Eval-Set aus eigenen Vorfällen, mehrere Läufe pro Fall, deterministische Kennzahlen, aufgezeichnete Replays und die Regel „keine Änderung, wenn das Eval-Set schlechter wird" – auch bei Modellwechseln. Anthropic empfiehlt ausdrücklich, mit 20–50 Aufgaben aus echten Fehlern zu starten. Drei Punkte sollten geändert werden: (1) Das Replay mit aufgezeichneten Reviewer-Ausgaben testet nur den Orchestrator, nicht den Reviewer – der Reviewer braucht einen eigenen Test auf eingefrorenen Diffs mit bekannter Wahrheit, denn LLM-Reviewer produzieren in Studien viele Fehlalarme. (2) Das Urteil über Reviewer-Findings sollte ein anderes Modell als der Reviewer fällen (LLMs bevorzugen nachweislich eigene Texte) und gegen 30–50 von dir bestätigte Beispiele geprüft werden – wobei du nur nicht-technische Fragen beantwortest („Nennt das Finding ein konkretes Szenario und eine Regel?"). (3) Die Grenze von 2 Review-Runden ist plausibel, sollte aber aus eigenen Daten abgeleitet werden; eine ICSE-2026-Studie zeigt, dass ein Limit beim 75. Perzentil die Kosten um 24–68 % senkt, fast ohne Erfolgsverlust. Statistisch gilt: Mit ~20 Fällen erkennt man nur große Verschlechterungen – das reicht am Anfang, aber kleine Unterschiede sollte man nicht interpretieren.

## Key Findings by Research Question

### 1. Foundations: benchmark design, pitfalls, reliability metrics, statistics, cost

**Benchmarks decay; human validation is necessary but not sufficient.**
- OpenAI's SWE-bench Verified (official blog, August 2024) annotated 1,699 random SWE-bench samples and kept 500 "verified to be non-problematic by our human annotators", screening for underspecified issues and invalid tests; it was produced with 93 professional developers. Study type: official report; limitation: annotation quality itself later questioned.\[2\]\[3\]
- SWE-Bench+ (Aleithan et al., arXiv:2410.06992, preprint, 2024) manually examined SWE-Agent+GPT-4's passed patches: 32.67% involved "solution leakage" (fix stated in the issue) and 31.08% passed only because tests were weak; the corrected resolution rate fell from 12.47% to 3.97%. The authors report the same issues in SWE-bench Verified.\[4\]\[5\] Limitation: one agent/model pair.
- In February 2026 OpenAI announced it no longer reports SWE-bench Verified, citing saturation from test-design issues and contamination. Its post "Why SWE-bench Verified no longer measures frontier coding capabilities" (23 Feb 2026) audited the 138 problems that o3 "did not consistently solve over 64 independent runs" and states: "We found that 59.4% of the 138 problems contained material issues in test design and/or problem description" (35.5% overly narrow tests, 18.8% overly wide tests). In a later post, "Separating signal from noise in coding evaluations" (8 Jul 2026, seen only via search snippet), OpenAI writes "we estimate that ~30% of SWE-bench Pro tasks are broken… we retract our earlier recommendation to adopt SWE-Bench Pro."
- SWE-Bench Pro (Scale AI, arXiv:2509.16941, preprint) has 1,865 human-verified tasks from 41 repositories, using copyleft and private commercial code to resist contamination; reference patches average 107.4 lines across 4.1 files, and frontier models scored under 25% pass@1 in the initial unified-scaffold evaluation.\[6\]\[7\]\[8\]
- Terminal-Bench 2.0 (Merrill et al., ICLR 2026, peer-reviewed; arXiv:2601.11868) has 89 tasks, each with a human-written solution and tests, reviewed by multiple humans; frontier agents scored under 65%.\[9\]\[10\] Even so, a November 2026 audit (arXiv:2611.08417, preprint) found issues in 28 of 89 tasks (~30%), leading to Terminal-Bench 2.1 — many from external state (packages, APIs) changing after release.\[11\]\[12\]
- Anthropic's guide reports that Opus 4.5 initially scored 42% on CORE-Bench and 95% after grading bugs (e.g., rejecting "96.12" vs "96.124991…"), ambiguous specs and scaffold constraints were fixed, and states that "a 0% pass rate across many trials… is most often a signal of a broken task."\[1\]

**Implication for Kiki:** your own eval cases will have the same defects at small scale (ambiguous expected outcomes, tests that pass wrong behaviour, environment drift). Every case needs a reference outcome proven to pass, and a "known-bad" variant proven to fail.

**Reliability metrics.** τ-bench (Yao et al., arXiv:2406.12045; later ICLR 2025) introduced pass^k — probability that all k trials succeed — and found GPT-4o-based function-calling agents succeeded on <50% of tasks with pass^8 <25% in retail. Anthropic's guide adopts pass@k vs pass^k and illustrates: at 75% per-trial success, pass^3 ≈ 42%.\[1\]\[13\] For a pipeline that must reliably stop on permission blocks, pass^k is the right metric, not average success.

**Statistics for small eval sets.** Miller (Anthropic), "Adding Error Bars to Evals" (arXiv:2411.00640, preprint, 2024) recommends: report standard errors; use clustered standard errors when questions are grouped (his Table 4 shows "clustered standard errors can be over 3X larger than naive standard errors", a ratio of 3.05 on DROP); compare models with paired differences on the same questions, which reduces variance; reduce within-question variance by resampling each question multiple times; and use power analysis to choose the number of questions. Anthropic's 2026 guide adds the pragmatic counterpoint: early on, "each change to the system often has a clear, noticeable impact, and this large effect size means small sample sizes suffice."

**Infrastructure noise.** Anthropic's "Quantifying infrastructure noise in agentic coding evals" (engineering blog, 2026) found infra error rates fell from 5.8% under strict resource enforcement to 0.5% uncapped, and concluded small score differences on agentic evals "carry more uncertainty than the precision of the reported numbers suggests."\[14\] Kiki's case 3 (provider protocol error) is exactly such a confounder and must be isolated deterministically.

**Cost-aware evaluation.** Kapoor et al., "AI Agents That Matter" (arXiv:2407.01502; TMLR) found simple baselines (retry, warming, escalation) matched complex agents such as LATS and Reflexion on HumanEval at far lower cost, and that cost was absent as a top-line metric in the papers they reviewed.\[15\]\[16\] The Holistic Agent Leaderboard (HAL, arXiv:2510.11977, preprint) ran 21,730 rollouts across 9 models and 9 benchmarks (~$40,000) and found the most expensive run on the Pareto frontier in only 1 of 9 benchmarks.\[17\]\[18\] Accuracy without tokens-per-task is not an adequate metric for Kiki.

### 2. Small, team-specific eval sets from incidents

- **Anthropic, "Demystifying evals for AI agents" (engineering guide, 9 Jan 2026; first-party blog, not peer-reviewed):** "20-50 simple tasks drawn from real failures is a great start"; convert bug-tracker items into cases; write unambiguous tasks where "two domain experts would independently reach the same pass/fail verdict"; build balanced sets that test both when a behaviour should and should not occur ("One-sided evals create one-sided optimization"); isolate each trial in a clean environment (Claude once gained an unfair advantage by reading git history from previous trials); grade outcomes rather than exact paths; read transcripts; distinguish capability evals (low pass rate) from regression evals ("should have a nearly 100% pass rate").\[1\]
- **Shankar et al., "Who Validates the Validators?" (UIST 2024, peer-reviewed; qualitative study with 9 expert users):** identified "criteria drift" — "users need criteria to grade outputs, but grading outputs helps users define criteria", concluding it is impossible to fully define criteria before looking at outputs.\[19\]\[20\] Implication: the verdict categories (valid / overstated / out of scope) will need revision after the first labelling round; plan for that.
- **How many cases is enough:** no study gives a universal number. The evidence-based answer is: 20–50 to start (Anthropic, practitioner guidance), with enough runs per case to estimate per-case reliability, and growth driven by new incidents. Statistical power depends on effect size: in Miller's worked example, detecting a 3-point difference needs about 969 questions ("new evals should contain at least 1,000 questions"), and with 198 questions, going from 1 to 10 samples per question lowers the minimum detectable effect from 13.2% to 7.5%.

### 3. LLM-as-judge and LLM-as-reviewer reliability

- **Agreement and biases:** Zheng et al., "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena" (NeurIPS 2023 Datasets & Benchmarks, peer-reviewed): GPT-4 judges reached over 80% agreement with human preferences, matching human–human agreement, but showed position bias, verbosity bias, self-enhancement bias and limited reasoning on maths/logic grading.\[21\]\[22\] Limitation: chat answers, not code review.
- **Self-preference:** Panickssery, Bowman & Feng, "LLM Evaluators Recognize and Favor Their Own Generations" (NeurIPS 2024, oral): GPT-4, GPT-3.5 and Llama 2 disproportionately favour their own outputs, with a linear correlation between self-recognition ability and self-preference strength.\[23\]\[24\]\[25\] Limitation: summarisation tasks.\[26\]\[27\] Implication: the escalation agent must not share a model with the reviewer or implementer whose output it judges.
- **LLM code-review precision is low in published studies:**
  - "Automated Code Review in Practice" (Cihan et al., arXiv:2412.18531; industrial study at Beko, 4,335 PRs across projects, plus 22-practitioner survey): 73.8% of automated comments were marked resolved, but pull-request closure time rose from 5 h 52 min to 8 h 20 min, and practitioners reported faulty reviews, unnecessary corrections and irrelevant comments.\[28\]
  - SWR-Bench (arXiv:2509.01494, preprint): best overall F1 for LLM review-comment generation was about 19%; a sample of 100 of 1,101 false positives from a Gemini-2.5-Pro-based reviewer were traced mainly to misunderstood context and missing domain knowledge.\[29\]
  - Tencent industrial study (arXiv:2601.18844, preprint, 433 static-analysis alarms): 76% of alarms were false positives; LLM-based filtering removed 94–98% of false positives while keeping high recall.\[30\]\[31\] This supports using an LLM to *triage* findings, not to generate unconstrained blockers.
- **Mitigations with evidence:** Anthropic recommends structured rubrics, grading each dimension with an isolated judge, an explicit "Unknown" escape option, and close calibration against human experts.\[1\] Zheng et al. show position-swapping and reference-guided grading reduce bias.\[32\]

**Evidence gap:** I found no controlled study showing that requiring a "concrete failure scenario" per finding reduces false positives in LLM code review. The rule is consistent with rubric guidance and SWR-Bench's root-cause analysis, but it is unvalidated — measure it on Kiki's own data.

### 4. Iterative refinement loops and multi-agent failure modes

- **Self-Refine** (Madaan et al., NeurIPS 2023): gains across 7 tasks, with most improvement in early iterations (diminishing returns). Limitation: same model gives feedback; tasks mostly not agentic coding.
- **Olausson et al., "Is Self-Repair a Silver Bullet for Code Generation?"** (ICLR 2024; Code Llama, GPT-3.5, GPT-4 on HumanEval and APPS): when cost is accounted for, "performance gains are often modest, vary a lot between subsets of the data, and are sometimes not present at all." Self-repair is bottlenecked by feedback quality — feedback from a stronger model or from humans improved repair substantially.\[33\]\[34\] Implication: one round of good feedback beats many rounds of weak feedback; the reviewer's quality matters more than the round count.
- **Huang et al., "Large Language Models Cannot Self-Correct Reasoning Yet"** (ICLR 2024): without external feedback, self-correction often fails to improve and sometimes degrades reasoning performance, because models "cannot properly judge the correctness of their reasoning" — they flip correct answers to wrong ones. A later secondary note suggests frontier reasoning models may behave better; that update is not peer-reviewed.\[35\]\[36\]
- **MAST — Cemri et al., "Why Do Multi-Agent LLM Systems Fail?"** (arXiv:2503.13657; reported as NeurIPS 2025): 1,600+ annotated traces across 7 multi-agent frameworks; 14 failure modes in 3 categories — specification/system design, inter-agent misalignment, task verification — with inter-annotator Cohen's κ = 0.88. MAST v3 (1,642 traces) reports per-mode shares including step repetition 15.7%, unawareness of termination conditions 12.4%, reasoning–action mismatch 13.2%, and ignoring other agents' input 1.9%. Modes directly matching Kiki's incident include step repetition, unawareness of termination conditions, ignoring other agents' input (orchestrator ignoring escalation), and incorrect/incomplete verification. MAST also provides an LLM-as-judge annotator (OpenAI o1 with few-shot prompting) that reached 94% accuracy and Cohen's κ = 0.77 against human experts in MAST v3, and can label Kiki traces.

**Implication for the 2-round cap:** the evidence supports a *low* cap and escalation over continued looping, but not specifically "2". The ICSE 2026 turn-control study (below) gives a data-driven way to pick the number.

### 5. Runaway costs, step limits, budgets

- **"More with Less: An Empirical Study of Turn-Control Strategies for Efficient Coding Agents"** (arXiv:2510.16786; ICSE 2026 Research Track, peer-reviewed): 3 models on a 100-task SWE-bench Verified subset. A fixed turn limit at the 75th percentile of the unrestricted baseline cut cost by 24–68% with minimal impact on solve rate; a dynamic strategy that grants extensions on demand cut a further 12–24%. Gemini 2.5 Pro's solve rate even rose slightly under the cap.\[37\]\[38\]\[39\] Limitation: single-agent loops, 100 tasks.
- **HAL** (above): higher reasoning effort reduced accuracy in many runs; cost is not monotonic with quality.\[17\]
- Anthropic's guide lists turns, tool calls and total tokens as standard tracked transcript metrics for coding agents.\[1\]

**Implication:** Kiki's 48 h / ~200M-token incident is a classic unbounded-loop failure. Hard caps on rounds, tokens and wall-clock time — with forced escalation to the user at the cap — are evidence-supported, and their thresholds should be set from Kiki's own distribution of successful tasks (e.g., 75th percentile).

### 6. Evaluating model and prompt changes safely

- **Model swaps must be evaluated:** Anthropic's guide states teams with evals "can quickly determine the model's strengths, tune their prompts, and upgrade in days."\[1\] The GPT-5 system card notes "changes in verbosity can lead to variation in eval performance" — even a settings change moves scores.\[40\]
- **Paired comparison:** Miller recommends the paired standard error whenever two configurations run on the same questions.\[41\]
- **Overfitting to the eval set:** OPRO (Yang et al., ICLR 2024) found prompt-optimised instructions had training accuracies "often 5%-20% higher than our test accuracies"; other preprints report TextGrad-style optimisers overfitting validation sets.\[42\]\[43\] Kapoor et al. also call for held-out sets to avoid benchmark overfitting.\[15\]
- **Self-modification degrading judges:** I found no direct study showing an LLM reviewer drifts toward leniency when it edits its own prompt. The concern is reasonable by inference from self-preference bias (Panickssery) and optimiser overfitting (OPRO), but the brief should label it as a precaution, not an established finding.

### 7. Replay, deterministic simulation, and tool-error/permission handling

- **Non-determinism is real even at temperature 0:** Atil et al. (arXiv:2408.04667, preprint): 5 "deterministic" LLMs, 8 tasks, 10 runs — accuracy varied up to 15% across runs, with best-to-worst gaps up to 70%.\[44\] Thinking Machines Lab ("Defeating Nondeterminism in LLM Inference", 2025, first-party blog): 1,000 temperature-0 completions of one prompt produced 80 unique outputs; batch-invariant kernels made all 1,000 identical, at a speed cost.\[45\]\[46\] Implication: recording and injecting outputs is the only reliable way to make Kiki replays deterministic.
- **Record-and-replay for agent regression tests:** Chronicle (Chawla & Koul, arXiv:2609.20625, Sep 2026, preprint) records every model call, tool call and routing decision, then replays some from the recording and runs the rest live with new code, turning incidents into CI tests; full replay was bit-stable over 20 repetitions with zero model calls, and cut-point tests caught faulty code in all 6 recorded incidents.\[47\]\[48\] Limitation: 6 synthetic incidents. Tooling exists (LangSmith's pytest cassette cache; Pydantic AI's TestModel with real model calls disabled),\[49\]\[50\] but I found no peer-reviewed study quantifying replay's benefit.
- **Permission and tool-error handling:** CRITICTOOL (arXiv:2506.13977, preprint) explicitly names errors such as "connection timeouts or lack of user permissions" that "may cause the assistant to endlessly retry failed calls"; in existing benchmarks GPT-4o recovered from tool errors in only 17–54% of cases.\[51\] ToolEmu (Ruan et al., ICLR 2024; 36 tools, 144 test cases) found even the safest agent failed 23.9% of the time, and 68.8% of emulator-found failures were validated as real.\[52\] Agent-SafetyBench (arXiv:2412.14470, preprint; 349 environments, 2,000 cases, 16 agents) found no agent above 60% safety and that defence prompts alone may be insufficient.\[53\] ReliabilityBench (arXiv:2601.06112, single-author preprint; 1,280 episodes) found rate limiting the most damaging injected fault.\[54\]

**Implication:** Kiki's case 2 (permission block → stop, 0 retries, 0 escalations) targets a documented, common weakness — and prompt rules alone are unlikely to fix it. A deterministic harness guard (retry counter) is better supported than prompt instruction.

## Implications for Each Element of the Brief

| Brief element | Verdict | Evidence and refinement |
|---|---|---|
| Eval set from own incidents (cases 1–3 + slipped defects) | **Confirmed** | Anthropic: 20–50 tasks from real failures. **Add** "should-not-trigger" controls (e.g., a clean diff where the reviewer should raise no blocker; a permitted tool call that should proceed) — one-sided evals create one-sided optimisation. |
| Several runs per case; success rate counts | **Confirmed; refine** | τ-bench, Anthropic, Atil et al. Report pass^k per case (all runs must pass) for safety behaviours like stopping on permission blocks; report mean success for capability cases. |
| Replay by injecting recorded reviewer outputs | **Confirmed, but incomplete** | Non-determinism evidence (Atil; Thinking Machines) and Chronicle support it. **But** it tests only the orchestrator/escalation logic. Add a separate reviewer eval: frozen diffs with known real defects and known non-issues, scored for precision/recall of blockers. |
| Escalation agent proposes verdicts; user confirms samples | **Should change** | Self-preference (Panickssery) → use a different model family from the reviewer. Calibration (Anthropic, Shankar) → user labels 30–50 items once, then spot-checks. Because the user is a non-programmer, ask only non-technical questions (Is a concrete scenario stated? Is a rule cited? Is the file/line in the diff?) — these are checkable deterministically or by a layperson. |
| Weekly retro with deterministic metrics | **Confirmed** | Anthropic lists turns, tool calls, tokens as standard tracked metrics; Kapoor/HAL support cost as a first-class metric. Add per-case pass^k and "rounds-to-cap reached" counts. |
| Model step proposes diff with evidence; never self-applied | **Confirmed as precaution** | No direct study of judge self-modification; supported indirectly by self-preference and OPRO overfitting (5–20% train–test gaps). Keep it, and evaluate every proposed diff on the eval set before adoption. |
| Adopt changes only if eval set does not get worse; model switches too | **Confirmed; tighten** | Anthropic, Miller (paired comparison), GPT-5 system card (settings change scores). Define "worse" numerically in advance (rule below) and keep a few hold-out cases the change-proposing step never sees. |
| Structured findings: severity, scenario, cited rule; blockers without scenario downgraded | **Partly supported** | Rubric/structured judging recommended (Anthropic); LLM reviewer false positives well documented (SWR-Bench, Cihan et al.). The downgrade rule itself is unvalidated — measure blocker precision before/after on the reviewer eval. |
| Max 2 review rounds | **Partly supported; make data-driven** | Self-Refine (diminishing returns), Olausson (modest gains, feedback-quality bottleneck), Huang (self-correction can degrade), ICSE 2026 turn-control study (75th-percentile cap cuts cost 24–68%). Keep 2 as a default, plus token and wall-clock caps, with forced user escalation at cap; revisit after collecting round counts. |
| Solo non-programmer; deterministic checks preferred | **Confirmed** | Anthropic: "choosing deterministic graders where possible, LLM graders where necessary".\[1\] |

## Recommended Minimal Eval Design (Solo Developer)

1. **Cases (start with ~20; grow from incidents).** 3 incident cases; 5–10 slipped-defect cases; 5 "should-not-trigger" controls; 3–5 reviewer-precision cases (frozen diffs with known ground truth). Rationale: Anthropic's 20–50 starting range.
2. **Each case has:** a fixed input snapshot, a deterministic expected outcome (e.g., "pipeline stopped; retries = 0; escalations = 0"; "no blocker raised"; "defect X flagged"), and a reference run proven to pass plus a known-bad variant proven to fail.
3. **Runs per case.** 1 run for fully replayed (recorded) cases — they are deterministic by construction. 5 runs for live behavioural cases. Interpretation via the standard "rule of three": 0 failures in n runs bounds the true failure rate below about 3/n at 95% confidence, so 5 clean runs only show the failure rate is likely under ~60%, and 10 clean runs under ~30%. This is why small suites detect only large regressions.
4. **Metrics per case:** pass^k (all runs pass), mean success, review rounds, tokens, wall-clock time, retries, escalations, blockers raised and blockers confirmed valid.
5. **Decision rule for adopting any change (prompt, rule, model):** run the full suite on old and new configurations on the same cases (paired, per Miller). Reject if any regression case drops from all-pass to ≥2 failures out of 5, or any safety case (permission stop) fails at all, or median tokens per task rise by more than a preset budget (e.g., 20%). This threshold is my recommendation for a non-statistician, not a published standard; it trades sensitivity for zero required judgement.
6. **Caps in production:** max 2 review rounds, a token budget and a wall-clock limit per task; at any cap, stop and escalate to the user. Re-set caps after a month to the 75th percentile of successful tasks (ICSE 2026 study).
7. **Judge calibration:** one-time user labelling of 30–50 reviewer findings using only non-technical questions; compute agreement between the verdict model and the user; re-check 5 samples monthly to catch criteria drift.
8. **Hold-out:** keep about 20% of cases hidden from the weekly retro's change-proposing step, to detect overfitting.

## Caveats

- Much of the most relevant evidence is first-party blog guidance (Anthropic) or preprints; the peer-reviewed core is τ-bench, Zheng et al., Panickssery et al., Olausson et al., Huang et al., Self-Refine, Shankar et al., ToolEmu, OPRO, Terminal-Bench and the ICSE 2026 turn-control study.
- Most findings come from single-agent coding or chat settings; multi-agent coding pipelines like Kiki are directly studied only by MAST and a few preprints.
- No source validates specific numbers like "2 rounds" or "5 runs" for a pipeline like Kiki; the numbers above are defensible starting points to be revised from your own data.
- The 2026 SWE-bench Verified audit figure (59.4% of 138 problems) comes from OpenAI's own 23 Feb 2026 post. The ~30% broken SWE-bench Pro estimate and the retraction come from OpenAI's 8 Jul 2026 post, which I saw only via a search snippet, so check that page before quoting it.

## Quellen

1. [Demystifying evals for AI agents](https://www.anthropic.com/research/demystifying-evals-for-ai-agents)
2. [Introducing SWE-bench Verified](https://openai.com/index/introducing-swe-bench-verified/)
3. [Are “Solved Issues” in SWE-bench Really Solved Correctly? An Empirical Study](https://arxiv.org/html/2503.15223v1)
4. [SWE-Bench+: Enhanced Benchmark for LLMs](https://www.emergentmind.com/papers/2410.06992)
5. [Engineering Reliable Coding Agents: Evaluating and Operating the System Around the Model](https://arxiv.org/pdf/2608.13867)
6. [SWE-Bench Pro: Can AI Agents Solve Long-Horizon Software Engineering Tasks?](https://www.alphaxiv.org/abs/2509.16941)
7. [arXiv:2509.16941v2 \[cs.SE\] 14 Nov 2025 SWE-Bench Pro: Can AI Agents Solve](https://arxiv.org/pdf/2509.16941)
8. [SWE-Bench Pro: AI on Software Engineering Tasks](https://labs.scale.com/papers/swe_bench_pro)
9. [\[2601.11868\] Terminal-Bench: Benchmarking Agents on Hard, Realistic Tasks in Command Line Interfaces](https://arxiv.org/abs/2601.11868)
10. [Published as a conference paper at ICLR 2026 TERMINAL-BENCH: BENCHMARKING](https://proceedings.iclr.cc/paper_files/paper/2026/file/444a3737adaee10d86ad2ef5f74468e6-Paper-Conference.pdf)
11. [Benchmarks as Software: Terminal-Bench and the Case for Continuous Benchmarks](https://arxiv.org/pdf/2611.08417v1)
12. [Balance of Benchmarks: Semantic Density Reweighting for Task-Conditioned Model Comparison](https://arxiv.org/pdf/2608.30044)
13. [\$\\tau\$-bench: A Benchmark for Tool-Agent-User Interaction in Real-World Domains - ADS](https://ui.adsabs.harvard.edu/abs/2024arXiv240612045Y/abstract)
14. [Infrastructure noise in agentic coding evals \\ Anthropic](https://www.anthropic.com/engineering/infrastructure-noise)
15. [AI Agents That Matter — Lacuna](https://lacuna.tiptreesystems.com/work/ai-agents-that-matter/wrk_5fadaa13ed8be20303ff07ad592a452f)
16. [Why AI Agent Benchmarks Ignore Cost (And Why It Matters)](https://calltothink.com/blog/agent-benchmarks-ignore-cost/)
17. [AI evals are becoming the new compute bottleneck](https://huggingface.co/blog/evaleval/eval-costs-bottleneck)
18. [Holistic Agent Leaderboard HOLISTIC AGENT LEADERBOARD:](https://arxiv.org/pdf/2510.11977)
19. [Who Validates the Validators? Aligning LLM-Assisted Evaluation of LLM Outputs with Human Preferences](https://dl.acm.org/doi/fullHtml/10.1145/3654777.3676450)
20. [\[2404.12272\] Who Validates the Validators? Aligning LLM-Assisted Evaluation of LLM Outputs with Human Preferences](https://ar5iv.labs.arxiv.org/html/2404.12272)
21. [Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena Lianmin Zheng1∗](https://arxiv.org/pdf/2306.05685)
22. [\[PDF\] Judging LLM-as-a-judge with MT-Bench and Chatbot Arena](https://www.semanticscholar.org/paper/Judging-LLM-as-a-judge-with-MT-Bench-and-Chatbot-Zheng-Chiang/a0a79dad89857a96f8f71b14238e5237cbfc4787)
23. [LLM evaluators recognize and favor their own generations](https://dl.acm.org/doi/10.5555/3737916.3740113)
24. [LLM Evaluators Recognize and Favor Their Own Generations](https://www.researchgate.net/publication/397200002_LLM_Evaluators_Recognize_and_Favor_Their_Own_Generations)
25. [NeurIPS Oral LLM Evaluators Recognize and Favor Their Own Generations](https://neurips.cc/virtual/2024/oral/97998)
26. [LLM Evaluators Recognize and Favor Their Own Generations](https://arxiv.org/pdf/2404.13076)
27. [NeurIPS Poster LLM Evaluators Recognize and Favor Their Own Generations](https://neurips.cc/virtual/2024/poster/96672)
28. [Automated Code Review In Practice](https://www.alphaxiv.org/abs/2412.18531)
29. [SWR-Bench: Assessing LLM Performance in Real-World Code Review Comment Generation](https://arxiv.org/pdf/2509.01494)
30. [Is AI Code Review Actually Worth It — What Measured Evidence Says About Accuracy and False Positives — TT Lab Blog](https://ttlab.hopto.org/blog/2026-07-17-ai-code-review-measured-evidence?lang=en)
31. [arxiv.org](https://arxiv.org/pdf/2601.18844)
32. [Testing the Testers: Human-Driven Quality Assessment of Voice AI Testing Platforms](https://arxiv.org/pdf/2511.04133)
33. [Is Self-Repair a Silver Bullet for Code Generation?](https://www.alphaxiv.org/abs/2306.09896)
34. [ICLR Poster Is Self-Repair a Silver Bullet for Code Generation?](https://iclr.cc/virtual/2024/poster/17429)
35. [Large Language Models Cannot Self-Correct Reasoning Yet — Paper Notes + 2026 Update - HackMD](https://hackmd.io/@BE82wIFmQzuVS__XrwkYWA/HJBPK8IrGg)
36. [LARGE LANGUAGE MODELS CANNOT SELF-CORRECT ...](https://proceedings.iclr.cc/paper_files/paper/2024/file/8b4add8b0aa8749d80a34ca5d941c355-Paper-Conference.pdf)
37. [\[2510.16786\] More with Less: An Empirical Study of Turn-Control Strategies for Efficient Coding Agents](https://arxiv.org/abs/2510.16786)
38. [More with Less: An Empirical Study of Turn-Control Strategies for Efficient Coding Agents (ICSE 2026 - Research Track) - ICSE 2026](https://conf.researchr.org/details/icse-2026/icse-2026-research-track/208/More-with-Less-An-Empirical-Study-of-Turn-Control-Strategies-for-Efficient-Coding-Ag)
39. [More with Less: An Empirical Study of Turn-Control Strategies for Efficient Coding Agents — Lacuna](https://lacuna.tiptreesystems.com/work/more-with-less-an-empirical-study-of-turn-control-strategies-for-efficient/wrk_f13a9c37ada912ac9d53f526bf5642f2)
40. [OpenAI GPT-5 System Card](https://arxiv.org/pdf/2601.03267)
41. [Adding Error Bars to Evals: A Statistical Approach to Language Model Evaluations](https://arxiv.org/html/2411.00640v1)
42. [How to Auto-optimize Prompts for Domain Tasks? Adaptive Prompting and Reasoning through Evolutionary Domain Knowledge Adaptation](https://arxiv.org/html/2510.21148)
43. [Large Language Models as Optimizers](https://arxiv.org/pdf/2309.03409)
44. [Non-Determinism of "Deterministic" LLM Settings](https://arxiv.org/abs/2408.04667)
45. [Defeating Nondeterminism in LLM Inference - Thinking Machines Lab](https://thinkingmachines.ai/blog/defeating-nondeterminism-in-llm-inference/)
46. [Why Temperature 0 Isn't Deterministic](https://towardsdatascience.com/why-temperature-0-isnt-deterministic/)
47. [Chronicle: Cut-Point Replay for Regression Testing of LLM Agents](https://arxiv.org/html/2609.20625v1)
48. [\[2609.20625\] Chronicle: Cut-Point Replay for Regression Testing of LLM Agents](https://arxiv.org/abs/2609.20625)
49. [Going to Production](https://pydantic.dev/docs/ai/production/)
50. [How to run evaluations with pytest (beta) - Docs by LangChain](https://translate.google.com/translate?u=https%3A%2F%2Fdocs.smith.langchain.com%2Fevaluation%2Fhow_to_guides%2Fpytest&hl=es&sl=en&tl=es&client=srp)
51. <https://arxiv.org/html/2506.13977>
52. [Identifying the Risks of LM Agents with an LM-Emulated Sandbox](https://arxiv.org/abs/2309.15817)
53. [Agent-SafetyBench: Evaluating the Safety of LLM Agents](https://arxiv.org/abs/2412.14470)
54. [ReliabilityBench: Evaluating LLM Agent Reliability Under Production-Like Stress Conditions](https://arxiv.org/abs/2601.06112)
