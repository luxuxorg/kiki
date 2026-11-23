import { describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import {
  createOC2Fixture, hasOC2Binary, observedOC2Version, readJSONC, requireOC2Binary,
} from '../helpers/oc2-fixture';
import {
  fixtureProviderConfig, startFixtureProvider,
} from './fixtures/oc2-provider';
import { DEFAULT_CONFIG, generateAgentPermissions } from '../../src/cli/config';
import { parseAgent } from '../../src/cli/opencode-config';
import { projectPermissionRules } from '../../src/cli/oc2-permissions';
import type { PermissionRule } from '../../src/cli/opencode-config';

const AGENTS = [
  'kiki-orchestrator', 'kiki-brainstormer', 'kiki-planner', 'kiki-implementer',
  'kiki-gui-designer', 'kiki-reviewer', 'kiki-escalation', 'kiki-historian',
];
const SPECIALISTS = AGENTS.filter(name => name !== 'kiki-orchestrator');

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function globToRegExp(glob: string): RegExp {
  let source = '';
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === '*') {
      source += '.*';
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') i++;
      }
    } else if (char === '?') {
      source += '.';
    } else {
      source += escapeRegExp(char);
    }
  }
  return new RegExp(`^${source}$`);
}

function effect(rules: PermissionRule[], action: string, resource: string) {
  let result: PermissionRule['effect'] | undefined;
  for (const rule of rules) {
    if (!globToRegExp(rule.action).test(action)) continue;
    if (globToRegExp(rule.resource).test(resource)) result = rule.effect;
  }
  return result;
}

function containsBlock(rules: PermissionRule[], block: PermissionRule[]): boolean {
  return rules.some((_, index) =>
    JSON.stringify(rules.slice(index, index + block.length)) === JSON.stringify(block));
}

function debugAgents(fixture: ReturnType<typeof createOC2Fixture>): Array<Record<string, any>> {
  const result = fixture.run(['debug', 'agents', '--standalone']);
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as Array<Record<string, any>>;
}

function toolStates(stdout: string): Array<{ tool: string; state: any }> {
  return stdout.split(/\r?\n/).filter(Boolean).flatMap(line => {
    try {
      const entry = JSON.parse(line) as Record<string, any>;
      if (entry.type !== 'tool_use') return [];
      return [{ tool: entry.part.tool as string, state: entry.part.state }];
    } catch {
      return [];
    }
  });
}

describe.skipIf(!hasOC2Binary())('single-source permissions on the real binary', () => {
  it('markdown_config_project_precedence', () => {
    const binary = requireOC2Binary();
    const fixture = createOC2Fixture(binary);
    try {
      const installed = fixture.runCli(['install']);
      expect(installed.status, installed.stderr).toBe(0);
      const canonical = generateAgentPermissions(DEFAULT_CONFIG);

      for (const name of AGENTS) {
        const markdown = join(fixture.config, 'agents', `${name}.md`);
        const settings = parseAgent(readFileSync(markdown, 'utf8'), name).settings;
        expect(settings, `${name}: markdown permissions`).not.toHaveProperty('permissions');
        expect(settings, `${name}: markdown legacy permission`).not.toHaveProperty('permission');
      }

      const global = readJSONC(fixture.globalFile);
      for (const name of AGENTS) {
        expect(global.agents[name].permissions, `${name}: config owns the array`).toEqual(canonical[name]);
      }

      const effective = debugAgents(fixture);
      for (const name of AGENTS) {
        const agent = effective.find(entry => entry.id === name)!;
        const rules = agent.permissions as PermissionRule[];
        // The lean role arrays carry no read, route or secret permissions; the
        // real binary may append its own built-in defaults after them.
        expect(canonical[name].some(rule => rule.action === 'read'), `${name}: no read grants`).toBe(false);
        expect(canonical[name].some(rule => rule.resource.startsWith('.worktree')), `${name}: no mirrors`).toBe(false);
        const gitAllows = rules
          .filter(rule => rule.action === 'shell' && rule.effect === 'allow' && rule.resource.startsWith('git '))
          .map(rule => rule.resource);
        expect(gitAllows, `${name}: no read-only git grants`).toEqual([]);
        expect(effect(rules, 'shell', 'git push origin main'), `${name}: publishing ask`).toBe('ask');
        // Force push is now an ask, not a hard deny.
        expect(effect(rules, 'shell', 'git push --force origin main'), `${name}: force push ask`).toBe('ask');
        expect(effect(rules, 'shell', 'npm publish'), `${name}: publishing wrapper allowed`).toBe('allow');
      }
      console.info(`[single-source] observed OpenCode ${observedOC2Version(binary)}`);
    } finally {
      fixture.cleanup();
    }
  }, 120_000);

  it('crash_window_stale_markdown_remains_authoritative', () => {
    const fixture = createOC2Fixture(requireOC2Binary());
    try {
      expect(fixture.runCli(['install']).status).toBe(0);
      const canonical = generateAgentPermissions(DEFAULT_CONFIG);
      const plannerMarkdown = join(fixture.config, 'agents', 'kiki-planner.md');
      const reviewerMarkdown = join(fixture.config, 'agents', 'kiki-reviewer.md');
      const plannerPromptOnly = readFileSync(plannerMarkdown, 'utf8');
      const reviewerPromptOnly = readFileSync(reviewerMarkdown, 'utf8');

      // Reachable preflight state: recognised generated markdown (the canonical
      // set) left in place after a hard death between config persist and strip.
      const withPermissions = (text: string, name: string): string => {
        const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)!;
        const settings = parseYaml(match[1], { uniqueKeys: false }) as Record<string, unknown>;
        settings.permissions = canonical[name];
        return `---\n${stringifyYaml(settings, { lineWidth: 0 }).trimEnd()}\n---\n${match[2]}`;
      };
      writeFileSync(plannerMarkdown, withPermissions(plannerPromptOnly, 'kiki-planner'));
      writeFileSync(reviewerMarkdown, withPermissions(reviewerPromptOnly, 'kiki-reviewer'));

      // Before the strip, the old/status-quo markdown rules are present in the
      // effective policy. With an empty historical catalog the only
      // preflight-valid markdown shape is the canonical generated set, so this
      // window is policy-identical to the status quo, never a new baseline.
      const plannerBefore = debugAgents(fixture).find(entry => entry.id === 'kiki-planner')!;
      expect(containsBlock(plannerBefore.permissions as PermissionRule[], canonical['kiki-planner']))
        .toBe(true);

      // Mixed per-agent state: planner already stripped, reviewer still has the
      // old generated markdown at process death. Pin each agent's state without
      // claiming whole-install policy equivalence.
      writeFileSync(plannerMarkdown, plannerPromptOnly);
      const mixed = debugAgents(fixture);
      expect(containsBlock(
        mixed.find(entry => entry.id === 'kiki-planner')!.permissions as PermissionRule[],
        canonical['kiki-planner'],
      ), 'planner mixed state').toBe(true);
      expect(containsBlock(
        mixed.find(entry => entry.id === 'kiki-reviewer')!.permissions as PermissionRule[],
        canonical['kiki-reviewer'],
      ), 'reviewer mixed state').toBe(true);

      const updated = fixture.runCli(['install']);
      expect(updated.status, updated.stderr).toBe(0);
      for (const [file, name] of [[plannerMarkdown, 'kiki-planner'], [reviewerMarkdown, 'kiki-reviewer']] as const) {
        expect(parseAgent(readFileSync(file, 'utf8'), name).settings).not.toHaveProperty('permissions');
      }
      const effectiveAfter = debugAgents(fixture);
      for (const name of ['kiki-planner', 'kiki-reviewer']) {
        const agent = effectiveAfter.find(entry => entry.id === name)!;
        expect(containsBlock(agent.permissions as PermissionRule[], canonical[name]), name).toBe(true);
      }

      // Rerun converges idempotently and creates no new backup directory.
      const once = readFileSync(fixture.globalFile);
      const backupRoot = join(fixture.config, 'kiki/backups');
      const backupsBefore = existsSync(backupRoot)
        ? readdirSync(backupRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).length
        : 0;
      expect(fixture.runCli(['install']).status).toBe(0);
      expect(readFileSync(fixture.globalFile)).toEqual(once);
      const backupsAfter = existsSync(backupRoot)
        ? readdirSync(backupRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).length
        : 0;
      expect(backupsAfter).toBe(backupsBefore);
    } finally {
      fixture.cleanup();
    }
  }, 120_000);

  it('all_roles_policy_decisions and kiki_written_additions_preserve_protected_policy', async () => {
    const fixture = createOC2Fixture(requireOC2Binary());
    const provider = await startFixtureProvider(request => {
      if (request.model === 'fixture-title') return { type: 'text', text: 'Single source title' };
      if (request.model !== 'fixture-single') return { type: 'text', text: 'Fixture reply' };
      const results = request.messages.filter(message => message.role === 'tool').length;
      const calls = [
        { tool: 'edit', arguments: { path: 'scripts/run.sh', oldString: 'old', newString: 'new' } },
        { tool: 'edit', arguments: { path: 'scripts/.env', oldString: 'old', newString: 'new' } },
        { tool: 'edit', arguments: { path: 'src/.env', oldString: 'old', newString: 'new' } },
        { tool: 'shell', arguments: { command: 'git push origin main' } },
        { tool: 'shell', arguments: { command: 'echo routine-probe' } },
      ];
      if (results < calls.length) {
        return { type: 'tool-calls', calls: [{ id: `call_${results}`, name: calls[results].tool, arguments: calls[results].arguments }] };
      }
      return { type: 'text', text: 'Single-source probe complete' };
    });
    try {
      expect(fixture.runCli(['install']).status).toBe(0);
      const canonical = generateAgentPermissions(DEFAULT_CONFIG)['kiki-implementer'];
      const validated = projectPermissionRules(
        [{ action: 'edit', resource: 'scripts/**', effect: 'allow' }], canonical);
      expect(validated.ok).toBe(true);
      if (!validated.ok) return;

      mkdirSync(join(fixture.project, 'scripts'), { recursive: true });
      mkdirSync(join(fixture.project, 'src'), { recursive: true });
      writeFileSync(join(fixture.project, 'scripts/run.sh'), 'old\n');
      writeFileSync(join(fixture.project, 'scripts/.env'), 'old\n');
      writeFileSync(join(fixture.project, 'src/.env'), 'old\n');

      // Stub git so a publishing regression could not leave the fixture or
      // reach a remote; the ask must stop before the stub runs.
      const bin = join(fixture.root, 'probe-bin');
      const counter = join(fixture.root, 'publish-counter');
      mkdirSync(bin, { recursive: true });
      const git = join(bin, 'git');
      writeFileSync(git, `#!/bin/sh\nif [ "$1" = push ]; then printf push >> "${counter}"; fi\nexit 0\n`);
      chmodSync(git, 0o755);

      const global = readJSONC(fixture.globalFile);
      global.providers = fixtureProviderConfig(provider.baseURL, {
        'fixture-single': 'Single source probe',
        'fixture-title': 'Title',
      });
      global.agents['single-source-probe'] = {
        mode: 'primary',
        description: 'single source probe',
        model: { providerID: 'kiki-fixture', model: 'fixture-single' },
        // The effective Kiki-written array: canonical baseline then additions.
        permissions: [...canonical, ...validated.rules],
      };
      writeFileSync(fixture.globalFile, `${JSON.stringify(global, null, 2)}\n`);

      const run = await fixture.runAsync(
        ['run', '--standalone', '--format', 'json', '--agent', 'single-source-probe', 'Run probe'],
        { timeout: 90_000, extraEnv: { PATH: `${bin}:${fixture.env.PATH ?? ''}` } },
      );
      expect(run.status, run.stderr).toBe(0);
      expect(run.stdout).toContain('Single-source probe complete');
      const edits = toolStates(run.stdout).filter(entry => entry.tool === 'edit');
      const shells = toolStates(run.stdout).filter(entry => entry.tool === 'shell');

      expect(edits[0].state.status, 'ordinary addition past the fallback').toBe('completed');
      expect(String(edits[0].state.output)).toContain('Edited');
      expect(edits[1].state.status, 'secret descendant in added directory').toBe('error');
      expect(String(edits[1].state.error)).toMatch(/permission|denied|not available/i);
      expect(edits[2].state.status, 'secret under canonical source').toBe('error');
      expect(shells[0].state.status, 'publishing route asks').toBe('error');
      expect(String(shells[0].state.error)).toMatch(/cannot ask|permission|rejected/i);
      expect(existsSync(counter), 'no publishing stub invocation').toBe(false);
      expect(shells[1].state.status, 'routine local work').toBe('completed');
      expect(readFileSync(join(fixture.project, 'scripts/.env'), 'utf8')).toBe('old\n');
      expect(readFileSync(join(fixture.project, 'src/.env'), 'utf8')).toBe('old\n');
    } finally {
      await provider.stop();
      fixture.cleanup();
    }
  }, 180_000);

  it('manual_native_override_limit_documented', () => {
    const fixture = createOC2Fixture(requireOC2Binary());
    try {
      expect(fixture.runCli(['install']).status).toBe(0);
      const global = readJSONC(fixture.globalFile);
      // Native last-match overrides remain possible for manual edits; this is
      // the accepted residual risk, not an immunity promise.
      global.agents['kiki-reviewer'].permissions = [
        ...global.agents['kiki-reviewer'].permissions,
        { action: 'edit', resource: 'src/**', effect: 'allow' },
      ];
      writeFileSync(fixture.globalFile, `${JSON.stringify(global, null, 2)}\n`);
      const reviewer = debugAgents(fixture).find(entry => entry.id === 'kiki-reviewer')!;
      expect(effect(reviewer.permissions as PermissionRule[], 'edit', 'src/manual.ts')).toBe('allow');
    } finally {
      fixture.cleanup();
    }
  }, 120_000);
});
