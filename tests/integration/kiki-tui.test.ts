import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'jsonc-parser';
import { Host } from '@opencode/plugin/host';
import {
  createOC2Fixture, hasOC2Binary, requireOC2Binary,
} from '../helpers/oc2-fixture';

describe('packaged Kiki 3 V2 TUI registration', () => {
  it('resolves the built server and TUI entrypoints through the pinned SDK host', () => {
    const entrypoints = Host.resolve({ directory: resolve('.') });
    expect(entrypoints.server).toBe(pathToFileURL(resolve('dist/server/index.js')).href);
    expect(entrypoints.tui).toBe(pathToFileURL(resolve('dist/tui/index.js')).href);
    expect(existsSync(resolve('dist/server/index.js'))).toBe(true);
    expect(existsSync(resolve('dist/tui/index.js'))).toBe(true);
  });

  it('installs the package server and cli.json TUI registration without a V1 loader', () => {
    const fixture = createOC2Fixture();
    try {
      const global = fixture.config;
      const globalFile = join(global, 'opencode.jsonc');
      writeFileSync(globalFile, '// keep-global-comment\n'
        + '{"$schema":"https://opencode.ai/config.json","plugins":["user-plugin"]}\n');

      const installed = fixture.runCli(['install']);
      expect(installed.status, installed.stderr).toBe(0);

      const globalText = readFileSync(globalFile, 'utf8');
      expect(globalText).toContain('keep-global-comment');
      const server = parse(globalText);
      expect(server.plugins).toEqual(['user-plugin', resolve('.')]);
      const cli = parse(readFileSync(join(global, 'cli.json'), 'utf8'));
      expect(cli.plugins).toEqual([resolve('.')]);

      const agents = readdirSync(join(global, 'agents')).filter(name => /^kiki-.*\.md$/.test(name));
      expect(agents).toHaveLength(8);
      expect(existsSync(join(global, 'kiki/tui.js'))).toBe(false);
      expect(existsSync(join(global, 'plugins/kiki.ts'))).toBe(false);
      expect(existsSync(join(global, 'tui.json'))).toBe(false);
      expect(existsSync(join(fixture.project, 'opencode.jsonc'))).toBe(false);
    } finally {
      void fixture.cleanup();
    }
  });
});

describe.skipIf(!hasOC2Binary())('real packaged /kiki TUI', () => {
  it('saves, retains and removes native model overrides through the packaged V2 /kiki menu without provider requests', async () => {
    const binary = requireOC2Binary();
    const fixture = createOC2Fixture(binary);
    const requests = { count: 0 };
    const provider = createServer((_request, response) => {
      requests.count += 1;
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end('{"error":"fixture must not be called"}');
    });
    let serviceStarted = false;
    try {
      const global = fixture.config;
      const project = fixture.project;
      await new Promise<void>(done => provider.listen(0, '127.0.0.1', done));
      const address = provider.address();
      if (!address || typeof address === 'string') throw new Error('Fixture provider did not bind');
      const baseURL = `http://127.0.0.1:${address.port}/v1`;

      const globalFile = join(global, 'opencode.jsonc');
      writeFileSync(globalFile, '// keep-global-comment\n' + JSON.stringify({
        $schema: 'https://opencode.ai/config.json',
        providers: {
          'kiki-fixture': {
            package: '@ai-sdk/openai-compatible',
            name: 'Kiki fixture',
            settings: { baseURL, apiKey: 'fixture-placeholder' },
            models: {
              'fixture-model': {
                name: 'Kiki Fixture Model',
                limit: { context: 16000, output: 2000 },
              },
            },
          },
        },
      }, null, 2) + '\n');
      const projectFile = join(project, 'opencode.jsonc');
      writeFileSync(projectFile, '// keep-project-comment\n' + JSON.stringify({
        $schema: 'https://opencode.ai/config.json',
        agents: {
          'kiki-reviewer': { model: { providerID: 'kiki-fixture', model: 'fixture-model' } },
          'kiki-planner': { model: { providerID: 'kiki-fixture', model: 'fixture-model' } },
        },
      }, null, 2) + '\n');

      const installed = fixture.runCli(['install']);
      expect(installed.status, installed.stderr).toBe(0);
      serviceStarted = true;
      const output = await new Promise<string>((resolveOutput, reject) => {
        const child = spawn('python3', [
          resolve('tests/integration/fixtures/kiki-tui-smoke.py'), binary, project,
        ], {
          cwd: project, env: fixture.env, stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => child.kill('SIGKILL'), 120_000);
        child.stdout.on('data', chunk => { stdout += String(chunk); });
        child.stderr.on('data', chunk => { stderr += String(chunk); });
        child.on('error', error => {
          clearTimeout(timer);
          reject(error);
        });
        child.on('close', status => {
          clearTimeout(timer);
          if (status === 0) resolveOutput(stdout);
          else reject(new Error(`PTY fixture failed (${status}): ${stdout}\n${stderr}`));
        });
      });
      expect(output).toContain('PASS: /kiki global save');
      expect(output).toContain('PASS: /kiki project override removal');
      expect(output).toContain('PASS: /kiki remove-all confirmation');

      const globalText = readFileSync(globalFile, 'utf8');
      const projectText = readFileSync(projectFile, 'utf8');
      expect(globalText).toContain('keep-global-comment');
      expect(projectText).toContain('keep-project-comment');
      const globalConfig = parse(globalText);
      expect(globalConfig.providers['kiki-fixture'].settings.baseURL).toBe(baseURL);
      expect(globalConfig.agents['kiki-reviewer'].model)
        .toEqual({ providerID: 'kiki-fixture', model: 'fixture-model' });
      const projectConfig = parse(projectText);
      expect(projectConfig.agents?.['kiki-reviewer']?.model).toBeUndefined();
      expect(projectConfig.agents?.['kiki-planner']?.model).toBeUndefined();
      expect(requests.count).toBe(0);
    } finally {
      if (serviceStarted) {
        try {
          fixture.run(['service', 'stop'], { timeout: 20_000 });
        } catch {
          // The fixture root is disposable; a stopped service has no state.
        }
      }
      await new Promise<void>(done => provider.close(() => done()));
      await fixture.cleanup();
    }
  }, 150_000);
});
