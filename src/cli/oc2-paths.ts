import { existsSync, realpathSync, statSync } from 'fs';
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

const OC1_MARKER_FILES = [
  ['plugins', 'kiki.ts'],
  ['plugins', 'kiki.js'],
  ['kiki', 'tui.js'],
] as const;

/**
 * Metadata-only detection of a live OpenCode 1 Kiki installation. Config files
 * are deliberately not parsed here because they can contain provider
 * credentials; a credential-bearing config must be exported sanitized by the
 * user instead of being inspected by Kiki.
 */
export function hasOC1Markers(directory: string): boolean {
  for (const parts of OC1_MARKER_FILES) {
    if (existsSync(join(directory, ...parts))) return true;
  }
  try {
    if (statSync(join(directory, 'kiki', 'prompts')).isDirectory()) return true;
  } catch {
    // Absent V1 prompt directory.
  }
  return false;
}

export interface OC1GuardOptions {
  /**
   * Installation/update owns the documented V1 Kiki artifacts and may back up
   * and remove them during an explicitly requested cleanup.
   */
  allowKnownV1Artifacts?: boolean;
}

/**
 * Fail closed when the target is, contains, or is contained by a directory with
 * OpenCode 1 (V1) Kiki artifacts. OpenCode 1 and OpenCode 2 share the standard
 * config directory (`~/.config/opencode`), so the presence of
 * `opencode.json(c)` proves nothing about the installed generation and is not a
 * marker. Only V1-specific Kiki files identify a legacy installation; config
 * contents are never inspected here because they may carry credentials.
 */
export function assertNotOC1Config(target: string, home: string, options: OC1GuardOptions = {}): void {
  const directory = canonicalPath(target);
  const machineDefault = canonicalPath(join(home, '.config', 'opencode'));
  const markers = hasOC1Markers(directory)
    || (pathsOverlap(directory, machineDefault) && hasOC1Markers(machineDefault));
  if (markers && options.allowKnownV1Artifacts !== true) {
    throw new Error('Refusing to modify a directory that contains OpenCode 1 (V1) Kiki artifacts. Remove them first; kiki install backs up and replaces the files it owns.');
  }
}

/**
 * Fail closed before Kiki 3.0.0 reads or writes an OpenCode 2 destination.
 * Refuses overlapping config/data/cache/state roots and any config root that
 * aliases or nests inside a directory with OpenCode 1 Kiki artifacts.
 */
export function assertOC2Target(roots: OC2Roots, home: string, options: OC1GuardOptions = {}): void {
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
  assertNotOC1Config(canonical.config, home, options);
}
