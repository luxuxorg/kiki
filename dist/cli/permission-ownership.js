import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const HASH_PATTERN = /^[a-f0-9]{64}$/;
export function hashPermissionField(rules) {
    return createHash('sha256').update(JSON.stringify(rules)).digest('hex');
}
/**
 * Strict shape validation. Any unknown version, extra payload field, non-hash
 * value or forbidden key degrades to the legacy classifier bootstrap.
 */
export function parseOwnershipState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return undefined;
    if (Object.getPrototypeOf(value) !== Object.prototype)
        return undefined;
    const record = value;
    const keys = Object.keys(record).sort();
    if (keys.length !== 2 || keys[0] !== 'roles' || keys[1] !== 'version')
        return undefined;
    if (record.version !== 1)
        return undefined;
    const rolesValue = record.roles;
    if (!rolesValue || typeof rolesValue !== 'object' || Array.isArray(rolesValue))
        return undefined;
    if (Object.getPrototypeOf(rolesValue) !== Object.prototype)
        return undefined;
    const roles = {};
    for (const [role, hash] of Object.entries(rolesValue)) {
        if (!role.trim() || FORBIDDEN_KEYS.has(role))
            return undefined;
        if (typeof hash !== 'string' || !HASH_PATTERN.test(hash))
            return undefined;
        roles[role] = hash;
    }
    if (!Object.keys(roles).length)
        return undefined;
    return { version: 1, roles };
}
/** The single state file under the env-resolved global config root. */
export function ownershipStateFile(globalConfigDirectory) {
    return join(globalConfigDirectory, 'kiki', 'state.json');
}
/** Read the state file; absent, unreadable, corrupt or unknown versions are undefined. */
export function readOwnershipState(file) {
    if (!existsSync(file))
        return undefined;
    try {
        return parseOwnershipState(JSON.parse(readFileSync(file, 'utf8')));
    }
    catch {
        return undefined;
    }
}
/** Deterministic serialization; callers write it atomically after verification. */
export function serializeOwnershipState(state) {
    return `${JSON.stringify({ version: 1, roles: state.roles }, null, 2)}\n`;
}
/** Ensure the state parent directory exists with restrictive permissions. */
export function ownershipStateDirectory(file) {
    return dirname(file);
}
//# sourceMappingURL=permission-ownership.js.map