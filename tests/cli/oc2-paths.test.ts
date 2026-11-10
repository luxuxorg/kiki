import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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

  it('refuses_oc1_markers_before_writes', () => {
    const config = defaultConfig();
    mkdirSync(join(config, 'plugins'), { recursive: true });
    const marker = join(config, 'plugins', 'kiki.ts');
    writeFileSync(marker, 'const token = "sk-live-secret";\n');
    const before = readFileSync(marker, 'utf8');

    let error: unknown;
    try {
      assertOC2Target(resolveOC2Roots({}, home), home);
    } catch (cause) {
      error = cause;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/V1|OC1|version 1|legacy/i);
    // The guard must not echo configuration values or a stack trace.
    expect((error as Error).message).not.toContain('sk-live-secret');
    expect((error as Error).message).not.toContain(join(home, '.config'));
    expect(readFileSync(marker, 'utf8')).toBe(before);
    expect(readdirSync(config)).toEqual(['plugins']);
  });

  it('refuses_oc1_tui_marker_before_writes', () => {
    const config = defaultConfig();
    mkdirSync(config, { recursive: true });
    writeFileSync(join(config, 'tui.json'), '{"plugin":["./kiki/tui.js"]}\n');
    expect(() => assertOC2Target(resolveOC2Roots({}, home), home)).toThrow(/V1|OC1|version 1|legacy/i);
  });

  it.each(['opencode.json', 'opencode.jsonc'])(
    'refuses_machine_default_config_file_without_file_markers (%s)',
    name => {
      const config = defaultConfig();
      mkdirSync(config, { recursive: true });
      const credential = join(config, name);
      writeFileSync(credential, '{"agent":{"kiki-orchestrator":{"model":"secret/provider"}},"provider":{"token":"sk-live-secret"}}\n');
      const before = readFileSync(credential, 'utf8');

      let error: unknown;
      try {
        assertOC2Target(resolveOC2Roots({}, home), home);
      } catch (cause) {
        error = cause;
      }
      expect(error).toBeInstanceOf(Error);
      // Metadata alone cannot prove the file is Kiki-free, so the guard refuses
      // and asks for a secret-free export instead of parsing it.
      expect((error as Error).message).toMatch(/credential-bearing|secret-free export/i);
      expect((error as Error).message).not.toContain('sk-live-secret');
      expect((error as Error).message).not.toContain('secret/provider');
      expect(readFileSync(credential, 'utf8')).toBe(before);

      // An isolated config root is unaffected by an unverifiable live default.
      const isolated = join(home, '.opencode2');
      expect(() => assertOC2Target({
        config: join(isolated, 'config', 'opencode'),
        data: join(isolated, 'data', 'opencode'),
        cache: join(isolated, 'cache', 'opencode'),
        state: join(isolated, 'state', 'opencode'),
      }, home)).not.toThrow();
    },
  );

  it('accepts_an_empty_machine_default', () => {
    expect(() => assertOC2Target(resolveOC2Roots({}, home), home)).not.toThrow();
    mkdirSync(defaultConfig(), { recursive: true });
    expect(() => assertOC2Target(resolveOC2Roots({}, home), home)).not.toThrow();
  });

  it('rejects_aliases_into_oc1_roots', () => {
    const config = defaultConfig();
    mkdirSync(join(config, 'plugins'), { recursive: true });
    writeFileSync(join(config, 'plugins', 'kiki.ts'), 'legacy\n');

    // OPENCODE_CONFIG_DIR pointing through a directory symlink into the live OC1 root.
    symlinkSync(config, join(home, 'config-alias'), 'dir');
    expect(() => assertOC2Target(
      resolveOC2Roots({ OPENCODE_CONFIG_DIR: join(home, 'config-alias') }, home),
      home,
    )).toThrow(/V1|OC1|version 1|legacy/i);

    // An XDG_CONFIG_HOME whose symlinked ancestor resolves into the live OC1 root.
    symlinkSync(join(home, '.config'), join(home, 'xdg-alias'), 'dir');
    expect(() => assertOC2Target(
      resolveOC2Roots({ XDG_CONFIG_HOME: join(home, 'xdg-alias') }, home),
      home,
    )).toThrow(/V1|OC1|version 1|legacy/i);
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
    expect(() => assertOC2Target(roots, home)).toThrow(/overlap|same|nested|inside/i);
  });

  it('rejects_overlapping_or_nested_roots', () => {
    const base = join(home, '.opencode2');
    expect(() => assertOC2Target({
      config: base,
      data: base,
      cache: base,
      state: base,
    }, home)).toThrow(/overlap|same|nested|inside/i);

    expect(() => assertOC2Target({
      config: join(base, 'config'),
      data: base,
      cache: join(base, 'cache'),
      state: join(base, 'state'),
    }, home)).toThrow(/overlap|same|nested|inside/i);
  });

  it('accepts_fully_isolated_roots_even_when_live_oc1_exists', () => {
    const config = defaultConfig();
    mkdirSync(join(config, 'plugins'), { recursive: true });
    writeFileSync(join(config, 'plugins', 'kiki.ts'), 'legacy\n');

    const isolated = join(home, '.opencode2');
    expect(() => assertOC2Target({
      config: join(isolated, 'config', 'opencode'),
      data: join(isolated, 'data', 'opencode'),
      cache: join(isolated, 'cache', 'opencode'),
      state: join(isolated, 'state', 'opencode'),
    }, home)).not.toThrow();

    expect(() => assertOC2Target(resolveOC2Roots({}, home), home)).toThrow(/V1|OC1|version 1|legacy/i);
  });
});
