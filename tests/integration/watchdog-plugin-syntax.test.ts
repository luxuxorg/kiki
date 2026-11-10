import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import plugin from '../../src/server/index';
import distPlugin from '../../dist/server/index.js';

describe('server plugin entrypoint', () => {
  it('defines the kiki server plugin with an awaited setup function', () => {
    expect(plugin.id).toBe('kiki');
    expect(typeof plugin.setup).toBe('function');
    expect(distPlugin.id).toBe('kiki');
    expect(typeof distPlugin.setup).toBe('function');
  });

  it('loads the typed server dependency closure from source and the built package', async () => {
    const logger = await import('../../src/server/routing-logger');
    const watchdog = await import('../../src/server/watchdog');
    const events = await import('../../src/server/watchdog-events');
    expect(typeof logger.startRoutingLogger).toBe('function');
    expect(typeof watchdog.createWatchdog).toBe('function');
    expect(typeof watchdog.createWatchdogSessionAdapter).toBe('function');
    expect(typeof events.decodeWatchdogEvent).toBe('function');

    for (const file of [
      'dist/server/index.js', 'dist/server/routing-logger.js',
      'dist/server/watchdog.js', 'dist/server/watchdog-events.js',
      'dist/server/index.d.ts', 'dist/tui/index.js', 'dist/cli/index.js',
    ]) {
      expect(existsSync(resolve(file)), file).toBe(true);
    }
  });

  it('does not depend on the retired V1 generated plugin sources', () => {
    for (const file of ['src/server/index.ts', 'dist/server/index.js']) {
      const source = readFileSync(resolve(file), 'utf8');
      expect(source, file).not.toMatch(/watchdog-source|dedup-source|WATCHDOG_SOURCE|DEDUP_SOURCE/);
      expect(source, file).not.toMatch(/globalThis/);
    }
  });
});
