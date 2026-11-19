/**
 * Central TUI copy. The language is resolved once from the environment at
 * plugin setup (LC_ALL > LC_MESSAGES > LANG, first non-empty value wins) and
 * never changes while the TUI runs. There is no manual override.
 */
export type TuiLanguage = 'de' | 'en';

export interface TuiStrings {
  readonly loading: string;
  readonly configReadError: string;
  readonly setupError: string;
  readonly scopeGlobal: string;
  readonly scopeProject: string;
  readonly savedTitle: string;
  savedMessage(agent: string, model: string, scope: string, projectOverride?: string): string;
  readonly saveFailed: string;
  readonly resetTitle: string;
  removedMessage(agent: string, removed: string, effective: string): string;
  noLocalModelMessage(agent: string): string;
  readonly removeFailed: string;
  readonly openCodeDefault: string;
  inheritTitle(globalModel: string): string;
  readonly noModels: string;
  modelDialogTitle(agent: string, scope: string): string;
  readonly modelSearchPlaceholder: string;
  readonly modelUnavailable: string;
  readonly deleteAllTitle: string;
  readonly deleteAllMessage: string;
  readonly deleteAllConfirm: string;
  readonly deleteAllCancel: string;
  readonly modelsResetTitle: string;
  removedAllMessage(count: number): string;
  readonly noLocalAssignments: string;
  readonly removeAllFailed: string;
  readonly inheritedMarker: string;
  readonly projectOverrideMarker: string;
  readonly deleteAllOption: string;
  readonly deleteAllOptionDescription: string;
  agentDialogTitle(scope: string): string;
  readonly agentSearchPlaceholder: string;
  readonly scopeDialogTitle: string;
  readonly changeModelGlobal: string;
  readonly changeModelProject: string;
}

const de: TuiStrings = {
  loading: 'OpenCode lädt noch. /kiki gleich erneut öffnen.',
  configReadError: 'Kiki-Konfiguration konnte nicht gelesen werden. Konfiguration und Zugriffsrechte prüfen.',
  setupError: 'Kiki konnte nicht gestartet werden: OpenCode-2-Konfiguration ist überlappend, ungültig oder nicht beschreibbar. Konfiguration und Zugriffsrechte prüfen.',
  scopeGlobal: 'global',
  scopeProject: 'dieses Projekt',
  savedTitle: 'Kiki-Modell gespeichert',
  savedMessage: (agent, model, scope, projectOverride) =>
    `${agent}: ${model} (${scope}).${projectOverride ? ` Projektzuordnung ${projectOverride} bleibt aktiv.` : ''} OpenCode neu starten.`,
  saveFailed: 'Modellzuordnung konnte nicht gespeichert werden. Konfiguration und Schreibrechte prüfen; anschließend erneut auswählen.',
  resetTitle: 'Kiki-Modell zurückgesetzt',
  removedMessage: (agent, removed, effective) =>
    `${agent}: lokales Modell ${removed} entfernt; ${effective} (global) greift. OpenCode neu starten.`,
  noLocalModelMessage: agent => `${agent}: kein lokales Modell vorhanden. OpenCode neu starten.`,
  removeFailed: 'Modell-Zuordnung konnte nicht entfernt werden. Konfiguration und Schreibrechte prüfen; anschließend erneut auswählen.',
  openCodeDefault: 'OpenCode-Standard',
  inheritTitle: globalModel => `Globales Modell (${globalModel}) verwenden`,
  noModels: 'Keine verfügbaren Modelle. Zuerst einen Provider in OpenCode verbinden.',
  modelDialogTitle: (agent, scope) => `${agent} — Modell (${scope})`,
  modelSearchPlaceholder: 'Modell oder Provider suchen',
  modelUnavailable: 'Dieses Modell ist nicht mehr verfügbar. Modellauswahl erneut öffnen.',
  deleteAllTitle: 'Alle lokalen Modell-Zuordnungen löschen?',
  deleteAllMessage: 'Globale Modelle greifen wieder.',
  deleteAllConfirm: 'Ja, alle löschen',
  deleteAllCancel: 'Abbrechen',
  modelsResetTitle: 'Kiki-Modelle zurückgesetzt',
  removedAllMessage: count =>
    `${count} lokale Modell-Zuordnung(en) entfernt; globale Modelle greifen. OpenCode neu starten.`,
  noLocalAssignments: 'Keine lokalen Modell-Zuordnungen vorhanden. OpenCode neu starten.',
  removeAllFailed: 'Lokale Modell-Zuordnungen konnten nicht entfernt werden. Konfiguration und Schreibrechte prüfen; anschließend erneut auswählen.',
  inheritedMarker: 'Global',
  projectOverrideMarker: 'Projekt',
  deleteAllOption: 'Alle lokalen Modell-Zuordnungen löschen',
  deleteAllOptionDescription: 'Globale Modelle greifen wieder',
  agentDialogTitle: scope => `Kiki-Agent auswählen — ${scope}`,
  agentSearchPlaceholder: 'Agent suchen',
  scopeDialogTitle: 'Kiki',
  changeModelGlobal: 'Modell ändern — global',
  changeModelProject: 'Modell ändern — dieses Projekt',
};

const en: TuiStrings = {
  loading: 'OpenCode is still loading. Open /kiki again shortly.',
  configReadError: 'Kiki configuration could not be read. Check configuration and access permissions.',
  setupError: 'Kiki failed to start: OpenCode 2 configuration is overlapping, invalid, or not writable. Check configuration and access permissions.',
  scopeGlobal: 'global',
  scopeProject: 'this project',
  savedTitle: 'Kiki model saved',
  savedMessage: (agent, model, scope, projectOverride) =>
    `${agent}: ${model} (${scope}).${projectOverride ? ` Project assignment ${projectOverride} remains active.` : ''} Restart OpenCode.`,
  saveFailed: 'Model assignment could not be saved. Check configuration and write permissions, then select again.',
  resetTitle: 'Kiki model reset',
  removedMessage: (agent, removed, effective) =>
    `${agent}: local model ${removed} removed; ${effective} (global) applies. Restart OpenCode.`,
  noLocalModelMessage: agent => `${agent}: no local model present. Restart OpenCode.`,
  removeFailed: 'Model assignment could not be removed. Check configuration and write permissions, then select again.',
  openCodeDefault: 'OpenCode default',
  inheritTitle: globalModel => `Use global model (${globalModel})`,
  noModels: 'No models available. Connect a provider in OpenCode first.',
  modelDialogTitle: (agent, scope) => `${agent} — Model (${scope})`,
  modelSearchPlaceholder: 'Search model or provider',
  modelUnavailable: 'This model is no longer available. Reopen the model selection.',
  deleteAllTitle: 'Delete all local model assignments?',
  deleteAllMessage: 'Global models apply again.',
  deleteAllConfirm: 'Yes, delete all',
  deleteAllCancel: 'Cancel',
  modelsResetTitle: 'Kiki models reset',
  removedAllMessage: count =>
    `${count} local model assignment(s) removed; global models apply. Restart OpenCode.`,
  noLocalAssignments: 'No local model assignments present. Restart OpenCode.',
  removeAllFailed: 'Local model assignments could not be removed. Check configuration and write permissions, then select again.',
  inheritedMarker: 'Global',
  projectOverrideMarker: 'Project',
  deleteAllOption: 'Delete all local model assignments',
  deleteAllOptionDescription: 'Global models apply again',
  agentDialogTitle: scope => `Select Kiki agent — ${scope}`,
  agentSearchPlaceholder: 'Search agent',
  scopeDialogTitle: 'Kiki',
  changeModelGlobal: 'Change model — global',
  changeModelProject: 'Change model — this project',
};

/** German only when the first non-empty locale variable names German. */
export function resolveTuiLanguage(env: NodeJS.ProcessEnv = process.env): TuiLanguage {
  for (const name of ['LC_ALL', 'LC_MESSAGES', 'LANG'] as const) {
    const value = env[name];
    if (typeof value !== 'string' || !value.trim()) continue;
    const locale = value.trim().toLowerCase().split(/[.@]/, 1)[0] ?? '';
    return locale === 'de' || locale.startsWith('de_') || locale.startsWith('de-') ? 'de' : 'en';
  }
  return 'en';
}

export function tuiStrings(language: TuiLanguage): TuiStrings {
  return language === 'de' ? de : en;
}
