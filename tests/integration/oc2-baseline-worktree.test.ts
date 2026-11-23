import { describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createOC2Fixture, hasOC2Binary, observedOC2Version, requireOC2Binary,
} from '../helpers/oc2-fixture';
import { fixtureProviderConfig, startFixtureProvider, type FixtureReply, type FixtureRequest } from './fixtures/oc2-provider';
import type { PermissionRule } from '../../src/cli/opencode-config';

/**
 * Baseline worktree probe. The proposed role bracket is `deny edit *` followed
 * by a role territory such as `allow edit src/**`. This probe asks the real
 * OpenCode 2.x permission evaluator whether a session whose working directory
 * is inside `.worktrees/<name>` resolves a relative workspace path against that
 * directory (so `src/**` matches) or against the repository root (which would
 * require the approved `.worktrees/**` fallback).
 *
 * Only a disposable HOME/XDG fixture, a loopback provider and fixture-internal
 * placeholder files are used. The allowed branch necessarily performs the edit
 * against the fixture copy; the denied branch performs no write. No live
 * configuration or user file is read or changed.
 */

const WORKTREE_RULES: PermissionRule[] = [
  { action: 'edit', resource: '*', effect: 'deny' },
  { action: 'edit', resource: 'src/**', effect: 'allow' },
];

const WORKTREE_FALLBACK_RULES: PermissionRule[] = [
  { action: 'edit', resource: '*', effect: 'deny' },
  { action: 'edit', resource: 'src/**', effect: 'allow' },
  { action: 'edit', resource: '.worktrees/**', effect: 'allow' },
];

interface ToolState {
  name: string;
  status: string;
  error: string;
  output: string;
}

function toolStates(stdout: string): ToolState[] {
  const states: ToolState[] = [];
  for (const line of stdout.split(/\r?\n/).filter(Boolean)) {
    let entry: Record<string, any>;
    try {
      entry = JSON.parse(line) as Record<string, any>;
    } catch {
      continue;
    }
    if (entry.type !== 'tool_use' && entry.type !== 'tool') continue;
    const part = entry.part ?? {};
    if (!part.tool) continue;
    const state = part.state ?? {};
    states.push({
      name: String(part.tool),
      status: String(state.status ?? ''),
      error: String(state.error ?? ''),
      output: String(state.output ?? ''),
    });
  }
  return states;
}

function editResponder(calls: Array<{ path: string; oldString: string; newString: string }>) {
  return (request: FixtureRequest): FixtureReply => {
    if (request.model === 'fixture-title') return { type: 'text', text: 'Worktree probe title' };
    if (request.model !== 'fixture-worktree') return { type: 'text', text: 'Fixture reply' };
    const results = request.messages.filter(message => message.role === 'tool').length;
    if (results < calls.length) {
      return {
        type: 'tool-calls',
        calls: [{
          id: `worktree_${results}`,
          name: 'edit',
          arguments: calls[results],
        }],
      };
    }
    return { type: 'text', text: 'Worktree probe complete' };
  };
}

describe.skipIf(!hasOC2Binary())('baseline worktree territory on real OpenCode', () => {
  it('worktree_cwd_resolves_role_territory', async () => {
    const binary = requireOC2Binary();
    const fixture = createOC2Fixture(binary);
    const provider = await startFixtureProvider();
    try {
      // Repository-shaped fixture: the session starts inside
      // `.worktrees/feature`, exactly like a builder worktree. The probed
      // resources exist only inside this disposable fixture.
      const worktree = join(fixture.project, '.worktrees', 'feature');
      mkdirSync(join(worktree, 'src'), { recursive: true });
      mkdirSync(join(worktree, 'docs'), { recursive: true });
      writeFileSync(join(worktree, 'src/control.ts'), 'old\n');
      writeFileSync(join(worktree, 'src/absolute-control.ts'), 'old\n');
      writeFileSync(join(worktree, 'docs/outside.md'), 'old\n');

      fixture.writeGlobal({
        $schema: 'https://opencode.ai/config.json',
        providers: fixtureProviderConfig(provider.baseURL, {
          'fixture-worktree': 'Worktree probe',
          'fixture-title': 'Title',
        }),
        agents: {
          title: { model: { providerID: 'kiki-fixture', model: 'fixture-title' } },
          'worktree-probe': {
            mode: 'primary',
            description: 'worktree territory probe',
            model: { providerID: 'kiki-fixture', model: 'fixture-worktree' },
            permissions: WORKTREE_RULES,
          },
        },
      });

      const relativeIn = 'src/control.ts';
      const relativeOut = 'docs/outside.md';
      const absoluteIn = join(worktree, 'src/absolute-control.ts');
      const calls = [
        { path: relativeIn, oldString: 'old', newString: 'relative-src' },
        { path: relativeOut, oldString: 'old', newString: 'relative-docs' },
        { path: absoluteIn, oldString: 'old', newString: 'absolute-src' },
      ];
      provider.script(editResponder(calls));
      const result = await fixture.runAsync([
        'run', '--standalone', '--format', 'json', '--agent', 'worktree-probe', 'Run worktree probe',
      ], { cwd: worktree, timeout: 90_000 });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('Worktree probe complete');
      const edits = toolStates(result.stdout).filter(state => state.name === 'edit');
      expect(edits, result.stdout.slice(-2000)).toHaveLength(calls.length);

      const relativeInState = edits[0];
      const relativeOutState = edits[1];
      const absoluteInState = edits[2];

      console.info(`[baseline-worktree] observed OpenCode ${observedOC2Version(binary)}`);
      console.info(`[baseline-worktree] session cwd=${worktree}`);
      console.info(`[baseline-worktree] relative-in ${relativeIn}: ${relativeInState.status} ${relativeInState.error}`);
      console.info(`[baseline-worktree] relative-out ${relativeOut}: ${relativeOutState.status} ${relativeOutState.error}`);
      console.info(`[baseline-worktree] absolute-in ${absoluteIn}: ${absoluteInState.status} ${absoluteInState.error}`);

      // The core decision: the writer territory still applies from the worktree.
      expect(relativeInState.status, `relative in-territory edit: ${relativeInState.error}`).toBe('completed');
      expect(readFileSync(join(worktree, 'src/control.ts'), 'utf8')).toBe('relative-src\n');
      // Outside the territory stays denied even in the worktree.
      expect(relativeOutState.status, 'relative outside-territory edit is denied').toBe('error');
      expect(relativeOutState.error).toMatch(/permission|denied|not available|policy/i);
      expect(readFileSync(join(worktree, 'docs/outside.md'), 'utf8')).toBe('old\n');
      // Absolute paths are recorded as additional evidence; the core assertion
      // is the relative workspace path above.
      expect(absoluteInState.status, `absolute in-territory edit: ${absoluteInState.error}`).toBe('completed');
      expect(readFileSync(absoluteIn, 'utf8')).toBe('absolute-src\n');
    } finally {
      await provider.stop();
      await fixture.cleanup();
    }
  }, 180_000);

  it('worktree_fallback_territory_is_effective when the primary probe fails', async () => {
    // This case is a recorded fallback check. It is only asserted when the
    // primary cwd-resolution probe above is known to fail; otherwise it proves
    // the additive fallback remains harmless and effective.
    const binary = requireOC2Binary();
    const fixture = createOC2Fixture(binary);
    const provider = await startFixtureProvider();
    try {
      const worktree = join(fixture.project, '.worktrees', 'feature');
      mkdirSync(join(worktree, 'src'), { recursive: true });
      writeFileSync(join(worktree, 'src/control.ts'), 'old\n');
      fixture.writeGlobal({
        $schema: 'https://opencode.ai/config.json',
        providers: fixtureProviderConfig(provider.baseURL, {
          'fixture-worktree': 'Worktree probe',
          'fixture-title': 'Title',
        }),
        agents: {
          title: { model: { providerID: 'kiki-fixture', model: 'fixture-title' } },
          'worktree-probe': {
            mode: 'primary',
            description: 'worktree fallback probe',
            model: { providerID: 'kiki-fixture', model: 'fixture-worktree' },
            permissions: WORKTREE_FALLBACK_RULES,
          },
        },
      });
      provider.script(editResponder([
        { path: 'src/control.ts', oldString: 'old', newString: 'fallback-src' },
      ]));
      const result = await fixture.runAsync([
        'run', '--standalone', '--format', 'json', '--agent', 'worktree-probe', 'Run fallback probe',
      ], { cwd: worktree, timeout: 90_000 });
      expect(result.status, result.stderr).toBe(0);
      const edits = toolStates(result.stdout).filter(state => state.name === 'edit');
      expect(edits).toHaveLength(1);
      console.info(`[baseline-worktree-fallback] relative-in: ${edits[0].status} ${edits[0].error}`);
      expect(edits[0].status, edits[0].error).toBe('completed');
      expect(readFileSync(join(worktree, 'src/control.ts'), 'utf8')).toBe('fallback-src\n');
    } finally {
      await provider.stop();
      await fixture.cleanup();
    }
  }, 180_000);
});
