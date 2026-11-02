import { describe, it, expect } from 'vitest';
import { DEDUP_SOURCE } from '../../src/plugin/dedup-source';

describe('DEDUP_SOURCE', () => {
  it('is a non-empty string', () => {
    expect(typeof DEDUP_SOURCE).toBe('string');
    expect(DEDUP_SOURCE.length).toBeGreaterThan(100);
  });

  it('contains the ownership registry primitives', () => {
    expect(DEDUP_SOURCE).toContain("Symbol.for('kiki.plugin')");
    expect(DEDUP_SOURCE).toContain('function acquireOwnership');
    expect(DEDUP_SOURCE).toContain('function getOwner');
    expect(DEDUP_SOURCE).toContain('function reportVersionMismatch');
    expect(DEDUP_SOURCE).toContain('interface OwnershipRecord');
  });

  it('contains no backticks or template-literal placeholders', () => {
    expect(DEDUP_SOURCE).not.toMatch(/[`]/);
    expect(DEDUP_SOURCE).not.toMatch(/\$\{/);
  });

  it('references the baked-in scope/version constants', () => {
    expect(DEDUP_SOURCE).toContain('KIKI_PLUGIN_SCOPE');
    expect(DEDUP_SOURCE).toContain('KIKI_PLUGIN_VERSION');
  });

  it('emits the plugin-dedup-version-mismatch event and realign hint', () => {
    expect(DEDUP_SOURCE).toContain('plugin-dedup-version-mismatch');
    expect(DEDUP_SOURCE).toContain('kiki install --force');
    expect(DEDUP_SOURCE).toContain('kiki update');
  });
});
