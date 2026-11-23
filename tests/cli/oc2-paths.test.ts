import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertOC2Target, resolveOC2Roots } from '../../src/cli/oc2-paths';

describe('OpenCode 2 root resolution', () => {
  let home: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'kiki-oc2-paths-'));
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  const defaultConfig = () => join(home, '.config', 'opencode');

  it('resolves_all_four_roots', () => {
    expect(resolveOC2Roots({}, home)).toEqual({
      config: join(home, '.config', 'opencode'),
      data: join(home, '.local', 'share', 'opencode'),
      cache: join(home, '.cache', 'opencode'),
      state: join(home, '.local', 'state', 'opencode'),
    });

    expect(resolveOC2Roots({
      XDG_CONFIG_HOME: join(home, 'cfg'),
      XDG_DATA_HOME: join(home, 'data'),
      XDG_CACHE_HOME: join(home, 'cache'),
      XDG_STATE_HOME: join(home, 'state'),
    }, home)).toEqual({
      config: join(home, 'cfg', 'opencode'),
      data: join(home, 'data', 'opencode'),
      cache: join(home, 'cache', 'opencode'),
      state: join(home, 'state', 'opencode'),
    });

    // OPENCODE_CONFIG_DIR must override the config root only.
    expect(resolveOC2Roots({
      OPENCODE_CONFIG_DIR: join(home, 'iso', 'config', 'opencode'),
      XDG_CONFIG_HOME: join(home, 'cfg'),
      XDG_DATA_HOME: join(home, 'data'),
      XDG_CACHE_HOME: join(home, 'cache'),
      XDG_STATE_HOME: join(home, 'state'),
    }, home)).toEqual({
      config: join(home, 'iso', 'config', 'opencode'),
      data: join(home, 'data', 'opencode'),
      cache: join(home, 'cache', 'opencode'),
      state: join(home, 'state', 'opencode'),
    });
  });

  it('accepts an empty machine default', () => {
    expect(() => assertOC2Target(resolveOC2Roots({}, home))).not.toThrow();
    mkdirSync(defaultConfig(), { recursive: true });
    expect(() => assertOC2Target(resolveOC2Roots({}, home))).not.toThrow();
  });

  it('canonicalizes_nearest_existing_parent_for_absent_destinations', () => {
    mkdirSync(join(home, 'real'), { recursive: true });
    symlinkSync(join(home, 'real'), join(home, 'link'), 'dir');
    const roots = {
      config: join(home, 'link', 'absent'),
      data: join(home, 'real', 'absent'),
      cache: join(home, 'cache'),
      state: join(home, 'state'),
    };
    expect(() => assertOC2Target(roots)).toThrow(/overlap|same|nested|inside/i);
  });

  it('rejects_overlapping_or_nested_roots', () => {
    const base = join(home, '.opencode2');
    expect(() => assertOC2Target({
      config: base,
      data: base,
      cache: base,
      state: base,
    })).toThrow(/overlap|same|nested|inside/i);

    expect(() => assertOC2Target({
      config: join(base, 'config'),
      data: base,
      cache: join(base, 'cache'),
      state: join(base, 'state'),
    })).toThrow(/overlap|same|nested|inside/i);
  });

  it('accepts fully isolated roots', () => {
    const isolated = join(home, '.opencode2');
    expect(() => assertOC2Target({
      config: join(isolated, 'config', 'opencode'),
      data: join(isolated, 'data', 'opencode'),
      cache: join(isolated, 'cache', 'opencode'),
      state: join(isolated, 'state', 'opencode'),
    })).not.toThrow();
  });
});
