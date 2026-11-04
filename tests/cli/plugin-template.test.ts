import { describe, it, expect } from 'vitest';
import {
  generatePluginTemplate,
  DEFAULT_HEALTH,
  KIKI_VERSION,
  generateAllTemplates,
  DEFAULT_CONFIG,
} from '../../src/cli/config';
import { WATCHDOG_SOURCE } from '../../src/plugin/watchdog-source';

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

  it('WATCHDOG_SOURCE contains no backticks or template-literal placeholders', () => {
    expect(WATCHDOG_SOURCE).not.toMatch(/[`]/);
    expect(WATCHDOG_SOURCE).not.toMatch(/\$\{/);
  });

  it('sanitizes invalid health values at load time', () => {
    expect(template).toContain('function isPositiveInt(v: unknown)');
    expect(template).toContain('function sanitizeHealth(raw: any)');
    expect(template).toContain('raw.loopRepeatCount >= 2');
  });

  it('inlines the dedup ownership registry', () => {
    expect(template).toContain("Symbol.for('kiki.plugin')");
    expect(template).toContain('function acquireOwnership');
    expect(template).toContain('function getOwner');
    expect(template).toContain('function reportVersionMismatch');
  });

  it('imports resolve from path (for the ownership root key)', () => {
    expect(template).toContain("import { join, dirname, resolve } from 'path';");
  });

  it('uses resolve() for the ownership root', () => {
    expect(template).toContain('resolve(directory || process.cwd())');
  });

  it('stamps default scope=project and default version when called with no args', () => {
    expect(template).toContain("const KIKI_PLUGIN_SCOPE = 'project';");
    expect(template).toContain(`const KIKI_PLUGIN_VERSION = '${KIKI_VERSION}';`);
  });

  it('returns no-op hooks on the non-owner path', () => {
    expect(template).toContain('if (!ownership)');
    expect(template).toContain("'tool.execute.before': async (_input: any, _output: any) => {}");
    expect(template).toContain('event: async (_args: { event: any }) => {}');
  });

  it('contains no backticks or ${ in the inlined dedup region', () => {
    const dedupStart = template.indexOf('interface OwnershipRecord');
    const dedupEnd = template.indexOf('function reportVersionMismatch');
    expect(dedupStart).toBeGreaterThan(-1);
    expect(dedupEnd).toBeGreaterThan(dedupStart);
    const dedupRegion = template.slice(dedupStart, template.indexOf('const DEFAULT_HEALTH'));
    expect(dedupRegion).not.toMatch(/[`]/);
    expect(dedupRegion).not.toMatch(/\$\{/);
  });
});

describe('KIKI_VERSION', () => {
  it('matches the version in package.json', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8'));
    expect(KIKI_VERSION).toBe(pkg.version);
  });
});

describe('generatePluginTemplate scope/version threading', () => {
  it('stamps scope=global when requested', () => {
    const t = generatePluginTemplate({ scope: 'global', version: KIKI_VERSION });
    expect(t).toContain("const KIKI_PLUGIN_SCOPE = 'global';");
    expect(t).toContain(`const KIKI_PLUGIN_VERSION = '${KIKI_VERSION}';`);
  });

  it('stamps an arbitrary version string', () => {
    const t = generatePluginTemplate({ scope: 'project', version: '9.9.9' });
    expect(t).toContain("const KIKI_PLUGIN_VERSION = '9.9.9';");
  });

  it('defaults scope to project and version to KIKI_VERSION with empty opts', () => {
    const t = generatePluginTemplate({});
    expect(t).toContain("const KIKI_PLUGIN_SCOPE = 'project';");
    expect(t).toContain(`const KIKI_PLUGIN_VERSION = '${KIKI_VERSION}';`);
  });

  it.each(['2.2.0', '2.3.0', '9.9.9'])('threads version %s through the plugin and all templates', (version) => {
    const plugin = generatePluginTemplate({ scope: 'global', version });
    expect(plugin).toContain("const KIKI_PLUGIN_SCOPE = 'global';");
    expect(plugin).toContain(`const KIKI_PLUGIN_VERSION = '${version}';`);
    const all = generateAllTemplates(DEFAULT_CONFIG, 'project', version);
    expect(all.plugin).toContain(`const KIKI_PLUGIN_VERSION = '${version}';`);
  });
});

describe('generateAllTemplates scope threading', () => {
  it('threads scope=global through to the plugin template', () => {
    const t = generateAllTemplates(DEFAULT_CONFIG, 'global');
    expect(t.plugin).toContain("const KIKI_PLUGIN_SCOPE = 'global';");
  });

  it('defaults to scope=project when scope is omitted', () => {
    const t = generateAllTemplates(DEFAULT_CONFIG);
    expect(t.plugin).toContain("const KIKI_PLUGIN_SCOPE = 'project';");
  });
});
