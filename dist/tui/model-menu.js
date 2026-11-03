const INHERIT = '__inherit__';
const REMOVE_ALL = '__all__';
function models(api) {
    return api.state.provider.flatMap(provider => Object.entries(provider.models)
        .filter(([id, model]) => model.status !== 'deprecated' && !(provider.id === 'opencode' && id.includes('-nano')))
        .map(([id, model]) => ({
        value: `${provider.id}/${id}`,
        title: model.name || id,
        category: provider.name,
    })))
        .sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
}
/** Native dialogs only: this module never sends a prompt or changes chat state. */
export function registerKikiMenu(api, settings) {
    let generation = 0;
    let disposed = false;
    let busy = false;
    const active = (token) => !disposed && !api.lifecycle.signal.aborted && token === generation && api.ui.dialog.open;
    const label = (scope) => scope === 'global' ? 'global' : 'dieses Projekt';
    function show(props) {
        const token = ++generation;
        api.ui.dialog.replace(() => api.ui.DialogSelect({
            ...props,
            onSelect(option) {
                if (!active(token) || busy)
                    return;
                const offered = props.options.find(item => item.value === option.value && !item.disabled);
                if (!offered)
                    return;
                try {
                    props.onSelect?.(offered);
                }
                catch {
                    api.ui.toast({ variant: 'error', message: 'Kiki-Konfiguration konnte nicht gelesen werden. Konfiguration und Zugriffsrechte prüfen.' });
                }
            },
        }), () => {
            if (generation === token)
                generation++;
        });
    }
    function showModels(scope, agent) {
        const row = settings.list(scope).find(item => item.name === agent);
        if (!row)
            return;
        const options = models(api);
        const inherit = scope === 'project' && row.projectOverride !== undefined
            ? [{
                    title: `Globales Modell (${settings.list('global').find(item => item.name === agent)?.model || 'OpenCode-Standard'}) verwenden`,
                    value: INHERIT,
                }]
            : [];
        if (!options.length && !inherit.length) {
            api.ui.toast({ variant: 'info', message: 'Keine verfügbaren Modelle. Zuerst einen Provider in OpenCode verbinden.' });
            return;
        }
        show({
            title: `${agent} — Modell (${label(scope)})`,
            placeholder: 'Modell oder Provider suchen',
            options: [...inherit, ...options],
            flat: true,
            current: row.model,
            onSelect(option) {
                if (option.value === INHERIT) {
                    void remove(scope, agent);
                    return;
                }
                const available = models(api).map(item => item.value);
                if (!available.includes(option.value)) {
                    api.ui.toast({ variant: 'error', message: 'Dieses Modell ist nicht mehr verfügbar. Modellauswahl erneut öffnen.' });
                    return;
                }
                void save(scope, agent, option.value, available);
            },
        });
    }
    async function save(scope, agent, model, available) {
        const token = generation;
        busy = true;
        try {
            const result = await settings.save(scope, agent, model, available);
            if (!active(token))
                return;
            api.ui.dialog.clear();
            const override = result.projectOverride ? ` Projektzuordnung ${result.projectOverride} bleibt aktiv.` : '';
            api.ui.toast({
                variant: 'success',
                title: 'Kiki-Modell gespeichert',
                message: `${agent}: ${model} (${label(scope)}).${override} OpenCode neu starten.`,
                duration: 8_000,
            });
        }
        catch {
            if (active(token))
                api.ui.toast({ variant: 'error', message: 'Modellzuordnung konnte nicht gespeichert werden. Konfiguration und Schreibrechte prüfen; anschließend erneut auswählen.' });
        }
        finally {
            busy = false;
        }
    }
    async function remove(scope, agent) {
        const token = generation;
        busy = true;
        try {
            const result = await settings.remove(scope, agent);
            if (!active(token))
                return;
            api.ui.dialog.clear();
            api.ui.toast({
                variant: 'success',
                title: 'Kiki-Modell zurückgesetzt',
                message: result.removed
                    ? `${agent}: lokales Modell ${result.removed} entfernt; ${result.effective || 'OpenCode-Standard'} (global) greift. OpenCode neu starten.`
                    : `${agent}: kein lokales Modell vorhanden. OpenCode neu starten.`,
                duration: 8_000,
            });
        }
        catch {
            if (active(token))
                api.ui.toast({ variant: 'error', message: 'Modell-Zuordnung konnte nicht entfernt werden. Konfiguration und Schreibrechte prüfen; anschließend erneut auswählen.' });
        }
        finally {
            busy = false;
        }
    }
    async function removeAll() {
        const token = generation;
        busy = true;
        try {
            const result = await settings.removeAllProject();
            if (!active(token))
                return;
            api.ui.dialog.clear();
            api.ui.toast({
                variant: 'success',
                title: 'Kiki-Modelle zurückgesetzt',
                message: result.removed.length
                    ? `${result.removed.length} lokale Modell-Zuordnung(en) entfernt; globale Modelle greifen. OpenCode neu starten.`
                    : 'Keine lokalen Modell-Zuordnungen vorhanden. OpenCode neu starten.',
                duration: 8_000,
            });
        }
        catch {
            if (active(token))
                api.ui.toast({ variant: 'error', message: 'Lokale Modell-Zuordnungen konnten nicht entfernt werden. Konfiguration und Schreibrechte prüfen; anschließend erneut auswählen.' });
        }
        finally {
            busy = false;
        }
    }
    function showRemoveAllConfirm() {
        show({
            title: 'Alle lokalen Modell-Zuordnungen löschen?',
            options: [
                { title: 'Ja, alle löschen', value: 'yes' },
                { title: 'Abbrechen', value: 'no' },
            ],
            onSelect(option) {
                if (option.value === 'yes')
                    void removeAll();
                else
                    showAgents('project');
            },
        });
    }
    function showAgents(scope) {
        const rows = settings.list(scope);
        const options = rows.map(row => ({
            title: row.name,
            value: row.name,
            description: `${row.model || 'OpenCode-Standard'}${row.inherited ? ' (geerbt)' : ''}`,
        }));
        if (scope === 'project')
            options.push({ title: 'Alle lokalen Modell-Zuordnungen löschen', value: REMOVE_ALL, description: 'Globale Modelle greifen wieder' });
        show({
            title: `Kiki-Agent auswählen — ${label(scope)}`,
            placeholder: 'Agent suchen',
            options,
            onSelect(option) {
                if (option.value === REMOVE_ALL) {
                    showRemoveAllConfirm();
                    return;
                }
                showModels(scope, option.value);
            },
        });
    }
    api.keymap.registerLayer({
        commands: [{
                name: 'kiki.menu', namespace: 'palette', title: 'Kiki', category: 'Kiki', slashName: 'kiki',
                run() {
                    if (disposed || api.lifecycle.signal.aborted || busy)
                        return;
                    if (!api.state.ready) {
                        api.ui.toast({ variant: 'info', message: 'OpenCode lädt noch. /kiki gleich erneut öffnen.' });
                        return;
                    }
                    show({
                        title: 'Kiki', current: 'global',
                        options: [
                            { title: 'Modell ändern — global', value: 'global' },
                            { title: 'Modell ändern — dieses Projekt', value: 'project' },
                        ],
                        onSelect(option) { showAgents(option.value); },
                    });
                },
            }],
    });
    api.lifecycle.onDispose(() => { disposed = true; generation++; });
}
//# sourceMappingURL=model-menu.js.map