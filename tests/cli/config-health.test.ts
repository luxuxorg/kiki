import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, DEFAULT_HEALTH } from '../../src/cli/config';

describe('loadConfig health section', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = `tmp/config-health-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await fs.mkdir(path.join(tmpDir, '.agentic', 'kiki'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns default health config when config file is missing', () => {
    expect(loadConfig(tmpDir).health).toEqual(DEFAULT_HEALTH);
  });

  it('returns default health config when config file has no health section', async () => {
    const configPath = path.join(tmpDir, '.agentic', 'kiki', 'config.json');
    await fs.writeFile(configPath, JSON.stringify({
      projectName: 'x',
      language: 'typescript',
      commands: { build: 'b', test: 't', lint: 'l', security: 's' },
    }));
    expect(loadConfig(tmpDir).health).toEqual(DEFAULT_HEALTH);
  });

  it('merges partial health overrides with defaults', async () => {
    const configPath = path.join(tmpDir, '.agentic', 'kiki', 'config.json');
    await fs.writeFile(configPath, JSON.stringify({
      health: { stuckThresholdMs: 60000, watchAllSubagents: true },
    }));
    const cfg = loadConfig(tmpDir);
    expect(cfg.health.stuckThresholdMs).toBe(60000);
    expect(cfg.health.watchAllSubagents).toBe(true);
    expect(cfg.health.absoluteMaxMs).toBe(DEFAULT_HEALTH.absoluteMaxMs);
    expect(cfg.health.loopRepeatCount).toBe(DEFAULT_HEALTH.loopRepeatCount);
  });

  it('exposes expected default values', () => {
    expect(DEFAULT_HEALTH).toEqual({
      watchdogEnabled: true,
      stuckThresholdMs: 300000,
      gracePeriodMs: 120000,
      absoluteMaxMs: 3600000,
      checkIntervalMs: 30000,
      loopRepeatCount: 3,
      watchAllSubagents: false,
      logPath: '.agentic/kiki/health_log.jsonl',
    });
  });
});
