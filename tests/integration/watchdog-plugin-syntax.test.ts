import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { generateAllTemplates, DEFAULT_CONFIG } from '../../src/cli/config';

describe('generated plugin file', () => {
  it('is syntactically valid JavaScript/TypeScript as evaluated structure', () => {
    const templates = generateAllTemplates(DEFAULT_CONFIG);
    const tmpDir = `tmp/watchdog-plugin-syntax-${Date.now()}`;
    try {
      mkdirSync(tmpDir, { recursive: true });
      const pluginPath = join(tmpDir, 'kiki-plugin-check.ts');
      writeFileSync(pluginPath, templates.plugin);
      // Type-check the generated plugin with tsc (noEmit). The inlined watchdog
      // body is intentionally untyped ES5-style JS, so --strict (noImplicitAny,
      // strictNullChecks) would flag every unannotated parameter and null-literal
      // initializer. Run without --strict to validate syntactic/structural
      // soundness, which is what this check guards against (broken template
      // literal, unescaped sequences, malformed default export, etc.).
      execFileSync('npx', ['tsc', '--noEmit', '--skipLibCheck', '--module', 'esnext', '--target', 'es2020', '--moduleResolution', 'bundler', pluginPath], { stdio: 'pipe' });
    } finally {
      if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('writeOpencodeFiles produces the watchdog-enabled plugin on disk', async () => {
    const { writeOpencodeFiles } = await import('../../src/cli/config');
    const tmpDir = `tmp/watchdog-write-files-${Date.now()}`;
    try {
      writeOpencodeFiles(tmpDir, DEFAULT_CONFIG);
      const { readFileSync } = await import('node:fs');
      const content = readFileSync(join(tmpDir, '.opencode', 'plugins', 'kiki.ts'), 'utf-8');
      expect(content).toContain('function createWatchdog(deps)');
      expect(content).toContain('watchdog.start()');
    } finally {
      if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
