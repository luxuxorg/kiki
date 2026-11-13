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
} from '../../src/cli/config';

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

  it('R10_builders_report_exact_output_reviewer_does_not_rerun', () => {
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
        expect(body, `${label} ${role}: exact command`).toContain('exact command');
        expect(body, `${label} ${role}: complete output`).toContain(
          'complete output (stdout and stderr), including failure output',
        );
        expect(body, `${label} ${role}: exit status`).toContain('exit status');
        expect(body, `${label} ${role}: handoff to reviewer and historian`).toContain(
          'handoff to the reviewer and historian',
        );
        expect(body, `${label} ${role}: implementation summary`).toContain(
          'Implementation Summary',
        );
        expect(body, `${label} ${role}: changed files`).toContain('changed files');
      }

      const reviewer = bodyOf(generateReviewerTemplate(config));
      expect(reviewer, `${label}: reviewer does not rerun checks`).toContain(
        'Do not rerun build, test, lint, or security checks',
      );
      expect(reviewer, `${label}: reviewer judges the diff and recorded evidence`).toContain(
        'Judge the diff or plan plus the recorded evidence.',
      );
      expect(reviewer, `${label}: reviewer uses the recorded command output`).toContain(
        'judge the exact command output the implementer recorded',
      );
      for (const placeholder of [
        'commands.build',
        'commands.test',
        'commands.lint',
        'commands.security',
      ]) {
        expect(reviewer, `${label}: reviewer checklist names ${placeholder}`).toContain(
          placeholder,
        );
      }
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

  it('R7_R8_ownership_and_every_revised_plan_review', () => {
    const ownership = [
      'The user approves the spec. Plans are machine-owned',
      'Changing what is delivered or what is allowed is a spec change and requires explicit user approval.',
      'Every revised plan — from a FAIL/`plan`, an escalation recommendation, or a planner-initiated improvement — passes the reviewer loop before implementation resumes.',
      'A second technical plan failure is a deadlock, not an unlimited planner loop.',
    ];

    for (const [label, config] of CONFIGS) {
      const orchestrator = bodyOf(generateOrchestratorTemplate(config));
      const workflow = generateWorkflowTemplate(config);

      for (const phrase of ownership) {
        expect(orchestrator, `${label} orchestrator: ${phrase}`).toContain(phrase);
        expect(workflow, `${label} workflow: ${phrase}`).toContain(phrase);
      }
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
        'recorded build/test/lint/security evidence',
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
