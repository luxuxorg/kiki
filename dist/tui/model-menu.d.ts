import type { Plugin } from '@opencode/plugin/tui';
import type { AgentModelRow, ModelRemoveAllResult, ModelRemoveResult, ModelScope, ModelSaveResult } from '../cli/opencode-config.js';
export interface ModelSettings {
    list(scope: ModelScope): AgentModelRow[];
    save(scope: ModelScope, agent: string, model: string, availableModels: readonly string[]): Promise<ModelSaveResult>;
    remove(scope: ModelScope, agent: string): Promise<ModelRemoveResult>;
    removeAllProject(): Promise<ModelRemoveAllResult>;
}
export declare function registerKikiMenu(ctx: Plugin.Context, settings: ModelSettings): () => void;
//# sourceMappingURL=model-menu.d.ts.map