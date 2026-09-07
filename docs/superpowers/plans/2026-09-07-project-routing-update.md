# Project Routing Update Preservation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve project-selected Kiki agent models during `kiki update` while adding missing default agent roles.

**Architecture:** The update command reads the existing project routing table and merges it over `DEFAULT_ROUTING_TABLE` with the existing routing-table helper. The persisted merged table then remains the single input to the existing agent-frontmatter sync.

**Tech Stack:** TypeScript, Node.js filesystem APIs, Vitest.

---

### Task 1: Lock the update routing contract with a regression test

**Files:**
- Modify: `tests/cli/update.test.ts`

- [ ] **Step 1: Write the failing test**

Add `DEFAULT_ROUTING_TABLE` to the imports and add this test after the existing routing-file test:

```ts
  it('preserves project routing models and fills missing default roles', async () => {
    await init(tmpDir, { wizard: false });
    const routingPath = path.join(tmpDir, '.agentic/kiki/routing.json');
    const customModel = 'provider/project-model';
    await fs.writeFile(
      routingPath,
      JSON.stringify({ agents: { 'kiki-orchestrator': customModel } }, null, 2)
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await update(tmpDir);
    logSpy.mockRestore();

    const routing = JSON.parse(await fs.readFile(routingPath, 'utf-8'));
    expect(routing.agents['kiki-orchestrator']).toBe(customModel);
    expect(routing.agents['kiki-implementer']).toBe(
      DEFAULT_ROUTING_TABLE.agents['kiki-implementer']
    );

    const orchestrator = await fs.readFile(
      path.join(tmpDir, '.opencode/agents/kiki-orchestrator.md'),
      'utf-8'
    );
    expect(orchestrator).toContain(`model: ${customModel}`);
  });
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- tests/cli/update.test.ts`

Expected: the new test fails because `update` replaces `kiki-orchestrator` with the default model.

### Task 2: Merge project routing over defaults during update

**Files:**
- Modify: `src/cli/commands/update.ts:1-10,42-46`

- [ ] **Step 1: Load and merge the routing table**

Extend the routing-table import and replace the direct default write with:

```ts
  const routingPath = join(kikiDir, 'routing.json');
  const routingTable = mergeRoutingTables(
    loadRoutingTable(routingPath),
    DEFAULT_ROUTING_TABLE
  );
  writeFileSync(routingPath, JSON.stringify(routingTable, null, 2));
```

Use this import:

```ts
import { loadRoutingTable, mergeRoutingTables } from '../../core/routing-table.js';
```

- [ ] **Step 2: Run the focused test and verify it passes**

Run: `npm test -- tests/cli/update.test.ts`

Expected: all update-command tests pass, including preservation of the custom orchestrator model and addition of the default implementer role.

- [ ] **Step 3: Build and run the complete test suite**

Run: `npm run build && npm test`

Expected: TypeScript compilation succeeds and Vitest reports no failed tests.
