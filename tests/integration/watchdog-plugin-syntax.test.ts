import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { generateAllTemplates, DEFAULT_CONFIG } from '../../src/cli/config';

const require = createRequire(import.meta.url);

function localTsc(): string {
  try {
    return require.resolve('typescript/bin/tsc');
  } catch {
    throw new Error('Local TypeScript compiler not found; install devDependencies before running this test.');
  }
}

function assertPluginSyntax(plugin: string, name: string): void {
  const tmpDir = `tmp/watchdog-plugin-syntax-${name}-${Date.now()}`;
  try {
    mkdirSync(tmpDir, { recursive: true });
    const pluginPath = join(tmpDir, 'kiki-plugin-check.ts');
    writeFileSync(pluginPath, plugin);
    // Type-check the generated plugin with the local tsc (noEmit). The inlined
    // watchdog body is intentionally untyped ES5-style JS, so --strict
    // (noImplicitAny, strictNullChecks) would flag every unannotated parameter
    // and null-literal initializer. Run without --strict to validate
    // syntactic/structural soundness, which is what this check guards against
    // (broken template literal, unescaped sequences, malformed default export).
    execFileSync(process.execPath, [localTsc(), '--noEmit', '--skipLibCheck', '--module', 'esnext', '--target', 'es2020', '--moduleResolution', 'bundler', pluginPath], { stdio: 'pipe' });
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  }
}

describe('generated plugin file', () => {
  it('is syntactically valid JavaScript/TypeScript as evaluated structure', () => {
    assertPluginSyntax(generateAllTemplates(DEFAULT_CONFIG).plugin, 'project');
  }, 60_000);

  it('generateAllTemplates project plugin writes the watchdog-enabled plugin on disk', () => {
    const tmpDir = `tmp/watchdog-write-files-${Date.now()}`;
    try {
      const templates = generateAllTemplates(DEFAULT_CONFIG);
      const pluginsDir = join(tmpDir, '.opencode', 'plugins');
      mkdirSync(pluginsDir, { recursive: true });
      writeFileSync(join(pluginsDir, 'kiki.ts'), templates.plugin);
      const content = readFileSync(join(pluginsDir, 'kiki.ts'), 'utf-8');
      expect(content).toContain('function createWatchdog(deps)');
      expect(content).toContain('watchdog.start()');
    } finally {
      if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('global-scoped generated plugin is syntactically valid TypeScript', () => {
    assertPluginSyntax(generateAllTemplates(DEFAULT_CONFIG, 'global').plugin, 'global');
  }, 60_000);

  it('generateAllTemplates global plugin writes the watchdog plugin with global scope and dedup on disk', () => {
    const tmpDir = `tmp/watchdog-write-files-global-${Date.now()}`;
    try {
      const templates = generateAllTemplates(DEFAULT_CONFIG, 'global');
      const pluginsDir = join(tmpDir, '.opencode', 'plugins');
      mkdirSync(pluginsDir, { recursive: true });
      writeFileSync(join(pluginsDir, 'kiki.ts'), templates.plugin);
      const content = readFileSync(join(pluginsDir, 'kiki.ts'), 'utf-8');
      expect(content).toContain("const KIKI_PLUGIN_SCOPE = 'global';");
      expect(content).toContain('function createWatchdog(deps)');
      expect(content).toContain('watchdog.start()');
      expect(content).toContain("Symbol.for('kiki.plugin')");
    } finally {
      if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
