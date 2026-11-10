/** Verified V1 action keys. Unknown keys are rejected instead of guessed. */
const KNOWN_ACTIONS = new Set([
    'read', 'edit', 'glob', 'grep', 'list', 'bash', 'task', 'external_directory',
    'todowrite', 'question', 'webfetch', 'websearch', 'lsp', 'doom_loop', 'skill',
    'write', 'patch', 'apply_patch',
]);
const ACTION_ALIASES = {
    write: 'edit',
    patch: 'edit',
    apply_patch: 'edit',
    task: 'subagent',
    bash: 'shell',
};
const EFFECTS = new Set(['allow', 'deny', 'ask']);
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function isPlainObject(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
function fail(reason) {
    return { ok: false, reason };
}
function translateValue(action, value) {
    if (typeof value === 'string') {
        if (!EFFECTS.has(value))
            return fail('Invalid permission effect.');
        return { ok: true, rules: [{ action, resource: '*', effect: value }] };
    }
    if (!isPlainObject(value))
        return fail('Invalid permission configuration.');
    const rules = [];
    for (const [resource, effect] of Object.entries(value)) {
        if (FORBIDDEN_KEYS.has(resource))
            return fail('Invalid permission resource.');
        if (!resource.trim())
            return fail('Invalid permission resource.');
        if (typeof effect !== 'string' || !EFFECTS.has(effect)) {
            return fail('Invalid permission effect.');
        }
        rules.push({ action, resource, effect: effect });
    }
    return { ok: true, rules };
}
function canonical(rules) {
    return JSON.stringify(rules
        .map(rule => [rule.resource, rule.effect])
        .sort((left, right) => left[0].localeCompare(right[0]) || left[1].localeCompare(right[1])));
}
/** Map a V1 permission map (or absence) into ordered native rules. */
export function translatePermissions(input) {
    if (input === undefined)
        return { ok: true, rules: [] };
    if (!isPlainObject(input))
        return fail('Invalid permission configuration.');
    // Multiple V1 tool keys that collapse onto one native action cannot keep
    // separate defaults. Only identical rule sets are faithfully representable.
    const groups = new Map();
    for (const [key, value] of Object.entries(input)) {
        if (FORBIDDEN_KEYS.has(key))
            return fail('Invalid permission action.');
        if (!KNOWN_ACTIONS.has(key))
            return fail(`Unknown permission action: ${key}`);
        const action = ACTION_ALIASES[key] ?? key;
        const translated = translateValue(action, value);
        if (!translated.ok)
            return translated;
        groups.set(action, [...(groups.get(action) ?? []), { key, rules: translated.rules }]);
    }
    const rules = [];
    for (const [action, sources] of groups) {
        if (sources.length > 1) {
            const first = canonical(sources[0].rules);
            if (sources.slice(1).some(source => canonical(source.rules) !== first)) {
                return fail(`Conflicting permission aliases for action: ${action}`);
            }
        }
        for (const rule of sources[0].rules)
            rules.push({ ...rule, action });
    }
    return { ok: true, rules };
}
/**
 * Build the project-level rules appended after inherited (global) rules.
 * Omitted inherited grants are narrowed to the local fallback; inherited
 * deny/ask rules are never relaxed into allow.
 */
export function projectPermissionRules(local, inherited) {
    const result = local.map(rule => ({ ...rule }));
    const localEffects = new Map();
    for (const rule of local)
        localEffects.set(`${rule.action}\0${rule.resource}`, rule.effect);
    const fallback = (action) => {
        for (let index = local.length - 1; index >= 0; index--) {
            const rule = local[index];
            if (rule.action === action && rule.resource === '*')
                return rule.effect;
        }
        return 'ask';
    };
    for (const rule of inherited) {
        const key = `${rule.action}\0${rule.resource}`;
        const localEffect = localEffects.get(key);
        if (localEffect !== undefined) {
            // Project rules are appended after inherited ones, so a local allow
            // would otherwise override an inherited deny/ask for the same resource.
            if (rule.effect === 'deny' && localEffect !== 'deny') {
                result.push({ action: rule.action, resource: rule.resource, effect: 'deny' });
            }
            else if (rule.effect === 'ask' && localEffect === 'allow') {
                result.push({ action: rule.action, resource: rule.resource, effect: 'ask' });
            }
            continue;
        }
        const localFallback = fallback(rule.action);
        const effect = rule.effect === 'deny'
            ? 'deny'
            : rule.effect === 'ask'
                ? (localFallback === 'allow' ? 'ask' : localFallback)
                : localFallback;
        result.push({ action: rule.action, resource: rule.resource, effect });
    }
    return result;
}
//# sourceMappingURL=oc2-permissions.js.map