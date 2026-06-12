# Kiki Evolved: OpenCode Plugin + Dynamic Benchmark-Driven Model Routing

**Date:** 2026-06-12  
**Status:** Design Approved  
**Scope:** Complete architectural evolution of Kiki from standalone framework to thin OpenCode plugin + CLI with live benchmark-driven model routing.

---

## 1. Goal

Transform Kiki from a monolithic multi-agent scaffolding tool into a **thin OpenCode plugin + CLI** that:
1. Dynamically routes tasks to the optimal LLM model based on live benchmark data (BridgeBench) and cost data (OpenRouter)
2. Enforces process discipline (superpowers pipeline, quality gates, progress tracking)
3. Requires minimal configuration — model pool is defined by user's OpenCode provider keys

**Key outcomes:**
- From 9 agent files to 1 orchestrator agent
- From static model-per-role to dynamic score-per-dollar optimization
- From standalone framework to OpenCode-native plugin
- Zero manual model selection — fully automated based on live data

---

## 2. Problem Statement (Current Kiki Flaws)

### 2.1 Static Model Assignment
Kiki's `models.json` hardcodes primary/fallback models per role. This is outdated the moment benchmark leaderboards shift or pricing changes. Users must manually update configs.

### 2.2 Too Many Agents
9 separate agent definition files create maintenance overhead and obscure the fact that all phases invoke superpowers skills anyway.

### 2.3 No Cost Optimization
Kiki selects models by role, not by cost-efficiency. A $0.01 model might solve a simple task as well as a $0.50 model, but Kiki always uses the expensive one.

### 2.4 Standalone vs. Native
Kiki scaffolds its own `.opencode/agents/` directory, duplicating functionality OpenCode already has natively (custom agents, subagent dispatch, skills).

---

## 3. Architecture

Kiki is now **two things:**
1. **An OpenCode plugin** (`.opencode/plugins/kiki.ts`) that intercepts task dispatch and overrides the model
2. **A CLI tool** (`kiki`) for `init`, `status`, `verify`, and benchmark cache management

```
┌─────────────────────────────────────────────────────────────┐
│                     OpenCode Platform                       │
├─────────────────────────────────────────────────────────────┤
│  User Prompt → Primary Agent (kiki-orchestrator.md)         │
│       │                                                     │
│       ├──► Plan mode: Ask clarifying questions              │
│       │                                                     │
│       ├──► Build mode: Dispatch skill via task tool         │
│       │           │                                         │
│       │           ▼                                         │
│       │    ┌──────────────┐                                 │
│       │    │ Kiki Plugin  │ intercepts task dispatch       │
│       │    │              │ reads skill + task description │
│       │    │              │ classifies domain + risk       │
│       │    │              │ looks up routing table         │
│       │    │              │ overrides model parameter      │
│       │    └──────────────┘                                 │
│       │           │                                         │
│       │           ▼                                         │
│       │    Subagent dispatched with optimal model           │
│       │                                                     │
│       └──► Update TASK_REGISTRY.json                        │
└─────────────────────────────────────────────────────────────┘
```

### 3.1 Design Principles

1. **OpenCode owns execution.** Agents, subagent dispatch, skills — all native OpenCode features.
2. **Kiki owns routing.** The plugin decides which model the subagent uses.
3. **Kiki owns discipline.** Task registry, alignment auditing, interactive intake.
4. **Live data drives decisions.** Benchmark scores and pricing update automatically.

---

## 4. Components

### 4.1 OpenCode Plugin (`kiki.ts`)

**Location:** `.opencode/plugins/kiki.ts`

**Hooks:**
- `tool.execute.before` — intercepts `task` tool dispatch
- `session.created` — initializes task registry entry

**What it does:**
1. Detects when a subagent is being dispatched for a superpowers skill
2. Reads the task description to classify:
   - **Skill**: brainstorming / writing-plans / executing-plans / reviewing
   - **Domain**: gui / backend / security / database / general (inferred from task text)
   - **Risk**: critical / high / medium / low / micro (from `.agentic/config.json` risk paths)
3. Looks up the pre-computed routing table
4. Overrides the `model` parameter in the task dispatch

**Plugin pseudocode:**
```typescript
export const KikiPlugin = async ({ client }) => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool === "task" && isSuperpowersSkill(output.args.skill)) {
        const skill = output.args.skill;
        const taskDesc = output.args.prompt;
        const domain = classifyDomain(taskDesc);
        const risk = classifyRisk(taskDesc, config);
        
        const routingTable = await loadRoutingTable();
        const model = routingTable.lookup(skill, domain, risk);
        
        output.args.model = model;
        await logRoutingDecision(skill, domain, risk, model);
      }
    }
  };
};
```

### 4.2 Kiki Agent Architecture

Kiki uses **1 primary agent + 4 sub-agents** with path-based permission boundaries.

#### 4.2.1 Kiki Orchestrator (Primary)

**File:** `.opencode/agents/kiki-orchestrator.md`  
**Role:** Routes workflow, manages intake, updates registry.

```markdown
---
description: Kiki Orchestrator — routes the superpowers pipeline
mode: primary
---
You are the Kiki Orchestrator. Guide the user through a disciplined SE process.
1. Intake: Ask clarifying questions
2. Dispatch skills via task tool (plugin picks the model)
3. Quality gates: architect review inline, reviewer inline
4. Update TASK_REGISTRY.json after every phase
```

#### 4.2.2 Kiki Researcher (Subagent)

**File:** `.opencode/agents/kiki-researcher.md`  
**Skills:** `brainstorming`, `writing-plans`, `requesting-code-review` (architect review)  
**Permissions:** Can write to `docs/superpowers/*`, cannot touch source code.

```markdown
---
description: Kiki Researcher — writes specs and plans, never source code
mode: subagent
permission:
  edit:
    "docs/superpowers/*": allow
    "src/*": deny
    "tests/*": deny
    "*": deny
  bash:
    "git diff*": allow
    "git log*": allow
    "*": deny
---
You write design docs (specs, plans, reviews). You do NOT write source code.
Dispatch superpowers skills. The Kiki plugin selects your model.
```

**Why this boundary:**
- **Security:** Cannot read `.env` or credentials hidden in source trees
- **Accident prevention:** Cannot "helpfully" rewrite `package.json` while researching
- **Process integrity:** Spec must be approved before implementation starts

#### 4.2.3 Kiki Implementer (Subagent)

**File:** `.opencode/agents/kiki-implementer.md`  
**Skills:** `executing-plans`, `test-driven-development`  
**Permissions:** Can write to `src/*` and `tests/*`, cannot modify approved plans.

```markdown
---
description: Kiki Implementer — writes code and tests per approved plan
mode: subagent
permission:
  edit:
    "src/*": allow
    "tests/*": allow
    "docs/superpowers/*": deny
    "*": deny
  bash: allow
---
You implement code strictly per the approved plan. You do NOT modify specs or plans.
Dispatch superpowers skills. The Kiki plugin selects your model.
```

**Why this boundary:**
- **Scope discipline:** Cannot change the plan to avoid hard work
- **Blame clarity:** If build breaks, we know an implementer touched `src/`

#### 4.2.4 Kiki Reviewer (Subagent)

**File:** `.opencode/agents/kiki-reviewer.md`  
**Skills:** Code review, security audit  
**Permissions:** Read-only. Can run build/test commands.

```markdown
---
description: Kiki Reviewer — read-only code and security review
mode: subagent
permission:
  edit: deny
  bash:
    "*": allow
---
You review code against the approved plan. You do NOT write code.
Dispatch review skills. The Kiki plugin selects your model.
```

**Why this boundary:**
- **Independent verification:** A reviewer who can edit is not a reviewer
- **Security audit:** Cannot accidentally "fix" a vulnerability they find — must report it

#### 4.2.5 Kiki Escalation (Subagent)

**File:** `.opencode/agents/kiki-escalation.md`  
**Role:** Diagnoses loop failures, recommends redesign/stop  
**Permissions:** Read-only.

```markdown
---
description: Kiki Escalation — diagnoses failures and recommends next steps
mode: subagent
permission:
  edit: deny
  bash:
    "git diff*": allow
    "git log*": allow
    "*": deny
---
You diagnose why the pipeline failed. Recommend: redesign, split, or stop.
Read-only. The Kiki plugin selects your model.
```

**Why this boundary:**
- **Neutral arbiter:** Cannot bias diagnosis by "fixing" evidence
- **Safe halt:** Cannot write code to "save" a failing task — must honestly recommend stop

### 4.3 Routing Table

**Location:** `.agentic/routing.json` (auto-generated, refreshed every 24h)

**Schema:**
```json
{
  "version": "1.0.0",
  "generated_at": "2026-06-12T10:00:00Z",
  "sources": {
    "benchmarks": "BridgeBench (scraped 2026-06-12)",
    "pricing": "OpenRouter API (2026-06-12)"
  },
  "rules": [
    {
      "skill": "brainstorming",
      "domain": "gui",
      "risk": "critical",
      "model": "anthropic/claude-opus-4-8",
      "score_per_dollar": 145.2,
      "reason": "UI reasoning #1 on BridgeBench, within cost threshold"
    },
    {
      "skill": "executing-plans",
      "domain": "general",
      "risk": "low",
      "model": "deepseek/deepseek-v4-pro",
      "score_per_dollar": 892.1,
      "reason": "Best score/$ for general coding"
    }
  ]
}
```

**Generation algorithm:**
```
For each (skill, domain, risk) combination:
  For each available model (from OpenCode config):
    benchmark_score = getBridgeBenchScore(model, skill)
    cost_per_1k = getOpenRouterCost(model)
    score_per_dollar = benchmark_score / cost_per_1k
    
  Select model with max score_per_dollar
  Subject to: benchmark_score >= min_threshold (top-20 for this skill)
```

### 4.4 Benchmark Cache

**Location:** `.agentic/cache/bridgebench.json`

**Source:** Scraped from bridgebench.ai leaderboards (UI, Security, Refactoring, Hallucination, BS, Reasoning, Debugging, Speed, Cost)

**Update command:** `kiki update-benchmarks`

### 4.5 CLI Tool

**Commands:**
- `kiki init` — scaffold `.agentic/` directory (config, alignment, routing skeleton, task registry)
- `kiki status` — show task registry + current routing table summary
- `kiki verify <file>` — check for TBDs/TODOs/placeholders
- `kiki update-benchmarks` — scrape BridgeBench and rebuild routing table
- `kiki update-pricing` — fetch OpenRouter pricing and rebuild routing table

---

## 5. Benchmark Mapping

Single source of truth: **BridgeBench** (SWE-bench removed — not all models supported, too coarse for phase-level routing).

| Kiki / Superpowers Phase | BridgeBench Category | Rationale |
|---|---|---|
| **Intake / Elicitation** | Reasoning | Grounded reasoning over mixed artifacts |
| **Brainstorming** (superpowers: brainstorming) | BS | Identifying unsupported claims = spec rigor |
| **Planning** (superpowers: writing-plans) | Reasoning | Algorithmic planning and decomposition |
| **Architect Review** | Security | Vulnerability detection = guardrail auditing |
| **Implementation** (superpowers: executing-plans + TDD) | UI / Debugging / Refactoring / Security | Task-dependent subdomain |
| **First Review** | Refactoring | Code quality and maintainability |
| **Second Review** | Security | Security/alignment audit |
| **Escalation** | Reasoning | Hardest reasoning = complexity fallback |

**Domain detection heuristics:**
- Keywords like "UI", "frontend", "React", "CSS" → UI benchmark
- Keywords like "bug", "fix", "error", "crash" → Debugging benchmark
- Keywords like "refactor", "cleanup", "restructure" → Refactoring benchmark
- Keywords like "auth", "security", "vulnerability" → Security benchmark
- Default → Reasoning benchmark

---

## 6. Data Flow

### 6.1 Daily Refresh (Background)

```
Cron / kiki update-benchmarks
  → Scrape BridgeBench leaderboards
  → Fetch OpenRouter pricing API (free)
  → Read OpenCode config (available models)
  → Compute score-per-dollar for all combinations
  → Write .agentic/routing.json
  → Log: "Routing table updated. 47 models evaluated. 8 skill/domain/risk rules generated."
```

### 6.2 Task Dispatch (Runtime)

```
User prompt → Kiki Orchestrator
  → Classify: skill=brainstorming, domain=gui, risk=medium
  → Read .agentic/routing.json
  → Lookup: (brainstorming, gui, medium) → model="moonshotai/kimi-k2.6"
  → Dispatch task tool with model override
  → Log routing decision to .agentic/routing_log.jsonl
  → Subagent executes with optimal model
```

### 6.3 Model Stabilization

To prevent daily model flip-flopping and maintain task continuity:

**Sticky project defaults with hysteresis.**

1. The first task for a (skill, domain) combination picks the optimal model and sets it as the **project default**.
2. The default only updates if a new model is **>20% better** on score-per-dollar.
3. Once a task starts, its model is **locked** for all phases of that task — even if the routing table updates mid-task.

**Dispatch logic:**
```
Is this an existing task?
  YES → Use the model locked at task creation
  NO → Is there a project default for this (skill, domain)?
    YES → Is new model >20% better than default?
      YES → Update project default, use new model
      NO → Use project default
    NO → Compute optimal, set as project default, use it
```

This prevents:
- Different models for intake vs. planning vs. implementation on the same task
- Daily switching due to minor leaderboard noise (±5%)
- Inconsistent reasoning styles across phases

---

## 7. File Structure

```
.agentic/
  config.json              # Tech stack, commands, risk paths
  alignment.json           # Guardrails & compliance
  TASK_REGISTRY.json       # Task progress tracker
  routing.json             # Auto-generated routing table
  cache/
    bridgebench.json       # Scraped benchmark data
    openrouter_pricing.json # Fetched pricing data
  routing_log.jsonl        # Append-only dispatch log

.opencode/
  agents/
    kiki-orchestrator.md   # Primary agent (only agent file)
  plugins/
    kiki.ts                # Model routing plugin
  docs/
    agentic-workflow.md    # Kiki process documentation
```

**Removed from old Kiki:**
- 8 sub-agent definition files
- `.agentic/templates/` directory
- `.agentic/tasks/` scaffolding (OpenCode handles task state)
- `models.json` (replaced by auto-generated `routing.json`)

---

## 8. Configuration

### 8.1 User Configuration (`.agentic/config.json`)

```json
{
  "project_name": "my-project",
  "language": "typescript",
  "commands": {
    "build": "npm run build",
    "test": "npm test",
    "lint": "npm run lint"
  },
  "risk_matrix": {
    "high_risk_paths": ["src/auth/", "src/db/schema.ts"],
    "critical_risk_paths": ["src/security/", "migrations/"]
  },
  "routing_preferences": {
    "refresh_interval_hours": 24,
    "min_benchmark_rank": 20,
    "cost_ceiling_per_1k_tokens": 0.05
  }
}
```

### 8.2 OpenCode Configuration

The plugin reads `opencode.json` to determine which models are available (based on configured providers and API keys).

---

## 9. Security Boundaries

All inherited from OpenCode + Kiki additions:
- **Plugin cannot access `.env` files** — OpenCode's permission system
- **Plugin only reads configs** — never writes outside `.agentic/`
- **Routing decisions are logged** — full audit trail in `routing_log.jsonl`
- **No external network calls at dispatch time** — all data is pre-cached

---

## 10. Error Handling

| Scenario | Behavior |
|---|---|
| BridgeBench scrape fails | Keep last cached version, log warning |
| OpenRouter API fails | Keep last cached pricing, log warning |
| No model meets min_benchmark_rank | Fallback to highest-ranked model regardless of cost |
| OpenCode config has no providers | Log error, prompt user to configure providers |
| Routing table missing | Run `kiki update-benchmarks` automatically on first dispatch |

---

## 11. Open Questions

1. **BridgeBench API:** Will BridgeMind provide a public API? If not, scraping is the fallback.
2. **Plugin hook availability:** Does OpenCode's `tool.execute.before` hook allow modifying the `model` parameter in task dispatch? Needs verification with OpenCode SDK.
3. **Domain classification accuracy:** Are keyword heuristics sufficient, or should we use an LLM call for domain classification? (Adds latency/cost.)
4. **Risk classification:** Should risk be determined by file paths only, or also by task description sentiment analysis?

---

## 12. Summary of Changes

| Aspect | Old Kiki | Evolved Kiki |
|---|---|---|
| **Agents** | 9 separate files | 1 orchestrator |
| **Model selection** | Static `models.json` | Dynamic `routing.json` from live data |
| **Benchmark source** | None | BridgeBench (9 categories) |
| **Cost data** | None | OpenRouter (free API) |
| **Architecture** | Standalone framework | OpenCode plugin + CLI |
| **Execution** | Custom orchestrator | OpenCode native agents + skills |
| **Value add** | Agent management | Process discipline + model optimization |

---

*Spec written and ready for review.*
