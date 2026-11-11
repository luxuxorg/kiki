import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Plugin } from '@opencode/plugin';
import { Host } from '@opencode/plugin/host';
import type { Entrypoints, Target } from '@opencode/plugin/host';
import type { Plugin as TuiPlugin } from '@opencode/plugin/tui';
import { KIKI_VERSION } from '../../src/cli/config';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

interface PackageJson {
  version?: string;
  engines?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  exports?: Record<string, { types?: string; import?: string; require?: string }>;
  files?: string[];
}

interface LockPackage {
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface PackageLock {
  version?: string;
  lockfileVersion?: number;
  packages?: Record<string, LockPackage>;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(ROOT, path), 'utf8')) as T;
}

function packageJson(): PackageJson {
  return readJson<PackageJson>('package.json');
}

function packageLock(): PackageLock {
  return readJson<PackageLock>('package-lock.json');
}

const OLD_SDK = '@opencode-ai/plugin';
const SDK = '@opencode/plugin';
const SDK_VERSION = '2.2.6';

// Compile-only examples consumed by the typecheck test below. They are never
// executed; they pin the public SDK shapes downstream tasks must implement
// against. No any, @ts-ignore or hand-written structural stand-ins are used.

export type ServerContext = Plugin.Context;
export type ServerCleanup = Plugin.Cleanup;

export type ServerContextFromDefine = Parameters<typeof Plugin.define>[0]['setup'] extends (
  ctx: infer C,
) => unknown
  ? C
  : never;
export type ServerContextAliasMatches = ServerContextFromDefine extends Plugin.Context
  ? Plugin.Context extends ServerContextFromDefine
    ? true
    : never
  : never;
export const serverContextAliasMatches: ServerContextAliasMatches = true;

export function defineKikiPlugin(): Plugin.Plugin {
  return Plugin.define({
    id: 'kiki',
    setup: async (ctx) => {
      const registration = await ctx.tool.hook('execute.before', (event) => {
        const tool: string = event.tool;
        const sessionID: string = event.sessionID;
        const agent: string = event.agent;
        const input: unknown = event.input;
        void tool;
        void sessionID;
        void agent;
        void input;
      });
      return () => registration.dispose();
    },
  });
}

export async function listChildSessionIDs(context: Plugin.Context): Promise<readonly string[]> {
  const sessions = await context.session.list();
  return sessions.data.filter((session) => session.parentID !== undefined).map((session) => session.id);
}

export async function interruptSession(context: Plugin.Context, sessionID: string): Promise<void> {
  await context.session.interrupt({ sessionID });
}

export async function subscribeSessionActivity(
  context: Plugin.Context,
  signal: AbortSignal,
): Promise<() => Promise<void>> {
  const iterator = context.event
    .subscribe({
      types: [
        'session.created',
        'session.deleted',
        'session.idle',
        'session.status',
        'session.text.delta',
        'session.tool.called',
        'session.tool.progress',
        'session.tool.success',
        'session.tool.failed',
      ] as const,
      signal,
    })
    [Symbol.asyncIterator]();

  const pending = (async () => {
    for (;;) {
      const next = await iterator.next();
      if (next.done === true) return;
      const event = next.value;
      if (event.type === 'session.created') {
        const parentID: string | undefined = event.data.parentID;
        void parentID;
      } else if (event.type === 'session.status') {
        const status: string = event.data.status.type;
        void status;
      } else if (event.type === 'session.idle') {
        const idleSessionID: string = event.data.sessionID;
        void idleSessionID;
      } else if (event.type === 'session.text.delta') {
        const delta: string = event.data.delta;
        void delta;
      } else if (event.type === 'session.tool.called') {
        const calledSessionID: string = event.data.sessionID;
        void calledSessionID;
      }
    }
  })();

  return async () => {
    await iterator.return?.();
    await pending;
  };
}

export async function listSkillSourcePaths(context: Plugin.Context): Promise<readonly string[]> {
  const skills = await context.skill.list();
  return skills.data.map((skill) => skill.path);
}

export function resolveHostEntrypoints(target: Target): Entrypoints {
  return Host.resolve(target);
}

export async function chooseTuiModel(context: TuiPlugin.Context): Promise<string | undefined> {
  return context.ui.dialog.select<string>({
    title: 'Kiki model',
    options: [
      { title: 'openai/gpt-6.1-sol', value: 'openai/gpt-6.1-sol' },
      { title: 'anthropic/claude-sonnet-5-5', value: 'anthropic/claude-sonnet-5-5' },
    ],
  });
}

export function registerTuiMenu(context: TuiPlugin.Context): void {
  context.keymap.layer(() => ({
    commands: [
      {
        id: 'kiki.model',
        title: 'Kiki: model',
        palette: true,
        slash: { name: 'kiki' },
        run: async () => {
          await chooseTuiModel(context);
        },
      },
    ],
  }));
}

describe('package boundary', () => {
  it('declares one Kiki version in package.json and KIKI_VERSION', () => {
    expect(KIKI_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(packageJson().version).toBe(KIKI_VERSION);
  });

  it('pins the published @opencode/plugin 2.2.6 as a runtime dependency', () => {
    const pkg = packageJson();
    expect(pkg.dependencies?.[SDK]).toBe(SDK_VERSION);
    expect(pkg.devDependencies?.[SDK]).toBeUndefined();
  });

  it('removes the retired @opencode-ai/plugin SDK from manifests and the lock graph', () => {
    const pkg = packageJson();
    const lock = packageLock();
    expect(pkg.dependencies?.[OLD_SDK]).toBeUndefined();
    expect(pkg.devDependencies?.[OLD_SDK]).toBeUndefined();
    expect(lock.packages?.['']?.dependencies?.[OLD_SDK]).toBeUndefined();
    expect(lock.packages?.['']?.devDependencies?.[OLD_SDK]).toBeUndefined();
    expect(Object.keys(lock.packages ?? {}).filter((key) => key === `node_modules/${OLD_SDK}`)).toEqual([]);
  });

  it('exports ./server and ./tui from the built dist with declarations', () => {
    const exports = packageJson().exports ?? {};
    expect(exports['./server']).toEqual({
      types: './dist/server/index.d.ts',
      import: './dist/server/index.js',
    });
    expect(exports['./tui']).toEqual({
      types: './dist/tui/index.d.ts',
      import: './dist/tui/index.js',
    });
    expect(exports['.']).toEqual({
      types: './dist/index.d.ts',
      import: './dist/index.js',
      require: './dist/index.js',
    });
    expect(packageJson().files).toContain('dist/');
  });

  it('keeps the Node >=18 runtime floor and existing development ranges', () => {
    const pkg = packageJson();
    expect(pkg.engines?.node).toBe('>=18.0.0');
    expect(pkg.devDependencies?.['@types/node']).toBe('^20.0.0');
    expect(pkg.devDependencies?.eslint).toBe('^9.39.4');
    expect(pkg.devDependencies?.typescript).toBe('^5.4.0');
    expect(pkg.devDependencies?.['typescript-eslint']).toBe('^8.62.0');
    expect(pkg.devDependencies?.vitest).toBe('4.1.0');
  });

  it('synchronizes the lockfile root with the manifest without dropping runtime deps', () => {
    const version = packageJson().version;
    const lock = packageLock();
    const root = lock.packages?.[''] ?? {};
    expect(lock.version).toBe(version);
    expect(lock.lockfileVersion).toBe(3);
    expect(root.version).toBe(version);
    expect(root.dependencies).toEqual({
      '@opencode/plugin': SDK_VERSION,
      'jsonc-parser': '^3.3.1',
      yaml: '^2.9.1',
    });
    expect(lock.packages?.[`node_modules/${SDK}`]?.version).toBe(SDK_VERSION);
    expect(lock.packages?.['node_modules/jsonc-parser']?.version).toBe('3.3.1');
    expect(lock.packages?.['node_modules/yaml']?.version).toBe('2.9.1');
  });

  it('exposes exactly the declared production dependency set', () => {
    expect(Object.keys(packageJson().dependencies ?? {}).sort()).toEqual([
      SDK,
      'jsonc-parser',
      'yaml',
    ]);
  });
});

describe('published SDK contract', () => {
  it('resolves the runtime server, TUI and host entrypoints without development-only SDKs', async () => {
    const server = (await import(SDK)) as {
      Plugin?: { define?: unknown };
    };
    expect(typeof server.Plugin?.define).toBe('function');

    // The TUI entrypoint re-exports Solid host bindings; OC2 provides its optional
    // peer dependencies, so a package consumer must be able to resolve it without
    // executing it in a plain Node process.
    expect(import.meta.resolve(`${SDK}/tui`)).toMatch(
      /@opencode[\\/]plugin[\\/]dist[\\/]tui[\\/]index\.js$/,
    );

    const host = (await import(`${SDK}/host`)) as {
      Host?: { resolve?: unknown };
      resolve?: unknown;
    };
    expect(typeof (host.Host ?? host).resolve).toBe('function');

    expect(import.meta.resolve(SDK)).toMatch(
      /@opencode[\\/]plugin[\\/]dist[\\/]promise[\\/]index\.js$/,
    );
    expect(import.meta.resolve(`${SDK}/host`)).toMatch(
      /@opencode[\\/]plugin[\\/]dist[\\/]host\.js$/,
    );
  });

  it('installs the published SDK version the manifest pins', () => {
    const installed = JSON.parse(
      readFileSync(resolve(ROOT, 'node_modules', '@opencode', 'plugin', 'package.json'), 'utf8'),
    ) as PackageJson & { peerDependenciesMeta?: Record<string, { optional?: boolean }> };
    expect(installed.version).toBe(SDK_VERSION);
    expect(installed.peerDependenciesMeta?.['solid-js']?.optional).toBe(true);
  });
});

describe('typed public API examples', () => {
  it('typechecks the contract examples with the local TypeScript compiler', () => {
    const tsc = resolve(ROOT, 'node_modules/typescript/bin/tsc');
    const args = [
      tsc,
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      '--target',
      'ES2022',
      '--module',
      'ESNext',
      '--moduleResolution',
      'Bundler',
      '--isolatedModules',
      '--types',
      'node',
      fileURLToPath(import.meta.url),
    ];
    try {
      execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: 120_000 });
    } catch (error) {
      const failure = error as { stdout?: string; stderr?: string; message: string };
      throw new Error(
        `SDK contract examples failed to typecheck:\n${failure.stdout ?? ''}${failure.stderr ?? ''}${failure.message}`,
      );
    }
  }, 60_000);
});
