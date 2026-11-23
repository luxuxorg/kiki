import { existsSync, realpathSync } from 'fs';
import { basename, dirname, join, resolve, sep } from 'path';

export interface OC2Roots {
  config: string;
  data: string;
  cache: string;
  state: string;
}

function xdgBase(env: NodeJS.ProcessEnv, name: string, home: string, fallback: string[]): string {
  const configured = env[name];
  return configured ? configured : join(home, ...fallback);
}

/**
 * Resolve OpenCode 2's global roots exactly like the pinned upstream runtime:
 * every XDG root gets the `opencode` suffix and OPENCODE_CONFIG_DIR overrides
 * only the config root.
 */
export function resolveOC2Roots(env: NodeJS.ProcessEnv, home: string): OC2Roots {
  return {
    config: env.OPENCODE_CONFIG_DIR || join(xdgBase(env, 'XDG_CONFIG_HOME', home, ['.config']), 'opencode'),
    data: join(xdgBase(env, 'XDG_DATA_HOME', home, ['.local', 'share']), 'opencode'),
    cache: join(xdgBase(env, 'XDG_CACHE_HOME', home, ['.cache']), 'opencode'),
    state: join(xdgBase(env, 'XDG_STATE_HOME', home, ['.local', 'state']), 'opencode'),
  };
}

/**
 * Canonicalize a destination that may not exist yet by resolving the nearest
 * existing parent. This makes symlinked ancestors and absent destinations
 * comparable before a write happens.
 */
export function canonicalPath(target: string): string {
  let current = resolve(target);
  const suffix: string[] = [];
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return current;
    suffix.unshift(basename(current));
    current = parent;
  }
  let real = current;
  try {
    real = realpathSync(current);
  } catch {
    // Keep the resolved path when the existing parent cannot be canonicalized.
  }
  return suffix.length ? join(real, ...suffix) : real;
}

/** True when two canonical destinations are equal or nested within each other. */
export function pathsOverlap(first: string, second: string): boolean {
  return first === second || first.startsWith(second + sep) || second.startsWith(first + sep);
}

/**
 * Fail closed before Kiki 3.0.0 reads or writes an OpenCode 2 destination.
 * Refuses overlapping config/data/cache/state roots.
 */
export function assertOC2Target(roots: OC2Roots): void {
  const entries = Object.entries(roots) as [keyof OC2Roots, string][];
  const canonical = {} as Record<keyof OC2Roots, string>;
  for (const [scope, directory] of entries) {
    if (typeof directory !== 'string' || !directory.trim()) {
      throw new Error('Invalid OpenCode 2 root configuration.');
    }
    canonical[scope] = canonicalPath(directory);
  }
  for (let first = 0; first < entries.length; first += 1) {
    for (let second = first + 1; second < entries.length; second += 1) {
      if (pathsOverlap(canonical[entries[first][0]], canonical[entries[second][0]])) {
        throw new Error('Refusing to run: OpenCode 2 config/data/cache/state roots overlap. Isolate every XDG root before using Kiki 3.');
      }
    }
  }
}
