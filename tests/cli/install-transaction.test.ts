import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'jsonc-parser';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

// Deterministic post-backup I/O fault injection for the install transaction.
// The real calls are always delegated unless a test installs a hook.
const fsFault = vi.hoisted(() => ({
  write: undefined as undefined | ((file: string) => void),
  rename: undefined as undefined | ((from: string, to: string) => void),
  afterRename: undefined as undefined | ((from: string, to: string) => void),
}));
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    writeFileSync: (file: unknown, data: unknown, options?: unknown) => {
      fsFault.write?.(String(file));
      return (actual.writeFileSync as (...args: unknown[]) => unknown)(file, data, options);
    },
    renameSync: (from: unknown, to: unknown) => {
      fsFault.rename?.(String(from), String(to));
      const result = (actual.renameSync as (...args: unknown[]) => unknown)(from, to);
      fsFault.afterRename?.(String(from), String(to));
      return result;
    },
  };
});

const { installGlobalFiles, parseAgent, readOpenCodeSettings } = await import('../../src/cli/opencode-config');
const { generateAgentPermissions, PERMISSION_REQUEST_FRAGMENT } = await import('../../src/cli/config');
const { HISTORICAL_GENERATED_SEQUENCES } = await import('../../src/cli/permission-consolidation');
import type { PermissionRule } from '../../src/cli/opencode-config';

const AGENTS = [
  'kiki-orchestrator', 'kiki-brainstormer', 'kiki-planner', 'kiki-implementer',
  'kiki-gui-designer', 'kiki-reviewer', 'kiki-escalation', 'kiki-historian',
];

function config(dir: string, name = 'opencode.jsonc'): any {
  return parse(readFileSync(join(dir, name), 'utf8'));
}

function agentMarkdown(dir: string, name = 'kiki-implementer'): string {
  return join(dir, 'agents', `${name}.md`);
}

function addPermissions(text: string, rules: PermissionRule[]): string {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error('missing frontmatter');
  const settings = parseYaml(match[1], { uniqueKeys: false }) as Record<string, unknown>;
  settings.permissions = rules;
  return `---\n${stringifyYaml(settings, { lineWidth: 0 }).trimEnd()}\n---\n${match[2]}`;
}

function bodyOf(text: string): string {
  const match = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error('missing frontmatter');
  return match[1];
}

function snapshot(files: string[]): Record<string, Buffer> {
  return Object.fromEntries(files.filter(existsSync).map(file => [file, readFileSync(file)]));
}

function backupCount(dir: string): number {
  const root = join(dir, 'kiki/backups');
  if (!existsSync(root)) return 0;
  return readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).length;
}

function configFile(dir: string): string {
  return join(dir, 'opencode.jsonc');
}

const customAllow: PermissionRule = { action: 'edit', resource: 'vendor/**', effect: 'allow' };
const customDeny: PermissionRule = { action: 'edit', resource: 'vendor/**', effect: 'deny' };

describe('global install/update transaction', () => {
  let root: string;
  let global: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kiki-txn-'));
    global = join(root, 'opencode');
    vi.stubEnv('XDG_CONFIG_HOME', root);
  });
  afterEach(() => {
    fsFault.write = undefined;
    fsFault.rename = undefined;
    fsFault.afterRename = undefined;
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it('two_global_files_no_stale_shadow', () => {
    mkdirSync(global, { recursive: true });
    writeFileSync(join(global, 'opencode.json'), JSON.stringify({
      agents: { 'kiki-implementer': { permissions: [customAllow] } },
    }));
    writeFileSync(join(global, 'opencode.jsonc'), '{"$schema":"https://opencode.ai/config.json"}\n');

    installGlobalFiles(global);

    expect(config(global, 'opencode.json').agents?.['kiki-implementer']?.permissions).toBeUndefined();
    expect(config(global, 'opencode.jsonc').agents['kiki-implementer'].permissions)
      .toContainEqual(customAllow);
  });

  it('ambiguous_yaml_no_write', () => {
    mkdirSync(join(global, 'agents'), { recursive: true });
    writeFileSync(agentMarkdown(global, 'kiki-reviewer'), `---
description: dup
mode: subagent
permissions: []
permissions: []
---
body
`);
    expect(() => installGlobalFiles(global)).toThrow(/Ambiguous|duplicate/i);
    expect(existsSync(join(global, 'opencode.jsonc'))).toBe(false);
    expect(existsSync(join(global, 'cli.json'))).toBe(false);
  });

  it('markdown_only_custom_allow_preserved', () => {
    installGlobalFiles(global);
    const markdown = agentMarkdown(global);
    const before = readFileSync(markdown, 'utf8');
    writeFileSync(markdown, addPermissions(before, [customAllow]));

    installGlobalFiles(global, true);

    expect(readOpenCodeSettings(global, true).agents['kiki-implementer'].permissions)
      .toContainEqual(customAllow);
    const after = readFileSync(markdown, 'utf8');
    const settings = parseAgent(after, 'kiki-implementer').settings;
    expect(settings).not.toHaveProperty('permissions');
    expect(settings).not.toHaveProperty('permission');
    // Prompt bytes are preserved by this permission round.
    expect(bodyOf(after)).toBe(bodyOf(before));
    // The custom is deduplicated and reported once in the persisted array.
    const rules = readOpenCodeSettings(global, true).agents['kiki-implementer'].permissions as PermissionRule[];
    expect(rules.filter(rule => JSON.stringify(rule) === JSON.stringify(customAllow))).toHaveLength(1);
    const canonical = generateAgentPermissions()['kiki-implementer'];
    expect(rules.slice(0, canonical.length)).toEqual(canonical);
    // Lean output has no secret tail: preserved customs follow the canonical
    // bracket. The generated role bracket still ends with its own push ask.
    expect(rules.slice(canonical.length)).toEqual([customAllow]);
  });

  it('markdown_custom_deny_preserved_with_verified_strip', () => {
    installGlobalFiles(global);
    const markdown = agentMarkdown(global);
    writeFileSync(markdown, addPermissions(readFileSync(markdown, 'utf8'), [customDeny]));

    installGlobalFiles(global, true);

    const rules = readOpenCodeSettings(global, true).agents['kiki-implementer'].permissions as PermissionRule[];
    const index = rules.findIndex(rule =>
      rule.action === customDeny.action
      && rule.resource === customDeny.resource
      && rule.effect === customDeny.effect);
    expect(index).toBeGreaterThanOrEqual(0);
    // The preserved custom deny follows the canonical lean bracket.
    expect(index).toBeGreaterThanOrEqual(generateAgentPermissions()['kiki-implementer'].length);

    const after = readFileSync(markdown, 'utf8');
    const settings = parseAgent(after, 'kiki-implementer').settings;
    expect(settings).not.toHaveProperty('permissions');
    expect(settings).not.toHaveProperty('permission');
    // The strip happens only after the persisted config was re-read and verified.
    expect(readOpenCodeSettings(global, true).agents['kiki-implementer'].permissions).toContainEqual(customDeny);
  });

  it('custom_jsonc_comments_survive', () => {
    mkdirSync(global, { recursive: true });
    const text = `{
  "agents": {
    "kiki-reviewer": {
      "permissions": [
        // keep this inner rule comment
        { "action": "edit", "resource": "vendor/**", "effect": "allow" }
      ]
    }
  }
}`;
    writeFileSync(join(global, 'opencode.jsonc'), text);

    expect(() => installGlobalFiles(global)).toThrow(/comments inside/i);

    expect(readFileSync(join(global, 'opencode.jsonc'), 'utf8')).toBe(text);
    expect(existsSync(join(global, 'agents'))).toBe(false);
    expect(existsSync(join(global, 'cli.json'))).toBe(false);
  });

  it('backup_failure_no_mutation', () => {
    mkdirSync(join(global, 'kiki'), { recursive: true });
    writeFileSync(join(global, 'kiki/backups'), 'not-a-directory');
    const existing = '// keep\n{"theme":"keep"}\n';
    writeFileSync(join(global, 'opencode.jsonc'), existing);
    expect(() => installGlobalFiles(global)).toThrow();
    expect(existsSync(join(global, 'agents'))).toBe(false);
    expect(readFileSync(join(global, 'opencode.jsonc'), 'utf8')).toBe(existing);
  });

  it('strip_midway_failure_restores_originals', () => {
    installGlobalFiles(global);
    // Add a valid custom permission block to one markdown so the next update
    // must persist the custom and strip it from the markdown.
    const markdown = agentMarkdown(global);
    writeFileSync(markdown, addPermissions(readFileSync(markdown, 'utf8'), [customAllow]));
    const tracked = [
      ...AGENTS.map(name => agentMarkdown(global, name)),
      join(global, 'opencode.jsonc'),
    ];
    const before = snapshot(tracked);
    fsFault.rename = (_from, to) => {
      if (to === markdown) throw new Error('injected strip failure');
    };

    expect(() => installGlobalFiles(global, true)).toThrow(/rolled back/);

    for (const [file, bytes] of Object.entries(before)) expect(readFileSync(file), file).toEqual(bytes);
    expect(readFileSync(markdown, 'utf8')).toContain('permissions:');
  });

  it('reread_mismatch_no_strip', () => {
    installGlobalFiles(global);
    const target = join(global, 'opencode.jsonc');
    const data = config(global);
    data.agents['kiki-implementer'].permissions = [...data.agents['kiki-implementer'].permissions, customAllow];
    writeFileSync(target, JSON.stringify(data, null, 2));
    const markdown = agentMarkdown(global);
    const beforeConfig = readFileSync(target);
    const beforeMarkdown = readFileSync(markdown);
    let injected = false;
    fsFault.afterRename = (_from, to) => {
      if (to !== target || injected) return;
      injected = true;
      const tampered = JSON.parse(readFileSync(target, 'utf8'));
      tampered.agents['kiki-implementer'].permissions = [];
      writeFileSync(target, JSON.stringify(tampered));
    };

    expect(() => installGlobalFiles(global, true)).toThrow(/verification|rolled back/i);

    expect(injected).toBe(true);
    // The strip never started and rollback restored the pre-update bytes.
    expect(readFileSync(markdown)).toEqual(beforeMarkdown);
    expect(readFileSync(target)).toEqual(beforeConfig);
  });

  it('rollback_failure_reports_backup', () => {
    installGlobalFiles(global);
    const markdown = agentMarkdown(global);
    writeFileSync(markdown, addPermissions(readFileSync(markdown, 'utf8'), [customAllow]));
    fsFault.rename = (_from, to) => {
      if (to === markdown) throw new Error('injected strip failure');
    };
    fsFault.write = (file) => {
      if (file === markdown) throw new Error('injected restore failure');
    };

    let message = '';
    try {
      installGlobalFiles(global, true);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toMatch(/rollback was incomplete/i);
    expect(message).toMatch(/kiki\/backups/);
    expect(message).toMatch(/injected strip failure/);
    expect(message).toMatch(/injected restore failure/);
  });

  it('backup_modes_restrictive_and_no_temp_garbage', () => {
    installGlobalFiles(global);
    // Force one backed-up update; a fresh install has nothing to back up.
    writeFileSync(join(global, 'agents/kiki-reviewer.md'), `---
description: custom
mode: subagent
---
Existing body.
`);
    installGlobalFiles(global, true);
    const backupRoot = join(global, 'kiki/backups');
    const backupDirs = readdirSync(backupRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory());
    expect(backupDirs).toHaveLength(1);
    const backupDir = join(backupRoot, backupDirs[0].name);
    expect(statSync(backupDir).mode & 0o777).toBe(0o700);
    for (const entry of readdirSync(backupDir, { withFileTypes: true })) {
      if (entry.isFile()) expect(statSync(join(backupDir, entry.name)).mode & 0o777).toBe(0o600);
    }
    const garbage = (directory: string): string[] => readdirSync(directory, { withFileTypes: true })
      .flatMap(entry => entry.isDirectory()
        ? garbage(join(directory, entry.name))
        : entry.name.endsWith('.tmp') ? [join(directory, entry.name)] : []);
    expect(garbage(global)).toEqual([]);
  });

  it('registration_failure_rolls_back', () => {
    fsFault.rename = (_from, to) => {
      if (to === join(global, 'cli.json')) throw new Error('injected registration failure');
    };
    expect(() => installGlobalFiles(global)).toThrow(/rolled back/);
    for (const agent of AGENTS) {
      expect(existsSync(agentMarkdown(global, agent)), agent).toBe(false);
    }
    expect(existsSync(join(global, 'opencode.jsonc'))).toBe(false);
  });

  it('crash_after_config_write_recovers_and_second_run_is_byte_stable', () => {
    mkdirSync(global, { recursive: true });
    writeFileSync(join(global, 'opencode.jsonc'), JSON.stringify({
      agents: { 'kiki-implementer': { permissions: [customAllow] } },
    }));
    // Simulate the crash window: config arrays written, generated markdown not
    // yet stripped. This is a reachable preflight state (recognised generated).
    installGlobalFiles(global);
    const markdown = agentMarkdown(global);
    const canonical = generateAgentPermissions()['kiki-implementer'];
    writeFileSync(markdown, addPermissions(readFileSync(markdown, 'utf8'), canonical));

    installGlobalFiles(global, true);
    const once = Object.fromEntries(
      [...AGENTS.map(name => agentMarkdown(global, name)), join(global, 'opencode.jsonc')]
        .map(file => [file, readFileSync(file)]),
    );
    const backupsAfterFirst = backupCount(global);

    installGlobalFiles(global, true);
    const again = Object.fromEntries(Object.keys(once).map(file => [file, readFileSync(file)]));
    expect(again).toEqual(once);
    // A no-op rerun creates no new backup directory.
    expect(backupCount(global)).toBe(backupsAfterFirst);
  });

  it('historical_global_markdown_preflight_converges', () => {
    installGlobalFiles(global);
    const canonical = generateAgentPermissions();
    for (const name of AGENTS) {
      const markdown = agentMarkdown(global, name);
      writeFileSync(markdown, addPermissions(
        readFileSync(markdown, 'utf8'),
        HISTORICAL_GENERATED_SEQUENCES[name][0],
      ));
    }

    installGlobalFiles(global, true);

    for (const name of AGENTS) {
      expect(readOpenCodeSettings(global, true).agents[name].permissions, name).toEqual(canonical[name]);
      expect(parseAgent(readFileSync(agentMarkdown(global, name), 'utf8'), name).settings, name)
        .not.toHaveProperty('permissions');
    }
  });
});

describe('managed permission prompt delivery', () => {
  const HEADING = '## Kiki managed permission requests (v1)';
  let root: string;
  let global: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kiki-fragment-'));
    global = join(root, 'opencode');
    vi.stubEnv('XDG_CONFIG_HOME', root);
  });
  afterEach(() => {
    fsFault.write = undefined;
    fsFault.rename = undefined;
    fsFault.afterRename = undefined;
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it('fragment_second_update_no_diff', () => {
    installGlobalFiles(global);
    const reviewer = agentMarkdown(global, 'kiki-reviewer');
    writeFileSync(reviewer, `---
description: custom
mode: subagent
---
Existing body only.
`);
    installGlobalFiles(global, true);
    const once = snapshot([
      ...AGENTS.map(name => agentMarkdown(global, name)),
      configFile(global), join(global, 'kiki/agentic-workflow.md'),
    ]);
    const backups = backupCount(global);
    installGlobalFiles(global, true);
    expect(snapshot(Object.keys(once))).toEqual(once);
    expect(backupCount(global)).toBe(backups);
    const body = parseAgent(readFileSync(reviewer, 'utf8'), 'kiki-reviewer').prompt;
    expect(body.startsWith('Existing body only.')).toBe(true);
    expect(body.split(HEADING).length - 1).toBe(1);
  });

  it('conflicting_or_duplicate_heading_no_writes', () => {
    installGlobalFiles(global);
    const reviewer = agentMarkdown(global, 'kiki-reviewer');
    writeFileSync(reviewer, `---
description: custom
mode: subagent
---
# Existing

${HEADING}

Different managed content.
`);
    const before = snapshot([
      ...AGENTS.map(name => agentMarkdown(global, name)),
      configFile(global), join(global, 'kiki/agentic-workflow.md'),
    ]);
    const backups = backupCount(global);
    expect(() => installGlobalFiles(global, true)).toThrow(/managed|conflict|duplicate/i);
    expect(snapshot(Object.keys(before))).toEqual(before);
    expect(backupCount(global)).toBe(backups);
  });

  it('behavior_section_and_consent_migrate_custom_prompts_without_overwriting', () => {
    installGlobalFiles(global);
    const reviewer = agentMarkdown(global, 'kiki-reviewer');
    const legacyConsent = 'Do not circumvent publishing-route approval via scripts, wrappers, alternate tools, APIs, or delegation. Request approval for the intended publishing operation. If approval is rejected, do not retry or work around it; report PERMISSION_BLOCKED: <command> and stop.';
    const consent = 'Behavioral rule: Do not circumvent publishing/Deploy-route approval via scripts, wrappers, alternate tools, APIs, or delegation. Request approval for the intended publishing operation. If approval is rejected, do not retry or work around it; report PERMISSION_BLOCKED: <command> and stop.';
    const toolLine = 'Verhaltensregel: Kein Web, kein MCP, keine Delegation, kein Code Mode.';
    writeFileSync(reviewer, `---
description: custom reviewer
mode: subagent
---
# Existing review instructions

Keep this unique custom line.

${legacyConsent}
`);

    installGlobalFiles(global, true);

    const text = readFileSync(reviewer, 'utf8');
    expect(text).toContain('description: custom reviewer');
    expect(text).toContain('# Existing review instructions');
    expect(text).toContain('Keep this unique custom line.');
    expect(text).not.toContain('Do not circumvent publishing-route approval');
    expect(text.split(consent).length - 1).toBe(1);
    expect(text).toContain('Die Regeln aus Main gelten auch im Worktree.');
    expect(text.split('Die Regeln aus Main gelten auch im Worktree.').length - 1).toBe(1);
    expect(text).toContain(toolLine);
    expect(text.split(toolLine).length - 1).toBe(1);
    expect(text.split('## Kiki baseline behavior (v1)').length - 1).toBe(1);
    expect(text.indexOf('## Kiki baseline behavior (v1)'))
      .toBeLessThan(text.indexOf('## Kiki managed permission requests (v1)'));
    const body = parseAgent(text, 'kiki-reviewer').prompt;
    expect(body.trimEnd().endsWith(PERMISSION_REQUEST_FRAGMENT.trimEnd())).toBe(true);

    // Repeated update is byte-stable.
    const once = readFileSync(reviewer);
    installGlobalFiles(global, true);
    expect(readFileSync(reviewer)).toEqual(once);
  });

  it('behavior_migration_preserves_crlf_custom_prompts', () => {
    installGlobalFiles(global);
    const reviewer = agentMarkdown(global, 'kiki-reviewer');
    const legacyConsent = 'Do not circumvent publishing-route approval via scripts, wrappers, alternate tools, APIs, or delegation. Request approval for the intended publishing operation. If approval is rejected, do not retry or work around it; report PERMISSION_BLOCKED: <command> and stop.';
    writeFileSync(reviewer, `---\r\ndescription: crlf reviewer\r\nmode: subagent\r\n---\r\nCRLF custom body.\r\n\r\n${legacyConsent}\r\n`);

    installGlobalFiles(global, true);

    const text = readFileSync(reviewer, 'utf8');
    expect(text).toContain('CRLF custom body.');
    // The inserted prompt text follows the body's existing CRLF convention; the
    // renderer's frontmatter separators keep their established LF form.
    expect(text).toContain('\r\nDie Regeln aus Main gelten auch im Worktree.');
    expect(text).toContain('\r\nVerhaltensregel: Kein Web, kein MCP, keine Delegation, kein Code Mode.');
    expect(text).not.toContain('Do not circumvent publishing-route approval');
    expect(text.split('Behavioral rule: Do not circumvent publishing/Deploy-route approval').length - 1).toBe(1);
  });

  it('conflicting_or_duplicate_behavior_heading_no_writes', () => {
    installGlobalFiles(global);
    const reviewer = agentMarkdown(global, 'kiki-reviewer');
    writeFileSync(reviewer, `---
description: custom
mode: subagent
---
# Existing

## Kiki baseline behavior (v1)

Conflicting content.
`);
    const before = snapshot([
      ...AGENTS.map(name => agentMarkdown(global, name)),
      configFile(global), join(global, 'kiki/agentic-workflow.md'),
    ]);
    const backups = backupCount(global);
    expect(() => installGlobalFiles(global, true)).toThrow(/managed|conflict|duplicate/i);
    expect(snapshot(Object.keys(before))).toEqual(before);
    expect(backupCount(global)).toBe(backups);
  });

  it('fragment_write_failure_rolls_back', () => {
    installGlobalFiles(global);
    const reviewer = agentMarkdown(global, 'kiki-reviewer');
    writeFileSync(reviewer, `---
description: custom
mode: subagent
---
Existing body only.
`);
    const beforeReviewer = readFileSync(reviewer);
    const beforeConfig = readFileSync(configFile(global));
    fsFault.rename = (_from, to) => {
      if (to === reviewer) throw new Error('injected fragment write failure');
    };
    expect(() => installGlobalFiles(global, true)).toThrow(/rolled back/i);
    expect(readFileSync(reviewer)).toEqual(beforeReviewer);
    expect(readFileSync(configFile(global))).toEqual(beforeConfig);
  });
});
