import type { TuiPluginApi } from '@opencode-ai/plugin/tui';
import type { AgentModelRow, ModelRemoveAllResult, ModelRemoveResult, ModelScope, ModelSaveResult } from '../cli/opencode-config.js';
export interface ModelSettings {
    list(scope: ModelScope): AgentModelRow[];
    save(scope: ModelScope, agent: string, model: string, availableModels: readonly string[]): Promise<ModelSaveResult>;
    remove(scope: ModelScope, agent: string): Promise<ModelRemoveResult>;
    removeAllProject(): Promise<ModelRemoveAllResult>;
}
/** Native dialogs only: this module never sends a prompt or changes chat state. */
export declare function registerKikiMenu(api: TuiPluginApi, settings: ModelSettings): void;
//# sourceMappingURL=model-menu.d.ts.map