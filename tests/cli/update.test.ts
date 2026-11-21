import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'jsonc-parser';
import { update } from '../../src/cli/commands/update';
import { currentPackageSpec } from '../../src/cli/oc2-registration';
import { parseDispatchLabels } from '../../src/diagnostics/ledger';

describe('global update command', () => {
  let root: string;
  let global: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kiki-update-'));
    vi.stubEnv('XDG_CONFIG_HOME', root);
    global = join(root, 'opencode');
  });
  afterEach(() => { vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }); });

  it('updates globally without requiring or touching project files', async () => {
    const project = join(root, 'project'); mkdirSync(project);
    writeFileSync(join(project, 'opencode.json'), '{"agent":{"mine":{"model":"keep"}}}');
    await update([]);
    expect(existsSync(join(global, 'agents/kiki-planner.md'))).toBe(true);
    expect(parse(readFileSync(join(global, 'opencode.jsonc'), 'utf8')).plugins).toEqual([currentPackageSpec()]);
    expect(readFileSync(join(project, 'opencode.json'), 'utf8')).toBe('{"agent":{"mine":{"model":"keep"}}}');
    expect(existsSync(join(project, '.opencode'))).toBe(false);
  });

  it('installs the labeled-dispatch guidance in the orchestrator prompt only', async () => {
    const project = join(root, 'project'); mkdirSync(project);
    await update([]);

    const orchestrator = readFileSync(join(global, 'agents/kiki-orchestrator.md'), 'utf8');
    const implementer = readFileSync(join(global, 'agents/kiki-implementer.md'), 'utf8');

    expect(orchestrator).toContain('[task:<taskId> <kind>]');
    expect(orchestrator).toContain('[task:<taskId> <kind> cmp:<groupId>]');
    expect(orchestrator).toContain('[task:diag fix] Correct regression now');
    expect(orchestrator).toContain('[task:diag review cmp:trial] Check changes');
    expect(orchestrator).toContain('Only when the user explicitly requests a comparison');
    expect(orchestrator).toContain('createLedgerWriter');
    expect(orchestrator).toContain('worktrees are not sandboxes');
    expect(parseDispatchLabels('[task:diag fix] Correct regression now')).toEqual({
      taskId: 'diag',
      kind: 'fix',
      comparisonGroup: 'unknown',
    });
    expect(parseDispatchLabels('[task:diag review cmp:trial] Check changes')).toEqual({
      taskId: 'diag',
      kind: 'review',
      comparisonGroup: 'trial',
    });

    expect(implementer).not.toContain('[task:<taskId> <kind>]');
    expect(implementer).not.toContain('createLedgerWriter');
  });

  it('rejects the old destructive positional project update before writing', async () => {
    await expect(update([root])).rejects.toThrow(/migrate/);
    expect(existsSync(global)).toBe(false);
  });

  it('help and unknown flags never write files', async () => {
    await update(['--help']);
    expect(existsSync(global)).toBe(false);
    await expect(update(['--unknown'])).rejects.toThrow();
    expect(existsSync(global)).toBe(false);
  });

  it('prints the native /kiki model hint and preserves safe existing global additions', async () => {
    const hint = 'Agent models: set them with the /kiki command in OpenCode (or edit agents.<name>.model in opencode.json).';
    await update([]);
    const file = join(global, 'opencode.jsonc');
    const data = parse(readFileSync(file, 'utf8'));
    data.agents = {
      'kiki-reviewer': {
        model: { providerID: 'custom', model: 'reviewer' },
        permissions: [{ action: 'edit', resource: 'scripts/**', effect: 'allow' }],
      },
    };
    writeFileSync(file, JSON.stringify(data));
    // Exercise the conservative legacy bootstrap path; with ownership evidence
    // present this manual divergence would correctly halt.
    rmSync(join(global, 'kiki/state.json'));

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await update([]);
      expect(logSpy.mock.calls.flat().join('\n')).toContain(hint);
    } finally {
      logSpy.mockRestore();
    }
    const after = parse(readFileSync(file, 'utf8'));
    expect(after.agents['kiki-reviewer'].model)
      .toEqual({ providerID: 'custom', model: 'reviewer' });
    expect(after.agents['kiki-reviewer'].permissions).toContainEqual(
      { action: 'edit', resource: 'scripts/**', effect: 'allow' },
    );
  });
});
