import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as config from '../../src/cli/config';
import { DEFAULT_CONFIG, KIKI_VERSION, generateAllTemplates } from '../../src/cli/config';

const AGENT_KEYS = [
  'orchestrator',
  'brainstormer',
  'planner',
  'implementer',
  'guiDesigner',
  'reviewer',
  'escalation',
  'historian',
] as const;

describe('V2 generated templates', () => {
  it('returns the agent and workflow templates without V1 plugin payloads', () => {
    const templates = generateAllTemplates(DEFAULT_CONFIG) as unknown as Record<string, unknown>;
    expect(Object.keys(templates).sort()).toEqual([...AGENT_KEYS, 'workflow'].sort());
    expect(templates.plugin).toBeUndefined();
    expect(templates.packageJson).toBeUndefined();
    expect(templates.gitignore).toBeUndefined();
  });

  it('renders every agent template as native V2 Markdown', () => {
    const templates = generateAllTemplates(DEFAULT_CONFIG);
    for (const key of AGENT_KEYS) {
      const template = templates[key];
      expect(template).toMatch(/^---\n/);
      expect(template).toContain('description:');
      expect(template).toContain('mode:');
      expect(template).not.toMatch(/^model:/m);
    }
  });

  it('no longer exports the V1 plugin or dedup generator APIs', () => {
    const module = config as unknown as Record<string, unknown>;
    expect('generatePluginTemplate' in module).toBe(false);
    expect('OPENCODE_PACKAGE_JSON_TEMPLATE' in module).toBe(false);
    expect('OPENCODE_GITIGNORE_TEMPLATE' in module).toBe(false);
  });

  it('does not import or inline the retired V1 plugin sources', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/cli/config.ts'), 'utf8');
    expect(source).not.toMatch(/WATCHDOG_SOURCE|DEDUP_SOURCE|watchdog-source|dedup-source/);
    expect(source).not.toMatch(/globalThis|Symbol\.for\('kiki\.plugin'\)/);
  });
});

describe('KIKI_VERSION', () => {
  it('matches the version in package.json', () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8'));
    expect(KIKI_VERSION).toBe(pkg.version);
  });
});
