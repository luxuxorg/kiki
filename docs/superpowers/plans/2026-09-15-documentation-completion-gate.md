# Documentation Completion Gate Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require generated Kiki orchestrators to resolve a task's documentation status before completion, while allowing explicitly justified skips for local internal changes.

**Architecture:** The generated orchestrator template owns the completion rule and dispatch instruction. The generated workflow documents the same registry contract. No plugin behavior changes because the plugin does not currently own registry state transitions.

**Tech Stack:** TypeScript, Vitest, generated Markdown agent templates.

---

### Task 1: Lock the documentation gate into template-generation tests

**Files:**
- Modify: `tests/cli/init.test.ts:245-253`
- Modify: `tests/cli/init.test.ts:191-195`

- [ ] **Step 1: Add a failing orchestrator-template assertion**

Add a test after `documents the orchestrator registry-edit exception and failure logging rule` that initializes a temporary Kiki project and asserts the generated `kiki-orchestrator.md` contains all of:

```ts
expect(orchestrator).toContain('Documentation decision required');
expect(orchestrator).toContain('@kiki-historian');
expect(orchestrator).toContain('Never set a task to `completed` while `documentation.status` is `pending`');
```

- [ ] **Step 2: Add a failing workflow-template assertion**

In the existing scaffold test, after reading `.opencode/docs/agentic-workflow.md`, add:

```ts
expect(workflow).toContain('"status": "pending | not_required | completed"');
expect(workflow).toContain('Documentation Completion Gate');
expect(workflow).toContain('documentation.status is `pending`');
```

- [ ] **Step 3: Run the focused test file and verify failure**

Run: `npm test -- tests/cli/init.test.ts`

Expected: the new assertions fail because neither generated template yet contains the documentation decision or completion gate text.

### Task 2: Add the documentation decision and completion gate to generated templates

**Files:**
- Modify: `src/cli/config.ts:318-349`
- Modify: `src/cli/config.ts:633-658`
- Test: `tests/cli/init.test.ts`

- [ ] **Step 1: Extend the orchestrator dispatch rules**

In `generateOrchestratorTemplate`, add this rule after the review rule:

```markdown
- Documentation decision required → dispatch `kiki-historian`, unless the registry records `documentation.status: "not_required"` with a concrete reason.
```

- [ ] **Step 2: Add the terminal completion guard**

In the orchestrator's `Key Rules` section, add:

```markdown
- Before setting a task to `completed`, resolve `documentation.status` as `completed` or `not_required`. Never set a task to `completed` while `documentation.status` is `pending`.
```

- [ ] **Step 3: Define the documentation registry object in the workflow template**

Add this property to the example registry entry in `generateWorkflowTemplate`:

```json
"documentation": {
  "status": "pending | not_required | completed",
  "reason": "Concrete explanation of the decision",
  "updatedFiles": ["README.md", "CHANGELOG.md"]
}
```

Add a `## Documentation Completion Gate` section after the registry-schema instructions that states:

```markdown
Every task starts with `documentation.status: "pending"`. For a local internal change, set it to `not_required` only with a concrete reason. Otherwise dispatch `kiki-historian`; once it reports, set the status to `completed` and record changed files, or an empty list when no update was needed. Never mark the task `completed` while documentation is pending.
```

- [ ] **Step 4: Run focused tests and verify they pass**

Run: `npm test -- tests/cli/init.test.ts`

Expected: PASS.

### Task 3: Verify generated output and the full test suite

**Files:**
- Verify: `src/cli/config.ts`
- Verify: `tests/cli/init.test.ts`

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: PASS with all existing CLI, core, integration, and new template-generation tests.

- [ ] **Step 2: Build the package**

Run: `npm run build`

Expected: TypeScript compilation succeeds with no errors.

- [ ] **Step 3: Inspect the generated template diff**

Run: `git diff -- src/cli/config.ts tests/cli/init.test.ts docs/superpowers/specs/2026-09-15-documentation-completion-gate-design.md docs/superpowers/plans/2026-09-15-documentation-completion-gate.md`

Expected: only the documented prompt, workflow schema, tests, and design/plan files changed; no unrelated user work is modified.
