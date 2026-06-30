import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { resolveKikiFile, AGENTIC_KIKI_DIR, GLOBAL_KIKI_DIR, detectKikiConfig } from '../../src/core/path-resolver';

describe('path-resolver', () => {
  const tmpDir = '/tmp/kiki-path-resolver-test';
  const globalDir = join(homedir(), '.config', 'opencode', 'kiki', 'defaults');

  beforeEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(globalDir, { recursive: true, force: true });
    mkdirSync(tmpDir, { recursive: true });
    mkdirSync(join(tmpDir, '.agentic', 'kiki'), { recursive: true });
    mkdirSync(globalDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(globalDir, { recursive: true, force: true });
  });

  it('resolves .agentic/kiki/ first', () => {
    writeFileSync(join(tmpDir, '.agentic', 'kiki', 'routing.json'), '{"kiki": true}');
    const result = resolveKikiFile('routing.json', tmpDir);
    expect(result).toBe(join(tmpDir, '.agentic', 'kiki', 'routing.json'));
  });

  it('falls back to .agentic/ root (legacy)', () => {
    writeFileSync(join(tmpDir, '.agentic', 'routing.json'), '{"legacy": true}');
    const result = resolveKikiFile('routing.json', tmpDir);
    expect(result).toBe(join(tmpDir, '.agentic', 'routing.json'));
  });

  it('falls back to global defaults', () => {
    writeFileSync(join(globalDir, 'routing.json'), '{"global": true}');
    const result = resolveKikiFile('routing.json', tmpDir);
    expect(result).toBe(join(globalDir, 'routing.json'));
  });

  it('returns .agentic/kiki/ path when nothing exists', () => {
    const result = resolveKikiFile('routing.json', tmpDir);
    expect(result).toBe(join(tmpDir, '.agentic', 'kiki', 'routing.json'));
  });

  it('detects kiki config in .agentic/kiki/', () => {
    writeFileSync(join(tmpDir, '.agentic', 'kiki', 'config.json'), '{}');
    expect(detectKikiConfig(tmpDir)).toBe('kiki');
  });

  it('detects legacy config in .agentic/', () => {
    writeFileSync(join(tmpDir, '.agentic', 'config.json'), '{}');
    expect(detectKikiConfig(tmpDir)).toBe('legacy');
  });

  it('detects global config', () => {
    writeFileSync(join(globalDir, 'config.json'), '{}');
    expect(detectKikiConfig(tmpDir)).toBe('global');
  });

  it('returns null when no config exists', () => {
    expect(detectKikiConfig(tmpDir)).toBeNull();
  });
});
