import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  existsSync, mkdirSync, writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createOC2Fixture, fileDigest, hasOC2Binary, requireOC2Binary, snapshotTree,
} from '../helpers/oc2-fixture';
import {
  fixtureProviderConfig, startFixtureProvider,
} from './fixtures/oc2-provider';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));

describe('OC2 credential metadata handling', () => {
  it.skipIf(!hasOC2Binary())('checks credential files by presence only and never reads them', () => {
    const fixture = createOC2Fixture(requireOC2Binary());
    try {
      expect(fixture.runCli(['install']).status).toBe(0);
      const authFile = join(fixture.data, 'opencode', 'auth.json');
      mkdirSync(join(fixture.data, 'opencode'), { recursive: true });
      writeFileSync(authFile, JSON.stringify({ sentinel: 'DO-NOT-READ' }));
      const before = fileDigest(authFile);

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
      expect(fileDigest(authFile)).toBe(before);
    } finally {
      void fixture.cleanup();
    }
  });
});

describe.skipIf(!hasOC2Binary())('real OC2 activity stays isolated from the default XDG locations', () => {
  it('writes nothing under the default config/data/cache/state locations', async () => {
    const fixture = createOC2Fixture(requireOC2Binary());
    const provider = await startFixtureProvider(request => (
      request.model === 'fixture-model'
        ? { type: 'text', text: 'Isolation fixture' }
        : { type: 'text', text: 'Fixture title' }
    ));
    try {
      const defaultRoots = {
        config: join(fixture.home, '.config/opencode'),
        data: join(fixture.home, '.local/share/opencode'),
        cache: join(fixture.home, '.cache/opencode'),
        state: join(fixture.home, '.local/state/opencode'),
      };
      for (const [scope, directory] of Object.entries(defaultRoots)) {
        mkdirSync(directory, { recursive: true });
        writeFileSync(join(directory, `sentinel-${scope}.txt`), `default ${scope}\n`);
      }
      const snapshots = Object.fromEntries(
        Object.entries(defaultRoots).map(([scope, directory]) => [scope, snapshotTree(directory)]),
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

      for (const [scope, directory] of Object.entries(defaultRoots)) {
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
