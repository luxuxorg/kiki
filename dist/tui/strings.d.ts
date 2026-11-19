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
/** German only when the first non-empty locale variable names German. */
export declare function resolveTuiLanguage(env?: NodeJS.ProcessEnv): TuiLanguage;
export declare function tuiStrings(language: TuiLanguage): TuiStrings;
//# sourceMappingURL=strings.d.ts.map