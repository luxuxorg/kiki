import { it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { parse } from 'jsonc-parser';

it.skipIf(!process.env.OPENCODE_TEST_BINARY)('loads the packaged TUI plugin and saves a model through the real native /kiki menu', () => {
  const root = mkdtempSync(join(tmpdir(), 'kiki-native-menu-'));
  try {
    const project = join(root, 'project'); mkdirSync(project);
    const global = join(root, 'config/opencode'); mkdirSync(global, { recursive: true });
    const env = {
      PATH: process.env.PATH, HOME: root, LANG: 'C.UTF-8', TERM: 'xterm-256color', COLORTERM: 'truecolor',
      XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data'),
      XDG_CACHE_HOME: join(root, 'cache'), XDG_STATE_HOME: join(root, 'state'),
      OPENCODE_DISABLE_AUTOUPDATE: 'true', OPENCODE_DISABLE_MODELS_FETCH: 'true',
      PYTHONDONTWRITEBYTECODE: '1',
    };
    const globalFile = join(global, 'opencode.jsonc');
    writeFileSync(globalFile, JSON.stringify({
      $schema: 'https://opencode.ai/config.json',
      model: 'openai/kiki-fixture', enabled_providers: ['openai'],
      provider: { openai: {
        options: { apiKey: 'fixture-placeholder', baseURL: 'http://127.0.0.1:9/v1' },
        models: { 'kiki-fixture': { name: 'Kiki Fixture Model', limit: { context: 16000, output: 2000 } } },
      } },
    }));
    const projectFile = join(project, 'opencode.jsonc');
    writeFileSync(projectFile, '{"$schema":"https://opencode.ai/config.json","agent":{"kiki-reviewer":{"permission":{"edit":"deny"}}}}');
    execFileSync(process.execPath, [resolve('dist/cli/index.js'), 'install'], { env, stdio: 'pipe', timeout: 20_000 });
    // A higher TUI tier with its own plugin array must not shadow the global
    // loader registered in tui.json. OpenCode merges resolved plugin origins.
    writeFileSync(join(global, 'tui.jsonc'), '{"$schema":"https://opencode.ai/tui.json","plugin":[]}');
    const loader = pathToFileURL(join(global, 'kiki/tui.js')).href;
    const moduleInfo = execFileSync(process.execPath, ['--input-type=module', '-e',
      `const {default:p}=await import(${JSON.stringify(loader)}); console.log(JSON.stringify({id:p.id,tui:typeof p.tui,server:typeof p.server}));`],
    { env, encoding: 'utf8', timeout: 20_000 });
    expect(JSON.parse(moduleInfo)).toEqual({ id: 'kiki', tui: 'function', server: 'undefined' });
    const before = parse(readFileSync(globalFile, 'utf8'));
    const projectBefore = readFileSync(projectFile, 'utf8');
    const output = execFileSync('python3', [resolve('tests/integration/fixtures/kiki-tui-smoke.py'), process.env.OPENCODE_TEST_BINARY!, project], {
      cwd: project, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 90_000,
    });
    expect(output).toContain('PASS: /kiki');
    before.agent['kiki-reviewer'].model = 'openai/kiki-fixture';
    expect(parse(readFileSync(globalFile, 'utf8'))).toEqual(before);
    expect(readFileSync(projectFile, 'utf8')).toBe(projectBefore);
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 120_000);
