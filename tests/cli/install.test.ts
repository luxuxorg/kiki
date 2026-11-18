import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'jsonc-parser';
import { install } from '../../src/cli/commands/install';
import { update } from '../../src/cli/commands/update';
import { parseAgent, readOpenCodeSettings } from '../../src/cli/opencode-config';
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

  it('writes eight native agent files and registers one server and one TUI package source', async () => {
    await install([]);

    for (const name of AGENTS) {
      const file = join(global, 'agents', `${name}.md`);
      expect(existsSync(file), name).toBe(true);
      const { settings } = parseAgent(readFileSync(file, 'utf8'), file);
      expect(settings, name).not.toHaveProperty('model');
      expect(Array.isArray(settings.permissions), name).toBe(true);
      expect(settings.mode, name).toBe(name === 'kiki-orchestrator' ? 'primary' : 'subagent');
    }
    expect(readOpenCodeSettings(global, true).agents).toBeUndefined();
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

  it('updates_stale_prompt_bodies_without_changing_native_settings', async () => {
    // A deliberate native reviewer restriction and model override, as in the
    // existing preservation fixture; update must leave both untouched.
    mkdirSync(global, { recursive: true });
    writeFileSync(join(global, 'opencode.jsonc'), `{
  "agents": {
    "kiki-reviewer": {
      "model": { "providerID": "custom", "model": "reviewer-model" },
      "permissions": [
        { "action": "edit", "resource": "src/**", "effect": "deny" }
      ]
    }
  }
}`);

    await install([]);

    const nativeBefore = readOpenCodeSettings(global, true).agents['kiki-reviewer'];
    expect(nativeBefore).toEqual({
      model: { providerID: 'custom', model: 'reviewer-model' },
      permissions: [{ action: 'edit', resource: 'src/**', effect: 'deny' }],
    });

    const recorded: Record<string, {
      settings: Record<string, unknown>;
      permissions: unknown;
      mode: unknown;
      hasModel: boolean;
    }> = {};
    for (const name of AGENTS) {
      const file = join(global, 'agents', `${name}.md`);
      const text = readFileSync(file, 'utf8');
      const { settings } = parseAgent(text, name);
      recorded[name] = {
        settings,
        permissions: settings.permissions,
        mode: settings.mode,
        hasModel: 'model' in settings,
      };

      const match = text.match(/^((?:---\r?\n[\s\S]*?\r?\n---\r?\n))([\s\S]*)$/);
      expect(match, `${name}: frontmatter retained`).not.toBeNull();
      writeFileSync(file, `${match![1]}STALE_BODY_MARKER_${name}\n`);
    }

    await update([]);

    for (const name of AGENTS) {
      const file = join(global, 'agents', `${name}.md`);
      const { settings, prompt } = parseAgent(readFileSync(file, 'utf8'), file);
      expect(prompt, `${name}: stale body replaced`).not.toContain(`STALE_BODY_MARKER_${name}`);
      expect(bodyCount(prompt, GUARDRAIL_BLOCK), `${name}: guardrail block exactly once`).toBe(1);
      expect(settings, `${name}: native settings unchanged`).toEqual(recorded[name].settings);
      expect(settings.permissions, `${name}: permissions unchanged`).toEqual(recorded[name].permissions);
      expect(settings.mode, `${name}: mode unchanged`).toBe(recorded[name].mode);
      expect('model' in settings, `${name}: model presence unchanged`).toBe(recorded[name].hasModel);
    }

    expect(readOpenCodeSettings(global, true).agents['kiki-reviewer']).toEqual(nativeBefore);

    const reviewerFile = join(global, 'agents', 'kiki-reviewer.md');
    const reviewer = parseAgent(readFileSync(reviewerFile, 'utf8'), reviewerFile).prompt;
    expect(reviewer, 'reviewer: three-verdict contract').toContain(REVIEWER_CONTRACT_LINE);
    expect(reviewer, 'reviewer: fresh active alignment read').toContain(
      "read the active project's `.agentic/kiki/alignment.json` fresh",
    );
    expect(reviewer, 'reviewer: technical rejection not limited to impossibility').toContain(
      'Rejection is not limited to impossibility',
    );

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

    const orchestratorFile = join(global, 'agents', 'kiki-orchestrator.md');
    const orchestrator = parseAgent(readFileSync(orchestratorFile, 'utf8'), orchestratorFile).prompt;
    expect(orchestrator, 'orchestrator: reason routing').toContain(
      "Route by the reviewer's Reason before retrying or escalating",
    );
    expect(orchestrator, 'orchestrator: implementation fix round').toContain(
      '**FAIL + Reason `implementation`** → exactly one fix round',
    );

    const workflow = readFileSync(join(global, 'kiki/agentic-workflow.md'), 'utf8');
    expect(workflow, 'workflow: fresh active alignment read').toContain(
      "reads the active project's `.agentic/kiki/alignment.json` fresh in every review",
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
    expect(implementer, 'implementer: honest check statuses after update').toContain(
      'failed, passed, skipped or not run',
    );
    expect(orchestrator, 'orchestrator: small task flow after update').toContain(
      'no persistent spec or plan file',
    );
    expect(workflow, 'workflow: proportional plan revisions after update').toContain(
      'mechanical revision',
    );

    const afterFirstUpdate = Object.fromEntries(
      filesUnder(global).map(file => [file, readFileSync(file, 'utf8')]),
    );
    await update([]);
    const afterSecondUpdate = Object.fromEntries(
      filesUnder(global).map(file => [file, readFileSync(file, 'utf8')]),
    );
    expect(afterSecondUpdate).toEqual(afterFirstUpdate);
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

  it('preserves native permission additions, models, unrelated plugins, comments and top-level settings', async () => {
    mkdirSync(global, { recursive: true });
    writeFileSync(join(global, 'opencode.jsonc'), `{
  // keep this comment
  "model": "other/model",
  "plugins": ["other-plugin"],
  "agents": {
    "kiki-implementer": {
      "model": { "providerID": "custom", "model": "model" },
      "permissions": [
        { "action": "edit", "resource": "src/**", "effect": "allow" },
        { "action": "read", "resource": "secret/**", "effect": "deny" }
      ]
    }
  }
}`);
    const before = readOpenCodeSettings(global, true);

    await install([]);

    const after = readOpenCodeSettings(global, true);
    expect(after.agents['kiki-implementer']).toEqual(before.agents['kiki-implementer']);
    expect(after.model).toBe('other/model');
    expect(after.plugins).toEqual(['other-plugin', currentPackageSpec()]);
    expect(after.permissions).toBeUndefined();
    expect(readFileSync(join(global, 'opencode.jsonc'), 'utf8')).toContain('// keep this comment');
  });

  it('preserves deliberate permission absence on an existing native agent file', async () => {
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
    expect(settings).not.toHaveProperty('model');
  });

  it('backs up and removes stale V1 loader, prompts and generated plugin files on update', async () => {
    await install([]);
    mkdirSync(join(global, 'kiki/prompts'), { recursive: true });
    mkdirSync(join(global, 'plugins'), { recursive: true });
    writeFileSync(join(global, 'kiki/prompts/kiki-implementer.md'), 'stale prompt');
    writeFileSync(join(global, 'kiki/tui.js'), 'stale loader');
    writeFileSync(join(global, 'plugins/kiki.ts'), 'stale plugin');

    await update([]);

    expect(existsSync(join(global, 'kiki/prompts'))).toBe(false);
    expect(existsSync(join(global, 'kiki/tui.js'))).toBe(false);
    expect(existsSync(join(global, 'plugins/kiki.ts'))).toBe(false);
    const backups = filesUnder(join(global, 'kiki/backups'));
    expect(backups.some(file => file.endsWith('kiki.ts'))).toBe(true);
    expect(backups.some(file => file.endsWith('kiki-implementer.md'))).toBe(true);
  });

  it('validates every tier before writing when a config is malformed', async () => {
    mkdirSync(global, { recursive: true });
    writeFileSync(join(global, 'opencode.jsonc'), '{broken');
    await expect(install([])).rejects.toThrow(/Invalid OpenCode/);
    expect(existsSync(join(global, 'agents'))).toBe(false);
    expect(existsSync(join(global, 'cli.json'))).toBe(false);
  });

  it('backs up and replaces a stale V1 artifact in the standard config on install', async () => {
    vi.stubEnv('HOME', root);
    vi.stubEnv('XDG_CONFIG_HOME', '');
    const config = join(root, '.config', 'opencode');
    mkdirSync(join(config, 'plugins'), { recursive: true });
    writeFileSync(join(config, 'plugins/kiki.ts'), 'legacy');

    await install([]);

    expect(existsSync(join(config, 'agents'))).toBe(true);
    expect(existsSync(join(config, 'plugins/kiki.ts'))).toBe(false);
    expect(filesUnder(join(config, 'kiki/backups')).some(file => file.endsWith('kiki.ts'))).toBe(true);
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
