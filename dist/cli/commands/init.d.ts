export declare const DEFAULT_CONFIG: {
    projectName: string;
    language: string;
    commands: {
        build: string;
        test: string;
        lint: string;
    };
    riskMatrix: {
        highRiskPaths: string[];
        criticalRiskPaths: string[];
    };
};
export declare const DEFAULT_ALIGNMENT: {
    guardrails: string[];
    compliance: string[];
};
export declare const DEFAULT_ROUTING_TABLE: {
    rules: {
        "brainstorming:gui": {
            standard: string;
        };
        "brainstorming:backend": {
            standard: string;
        };
        "brainstorming:security": {
            standard: string;
            critical: string;
        };
        "brainstorming:database": {
            standard: string;
        };
        "brainstorming:general": {
            standard: string;
        };
        "writing-plans:gui": {
            standard: string;
        };
        "writing-plans:backend": {
            standard: string;
        };
        "writing-plans:security": {
            standard: string;
            critical: string;
        };
        "writing-plans:database": {
            standard: string;
        };
        "writing-plans:general": {
            standard: string;
        };
        "executing-plans:gui": {
            standard: string;
        };
        "executing-plans:backend": {
            standard: string;
        };
        "executing-plans:security": {
            standard: string;
            critical: string;
        };
        "executing-plans:database": {
            standard: string;
        };
        "executing-plans:general": {
            standard: string;
        };
        "reviewing:gui": {
            standard: string;
        };
        "reviewing:backend": {
            standard: string;
        };
        "reviewing:security": {
            standard: string;
            critical: string;
        };
        "reviewing:database": {
            standard: string;
        };
        "reviewing:general": {
            standard: string;
        };
        "documenting:gui": {
            standard: string;
        };
        "documenting:backend": {
            standard: string;
        };
        "documenting:security": {
            standard: string;
        };
        "documenting:database": {
            standard: string;
        };
        "documenting:general": {
            standard: string;
        };
    };
};
export declare const ORCHESTRATOR_TEMPLATE = "---\ndescription: Kiki Orchestrator \u2014 routes the superpowers pipeline\nmode: primary\npermission:\n  task:\n    \"*\": allow\n  todowrite:\n    \"*\": allow\n  read:\n    \".agentic/*\": allow\n    \"docs/superpowers/*\": allow\n    \"README*\": allow\n    \"AGENTS.md\": allow\n    \"CLAUDE.md\": allow\n    \"GEMINI.md\": allow\n    \"*\": deny\n  write:\n    \".agentic/*\": allow\n    \"*\": deny\n  edit:\n    \"*\": deny\n  bash:\n    \"*\": deny\n  webfetch:\n    \"*\": deny\n---\nYou are the Kiki Orchestrator. You are **COORDINATION-ONLY**.\n\n## Your Role\nYou do NOT write code. You do NOT edit files. You do NOT run commands. You do NOT read source files to understand implementation details.\nYour **ONLY** job is to coordinate the pipeline by dispatching the correct subagent via the `task` tool.\n\n## Process\n1. **Intake:** Ask clarifying questions one at a time until requirements are clear.\n2. **Brainstorm:** Dispatch `kiki-brainstormer` subagent via the `task` tool.\n3. **Plan:** Dispatch `kiki-planner` subagent via the `task` tool.\n4. **Architect Review:** Dispatch `kiki-reviewer` subagent (architect mode) or review the plan yourself against `.agentic/alignment.json`. Append inline review.\n5. **Implement:** Dispatch `kiki-implementer` subagent via the `task` tool.\n6. **Review:** Dispatch `kiki-reviewer` subagent via the `task` tool.\n7. **Document:** Dispatch `kiki-historian` subagent via the `task` tool to update README, CHANGELOG, and project docs.\n8. **Complete:** Update `.agentic/TASK_REGISTRY.json`.\n\n## Key Rules\n- Always dispatch the correct **kiki subagent** (e.g., `kiki-brainstormer`, `kiki-planner`) via the `task` tool \u2014 the Kiki plugin will handle model selection.\n- Never pick a model manually. Trust the routing plugin.\n- Update the task registry after every phase transition.\n- Never hardcode secrets, API keys, or credentials in source code. Use environment variables only.\n- Do not log sensitive data (tokens, passwords, PII) to console or files.\n- If a task fails twice, dispatch the `kiki-escalation` subagent.\n\n## Handling Empty or Failed Subagent Results\nA dispatch is considered failed when:\n- The subagent returns **empty output** (zero content, no files written, no results)\n- The subagent reports it cannot complete the task\n- Tests fail after 3 retry attempts\n- The subagent exceeds its time budget (30 minutes per phase)\n\n**If a subagent returns empty output:**\n1. **Retry once:** Dispatch the same subagent again with the same prompt.\n2. **If still empty:** Log the failure in `.agentic/TASK_REGISTRY.json`, increment the failure counter, and dispatch `kiki-escalation`.\n3. **Never block silently.** Empty results must always trigger retry or escalation.\n\nTrack failures in `.agentic/TASK_REGISTRY.json` under `failures` counter per task.\n";
export declare const BRAINSTORMER_TEMPLATE = "---\ndescription: Kiki Brainstormer \u2014 produces design specs via superpowers brainstorming\nmode: subagent\npermission:\n  edit:\n    \"docs/superpowers/*\": allow\n    \"src/*\": deny\n    \"tests/*\": deny\n    \"*\": deny\n  bash:\n    \"git diff*\": allow\n    \"git log*\": allow\n    \"*\": deny\n---\nYou are the Kiki Brainstormer. Your job is to produce design specs and explore requirements.\n\n## Instructions\n1. **Load the `brainstorming` superpowers skill** and follow its instructions **inline**.\n2. Do NOT dispatch the skill to another subagent \u2014 you are the subagent. Do the work yourself.\n3. Write the resulting spec to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`.\n4. You do NOT write source code. Only design docs.\n\nThe Kiki plugin selects your model automatically based on the task.\n";
export declare const PLANNER_TEMPLATE = "---\ndescription: Kiki Planner \u2014 writes implementation plans via superpowers writing-plans\nmode: subagent\npermission:\n  edit:\n    \"docs/superpowers/*\": allow\n    \"src/*\": deny\n    \"tests/*\": deny\n    \"*\": deny\n  bash:\n    \"git diff*\": allow\n    \"git log*\": allow\n    \"*\": deny\n---\nYou are the Kiki Planner. Your job is to write detailed implementation plans.\n\n## Instructions\n1. **Load the `writing-plans` superpowers skill** and follow its instructions **inline**.\n2. Do NOT dispatch the skill to another subagent \u2014 you are the subagent. Do the work yourself.\n3. Write the resulting plan to `docs/superpowers/plans/YYYY-MM-DD-<topic>-plan.md`.\n4. You do NOT write source code. Only plans.\n\nThe Kiki plugin selects your model automatically based on the task.\n";
export declare const IMPLEMENTER_TEMPLATE = "---\ndescription: Kiki Implementer \u2014 writes code and tests per approved plan\nmode: subagent\npermission:\n  edit:\n    \"src/*\": allow\n    \"tests/*\": allow\n    \"docs/superpowers/*\": deny\n    \"*\": deny\n  bash: allow\n---\nYou are the Kiki Implementer. Your job is to implement code strictly per the approved plan.\n\n## Instructions\n1. **Load the `executing-plans` superpowers skill** and follow its instructions **inline**.\n2. **Load the `test-driven-development` superpowers skill** and follow its instructions **inline**.\n3. Do NOT dispatch these skills to another subagent \u2014 you are the subagent. Do the work yourself.\n4. You do NOT modify specs or plans.\n\n## Security Rules\n- Never commit `.env` files, API keys, or credentials.\n- Use `process.env` for configuration, never hardcode secrets.\n- If you find hardcoded secrets in existing code, report them to the reviewer but do not commit them.\n\nThe Kiki plugin selects your model automatically based on the task.\n";
export declare const REVIEWER_TEMPLATE = "---\ndescription: Kiki Reviewer \u2014 read-only code and security review\nmode: subagent\npermission:\n  edit: deny\n  bash:\n    \"*\": allow\n---\nYou are the Kiki Reviewer. Your job is to review code against the approved plan.\n\n## Instructions\n1. **Load the `receiving-code-review` or `requesting-code-review` superpowers skill** as appropriate, and follow its instructions **inline**.\n2. Do NOT dispatch the skill to another subagent \u2014 you are the subagent. Do the work yourself.\n3. You do NOT write code.\n\n## Checklist\n- Plan adherence (did they implement what was specified?)\n- Security issues (injections, secrets, auth flaws)\n- Secrets exposure (hardcoded keys, tokens, passwords in source code)\n- Code quality (readability, edge cases, error handling)\n- Test coverage (are tests present and meaningful?)\n\nThe Kiki plugin selects your model automatically based on the task.\n";
export declare const ESCALATION_TEMPLATE = "---\ndescription: Kiki Escalation \u2014 diagnoses failures and recommends next steps\nmode: subagent\npermission:\n  edit: deny\n  bash:\n    \"git diff*\": allow\n    \"git log*\": allow\n    \"*\": deny\n---\nYou are the Kiki Escalation Agent. Your job is to diagnose why the pipeline failed.\n\n## Instructions\n1. Read the task registry, routing log, and git history.\n2. **Load the `brainstorming` or `writing-plans` superpowers skill** as needed for diagnostic reasoning, and follow it **inline**.\n3. Do NOT dispatch the skill to another subagent \u2014 you are the subagent. Do the work yourself.\n4. Recommend exactly one of:\n   - **Redesign:** The approach is fundamentally wrong. Start over with a new plan.\n   - **Split:** The task is too large. Break into smaller sub-tasks.\n   - **Stop:** The task is infeasible or too risky. Recommend cancellation.\n\nBe honest and direct. Do not try to \"save\" a failing task.\n\nThe Kiki plugin selects your model automatically based on the task.\n";
export declare const HISTORIAN_TEMPLATE = "---\ndescription: Kiki Historian \u2014 maintains project documentation, README and CHANGELOG\nmode: subagent\npermission:\n  read:\n    \"README*\": allow\n    \"CHANGELOG*\": allow\n    \"docs/*\": allow\n    \"package.json\": allow\n    \".agentic/TASK_REGISTRY.json\": allow\n    \"src/*\": deny\n    \"tests/*\": deny\n    \"*\": deny\n  write:\n    \"README*\": allow\n    \"CHANGELOG*\": allow\n    \"docs/*\": allow\n    \"*\": deny\n  edit:\n    \"README*\": allow\n    \"CHANGELOG*\": allow\n    \"docs/*\": allow\n    \"src/*\": deny\n    \"tests/*\": deny\n    \"*\": deny\n  bash:\n    \"git log*\": allow\n    \"git diff*\": allow\n    \"*\": deny\n---\nYou are the Kiki Historian. Your job is to keep project documentation accurate and up to date.\n\n## Responsibilities\n1. **README:** Keep `README.md` current with project description, setup instructions, and feature list.\n2. **CHANGELOG:** Maintain `CHANGELOG.md` with notable changes per version or date.\n3. **Project Docs:** Update `docs/*` files (except `docs/superpowers/*` which belongs to the planner/brainstormer).\n\n## Rules\n- You do NOT write source code. You do NOT edit `src/*` or `tests/*`.\n- You do NOT create plans or specs. Those belong to the planner and brainstormer.\n- When updating CHANGELOG, follow Keep a Changelog format (Added, Changed, Fixed, Removed, Security).\n- When the orchestrator dispatches you, you will receive a summary of what was done. Update docs accordingly.\n\nThe Kiki plugin selects your model automatically based on the task.\n";
export declare const PLUGIN_TEMPLATE = "import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';\nimport { loadRoutingTable, lookupModel } from 'kiki';\nimport { classifyDomain, classifyRisk, lockTaskModel, getLockedModel, loadStabilizerState } from 'kiki';\nimport type { Skill, Domain, Risk, RoutingLogEntry, StaticRoutingTable } from 'kiki';\n\nconst SUBAGENT_TYPE_TO_SKILL: Record<string, Skill> = {\n  'kiki-brainstormer': 'brainstorming',\n  'kiki-planner': 'writing-plans',\n  'kiki-implementer': 'executing-plans',\n  'kiki-reviewer': 'reviewing',\n  'kiki-escalation': 'brainstorming',\n  'kiki-historian': 'documenting',\n};\n\nfunction getSkillFromSubagentType(subagentType: string): Skill | null {\n  return SUBAGENT_TYPE_TO_SKILL[subagentType] ?? null;\n}\n\nfunction logRoutingDecision(entry: RoutingLogEntry): void {\n  try {\n    mkdirSync('.agentic', { recursive: true });\n    const logLine = JSON.stringify(entry) + '\\n';\n    appendFileSync('.agentic/routing_log.jsonl', logLine);\n  } catch {\n    // Silently ignore logging failures\n  }\n}\n\nfunction findFallbackModel(table: StaticRoutingTable, skill: Skill, domain: Domain): string | null {\n  const key = `${skill}:${domain}`;\n  const rule = table.rules[key];\n  if (rule) return rule.standard;\n  const skillKeys = Object.keys(table.rules).filter(k => k.startsWith(`${skill}:`));\n  if (skillKeys.length > 0) return table.rules[skillKeys[0]].standard;\n  const allKeys = Object.keys(table.rules);\n  if (allKeys.length > 0) return table.rules[allKeys[0]].standard;\n  return null;\n}\n\nexport default function KikiPlugin({ client }: { client: any }) {\n  const stabilizerState = loadStabilizerState();\n\n  return {\n    'tool.execute.before': async (input: any, output: any) => {\n      if (input.tool !== 'task') return;\n\n      const subagentType = output.args?.subagent_type ?? '';\n      const skill = getSkillFromSubagentType(subagentType);\n\n      if (!skill) {\n        return;\n      }\n\n      const taskDesc = output.args?.prompt ?? '';\n      const taskId = output.args?.taskId;\n\n      const domain = classifyDomain(taskDesc);\n\n      let risk: Risk = 'standard';\n      try {\n        const config = JSON.parse(readFileSync('.agentic/config.json', 'utf-8'));\n        const pathMatches = taskDesc.match(/[\\w/.-]+\\.(ts|js|tsx|jsx|py|rs|go)/g) ?? [];\n        risk = classifyRisk(pathMatches, config.riskMatrix);\n      } catch {\n        // Config missing, use default standard\n      }\n\n      let selectedModel: string | null = getLockedModel(stabilizerState, taskId ?? null);\n      let reason: string;\n\n      if (selectedModel) {\n        reason = 'task locked';\n      } else {\n        const table = loadRoutingTable();\n\n        if (!table) {\n          console.error('[Kiki] CRITICAL: No routing table found. Check .agentic/routing.json exists.');\n          reason = 'missing routing table';\n        } else {\n          selectedModel = lookupModel(table, skill, domain, risk);\n\n          if (selectedModel) {\n            if (taskId) {\n              lockTaskModel(stabilizerState, taskId, selectedModel);\n            }\n            reason = `static routing (${risk})`;\n          } else {\n            selectedModel = findFallbackModel(table, skill, domain);\n            if (selectedModel) {\n              console.warn(`[Kiki] No exact rule for ${skill}/${domain}. Falling back to ${selectedModel}.`);\n              if (taskId) {\n                lockTaskModel(stabilizerState, taskId, selectedModel);\n              }\n              reason = 'fallback (no exact match)';\n            } else {\n              console.error(`[Kiki] CRITICAL: Routing table has no models at all for ${skill}/${domain}.`);\n              reason = 'no models in routing table';\n            }\n          }\n        }\n      }\n\n      if (selectedModel) {\n        if (!output.args) {\n          output.args = {};\n        }\n        output.args.model = selectedModel;\n\n        logRoutingDecision({\n          timestamp: new Date().toISOString(),\n          taskId,\n          skill,\n          domain,\n          risk,\n          selectedModel,\n          reason\n        });\n\n        console.log(`[Kiki] Routed ${subagentType} \u2192 ${selectedModel} (${skill}, ${domain}, ${risk})`);\n      } else {\n        console.error(`[Kiki] CRITICAL: Could not select any model for ${subagentType}. Task will use OpenCode default.`);\n      }\n    }\n  };\n}\n";
export declare const OPENCODE_PACKAGE_JSON_TEMPLATE = "{\n  \"dependencies\": {\n    \"@opencode-ai/plugin\": \"1.15.13\",\n    \"kiki\": \"github.com/luxuxorg/kiki\"\n  }\n}\n";
export declare const OPENCODE_GITIGNORE_TEMPLATE = "node_modules\npackage.json\npackage-lock.json\nbun.lock\n.gitignore\n";
export declare const WORKFLOW_TEMPLATE = "# Kiki Workflow\n\nThis document describes the Kiki software engineering pipeline enforced by the orchestrator agent.\n\n## Pipeline Phases\n\n### 1. Intake\nThe orchestrator asks clarifying questions one at a time until requirements are fully understood. No implementation begins before intake is complete.\n\n### 2. Brainstorm\nThe orchestrator dispatches the `kiki-brainstormer` subagent. The brainstormer loads the superpowers `brainstorming` skill inline and produces a design spec at `docs/superpowers/specs/...`.\n\n### 3. Plan\nThe orchestrator dispatches the `kiki-planner` subagent. The planner loads the superpowers `writing-plans` skill inline and produces an implementation plan at `docs/superpowers/plans/...`.\n\n### 4. Architect Review\nThe orchestrator reviews the plan against `.agentic/alignment.json` guardrails. An inline review is appended to the plan document. The plan must pass this gate before implementation begins.\n\n### 5. Implement\nThe `kiki-implementer` loads `executing-plans` and `test-driven-development` skills inline and implements the plan task by task. Tests are written first, then code to make them pass.\n\n### 6. Review\nThe `kiki-reviewer` loads `receiving-code-review` or `requesting-code-review` inline and verifies plan adherence, security, code quality, and test coverage. An inline verdict is appended to the plan.\n\n### 7. Document\nThe orchestrator dispatches the `kiki-historian` subagent to update `README.md`, `CHANGELOG.md`, and any project docs in `docs/*` (excluding `docs/superpowers/*`).\n\n### 8. Complete\nThe orchestrator updates `.agentic/TASK_REGISTRY.json` with the task status and any failure metrics.\n\n## Risk-Based Routing\n\n| Risk Level | Behavior |\n|---|---|\n| Standard | Uses the standard model from `.agentic/routing.json` |\n| Critical | Uses the critical model if defined for the skill+domain; falls back to standard |\n\n## Model Selection\n\nModel selection is static and manually maintained. Edit `.agentic/routing.json` to change which model is used for each skill+domain combination. The `standard` model is always used unless a `critical` override is defined and the task touches critical paths.\n";
export declare function writeAgenticFiles(targetPath: string): string;
export declare function writeOpencodeFiles(targetPath: string): void;
export declare function init(targetPath: string): Promise<void>;
//# sourceMappingURL=init.d.ts.map