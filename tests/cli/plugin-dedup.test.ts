import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generatePluginTemplate, KIKI_VERSION } from '../../src/cli/config';

const OWNERSHIP_KEY = Symbol.for('kiki.plugin');

function tmpPluginFile(scope: 'global' | 'project', version: string, id: string): string {
  const dir = resolve(`tmp/plugin-dedup-${id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `kiki-${scope}-${id}.ts`);
  writeFileSync(filePath, generatePluginTemplate({ scope, version }));
  return filePath;
}

async function loadPlugin(filePath: string): Promise<any> {
  const mod = await import(pathToFileURL(filePath).href);
  return mod.default;
}

describe('plugin dedup behavior', () => {
  let tmpRoots: string[] = [];
  let setIntervalSpy: ReturnType<typeof vi.spyOn>;
  let cwdSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete (globalThis as any)[OWNERSHIP_KEY];
    tmpRoots = [];
    setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockImplementation((() => ({ unref() {} }) as any));
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    setIntervalSpy.mockRestore();
    warnSpy.mockRestore();
    cwdSpy?.mockRestore();
    for (const r of tmpRoots) {
      if (existsSync(r)) rmSync(r, { recursive: true, force: true });
    }
    delete (globalThis as any)[OWNERSHIP_KEY];
  });

  function makeTmpRoot(): string {
    const root = resolve(`tmp/dedup-root-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(root, { recursive: true });
    tmpRoots.push(root);
    return root;
  }

  function fakeClient(): any {
    return {
      app: { log: vi.fn().mockResolvedValue(true) },
      session: { abort: vi.fn(), list: vi.fn().mockResolvedValue([]), messages: vi.fn().mockResolvedValue([]) }
    };
  }

  async function fireTaskHook(pluginFn: any, root: string): Promise<void> {
    const hooks = pluginFn({ client: fakeClient(), directory: root });
    await hooks['tool.execute.before'](
      { tool: 'task' },
      { args: { subagent_type: 'kiki-planner', model: 'test-model' } }
    );
  }

  it('global-only: one owner, one interval, one routing log line', async () => {
    const root = makeTmpRoot();
    const file = tmpPluginFile('global', KIKI_VERSION, 'g1');
    tmpRoots.push(dirname(file));
    const pluginFn = await loadPlugin(file);

    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);
    await fireTaskHook(pluginFn, root);

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    const logPath = join(root, '.agentic', 'kiki', 'routing_log.jsonl');
    expect(existsSync(logPath)).toBe(true);
    const lines = readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean);
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]).agent).toBe('kiki-planner');
  });

  it('project-only: one owner, one interval, one routing log line', async () => {
    const root = makeTmpRoot();
    const file = tmpPluginFile('project', KIKI_VERSION, 'p1');
    tmpRoots.push(dirname(file));
    const pluginFn = await loadPlugin(file);

    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);
    await fireTaskHook(pluginFn, root);

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    const lines = readFileSync(join(root, '.agentic', 'kiki', 'routing_log.jsonl'), 'utf-8').trim().split('\n').filter(Boolean);
    expect(lines.length).toBe(1);
  });

  it('both installed, same version: second instance yields, single interval, single log line', async () => {
    const root = makeTmpRoot();
    const gFile = tmpPluginFile('global', KIKI_VERSION, 'g2');
    const pFile = tmpPluginFile('project', KIKI_VERSION, 'p2');
    tmpRoots.push(dirname(gFile), dirname(pFile));
    const globalPlugin = await loadPlugin(gFile);
    const projectPlugin = await loadPlugin(pFile);

    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);
    const gHooks = globalPlugin({ client: fakeClient(), directory: root });
    const pHooks = projectPlugin({ client: fakeClient(), directory: root });

    await gHooks['tool.execute.before']({ tool: 'task' }, { args: { subagent_type: 'kiki-planner' } });
    await pHooks['tool.execute.before']({ tool: 'task' }, { args: { subagent_type: 'kiki-implementer' } });

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
    const lines = readFileSync(join(root, '.agentic', 'kiki', 'routing_log.jsonl'), 'utf-8').trim().split('\n').filter(Boolean);
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]).agent).toBe('kiki-planner');
  });

  it('version mismatch: non-owner warns and writes health_log, then yields', async () => {
    const root = makeTmpRoot();
    const gFile = tmpPluginFile('global', '2.1.0', 'g3');
    const pFile = tmpPluginFile('project', '2.0.0', 'p3');
    tmpRoots.push(dirname(gFile), dirname(pFile));
    const globalPlugin = await loadPlugin(gFile);
    const projectPlugin = await loadPlugin(pFile);

    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);
    const gHooks = globalPlugin({ client: fakeClient(), directory: root });
    const pHooks = projectPlugin({ client: fakeClient(), directory: root });

    // owner ran
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    // non-owner emitted diagnostic
    expect(warnSpy).toHaveBeenCalled();
    const warnMsg = String(warnSpy.mock.calls[0][0]);
    expect(warnMsg).toContain('plugin-dedup-version-mismatch');
    expect(warnMsg).toContain('2.1.0');
    expect(warnMsg).toContain('2.0.0');

    const healthLog = join(root, '.agentic', 'kiki', 'health_log.jsonl');
    expect(existsSync(healthLog)).toBe(true);
    const entry = JSON.parse(readFileSync(healthLog, 'utf-8').trim().split('\n').pop()!);
    expect(entry.event).toBe('plugin-dedup-version-mismatch');
    expect(entry.ownerVersion).toBe('2.1.0');
    expect(entry.thisVersion).toBe('2.0.0');

    // non-owner hook is a no-op (does not append a routing line)
    await pHooks['tool.execute.before']({ tool: 'task' }, { args: { subagent_type: 'kiki-reviewer' } });
    const routingLog = join(root, '.agentic', 'kiki', 'routing_log.jsonl');
    expect(existsSync(routingLog)).toBe(false);
  });

  it('multi-root isolation: two roots each get an owner and an interval', async () => {
    const rootA = makeTmpRoot();
    const rootB = makeTmpRoot();
    const fileA = tmpPluginFile('global', KIKI_VERSION, 'a');
    const fileB = tmpPluginFile('project', KIKI_VERSION, 'b');
    tmpRoots.push(dirname(fileA), dirname(fileB));
    const pluginA = await loadPlugin(fileA);
    const pluginB = await loadPlugin(fileB);

    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(rootA); // cwd only affects routing-log path
    pluginA({ client: fakeClient(), directory: rootA });
    pluginB({ client: fakeClient(), directory: rootB });

    expect(setIntervalSpy).toHaveBeenCalledTimes(2);
    const registry = (globalThis as any)[OWNERSHIP_KEY];
    expect(registry[rootA].scope).toBe('global');
    expect(registry[rootB].scope).toBe('project');
  });
});
