import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join, resolve, sep } from 'path';
import { AGENT_NAMES, backupConfigFiles, discoverConfigTiers, duplicateAgentConfigKeys, patchAgentPermissions, permissionArrayHasComments, readSettings, } from './opencode-config.js';
import { canonicalPath, pathsOverlap } from './oc2-paths.js';
import { projectPermissionRules } from './oc2-permissions.js';
const PROJECT_CONFIG_NAMES = [
    'opencode.json',
    'opencode.jsonc',
    join('.opencode', 'opencode.json'),
    join('.opencode', 'opencode.jsonc'),
];
function fail(reason) {
    return { ok: false, reason };
}
function sameRule(left, right) {
    return left.action === right.action
        && left.resource === right.resource
        && left.effect === right.effect;
}
function ruleKey(rule) {
    return `${rule.action}\u0000${rule.resource}\u0000${rule.effect}`;
}
function validRule(rule) {
    return !!rule && typeof rule === 'object'
        && typeof rule.action === 'string' && !!rule.action.trim()
        && typeof rule.resource === 'string' && !!rule.resource.trim()
        && (rule.effect === 'allow' || rule.effect === 'ask' || rule.effect === 'deny');
}
function assertContext(context) {
    const project = canonicalPath(context.projectDirectory);
    const global = canonicalPath(context.globalConfigDirectory);
    if (pathsOverlap(project, global)) {
        throw new Error('Refusing to inspect overlapping project and global configuration directories.');
    }
}
/** Inspect metadata only: no provider/model/prompt settings ever leave this function. */
export function inspectPermissions(context) {
    assertContext(context);
    const rows = [];
    for (const tier of discoverConfigTiers(context.projectDirectory, context.globalConfigDirectory)) {
        const settings = readSettings(tier.file);
        for (const agent of AGENT_NAMES) {
            const rules = settings.agents?.[agent]?.permissions;
            if (!Array.isArray(rules))
                continue;
            rules.forEach((rule, index) => {
                rows.push({ file: tier.file, scope: tier.scope, agent, index, rule });
            });
        }
    }
    return rows;
}
/** Ordered inherited rules (global then ancestor tiers) for one role. */
export function inheritedPermissionRules(context, agent) {
    assertContext(context);
    const result = [];
    for (const tier of discoverConfigTiers(context.projectDirectory, context.globalConfigDirectory)) {
        if (tier.scope === 'project')
            continue;
        const rules = readSettings(tier.file).agents?.[agent]?.permissions;
        if (Array.isArray(rules))
            result.push(...rules);
    }
    return result;
}
function projectCandidates(project) {
    return PROJECT_CONFIG_NAMES.map(name => resolve(project, name));
}
function targetBytes(file) {
    return existsSync(file) ? readFileSync(file) : undefined;
}
/**
 * Select the sole project config, or the default absent target. `--file` is a
 * selector confined to the project's own config candidates, never an
 * authorization for ancestor or global writes. Symlink aliases are rejected by
 * canonicalizing both the target and the global root.
 */
export function selectProjectTarget(context, explicitFile) {
    assertContext(context);
    const project = canonicalPath(context.projectDirectory);
    const global = canonicalPath(context.globalConfigDirectory);
    const candidates = projectCandidates(context.projectDirectory);
    let selected;
    if (explicitFile !== undefined) {
        selected = resolve(explicitFile);
        const canonical = canonicalPath(selected);
        const allowed = candidates.some(candidate => canonicalPath(candidate) === canonical);
        if (!allowed)
            throw new Error('Refusing to write a project config target outside the project candidates.');
        if (!(canonical === project || canonical.startsWith(project + sep)) || pathsOverlap(canonical, global)) {
            throw new Error('Refusing to write outside the project configuration scope.');
        }
    }
    else {
        const existing = candidates.filter(file => existsSync(file));
        if (existing.length > 1) {
            throw new Error('Ambiguous project configuration: multiple configs exist; pass --file <project-config-path>.');
        }
        selected = existing[0] ?? resolve(context.projectDirectory, 'opencode.jsonc');
    }
    return { file: selected, expected: targetBytes(selected) };
}
/**
 * Validate and complete surviving project rules. Allow additions run through the
 * unchanged project validator; bounded file read/edit asks are checked through
 * an allow-shaped copy; inherited ask tuples are masks; unsafe asks and
 * baseline mirrors fail closed. The derived non-allow suffix is appended only
 * when it is not already the exact trailing sequence.
 */
export function protectProjectSurvivors(local, inherited) {
    if (!Array.isArray(local) || !Array.isArray(inherited))
        return fail('Invalid permission rule input.');
    const inheritedKeys = new Set(inherited.map(ruleKey));
    // Recognise the writer's own exact trailing protection. Its secret denies are
    // identical inherited tuples; without this, a second add/remove would reject
    // the previous run's suffix as a baseline mirror.
    const derivingAllows = local.filter(rule => rule.effect === 'allow' && validRule(rule) && !inheritedKeys.has(ruleKey(rule)));
    const deriving = projectPermissionRules(derivingAllows, inherited);
    const expectedSuffix = deriving.ok
        ? deriving.rules.filter(rule => rule.effect !== 'allow')
        : [];
    const trailingLength = expectedSuffix.length
        && expectedSuffix.length <= local.length
        && local.slice(-expectedSuffix.length).every((rule, index) => sameRule(rule, expectedSuffix[index]))
        ? expectedSuffix.length
        : 0;
    const trailingStart = local.length - trailingLength;
    for (const [index, rule] of local.entries()) {
        if (!validRule(rule))
            return fail('Invalid or ambiguous project permission rule.');
        const key = ruleKey(rule);
        if (rule.effect === 'allow') {
            if (inheritedKeys.has(key)) {
                return fail('Legacy baseline mirror in project permissions.');
            }
            const checked = projectPermissionRules([rule], inherited);
            if (!checked.ok)
                return checked;
        }
        else if (rule.effect === 'ask') {
            if (inheritedKeys.has(key))
                continue;
            if (rule.action !== 'read' && rule.action !== 'edit') {
                return fail('Unsupported surviving ask; project asks may only cover bounded file read/edit rights.');
            }
            const checked = projectPermissionRules([{ ...rule, effect: 'allow' }], inherited);
            if (!checked.ok)
                return fail(`Unsafe surviving ask: ${checked.reason}`);
        }
        else if (inheritedKeys.has(key) && index < trailingStart) {
            return fail('Legacy baseline mirror in project permissions.');
        }
    }
    const allows = local.filter(rule => rule.effect === 'allow');
    const derived = projectPermissionRules(allows, inherited);
    if (!derived.ok)
        return derived;
    const suffix = derived.rules.filter(rule => rule.effect !== 'allow');
    if (!suffix.length)
        return { ok: true, rules: local.map(rule => ({ ...rule })) };
    if (suffix.length <= local.length && local.slice(-suffix.length).every((rule, index) => sameRule(rule, suffix[index]))) {
        return { ok: true, rules: local.map(rule => ({ ...rule })) };
    }
    return { ok: true, rules: [...local.map(rule => ({ ...rule })), ...suffix] };
}
function directoryLiteral(resource) {
    return resource.endsWith('/**') ? resource.slice(0, -3) : resource;
}
function covers(existing, requested) {
    if (existing === '*')
        return true;
    const existingLiteral = directoryLiteral(existing).replace(/\/$/, '');
    const requestedLiteral = directoryLiteral(requested).replace(/\/$/, '');
    if (existing.endsWith('/**')) {
        return requestedLiteral === existingLiteral
            || requestedLiteral.startsWith(`${existingLiteral}/`);
    }
    if (requested.endsWith('/**'))
        return false;
    return existingLiteral === requestedLiteral;
}
function globToRegExp(glob) {
    let source = '';
    for (let index = 0; index < glob.length; index++) {
        const char = glob[index];
        if (char === '*') {
            source += '.*';
            if (glob[index + 1] === '*') {
                index++;
                if (glob[index + 1] === '/')
                    index++;
            }
        }
        else if (char === '?') {
            source += '.';
        }
        else {
            source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }
    }
    return new RegExp(`^${source}$`);
}
function effectiveEffect(rules, action, resource) {
    let result;
    for (const rule of rules) {
        if (!globToRegExp(rule.action).test(action))
            continue;
        if (globToRegExp(rule.resource).test(resource))
            result = rule.effect;
    }
    return result;
}
/**
 * Split an exact writer-owned trailing protection suffix from the rules the
 * user/previous plan owns. Only the exact derived tail is removed; unrelated
 * handwritten restrictions stay in `base` and in their original order.
 */
function splitTrailingProtection(local, inherited) {
    const inheritedKeys = new Set(inherited.map(ruleKey));
    const allows = local.filter(rule => rule.effect === 'allow' && validRule(rule) && !inheritedKeys.has(ruleKey(rule)));
    const derived = projectPermissionRules(allows, inherited);
    const suffix = derived.ok ? derived.rules.filter(rule => rule.effect !== 'allow') : [];
    if (suffix.length && suffix.length <= local.length
        && local.slice(-suffix.length).every((rule, index) => sameRule(rule, suffix[index]))) {
        return {
            base: local.slice(0, -suffix.length).map(rule => ({ ...rule })),
            suffix: suffix.map(rule => ({ ...rule })),
        };
    }
    return { base: local.map(rule => ({ ...rule })), suffix: [] };
}
function requiredProtection(local, inherited) {
    const allows = local.filter(rule => rule.effect === 'allow');
    const derived = projectPermissionRules(allows, inherited);
    if (!derived.ok)
        return [];
    return derived.rules.filter(rule => rule.effect !== 'allow');
}
/** Plan a narrow additive grant; redundant or invalid grants fail without writes. */
export function planPermissionAdd(local, inherited, grant) {
    if (!validRule(grant))
        return fail('Invalid or ambiguous permission grant.');
    if (grant.effect !== 'allow')
        return fail('Project additions must be allow rules.');
    if (grant.action !== 'read' && grant.action !== 'edit') {
        return fail('Project additions may only grant file read/edit rights.');
    }
    // Insert the new grant before an existing exact protective suffix; appending
    // after it would make the suffix stop being the exact tail and be misread as
    // a legacy baseline mirror. The suffix is recomputed from base + grant.
    const { base } = splitTrailingProtection(local, inherited);
    const candidate = protectProjectSurvivors([...base, grant], inherited);
    if (!candidate.ok)
        return candidate;
    const covering = [...inherited, ...local].filter(rule => rule.effect === 'allow' && rule.action === grant.action && covers(rule.resource, grant.resource));
    if (covering.length)
        return fail('Requested permission is already covered by an existing allow rule.');
    const probe = grant.resource.endsWith('/**')
        ? `${directoryLiteral(grant.resource).replace(/\/$/, '')}/__kiki_permission_probe__`
        : grant.resource;
    const effective = effectiveEffect(candidate.rules, grant.action, probe);
    if (effective !== 'allow') {
        return fail(`Requested grant is ineffective because a retained restriction overrides it (${effective ?? 'no matching rule'}).`);
    }
    return candidate;
}
/** Plan removal of exactly one selected project entry while keeping protection. */
export function planPermissionRemoval(local, inherited, index, expectedRule) {
    if (!Number.isInteger(index) || index < 0 || index >= local.length) {
        return fail('Selected project permission entry is stale or out of range.');
    }
    if (!validRule(expectedRule) || !sameRule(local[index], expectedRule)) {
        return fail('Selected project permission entry changed; refusing to remove a different tuple.');
    }
    if (inherited.some(rule => sameRule(rule, expectedRule))) {
        return fail('Selected entry belongs to inherited/global permissions; project removal cannot edit it.');
    }
    const survivors = [...local.slice(0, index), ...local.slice(index + 1)];
    const protection = protectProjectSurvivors(survivors, inherited);
    if (!protection.ok)
        return protection;
    if (requiredProtection(survivors, inherited).some(rule => sameRule(rule, expectedRule))) {
        return fail('Selected entry is still required as mandatory protection for surviving rules.');
    }
    return protection;
}
function assertProjectFile(context, file) {
    const project = canonicalPath(context.projectDirectory);
    const global = canonicalPath(context.globalConfigDirectory);
    const target = canonicalPath(file);
    if (!(target === project || target.startsWith(project + sep)) || pathsOverlap(target, global)) {
        throw new Error('Refusing to write outside the project configuration scope.');
    }
}
function withoutPermissions(settings, agent) {
    const next = { ...settings };
    if (next.agents && typeof next.agents === 'object') {
        const agents = { ...next.agents };
        if (agents[agent] && typeof agents[agent] === 'object') {
            const copy = { ...agents[agent] };
            delete copy.permissions;
            if (Object.keys(copy).length)
                agents[agent] = copy;
            else
                delete agents[agent];
        }
        if (Object.keys(agents).length)
            next.agents = agents;
        else
            delete next.agents;
    }
    return next;
}
function permissionsOf(settings, agent) {
    const value = settings.agents?.[agent]?.permissions;
    return Array.isArray(value) ? value : [];
}
/**
 * Apply one project permission field under exact-byte preconditions. Only the
 * selected role's permission field is verified as changed; all other JSONC
 * settings/comments and the file mode are preserved. A concurrent change after
 * planning aborts before backup or before replacement.
 */
export function applyProjectPermissions(context, file, agent, expected, rules) {
    assertProjectFile(context, file);
    if (!AGENT_NAMES.includes(agent))
        throw new Error('Unknown Kiki agent.');
    if (!Array.isArray(rules) || rules.some(rule => !validRule(rule))) {
        throw new Error('Invalid or ambiguous project permission rules.');
    }
    const current = targetBytes(file);
    if (expected === undefined ? current !== undefined : !current || !current.equals(expected)) {
        throw new Error('Project configuration changed since planning; aborting without writes.');
    }
    if (current) {
        const duplicates = duplicateAgentConfigKeys(file);
        if (duplicates.length) {
            throw new Error('Ambiguous project configuration (duplicate agent keys); aborting without writes.');
        }
        if (permissionArrayHasComments(file, agent)) {
            throw new Error('Refusing to replace project permissions: comments inside the array would be lost.');
        }
    }
    const beforeSettings = current
        ? readSettings(file)
        : {};
    const now = permissionsOf(beforeSettings, agent);
    if (JSON.stringify(now) === JSON.stringify(rules))
        return { changed: false, file };
    backupConfigFiles(current ? [file] : [], join(context.projectDirectory, '.agentic/kiki/backups'));
    // Recheck immediately before replacement; backup work must not widen the
    // window between planning bytes and the write.
    const recheck = targetBytes(file);
    if (expected === undefined ? recheck !== undefined : !recheck || !recheck.equals(expected)) {
        throw new Error('Project configuration changed since planning; aborting without writes.');
    }
    let postimage;
    try {
        patchAgentPermissions(file, agent, rules.length ? rules : undefined);
        postimage = targetBytes(file);
        const afterSettings = readSettings(file);
        if (JSON.stringify(permissionsOf(afterSettings, agent)) !== JSON.stringify(rules)) {
            throw new Error('Project permission persistence verification failed.');
        }
        if (current && JSON.stringify(withoutPermissions(beforeSettings, agent))
            !== JSON.stringify(withoutPermissions(afterSettings, agent))) {
            throw new Error('Project permission write changed unrelated configuration.');
        }
        return { changed: true, file };
    }
    catch (error) {
        const currentPost = targetBytes(file);
        const ownsPostimage = postimage
            ? !!currentPost && currentPost.equals(postimage)
            : expected === undefined
                ? currentPost === undefined
                : !!currentPost && currentPost.equals(expected);
        if (!ownsPostimage) {
            throw new Error(`Project permission write failed and the target changed concurrently; recovery required: ${error instanceof Error ? error.message : String(error)}`);
        }
        try {
            if (expected !== undefined) {
                writeFileSync(file, expected);
            }
            else if (existsSync(file)) {
                // The transaction created the file; remove only its own postimage.
                unlinkSync(file);
            }
        }
        catch (restoreError) {
            throw new Error(`Project permission write failed and rollback was incomplete; recovery required: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}. Original error: ${error instanceof Error ? error.message : String(error)}`);
        }
        throw new Error(`${error instanceof Error ? error.message : String(error)} All project changes were rolled back.`);
    }
}
//# sourceMappingURL=permission-requests.js.map