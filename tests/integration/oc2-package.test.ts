import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Host } from '@opencode/plugin/host';
import {
  createOC2Fixture, hasOC2Binary, requireOC2Binary,
} from '../helpers/oc2-fixture';
import {
  fixtureProviderConfig, startFixtureProvider,
} from './fixtures/oc2-provider';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const artifactsRoot = process.env.KIKI_OC2_ARTIFACTS_DIR
  ? resolve(process.env.KIKI_OC2_ARTIFACTS_DIR)
  : mkdtempSync(join(tmpdir(), 'kiki-oc2-artifacts-'));

interface PackedConsumer {
  root: string;
  consumer: string;
  packageDir: string;
  tarball: string;
  tarballSha256: string;
  files: string[];
}

let packed: PackedConsumer;

function sanitizedNpmEnv(root: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    HOME: join(root, 'home'),
    LANG: 'C.UTF-8',
    TMPDIR: join(root, 'tmp'),
    XDG_CONFIG_HOME: join(root, 'xdg-config'),
    XDG_DATA_HOME: join(root, 'xdg-data'),
    XDG_CACHE_HOME: join(root, 'xdg-cache'),
    XDG_STATE_HOME: join(root, 'xdg-state'),
    npm_config_userconfig: join(root, 'npmrc'),
    npm_config_globalconfig: join(root, 'npm-globalrc'),
    npm_config_cache: join(root, 'npm-cache'),
    npm_config_ignore_scripts: 'true',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_update_notifier: 'false',
    npm_config_offline: 'false',
  };
}

function runNpm(args: string[], cwd: string, env: NodeJS.ProcessEnv): { stdout: string; stderr: string; status: number } {
  const result = spawnSync('npm', args, {
    cwd,
    env,
    encoding: 'utf8',
    timeout: 300_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  return {
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
    status: result.status ?? 1,
  };
}

function distManifest(directory: string): Array<{ path: string; sha256: string; size: number }> {
  const result: Array<{ path: string; sha256: string; size: number }> = [];
  const walk = (current: string): void => {
    for (const name of readdirSync(current).sort()) {
      const file = join(current, name);
      const stat = statSync(file);
      if (stat.isDirectory()) {
        walk(file);
        continue;
      }
      result.push({
        path: file.slice(directory.length + 1),
        sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
        size: stat.size,
      });
    }
  };
  walk(directory);
  return result;
}

beforeAll(() => {
  mkdirSync(artifactsRoot, { recursive: true });
  const root = mkdtempSync(join(tmpdir(), 'kiki-oc2-package-'));
  for (const directory of [
    'home', 'tmp', 'xdg-config', 'xdg-data', 'xdg-cache', 'xdg-state', 'npm-cache',
  ]) {
    mkdirSync(join(root, directory), { recursive: true });
  }
  // A synthetic, empty npm configuration: the user's npm config is never read.
  writeFileSync(join(root, 'npmrc'), 'fund=false\naudit=false\nupdate-notifier=false\nignore-scripts=true\n');
  writeFileSync(join(root, 'npm-globalrc'), '');
  const env = sanitizedNpmEnv(root);
  const pack = runNpm(
    ['pack', '--ignore-scripts', '--pack-destination', artifactsRoot],
    repoRoot,
    env,
  );
  if (pack.status !== 0) throw new Error(`npm pack failed: ${pack.stderr || pack.stdout}`);
  const name = pack.stdout.trim().split(/\r?\n/).filter(Boolean).pop()!;
  const tarball = resolve(artifactsRoot, name);
  const tarballSha256 = createHash('sha256').update(readFileSync(tarball)).digest('hex');
  const files = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);

  const consumer = join(root, 'consumer');
  mkdirSync(consumer, { recursive: true });
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({
    name: 'kiki-oc2-consumer', private: true, version: '0.0.0',
  }, null, 2));
  const install = runNpm(
    ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline', tarball],
    consumer,
    env,
  );
  if (install.status !== 0) throw new Error(`npm install failed: ${install.stderr || install.stdout}`);

  const packageDir = join(consumer, 'node_modules', 'kiki');
  const manifest = {
    generatedAt: new Date().toISOString(),
    repository: repoRoot,
    tarball,
    tarballSha256,
    files,
    dist: distManifest(join(repoRoot, 'dist')),
    packageVersion: JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')).version,
    sdkVersion: JSON.parse(readFileSync(
      join(consumer, 'node_modules', '@opencode', 'plugin', 'package.json'), 'utf8',
    )).version,
  };
  writeFileSync(join(artifactsRoot, 'pack-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  packed = { root, consumer, packageDir, tarball, tarballSha256, files };
}, 300_000);

afterAll(() => {
  if (packed) rmSync(packed.root, { recursive: true, force: true });
});

describe('packed V3 consumer', () => {
  it('packs every V3 entrypoint and installs only production dependencies', () => {
    expect(packed.files).toContain('package/package.json');
    expect(packed.files).toContain('package/dist/server/index.js');
    expect(packed.files).toContain('package/dist/server/index.d.ts');
    expect(packed.files).toContain('package/dist/tui/index.js');
    expect(packed.files).toContain('package/dist/cli/index.js');
    expect(packed.files.some(file => file.includes('/tests/'))).toBe(false);
    expect(packed.files.some(file => file.includes('.agentic/'))).toBe(false);
    expect(packed.tarballSha256).toMatch(/^[a-f0-9]{64}$/);

    const installed = JSON.parse(readFileSync(join(packed.packageDir, 'package.json'), 'utf8'));
    expect(installed.version).toBe('3.0.0');
    expect(installed.dependencies['@opencode/plugin']).toBe('2.2.6');
    // Dev dependencies remain declared in the manifest but are not installed
    // into the production-only consumer.
    expect(existsSync(join(packed.consumer, 'node_modules', '@opencode', 'plugin'))).toBe(true);
    expect(existsSync(join(packed.consumer, 'node_modules', 'vitest'))).toBe(false);
    expect(existsSync(join(packed.consumer, 'node_modules', 'typescript'))).toBe(false);
    // Production dependencies are hoisted into the consumer, never borrowed
    // from the checkout's node_modules.
    expect(existsSync(join(packed.packageDir, 'node_modules'))).toBe(false);
  });

  it('resolves packed server imports and Host entrypoints without checkout node_modules', () => {
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
      HOME: join(packed.root, 'home'),
      LANG: 'C.UTF-8',
      TMPDIR: join(packed.root, 'tmp'),
    };
    const script = [
      "import { Host } from '@opencode/plugin/host';",
      "const server = await import('kiki/server');",
      `const entrypoints = Host.resolve({ directory: ${JSON.stringify(packed.packageDir)} });`,
      "console.log(JSON.stringify({ id: server.default.id, setup: typeof server.default.setup, ...entrypoints }));",
    ].join('\n');
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
      cwd: packed.consumer,
      env,
      encoding: 'utf8',
      timeout: 30_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(result.status, result.stderr).toBe(0);
    const resolved = JSON.parse(result.stdout);
    expect(resolved.id).toBe('kiki');
    expect(resolved.setup).toBe('function');
    expect(resolved.server).toMatch(/node_modules\/kiki\/dist\/server\/index\.js$/);
    expect(resolved.tui).toMatch(/node_modules\/kiki\/dist\/tui\/index\.js$/);
  });

  it('resolves the development absolute-directory registration through the real Host', () => {
    const entrypoints = Host.resolve({ directory: repoRoot });
    expect(entrypoints.server).toMatch(/dist\/server\/index\.js$/);
    expect(entrypoints.tui).toMatch(/dist\/tui\/index\.js$/);
    expect(existsSync(join(repoRoot, 'dist', 'server', 'index.js'))).toBe(true);
    expect(existsSync(join(repoRoot, 'dist', 'tui', 'index.js'))).toBe(true);
  });
});

describe.skipIf(!hasOC2Binary())('real OC2 loads the packed package', () => {
  it('runs a fixture agent with the packed server plugin from the disposable consumer', async () => {
    const binary = requireOC2Binary();
    const fixture = createOC2Fixture(binary);
    const provider = await startFixtureProvider(request => (
      request.model === 'fixture-model'
        ? { type: 'text', text: 'Packed package running' }
        : { type: 'text', text: 'Fixture title' }
    ));
    try {
      fixture.writeGlobal({
        $schema: 'https://opencode.ai/config.json',
        plugins: [packed.packageDir],
        providers: fixtureProviderConfig(provider.baseURL, { 'fixture-model': 'Packed fixture' }),
        agents: {
          title: { model: { providerID: 'kiki-fixture', model: 'fixture-model' } },
          'packed-probe': {
            mode: 'primary',
            description: 'packed consumer probe',
            model: { providerID: 'kiki-fixture', model: 'fixture-model' },
            permissions: [{ action: '*', resource: '*', effect: 'allow' }],
          },
        },
      });
      const result = await fixture.runAsync([
        'run', '--standalone', '--format', 'json', '--agent', 'packed-probe', 'Packed probe',
      ]);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('Packed package running');
      expect(provider.requestsFor('fixture-model')).toBeGreaterThan(0);
    } finally {
      await provider.stop();
      await fixture.cleanup();
    }
  }, 120_000);
});
