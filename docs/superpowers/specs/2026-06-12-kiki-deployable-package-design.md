# Kiki Deployable Package Design

**Date:** 2026-06-12
**Status:** Design Approved
**Scope:** Make `kiki init` fully scaffold `.opencode/` and make kiki installable as a standalone package from GitHub.

\---

## 1\. Goal

Transform kiki into a deployable, self-contained package installable from `github.com/luxuxorg/kiki`. `kiki init` must create **both** `.agentic/` and `.opencode/` directories, making the target project immediately usable with OpenCode and the kiki-orchestrator agent.

\---

## 2\. Problem

Currently `kiki init` only creates `.agentic/` files. The `.opencode/` directory with agents, plugin, and dependencies is never scaffolded. Additionally, the plugin uses relative imports (`../../src/core/...`) that only resolve within the kiki development repo — broken in any target project.

\---

## 3\. Design

### 3.1 Deployment Model

```
github.com/luxuxorg/kiki  ← source of truth
        │
        ├── npm i -g github.com/luxuxorg/kiki  (user installs globally)
        │   or
        └── git clone + npm link
                │
                ▼
        $ kiki init /path/to/myproject
                │
                ├── .agentic/          (existing, unchanged)
                │     config.json
                │     alignment.json
                │     TASK\_REGISTRY.json
                │     routing.json
                │     cache/
                │
                └── .opencode/         (NEW — scaffolded from templates)
                      agents/
                        kiki-orchestrator.md
                        kiki-researcher.md
                        kiki-implementer.md
                        kiki-reviewer.md
                        kiki-escalation.md
                      plugins/
                        kiki.ts
                      package.json
                      .gitignore
```

### 3.2 Plugin Resolution

The plugin in the target project must import kiki's core logic. Instead of broken relative paths:

**Before (broken):**

```typescript
import { loadRoutingTable, lookupModel } from '../../src/core/routing-table';
```

**After (package import):**

```typescript
import { loadRoutingTable, lookupModel } from 'kiki';
```

The target project's `.opencode/package.json` declares kiki as a dependency:

```json
{
  "dependencies": {
    "@opencode-ai/plugin": "1.15.13",
    "kiki": "github.com/luxuxorg/kiki"
  }
}
```

The kiki package needs an `exports` field in its `package.json` so that `'kiki'` resolves correctly.

### 3.3 Template Strategy

Templates are embedded as string constants in `src/cli/commands/init.ts` (same pattern as existing `DEFAULT\_CONFIG` and `DEFAULT\_ALIGNMENT`). No external template files — avoids file path resolution issues after global install.

### 3.4 File Changes

|File|Change|
|-|-|
|`package.json`|Rename to `kiki`, update repo URL, add `exports` field|
|`src/cli/commands/init.ts`|Add `.opencode/` scaffolding as template constants (agent files, plugin with package imports, package.json, .gitignore)|
|`src/index.ts`|**New file** — barrel export of all symbols the plugin needs|
|`src/core/routing-table.ts`|Ensure `loadRoutingTable`, `lookupModel`, `saveRoutingTable` are exported|
|`src/core/domain-classifier.ts`|Ensure `classifyDomain` is exported|
|`src/core/risk-classifier.ts`|Ensure `classifyRisk` is exported|
|`src/core/stabilizer.ts`|Ensure `selectModel` is exported|
|`README.md`|New to create README with what Kiki is and how to install and run it.|

**Dev vs. Template:** The `.opencode/` directory in the kiki repo (used during development) keeps its current relative imports. The template strings in `init.ts` use package imports (`from 'kiki'`). These are separate copies — no chicken-and-egg problem during local development.

### 3.5 exports field in package.json

Single barrel export via `src/index.ts`. The plugin uses one import:

```typescript
import { loadRoutingTable, lookupModel, saveRoutingTable, classifyDomain, classifyRisk, selectModel } from 'kiki';
```

`src/index.ts` (new file):

```typescript
export { loadRoutingTable, lookupModel, saveRoutingTable } from './core/routing-table.js';
export { classifyDomain } from './core/domain-classifier.js';
export { classifyRisk } from './core/risk-classifier.js';
export { selectModel } from './core/stabilizer.js';
export type { Skill, Domain, Risk, RoutingLogEntry } from './types.js';
```

`package.json` exports:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  }
}
```

### 3.6 What init creates — full list

|Path|Content Source|
|-|-|
|`.agentic/config.json`|DEFAULT\_CONFIG (existing)|
|`.agentic/alignment.json`|DEFAULT\_ALIGNMENT (existing)|
|`.agentic/TASK\_REGISTRY.json`|Empty registry (existing)|
|`.agentic/routing.json`|Skeleton routing (existing)|
|`.agentic/cache/`|Empty dir (existing)|
|`.opencode/agents/kiki-orchestrator.md`|Template constant|
|`.opencode/agents/kiki-researcher.md`|Template constant|
|`.opencode/agents/kiki-implementer.md`|Template constant|
|`.opencode/agents/kiki-reviewer.md`|Template constant|
|`.opencode/agents/kiki-escalation.md`|Template constant|
|`.opencode/plugins/kiki.ts`|Template constant (with package imports)|
|`.opencode/package.json`|Template constant|
|`.opencode/.gitignore`|Template constant|

\---

## 4\. Verification

After implementation, verify:

1. `kiki init /tmp/test-project` creates both `.agentic/` and `.opencode/`
2. Agent files contain correct frontmatter (mode: primary for orchestrator, mode: subagent for others)
3. Plugin `kiki.ts` uses `import ... from 'kiki'` not relative paths
4. `.opencode/package.json` references `github.com/luxuxorg/kiki`
5. Existing tests (`tests/cli/init.test.ts`) still pass, extended for new scaffolding

\---

## 5\. Out of Scope

* Creating the GitHub repo (manual step by user)
* `agentic-workflow.md` documentation file (nice-to-have, not blocking)
* Changes to plugin logic itself (same behavior, just different import paths)

