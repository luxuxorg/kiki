# Kiki — The Model-Agnostic LLM-Driven Software Engineering Meta-Framework

Kiki is a reusable, config-driven development orchestrator that converts any repository (TypeScript, Python, Rust, etc.) into a highly disciplined, multi-agent software engineering machine. 

Inspired by Google DeepMind's Co-Scientist and Noema's 8-role pipeline, Kiki enforces rigorous separation of concerns—Researching, Drafting, Architectural Auditing, Implementing (using TDD), and Code Review—completely decoupled from model lock-in or project-specific tech stacks.

---

## 🚀 Key Capabilities

1. **Model-Agnostic Dynamic Dispatch:** Roles are mapped in a central `.opencode/models.json` config. The Orchestrator automatically hot-patches the `model:` frontmatter key before dispatching any sub-agent, supporting seamless runtime fallbacks if a provider goes down.
2. **The 3-Tier Execution Spectrum:**
   - **Direct-Fix Mode (Micro Risk):** For typos, UI copy, and minor config changes. Bypasses planning overhead and runs: `Intake ──► Implement ──► Review ──► Complete` in under a minute.
   - **Fast-Path Mode (Low Risk):** For standard self-contained changes. Bypasses Architectural Review gates but retains planning and first review.
   - **Standard Path (Medium to Critical Risk):** The full 8-role pipeline with parallel audits, plan amendment gates, and premium model escalation boundaries.
3. **Rigorous Quality Gates:** No code is written without an approved, pseudocoded execution plan. No code is merged without passing standard compiler, linter, and unit test suites.
4. **Active Security Blacklisting:** All agents are compiled with a hard cognitive boundary that prevents them from reading, listing, or parsing sensitive credential files (like `.env`, `.pem`, `.key`, `.token`), keeping your production secrets safe from web-scraping indirect prompt injections.

---

## 📂 Project Structure Scaffolded

When you initialize Kiki in a repository, it generates the following directory structure:

```
├── .agentic/
│   ├── config.json            # Tech stack build/test commands and file risk paths
│   ├── alignment.json         # Project-specific safety, compliance, or business guardrails
│   └── templates/             # guidelines for research summaries, execution plans, and reviews
└── .opencode/
    ├── models.json            # Active model routers (primary, fallback, escalation)
    ├── docs/
    │   └── agentic-workflow.md # Canonical Kiki operating manual for the Orchestrator
    └── agents/                # 10 100% model-agnostic, role-based sub-agents
```

---

## 🛠️ CLI Installation & Commands

Build and link Kiki locally:

```bash
cd /home/lutz/lprojekte/kiki
npm install
npm run build
npm link
```

### 1. Initialize a Workspace
Scaffolds Kiki's multi-agent engine, configs, and agents in the target project path:
```bash
kiki init [project-path]
```

### 2. Check Operational Status
Inspects the target workspace configs, printing project parameters, active safety guardrails, commands, and dynamic model routing tables:
```bash
kiki status
```

### 3. Audit Artifacts & Reports
Scans any design or review markdown report for unfinished segments, checklist items, or active placeholders like `TODO`, `TBD`, `placeholder`, `[ ] check`, etc.:
```bash
kiki verify <file-path>
```

---

## ⚙️ Configuration Schemas

### A. `.agentic/config.json` (Tech Stack & Risks)
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
    "high_risk_paths": [
      "src/auth/",
      "src/db/schema.ts"
    ],
    "critical_risk_paths": [
      "src/security/",
      "migrations/"
    ]
  }
}
```

### B. `.agentic/alignment.json` (Guardrails & Compliance Audits)
```json
{
  "audit_type": "Security, Compliance & Alignment Gate",
  "core_guardrails": [
    {
      "id": "GR-01",
      "name": "Design & Scope Adherence",
      "rule": "Every design decision must verify that it adheres strictly to the approved specifications without introducing scope creep."
    },
    {
      "id": "GR-02",
      "name": "Security Boundary Integrity",
      "rule": "Every change must verify that it does not weaken authentication or expose sensitive credentials."
    }
  ],
  "wait_cost_rationale": "It is always preferable to deploy a fully secure and compliant implementation than to skip security gates for immediate release."
}
```

### C. `.opencode/models.json` (Models & Fallbacks)
```json
{
  "roles": {
    "orchestrator": {
      "primary": "google/gemini-3.5-flash",
      "fallback": "google/gemini-3.1-pro-preview"
    },
    "project-researcher": {
      "primary": "deepseek/deepseek-v4-pro",
      "fallback": "google/gemini-3.1-pro-preview"
    },
    "planning-drafter-local": {
      "primary": "moonshotai/kimi-k2.6",
      "fallback": "google/gemini-3.1-pro-preview"
    },
    "planning-drafter-synthesis": {
      "primary": "google/gemini-3.1-pro-preview",
      "fallback": "moonshotai/kimi-k2.6"
    },
    "planning-architect": {
      "primary": "anthropic/claude-opus-4-8",
      "fallback": "google/gemini-3.1-pro-preview"
    },
    "implementation-agent-standard": {
      "primary": "deepseek/deepseek-v4-pro",
      "fallback": "moonshotai/kimi-k2.6"
    },
    "implementation-agent-complexity": {
      "primary": "anthropic/claude-opus-4-8",
      "fallback": "google/gemini-3.1-pro-preview"
    },
    "first-reviewer": {
      "primary": "moonshotai/kimi-k2.6",
      "fallback": "anthropic/claude-sonnet-4.6"
    },
    "second-reviewer": {
      "primary": "anthropic/claude-opus-4-8",
      "fallback": "google/gemini-3.1-pro-preview"
    },
    "escalation-agent": {
      "primary": "anthropic/claude-opus-4-8",
      "fallback": "google/gemini-3.1-pro-preview"
    }
  },
  "default_fallback": "moonshotai/kimi-k2.6"
}
```

---

## 📋 Migration & Setup Guide (Bootstrap Prompt)

You can copy and paste the following prompt into opencode or any sub-agent session to automatically migrate and bootstrap existing repositories (like Noema) onto Kiki's standardized structure:

```markdown
# TASK: Standardize Workspace Agentic Workflow using the Kiki Meta-Framework

We are migrating this workspace's development pipeline to the standardized, model-agnostic Kiki meta-framework. We must preserve all domain-specific commands, custom risk patterns, and safety guardrails during this transition.

## Context Locations
* **Kiki Framework directory:** \`/home/lutz/lprojekte/kiki\`
* **Target Workspace directory:** This current directory

Please execute the following 5-step transition plan carefully:

---

### Step 1: Scaffold Kiki into Target Project
Execute Kiki's initializer to overlay Kiki's clean folders and model-agnostic templates on this current workspace root:
\`\`\`bash
node /home/lutz/lprojekte/kiki/dist/cli.js init .
\`\`\`

---

### Step 2: Migrate Tech Stack & Risks (\`.agentic/config.json\`)
Open the newly created \`.agentic/config.json\` and customize it for this specific project:
1. **Name/Language:** Update \`project_name\` and \`language\` (e.g., typescript, python).
2. **Commands:** Set the operational commands matching your package/dependency manager (e.g. \`npm run build\`, \`npm test\`, or \`pytest\`).
3. **Risk Matrix:** Define specific file-path pattern rules for High Risk and Critical Risk boundaries.

---

### Step 3: Migrate Guardrails (\`.agentic/alignment.json\`)
Open \`.agentic/alignment.json\` and migrate any system-specific safety or product-alignment gates:
1. **Audit Type:** Set a descriptive \`audit_type\` (e.g. "Agency-Protection, Privacy, & Pilot Alignment Gate").
2. **Core Guardrails:** Add specific ID-mapped guardrails to the \`core_guardrails\` list that the Planning Architect and Second Reviewer must audit against.

---

### Step 4: Cleanup Obsolete Model-Specific Files
Delete any deprecated, model-specific subagent description files from \`.opencode/agents/\` to avoid conflicts:
- Delete any file with hardcoded model suffixes (such as \`planning-drafter-gemini.md\` or \`implementation-agent-opus.md\`).
- Ensure only Kiki's 10 standardized, model-agnostic agents and the central \`.opencode/models.json\` remain.

---

### Step 5: Verification
1. Run Kiki's status diagnostics command in the workspace to verify configuration files parse and load correctly:
   \`\`\`bash
   node /home/lutz/lprojekte/kiki/dist/cli.js status
   \`\`\`
2. Assert that Kiki output matches your custom tech stack, commands, risks, and active safety rules.
\`\`\`

