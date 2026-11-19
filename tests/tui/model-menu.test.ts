import { describe, it, expect, vi } from 'vitest';
import type { Plugin } from '@opencode/plugin/tui';
import type {
  AgentModelRow, ModelRemoveAllResult, ModelRemoveResult, ModelSaveResult, ModelScope,
} from '../../src/cli/opencode-config';
import { registerKikiMenu, type ModelSettings } from '../../src/tui/model-menu';
import type { TuiLanguage } from '../../src/tui/strings';

type TuiContext = Plugin.Context;
type Location = NonNullable<TuiContext['location']>;
type SelectOptions = Parameters<TuiContext['ui']['dialog']['select']>[0];
type ConfirmOptions = Parameters<TuiContext['ui']['dialog']['confirm']>[0];
type ToastOptions = Parameters<TuiContext['ui']['toast']['show']>[0];
type ModelList = NonNullable<ReturnType<TuiContext['data']['location']['model']['list']>>;
type ProviderList = NonNullable<ReturnType<TuiContext['data']['location']['provider']['list']>>;

interface MenuCommand {
  id?: string;
  title?: string;
  description?: string;
  group?: string;
  palette?: true;
  slash?: { name: string; aliases?: string[]; arguments?: true };
  run: () => void | Promise<void>;
}

interface LayerShape {
  mode?: string;
  commands: MenuCommand[];
}

interface Deferred<Value> {
  promise: Promise<Value>;
  resolve(value: Value): void;
}

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>(done => { resolve = done; });
  return { promise, resolve };
}

function modelInfo(
  providerID: string, modelID: string, name: string, status: 'active' | 'deprecated' = 'active',
): ModelList[number] {
  return { id: modelID, modelID, providerID, name, status, enabled: true } as unknown as ModelList[number];
}

function providerInfo(id: string, name: string): ProviderList[number] {
  return { id, name, activation: 'enabled', package: 'fixture' } as unknown as ProviderList[number];
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function fixture(options: {
  location?: boolean;
  providers?: ProviderList;
  models?: ModelList;
  rows?: Record<ModelScope, AgentModelRow[]>;
  language?: TuiLanguage;
} = {}) {
  const location = { directory: '/fixture/project' } as unknown as Location;
  const state = {
    location: options.location === false ? undefined : location,
    providers: 'providers' in options ? options.providers : [providerInfo('provider', 'Provider')],
    models: 'models' in options ? options.models : [
      modelInfo('provider', 'beta', 'Beta'),
      modelInfo('provider', 'alpha', 'Alpha'),
      modelInfo('provider', 'old', 'Old', 'deprecated'),
    ],
    rows: options.rows ?? {
      global: [
        { name: 'kiki-planner', model: 'provider/alpha', inherited: true },
        { name: 'kiki-reviewer', model: 'provider/beta', inherited: false },
      ],
      project: [
        { name: 'kiki-planner', model: 'provider/alpha', inherited: true },
        { name: 'kiki-reviewer', model: 'provider/local', inherited: false, projectOverride: 'provider/local' },
      ],
    },
  };

  const pending: { resolve(value: string | undefined): void }[] = [];
  const events: string[] = [];
  const select = vi.fn((options: SelectOptions): Promise<string | undefined> => {
    events.push(`select:${options.title}`);
    return new Promise(resolve => {
      pending.push({ resolve });
    });
  });
  const set = vi.fn((options: Parameters<TuiContext['ui']['dialog']['set']>[0]) => {
    events.push(`set:${options.size ?? ''}`);
  });
  const confirm = vi.fn((_options: ConfirmOptions): Promise<boolean | undefined> => Promise.resolve(undefined));
  const toast = vi.fn((_options: ToastOptions) => {});
  const clear = vi.fn();
  const list = vi.fn((scope: ModelScope): AgentModelRow[] => state.rows[scope]);
  const save = vi.fn(async (
    scope: ModelScope, agent: string, model: string, _availableModels: readonly string[],
  ): Promise<ModelSaveResult> => {
    const row = state.rows[scope].find(item => item.name === agent);
    if (row) {
      row.model = model;
      row.inherited = false;
      if (scope === 'project') row.projectOverride = model;
    }
    return { file: '/fixture/opencode.jsonc' };
  });
  const remove = vi.fn(async (_scope: ModelScope, _agent: string): Promise<ModelRemoveResult> => ({
    file: '/fixture/opencode.jsonc', removed: 'provider/local', effective: 'provider/beta',
  }));
  const removeAllProject = vi.fn(async (): Promise<ModelRemoveAllResult> => ({
    files: ['/fixture/opencode.jsonc'],
    removed: [{ agent: 'kiki-reviewer', model: 'provider/local' }],
  }));
  const settings: ModelSettings = { list, save, remove, removeAllProject };

  let command: MenuCommand | undefined;
  let layerMode: string | undefined;
  const layer = vi.fn((_factory: () => LayerShape) => {
    const shape = _factory();
    command = shape.commands[0];
    layerMode = shape.mode;
  });
  const client = new Proxy({}, {
    get() { throw new Error('No LLM/client requests in the menu'); },
  }) as TuiContext['client'];
  const chatModel = new Proxy({}, {
    get() { throw new Error('No active-chat model changes in the menu'); },
  }) as TuiContext['ui']['model'];

  const context = {
    location: state.location,
    data: {
      location: {
        model: { list: vi.fn(() => state.models), sync: vi.fn(), invalidate: vi.fn() },
        provider: { list: vi.fn(() => state.providers), sync: vi.fn(), invalidate: vi.fn() },
      },
    },
    keymap: { layer },
    ui: {
      dialog: { select, confirm, clear, alert: vi.fn(), prompt: vi.fn(), show: vi.fn(), set },
      toast: { show: toast },
      model: chatModel,
    },
    client,
  } as unknown as TuiContext;

  const cleanup = registerKikiMenu(context, settings, options.language ?? 'de');

  return {
    state, settings, layer, select, confirm, toast, clear, set, events, list, save, remove, removeAllProject,
    get layerMode(): string | undefined { return layerMode; },
    get command(): MenuCommand {
      if (!command) throw new Error('Menu command was not registered');
      return command;
    },
    get view(): SelectOptions {
      const call = select.mock.calls.at(-1);
      if (!call) throw new Error('No select dialog was opened');
      return call[0];
    },
    get pending(): number { return pending.length; },
    run() { return command?.run(); },
    start() { void Promise.resolve(command?.run()).catch(() => {}); },
    async selectDialog(value: string | undefined) {
      const next = pending.shift();
      if (!next) throw new Error('No dialog is waiting');
      next.resolve(value);
      await tick();
    },
    dispose() { cleanup(); },
  };
}

describe('/kiki model menu (OpenCode 2 native TUI)', () => {
  it('registers one native palette/slash command with global as the default action', async () => {
    const f = fixture();
    expect(f.command.id).toBe('kiki.menu');
    expect(f.command.title).toBe('Kiki');
    expect(f.command.group).toBe('Kiki');
    expect(f.command.palette).toBe(true);
    expect(f.command.slash).toEqual({ name: 'kiki' });
    expect(f.layerMode).toBe('global');

    f.start(); await tick();
    expect(f.view.title).toBe('Kiki');
    expect(f.view.current).toBe('global');
    expect(f.view.options.map(row => row.title)).toEqual(['Modell ändern — global', 'Modell ändern — dieses Projekt']);
    expect(f.view.options.map(row => row.value)).toEqual(['global', 'project']);
    f.dispose();
  });

  it('renders the whole menu in English when the resolved language is English', async () => {
    const f = fixture({ language: 'en' });
    f.start(); await tick();
    expect(f.view.title).toBe('Kiki');
    expect(f.view.options.map(row => row.title)).toEqual([
      'Change model — global', 'Change model — this project',
    ]);
    await f.selectDialog('global');
    expect(f.view.title).toBe('Select Kiki agent — global');
    expect(f.view.placeholder).toBe('Search agent');
    expect(f.view.search).toBeUndefined();
    expect(f.view.options.find(row => row.value === 'kiki-planner')).toMatchObject({
      category: 'kiki-planner', title: 'provider/alpha',
    });
    expect(f.view.options.find(row => row.value === 'kiki-planner')?.description).toBeUndefined();
    await f.selectDialog('kiki-reviewer');
    expect(f.view.title).toBe('kiki-reviewer — Model (global)');
    expect(f.view.placeholder).toBe('Search model or provider');
    expect(typeof f.view.search).toBe('function');
    await f.selectDialog('provider/alpha');
    expect(f.toast).toHaveBeenCalledWith(expect.objectContaining({
      variant: 'success',
      title: 'Kiki model saved',
      message: 'kiki-reviewer: provider/alpha (global). Restart OpenCode.',
      duration: 8_000,
    }));
  });

  it('keeps the host default width and leaves the agent search callback absent', async () => {
    const f = fixture();
    f.start(); await tick();
    expect(f.pending).toBe(1);
    expect(f.set).not.toHaveBeenCalled();
    expect(f.events).toEqual(['select:Kiki']);

    await f.selectDialog('global');
    expect(f.pending).toBe(1);
    expect(f.set).not.toHaveBeenCalled();
    expect(f.events).toEqual(['select:Kiki', 'select:Kiki-Agent auswählen — global']);
    expect(f.view.search).toBeUndefined();

    await f.selectDialog('kiki-reviewer');
    expect(f.pending).toBe(1);
    expect(f.set).not.toHaveBeenCalled();
    expect(f.events).toEqual([
      'select:Kiki', 'select:Kiki-Agent auswählen — global', 'select:kiki-reviewer — Modell (global)',
    ]);
    expect(typeof f.view.search).toBe('function');
    f.dispose();
  });

  it('shows full agent identifiers as group headers while saving the full ID', async () => {
    const f = fixture({
      rows: {
        global: [
          { name: 'kiki-planner', model: 'provider/alpha', inherited: false },
          { name: 'plain-agent', model: 'provider/beta', inherited: false },
          { name: 'kikifoo', model: 'provider/alpha', inherited: false },
          { name: 'agent-kiki-nested', model: 'provider/beta', inherited: false },
        ],
        project: [],
      },
    });
    f.start(); await tick(); await f.selectDialog('global');
    expect(f.view.search).toBeUndefined();
    expect(f.view.options.map(row => [row.value, row.category, row.title])).toEqual([
      ['kiki-planner', 'kiki-planner', 'provider/alpha'],
      ['plain-agent', 'plain-agent', 'provider/beta'],
      ['kikifoo', 'kikifoo', 'provider/alpha'],
      ['agent-kiki-nested', 'agent-kiki-nested', 'provider/beta'],
    ]);
    expect(f.view.options.every(row => row.description === undefined)).toBe(true);
    await f.selectDialog('kiki-planner');
    expect(f.view.title).toBe('kiki-planner — Modell (global)');
    await f.selectDialog('provider/beta');
    expect(f.settings.save).toHaveBeenCalledWith(
      'global', 'kiki-planner', 'provider/beta', ['provider/alpha', 'provider/beta'],
    );
    expect(f.toast).toHaveBeenCalledWith(expect.objectContaining({
      message: 'kiki-planner: provider/beta (global). OpenCode neu starten.',
    }));

    f.start(); await tick(); await f.selectDialog('global');
    await f.selectDialog('plain-agent');
    expect(f.view.title).toBe('plain-agent — Modell (global)');
    f.dispose();
  });

  it('uses the localized OpenCode default as the second-line title when no model is set', async () => {
    const de = fixture({
      rows: { global: [{ name: 'kiki-empty', model: '', inherited: false }], project: [] },
    });
    de.start(); await tick(); await de.selectDialog('global');
    expect(de.view.options[0]).toMatchObject({
      category: 'kiki-empty', title: 'OpenCode-Standard', value: 'kiki-empty',
    });
    de.dispose();

    const en = fixture({
      language: 'en',
      rows: { global: [{ name: 'kiki-empty', model: '', inherited: false }], project: [] },
    });
    en.start(); await tick(); await en.selectDialog('global');
    expect(en.view.options[0]).toMatchObject({
      category: 'kiki-empty', title: 'OpenCode default', value: 'kiki-empty',
    });
    en.dispose();
  });

  it('shows English loading and configuration copy without leaking details', async () => {
    const loading = fixture({ language: 'en', location: false });
    await loading.run();
    expect(loading.toast).toHaveBeenCalledWith({
      variant: 'info', message: 'OpenCode is still loading. Open /kiki again shortly.',
    });

    const broken = fixture({ language: 'en' });
    broken.settings.list = vi.fn(() => { throw new Error('sensitive-fixture-details'); });
    broken.start(); await tick(); await broken.selectDialog('global');
    expect(broken.toast).toHaveBeenCalledWith({
      variant: 'error',
      message: 'Kiki configuration could not be read. Check configuration and access permissions.',
    });
    expect(JSON.stringify(broken.toast.mock.calls)).not.toContain('sensitive-fixture-details');
  });

  it('saves globally using host model/provider collections without touching chat or client state', async () => {
    const f = fixture();
    f.start(); await tick();
    await f.selectDialog('global');
    expect(f.view.options.find(row => row.value === 'kiki-planner')).toMatchObject({
      category: 'kiki-planner', title: 'provider/alpha',
    });
    expect(f.view.options.find(row => row.value === 'kiki-planner')?.footer).toBeUndefined();
    await f.selectDialog('kiki-reviewer');
    expect(f.view.title).toBe('kiki-reviewer — Modell (global)');
    expect(f.view.current).toBe('provider/beta');
    expect(f.view.placeholder).toBe('Modell oder Provider suchen');
    expect(f.view.options.map(row => row.value)).toEqual(['provider/alpha', 'provider/beta']);
    expect(f.view.options.map(row => row.title)).toEqual(['Alpha', 'Beta']);
    expect(f.view.options.map(row => row.category)).toEqual(['Provider', 'Provider']);
    await f.selectDialog('provider/alpha');

    expect(f.settings.save).toHaveBeenCalledTimes(1);
    expect(f.settings.save).toHaveBeenCalledWith(
      'global', 'kiki-reviewer', 'provider/alpha', ['provider/alpha', 'provider/beta'],
    );
    expect(f.toast).toHaveBeenCalledWith(expect.objectContaining({
      variant: 'success',
      title: 'Kiki-Modell gespeichert',
      message: 'kiki-reviewer: provider/alpha (global). OpenCode neu starten.',
      duration: 8_000,
    }));
  });

  it('uses the explicit project scope when selected', async () => {
    const f = fixture();
    f.start(); await tick(); await f.selectDialog('project');
    expect(f.view.options.find(row => row.value === 'kiki-planner')).toMatchObject({
      category: 'kiki-planner', title: 'provider/alpha', footer: 'Global',
    });
    expect(f.view.options.find(row => row.value === 'kiki-reviewer')?.footer).toBeUndefined();
    await f.selectDialog('kiki-planner'); await f.selectDialog('provider/beta');
    expect(f.settings.save).toHaveBeenCalledWith('project', 'kiki-planner', 'provider/beta', expect.any(Array));
    expect(f.toast).toHaveBeenCalledWith(expect.objectContaining({
      message: 'kiki-planner: provider/beta (dieses Projekt). OpenCode neu starten.',
    }));
  });

  it('puts only the scoped status in the footer without stacking global inherited', async () => {
    const f = fixture({
      rows: {
        global: [
          { name: 'kiki-planner', model: 'provider/alpha', inherited: true, projectOverride: 'provider/alpha' },
          { name: 'kiki-reviewer', model: 'provider/beta', inherited: false, projectOverride: 'provider/project' },
          { name: 'kiki-builder', model: 'provider/beta', inherited: true },
        ],
        project: [
          { name: 'kiki-reviewer', model: 'provider/local', inherited: false, projectOverride: 'provider/local' },
          { name: 'kiki-builder', model: 'provider/alpha', inherited: true, projectOverride: 'provider/alpha' },
        ],
      },
    });
    f.start(); await tick(); await f.selectDialog('global');
    const global = Object.fromEntries(f.view.options.map(row => [row.value, row]));
    expect(global['kiki-planner']).toMatchObject({
      category: 'kiki-planner', title: 'provider/alpha', footer: 'Projekt',
    });
    expect(global['kiki-reviewer']).toMatchObject({
      category: 'kiki-reviewer', title: 'provider/beta', footer: 'Projekt',
    });
    expect(global['kiki-builder']).toMatchObject({
      category: 'kiki-builder', title: 'provider/beta',
    });
    expect(global['kiki-builder'].footer).toBeUndefined();
    expect(global['kiki-planner'].footer).not.toContain('Global');
    expect(f.view.options.every(row => row.description === undefined)).toBe(true);

    await f.selectDialog(undefined);
    f.start(); await tick(); await f.selectDialog('project');
    expect(f.view.title).toBe('Kiki-Agent auswählen — dieses Projekt');
    const project = Object.fromEntries(f.view.options.map(row => [row.value, row]));
    expect(project['kiki-reviewer']).toMatchObject({
      category: 'kiki-reviewer', title: 'provider/local',
    });
    expect(project['kiki-reviewer'].footer).toBeUndefined();
    expect(project['kiki-builder']).toMatchObject({
      category: 'kiki-builder', title: 'provider/alpha', footer: 'Global',
    });
    expect(project['__all__']).toMatchObject({
      title: 'Alle lokalen Modell-Zuordnungen löschen',
      value: '__all__',
      description: 'Globale Modelle greifen wieder',
    });
    expect(project['__all__'].category).toBeUndefined();
    expect(project['__all__'].footer).toBeUndefined();
    f.dispose();
  });

  it('uses the English status wording', async () => {
    const f = fixture({
      language: 'en',
      rows: {
        global: [
          { name: 'kiki-reviewer', model: 'provider/beta', inherited: true, projectOverride: 'provider/project' },
          { name: 'kiki-builder', model: 'provider/beta', inherited: true },
        ],
        project: [{ name: 'kiki-reviewer', model: 'provider/beta', inherited: true }],
      },
    });
    f.start(); await tick(); await f.selectDialog('global');
    expect(f.view.options[0]).toMatchObject({
      category: 'kiki-reviewer', title: 'provider/beta', footer: 'Project',
    });
    expect(f.view.options[1]).toMatchObject({
      category: 'kiki-builder', title: 'provider/beta',
    });
    expect(f.view.options[1].footer).toBeUndefined();

    await f.selectDialog(undefined);
    f.start(); await tick(); await f.selectDialog('project');
    expect(f.view.options[0]).toMatchObject({
      category: 'kiki-reviewer', title: 'provider/beta', footer: 'Global',
    });
    f.dispose();
  });

  it('reports an existing project override after a global change', async () => {
    const f = fixture();
    f.save.mockResolvedValueOnce({ file: '/fixture/config', projectOverride: 'provider/project' });
    f.start(); await tick(); await f.selectDialog('global');
    await f.selectDialog('kiki-reviewer'); await f.selectDialog('provider/alpha');
    expect(f.toast).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('Projektzuordnung provider/project bleibt aktiv'),
    }));
  });

  it('does not write when the selected model is already effective (variant-safe no-op)', async () => {
    const f = fixture({
      rows: {
        global: [{ name: 'kiki-reviewer', model: 'provider/beta', inherited: false, projectOverride: 'provider/project' }],
        project: [{ name: 'kiki-reviewer', model: 'provider/beta', inherited: true }],
      },
    });
    f.start(); await tick(); await f.selectDialog('global');
    await f.selectDialog('kiki-reviewer'); await f.selectDialog('provider/beta');
    expect(f.settings.save).not.toHaveBeenCalled();
    expect(f.toast).toHaveBeenCalledWith(expect.objectContaining({
      variant: 'success',
      title: 'Kiki-Modell gespeichert',
      message: 'kiki-reviewer: provider/beta (global). Projektzuordnung provider/project bleibt aktiv. OpenCode neu starten.',
      duration: 8_000,
    }));
  });

  it('shows a safe loading toast when the location or host collections are not ready', async () => {
    const noLocation = fixture({ location: false });
    await noLocation.run();
    expect(noLocation.select).not.toHaveBeenCalled();
    expect(noLocation.toast).toHaveBeenCalledWith({
      variant: 'info', message: 'OpenCode lädt noch. /kiki gleich erneut öffnen.',
    });

    const noProviders = fixture({ providers: undefined });
    await noProviders.run();
    expect(noProviders.select).not.toHaveBeenCalled();
    expect(noProviders.toast).toHaveBeenCalledWith({
      variant: 'info', message: 'OpenCode lädt noch. /kiki gleich erneut öffnen.',
    });
  });

  it('ignores a second invocation while a flow is active', async () => {
    const f = fixture();
    f.start(); await tick();
    await f.run();
    expect(f.select).toHaveBeenCalledTimes(1);
    expect(f.pending).toBe(1);
    f.dispose();
  });

  it('cancelled or unloaded dialogs cannot continue into a save', async () => {
    const f = fixture();
    f.start(); await tick();
    await f.selectDialog(undefined);
    expect(f.select).toHaveBeenCalledTimes(1);
    expect(f.settings.save).not.toHaveBeenCalled();

    f.start(); await tick();
    f.dispose();
    await f.selectDialog('global');
    expect(f.select).toHaveBeenCalledTimes(2);
    expect(f.settings.save).not.toHaveBeenCalled();
  });

  it('prevents duplicate saves while pending and after a successful save', async () => {
    const f = fixture();
    const completion = deferred<ModelSaveResult>();
    f.save.mockReturnValueOnce(completion.promise);
    f.start(); await tick(); await f.selectDialog('global');
    await f.selectDialog('kiki-reviewer'); await f.selectDialog('provider/alpha');
    expect(f.settings.save).toHaveBeenCalledTimes(1);

    await f.run();
    expect(f.settings.save).toHaveBeenCalledTimes(1);

    completion.resolve({ file: '/fixture/config' }); await tick();
    f.start(); await tick(); await f.selectDialog('global');
    await f.selectDialog('kiki-reviewer'); await f.selectDialog('provider/beta');
    expect(f.settings.save).toHaveBeenCalledTimes(1);
    expect(f.toast.mock.calls.filter(call => call[0].title === 'Kiki-Modell gespeichert')).toHaveLength(2);
  });

  it('save failures show generic copy, leak no details, and allow retry', async () => {
    const f = fixture();
    f.save.mockRejectedValueOnce(new Error('sensitive-fixture-details'));
    f.start(); await tick(); await f.selectDialog('global');
    await f.selectDialog('kiki-reviewer'); await f.selectDialog('provider/alpha');
    expect(f.toast).toHaveBeenCalledWith({
      variant: 'error',
      message: 'Modellzuordnung konnte nicht gespeichert werden. Konfiguration und Schreibrechte prüfen; anschließend erneut auswählen.',
    });
    expect(JSON.stringify(f.toast.mock.calls)).not.toContain('sensitive-fixture-details');

    f.start(); await tick(); await f.selectDialog('global');
    await f.selectDialog('kiki-reviewer'); await f.selectDialog('provider/alpha');
    expect(f.settings.save).toHaveBeenCalledTimes(2);
    expect(f.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' }));
  });

  it('filters deprecated and opencode nano models and sorts by provider name then model title', async () => {
    const f = fixture({
      providers: [providerInfo('zeta', 'Zeta Provider'), providerInfo('alpha', 'Alpha Provider'), providerInfo('opencode', 'OpenCode')],
      models: [
        modelInfo('zeta', 'two', 'Beta'),
        modelInfo('opencode', 'small-nano', 'Nano'),
        modelInfo('alpha', 'one', 'Zulu'),
        modelInfo('zeta', 'one', 'Alpha'),
        modelInfo('alpha', 'old', 'Old', 'deprecated'),
      ],
    });
    f.start(); await tick(); await f.selectDialog('global'); await f.selectDialog('kiki-reviewer');
    expect(f.view.options.map(row => row.value)).toEqual(['alpha/one', 'zeta/one', 'zeta/two']);
    expect(f.view.options.map(row => row.category)).toEqual(['Alpha Provider', 'Zeta Provider', 'Zeta Provider']);
    expect(f.view.search?.('zeta', f.view.options).map(row => row.value)).toEqual(['zeta/one', 'zeta/two']);
    expect(f.view.search?.('zulu', f.view.options).map(row => row.value)).toEqual(['alpha/one']);
  });

  it('offers no writable selection when every model is unavailable', async () => {
    const f = fixture({
      models: [modelInfo('provider', 'old', 'Old', 'deprecated')],
    });
    f.start(); await tick(); await f.selectDialog('global'); await f.selectDialog('kiki-reviewer');
    expect(f.pending).toBe(0);
    expect(f.settings.save).not.toHaveBeenCalled();
    expect(f.toast).toHaveBeenCalledWith({
      variant: 'info',
      message: 'Keine verfügbaren Modelle. Zuerst einen Provider in OpenCode verbinden.',
    });
  });

  it('rejects forged selections and models that disappear while the dialog is open', async () => {
    const forged = fixture();
    forged.start(); await tick(); await forged.selectDialog('global'); await forged.selectDialog('kiki-reviewer');
    await forged.selectDialog('provider/unavailable');
    expect(forged.settings.save).not.toHaveBeenCalled();

    const vanished = fixture();
    vanished.start(); await tick(); await vanished.selectDialog('global'); await vanished.selectDialog('kiki-reviewer');
    vanished.state.models = [modelInfo('provider', 'beta', 'Beta')];
    await vanished.selectDialog('provider/alpha');
    expect(vanished.settings.save).not.toHaveBeenCalled();
    expect(vanished.toast).toHaveBeenCalledWith({
      variant: 'error', message: 'Dieses Modell ist nicht mehr verfügbar. Modellauswahl erneut öffnen.',
    });
  });

  it('a delayed save resolving after unload performs no stale toast or extra write', async () => {
    const f = fixture();
    const completion = deferred<ModelSaveResult>();
    f.save.mockReturnValueOnce(completion.promise);
    f.start(); await tick(); await f.selectDialog('global');
    await f.selectDialog('kiki-reviewer'); await f.selectDialog('provider/alpha');
    f.dispose();
    completion.resolve({ file: '/fixture/config' }); await tick();
    expect(f.settings.save).toHaveBeenCalledTimes(1);
    expect(f.toast).not.toHaveBeenCalled();
  });

  it('offers the global model as an inherit entry and removes the local override', async () => {
    const f = fixture();
    f.start(); await tick(); await f.selectDialog('project'); await f.selectDialog('kiki-reviewer');
    expect(f.view.current).toBe('provider/local');
    expect(f.view.options[0]).toEqual({
      title: 'Globales Modell (provider/beta) verwenden', value: '__inherit__',
    });
    await f.selectDialog('__inherit__');
    expect(f.settings.remove).toHaveBeenCalledTimes(1);
    expect(f.settings.remove).toHaveBeenCalledWith('project', 'kiki-reviewer');
    expect(f.settings.save).not.toHaveBeenCalled();
    expect(f.toast).toHaveBeenCalledWith(expect.objectContaining({
      variant: 'success',
      title: 'Kiki-Modell zurückgesetzt',
      message: expect.stringMatching(/^kiki-reviewer: lokales Modell provider\/local.*provider\/beta.*OpenCode.*neu starten/),
      duration: 8_000,
    }));
  });

  it('shows the full agent name when no local model remains', async () => {
    const f = fixture();
    f.remove.mockResolvedValueOnce({ file: '/fixture/config', removed: '', effective: 'provider/beta' });
    f.start(); await tick(); await f.selectDialog('project'); await f.selectDialog('kiki-reviewer');
    await f.selectDialog('__inherit__');
    expect(f.toast).toHaveBeenCalledWith(expect.objectContaining({
      message: 'kiki-reviewer: kein lokales Modell vorhanden. OpenCode neu starten.',
    }));
    f.dispose();
  });

  it('shows no inherit entry for inherited agents or in global scope', async () => {
    const f = fixture();
    f.start(); await tick(); await f.selectDialog('project'); await f.selectDialog('kiki-planner');
    expect(f.view.options.map(row => row.value)).toEqual(['provider/alpha', 'provider/beta']);
    await f.selectDialog(undefined);

    f.start(); await tick(); await f.selectDialog('global'); await f.selectDialog('kiki-reviewer');
    expect(f.view.options.map(row => row.value)).toEqual(['provider/alpha', 'provider/beta']);
    f.dispose();
  });

  it('offers the inherit entry even when no provider models are available', async () => {
    const f = fixture({
      models: [modelInfo('provider', 'old', 'Old', 'deprecated')],
    });
    f.start(); await tick(); await f.selectDialog('project'); await f.selectDialog('kiki-reviewer');
    expect(f.view.options.map(row => row.value)).toEqual(['__inherit__']);
    await f.selectDialog('__inherit__');
    expect(f.settings.remove).toHaveBeenCalledWith('project', 'kiki-reviewer');
  });

  it('guards remove-all behind native confirmation and returns to agents on cancel', async () => {
    const f = fixture();
    f.confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    f.start(); await tick(); await f.selectDialog('project');
    expect(f.view.options.at(-1)).toMatchObject({
      title: 'Alle lokalen Modell-Zuordnungen löschen',
      value: '__all__',
      description: 'Globale Modelle greifen wieder',
    });
    expect(f.view.options.at(-1)?.category).toBeUndefined();
    expect(f.view.options.at(-1)?.footer).toBeUndefined();
    await f.selectDialog('__all__');
    expect(f.confirm).toHaveBeenCalledWith({
      title: 'Alle lokalen Modell-Zuordnungen löschen?',
      message: 'Globale Modelle greifen wieder.',
      label: { confirm: 'Ja, alle löschen', cancel: 'Abbrechen' },
    });
    expect(f.settings.removeAllProject).not.toHaveBeenCalled();
    expect(f.view.title).toBe('Kiki-Agent auswählen — dieses Projekt');

    await f.selectDialog('__all__');
    expect(f.settings.removeAllProject).toHaveBeenCalledTimes(1);
    expect(f.toast).toHaveBeenCalledWith(expect.objectContaining({
      variant: 'success',
      title: 'Kiki-Modelle zurückgesetzt',
      message: expect.stringMatching(/1 lokale.*globale Modelle greifen.*OpenCode.*neu starten/),
      duration: 8_000,
    }));
  });

  it('closes without removing when remove-all confirmation is dismissed', async () => {
    const f = fixture();
    f.confirm.mockResolvedValueOnce(undefined);
    f.start(); await tick(); await f.selectDialog('project'); await f.selectDialog('__all__');
    expect(f.pending).toBe(0);
    expect(f.settings.removeAllProject).not.toHaveBeenCalled();
  });

  it('global agent list has no delete-all entry', async () => {
    const f = fixture();
    f.start(); await tick(); await f.selectDialog('global');
    expect(f.view.options.map(row => row.value)).toEqual(['kiki-planner', 'kiki-reviewer']);
    expect(f.view.options.map(row => row.category)).toEqual(['kiki-planner', 'kiki-reviewer']);
    f.dispose();
  });

  it('stale remove/remove-all promises after unload cannot show success toasts', async () => {
    const removal = deferred<ModelRemoveResult>();
    const f = fixture();
    f.remove.mockReturnValueOnce(removal.promise);
    f.start(); await tick(); await f.selectDialog('project'); await f.selectDialog('kiki-reviewer');
    await f.selectDialog('__inherit__');
    f.dispose();
    removal.resolve({ file: '/fixture/config', removed: 'provider/local', effective: 'provider/beta' }); await tick();
    expect(f.toast).not.toHaveBeenCalled();

    const all = deferred<ModelRemoveAllResult>();
    const g = fixture();
    g.removeAllProject.mockReturnValueOnce(all.promise);
    g.confirm.mockResolvedValueOnce(true);
    g.start(); await tick(); await g.selectDialog('project'); await g.selectDialog('__all__');
    g.dispose();
    all.resolve({ files: ['/fixture/config'], removed: [{ agent: 'kiki-reviewer', model: 'provider/local' }] }); await tick();
    expect(g.toast).not.toHaveBeenCalled();
  });

  it('remove failures show generic copy, leak no details, and allow retry', async () => {
    const f = fixture();
    f.remove.mockRejectedValueOnce(new Error('sensitive-fixture-details'));
    f.start(); await tick(); await f.selectDialog('project'); await f.selectDialog('kiki-reviewer');
    await f.selectDialog('__inherit__');
    expect(f.toast).toHaveBeenCalledWith({
      variant: 'error',
      message: 'Modell-Zuordnung konnte nicht entfernt werden. Konfiguration und Schreibrechte prüfen; anschließend erneut auswählen.',
    });
    expect(JSON.stringify(f.toast.mock.calls)).not.toContain('sensitive-fixture-details');

    f.start(); await tick(); await f.selectDialog('project'); await f.selectDialog('kiki-reviewer');
    await f.selectDialog('__inherit__');
    expect(f.settings.remove).toHaveBeenCalledTimes(2);
    expect(f.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' }));
  });

  it('malformed configuration shows a generic read error without writing', async () => {
    const f = fixture();
    f.settings.list = vi.fn(() => { throw new Error('sensitive-fixture-details'); });
    f.start(); await tick(); await f.selectDialog('global');
    expect(f.select).toHaveBeenCalledTimes(1);
    expect(f.toast).toHaveBeenCalledWith({
      variant: 'error',
      message: 'Kiki-Konfiguration konnte nicht gelesen werden. Konfiguration und Zugriffsrechte prüfen.',
    });
    expect(JSON.stringify(f.toast.mock.calls)).not.toContain('sensitive-fixture-details');
    expect(f.settings.save).not.toHaveBeenCalled();
  });
});
