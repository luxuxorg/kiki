# Role-Level Routing Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `kiki routing` so one model per Kiki role can be managed from `.agentic/kiki/routing.json` and synced into OpenCode agent frontmatter.

**Architecture:** Keep `.agentic/kiki/routing.json` as the single source of truth by adding an optional top-level `agents` map next to the legacy `rules` map. The CLI command reads that map and updates `model:` in `.opencode/agents/kiki-*.md` frontmatter without touching prompt bodies or permissions.

**Tech Stack:** TypeScript, Node `fs`/`path`, Vitest, existing Kiki CLI command structure.

---

### Task 1: Add Routing Command Tests

**Files:**
- Modify: `tests/cli/routing.test.ts`
- Modify: `src/cli/commands/routing.ts`

- [ ] **Step 1: Write failing tests**

Add tests that create a temporary project with `.agentic/kiki/routing.json` containing an `agents` map and `.opencode/agents/kiki-*.md` files. Assert `routing([projectPath])` writes or replaces `model:` inside YAML frontmatter and leaves body text unchanged. Add a `--check` test that returns a non-zero result when files are stale and does not write changes.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/cli/routing.test.ts`
Expected: FAIL because `src/cli/commands/routing.ts` does not exist or exports no `routing` command.

### Task 2: Implement Routing Command

**Files:**
- Create: `src/cli/commands/routing.ts`
- Modify: `src/cli/index.ts`

- [ ] **Step 1: Add minimal implementation**

Implement `routing(args: string[]): Promise<number | void>` that accepts an optional project path and `--check`, reads `.agentic/kiki/routing.json`, and syncs `.opencode/agents/<agent>.md` for each `agents` entry.

- [ ] **Step 2: Add CLI dispatch and help**

Import the command in `src/cli/index.ts`, add `case 'routing'`, and add help text for `routing [path] [--check]`.

- [ ] **Step 3: Run targeted test**

Run: `npm test -- tests/cli/routing.test.ts`
Expected: PASS.

### Task 3: Add Routing Table Type And Defaults

**Files:**
- Modify: `src/types.ts`
- Modify: `src/cli/config.ts`
- Modify: `src/core/routing-table.ts`

- [ ] **Step 1: Extend type**

Add `readonly agents?: Record<string, string>;` to `StaticRoutingTable`.

- [ ] **Step 2: Add default role models**

Add `agents` to `DEFAULT_ROUTING_TABLE` with one model per generated Kiki role.

- [ ] **Step 3: Preserve agents while merging**

Update `mergeRoutingTables()` so project `agents` override global `agents` just like `rules`.

- [ ] **Step 4: Run routing-table tests**

Run: `npm test -- tests/core/routing-table.test.ts tests/cli/install.test.ts tests/cli/routing.test.ts`
Expected: PASS.

### Task 4: Build And Verify

**Files:**
- Generated: `dist/**`

- [ ] **Step 1: Run full tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS and generated `dist` files updated.

- [ ] **Step 3: Review diff**

Run: `git diff -- src tests docs dist`
Expected: Only routing command, tests, type/default updates, plan, and generated build output changed.

---

Self-review: This plan covers the approved one-model-per-role design, preserves legacy rules, adds `--check`, and uses tests before implementation. It intentionally avoids domain/risk variants and plugin dynamic model mutation.
