import { describe, it, expect, vi } from 'vitest';
import type { TuiPluginApi, TuiDialogSelectProps } from '@opencode-ai/plugin/tui';
import { registerKikiMenu, type ModelSettings } from '../../src/tui/model-menu';

function fixture() {
  let view: TuiDialogSelectProps<string>;
  let onClose: (() => void) | undefined;
  let open = false;
  let command: { slashName: string; run(): void };
  const disposed: (() => void)[] = [];
  const settings: ModelSettings = {
    list: vi.fn((scope: string) => scope === 'global' ? [
      { name: 'kiki-planner', model: 'provider/alpha', inherited: true },
      { name: 'kiki-reviewer', model: 'provider/beta', inherited: false },
    ] : [
      { name: 'kiki-planner', model: 'provider/alpha', inherited: true },
      { name: 'kiki-reviewer', model: 'provider/local', inherited: false, projectOverride: 'provider/local' },
    ]),
    save: vi.fn().mockResolvedValue({ file: '/fixture/opencode.jsonc' }),
    remove: vi.fn().mockResolvedValue({ file: '/fixture/opencode.jsonc', removed: 'provider/local', effective: 'provider/beta' }),
    removeAllProject: vi.fn().mockResolvedValue({ files: ['/fixture/opencode.jsonc'], removed: [{ agent: 'kiki-reviewer', model: 'provider/local' }] }),
  };
  const api = {
    keymap: { registerLayer: vi.fn((layer: any) => { command = layer.commands[0]; return () => {}; }) },
    ui: {
      DialogSelect: (props: any) => { view = props; return null; },
      toast: vi.fn(),
      dialog: {
        replace: (render: () => unknown, close?: () => void) => { onClose?.(); onClose = close; open = true; render(); },
        clear: vi.fn(() => { onClose?.(); open = false; }),
        get open() { return open; },
      },
    },
    state: {
      ready: true,
      provider: [{ id: 'provider', name: 'Provider', models: {
        alpha: { id: 'alpha', name: 'Alpha', status: 'active' },
        beta: { id: 'beta', name: 'Beta', status: 'active' },
        old: { id: 'old', name: 'Old', status: 'deprecated' },
      } }],
    },
    lifecycle: { signal: new AbortController().signal, onDispose: (fn: () => void) => { disposed.push(fn); return () => {}; } },
    // Any accidental request through the client fails the test.
    client: new Proxy({}, { get() { throw new Error('No LLM/client requests in the menu'); } }),
  };
  registerKikiMenu(api as unknown as TuiPluginApi, settings);
  return {
    api, settings,
    get command() { return command; },
    get view() { return view; },
    select(value: string) {
      const row = view.options.find(option => option.value === value)!;
      view.onSelect!(row);
    },
    close() { onClose?.(); open = false; },
    dispose() { disposed.forEach(fn => fn()); },
  };
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('/kiki model menu', () => {
  it('registers one native slash command with global as the default action', () => {
    const f = fixture();
    expect(f.command.slashName).toBe('kiki');
    f.command.run();
    expect(f.view.title).toBe('Kiki');
    expect(f.view.current).toBe('global');
    expect(f.view.options.map(row => row.title)).toEqual(['Modell ändern — global', 'Modell ändern — dieses Projekt']);
  });

  it('selects agent/model using host models and saves globally without changing the active chat model', async () => {
    const f = fixture(); f.command.run(); f.select('global');
    expect(f.view.options.find(row => row.value === 'kiki-planner')?.description).toContain('geerbt');
    f.select('kiki-reviewer');
    expect(f.view.current).toBe('provider/beta');
    expect(f.view.options.map(row => row.value)).toEqual(['provider/alpha', 'provider/beta']);
    expect(f.view.options[0].category).toBe('Provider');
    expect(f.view.flat).toBe(true);
    f.select('provider/alpha'); await tick();
    expect(f.settings.save).toHaveBeenCalledTimes(1);
    expect(f.settings.save).toHaveBeenCalledWith('global', 'kiki-reviewer', 'provider/alpha', ['provider/alpha', 'provider/beta']);
    expect(f.api.ui.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success', message: expect.stringMatching(/global.*OpenCode.*neu starten/) }));
    expect(f.api.ui.dialog.clear).toHaveBeenCalledTimes(1);
  });

  it('uses the explicit project action when selected', async () => {
    const f = fixture(); f.command.run(); f.select('project'); f.select('kiki-planner'); f.select('provider/beta'); await tick();
    expect(f.settings.save).toHaveBeenCalledWith('project', 'kiki-planner', 'provider/beta', expect.any(Array));
  });

  it('reports an existing project override after a global change', async () => {
    const f = fixture(); vi.mocked(f.settings.save).mockResolvedValue({ file: '/fixture/config', projectOverride: 'provider/project' });
    f.command.run(); f.select('global'); f.select('kiki-reviewer'); f.select('provider/alpha'); await tick();
    expect(f.api.ui.toast.mock.calls.flat().map(item => item.message).join(' ')).toContain('Projektzuordnung provider/project bleibt aktiv');
  });

  it('cancellation and stale callbacks cannot save or advance the menu', async () => {
    const f = fixture(); f.command.run(); const staleMenu = f.view;
    f.select('global'); f.select('kiki-reviewer');
    const staleModel = f.view;
    f.close();
    staleModel.onSelect!(staleModel.options[0]);
    staleMenu.onSelect!(staleMenu.options[1]);
    await tick();
    expect(f.settings.save).not.toHaveBeenCalled();
    expect(f.view).toBe(staleModel);
  });

  it('prevents duplicate saves while pending and after success', async () => {
    const f = fixture();
    let complete!: (value: { file: string }) => void;
    vi.mocked(f.settings.save).mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    f.command.run(); f.select('global'); f.select('kiki-reviewer');
    const selectedView = f.view;
    f.select('provider/alpha'); f.select('provider/alpha');
    expect(f.settings.save).toHaveBeenCalledTimes(1);
    complete({ file: '/fixture/config' }); await tick();
    selectedView.onSelect!(selectedView.options[0]); await tick();
    expect(f.settings.save).toHaveBeenCalledTimes(1);
  });

  it('save failures allow retry without a false success or leaked error contents', async () => {
    const f = fixture();
    vi.mocked(f.settings.save).mockRejectedValueOnce(new Error('sensitive-fixture-details'));
    f.command.run(); f.select('global'); f.select('kiki-reviewer'); f.select('provider/alpha'); await tick();
    expect(f.api.ui.dialog.clear).not.toHaveBeenCalled();
    expect(f.api.ui.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
    expect(JSON.stringify(f.api.ui.toast.mock.calls)).not.toContain('sensitive-fixture-details');
    f.select('provider/beta'); await tick();
    expect(f.settings.save).toHaveBeenCalledTimes(2);
    expect(f.api.ui.dialog.clear).toHaveBeenCalledTimes(1);
  });

  it('empty/deprecated model lists never offer a writable selection', () => {
    const f = fixture(); f.api.state.provider[0].models.alpha.status = 'deprecated'; f.api.state.provider[0].models.beta.status = 'deprecated';
    f.command.run(); f.select('global'); const agents = f.view; f.select('kiki-reviewer');
    expect(f.view).toBe(agents);
    expect(f.settings.save).not.toHaveBeenCalled();
    expect(f.api.ui.toast).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Keine verfügbaren Modelle') }));
  });

  it('rejects forged or no-longer-available model choices without writing', async () => {
    const f = fixture(); f.command.run(); f.select('global'); f.select('kiki-reviewer');
    f.view.onSelect!({ title: 'Forged', value: 'provider/unavailable' });
    f.api.state.provider[0].models.alpha.status = 'deprecated';
    f.select('provider/alpha'); await tick();
    expect(f.settings.save).not.toHaveBeenCalled();
  });

  it('plugin disposal invalidates all menu callbacks', async () => {
    const f = fixture(); f.command.run(); f.select('global'); f.select('kiki-reviewer');
    f.dispose(); f.select('provider/alpha'); await tick();
    expect(f.settings.save).not.toHaveBeenCalled();
  });

  it('project model dialog offers the global model as inherit entry and removes the local override', async () => {
    const f = fixture(); f.command.run(); f.select('project'); f.select('kiki-reviewer');
    expect(f.view.current).toBe('provider/local');
    expect(f.view.options[0]).toMatchObject({ title: 'Globales Modell (provider/beta) verwenden', value: '__inherit__' });
    f.select('__inherit__'); await tick();
    expect(f.settings.remove).toHaveBeenCalledTimes(1);
    expect(f.settings.remove).toHaveBeenCalledWith('project', 'kiki-reviewer');
    expect(f.settings.save).not.toHaveBeenCalled();
    expect(f.api.ui.toast).toHaveBeenCalledWith(expect.objectContaining({
      variant: 'success',
      message: expect.stringMatching(/provider\/local.*provider\/beta.*OpenCode.*neu starten/),
    }));
    expect(f.api.ui.dialog.clear).toHaveBeenCalledTimes(1);
  });

  it('shows no inherit entry for inherited agents or in global scope', () => {
    const f = fixture(); f.command.run(); f.select('project'); f.select('kiki-planner');
    expect(f.view.options.map(row => row.value)).toEqual(['provider/alpha', 'provider/beta']);
    f.command.run(); f.select('global'); f.select('kiki-reviewer');
    expect(f.view.options.map(row => row.value)).toEqual(['provider/alpha', 'provider/beta']);
  });

  it('project agent list offers delete-all behind a confirmation', async () => {
    const f = fixture(); f.command.run(); f.select('project');
    const agents = f.view;
    expect(agents.options.at(-1)).toMatchObject({ title: 'Alle lokalen Modell-Zuordnungen löschen', value: '__all__' });
    f.select('__all__');
    expect(f.view.title).toContain('Alle lokalen Modell-Zuordnungen löschen?');
    const confirm = f.view.options.map(row => row.value);
    expect(confirm).toEqual(['yes', 'no']);
    f.select('no'); await tick();
    expect(f.settings.removeAllProject).not.toHaveBeenCalled();
    f.select('__all__'); f.select('yes'); await tick();
    expect(f.settings.removeAllProject).toHaveBeenCalledTimes(1);
    expect(f.api.ui.toast).toHaveBeenCalledWith(expect.objectContaining({
      variant: 'success',
      message: expect.stringMatching(/1 lokale.*globale Modelle greifen.*OpenCode.*neu starten/),
    }));
  });

  it('global agent list has no delete-all entry', () => {
    const f = fixture(); f.command.run(); f.select('global');
    expect(f.view.options.map(row => row.value)).toEqual(['kiki-planner', 'kiki-reviewer']);
  });

  it('stale or disposed callbacks cannot remove overrides', async () => {
    const f = fixture(); f.command.run(); f.select('project'); f.select('kiki-reviewer');
    const staleModel = f.view;
    f.close();
    staleModel.onSelect!(staleModel.options[0]); await tick();
    expect(f.settings.remove).not.toHaveBeenCalled();
    f.command.run(); f.select('project');
    const staleAgents = f.view;
    f.dispose();
    staleAgents.onSelect!(staleAgents.options.at(-1)!); await tick();
    expect(f.settings.removeAllProject).not.toHaveBeenCalled();
  });

  it('offers the inherit entry even when no provider models are available', async () => {
    const f = fixture();
    f.api.state.provider[0].models.alpha.status = 'deprecated';
    f.api.state.provider[0].models.beta.status = 'deprecated';
    f.command.run(); f.select('project'); f.select('kiki-reviewer');
    expect(f.view.options.map(row => row.value)).toEqual(['__inherit__']);
    f.select('__inherit__'); await tick();
    expect(f.settings.remove).toHaveBeenCalledWith('project', 'kiki-reviewer');
  });

  it('remove failures show a generic error and allow retry', async () => {
    const f = fixture();
    vi.mocked(f.settings.remove).mockRejectedValueOnce(new Error('sensitive-fixture-details'));
    f.command.run(); f.select('project'); f.select('kiki-reviewer'); f.select('__inherit__'); await tick();
    expect(f.api.ui.dialog.clear).not.toHaveBeenCalled();
    expect(f.api.ui.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
    expect(JSON.stringify(f.api.ui.toast.mock.calls)).not.toContain('sensitive-fixture-details');
    f.select('__inherit__'); await tick();
    expect(f.settings.remove).toHaveBeenCalledTimes(2);
    expect(f.api.ui.dialog.clear).toHaveBeenCalledTimes(1);
  });
});
