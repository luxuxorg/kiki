import type { Plugin } from '@opencode/plugin/tui';
import type { AgentModelRow, ModelRemoveAllResult, ModelRemoveResult, ModelScope, ModelSaveResult } from '../cli/opencode-config.js';

export interface ModelSettings {
  list(scope: ModelScope): AgentModelRow[];
  save(scope: ModelScope, agent: string, model: string, availableModels: readonly string[]): Promise<ModelSaveResult>;
  remove(scope: ModelScope, agent: string): Promise<ModelRemoveResult>;
  removeAllProject(): Promise<ModelRemoveAllResult>;
}

const INHERIT = '__inherit__';
const REMOVE_ALL = '__all__';
const LOADING_MESSAGE = 'OpenCode lädt noch. /kiki gleich erneut öffnen.';
const CONFIG_READ_ERROR = 'Kiki-Konfiguration konnte nicht gelesen werden. Konfiguration und Zugriffsrechte prüfen.';

type TuiModel = NonNullable<ReturnType<Plugin.Context['data']['location']['model']['list']>>[number];
type TuiProvider = NonNullable<ReturnType<Plugin.Context['data']['location']['provider']['list']>>[number];

interface ModelOption {
  value: string;
  title: string;
  category: string;
}

interface SearchableOption<Value> {
  readonly title: string;
  readonly value: Value;
  readonly description?: string;
  readonly category?: string;
}

function label(scope: ModelScope): string {
  return scope === 'global' ? 'global' : 'dieses Projekt';
}

function hostReady(ctx: Plugin.Context): boolean {
  const location = ctx.location;
  if (!location) return false;
  return ctx.data.location.provider.list(location) !== undefined
    && ctx.data.location.model.list(location) !== undefined;
}

/** Provider/model collections only: this module never sends prompts or changes chat state. */
function modelOptions(ctx: Plugin.Context): ModelOption[] | undefined {
  const location = ctx.location;
  if (!location) return undefined;
  const providers = ctx.data.location.provider.list(location);
  const models = ctx.data.location.model.list(location);
  if (!providers || !models) return undefined;
  const names = new Map<string, string>(providers.map((provider: TuiProvider) => [provider.id, provider.name]));
  return models
    .filter((model: TuiModel) => names.has(model.providerID))
    .filter((model: TuiModel) => model.status !== 'deprecated'
      && !(model.providerID === 'opencode' && model.modelID.includes('-nano')))
    .map((model: TuiModel) => ({
      value: `${model.providerID}/${model.modelID}`,
      title: model.name || model.modelID,
      category: names.get(model.providerID) ?? model.providerID,
    }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
}

/** Keep the existing searchable title/provider/model behavior in the native dialog. */
function searchOptions<Value>(
  query: string, options: readonly SearchableOption<Value>[],
): readonly SearchableOption<Value>[] {
  const needle = query.trim().toLocaleLowerCase('de');
  if (!needle) return options;
  return options.filter(option => [
    option.title,
    option.description ?? '',
    option.category ?? '',
    String(option.value),
  ].some(value => value.toLocaleLowerCase('de').includes(needle)));
}

export function registerKikiMenu(ctx: Plugin.Context, settings: ModelSettings): () => void {
  let generation = 0;
  let disposed = false;
  let busy = false;
  const active = (token: number) => !disposed && token === generation;

  function savedToast(scope: ModelScope, agent: string, model: string, projectOverride?: string): void {
    const override = projectOverride ? ` Projektzuordnung ${projectOverride} bleibt aktiv.` : '';
    ctx.ui.toast.show({
      variant: 'success',
      title: 'Kiki-Modell gespeichert',
      message: `${agent}: ${model} (${label(scope)}).${override} OpenCode neu starten.`,
      duration: 8_000,
    });
  }

  async function save(
    token: number, scope: ModelScope, agent: string, model: string, availableModels: readonly string[],
  ): Promise<void> {
    try {
      const result = await settings.save(scope, agent, model, availableModels);
      if (!active(token)) return;
      savedToast(scope, agent, model, result.projectOverride);
    } catch {
      if (active(token)) {
        ctx.ui.toast.show({
          variant: 'error',
          message: 'Modellzuordnung konnte nicht gespeichert werden. Konfiguration und Schreibrechte prüfen; anschließend erneut auswählen.',
        });
      }
    }
  }

  async function remove(token: number, scope: ModelScope, agent: string): Promise<void> {
    try {
      const result = await settings.remove(scope, agent);
      if (!active(token)) return;
      ctx.ui.toast.show({
        variant: 'success',
        title: 'Kiki-Modell zurückgesetzt',
        message: result.removed
          ? `${agent}: lokales Modell ${result.removed} entfernt; ${result.effective || 'OpenCode-Standard'} (global) greift. OpenCode neu starten.`
          : `${agent}: kein lokales Modell vorhanden. OpenCode neu starten.`,
        duration: 8_000,
      });
    } catch {
      if (active(token)) {
        ctx.ui.toast.show({
          variant: 'error',
          message: 'Modell-Zuordnung konnte nicht entfernt werden. Konfiguration und Schreibrechte prüfen; anschließend erneut auswählen.',
        });
      }
    }
  }

  async function modelFlow(token: number, scope: ModelScope, agent: string): Promise<void> {
    const row = settings.list(scope).find(item => item.name === agent);
    if (!row) return;
    const available = modelOptions(ctx);
    if (!available) {
      ctx.ui.toast.show({ variant: 'info', message: LOADING_MESSAGE });
      return;
    }
    const globalModel = scope === 'project'
      ? settings.list('global').find(item => item.name === agent)?.model || 'OpenCode-Standard'
      : '';
    const inherit = scope === 'project' && row.projectOverride !== undefined
      ? [{
          title: `Globales Modell (${globalModel}) verwenden`,
          value: INHERIT,
        }]
      : [];
    if (!available.length && !inherit.length) {
      ctx.ui.toast.show({
        variant: 'info',
        message: 'Keine verfügbaren Modelle. Zuerst einen Provider in OpenCode verbinden.',
      });
      return;
    }
    const options = [...inherit, ...available];
    const selected = await ctx.ui.dialog.select<string>({
      title: `${agent} — Modell (${label(scope)})`,
      placeholder: 'Modell oder Provider suchen',
      options,
      current: row.model,
      search: searchOptions,
    });
    if (!active(token) || selected === undefined) return;
    if (!options.some(option => option.value === selected)) return;
    if (selected === INHERIT) {
      await remove(token, scope, agent);
      return;
    }

    // Re-read both availability and the effective row after the dialog resolves:
    // providers may disappear, config may change, or the selection may be a no-op.
    const fresh = modelOptions(ctx);
    if (!fresh || !fresh.some(option => option.value === selected)) {
      if (active(token)) {
        ctx.ui.toast.show({
          variant: 'error',
          message: 'Dieses Modell ist nicht mehr verfügbar. Modellauswahl erneut öffnen.',
        });
      }
      return;
    }
    const freshRow = settings.list(scope).find(item => item.name === agent);
    if (!freshRow) {
      if (active(token)) ctx.ui.toast.show({ variant: 'error', message: CONFIG_READ_ERROR });
      return;
    }
    // Selecting the already-effective string ID is a no-op. Saving the same
    // provider/model again would have no user-visible benefit and could drop a
    // variant that the string-ID settings contract cannot represent.
    if (freshRow.model === selected) {
      savedToast(scope, agent, selected, scope === 'global' ? freshRow.projectOverride : undefined);
      return;
    }
    await save(token, scope, agent, selected, fresh.map(option => option.value));
  }

  async function removeAll(token: number): Promise<void> {
    const confirmed = await ctx.ui.dialog.confirm({
      title: 'Alle lokalen Modell-Zuordnungen löschen?',
      message: 'Globale Modelle greifen wieder.',
      label: { confirm: 'Ja, alle löschen', cancel: 'Abbrechen' },
    });
    if (!active(token) || confirmed === undefined) return;
    if (!confirmed) {
      await agentFlow(token, 'project');
      return;
    }
    try {
      const result = await settings.removeAllProject();
      if (!active(token)) return;
      ctx.ui.toast.show({
        variant: 'success',
        title: 'Kiki-Modelle zurückgesetzt',
        message: result.removed.length
          ? `${result.removed.length} lokale Modell-Zuordnung(en) entfernt; globale Modelle greifen. OpenCode neu starten.`
          : 'Keine lokalen Modell-Zuordnungen vorhanden. OpenCode neu starten.',
        duration: 8_000,
      });
    } catch {
      if (active(token)) {
        ctx.ui.toast.show({
          variant: 'error',
          message: 'Lokale Modell-Zuordnungen konnten nicht entfernt werden. Konfiguration und Schreibrechte prüfen; anschließend erneut auswählen.',
        });
      }
    }
  }

  async function agentFlow(token: number, scope: ModelScope): Promise<void> {
    const options: { title: string; value: string; description: string }[] = settings.list(scope)
      .map(row => ({
        title: row.name,
        value: row.name,
        description: `${row.model || 'OpenCode-Standard'}${row.inherited ? ' (geerbt)' : ''}`,
      }));
    if (scope === 'project') {
      options.push({
        title: 'Alle lokalen Modell-Zuordnungen löschen',
        value: REMOVE_ALL,
        description: 'Globale Modelle greifen wieder',
      });
    }
    const agent = await ctx.ui.dialog.select<string>({
      title: `Kiki-Agent auswählen — ${label(scope)}`,
      placeholder: 'Agent suchen',
      options,
      search: searchOptions,
    });
    if (!active(token) || agent === undefined) return;
    if (!options.some(option => option.value === agent)) return;
    if (agent === REMOVE_ALL) {
      await removeAll(token);
      return;
    }
    await modelFlow(token, scope, agent);
  }

  async function run(): Promise<void> {
    if (disposed || busy) return;
    if (!hostReady(ctx)) {
      ctx.ui.toast.show({ variant: 'info', message: LOADING_MESSAGE });
      return;
    }
    const token = ++generation;
    busy = true;
    try {
      const scope = await ctx.ui.dialog.select<ModelScope>({
        title: 'Kiki',
        current: 'global',
        options: [
          { title: 'Modell ändern — global', value: 'global' },
          { title: 'Modell ändern — dieses Projekt', value: 'project' },
        ],
      });
      if (!active(token) || scope === undefined) return;
      if (scope !== 'global' && scope !== 'project') return;
      await agentFlow(token, scope);
    } catch {
      if (active(token)) ctx.ui.toast.show({ variant: 'error', message: CONFIG_READ_ERROR });
    } finally {
      busy = false;
    }
  }

  ctx.keymap.layer(() => ({
    // Prompt slash commands live in the global input mode; the layer default
    // (`base`) is not reachable from the prompt's slash completion.
    mode: 'global',
    commands: [{
      id: 'kiki.menu',
      title: 'Kiki',
      group: 'Kiki',
      palette: true,
      slash: { name: 'kiki' },
      run: () => run(),
    }],
  }));

  return () => {
    disposed = true;
    generation++;
  };
}
