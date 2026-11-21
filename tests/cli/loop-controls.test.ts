import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_ALIGNMENT,
  DEFAULT_CONFIG,
  KikiConfig,
  generateOrchestratorTemplate,
  generateBrainstormerTemplate,
  generatePlannerTemplate,
  generateImplementerTemplate,
  generateGuiDesignerTemplate,
  generateReviewerTemplate,
  generateEscalationTemplate,
  generateHistorianTemplate,
  generateWorkflowTemplate,
  withPermissionRequestPrompt,
} from '../../src/cli/config';
import { parseDispatchLabels } from '../../src/diagnostics/ledger';

// The eight agent generators, keyed as the generated template names. The
// workflow generator is deliberately excluded: it is not an agent prompt.
const roleGenerators: Record<string, (config: KikiConfig) => string> = {
  orchestrator: generateOrchestratorTemplate,
  brainstormer: generateBrainstormerTemplate,
  planner: generatePlannerTemplate,
  implementer: generateImplementerTemplate,
  guiDesigner: generateGuiDesignerTemplate,
  reviewer: generateReviewerTemplate,
  escalation: generateEscalationTemplate,
  historian: generateHistorianTemplate,
};

const expectedRoles = [
  'orchestrator',
  'brainstormer',
  'planner',
  'implementer',
  'guiDesigner',
  'reviewer',
  'escalation',
  'historian',
];

const customConfig: KikiConfig = {
  ...DEFAULT_CONFIG,
  projectName: 'custom-project',
  commands: {
    build: 'custom-build',
    test: 'custom-test',
    lint: 'custom-lint',
    security: 'custom-security',
  },
  paths: {
    ...DEFAULT_CONFIG.paths,
    source: 'backend/',
    tests: 'spec/',
    docs: 'documentation/',
    superpowers: 'documentation/superpowers/',
    specs: 'documentation/superpowers/specs/',
    plans: 'documentation/superpowers/plans/',
    changelog: 'HISTORY.md',
    readme: 'ABOUT.md',
    decisions: 'documentation/DECISIONS.md',
    knowledge: 'knowledge/',
    taskRegistry: '.agentic/custom-tasks.json',
  },
};

// The pinned §3 block. Written as one literal so the test fails if any word
// changes; the parts below are used to extract and compare the rule sentences.
const GUARDRAIL_BLOCK_PREFIX =
  'Project guardrails (non-negotiable; source: .agentic/kiki/alignment.json):';

const GUARDRAIL_STOP_RULE =
  'If a guardrail cannot be satisfied, stop and report it; do not work around it.';

const GUARDRAIL_BLOCK =
  'Project guardrails (non-negotiable; source: .agentic/kiki/alignment.json): Never hardcode secrets in source code. Use parameterized statements for every database query. Never leak internal stack traces in API responses. If a guardrail cannot be satisfied, stop and report it; do not work around it.';

// Exact ordered guardrail list of the fixed baseline (DEFAULT_ALIGNMENT and
// this repository's .agentic/kiki/alignment.json).
const EXPECTED_GUARDRAIL_SOURCES = [
  'No hardcoded secrets in source code',
  'All database queries must use parameterized statements',
  'API responses must not leak internal stack traces',
];

// Explicit three-pair mapping: each fixed-baseline guardrail to its sentence
// in the pinned block. Neither side may drift from the other (R15).
const GUARDRAIL_CORRESPONDENCE: ReadonlyArray<readonly [string, string]> = [
  [EXPECTED_GUARDRAIL_SOURCES[0], 'Never hardcode secrets in source code.'],
  [EXPECTED_GUARDRAIL_SOURCES[1], 'Use parameterized statements for every database query.'],
  [EXPECTED_GUARDRAIL_SOURCES[2], 'Never leak internal stack traces in API responses.'],
];

function bodyOf(template: string): string {
  const match = template.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) throw new Error('missing frontmatter');
  return match[2];
}

function guardrailBlockOf(body: string): string {
  const start = body.indexOf(GUARDRAIL_BLOCK_PREFIX);
  expect(start, 'guardrail block present').toBeGreaterThanOrEqual(0);
  return body.slice(start, start + GUARDRAIL_BLOCK.length);
}

function guardrailPartsOf(block: string): { rules: string[]; stopRule: string } {
  if (!block.startsWith(GUARDRAIL_BLOCK_PREFIX)) throw new Error('missing guardrail prefix');
  const parts = block.slice(GUARDRAIL_BLOCK_PREFIX.length).trim().split('. ');
  if (parts.length !== 4) throw new Error(`unexpected guardrail sentence count: ${parts.length}`);
  return {
    rules: parts.slice(0, 3).map(sentence => `${sentence}.`),
    stopRule: parts[3],
  };
}

const CONFIGS = [
  ['default', DEFAULT_CONFIG],
  ['custom', customConfig],
] as const;

describe('reviewer report contract', () => {
  it('R1_reviewer_has_exact_three_verdicts_and_fail_fields', () => {
    for (const [label, config] of CONFIGS) {
      const body = bodyOf(generateReviewerTemplate(config));

      const verdictLines = body
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('Verdict:'));
      expect(verdictLines, `${label}: exactly one verdict line`).toEqual([
        'Verdict: PASS | PASS_WITH_NOTES | FAIL',
      ]);
      expect(body, `${label}: no binary verdict`).not.toContain('Verdict: PASS | FAIL');
      expect(body, `${label}: no fourth verdict vocabulary`).not.toMatch(
        /PLAN_BUG|PARTIAL|OUT_OF_SCOPE|DUPLICATE|CANNOT_VERIFY/,
      );

      expect(body, `${label}: Reason labels`).toContain(
        'Reason: implementation | plan | spec | user-decision | environment/permission',
      );
      expect(body, `${label}: Severity labels`).toContain(
        'Severity: critical | major | minor',
      );
      expect(body, `${label}: Evidence label`).toContain('Evidence:');
      expect(body, `${label}: fields are per blocking item`).toContain('per blocking item');
    }
  });

  it('R2_reviewer_requires_complete_evidence_and_downgrades', () => {
    for (const [label, config] of CONFIGS) {
      const body = bodyOf(generateReviewerTemplate(config));

      expect(body, `${label}: scenario evidence`).toContain('the scenario');
      expect(body, `${label}: violated rule evidence`).toContain(
        'the violated rule or requirement',
      );
      expect(body, `${label}: file/line evidence`).toContain('the file/line');
      expect(body, `${label}: plan/spec evidence quotes the fault`).toContain(
        'quotes the faulty passage and explains why no implementation can satisfy it',
      );
      expect(body, `${label}: plan review cites the spec and quoted plan passages`).toContain(
        'For a plan review, compare the plan against the approved spec and quote the plan passages your verdict depends on.',
      );
      expect(body, `${label}: code review cites the actual diff`).toContain(
        'For a code review, compare the actual diff against the plan and spec.',
      );

      expect(body, `${label}: minor items downgrade`).toContain(
        'minor items and items whose evidence is incomplete become notes',
      );
      expect(body, `${label}: no blockers without complete evidence`).toContain(
        'A FAIL stands only if at least one critical or major item with complete evidence remains; otherwise report PASS_WITH_NOTES.',
      );
      expect(body, `${label}: unverifiable is a note`).toContain(
        'Unverifiable findings become notes, never a fourth verdict.',
      );
      expect(body, `${label}: BLOCKED is not a verdict`).toContain(
        "`BLOCKED` is the implementer's report format, not a reviewer verdict.",
      );
    }
  });

  it('R3_reviewer_records_basis_and_nonblocking_notes', () => {
    for (const [label, config] of CONFIGS) {
      const body = bodyOf(generateReviewerTemplate(config));

      expect(body, `${label}: PASS states its basis`).toContain('**PASS** states `Basis:`');
      expect(body, `${label}: PASS_WITH_NOTES states its basis and notes`).toContain(
        '**PASS_WITH_NOTES** states `Basis:` plus `Notes:`',
      );
      expect(body, `${label}: notes are concrete and non-blocking`).toContain(
        'concrete, non-blocking findings',
      );
      expect(body, `${label}: notes go to the review document`).toContain('review document');
      expect(body, `${label}: notes go to phase/progress prose`).toContain(
        'phase/progress prose',
      );
      expect(body, `${label}: notes never use reviewNotes`).toContain(
        'never in `reviewNotes`',
      );
      expect(body, `${label}: reviews live in the review directory`).toContain(
        '.agentic/reviews/*',
      );
      expect(body, `${label}: reviewer does not edit the plan`).toContain(
        'Do not edit the plan or spec',
      );
    }
  });

  it('R9_reviewer_checks_silent_scope_creep', () => {
    for (const [label, config] of CONFIGS) {
      const body = bodyOf(generateReviewerTemplate(config));
      const workflow = generateWorkflowTemplate(config);

      expect(body, `${label}: standing creep list`).toContain(
        'unrequested features, widened permissions, new dependencies, extra behavior beyond the task, unrelated refactors, and violations of the project guardrails',
      );
      expect(body, `${label}: implementation creep routes to implementation`).toContain(
        'Creep in the implementation is FAIL, Reason `implementation`.',
      );
      expect(body, `${label}: plan creep quotes the passage`).toContain(
        'Creep in a plan is FAIL, Reason `plan`, with the offending passage quoted',
      );
      expect(body, `${label}: genuine scope expansion needs the user`).toContain(
        'A genuine need to expand scope is a spec change and requires explicit user approval.',
      );

      expect(workflow, `${label}: workflow names the standing scope check`).toContain(
        'standing scope-creep check',
      );
      expect(workflow, `${label}: workflow names the review location`).toContain(
        '.agentic/reviews/',
      );
      expect(workflow, `${label}: workflow does not append verdicts to plans`).not.toContain(
        'appends an inline verdict to the plan',
      );
      expect(workflow, `${label}: workflow does not append verdicts to plans`).not.toContain(
        'inline verdict is appended to the plan',
      );
    }
  });

  it('R16_reviewer_checks_alignment_without_certification_claims', () => {
    for (const [label, config] of CONFIGS) {
      const body = bodyOf(generateReviewerTemplate(config));
      const workflow = generateWorkflowTemplate(config);

      expect(body, `${label}: reads the active alignment fresh`).toContain(
        "read the active project's `.agentic/kiki/alignment.json` fresh",
      );
      expect(body, `${label}: includes custom rules`).toContain(
        'including custom rules beyond the fixed baseline block in this prompt',
      );
      expect(body, `${label}: prompt block alone is insufficient`).toContain(
        'checking only this prompt block is insufficient',
      );
      expect(body, `${label}: violations are never minor`).toContain('never minor');
      expect(body, `${label}: violations route to implementation`).toContain(
        'Reason `implementation`',
      );
      expect(body, `${label}: spec-demanded violations use spec reason`).toContain(
        'Reason `spec` instead when the spec itself demands the violation',
      );
      expect(body, `${label}: fixed-block conflict stops for the user`).toContain(
        'If the fixed block and the active file conflict, use Reason `spec` and stop for a user decision; never silently prefer either.',
      );
      expect(body, `${label}: compliance labels are context only`).toContain(
        '`OWASP Top 10` and `SOC 2 Type II` are project context only, not diff-checkable requirements',
      );
      expect(body, `${label}: no certification claims`).toContain(
        'never claim or imply that a change achieves or advances certification',
      );
      expect(body, `${label}: complete file/line evidence`).toContain(
        'complete file/line evidence',
      );

      expect(workflow, `${label}: workflow names the fresh active-file read`).toContain(
        "reads the active project's `.agentic/kiki/alignment.json` fresh in every review",
      );
      expect(workflow, `${label}: workflow names the standing alignment check`).toContain(
        'standing alignment check',
      );
    }
  });
});

describe('planner ownership', () => {
  it('R7_planner_respects_spec_ownership', () => {
    for (const [label, config] of CONFIGS) {
      const body = bodyOf(generatePlannerTemplate(config));

      expect(body, `${label}: user owns the spec`).toContain('The user approves the spec.');
      expect(body, `${label}: plans are machine-owned within the spec`).toContain(
        "Plans are machine-owned: you may revise or rewrite a plan only while the spec's requirements, scope, security intent, and acceptance criteria are unchanged.",
      );
      expect(body, `${label}: delivery or permission changes are spec changes`).toContain(
        'Changing what is delivered or what is allowed is a spec change and requires explicit user approval.',
      );
      expect(body, `${label}: a wrong spec stops for the user`).toContain(
        'If implementation reveals that the spec itself is wrong, stop and ask the user.',
      );
    }
  });
});

describe('builder evidence handoff and explicit blocking', () => {
  const builderRoles = ['implementer', 'guiDesigner'] as const;

  it('builders_report_proportional_check_evidence', () => {
    for (const [label, config] of CONFIGS) {
      const expectedCommands = [
        config.commands.build,
        config.commands.test,
        config.commands.lint,
        config.commands.security,
      ];

      for (const role of builderRoles) {
        const body = bodyOf(roleGenerators[role](config));

        for (const command of expectedCommands) {
          expect(body, `${label} ${role}: configured command ${command}`).toContain(
            `\`${command}\``,
          );
        }
        expect(body, `${label} ${role}: configured commands are options`).toContain(
          'options, not a fixed four-check checklist',
        );
        expect(body, `${label} ${role}: exact command`).toContain('exact command');
        expect(body, `${label} ${role}: scope`).toContain('its scope');
        expect(body, `${label} ${role}: exit status`).toContain('exit status');
        expect(body, `${label} ${role}: relevant results`).toContain('relevant results');
        expect(body, `${label} ${role}: full failure output`).toContain(
          'failure output in full',
        );
        expect(body, `${label} ${role}: success is a short summary`).toContain(
          'short summary',
        );
        expect(body, `${label} ${role}: one-sentence skip rationale`).toContain(
          'one sentence explaining why any relevant check was not run',
        );
        expect(body, `${label} ${role}: handoff to reviewer and historian`).toContain(
          'handoff to the reviewer and historian',
        );
        expect(body, `${label} ${role}: implementation summary`).toContain(
          'Implementation Summary',
        );
        expect(body, `${label} ${role}: changed files`).toContain('changed files');
        expect(body, `${label} ${role}: old complete-output mandate removed`).not.toContain(
          'complete output (stdout and stderr)',
        );
      }
    }

    // A project with its own commands proves configuration pass-through and the
    // absence of a hardcoded Kiki tool or candidate policy.
    const pythonConfig: KikiConfig = {
      ...DEFAULT_CONFIG,
      projectName: 'python-project',
      commands: {
        build: 'python -m build',
        test: 'python -m pytest',
        lint: 'ruff check .',
        security: 'pip-audit',
      },
    };
    for (const role of builderRoles) {
      const body = bodyOf(roleGenerators[role](pythonConfig));
      for (const command of Object.values(pythonConfig.commands)) {
        expect(body, `${role}: project command ${command}`).toContain(`\`${command}\``);
      }
      for (const kikiTool of ['vitest', 'tsc', 'OPENCODE_TEST_BINARY', 'candidate']) {
        expect(body, `${role}: no hardcoded Kiki policy ${kikiTool}`).not.toContain(kikiTool);
      }
    }

    const reviewer = bodyOf(generateReviewerTemplate(DEFAULT_CONFIG));
    expect(reviewer, 'reviewer does not rerun checks').toContain(
      'Do not rerun build, test, lint, or security checks',
    );
    expect(reviewer, 'reviewer judges the diff and recorded evidence').toContain(
      'Judge the diff or plan plus the recorded evidence.',
    );
    expect(reviewer, 'reviewer uses the recorded command output').toContain(
      'judge the exact command output the implementer recorded',
    );
  });

  it('check_status_and_prior_pass_are_honest', () => {
    for (const [label, config] of CONFIGS) {
      for (const role of builderRoles) {
        const body = bodyOf(roleGenerators[role](config));
        expect(body, `${label} ${role}: four honest statuses`).toContain(
          'failed, passed, skipped or not run',
        );
        expect(body, `${label} ${role}: no integration claim from exit status`).toContain(
          'not derive a broader integration claim from a test exit status',
        );
        expect(body, `${label} ${role}: prior PASS names its work state`).toContain(
          'earlier PASS at the named work state',
        );
        expect(body, `${label} ${role}: prior PASS is never fresh`).toContain(
          'never present it as fresh evidence',
        );
      }

      const workflow = generateWorkflowTemplate(config);
      expect(workflow, `${label}: workflow honest four statuses`).toContain(
        'failed, passed, skipped or not run',
      );
      expect(workflow, `${label}: workflow prior PASS names its work state`).toContain(
        'earlier PASS at the named work state',
      );
    }
  });

  it('R11_builders_define_BLOCKED_without_silent_workaround', () => {
    for (const [label, config] of CONFIGS) {
      for (const role of builderRoles) {
        const body = bodyOf(roleGenerators[role](config));

        expect(body, `${label} ${role}: BLOCKED report`).toContain('BLOCKED');
        expect(body, `${label} ${role}: Blocker field`).toContain('Blocker:');
        expect(body, `${label} ${role}: Tried field`).toContain('Tried:');
        expect(body, `${label} ${role}: Need field`).toContain('Need:');
        expect(body, `${label} ${role}: stop and report`).toContain('stop and report BLOCKED');
        expect(body, `${label} ${role}: report and stop`).toContain(
          'Report BLOCKED to the orchestrator and stop.',
        );
        expect(body, `${label} ${role}: no silent retry`).toContain('Do not silently retry');
        expect(body, `${label} ${role}: no workaround`).toContain(
          'do not work around the blocker',
        );
        expect(body, `${label} ${role}: no unilateral spec or plan edits`).toContain(
          'do not edit the spec or plan on your own',
        );
        expect(body, `${label} ${role}: permission block priority`).toContain(
          'A permission block takes priority',
        );
      }
    }
  });

  it('builder_prompts_do_not_authorize_unbounded_retries_or_destructive_rollback', () => {
    const prohibited = [
      'after all retries',
      'tests fail after 3 retries',
      'git checkout -- .',
    ];

    for (const [label, config] of CONFIGS) {
      for (const role of expectedRoles) {
        const body = bodyOf(roleGenerators[role](config));
        for (const phrase of prohibited) {
          expect(body, `${label} ${role}: rejects "${phrase}"`).not.toContain(phrase);
        }
      }

      const workflow = generateWorkflowTemplate(config);
      for (const phrase of prohibited) {
        expect(workflow, `${label} workflow: rejects "${phrase}"`).not.toContain(phrase);
      }

      for (const role of builderRoles) {
        const body = bodyOf(roleGenerators[role](config));
        expect(body, `${label} ${role}: tracked-state inventory retained`).toContain(
          '/tmp/kiki-tracked-before.patch',
        );
        expect(body, `${label} ${role}: untracked-state inventory retained`).toContain(
          '/tmp/kiki-untracked-before.txt',
        );
        expect(body, `${label} ${role}: git clean prohibition retained`).toContain(
          'Do NOT use `git clean -fd`',
        );
        expect(body, `${label} ${role}: pre-change inventory retained`).toContain(
          'pre-change inventory',
        );
      }
    }
  });
});

describe('proportional workflow contracts', () => {
  const builderRoles = ['implementer', 'guiDesigner'] as const;

  it('small_tasks_and_semantic_prompt_reviews', () => {
    for (const [label, config] of CONFIGS) {
      const orchestrator = bodyOf(generateOrchestratorTemplate(config));
      const brainstormer = bodyOf(generateBrainstormerTemplate(config));
      const planner = bodyOf(generatePlannerTemplate(config));
      const reviewer = bodyOf(generateReviewerTemplate(config));
      const workflow = generateWorkflowTemplate(config);

      expect(orchestrator, `${label}: small task flow`).toContain(
        'small, low-risk local task',
      );
      expect(orchestrator, `${label}: no persistent spec/plan file`).toContain(
        'no persistent spec or plan file',
      );
      expect(orchestrator, `${label}: no separate architect gate`).toContain(
        'no separate architect gate',
      );
      expect(orchestrator, `${label}: conversation plus registry state suffices`).toContain(
        'existing conversation/handoff plus a concise registry state is enough',
      );
      expect(orchestrator, `${label}: semantic prompt diffs reviewed`).toContain(
        'semantically relevant prompt diffs',
      );
      expect(orchestrator, `${label}: editorial changes need no agent run`).toContain(
        'pure editorial changes',
      );

      for (const [name, body] of Object.entries({ brainstormer, planner })) {
        expect(body, `${label} ${name}: small task artifact exception`).toContain(
          'small, low-risk local change',
        );
        expect(body, `${label} ${name}: skill artifact requirement yields`).toContain(
          'artifact requirement yields to that proportionality',
        );
      }
      expect(planner, `${label}: no architect gate for small tasks`).toContain(
        'no separate architect gate',
      );

      expect(workflow, `${label}: workflow small task flow`).toContain(
        'small, low-risk local task',
      );
      expect(workflow, `${label}: workflow no persistent spec/plan file`).toContain(
        'no persistent spec or plan file',
      );
      expect(workflow, `${label}: workflow editorial changes need no agent run`).toContain(
        'pure editorial changes',
      );
      expect(reviewer, `${label}: reviewer semantic prompt diff review`).toContain(
        'semantically relevant prompt diffs',
      );
    }
  });

  it('check_scope_uses_radius_and_uncertainty', () => {
    for (const [label, config] of CONFIGS) {
      for (const role of builderRoles) {
        const body = bodyOf(roleGenerators[role](config));
        expect(body, `${label} ${role}: focused tests are the default`).toContain(
          'Prefer focused tests',
        );
        expect(body, `${label} ${role}: unclear radius needs the broad run`).toContain(
          'change radius is unclear',
        );
        expect(body, `${label} ${role}: shared infrastructure needs the broad run`).toContain(
          'shared infrastructure',
        );
        expect(body, `${label} ${role}: no automatic full suite by path name`).toContain(
          'not merely because a path was touched',
        );
      }

      const workflow = generateWorkflowTemplate(config);
      expect(workflow, `${label}: workflow focused tests are the default`).toContain(
        'Focused tests are the default',
      );
      expect(workflow, `${label}: workflow broad fallback on uncertainty`).toContain(
        'change radius is unclear',
      );
      expect(workflow, `${label}: workflow names build/test configuration`).toContain(
        'build/test configuration',
      );
      expect(workflow, `${label}: workflow no automatic full suite by path name`).toContain(
        'not merely because a named path was touched',
      );
      expect(workflow, `${label}: old blanket check mandate removed`).not.toContain(
        'Run all four configured checks',
      );
    }
  });

  it('reviews_docs_and_registry_are_proportional', () => {
    for (const [label, config] of CONFIGS) {
      const orchestrator = bodyOf(generateOrchestratorTemplate(config));
      const brainstormer = bodyOf(generateBrainstormerTemplate(config));
      const planner = bodyOf(generatePlannerTemplate(config));
      const reviewer = bodyOf(generateReviewerTemplate(config));
      const workflow = generateWorkflowTemplate(config);

      for (const [name, text] of Object.entries({ orchestrator, workflow })) {
        expect(text, `${label} ${name}: substantial revisions are re-reviewed`).toContain(
          'substantial revised plan',
        );
        expect(text, `${label} ${name}: substantial revisions pass the reviewer loop`).toContain(
          'passes the reviewer loop before implementation resumes',
        );
        expect(text, `${label} ${name}: mechanical revisions need no review`).toContain(
          'mechanical revision',
        );
        expect(text, `${label} ${name}: mechanical revision definition`).toContain(
          'does not change requirements, scope or technical choices',
        );
        expect(text, `${label} ${name}: mechanical revisions need no new review`).toContain(
          'needs no new review',
        );
      }

      expect(reviewer, `${label}: parallelization checked only when parallelized`).toContain(
        'only when tasks are parallelized',
      );
      expect(reviewer, `${label}: no parallel tasks means nothing to check`).toContain(
        'there is nothing to check',
      );

      for (const [name, text] of Object.entries({ brainstormer, reviewer, workflow })) {
        expect(
          occurrenceCount(text, '1. **Existing capabilities/sources:**'),
          `${label} ${name}: criteria block once`,
        ).toBe(1);
        expect(text, `${label} ${name}: necessity applies only to additions`).toContain(
          'when the change adds a dependency, persistence, a new abstraction, or scope growth',
        );
        expect(text, `${label} ${name}: smallest sufficient change always checked`).toContain(
          'smallest sufficient change',
        );
      }
      expect(
        planner,
        `${label}: planner references criteria without repeating the block`,
      ).not.toContain('1. **Existing capabilities/sources:**');
      for (const phrase of [
        'A claim that no source exists must cite what was actually checked',
        'the exact command, lookup or search tried and what it returned',
        'Probes are safe, bounded and disclose their limits',
        'Null/reuse alternative',
        'Rationale for additions',
        'Additional persistence is not categorically forbidden',
        'Unique value',
        'Coupling cost',
        'Proportionality is part of these criteria',
        'justifies itself in one sentence',
      ]) {
        expect(workflow, `${label}: criteria phrase ${phrase}`).toContain(phrase);
      }
      expect(brainstormer, `${label}: no extra necessity section`).toContain(
        'No extra section, catalog or waiver format is required; the analysis lives where it already belongs.',
      );
      expect(brainstormer, `${label}: bounded probes`).toContain(
        'Use bounded, safe probes (e.g. --help, local docs) and state their limits.',
      );

      expect(orchestrator, `${label}: historian only for stale docs`).toContain(
        'only when existing documentation is actually stale',
      );
      expect(workflow, `${label}: historian only for stale docs`).toContain(
        'only when existing documentation is actually stale',
      );
      expect(workflow, `${label}: no separate documentation gate`).toContain(
        'no separate documentation gate',
      );
      expect(
        workflow,
        `${label}: registry status still prevents pending completion`,
      ).toContain('Completion is forbidden while documentation.status is `pending`');

      for (const [name, text] of Object.entries({ orchestrator, reviewer })) {
        expect(text, `${label} ${name}: registry references the review document`).toContain(
          'short reference to the review document',
        );
        expect(text, `${label} ${name}: notes are not duplicated`).toContain(
          'do not duplicate',
        );
      }
    }
  });
});

function sectionOf(body: string, heading: string): string {
  const start = body.indexOf(heading);
  if (start < 0) throw new Error(`missing section: ${heading}`);
  const rest = body.slice(start + heading.length);
  const next = rest.search(/\n## /);
  return next < 0 ? rest : rest.slice(0, next);
}

function jsonBlockAfter(workflow: string, heading: string): string {
  const start = workflow.indexOf(heading);
  if (start < 0) throw new Error(`missing heading: ${heading}`);
  const fenceStart = workflow.indexOf('```json', start);
  if (fenceStart < 0) throw new Error(`missing json block after: ${heading}`);
  const contentStart = workflow.indexOf('\n', fenceStart) + 1;
  const fenceEnd = workflow.indexOf('```', contentStart);
  if (fenceEnd < 0) throw new Error(`unterminated json block after: ${heading}`);
  return workflow.slice(contentStart, fenceEnd);
}

describe('orchestrator routing, ownership, and caps', () => {
  it('R4_orchestrator_routes_reasons_before_retry_or_escalation', () => {
    for (const [label, config] of CONFIGS) {
      const body = bodyOf(generateOrchestratorTemplate(config));

      expect(body, `${label}: routing happens before retry/escalation`).toContain(
        "Route by the reviewer's Reason before retrying or escalating",
      );
      expect(body, `${label}: PASS variants accept`).toContain(
        '**PASS** / **PASS_WITH_NOTES** → accept',
      );
      expect(body, `${label}: PASS variants have no follow-up`).toContain('no follow-up');

      expect(body, `${label}: implementation becomes one fix round`).toContain(
        '**FAIL + Reason `implementation`** → exactly one fix round',
      );
      expect(body, `${label}: one fix round goes to original builder`).toContain(
        'original builder (implementer or gui-designer)',
      );
      expect(body, `${label}: one fix round carries FAIL evidence`).toContain(
        'FAIL evidence',
      );
      expect(body, `${label}: one fix round is re-reviewed`).toContain('re-review');

      expect(body, `${label}: plan gets no fix round`).toContain(
        '**FAIL + Reason `plan`** → no fix round',
      );
      expect(body, `${label}: plan goes to planner`).toContain('`kiki-planner`');
      expect(body, `${label}: spec stops for user`).toContain(
        '**FAIL + Reason `spec`** → stop and ask the user',
      );
      expect(body, `${label}: user-decision stops for user`).toContain(
        '**FAIL + Reason `user-decision`** → stop and ask the user',
      );
      expect(body, `${label}: environment/permission is terminal`).toContain(
        '**FAIL + Reason `environment/permission`** → terminal: no retry, no workaround',
      );

      expect(body, `${label}: second FAIL classifies before escalation`).toContain(
        'On the second FAIL of the same task, or when the same failure happens twice, stop automatic work and classify the cause before spending escalation',
      );
      expect(body, `${label}: user-only vs technical classification`).toContain(
        'user-only or technical',
      );
      for (const checklistItem of [
        'missing permission/credential',
        'product or scope decision',
        'external service/hosting',
        'unclear requirement',
        'destructive or irreversible choice',
      ]) {
        expect(body, `${label}: user-only checklist names ${checklistItem}`).toContain(
          checklistItem,
        );
      }
      expect(body, `${label}: credential-caused technical failures are user-only`).toContain(
        'including ostensibly technical failures caused by a credential',
      );
      expect(body, `${label}: only technical deadlocks escalate`).toContain(
        'Only a **technical deadlock** may dispatch `kiki-escalation`, at most once per task.',
      );
    }
  });

  it('R5_terminal_dispatch_reports_never_retry', () => {
    for (const [label, config] of CONFIGS) {
      const body = bodyOf(generateOrchestratorTemplate(config));

      expect(body, `${label}: exact permission override preserved`).toContain(
        '**Permission block override:** if a subagent reports `PERMISSION_BLOCKED: <command>`, do not retry; report the blocked command and stop.',
      );
      expect(body, `${label}: terminal outcomes are never retried`).toContain(
        'Terminal dispatch outcomes are never retried with the same prompt',
      );
      expect(body, `${label}: BLOCKED is terminal`).toContain('a `BLOCKED` report');
      expect(body, `${label}: PERMISSION_BLOCKED is terminal`).toContain(
        'a `PERMISSION_BLOCKED` report',
      );
      expect(body, `${label}: planner/user-routed FAIL is terminal`).toContain(
        'a FAIL routed to the planner or the user',
      );
      expect(body, `${label}: only non-BLOCKED empty/failed results retry`).toContain(
        'non-BLOCKED empty or failed dispatch result',
      );
      expect(body, `${label}: retries the same prompt once`).toContain(
        'retry once with the same prompt',
      );

      expect(body, `${label}: old unconditional twice-failed escalation removed`).not.toContain(
        'If a task fails twice, dispatch',
      );
      expect(body, `${label}: old retry wording removed`).not.toContain(
        'tests fail after 3 retries',
      );
    }
  });

  it('BLOCKED_routing_supplies_context_or_stops_at_owner', () => {
    for (const [label, config] of CONFIGS) {
      const body = bodyOf(generateOrchestratorTemplate(config));

      expect(body, `${label}: BLOCKED routing section`).toContain(
        'When a builder reports BLOCKED with `Blocker:`, `Tried:`, `Need:`',
      );
      expect(body, `${label}: never blindly resend BLOCKED`).toContain(
        'never blindly resend the same BLOCKED prompt',
      );
      expect(body, `${label}: missing context is supplied`).toContain(
        'Missing context → supply it.',
      );
      expect(body, `${label}: plan ambiguity/bug goes planner then reviewer`).toContain(
        'Plan ambiguity or plan bug → dispatch `kiki-planner`, then the reviewer loop.',
      );
      expect(body, `${label}: permission/credential/product asks the user`).toContain(
        'Permission, credential, or product decision → stop and ask the user.',
      );
      expect(body, `${label}: technical deadlock follows the one-escalation limit`).toContain(
        'Technical deadlock → the one-escalation limit above.',
      );
    }
  });

  it('R10_orchestrator_coordinates_without_project_checks', () => {
    for (const [label, config] of CONFIGS) {
      const body = bodyOf(generateOrchestratorTemplate(config));

      expect(body, `${label}: no project checks`).toContain(
        'You run no project checks: do not run build, test, lint, or security commands yourself.',
      );
      expect(body, `${label}: passes recorded evidence along`).toContain(
        'Pass the recorded evidence from builders to the reviewer and escalation.',
      );
    }
  });

  it('R13_caps_use_existing_failures_and_phase_prose', () => {
    for (const [label, config] of CONFIGS) {
      const body = bodyOf(generateOrchestratorTemplate(config));

      expect(body, `${label}: one eligible dispatch retry`).toContain(
        'At most one eligible dispatch retry',
      );
      expect(body, `${label}: two review rounds`).toContain(
        'At most two review rounds per task',
      );
      expect(body, `${label}: one implementation fix round between`).toContain(
        'one implementation fix round between them',
      );
      expect(body, `${label}: one escalation per task`).toContain('One escalation per task.');
      expect(body, `${label}: same failure twice stops`).toContain(
        'The same failure twice stops automatic work.',
      );
      expect(body, `${label}: failures counter reused`).toContain(
        'increment the existing numeric `failures` field',
      );
      expect(body, `${label}: review rounds in phase/progress prose`).toContain(
        "summarized in the task's phase/progress prose",
      );
      expect(body, `${label}: no new counters`).toContain(
        'no new registry counters or schema fields',
      );
      expect(body, `${label}: 30-minute timeout retained`).toContain(
        '30-minute dispatch timeout',
      );
      expect(body, `${label}: watchdog retained`).toContain('watchdog thresholds');
      expect(body, `${label}: budget engine deferred`).toContain(
        'budget engine is deferred, not rejected',
      );

      const workflow = generateWorkflowTemplate(config);
      const schema = JSON.parse(
        jsonBlockAfter(workflow, '## Task Registry Schema'),
      ) as Record<string, unknown>;
      expect(Object.keys(schema), `${label}: schema keys unchanged`).toEqual([
        'id',
        'description',
        'status',
        'phase',
        'failures',
        'startedAt',
        'completedAt',
        'spec',
        'plan',
        'reviewNotes',
        'documentation',
      ]);
      for (const key of Object.keys(schema)) {
        expect(key, `${label}: no budget/review/escalation counter`).not.toMatch(
          /budget|reviewRounds|escalations?/i,
        );
      }
    }
  });
});

describe('escalation contract and presentation', () => {
  it('R6_escalation_contract_has_exact_five_recommendations', () => {
    for (const [label, config] of CONFIGS) {
      const body = bodyOf(generateEscalationTemplate(config));
      const recommendations = sectionOf(body, '## Recommendations');

      // Extract only the ordered recommendation list and compare its entries.
      const entries = [...recommendations.matchAll(/^\d+\. \*\*(.+?)\*\*/gm)].map(
        match => match[1],
      );
      expect(entries, `${label}: exact five recommendations in order`).toEqual([
        'Fix with guidance',
        'Rewrite plan',
        'Rewrite spec',
        'Split',
        'Stop-needs-user',
      ]);
      expect(recommendations, `${label}: announces exactly five`).toContain(
        'Return exactly one of these five recommendations:',
      );
      for (const alias of ['**Redesign:**', '**Stop:**', '**Rewrite plan:**']) {
        expect(body, `${label}: no shortened alias ${alias}`).not.toContain(alias);
      }

      expect(body, `${label}: both review reports are inputs`).toContain(
        'both review reports',
      );
      expect(body, `${label}: actual diff is input`).toContain('the actual diff');
      expect(body, `${label}: recorded builder evidence is input`).toContain(
        'recorded proportional check evidence',
      );
      expect(body, `${label}: registry/health/routing logs on request`).toContain(
        'task registry, health log, and routing log',
      );
      expect(body, `${label}: rewrite quotes the faulty passage`).toContain(
        'quote the faulty plan/spec passage and explain why no implementation can satisfy it',
      );
      expect(body, `${label}: may reproduce checks in the current tree`).toContain(
        'reproduce the failure by running build, test, lint, and read-only git commands in the current tree',
      );
      expect(body, `${label}: justified scratch copy`).toContain(
        'scratch copy under `/tmp/opencode`',
      );
      expect(body, `${label}: scratch via routine shell`).toContain('routine shell');
      expect(body, `${label}: scratch never via edit tool`).toContain(
        'never use the edit tool',
      );
      expect(body, `${label}: one escalation report`).toContain(
        'exactly one escalation report',
      );
      expect(body, `${label}: optional unapplied patch`).toContain(
        'optional proposed patch left **unapplied**',
      );
      expect(body, `${label}: artifacts only in review directory`).toContain(
        '`.agentic/reviews/*` (your only edit grant)',
      );
      expect(body, `${label}: no source edits`).toContain('Do not edit source');
      expect(body, `${label}: no publish/remote/permission changes`).toContain(
        'do not publish, perform remote writes, or change permissions',
      );
      expect(body, `${label}: prompt-level restrictions are honest`).toContain(
        'prompt-level restrictions, not mechanical permission denial',
      );
      expect(body, `${label}: implementer applies approved patch`).toContain(
        'applied by the implementer through the normal review loop',
      );
      expect(body, `${label}: at most once per task`).toContain('at most once per task');
    }
  });

  it('R12_orchestrator_presents_escalation_recommendations_before_action', () => {
    for (const [label, config] of CONFIGS) {
      const body = bodyOf(generateOrchestratorTemplate(config));

      expect(body, `${label}: present recommendation before anything`).toContain(
        'Present the escalation recommendation to the user before doing anything',
      );
      expect(body, `${label}: no automatic rewrites`).toContain(
        'nothing is rewritten automatically',
      );
      expect(body, `${label}: Fix with guidance proceeds`).toContain(
        '**Fix with guidance** → proceed with the fix; no plan or spec change.',
      );
      expect(body, `${label}: Rewrite plan goes to planner`).toContain(
        '**Rewrite plan** → dispatch `kiki-planner`',
      );
      expect(body, `${label}: Rewrite plan is reviewed`).toContain(
        'revised plan passes the reviewer loop before implementation resumes',
      );
      expect(body, `${label}: Rewrite spec goes to brainstormer`).toContain(
        '**Rewrite spec** → dispatch `kiki-brainstormer`',
      );
      expect(body, `${label}: Rewrite spec needs user approval`).toContain(
        'revised spec requires explicit user approval',
      );
      expect(body, `${label}: Split is user then planner`).toContain(
        '**Split** → the user decides, then dispatch `kiki-planner`.',
      );
      expect(body, `${label}: Stop is user decision`).toContain(
        '**Stop-needs-user** → the user decides.',
      );
    }
  });
});

describe('orchestrator dispatch labels and requested comparisons', () => {
  it('R17_labels_keep_task_kind_and_optional_comparison_group', () => {
    for (const [label, config] of CONFIGS) {
      const body = bodyOf(generateOrchestratorTemplate(config));

      expect(body, `${label}: normal label grammar`).toContain('[task:<taskId> <kind>]');
      expect(body, `${label}: comparison label grammar`).toContain(
        '[task:<taskId> <kind> cmp:<groupId>]',
      );
      expect(body, `${label}: normal example`).toContain(
        '[task:diag fix] Correct regression now',
      );
      expect(body, `${label}: comparison example`).toContain(
        '[task:diag review cmp:trial] Check changes',
      );
      expect(body, `${label}: description stays 3-5 words`).toContain('3–5-word');
      expect(body, `${label}: kind is one of three`).toContain(
        '`initial` | `fix` | `review`',
      );
      expect(body, `${label}: cmp never overwrites task/kind`).toContain(
        '`cmp` is an independent field and never overwrites the task ID or kind',
      );
      expect(body, `${label}: missing labels log unknown`).toContain(
        'malformed or missing label logs `unknown`',
      );
      expect(body, `${label}: existing task identity`).toContain('existing task identity');
      expect(body, `${label}: no new registry counters`).toContain(
        'no new registry counters',
      );
    }

    const normal = '[task:diag fix] Correct regression now';
    const comparison = '[task:diag review cmp:trial] Check changes';
    expect(normal.split(/\s+/)).toHaveLength(5);
    expect(comparison.split(/\s+/)).toHaveLength(5);
    expect(parseDispatchLabels(normal)).toEqual({
      taskId: 'diag',
      kind: 'fix',
      comparisonGroup: 'unknown',
    });
    expect(parseDispatchLabels(comparison)).toEqual({
      taskId: 'diag',
      kind: 'review',
      comparisonGroup: 'trial',
    });
    expect(parseDispatchLabels('Correct regression now')).toEqual({
      taskId: 'unknown',
      kind: 'unknown',
      comparisonGroup: 'unknown',
    });
  });

  it('R18_requested_comparisons_use_existing_authorized_workflow', () => {
    for (const [label, config] of CONFIGS) {
      const body = bodyOf(generateOrchestratorTemplate(config));

      expect(body, `${label}: explicit user request only`).toContain(
        'Only when the user explicitly requests a comparison',
      );
      expect(body, `${label}: user supplies task, variants and revision`).toContain(
        'obtain the task text, chosen variants and starting revision from the user',
      );
      expect(body, `${label}: orchestrator is dispatch-only`).toContain('dispatch-only');
      expect(body, `${label}: delegates to authorized builders`).toContain(
        'delegate preparation and execution to existing authorized builders',
      );
      expect(body, `${label}: user-prepared directories are allowed`).toContain(
        'user-prepared directories',
      );
      expect(body, `${label}: fresh separate worktrees`).toContain(
        'fresh separate worktree',
      );
      expect(body, `${label}: same starting revision`).toContain('same starting revision');
      expect(body, `${label}: worktrees are not sandboxes`).toContain(
        'worktrees are not sandboxes',
      );
      expect(body, `${label}: ordinary permissions`).toContain('ordinary permissions');
      expect(body, `${label}: no invented workdir argument`).toContain(
        'no invented subagent working-directory argument',
      );
      expect(body, `${label}: marker uses existing writer`).toContain('createLedgerWriter');
      expect(body, `${label}: marker is metadata only`).toContain(
        'metadata-only comparison marker',
      );
      expect(body, `${label}: known revisions only`).toContain(
        'known starting commit and any genuinely available result commit',
      );
      expect(body, `${label}: off writes nothing`).toContain(
        'when collection is off, no marker is written',
      );
      expect(body, `${label}: no prompt or source copies`).toContain(
        'never copy prompts, diffs or source',
      );
      expect(body, `${label}: no hidden models or paid trials`).toContain(
        'no hidden models, paid trials, global routing edits or automatic commits',
      );
      expect(body, `${label}: compares metadata side by side`).toContain(
        'compare metadata and per-session statistics side by side',
      );
      expect(body, `${label}: never claims quality or savings`).toContain(
        'never claim equal quality, savings or equivalence',
      );
      expect(body, `${label}: unknown token attribution`).toContain(
        'token attribution stays unknown',
      );
      expect(body, `${label}: no new execution surface`).toContain(
        'no new CLI command, runner or subagent argument',
      );
    }
  });
});

describe('workflow governance', () => {
  it('R1_workflow_documents_three_verdicts_and_fields', () => {
    for (const [label, config] of CONFIGS) {
      const workflow = generateWorkflowTemplate(config);

      expect(workflow, `${label}: exact three verdicts`).toContain(
        'Verdict: PASS | PASS_WITH_NOTES | FAIL',
      );
      expect(workflow, `${label}: no binary verdict`).not.toContain(
        'Verdict: PASS | FAIL',
      );
      expect(workflow, `${label}: no fourth verdict token`).not.toMatch(
        /PLAN_BUG|PARTIAL|OUT_OF_SCOPE|DUPLICATE|CANNOT_VERIFY/,
      );
      expect(workflow, `${label}: no binary or fourth verdict`).toContain(
        'no binary or fourth verdict',
      );
      expect(workflow, `${label}: Reason categories`).toContain(
        '`Reason: implementation | plan | spec | user-decision | environment/permission`',
      );
      expect(workflow, `${label}: Severity levels`).toContain(
        '`Severity: critical | major | minor`',
      );
      expect(workflow, `${label}: Evidence field`).toContain('`Evidence:`');
    }
  });
});

describe('alignment guardrail baseline', () => {
  it('R15_guardrail_block_all_eight_roles_exactly_once', () => {
    // Compare against the named generators, not merely a count: a new role or a
    // renamed generator must be reflected here deliberately.
    expect(Object.keys(roleGenerators).sort()).toEqual(expectedRoles.slice().sort());

    for (const [label, config] of [
      ['default', DEFAULT_CONFIG],
      ['custom', customConfig],
    ] as const) {
      for (const role of expectedRoles) {
        const body = bodyOf(roleGenerators[role](config));
        const occurrences = body.split(GUARDRAIL_BLOCK).length - 1;
        expect(occurrences, `${label} ${role}: guardrail block appears exactly once`).toBe(1);
      }
    }
  });

  it('R15_guardrail_rules_match_alignment_one_to_one', () => {
    // Test code only: read the repository alignment, never feed it to a
    // generator. The generated block stays a fixed literal.
    const alignment = JSON.parse(
      readFileSync(new URL('../../.agentic/kiki/alignment.json', import.meta.url), 'utf8'),
    ) as { guardrails: string[]; compliance: string[] };

    expect(alignment.guardrails).toEqual(EXPECTED_GUARDRAIL_SOURCES);
    expect(alignment.guardrails).toEqual(DEFAULT_ALIGNMENT.guardrails);
    expect(GUARDRAIL_CORRESPONDENCE.map(([source]) => source)).toEqual(EXPECTED_GUARDRAIL_SOURCES);
    expect(GUARDRAIL_BLOCK).toBe(
      [
        GUARDRAIL_BLOCK_PREFIX,
        ...GUARDRAIL_CORRESPONDENCE.map(([, sentence]) => sentence),
        GUARDRAIL_STOP_RULE,
      ].join(' '),
    );

    for (const [label, config] of [
      ['default', DEFAULT_CONFIG],
      ['custom', customConfig],
    ] as const) {
      for (const role of expectedRoles) {
        const block = guardrailBlockOf(bodyOf(roleGenerators[role](config)));
        expect(block, `${label} ${role}: fixed literal`).toBe(GUARDRAIL_BLOCK);

        const { rules, stopRule } = guardrailPartsOf(block);
        expect(rules, `${label} ${role}: ordered rule sentences`).toEqual(
          GUARDRAIL_CORRESPONDENCE.map(([, sentence]) => sentence),
        );
        expect(stopRule, `${label} ${role}: trailing stop rule`).toBe(GUARDRAIL_STOP_RULE);
      }
    }
  });

  it('guardrail_block_excludes_compliance_labels', () => {
    const complianceLabels = ['OWASP Top 10', 'SOC 2 Type II'];
    for (const label of complianceLabels) {
      expect(GUARDRAIL_BLOCK).not.toContain(label);
    }

    for (const [configuration, config] of [
      ['default', DEFAULT_CONFIG],
      ['custom', customConfig],
    ] as const) {
      for (const role of expectedRoles) {
        const block = guardrailBlockOf(bodyOf(roleGenerators[role](config)));
        for (const label of complianceLabels) {
          expect(
            block,
            `${configuration} ${role}: ${label} is project context, not a guardrail`,
          ).not.toContain(label);
        }
      }
    }
  });
});

function occurrenceCount(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

describe('necessity gate criteria and delivery boundaries', () => {
  it('R19_reviewer_technical_authority', () => {
    for (const [label, config] of CONFIGS) {
      const body = bodyOf(generateReviewerTemplate(config));
      const workflow = generateWorkflowTemplate(config);

      expect(body, `${label}: rationale or prior approval is not proof`).toContain(
        'Rationale presence or prior approval is never proof of soundness or an automatic PASS',
      );
      expect(body, `${label}: rejects evidenced unnecessary choices`).toContain(
        'reject provably unnecessary, duplicative, insecure or disproportionately complex technical choices',
      );
      expect(body, `${label}: rejection is not limited to impossibility`).toContain(
        'Rejection is not limited to impossibility',
      );
      expect(body, `${label}: implementable but unsound can still FAIL`).toContain(
        'a technically implementable but concretely evidenced unnecessary, duplicative, insecure or disproportionately complex choice can still FAIL with Reason `spec` or `plan` on that substantive evidence',
      );
      expect(body, `${label}: product goals stay user-owned`).toContain(
        "Product goals and informed explicit user decisions stay the user's",
      );
      expect(body, `${label}: not a taste veto`).toContain('this is not a taste veto');
      expect(body, `${label}: existing severity treatment retained`).toContain(
        'The existing Severity and downgrade rules still decide blocking: minor or uncertain findings become notes.',
      );

      expect(workflow, `${label}: workflow records implementable-but-unsound failures`).toContain(
        'concretely evidenced technical unsoundness can fail even when implementable',
      );
      expect(workflow, `${label}: workflow keeps product ownership`).toContain(
        "product goals and informed user decisions stay the user's",
      );
    }
  });

  it('R19_cumulative_root_cause_review', () => {
    for (const [label, config] of CONFIGS) {
      const body = bodyOf(generateReviewerTemplate(config));
      const workflow = generateWorkflowTemplate(config);

      for (const phrase of [
        'Focus per artifact',
        'spec: technical necessity/viability, alternatives, risks',
        'plan: concrete choices, decomposition, feasibility within the approved boundaries, justified need',
        'code: actual need, correctness, security, regressions of the diff, not mere plan adherence',
        "at plan review reassess the spec's technical assumptions with the plan's new evidence",
        'an approved spec is a comparison target, never unquestionable',
        'at code review recheck plan and spec adequacy in light of the implementation evidence',
        'reuse evidence, reassess relevant assumptions, do not re-investigate everything or duplicate analysis',
        "A FAIL's Reason follows the flaw's root cause, not the phase it surfaced in",
        'spec flaw → `spec`, plan flaw → `plan`, implementation flaw → `implementation`',
        'never force the builder to satisfy faulty upstream instructions',
        'a concretely evidenced upstream flaw never downgrades merely because the artifact previously passed',
      ]) {
        expect(body, `${label}: cumulative root-cause phrase ${phrase}`).toContain(phrase);
      }

      expect(workflow, `${label}: workflow documents cumulative scrutiny`).toContain(
        'Scrutiny is cumulative',
      );
      expect(workflow, `${label}: workflow reuses evidence`).toContain(
        'reusing prior evidence without full re-investigation',
      );
      expect(workflow, `${label}: workflow routes by root cause`).toContain(
        "A FAIL's Reason follows the flaw's root cause",
      );
    }
  });

  it('R19_planner_owns_technical_details', () => {
    for (const [label, config] of CONFIGS) {
      const body = bodyOf(generatePlannerTemplate(config));

      for (const phrase of [
        'New technical details',
        'are yours to choose and justify',
        'give the actual tradeoff for each',
        "without copying the spec's analysis into the plan",
        'Not being mentioned in the spec does not make a technical choice a spec change',
        "Report BLOCKED only when a choice would change the approved spec's requirements, scope, security intent, acceptance criteria",
        'or when evidence you need for a decision is genuinely unavailable',
        'never invent evidence',
      ]) {
        expect(body, `${label}: planner ownership phrase ${phrase}`).toContain(phrase);
      }
      expect(body, `${label}: planner does not silently treat absence as a spec change`).not.toContain(
        'absence from the spec is a spec change',
      );
    }
  });

  it('R19_delivery_boundaries', () => {
    for (const [label, config] of CONFIGS) {
      const brainstormer = bodyOf(generateBrainstormerTemplate(config));
      const planner = bodyOf(generatePlannerTemplate(config));
      const reviewer = bodyOf(generateReviewerTemplate(config));
      const workflow = generateWorkflowTemplate(config);

      // §6 insertion anchors/order.
      const brainstormerInstructions = brainstormer.indexOf('## Instructions');
      const brainstormerNecessity = brainstormer.indexOf('## Necessity (Kiki-specific, in addition to the loaded skill)');
      expect(brainstormerInstructions, `${label}: brainstormer instructions present`).toBeGreaterThanOrEqual(0);
      expect(brainstormerNecessity, `${label}: brainstormer necessity heading`).toBeGreaterThan(
        brainstormerInstructions,
      );

      const plannerOwnership = planner.indexOf('## Ownership');
      const plannerNecessity = planner.indexOf('## Necessity (Kiki-specific, in addition to the loaded skill)');
      const plannerMetadata = planner.indexOf('## Task Metadata');
      expect(plannerOwnership, `${label}: planner ownership present`).toBeGreaterThanOrEqual(0);
      expect(plannerNecessity, `${label}: planner necessity heading`).toBeGreaterThan(plannerOwnership);
      expect(plannerMetadata, `${label}: planner necessity before task metadata`).toBeGreaterThan(
        plannerNecessity,
      );

      const reviewerStanding = reviewer.indexOf('## Standing Checks');
      const reviewerNecessity = reviewer.indexOf('**Necessity (Kiki-specific, in addition to the loaded skill):**');
      const reviewerOutput = reviewer.indexOf('## Output Format');
      expect(reviewerStanding, `${label}: reviewer standing checks present`).toBeGreaterThanOrEqual(0);
      expect(reviewerNecessity, `${label}: reviewer necessity bullet`).toBeGreaterThan(reviewerStanding);
      expect(reviewerOutput, `${label}: reviewer necessity before output format`).toBeGreaterThan(
        reviewerNecessity,
      );

      const workflowOwnership = workflow.indexOf('## Ownership and Revised Plans');
      const workflowNecessity = workflow.indexOf('## Necessity Gate');
      const workflowRouting = workflow.indexOf('## Orchestrator Routing and Loop Caps');
      expect(workflowOwnership, `${label}: workflow ownership section`).toBeGreaterThanOrEqual(0);
      expect(workflowNecessity, `${label}: workflow necessity gate section`).toBeGreaterThan(workflowOwnership);
      expect(workflowRouting, `${label}: workflow necessity gate before routing`).toBeGreaterThan(
        workflowNecessity,
      );

      // Workflow phases name the check without repeating the criteria block.
      const phase2 = workflow.indexOf('### 2. Brainstorm');
      const phase4 = workflow.indexOf('### 4. Architect Review');
      const phase6 = workflow.indexOf('### 6. Review');
      expect(phase2, `${label}: phase 2 exists`).toBeGreaterThanOrEqual(0);
      expect(phase4, `${label}: phase 4 exists`).toBeGreaterThan(phase2);
      expect(phase6, `${label}: phase 6 exists`).toBeGreaterThan(phase4);
      expect(workflow.slice(phase2, phase4), `${label}: phase 2 proportional necessity prose`).toContain(
        'covers the necessity criteria proportionally',
      );
      expect(workflow.slice(phase4, phase6), `${label}: phase 4 necessity check`).toContain(
        'standing necessity check',
      );
      expect(workflow.slice(phase6, workflow.indexOf('### 7. Document')), `${label}: phase 6 necessity check`).toContain(
        'standing necessity check',
      );
      expect(
        occurrenceCount(workflow, '1. **Existing capabilities/sources:**'),
        `${label}: workflow criteria once`,
      ).toBe(1);

      // Additive-to-skill framing, no new review pass.
      for (const [name, text] of Object.entries({ brainstormer, planner, reviewer })) {
        expect(text, `${label} ${name}: Kiki-specific addition framing`).toContain(
          'in addition to the loaded skill',
        );
      }
      expect(workflow, `${label}: no new review pass`).toContain(
        'no extra record, section, catalog or review pass is added',
      );

      // Unchanged roles receive no necessity additions.
      for (const role of ['orchestrator', 'implementer', 'guiDesigner', 'escalation', 'historian'] as const) {
        expect(bodyOf(roleGenerators[role](config)), `${label} ${role}: untouched by necessity gate`).not.toContain(
          'Necessity',
        );
      }
    }
  });
});

describe('managed permission request prompt fragment', () => {
  const HEADING = '## Kiki managed permission requests (v1)';
  const REQUIRED = [
    'own role',
    'validator',
    'native',
    'kiki permissions add',
    '--apply',
    'raw config',
    'global policy',
    'wrappers',
    'PERMISSION_BLOCKED',
  ];

  it('adds exactly one narrow fragment to every role prompt', () => {
    for (const [label, config] of CONFIGS) {
      for (const role of expectedRoles) {
        const body = bodyOf(roleGenerators[role](config));
        expect(body.split(HEADING).length - 1, `${label} ${role}: one heading`).toBe(1);
        for (const phrase of REQUIRED) {
          expect(body, `${label} ${role}: ${phrase}`).toContain(phrase);
        }
        expect(body, `${label} ${role}: narrow file/dir exception`).toMatch(/additional file or directory rights/i);
        expect(body, `${label} ${role}: no general command rights`).toMatch(/no general command rights/i);
        expect(body, `${label} ${role}: rejection stops`).toMatch(/rejected ask|rejection/i);
      }
    }
  });

  it('explicitly accommodates the older no-command/no-permission wording', () => {
    for (const [label, config] of CONFIGS) {
      const orchestrator = bodyOf(generateOrchestratorTemplate(config));
      const escalation = bodyOf(generateEscalationTemplate(config));
      expect(orchestrator, `${label}: older orchestrator wording`).toContain(
        'Do not write code, implementation files, docs, or run commands',
      );
      expect(escalation, `${label}: older escalation wording`).toContain(
        'do not publish, perform remote writes, or change permissions',
      );
      for (const body of [orchestrator, escalation]) {
        expect(body).toMatch(/older .*do not run commands.*do not change permissions.*wording/i);
      }
    }
  });

  it('is idempotent, preserves the original body as an exact prefix, and refuses conflicts', () => {
    const custom = '# Custom\r\n\r\nKeep this exact body.\r\n';
    const once = withPermissionRequestPrompt(custom);
    expect(once.startsWith(custom)).toBe(true);
    expect(once.split(HEADING).length - 1).toBe(1);
    expect(withPermissionRequestPrompt(once)).toBe(once);

    const conflicting = `# Custom\n\n${HEADING}\n\nDifferent managed text.\n`;
    expect(() => withPermissionRequestPrompt(conflicting)).toThrow(/conflict|managed/i);
    const duplicate = `# Custom\n\n${HEADING}\n\nOriginal.\n\n${HEADING}\n\nDuplicate.\n`;
    expect(() => withPermissionRequestPrompt(duplicate)).toThrow(/duplicate|conflict|managed/i);
  });
});
