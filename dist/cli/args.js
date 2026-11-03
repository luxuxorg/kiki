export function parseScope(args, command, allowProject) {
    let project;
    let global = false;
    const help = args.includes('--help') || args.includes('-h');
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--help' || arg === '-h' || arg === '--force')
            continue;
        if (arg === '--global') {
            global = true;
            continue;
        }
        if (arg === '--project' && allowProject) {
            const value = args[++i];
            if (!value || value.startsWith('-') || project !== undefined)
                throw new Error(`${command}: --project requires one path.`);
            project = value;
            continue;
        }
        throw new Error(`${command}: unsupported argument '${arg}'. For existing projects use 'kiki migrate --project <path>'.`);
    }
    if (project && global)
        throw new Error('--project and --global are mutually exclusive.');
    return { project, help };
}
//# sourceMappingURL=args.js.map