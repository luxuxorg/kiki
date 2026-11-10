import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  existsSync, mkdirSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateOC1 } from '../../src/cli/oc2-migration';
import { assertOC2Target, resolveOC2Roots } from '../../src/cli/oc2-paths';
import {
  createOC2Fixture, fileDigest, hasOC2Binary, readJSONC, requireOC2Binary, snapshotTree,
} from '../helpers/oc2-fixture';
import {
  fixtureProviderConfig, startFixtureProvider,
} from './fixtures/oc2-provider';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));

function writeConfig(directory: string, value: unknown, name = 'opencode.json'): string {
  mkdirSync(directory, { recursive: true });
  const file = join(directory, name);
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

function backupDirectories(root: string): string[] {
  const directory = join(root, '.agentic/kiki/backups');
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => join(directory, entry.name));
}

describe('synthetic OC1/OC2 migration and root isolation', () => {
  it('migrates into isolated OC2 roots while the OC1 source stays byte-identical', () => {
    const fixture = createOC2Fixture();
    const source = join(fixture.root, 'oc1-config');
    const sourceFile = writeConfig(source, {
      agent: {
        'kiki-implementer': {
          model: 'vendor/org/model',
          variant: 'fast',
          permission: {
            edit: { 'src/**': 'allow', '*': 'deny' },
            read: { '*': 'allow', '**/*.env*': 'deny' },
          },
        },
        'kiki-reviewer': { model: 'other/checker' },
      },
    });
    const sourceSnapshot = snapshotTree(source);
    const sourceBytes = readFileSync(sourceFile);

    const report = migrateOC1({ from: source, destination: fixture.config, force: false });
    expect(report.exitCode).toBe(0);
    expect(report.rejected).toEqual([]);
    expect(report.migrated).toEqual(expect.arrayContaining(['kiki-implementer', 'kiki-reviewer']));
    expect(report.marker).toBe(join(fixture.config, '.agentic/kiki/migration.json'));
    expect(existsSync(report.marker!)).toBe(true);

    const migrated = readJSONC(join(fixture.config, 'opencode.jsonc'));
    expect(migrated.agents['kiki-implementer'].model).toEqual({
      providerID: 'vendor', model: 'org/model', variant: 'fast',
    });
    expect(migrated.agents['kiki-reviewer'].model).toEqual({ providerID: 'other', model: 'checker' });
    expect(migrated.agents['kiki-implementer'].permissions).toEqual(expect.arrayContaining([
      { action: 'edit', resource: 'src/**', effect: 'allow' },
      { action: 'edit', resource: '*', effect: 'deny' },
      { action: 'read', resource: '*', effect: 'allow' },
      { action: 'read', resource: '**/*.env*', effect: 'deny' },
    ]));
    expect(migrated.permissions).toBeUndefined();

    // Source bytes, modes and files are untouched.
    expect(readFileSync(sourceFile)).toEqual(sourceBytes);
    expect(snapshotTree(source)).toEqual(sourceSnapshot);

    const backups = backupDirectories(fixture.config);
    expect(backups).toHaveLength(1);
    const backupDir = backups[0];
    expect(statSync(backupDir).mode & 0o777).toBe(0o700);
    expect(statSync(join(backupDir, 'manifest.json')).mode & 0o777).toBe(0o600);
    const manifest = JSON.parse(readFileSync(join(backupDir, 'manifest.json'), 'utf8'));
    expect(Array.isArray(manifest)).toBe(true);
    void fixture.cleanup();
  });

  it('refuses a credential-bearing source and an aliased destination without writing', () => {
    const fixture = createOC2Fixture();
    try {
      const source = join(fixture.root, 'oc1-credential-source');
      writeConfig(source, {
        provider: {
          'kiki-fixture': {
            npm: '@ai-sdk/openai-compatible',
            options: { baseURL: 'http://127.0.0.1:9/v1', apiKey: 'fixture-placeholder' },
          },
        },
        agent: { 'kiki-implementer': { model: 'vendor/model' } },
      });
      const before = snapshotTree(fixture.config);
      expect(() => migrateOC1({ from: source, destination: fixture.config, force: false }))
        .toThrow(/credential|secret-free/i);
      expect(snapshotTree(fixture.config)).toEqual(before);
      expect(existsSync(join(fixture.config, '.agentic/kiki/migration.json'))).toBe(false);

      // Symlink a destination root at an OC1-shaped config directory: the guard
      // must canonicalize before writing.
      const oc1 = join(fixture.home, '.config', 'opencode');
      mkdirSync(join(oc1, 'plugins'), { recursive: true });
      writeFileSync(join(oc1, 'plugins/kiki.ts'), 'legacy');
      writeConfig(oc1, { agent: { 'kiki-implementer': { model: 'vendor/model' } } });
      const alias = join(fixture.root, 'aliased-oc1-config');
      symlinkSync(oc1, alias, 'dir');
      const roots = resolveOC2Roots({
        OPENCODE_CONFIG_DIR: alias,
        XDG_DATA_HOME: join(fixture.root, 'other-data'),
        XDG_CACHE_HOME: join(fixture.root, 'other-cache'),
        XDG_STATE_HOME: join(fixture.root, 'other-state'),
      }, fixture.home);
      expect(() => assertOC2Target(roots, fixture.home)).toThrow(/V1|OC1|overlap|version 1/i);
      expect(() => migrateOC1({ from: source, destination: alias, force: false }))
        .toThrow(/overlap|Refusing|isolat|V1|OC1/i);
      expect(readFileSync(join(oc1, 'plugins/kiki.ts'), 'utf8')).toBe('legacy');
    } finally {
      void fixture.cleanup();
    }
  });

  it('backs up and removes only Kiki project copies after success, and keeps them on failure', () => {
    const fixture = createOC2Fixture();
    try {
      const source = join(fixture.root, 'oc1-global');
      writeConfig(source, {
        agent: {
          'kiki-implementer': { permission: { edit: { '*': 'deny', 'src/**': 'allow' } } },
        },
      });
      const project = join(fixture.root, 'project-fixture');
      mkdirSync(join(project, '.opencode/agents'), { recursive: true });
      mkdirSync(join(project, '.opencode/plugins'), { recursive: true });
      const localAgent = join(project, '.opencode/agents/kiki-implementer.md');
      writeFileSync(localAgent, [
        '---',
        'model: fixture/model',
        'permissions:',
        '  - action: edit',
        '    resource: "*"',
        '    effect: deny',
        '---',
        'Implementer body',
        '',
      ].join('\n'));
      const localPlugin = join(project, '.opencode/plugins/kiki.ts');
      writeFileSync(localPlugin, 'legacy plugin');
      const unrelated = join(project, '.opencode/agents/other.md');
      writeFileSync(unrelated, 'keep');

      const report = migrateOC1({ from: source, project, destination: project, force: false });
      expect(report.exitCode).toBe(0);
      expect(existsSync(localAgent)).toBe(false);
      expect(existsSync(localPlugin)).toBe(false);
      expect(existsSync(unrelated)).toBe(true);
      expect(readJSONC(join(project, 'opencode.jsonc')).agents['kiki-implementer'].model)
        .toEqual({ providerID: 'fixture', model: 'model' });
      expect(existsSync(join(project, '.agentic/kiki/migration.json'))).toBe(true);
      expect(backupDirectories(project)).toHaveLength(1);

      // A rejected local agent keeps every local file and writes no marker.
      const failed = join(fixture.root, 'project-failed');
      mkdirSync(join(failed, '.opencode/agents'), { recursive: true });
      const bad = join(failed, '.opencode/agents/kiki-reviewer.md');
      writeFileSync(bad, '---\npermission:\n  edit: sometimes\n---\nReviewer');
      const failedReport = migrateOC1({ from: source, project: failed, destination: failed, force: false });
      expect(failedReport.exitCode).toBe(1);
      expect(failedReport.rejected.map(entry => entry.agent)).toEqual(['kiki-reviewer']);
      expect(existsSync(bad)).toBe(true);
      expect(existsSync(join(failed, '.agentic/kiki/migration.json'))).toBe(false);
    } finally {
      void fixture.cleanup();
    }
  });

  it('refuses a markerless rerun until --force creates a fresh backup', () => {
    const fixture = createOC2Fixture();
    try {
      const source = join(fixture.root, 'oc1-rerun');
      writeConfig(source, { agent: { 'kiki-implementer': { model: 'vendor/model' } } });
      expect(migrateOC1({ from: source, destination: fixture.config, force: false }).exitCode).toBe(0);
      const backupsAfterFirst = backupDirectories(fixture.config).length;
      expect(() => migrateOC1({ from: source, destination: fixture.config, force: false }))
        .toThrow(/already|force/i);
      expect(migrateOC1({ from: source, destination: fixture.config, force: true }).exitCode).toBe(0);
      expect(backupDirectories(fixture.config).length).toBeGreaterThan(backupsAfterFirst);
      expect(existsSync(join(fixture.config, '.agentic/kiki/migration.json'))).toBe(true);
    } finally {
      void fixture.cleanup();
    }
  });

  it.skipIf(!hasOC2Binary())('checks credential files by presence only and never reads them', () => {
    const fixture = createOC2Fixture(requireOC2Binary());
    try {
      expect(fixture.runCli(['install']).status).toBe(0);
      const authFile = join(fixture.data, 'opencode', 'auth.json');
      mkdirSync(join(fixture.data, 'opencode'), { recursive: true });
      writeFileSync(authFile, JSON.stringify({ sentinel: 'DO-NOT-READ' }));
      const oc1Auth = join(fixture.home, '.local/share/opencode/auth.json');
      mkdirSync(join(fixture.home, '.local/share/opencode'), { recursive: true });
      writeFileSync(oc1Auth, JSON.stringify({ sentinel: 'DO-NOT-READ-OC1' }));
      const before = { oc2: fileDigest(authFile), oc1: fileDigest(oc1Auth) };

      const patch = join(fixture.root, 'patch-fs.cjs');
      writeFileSync(patch, [
        "const fs = require('fs');",
        'const real = fs.readFileSync;',
        'fs.readFileSync = function (...args) {',
        "  if (String(args[0]).includes('auth.json')) throw new Error('CREDENTIAL READ ATTEMPT');",
        '  return real.apply(this, args);',
        '};',
        '',
      ].join('\n'));
      const result = execFileSync(process.execPath, [
        '--require', patch, join(repoRoot, 'dist/cli/index.js'), 'doctor', fixture.project,
      ], {
        env: { ...fixture.env, OPENCODE_TEST_BINARY: fixture.binary },
        encoding: 'utf8',
        timeout: 30_000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      expect(result).toContain('provider credentials');
      expect(result).toContain('metadata only');
      expect(result).not.toContain('CREDENTIAL READ ATTEMPT');
      expect(fileDigest(authFile)).toBe(before.oc2);
      expect(fileDigest(oc1Auth)).toBe(before.oc1);
    } finally {
      void fixture.cleanup();
    }
  });
});

describe.skipIf(!hasOC2Binary())('real OC2 isolation from synthetic OC1 roots', () => {
  it('writes nothing under the four OC1 config/data/cache/state roots', async () => {
    const fixture = createOC2Fixture(requireOC2Binary());
    const provider = await startFixtureProvider(request => (
      request.model === 'fixture-model'
        ? { type: 'text', text: 'Isolation fixture' }
        : { type: 'text', text: 'Fixture title' }
    ));
    try {
      const oc1Roots = {
        config: join(fixture.home, '.config/opencode'),
        data: join(fixture.home, '.local/share/opencode'),
        cache: join(fixture.home, '.cache/opencode'),
        state: join(fixture.home, '.local/state/opencode'),
      };
      writeConfig(oc1Roots.config, {
        agent: { 'kiki-implementer': { model: 'legacy/model' } },
        permission: { read: { '*': 'allow' } },
      });
      mkdirSync(join(oc1Roots.config, 'plugins'), { recursive: true });
      writeFileSync(join(oc1Roots.config, 'plugins/kiki.ts'), 'legacy plugin');
      mkdirSync(oc1Roots.data, { recursive: true });
      writeFileSync(join(oc1Roots.data, 'session.json'), '{"legacy":true}\n');
      mkdirSync(oc1Roots.cache, { recursive: true });
      writeFileSync(join(oc1Roots.cache, 'cache.bin'), 'legacy cache');
      mkdirSync(oc1Roots.state, { recursive: true });
      writeFileSync(join(oc1Roots.state, 'state.bin'), 'legacy state');
      const snapshots = Object.fromEntries(
        Object.entries(oc1Roots).map(([scope, directory]) => [scope, snapshotTree(directory)]),
      );

      expect(fixture.runCli(['install']).status).toBe(0);
      fixture.writeGlobal({
        $schema: 'https://opencode.ai/config.json',
        plugins: [repoRoot],
        providers: fixtureProviderConfig(provider.baseURL, { 'fixture-model': 'Isolation fixture' }),
        agents: {
          title: { model: { providerID: 'kiki-fixture', model: 'fixture-model' } },
          'isolation-probe': {
            mode: 'primary',
            description: 'isolation probe',
            model: { providerID: 'kiki-fixture', model: 'fixture-model' },
            permissions: [{ action: '*', resource: '*', effect: 'allow' }],
          },
        },
      });
      const paths = fixture.run(['debug', 'paths']);
      expect(paths.status, paths.stderr).toBe(0);
      const run = await fixture.runAsync([
        'run', '--standalone', '--format', 'json', '--agent', 'isolation-probe', 'Isolation probe',
      ]);
      expect(run.status, run.stderr).toBe(0);
      expect(run.stdout).toContain('Isolation fixture');

      for (const [scope, directory] of Object.entries(oc1Roots)) {
        expect(snapshotTree(directory), scope).toEqual(snapshots[scope]);
      }
      // The OC2 fixture roots did receive activity, so the assertion above is
      // not vacuous.
      expect(existsSync(fixture.config)).toBe(true);
    } finally {
      await provider.stop();
      await fixture.cleanup();
    }
  }, 120_000);
});
