import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'jsonc-parser';
import { install } from '../../src/cli/commands/install';
import { update } from '../../src/cli/commands/update';
import { parseAgent, readOpenCodeSettings, type PermissionRule } from '../../src/cli/opencode-config';
import {
  generateAgentPermissions, generateGlobalPermissions, generateSecretPolicies,
} from '../../src/cli/config';
import { currentPackageSpec } from '../../src/cli/oc2-registration';

const AGENTS = [
  'kiki-orchestrator', 'kiki-brainstormer', 'kiki-planner', 'kiki-implementer',
  'kiki-gui-designer', 'kiki-reviewer', 'kiki-escalation', 'kiki-historian',
];

// The pinned §3 guardrail block. This delivery test asserts the installed
// copies carry it verbatim exactly once, matching the generated templates.
const GUARDRAIL_BLOCK =
  'Project guardrails (non-negotiable; source: .agentic/kiki/alignment.json): Never hardcode secrets in source code. Use parameterized statements for every database query. Never leak internal stack traces in API responses. If a guardrail cannot be satisfied, stop and report it; do not work around it.';

const REVIEWER_CONTRACT_LINE = 'Verdict: PASS | PASS_WITH_NOTES | FAIL';

function bodyCount(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

function filesUnder(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .flatMap(entry => {
      const full = join(directory, entry.name);
      return entry.isDirectory() ? filesUnder(full) : [full];
    });
}

describe('global installation CLI', () => {
  let root: string;
  let global: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kiki-install-'));
    vi.stubEnv('XDG_CONFIG_HOME', root);
    global = join(root, 'opencode');
  });
  afterEach(() => { vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }); });

  it('writes eight prompt-only agent files and persists canonical arrays in the global config', async () => {
    await install([]);

    const canonical = generateAgentPermissions();
    const settings = readOpenCodeSettings(global, true).agents ?? {};
    for (const name of AGENTS) {
      const file = join(global, 'agents', `${name}.md`);
      expect(existsSync(file), name).toBe(true);
      const { settings: markdown } = parseAgent(readFileSync(file, 'utf8'), file);
      expect(markdown, name).not.toHaveProperty('model');
      expect(markdown, name).not.toHaveProperty('permissions');
      expect(markdown, name).not.toHaveProperty('permission');
      expect(markdown.mode, name).toBe(name === 'kiki-orchestrator' ? 'primary' : 'subagent');
      // The global config owns the canonical single-source arrays.
      expect(settings[name].permissions, name).toEqual(canonical[name]);
    }
    expect(parse(readFileSync(join(global, 'opencode.jsonc'), 'utf8')).plugins).toEqual([currentPackageSpec()]);
    expect(parse(readFileSync(join(global, 'cli.json'), 'utf8')).plugins).toEqual([currentPackageSpec()]);
    expect(existsSync(join(global, 'kiki/prompts'))).toBe(false);
    expect(existsSync(join(global, 'kiki/tui.js'))).toBe(false);
    expect(existsSync(join(global, 'plugins/kiki.ts'))).toBe(false);
    expect(existsSync(join(global, 'tui.json'))).toBe(false);
    expect(existsSync(join(global, 'package.json'))).toBe(false);
    expect(existsSync(join(global, 'node_modules'))).toBe(false);
    expect(existsSync(join(global, 'kiki/agentic-workflow.md'))).toBe(true);
  });

  it('installs_loop_control_prompts_for_all_eight_roles', async () => {
    await install([]);

    for (const name of AGENTS) {
      const file = join(global, 'agents', `${name}.md`);
      const { prompt } = parseAgent(readFileSync(file, 'utf8'), file);
      expect(bodyCount(prompt, GUARDRAIL_BLOCK), `${name}: guardrail block exactly once`).toBe(1);
    }

    const reviewerFile = join(global, 'agents', 'kiki-reviewer.md');
    const reviewer = parseAgent(readFileSync(reviewerFile, 'utf8'), reviewerFile).prompt;
    expect(reviewer, 'reviewer: three-verdict contract').toContain(REVIEWER_CONTRACT_LINE);
    expect(reviewer, 'reviewer: no binary verdict').not.toContain('Verdict: PASS | FAIL');
    expect(reviewer, 'reviewer: fresh active alignment read').toContain(
      "read the active project's `.agentic/kiki/alignment.json` fresh",
    );

    const workflow = readFileSync(join(global, 'kiki/agentic-workflow.md'), 'utf8');
    expect(workflow, 'workflow: three-verdict contract').toContain(REVIEWER_CONTRACT_LINE);
    expect(workflow, 'workflow: Reason categories').toContain(
      '`Reason: implementation | plan | spec | user-decision | environment/permission`',
    );
    expect(workflow, 'workflow: Severity levels').toContain(
      '`Severity: critical | major | minor`',
    );
    expect(workflow, 'workflow: Evidence field').toContain('`Evidence:`');
    expect(workflow, 'workflow: fresh active alignment read').toContain(
      "reads the active project's `.agentic/kiki/alignment.json` fresh in every review",
    );

    // Necessity gate delivery: one representative phrase per affected prompt
    // and the workflow gate section.
    const brainstormerFile = join(global, 'agents', 'kiki-brainstormer.md');
    const brainstormer = parseAgent(
      readFileSync(brainstormerFile, 'utf8'),
      brainstormerFile,
    ).prompt;
    expect(brainstormer, 'brainstormer: necessity criteria').toContain(
      'Existing capabilities/sources',
    );
    expect(brainstormer, 'brainstormer: no extra section/catalog/waiver').toContain(
      'No extra section, catalog or waiver format is required',
    );

    const plannerFile = join(global, 'agents', 'kiki-planner.md');
    const planner = parseAgent(readFileSync(plannerFile, 'utf8'), plannerFile).prompt;
    expect(planner, 'planner: owns in-boundary technical details').toContain(
      'Not being mentioned in the spec does not make a technical choice a spec change',
    );

    expect(reviewer, 'reviewer: technical rejection not limited to impossibility').toContain(
      'Rejection is not limited to impossibility',
    );

    expect(workflow, 'workflow: necessity gate section').toContain('## Necessity Gate');
    expect(workflow, 'workflow: standing necessity check').toContain(
      'standing necessity check',
    );

    const implementerFile = join(global, 'agents', 'kiki-implementer.md');
    const implementer = parseAgent(
      readFileSync(implementerFile, 'utf8'),
      implementerFile,
    ).prompt;
    expect(implementer, 'implementer: configured checks are options').toContain(
      'options, not a fixed four-check checklist',
    );
    expect(implementer, 'implementer: honest check statuses').toContain(
      'failed, passed, skipped or not run',
    );
    expect(implementer, 'implementer: prior PASS is named').toContain(
      'earlier PASS at the named work state',
    );

    const orchestratorFile = join(global, 'agents', 'kiki-orchestrator.md');
    const orchestrator = parseAgent(
      readFileSync(orchestratorFile, 'utf8'),
      orchestratorFile,
    ).prompt;
    expect(orchestrator, 'orchestrator: small task flow').toContain(
      'no persistent spec or plan file',
    );

    expect(reviewer, 'reviewer: parallelization only when parallelized').toContain(
      'only when tasks are parallelized',
    );
    expect(workflow, 'workflow: proportional check scope').toContain(
      'not merely because a named path was touched',
    );
    expect(workflow, 'workflow: historian only for stale docs').toContain(
      'only when existing documentation is actually stale',
    );
  });

  it('preserves custom prompt bytes and CRLF while persisting canonical arrays', async () => {
    mkdirSync(join(global, 'agents'), { recursive: true });
    const customBody = '# Custom Prompt\r\n\r\nKeep this exact body.\r\n';
    writeFileSync(join(global, 'agents', 'kiki-reviewer.md'),
      `---\r\ndescription: custom\r\nmode: subagent\r\n---\r\n${customBody}`);
    mkdirSync(global, { recursive: true });
    writeFileSync(join(global, 'opencode.jsonc'), JSON.stringify({
      agents: {
        'kiki-reviewer': { model: { providerID: 'custom', model: 'reviewer-model' } },
      },
    }));

    await install([]);

    const file = join(global, 'agents', 'kiki-reviewer.md');
    const text = readFileSync(file, 'utf8');
    const { settings, prompt } = parseAgent(text, file);
    expect(prompt.startsWith(customBody)).toBe(true);
    expect(prompt).toContain('Keep this exact body.');
    expect(prompt.split('## Kiki managed permission requests (v1)').length - 1).toBe(1);
    expect(settings).not.toHaveProperty('permissions');
    expect(settings.description).toBe('custom');
    expect(settings.mode).toBe('subagent');
    expect(readOpenCodeSettings(global, true).agents['kiki-reviewer']).toEqual({
      model: { providerID: 'custom', model: 'reviewer-model' },
      permissions: generateAgentPermissions()['kiki-reviewer'],
    });
  });

  it('fresh_and_existing_all_eight_roles_receive_exception', async () => {
    await install([]);
    for (const name of AGENTS) {
      const file = join(global, 'agents', `${name}.md`);
      const { prompt } = parseAgent(readFileSync(file, 'utf8'), file);
      expect(prompt.split('## Kiki managed permission requests (v1)').length - 1, name).toBe(1);
    }

    const reviewerFile = join(global, 'agents', 'kiki-reviewer.md');
    const customBody = '# Existing custom reviewer body\n\nKeep this prose unchanged.\n';
    writeFileSync(reviewerFile, `---
description: custom reviewer
mode: subagent
---
${customBody}`);
    await update([]);
    const { settings, prompt } = parseAgent(readFileSync(reviewerFile, 'utf8'), reviewerFile);
    expect(settings.description).toBe('custom reviewer');
    expect(settings.mode).toBe('subagent');
    expect(prompt.startsWith(customBody)).toBe(true);
    expect(prompt.split('## Kiki managed permission requests (v1)').length - 1).toBe(1);
    expect(prompt).toContain('Keep this prose unchanged.');
    for (const name of AGENTS) {
      const file = join(global, 'agents', `${name}.md`);
      const body = parseAgent(readFileSync(file, 'utf8'), file).prompt;
      expect(body.split('## Kiki managed permission requests (v1)').length - 1, name).toBe(1);
    }
  });

  it('accepts repeated install/update without changing files or duplicating registration', async () => {
    await install([]);
    const before = Object.fromEntries(filesUnder(global).map(file => [file, readFileSync(file, 'utf8')]));
    await install([]);
    await update([]);
    const after = Object.fromEntries(filesUnder(global).map(file => [file, readFileSync(file, 'utf8')]));
    expect(after).toEqual(before);
    expect(parse(readFileSync(join(global, 'opencode.jsonc'), 'utf8')).plugins)
      .toEqual([currentPackageSpec()]);
    expect(parse(readFileSync(join(global, 'cli.json'), 'utf8')).plugins)
      .toEqual([currentPackageSpec()]);
  });

  it('preserves safe custom additions, models, unrelated plugins, comments and top-level settings', async () => {
    mkdirSync(global, { recursive: true });
    writeFileSync(join(global, 'opencode.jsonc'), `{
  // keep this comment
  "model": "other/model",
  "plugins": ["other-plugin"],
  "agents": {
    "kiki-implementer": {
      "model": { "providerID": "custom", "model": "model" },
      "permissions": [
        { "action": "edit", "resource": "scripts/**", "effect": "allow" }
      ]
    }
  }
}`);
    await install([]);

    const after = readOpenCodeSettings(global, true);
    const canonical = generateAgentPermissions()['kiki-implementer'];
    const custom: PermissionRule = { action: 'edit', resource: 'scripts/**', effect: 'allow' };
    expect(after.agents['kiki-implementer'].model)
      .toEqual({ providerID: 'custom', model: 'model' });
    expect(after.agents['kiki-implementer'].permissions).toContainEqual(custom);
    // Lean output: preserved customs follow the canonical bracket.
    const rules = after.agents['kiki-implementer'].permissions as PermissionRule[];
    expect(rules.slice(0, canonical.length)).toEqual(canonical);
    expect(rules.slice(canonical.length)).toEqual([custom]);
    expect(after.model).toBe('other/model');
    expect(after.plugins).toEqual(['other-plugin', currentPackageSpec()]);
    expect(after.permissions).toEqual(generateGlobalPermissions());
    expect(after.policies).toEqual(generateSecretPolicies());
    expect(readFileSync(join(global, 'opencode.jsonc'), 'utf8')).toContain('// keep this comment');
  });

  it('keeps an existing prompt-only native agent file permission-free and writes the canonical arrays', async () => {
    mkdirSync(join(global, 'agents'), { recursive: true });
    writeFileSync(join(global, 'agents/kiki-implementer.md'), `---
description: custom
mode: subagent
---
Custom prompt
`);

    await install([]);

    const { settings } = parseAgent(
      readFileSync(join(global, 'agents/kiki-implementer.md'), 'utf8'),
      'kiki-implementer',
    );
    expect(settings).not.toHaveProperty('permissions');
    expect(settings).not.toHaveProperty('permission');
    expect(settings).not.toHaveProperty('model');
    expect(readOpenCodeSettings(global, true).agents['kiki-implementer'].permissions)
      .toEqual(generateAgentPermissions()['kiki-implementer']);
  });

  it('validates every tier before writing when a config is malformed', async () => {
    mkdirSync(global, { recursive: true });
    writeFileSync(join(global, 'opencode.jsonc'), '{broken');
    await expect(install([])).rejects.toThrow(/Invalid OpenCode/);
    expect(existsSync(join(global, 'agents'))).toBe(false);
    expect(existsSync(join(global, 'cli.json'))).toBe(false);
  });

  it('help, unknown options and conflicting scopes never perform an install', async () => {
    await install(['--help']);
    expect(existsSync(global)).toBe(false);
    await expect(install(['--unknown'])).rejects.toThrow();
    await expect(install(['--project', '.', '--global'])).rejects.toThrow();
    await expect(install(['--project'])).rejects.toThrow();
    expect(existsSync(global)).toBe(false);
  });

  it('prints the native /kiki model hint', async () => {
    const hint = 'Agent models: set them with the /kiki command in OpenCode (or edit agents.<name>.model in opencode.json).';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await install([]);
      expect(logSpy.mock.calls.flat().join('\n')).toContain(hint);
    } finally {
      logSpy.mockRestore();
    }
  });
});
