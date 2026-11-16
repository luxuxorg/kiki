import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import {
  DEFAULT_CONFIG,
  DEFAULT_DIAGNOSTICS,
  DEFAULT_HEALTH,
  loadConfig,
  sanitizeDiagnostics,
} from '../../src/cli/config';
import { runWizard } from '../../src/cli/commands/init';

describe('sanitizeDiagnostics', () => {
  it('pins the default-off sanitizer behavior', () => {
    expect(sanitizeDiagnostics(undefined)).toEqual({ enabled: false });
    expect(sanitizeDiagnostics({ enabled: 'true' })).toEqual({ enabled: false });
    expect(sanitizeDiagnostics({ enabled: true })).toEqual({ enabled: true });
  });

  it('falls back to disabled for arrays, null, primitives and missing enabled', () => {
    for (const value of [null, [], [true], true, 1, 'enabled', {}, { enabled: 1 }, { enabled: null }]) {
      expect(sanitizeDiagnostics(value)).toEqual({ enabled: false });
    }
  });

  it('discards unknown keys instead of carrying them forward', () => {
    expect(sanitizeDiagnostics({ enabled: true, path: '/tmp/other.jsonl' })).toEqual({ enabled: true });
    expect(Object.keys(sanitizeDiagnostics({ enabled: true, path: 'x' }))).toEqual(['enabled']);
  });

  it('does not mutate the shared defaults', () => {
    sanitizeDiagnostics({ enabled: true });
    expect(DEFAULT_DIAGNOSTICS).toEqual({ enabled: false });
  });
});

describe('CLI diagnostics configuration', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kiki-config-setup-'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  const writeModernConfig = (value: unknown): void => {
    mkdirSync(join(root, '.agentic', 'kiki'), { recursive: true });
    writeFileSync(join(root, '.agentic', 'kiki', 'config.json'), JSON.stringify(value));
  };

  it('exposes the default in DEFAULT_CONFIG without changing health defaults', () => {
    expect(DEFAULT_DIAGNOSTICS).toEqual({ enabled: false });
    expect(DEFAULT_CONFIG.diagnostics).toEqual({ enabled: false });
    expect(DEFAULT_CONFIG.health).toEqual(DEFAULT_HEALTH);
  });

  it('returns the default when no config file exists', () => {
    expect(loadConfig(root).diagnostics).toEqual({ enabled: false });
    expect(loadConfig(root).health).toEqual(DEFAULT_HEALTH);
  });

  it('loads an enabled project setting', () => {
    writeModernConfig({ diagnostics: { enabled: true } });
    expect(loadConfig(root).diagnostics).toEqual({ enabled: true });
  });

  it('sanitizes invalid loader input instead of trusting it', () => {
    writeModernConfig({ diagnostics: { enabled: 'true', extra: 'ignored' } });
    expect(loadConfig(root).diagnostics).toEqual({ enabled: false });

    writeModernConfig({ diagnostics: ['enabled'] });
    expect(loadConfig(root).diagnostics).toEqual({ enabled: false });
  });

  it('loads diagnostics from the legacy config fallback', () => {
    mkdirSync(join(root, '.agentic'), { recursive: true });
    writeFileSync(join(root, '.agentic', 'config.json'), JSON.stringify({ diagnostics: { enabled: true } }));
    expect(loadConfig(root).diagnostics).toEqual({ enabled: true });
  });

  it('keeps existing path and health handling while adding diagnostics', () => {
    writeModernConfig({
      paths: { source: 'backend/' },
      health: { stuckThresholdMs: 1234 },
      diagnostics: { enabled: true },
    });
    const config = loadConfig(root);
    expect(config.paths.source).toBe('backend/');
    expect(config.paths.tests).toBe('tests/');
    expect(config.health.stuckThresholdMs).toBe(1234);
    expect(config.health.absoluteMaxMs).toBe(DEFAULT_HEALTH.absoluteMaxMs);
    expect(config.diagnostics).toEqual({ enabled: true });
  });

  it('includes disabled diagnostics in wizard-created config without another question', async () => {
    const input = new PassThrough();
    const originalStdin = Object.getOwnPropertyDescriptor(process, 'stdin');
    Object.defineProperty(process, 'stdin', { value: input, configurable: true });
    const writes: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    try {
      const pending = runWizard(root);
      const answers = [
        'diag-project', 'typescript', 'src/', 'tests/', 'docs/',
        'CHANGELOG.md', 'create', 'docs/DECISIONS.md', 'create', 'docs/knowledge/', 'create',
        'custom-build', 'custom-test', 'custom-lint', 'custom-security',
        '', '', '', '', '', '', '', '',
      ];
      for (const line of answers) input.write(line + '\n');
      input.end();

      const config = await pending;
      expect(config.diagnostics).toEqual({ enabled: false });
      expect(config.health).toEqual(DEFAULT_HEALTH);
      expect(writes.join('').toLowerCase()).not.toContain('diagnostics');
    } finally {
      stdoutSpy.mockRestore();
      if (originalStdin) Object.defineProperty(process, 'stdin', originalStdin);
    }
  });

  it('does not overwrite an existing project config during initialization', async () => {
    const { installProjectConfig } = await import('../../src/cli/commands/install');
    mkdirSync(join(root, '.agentic', 'kiki'), { recursive: true });
    const bytes = JSON.stringify({ projectName: 'keep-me', diagnostics: { enabled: true } });
    const configPath = join(root, '.agentic', 'kiki', 'config.json');
    writeFileSync(configPath, bytes);

    installProjectConfig(root, loadConfig(root));
    expect(existsSync(configPath)).toBe(true);
    expect(readFileSync(configPath, 'utf8')).toBe(bytes);
  });
});
