# Kiki/Superpowers Pipeline → Benchmark Mapping

| Kiki / Superpowers Phase | BridgeBench | SWE-bench | Recommendation | Rationale |
|---|---|---|---|---|
| **Intake / Elicitation** | Reasoning | — | **BridgeBench Reasoning** | Tests grounded reasoning over mixed artifacts (requirements docs, specs). Closest proxy for clarifying ambiguous requirements. |
| **Brainstorming** (superpowers: brainstorming) | BS | — | **BridgeBench BS** | Tests ability to identify unsupported claims and construct rigorous arguments. Maps to spec-writing discipline. |
| **Planning** (superpowers: writing-plans) | Reasoning | — | **BridgeBench Reasoning** | Tests algorithmic planning and multi-step logical decomposition. Direct match for task breakdown. |
| **Architect Review** | Security | — | **BridgeBench Security** | Tests vulnerability detection and security boundary reasoning. Closest to guardrail auditing. |
| **Implementation** (superpowers: executing-plans + TDD) | UI / Debugging | Verified | **SWE-bench Verified** | Real GitHub issue resolution is the gold standard for actual coding performance. |
| **First Review** | Refactoring | — | **BridgeBench Refactoring** | Tests code quality, maintainability, and correctness. Direct match for code review. |
| **Second Review** (security/alignment audit) | Security | — | **BridgeBench Security** | Already used for Architect Review — same security reasoning applies. |
| **Escalation** (complex problem solving) | Reasoning | — | **BridgeBench Reasoning** | Tests hardest reasoning tasks. Fallback for when standard models fail. |

---

## Summary Table (Quick Reference)

| Phase | Benchmark |
|---|---|
| Intake | BridgeBench Reasoning |
| Brainstorm | BridgeBench BS |
| Plan | BridgeBench Reasoning |
| Architect Review | BridgeBench Security |
| Implement | SWE-bench Verified |
| First Review | BridgeBench Refactoring |
| Second Review | BridgeBench Security |
| Escalation | BridgeBench Reasoning |

---

## Notes

- **BridgeBench Reasoning** is used 3× — it's the most versatile proxy for cognitive tasks that aren't pure coding.
- **SWE-bench Verified** beats BridgeBench for Implementation because it measures real-world end-to-end issue resolution, not isolated coding tasks.
- **No benchmark exists** for pure "conversational elicitation" or "plan compliance" — Reasoning and BS are the closest proxies.
- **Security** serves double duty (Architect Review + Second Review) because both phases require vulnerability detection and boundary reasoning.

## Gaps That Remain

| Missing Capability | Why It Matters |
|---|---|
| **Interactive questioning quality** | Does the model ask the *right* clarifying questions? No benchmark measures this. |
| **Plan adherence** | Does the model stick to an approved plan without scope creep? No benchmark measures this. |
| **Cross-phase consistency** | Does the model maintain context and decisions across multiple phases? No benchmark measures this. |

These gaps are why Kiki's process discipline (task registry, inline reviews, alignment guardrails) remains valuable even with perfect benchmark-based routing.
