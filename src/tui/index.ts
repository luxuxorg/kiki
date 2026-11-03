import type { TuiPlugin, TuiPluginModule } from '@opencode-ai/plugin/tui';
import { listAgentModels, setAgentModel, removeAgentModel, removeAllProjectModels, type ModelContext } from '../cli/opencode-config.js';
import { registerKikiMenu } from './model-menu.js';

const tui: TuiPlugin = async api => {
  function context(): ModelContext {
    const { config, worktree, directory } = api.state.path;
    if (!config || !directory) throw new Error('OpenCode paths are not available yet.');
    return {
      globalConfigDirectory: config,
      projectDirectory: worktree && worktree !== '/' ? worktree : directory,
    };
  }
  registerKikiMenu(api, {
    list: scope => listAgentModels(scope, context()),
    save: async (scope, agent, model, availableModels) => setAgentModel(scope, agent, model, availableModels, context()),
    remove: async (scope, agent) => removeAgentModel(scope, agent, context()),
    removeAllProject: async () => removeAllProjectModels(context()),
  });
};

export default { id: 'kiki', tui } satisfies TuiPluginModule;
