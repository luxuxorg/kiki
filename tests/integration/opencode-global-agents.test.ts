import { it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installGlobalFiles, migrateProject } from '../../src/cli/opencode-config';
import { DEFAULT_CONFIG, generateImplementerTemplate } from '../../src/cli/config';

// Opt-in: OpenCode is not a dependency of the CLI test suite. Only fixture
// configuration is loaded; never inspect or dump the user's real config.
it.skipIf(!process.env.OPENCODE_TEST_BINARY)('OpenCode resolves global JSON prompts with project-specific permissions and models', () => {
  const root = mkdtempSync(join(tmpdir(), 'kiki-opencode-'));
  try {
    const global = join(root, 'config/opencode');
    const project = join(root, 'project'); mkdirSync(project);
    installGlobalFiles(global);
    writeFileSync(join(project, 'opencode.jsonc'), JSON.stringify({
      $schema: 'https://opencode.ai/config.json',
      agent: { 'kiki-implementer': { model: 'project/model', permission: { edit: 'deny' } } },
    }));
    const stdout = execFileSync(process.env.OPENCODE_TEST_BINARY!, ['debug', 'config'], {
      cwd: project,
      env: {
        PATH: process.env.PATH, HOME: root,
        XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data'),
        XDG_CACHE_HOME: join(root, 'cache'), XDG_STATE_HOME: join(root, 'state'),
        OPENCODE_DISABLE_AUTOUPDATE: 'true', OPENCODE_DISABLE_MODELS_FETCH: 'true',
      },
      encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const resolved = JSON.parse(stdout);
    expect(resolved.agent['kiki-implementer'].model).toBe('project/model');
    expect(resolved.agent['kiki-implementer'].permission.edit).toBe('deny');
    expect(resolved.agent['kiki-implementer'].prompt).toContain('Kiki Implementer');
    expect(resolved.agent['kiki-reviewer'].prompt).toContain('Kiki Reviewer');
    expect(resolved.agent['kiki-reviewer'].permission.edit['*']).toBe('deny');

    // Replace the scalar test override with a migrated path-specific policy,
    // then update globally: the effective project boundaries must stay fixed.
    writeFileSync(join(project, 'opencode.jsonc'), '{"agent":{"kiki-implementer":{"model":"project/model"}}}');
    mkdirSync(join(project, '.opencode/agents'), { recursive: true });
    writeFileSync(join(project, '.opencode/agents/kiki-implementer.md'), generateImplementerTemplate(DEFAULT_CONFIG).replace('"src/**": allow', '"backend/**": allow'));
    migrateProject(project, global);
    installGlobalFiles(global, true);
    const after = JSON.parse(execFileSync(process.env.OPENCODE_TEST_BINARY!, ['debug', 'config'], {
      cwd: project,
      env: {
        PATH: process.env.PATH, HOME: root,
        XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data'),
        XDG_CACHE_HOME: join(root, 'cache'), XDG_STATE_HOME: join(root, 'state'),
        OPENCODE_DISABLE_AUTOUPDATE: 'true', OPENCODE_DISABLE_MODELS_FETCH: 'true',
      },
      encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'],
    }));
    expect(after.agent['kiki-implementer'].permission.edit['src/**']).toBe('deny');
    expect(after.agent['kiki-implementer'].permission.edit['backend/**']).toBe('allow');
    expect(after.agent['kiki-implementer'].model).toBe('project/model');
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 90_000);
