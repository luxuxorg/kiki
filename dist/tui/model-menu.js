import { resolveTuiLanguage, tuiStrings } from './strings.js';
const INHERIT = '__inherit__';
const REMOVE_ALL = '__all__';
function label(strings, scope) {
    return scope === 'global' ? strings.scopeGlobal : strings.scopeProject;
}
/** The only status shown per scope: global override or project inheritance. */
function agentStatus(strings, row, scope) {
    if (scope === 'global' && row.projectOverride !== undefined)
        return strings.projectOverrideMarker;
    if (scope === 'project' && row.inherited)
        return strings.inheritedMarker;
    return undefined;
}
function hostReady(ctx) {
    const location = ctx.location;
    if (!location)
        return false;
    return ctx.data.location.provider.list(location) !== undefined
        && ctx.data.location.model.list(location) !== undefined;
}
/** Provider/model collections only: this module never sends prompts or changes chat state. */
function modelOptions(ctx) {
    const location = ctx.location;
    if (!location)
        return undefined;
    const providers = ctx.data.location.provider.list(location);
    const models = ctx.data.location.model.list(location);
    if (!providers || !models)
        return undefined;
    const names = new Map(providers.map((provider) => [provider.id, provider.name]));
    return models
        .filter((model) => names.has(model.providerID))
        .filter((model) => model.status !== 'deprecated'
        && !(model.providerID === 'opencode' && model.modelID.includes('-nano')))
        .map((model) => ({
        value: `${model.providerID}/${model.modelID}`,
        title: model.name || model.modelID,
        category: names.get(model.providerID) ?? model.providerID,
    }))
        .sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
}
/** Keep the existing searchable title/provider/model behavior in the native dialog. */
function searchOptions(language, query, options) {
    const needle = query.trim().toLocaleLowerCase(language);
    if (!needle)
        return options;
    return options.filter(option => [
        option.title,
        option.description ?? '',
        option.category ?? '',
        String(option.value),
    ].some(value => value.toLocaleLowerCase(language).includes(needle)));
}
export function registerKikiMenu(ctx, settings, language = resolveTuiLanguage(process.env)) {
    const strings = tuiStrings(language);
    let generation = 0;
    let disposed = false;
    let busy = false;
    const active = (token) => !disposed && token === generation;
    function savedToast(scope, agent, model, projectOverride) {
        ctx.ui.toast.show({
            variant: 'success',
            title: strings.savedTitle,
            message: strings.savedMessage(agent, model, label(strings, scope), projectOverride),
            duration: 8_000,
        });
    }
    async function save(token, scope, agent, model, availableModels) {
        try {
            const result = await settings.save(scope, agent, model, availableModels);
            if (!active(token))
                return;
            savedToast(scope, agent, model, result.projectOverride);
        }
        catch {
            if (active(token)) {
                ctx.ui.toast.show({
                    variant: 'error',
                    message: strings.saveFailed,
                });
            }
        }
    }
    async function remove(token, scope, agent) {
        try {
            const result = await settings.remove(scope, agent);
            if (!active(token))
                return;
            ctx.ui.toast.show({
                variant: 'success',
                title: strings.resetTitle,
                message: result.removed
                    ? strings.removedMessage(agent, result.removed, result.effective || strings.openCodeDefault)
                    : strings.noLocalModelMessage(agent),
                duration: 8_000,
            });
        }
        catch {
            if (active(token)) {
                ctx.ui.toast.show({
                    variant: 'error',
                    message: strings.removeFailed,
                });
            }
        }
    }
    async function modelFlow(token, scope, agent) {
        const row = settings.list(scope).find(item => item.name === agent);
        if (!row)
            return;
        const available = modelOptions(ctx);
        if (!available) {
            ctx.ui.toast.show({ variant: 'info', message: strings.loading });
            return;
        }
        const globalModel = scope === 'project'
            ? settings.list('global').find(item => item.name === agent)?.model || strings.openCodeDefault
            : '';
        const inherit = scope === 'project' && row.projectOverride !== undefined
            ? [{
                    title: strings.inheritTitle(globalModel),
                    value: INHERIT,
                }]
            : [];
        if (!available.length && !inherit.length) {
            ctx.ui.toast.show({
                variant: 'info',
                message: strings.noModels,
            });
            return;
        }
        const options = [...inherit, ...available];
        const selected = await ctx.ui.dialog.select({
            title: strings.modelDialogTitle(agent, label(strings, scope)),
            placeholder: strings.modelSearchPlaceholder,
            options,
            current: row.model,
            search: (query, searchable) => searchOptions(language, query, searchable),
        });
        if (!active(token) || selected === undefined)
            return;
        if (!options.some(option => option.value === selected))
            return;
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
                    message: strings.modelUnavailable,
                });
            }
            return;
        }
        const freshRow = settings.list(scope).find(item => item.name === agent);
        if (!freshRow) {
            if (active(token))
                ctx.ui.toast.show({ variant: 'error', message: strings.configReadError });
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
    async function removeAll(token) {
        const confirmed = await ctx.ui.dialog.confirm({
            title: strings.deleteAllTitle,
            message: strings.deleteAllMessage,
            label: { confirm: strings.deleteAllConfirm, cancel: strings.deleteAllCancel },
        });
        if (!active(token) || confirmed === undefined)
            return;
        if (!confirmed) {
            await agentFlow(token, 'project');
            return;
        }
        try {
            const result = await settings.removeAllProject();
            if (!active(token))
                return;
            ctx.ui.toast.show({
                variant: 'success',
                title: strings.modelsResetTitle,
                message: result.removed.length
                    ? strings.removedAllMessage(result.removed.length)
                    : strings.noLocalAssignments,
                duration: 8_000,
            });
        }
        catch {
            if (active(token)) {
                ctx.ui.toast.show({
                    variant: 'error',
                    message: strings.removeAllFailed,
                });
            }
        }
    }
    async function agentFlow(token, scope) {
        const options = settings.list(scope).map(row => {
            const footer = agentStatus(strings, row, scope);
            return {
                category: row.name,
                title: row.model || strings.openCodeDefault,
                value: row.name,
                ...(footer ? { footer } : {}),
            };
        });
        if (scope === 'project') {
            options.push({
                title: strings.deleteAllOption,
                value: REMOVE_ALL,
                description: strings.deleteAllOptionDescription,
            });
        }
        const agent = await ctx.ui.dialog.select({
            title: strings.agentDialogTitle(label(strings, scope)),
            placeholder: strings.agentSearchPlaceholder,
            options,
        });
        if (!active(token) || agent === undefined)
            return;
        if (!options.some(option => option.value === agent))
            return;
        if (agent === REMOVE_ALL) {
            await removeAll(token);
            return;
        }
        await modelFlow(token, scope, agent);
    }
    async function run() {
        if (disposed || busy)
            return;
        if (!hostReady(ctx)) {
            ctx.ui.toast.show({ variant: 'info', message: strings.loading });
            return;
        }
        const token = ++generation;
        busy = true;
        try {
            const scope = await ctx.ui.dialog.select({
                title: strings.scopeDialogTitle,
                current: 'global',
                options: [
                    { title: strings.changeModelGlobal, value: 'global' },
                    { title: strings.changeModelProject, value: 'project' },
                ],
            });
            if (!active(token) || scope === undefined)
                return;
            if (scope !== 'global' && scope !== 'project')
                return;
            await agentFlow(token, scope);
        }
        catch {
            if (active(token))
                ctx.ui.toast.show({ variant: 'error', message: strings.configReadError });
        }
        finally {
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
//# sourceMappingURL=model-menu.js.map