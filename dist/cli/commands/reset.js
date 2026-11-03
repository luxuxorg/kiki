import { parseScope } from '../args.js';
import { resetProject } from '../opencode-config.js';
export async function reset(args) {
    const { project, help } = parseScope(args, 'reset', true);
    if (help) {
        console.log('Usage: kiki reset --project <path> — remove Kiki agent overrides; retain project data.');
        return;
    }
    if (!project)
        throw new Error('Usage: kiki reset --project <path>');
    resetProject(project);
}
//# sourceMappingURL=reset.js.map