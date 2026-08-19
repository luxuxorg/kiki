import { describe, it, expect } from 'vitest';
import { generatePluginTemplate, DEFAULT_HEALTH } from '../../src/cli/config';

describe('generatePluginTemplate', () => {
  const template = generatePluginTemplate();

  it('inlines the watchdog source', () => {
    expect(template).toContain('function createWatchdog(deps)');
  });

  it('bakes in the default health config', () => {
    expect(template).toContain('"stuckThresholdMs": 300000');
    expect(template).toContain('"absoluteMaxMs": 3600000');
    expect(template).toContain(String(DEFAULT_HEALTH.loopRepeatCount));
  });

  it('starts the watchdog and wires the event hook', () => {
    expect(template).toContain('watchdog.start()');
    expect(template).toContain('watchdog.handleEvent(event)');
  });

  it('keeps the routing logger for kiki task dispatches', () => {
    expect(template).toContain("input.tool !== 'task'");
    expect(template).toContain("subagentType.startsWith('kiki-')");
    expect(template).toContain('routing_log.jsonl');
  });

  it('loads runtime health config from .agentic/kiki/config.json', () => {
    expect(template).toContain('loadHealthConfig');
    expect(template).toContain(".agentic', 'kiki', 'config.json");
  });

  it('creates the watchdog with client, directory, config, and now', () => {
    expect(template).toContain('createWatchdog({');
    expect(template).toContain('now: () => Date.now()');
  });
});
