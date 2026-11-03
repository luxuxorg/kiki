import { KikiConfig } from './config.js';
export type Settings = Record<string, any>;
export declare const AGENT_NAMES: string[];
export declare function globalDirectory(): string;
export declare function mergeSettings(base: Settings, extra: Settings): Settings;
export declare function readSettings(file: string): Settings;
export declare function readOpenCodeSettings(directory: string, global?: boolean): Settings;
export type ModelScope = 'global' | 'project';
export interface ModelContext {
    projectDirectory: string;
    globalConfigDirectory: string;
}
export interface AgentModelRow {
    name: string;
    model?: string;
    inherited: boolean;
    projectOverride?: string;
}
export interface ModelSaveResult {
    file: string;
    projectOverride?: string;
}
export declare function listAgentModels(scope: ModelScope, context: ModelContext): AgentModelRow[];
export declare function setAgentModel(scope: ModelScope, agent: string, model: string, availableModels: readonly string[], context: ModelContext): ModelSaveResult;
export interface ModelRemoveResult {
    file: string;
    removed?: string;
    effective?: string;
}
export interface ModelRemoveAllResult {
    files: string[];
    removed: {
        agent: string;
        model: string;
    }[];
}
export declare function removeAgentModel(scope: ModelScope, agent: string, context: ModelContext): ModelRemoveResult;
export declare function removeAllProjectModels(context: ModelContext): ModelRemoveAllResult;
export declare function parseAgent(text: string, label: string): {
    settings: Settings;
    prompt: string;
};
export declare function baselineAgents(config?: KikiConfig): Record<string, {
    settings: Settings;
    prompt: string;
}>;
export declare function installGlobalFiles(directory?: string, update?: boolean): void;
export declare function initializeProjectAgents(project: string, config: KikiConfig, directory?: string): void;
export declare function migrateProject(project: string, global?: string): void;
export declare function resetProject(project: string): void;
//# sourceMappingURL=opencode-config.d.ts.map