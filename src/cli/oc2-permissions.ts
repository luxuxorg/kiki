import type { PermissionRule } from './opencode-config.js';
import { SECRET_GLOBS } from './config.js';

export type PermissionResult =
  | { ok: true; rules: PermissionRule[] }
  | { ok: false; reason: string };

function fail(reason: string): PermissionResult {
  return { ok: false, reason };
}

/**
 * Build the project-level rules appended after inherited (global) rules.
 *
 * Kiki-written project permissions are additions only: literal file paths or
 * literal directory prefixes (`.../**`). Generated baseline copies are removed
 * before validation, no broad fallback/grant is replayed, and any unsupported
 * or role-boundary-crossing rule fails closed. Accepted additions get a minimal
 * protective suffix so secret descendants stay denied under last-match
 * semantics. This is validation of Kiki-managed writes, not a runtime policy
 * engine; manually edited native configs remain outside this guarantee.
 */
export function projectPermissionRules(
  local: PermissionRule[],
  inherited: PermissionRule[],
): PermissionResult {
  const inheritedKeys = new Set(inherited.map(ruleKey));
  const additions: PermissionRule[] = [];
  const masks: PermissionRule[] = [];
  const seen = new Set<string>();
  const hasEdit = { value: false };
  const hasRead = { value: false };

  for (const rule of local) {
    const key = ruleKey(rule);
    // Proven generated copies and the generated secret mask are dropped rather
    // than replayed into the project tier.
    if (inheritedKeys.has(key)) continue;
    if (rule.action === 'edit' && rule.effect === 'deny'
      && (SECRET_GLOBS as readonly string[]).includes(rule.resource)) continue;
    if (seen.has(key)) continue;

    const reason = validateAddition(rule, inherited);
    if (reason) return fail(`${reason}: ${rule.action} ${rule.resource} ${rule.effect}`);
    seen.add(key);
    additions.push({ ...rule });
    if (rule.action === 'edit') hasEdit.value = true;
    if (rule.action === 'read') hasRead.value = true;

    for (const ask of overlappingAsks(rule, inherited)) {
      if (seen.has(ruleKey(ask))) continue;
      seen.add(ruleKey(ask));
      masks.push(ask);
    }
  }

  const secretEdit = hasEdit.value
    ? SECRET_GLOBS.map(resource => ({ action: 'edit' as const, resource, effect: 'deny' as const }))
    : [];
  const secretRead = hasRead.value
    ? SECRET_GLOBS.map(resource => ({ action: 'read' as const, resource, effect: 'deny' as const }))
    : [];
  return { ok: true, rules: [...additions, ...masks, ...secretRead, ...secretEdit] };
}

function ruleKey(rule: PermissionRule): string {
  return `${rule.action}\u0000${rule.resource}\u0000${rule.effect}`;
}

function isDirectoryPrefix(resource: string): boolean {
  return resource.endsWith('/**') && resource.length > 3;
}

function directoryPrefix(resource: string): string {
  return resource.slice(0, -3);
}

function isBoundedPathForm(resource: string): boolean {
  if (!resource || resource === '*') return false;
  // The one inventoried historical Noema form.
  if (resource === '**/tmp/opencode/**' || resource === '/tmp/opencode/**') return true;
  let candidate = resource;
  for (const worktree of ['.worktree/**/', '.worktrees/**/']) {
    if (candidate.startsWith(worktree)) {
      candidate = candidate.slice(worktree.length);
      break;
    }
  }
  const literal = isDirectoryPrefix(candidate) ? directoryPrefix(candidate) : candidate;
  if (!literal || literal === '*') return false;
  if (literal.includes('*') || literal.includes('?')) return false;
  if (literal.includes('[') || literal.includes(']') || literal.includes('{') || literal.includes('}')) return false;
  const segments = literal.split('/');
  if (segments.some(segment => segment === '..')) return false;
  return true;
}

function globToRegExp(glob: string): RegExp {
  let source = '';
  for (let index = 0; index < glob.length; index++) {
    const char = glob[index];
    if (char === '*') {
      source += '.*';
      if (glob[index + 1] === '*') {
        index++;
        if (glob[index + 1] === '/') index++;
      }
    } else if (char === '?') {
      source += '.';
    } else {
      source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

function matchesSecret(resource: string): boolean {
  return (SECRET_GLOBS as readonly string[]).some(glob => globToRegExp(glob).test(resource));
}

function scopesOverlap(addition: string, scope: string): boolean {
  if (scope === '*') return false;
  const additionLiteral = isDirectoryPrefix(addition) ? directoryPrefix(addition) : addition;
  if (isDirectoryPrefix(scope)) {
    const scopeLiteral = directoryPrefix(scope);
    if (additionLiteral === scopeLiteral || additionLiteral.startsWith(`${scopeLiteral}/`)) return true;
    return isDirectoryPrefix(addition) && scopeLiteral.startsWith(`${additionLiteral}/`);
  }
  if (isDirectoryPrefix(addition)) return scope.startsWith(`${additionLiteral}/`);
  return additionLiteral === scope;
}

function validateAddition(rule: PermissionRule, inherited: PermissionRule[]): string | undefined {
  if (rule.effect !== 'allow') return 'Project additions must be allow rules';
  if (rule.action === 'external_directory') {
    return ['/tmp/**', 'tmp/**', '**/tmp/opencode/**', '/tmp/opencode/**'].includes(rule.resource)
      ? undefined
      : 'Unsupported external-directory addition';
  }
  if (rule.action !== 'read' && rule.action !== 'edit') {
    return 'Project additions may only grant file read/edit rights';
  }
  if (!isBoundedPathForm(rule.resource)) return 'Unsupported project permission path form';
  if (matchesSecret(rule.resource)) return 'Secret path additions are not allowed';
  for (const parent of inherited) {
    if (parent.action !== rule.action || parent.effect !== 'deny') continue;
    if (!isBoundedPathForm(parent.resource)) continue;
    if (scopesOverlap(rule.resource, parent.resource)) {
      return 'Project addition crosses a protected role boundary';
    }
  }
  return undefined;
}

function overlappingAsks(rule: PermissionRule, inherited: PermissionRule[]): PermissionRule[] {
  const result: PermissionRule[] = [];
  for (const parent of inherited) {
    if (parent.action !== rule.action || parent.effect !== 'ask') continue;
    if (!isBoundedPathForm(parent.resource)) continue;
    if (scopesOverlap(rule.resource, parent.resource)) {
      result.push({ action: parent.action, resource: parent.resource, effect: 'ask' });
    }
  }
  return result;
}
