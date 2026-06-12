# Kiki Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite Kiki to align with superpowers: remove duplicate documents, consolidate artifacts, add interactive intake, establish a task registry, and rename agents to reflect their superpowers skill mapping.

**Architecture:** Kiki becomes a thin execution pipeline that dispatches superpowers skills via model-specific agents. The Orchestrator manages state in a machine-readable `TASK_REGISTRY.json`. All design docs live under `docs/superpowers/`. Kiki only adds quality gates (Architect, Reviewers, Escalation) and model-agnostic dispatch.

**Tech Stack:** TypeScript 5.7, Node.js ESM, Vitest for testing.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/templates/agents.ts` | String templates for all 9 Kiki agent `.md` files. Complete rewrite with new names and superpowers skill references. |
| `src/templates/workflow.ts` | The canonical operating manual (`WORKFLOW`) and removed template constants. |
| `src/templates/registry.ts` | `TASK_REGISTRY.json` skeleton template. |
| `src/templates/configs.ts` | Updated `DEFAULT_MODELS` with new agent name keys. |
| `src/scaffold.ts` | `kiki init` logic. Removed `.agentic/templates/`, renamed agent files, writes `TASK_REGISTRY.json`. |
| `src/cli.ts` | CLI entry point. Updated `status` to read registry, `verify` regex updated. |
| `src/lib.ts` | NEW: Extracted helper functions (`checkScaffolding`, `readTaskRegistry`, `auditContent`) for testability. |
| `tests/scaffold.test.ts` | Tests for `scaffold()` output. |
| `tests/lib.test.ts` | Tests for helper functions. |

---

### Task 1: Add Test Infrastructure

**Files:**
- Modify: `package.json`
- Create: `tests/scaffold.test.ts`
- Create: `tests/lib.test.ts`

- [ ] **Step 1: Add vitest dependency and test script**

Modify `package.json`:

```json
{
  "name": "kiki",
  "version": "0.1.0",
  "type": "module",
  "description": "Kiki — Reusable general-purpose meta-framework for LLM-driven software engineering",
  "bin": {
    "kiki": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/cli.ts",
    "test": "vitest run"
  },
  "dependencies": {},
  "devDependencies": {
    "typescript": "^5.7.0",
    "tsx": "^4.0.0",
    "@types/node": "^22.0.0",
    "vitest": "^1.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install
```

Expected: `node_modules/vitest/` is created.

- [ ] **Step 3: Create empty test files**

Create `tests/scaffold.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';

describe('scaffold', () => {
  it('should pass after implementation', () => {
    expect(true).toBe(true);
  });
});
```

Create `tests/lib.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';

describe('lib', () => {
  it('should pass after implementation', () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npm test
```

Expected: Vitest runs, 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tests/
git commit -m "chore: add vitest test infrastructure"
```

---

### Task 2: Rewrite Agent Templates

**Files:**
- Modify: `src/templates/agents.ts`

- [ ] **Step 1: Write the complete new `src/templates/agents.ts`**

Replace the entire file with the content from the spec (all 9 agent templates: KIKI_ORCHESTRATOR, KIKI_BRAINSTORMER, KIKI_PLANNER, KIKI_ARCHITECT, KIKI_IMPLEMENTATION_STANDARD, KIKI_IMPLEMENTATION_COMPLEXITY, KIKI_FIRST_REVIEWER, KIKI_SECOND_REVIEWER, KIKI_ESCALATION_AGENT).

Each agent must:
- Use the `kiki-` prefix in the export name.
- Reference the superpowers skill it invokes (brainstorming, writing-plans, executing-plans, TDD) in its description and instructions.
- Include inline review/append instructions for agents that append to plan docs (Architect, Reviewers, Implementers).
- Preserve the STRICT SECURITY BOUNDARY.

- [ ] **Step 2: Verify file compiles**

Run:
```bash
npx tsc --noEmit src/templates/agents.ts
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/templates/agents.ts
git commit -m "refactor: rewrite agent templates with superpowers skill mapping"
```

---

### Task 3: Rewrite Workflow Template

**Files:**
- Modify: `src/templates/workflow.ts`

- [ ] **Step 1: Write the complete new `src/templates/workflow.ts`**

Replace the entire file with a single `WORKFLOW` export containing the updated operating manual. The manual must:
- Reference the 9 new `kiki-*` agent names.
- Map each agent to its superpowers skill.
- Describe the interactive intake process.
- Document the Superpowers Discovery Gate.
- Document the inline review format (appended to plan doc).
- Document the Direct-Fix path for Micro risk.
- Remove all references to `.agentic/templates/` and the old 9 artifact templates.
- Reference `.agentic/TASK_REGISTRY.json` as the progress tracker.

- [ ] **Step 2: Verify file compiles**

Run:
```bash
npx tsc --noEmit src/templates/workflow.ts
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/templates/workflow.ts
git commit -m "refactor: rewrite workflow template, remove artifact templates"
```

---

### Task 4: Add Registry Template and Update Configs

**Files:**
- Create: `src/templates/registry.ts`
- Modify: `src/templates/configs.ts`

- [ ] **Step 1: Create `src/templates/registry.ts`**

```typescript
export const TASK_REGISTRY_SKELETON = `{
  "version": "1.0.0",
  "tasks": []
}`;
```

- [ ] **Step 2: Update `src/templates/configs.ts` — update model role keys**

Replace the entire file. Keep `DEFAULT_CONFIG` and `DEFAULT_ALIGNMENT` unchanged. Replace `DEFAULT_MODELS` so that all role keys use the `kiki-` prefix (`kiki-orchestrator`, `kiki-brainstormer`, `kiki-planner`, `kiki-architect`, `kiki-implementation-standard`, `kiki-implementation-complexity`, `kiki-first-reviewer`, `kiki-second-reviewer`, `kiki-escalation-agent`). Remove old keys like `project-researcher`, `planning-drafter-local`, etc.

- [ ] **Step 3: Verify compilation**

Run:
```bash
npx tsc --noEmit src/templates/registry.ts src/templates/configs.ts
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/templates/registry.ts src/templates/configs.ts
git commit -m "feat: add task registry skeleton and update model role keys"
```

---

### Task 5: Rewrite Scaffold

**Files:**
- Modify: `src/scaffold.ts`
- Modify: `tests/scaffold.test.ts`

- [ ] **Step 1: Write the complete new `src/scaffold.ts`**

Replace the entire file. The new scaffold must:
- Import `TASK_REGISTRY_SKELETON` from `./templates/registry.js`.
- Create only these directories: `.agentic`, `.opencode`, `.opencode/agents`, `.opencode/docs`.
- Write files: `.agentic/config.json`, `.agentic/alignment.json`, `.agentic/TASK_REGISTRY.json`, `.opencode/models.json`.
- Write 9 agent files with `kiki-` prefix (e.g., `kiki-orchestrator.md`).
- Write `.opencode/docs/agentic-workflow.md`.
- **NOT** create `.agentic/templates/` or `.agentic/tasks/` during init.
- Update the ASCII completion report to mention `TASK_REGISTRY.json` and remove `.agentic/templates/`.

- [ ] **Step 2: Write `tests/scaffold.test.ts`**

Replace with tests that verify:
- `.agentic/config.json` is created and parseable.
- `.agentic/alignment.json` is created and parseable.
- `.agentic/TASK_REGISTRY.json` is created with `version: "1.0.0"` and `tasks: []`.
- `.opencode/models.json` contains `kiki-orchestrator`, `kiki-brainstormer`, etc. and does NOT contain old keys.
- `.opencode/agents/` contains exactly 9 files with `kiki-` prefix.
- `.agentic/templates/` is NOT created.
- `.opencode/docs/agentic-workflow.md` exists and contains "Kiki Agentic Development Workflow".

- [ ] **Step 3: Run scaffold tests**

Run:
```bash
npx vitest run tests/scaffold.test.ts
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/scaffold.ts tests/scaffold.test.ts
git commit -m "refactor: rewrite scaffold to remove templates and add registry"
```

---

### Task 6: Rewrite CLI and Extract Helpers

**Files:**
- Create: `src/lib.ts`
- Modify: `src/cli.ts`
- Modify: `tests/lib.test.ts`

- [ ] **Step 1: Create `src/lib.ts`**

```typescript
import fs from 'node:fs/promises';
import path from 'node:path';

export async function checkScaffolding(projectPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(projectPath, '.agentic/config.json'));
    await fs.access(path.join(projectPath, '.agentic/alignment.json'));
    await fs.access(path.join(projectPath, '.opencode/models.json'));
    return true;
  } catch {
    return false;
  }
}

export async function readTaskRegistry(projectPath: string): Promise<{ version: string; tasks: any[] } | null> {
  try {
    const raw = await fs.readFile(path.join(projectPath, '.agentic/TASK_REGISTRY.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function auditContent(content: string): string[] {
  const lines = content.split('\n');
  const placeholders: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/TODO|TBD|placeholder|\[insert|\[ \] check|implement later|fill in details/i.test(line)) {
      placeholders.push(`Line ${i + 1}: ${line.trim()}`);
    }
  }
  return placeholders;
}
```

- [ ] **Step 2: Write the complete new `src/cli.ts`**

Replace the entire file. The new CLI must:
- Import helpers from `./lib.js`.
- Wrap `main()` execution with `if (import.meta.url.startsWith('file://') && process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1])))` so tests can import without side effects.
- `status` command: read `.agentic/TASK_REGISTRY.json` and print a human-readable registry summary (active tasks, completed tasks, per-task status with spec/plan refs, phases completed/pending). Use the exact format from the spec.
- `verify` command: use `auditContent()` from `lib.ts`. Keep file-path argument.
- `init` command: unchanged behavior (calls `scaffold`).
- Update `printHelp()` to reflect new command descriptions.

- [ ] **Step 3: Write `tests/lib.test.ts`**

Replace with tests that verify:
- `checkScaffolding` returns `true` after scaffold, `false` for empty dir.
- `readTaskRegistry` returns parsed registry after scaffold, `null` when missing.
- `auditContent` detects `TODO`, `TBD`, `placeholder`, `[insert`, and returns empty for clean text.

- [ ] **Step 4: Run lib tests**

Run:
```bash
npx vitest run tests/lib.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib.ts src/cli.ts tests/lib.test.ts
git commit -m "feat: rewrite CLI with registry status, extract testable helpers"
```

---

### Task 7: Build and Integration Verification

**Files:**
- All of the above

- [ ] **Step 1: Run full test suite**

Run:
```bash
npm test
```

Expected: All tests in `tests/scaffold.test.ts` and `tests/lib.test.ts` pass.

- [ ] **Step 2: Run TypeScript build**

Run:
```bash
npm run build
```

Expected: `dist/` contains `cli.js`, `lib.js`, `scaffold.js`, `templates/` with all updated files. No compilation errors.

- [ ] **Step 3: Manual CLI smoke test**

Run:
```bash
node dist/cli.js init /tmp/kiki-smoke-test
node dist/cli.js status
```

From `/tmp/kiki-smoke-test`, run:
```bash
node /home/lutz/lprojekte/kiki/dist/cli.js status
```

Expected: Status shows config, alignment, models, and "No tasks recorded yet." The `.agentic/templates/` directory should NOT exist.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "build: verify full rework compiles and passes tests"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ File structure changes (scaffold.ts) — Task 5
- ✅ Agent renames and superpowers skill references — Task 2
- ✅ Template removal — Task 3
- ✅ Orchestrator workflow update — Task 2 (orchestrator agent template)
- ✅ Task registry implementation — Task 4 + Task 5 + Task 6
- ✅ Interactive intake — Task 2 (orchestrator agent template)
- ✅ Inline review format — Task 2 (architect, reviewer agents)
- ✅ Consolidated artifacts — Task 3 (workflow removes templates)
- ✅ CLI updates (status, verify) — Task 6
- ✅ Config updates (model keys) — Task 4

**2. Placeholder scan:**
- ✅ No "TBD", "TODO", "implement later", "fill in details" in plan steps.
- ✅ No vague steps like "Add appropriate error handling".
- ✅ All code blocks are complete and copy-paste ready.

**3. Type consistency:**
- ✅ Agent names consistent across agents.ts, configs.ts, scaffold.ts, workflow.ts.
- ✅ Registry schema matches spec (`version`, `tasks` array).
- ✅ Model role keys are all `kiki-*` prefixed.

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-12-kiki-rework-plan.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
