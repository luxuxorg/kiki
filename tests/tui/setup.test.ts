import { afterEach, describe, expect, it, vi } from 'vitest';

// The real @opencode/plugin/tui module eagerly imports its optional host peers
// (solid-js), which only OpenCode itself supplies. Setup only needs define().
vi.mock('@opencode/plugin/tui', () => ({ Plugin: { define: (plugin: unknown) => plugin } }));

import {
  chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Plugin } from '@opencode/plugin/tui';
import { buildModelContext, setup } from '../../src/tui/index';
import { canonicalPath } from '../../src/cli/oc2-paths';

type Location = NonNullable<Plugin.Context['location']>;
type Layer = ReturnType<Parameters<Plugin.Context['keymap']['layer']>[0]>;
type LayerFactory = Parameters<Plugin.Context['keymap']['layer']>[0];
type Command = NonNullable<Layer['commands']>[number];
type SelectOptions = Parameters<Plugin.Context['ui']['dialog']['select']>[0];
type ToastOptions = Parameters<Plugin.Context['ui']['toast']['show']>[0];

const SETUP_ERROR = 'Kiki konnte nicht gestartet werden: OpenCode-2-Konfiguration ist überlappend, ungültig oder nicht beschreibbar. Konfiguration und Zugriffsrechte prüfen.';
const LOADING = 'OpenCode lädt noch. /kiki gleich erneut öffnen.';

interface Fixture {
  root: string;
  config: string;
  data: string;
  project: string;
  env: NodeJS.ProcessEnv;
}

function isolate(overrides: NodeJS.ProcessEnv = {}): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'kiki-tui-setup-'));
  const config = join(root, 'config', 'opencode');
  const data = join(root, 'data');
  const project = join(root, 'project');
  mkdirSync(config, { recursive: true });
  mkdirSync(project);
  const env: NodeJS.ProcessEnv = {
    HOME: root,
    XDG_CONFIG_HOME: join(root, 'config'),
    XDG_DATA_HOME: data,
    XDG_CACHE_HOME: join(root, 'cache'),
    XDG_STATE_HOME: join(root, 'state'),
    ...overrides,
  };
  return { root, config, data, project, env };
}

function context(options: { location?: Location | null } = {}) {
  const location = options.location === null
    ? undefined
    : options.location ?? ({ directory: '/fixture/project' } as unknown as Location);
  let factory: LayerFactory | undefined;
  const layer = vi.fn((create: LayerFactory) => { factory = create; });
  const toast = vi.fn((_options: ToastOptions) => {});
  const select = vi.fn((_options: SelectOptions): Promise<string | undefined> => Promise.resolve(undefined));
  const client = new Proxy({}, {
    get() { throw new Error('No LLM/client requests during TUI setup'); },
  }) as Plugin.Context['client'];
  const chatModel = new Proxy({}, {
    get() { throw new Error('No active-chat model changes during TUI setup'); },
  }) as Plugin.Context['ui']['model'];
  const ctx = {
    location,
    client,
    data: {
      location: {
        provider: { list: vi.fn(() => []), sync: vi.fn(), invalidate: vi.fn() },
        model: { list: vi.fn(() => []), sync: vi.fn(), invalidate: vi.fn() },
      },
    },
    keymap: { layer },
    ui: {
      dialog: { select, confirm: vi.fn(), clear: vi.fn(), alert: vi.fn(), prompt: vi.fn(), show: vi.fn(), set: vi.fn() },
      toast: { show: toast },
      model: chatModel,
    },
  } as unknown as Plugin.Context;
  return {
    ctx, layer, toast, select,
    get command(): Command {
      if (!factory) throw new Error('No keymap layer was registered');
      const command = factory().commands?.[0];
      if (!command) throw new Error('No command was registered');
      return command;
    },
    get registered(): boolean { return factory !== undefined; },
  };
}

const leftover: string[] = [];
function fixture(overrides: NodeJS.ProcessEnv = {}): Fixture {
  const value = isolate(overrides);
  leftover.push(value.root);
  return value;
}

afterEach(() => {
  while (leftover.length) rmSync(leftover.pop()!, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function snapshot(directory: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isFile()) result[path] = readFileSync(path, 'utf8');
  }
  return result;
}

describe('OpenCode 2 TUI setup', () => {
  it('registers the native /kiki menu for a writable, parseable isolated config', () => {
    const f = fixture();
    const globalConfig = '// keep-global\n{"$schema":"https://opencode.ai/config.json"}\n';
    const projectConfig = '// keep-project\n{}\n';
    writeFileSync(join(f.config, 'opencode.jsonc'), globalConfig);
    writeFileSync(join(f.project, 'opencode.jsonc'), projectConfig);
    const before = { ...snapshot(f.config), ...snapshot(f.project) };
    const c = context({ location: { directory: f.project } as unknown as Location });

    const cleanup = setup(c.ctx, f.env, f.root);

    expect(c.layer).toHaveBeenCalledTimes(1);
    expect(c.command.id).toBe('kiki.menu');
    expect(c.command.palette).toBe(true);
    expect(c.command.slash).toEqual({ name: 'kiki' });
    expect(c.toast).not.toHaveBeenCalled();
    expect(typeof cleanup).toBe('function');
    cleanup?.();
    expect({ ...snapshot(f.config), ...snapshot(f.project) }).toEqual(before);
  });

  it('builds ModelContext from the Task 3 roots and the verified V2 location directory', () => {
    const f = fixture();
    const c = context({ location: { directory: f.project } as unknown as Location });

    expect(buildModelContext(c.ctx, f.env, f.root)).toEqual({
      globalConfigDirectory: canonicalPath(f.config),
      projectDirectory: canonicalPath(f.project),
    });
  });

  it('safely delays an unresolved location instead of registering a failing write flow', async () => {
    const f = fixture();
    const c = context({ location: null });

    const cleanup = setup(c.ctx, f.env, f.root);

    expect(c.layer).toHaveBeenCalledTimes(1);
    expect(c.toast).not.toHaveBeenCalled();
    await c.command.run?.();
    expect(c.select).not.toHaveBeenCalled();
    expect(c.toast).toHaveBeenCalledWith({ variant: 'info', message: LOADING });
    cleanup?.();
  });

  it('refuses overlapping config/data roots with a German error toast and no menu', () => {
    const f = fixture();
    f.env.OPENCODE_CONFIG_DIR = join(f.data, 'opencode');
    const c = context({ location: { directory: f.project } as unknown as Location });

    const cleanup = setup(c.ctx, f.env, f.root);

    expect(c.registered).toBe(false);
    expect(c.toast).toHaveBeenCalledWith({ variant: 'error', message: SETUP_ERROR });
    expect(cleanup).toBeUndefined();
  });

  it('refuses an unwritable config root with a German error toast and no menu', () => {
    const f = fixture();
    chmodSync(f.config, 0o500);
    try {
      const c = context({ location: { directory: f.project } as unknown as Location });
      const cleanup = setup(c.ctx, f.env, f.root);
      expect(c.registered).toBe(false);
      expect(c.toast).toHaveBeenCalledWith({ variant: 'error', message: SETUP_ERROR });
      expect(cleanup).toBeUndefined();
    } finally {
      chmodSync(f.config, 0o700);
    }
  });

  it('refuses a malformed global config with a German error toast and no menu', () => {
    const f = fixture();
    writeFileSync(join(f.config, 'opencode.jsonc'), '{"agents":');
    const c = context({ location: { directory: f.project } as unknown as Location });

    const cleanup = setup(c.ctx, f.env, f.root);

    expect(c.registered).toBe(false);
    expect(c.toast).toHaveBeenCalledWith({ variant: 'error', message: SETUP_ERROR });
    expect(c.toast.mock.calls[0][0].message).not.toContain(f.root);
    expect(cleanup).toBeUndefined();
  });

  it('refuses malformed project config and a project aliasing the config root', () => {
    const malformed = fixture();
    writeFileSync(join(malformed.project, 'opencode.jsonc'), '{"agents":');
    const first = context({ location: { directory: malformed.project } as unknown as Location });
    expect(setup(first.ctx, malformed.env, malformed.root)).toBeUndefined();
    expect(first.registered).toBe(false);
    expect(first.toast).toHaveBeenCalledWith({ variant: 'error', message: SETUP_ERROR });

    const alias = fixture();
    const second = context({ location: { directory: alias.config } as unknown as Location });
    expect(setup(second.ctx, alias.env, alias.root)).toBeUndefined();
    expect(second.registered).toBe(false);
    expect(second.toast).toHaveBeenCalledWith({ variant: 'error', message: SETUP_ERROR });
  });

  it('does not depend on the retired V1 state.path or lifecycle API', () => {
    const f = fixture();
    const c = context({ location: { directory: f.project } as unknown as Location });
    // The fixture intentionally has no `state`, `lifecycle`, `api.state.path.config`
    // or legacy TUI module surface; a successful setup proves they are unused.
    const cleanup = setup(c.ctx, f.env, f.root);
    expect(c.registered).toBe(true);
    expect(typeof cleanup).toBe('function');
    cleanup?.();
  });
});
