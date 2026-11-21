import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';

import type { PermissionRule } from './opencode-config.js';

/**
 * Hash-only ownership evidence for the global `agents.<name>.permissions`
 * field. The state file stores no rules; it only proves which exact ordered
 * array Kiki last verified. Array order matters and JSONC whitespace does not.
 */
export interface OwnershipState {
  version: 1;
  roles: Record<string, string>;
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const HASH_PATTERN = /^[a-f0-9]{64}$/;

export function hashPermissionField(rules: PermissionRule[]): string {
  return createHash('sha256').update(JSON.stringify(rules)).digest('hex');
}

/**
 * Strict shape validation. Any unknown version, extra payload field, non-hash
 * value or forbidden key degrades to the legacy classifier bootstrap.
 */
export function parseOwnershipState(value: unknown): OwnershipState | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  if (Object.getPrototypeOf(value) !== Object.prototype) return undefined;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== 2 || keys[0] !== 'roles' || keys[1] !== 'version') return undefined;
  if (record.version !== 1) return undefined;
  const rolesValue = record.roles;
  if (!rolesValue || typeof rolesValue !== 'object' || Array.isArray(rolesValue)) return undefined;
  if (Object.getPrototypeOf(rolesValue) !== Object.prototype) return undefined;
  const roles: Record<string, string> = {};
  for (const [role, hash] of Object.entries(rolesValue as Record<string, unknown>)) {
    if (!role.trim() || FORBIDDEN_KEYS.has(role)) return undefined;
    if (typeof hash !== 'string' || !HASH_PATTERN.test(hash)) return undefined;
    roles[role] = hash;
  }
  if (!Object.keys(roles).length) return undefined;
  return { version: 1, roles };
}

/** The single state file under the env-resolved global config root. */
export function ownershipStateFile(globalConfigDirectory: string): string {
  return join(globalConfigDirectory, 'kiki', 'state.json');
}

/** Read the state file; absent, unreadable, corrupt or unknown versions are undefined. */
export function readOwnershipState(file: string): OwnershipState | undefined {
  if (!existsSync(file)) return undefined;
  try {
    return parseOwnershipState(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return undefined;
  }
}

/** Deterministic serialization; callers write it atomically after verification. */
export function serializeOwnershipState(state: OwnershipState): string {
  return `${JSON.stringify({ version: 1, roles: state.roles }, null, 2)}\n`;
}

/** Ensure the state parent directory exists with restrictive permissions. */
export function ownershipStateDirectory(file: string): string {
  return dirname(file);
}
