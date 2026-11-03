import { listAgentModels, setAgentModel, removeAgentModel, removeAllProjectModels } from '../cli/opencode-config.js';
import { registerKikiMenu } from './model-menu.js';
const tui = async (api) => {
    function context() {
        const { config, worktree, directory } = api.state.path;
        if (!config || !directory)
            throw new Error('OpenCode paths are not available yet.');
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
export default { id: 'kiki', tui };
//# sourceMappingURL=index.js.map