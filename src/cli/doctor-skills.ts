import * as fs from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

/**
 * Skills the Kiki agent templates require. The last entry is a user-level
 * skill rather than a superpowers skill; it is included because the
 * gui-designer template requires it.
 */
export const REQUIRED_SKILLS = [
  'brainstorming',
  'writing-plans',
  'executing-plans',
  'test-driven-development',
  'systematic-debugging',
  'receiving-code-review',
  'requesting-code-review',
  'ui-ux-pro-max',
] as const;

/**
 * Version Kiki's agent templates were last verified against. This is an
 * observation, never a support floor or compatibility guarantee.
 */
export const TESTED_SUPERPOWERS_VERSION = '7.0.1';

export interface SkillCopy {
  path: string;
  directoryName: string;
  frontmatterName?: string;
  nameDrift: boolean;
  packageRoot?: string;
}

export interface SkillDiscovery {
  byName: Record<string, SkillCopy[]>;
  skippedEntries: number;
}

export interface SkillObservation {
  level: 'pass' | 'warn' | 'info';
  label: string;
  detail: string;
}

const SKILL_FILE = 'SKILL.md';
const MAX_CACHE_DEPTH = 8;
const NUMERIC_IDENTIFIER = /^(?:0|[1-9]\d*)/;
const IDENTIFIER_CHARACTERS = /^[0-9A-Za-z-]+/;
const DIGITS_ONLY = /^\d+/;

type RecordSkill = (directory: string, packageRoot?: string) => void;

interface SkipCounter {
  count: number;
}

/**
 * Read-only discovery of the required skills across project, legacy user,
 * XDG user and package-cache locations. Returns copies in deterministic
 * precedence/lexical order; the first copy per name wins for observations.
 */
export function discoverSkills(project: string, env: NodeJS.ProcessEnv = process.env): SkillDiscovery {
  const byName: Record<string, SkillCopy[]> = Object.fromEntries(
    REQUIRED_SKILLS.map(name => [name, [] as SkillCopy[]]),
  );
  const skipped: SkipCounter = { count: 0 };
  // Traversal-cycle prevention and skill-record deduplication are separate:
  // a directory walked generically must not hide the same skill when a real
  // package path is scanned afterwards.
  const traversalDirectories = new Set<string>();
  const skillDirectories = new Set<string>();
  const home = env.HOME ? resolve(env.HOME) : resolve(homedir());
  const configHome = env.XDG_CONFIG_HOME ? resolve(env.XDG_CONFIG_HOME) : join(home, '.config');
  const cacheHome = env.XDG_CACHE_HOME ? resolve(env.XDG_CACHE_HOME) : join(home, '.cache');

  const record: RecordSkill = (directory, packageRoot) =>
    recordSkill(directory, packageRoot, byName, skillDirectories, skipped);

  scanSkillRoot(join(project, '.opencode', 'skills'), record, skipped);
  scanSkillRoot(join(home, '.opencode', 'skills'), record, skipped);
  scanSkillRoot(join(configHome, 'opencode', 'skills'), record, skipped);
  scanCacheRoot(join(cacheHome, 'opencode', 'packages'), record, traversalDirectories, skipped);

  return { byName, skippedEntries: skipped.count };
}

/**
 * Turn a discovery result into warning-only observations. Missing skills,
 * name drift and version differences are warnings; duplicate copies are
 * informational. No observation changes doctor's exit status.
 */
export function observeSkills(discovery: SkillDiscovery): SkillObservation[] {
  const observations: SkillObservation[] = [];
  for (const name of REQUIRED_SKILLS) {
    const copies = discovery.byName[name] ?? [];
    if (copies.length === 0) {
      observations.push({
        level: 'warn',
        label: `skill ${name}`,
        detail: name === 'ui-ux-pro-max'
          ? 'not found on disk; install the ui-ux-pro-max skill in ~/.opencode/skills'
          : 'not found on disk; install the superpowers OpenCode package (or place it in ~/.opencode/skills)',
      });
      continue;
    }

    const first = copies[0];
    if (first.nameDrift) {
      observations.push({
        level: 'warn',
        label: `skill ${name}`,
        detail: first.frontmatterName === undefined
          ? 'name drift: no readable frontmatter name'
          : `name drift: frontmatter says '${first.frontmatterName}'`,
      });
    } else {
      observations.push({
        level: 'pass',
        label: `skill ${name}`,
        detail: `found at ${first.path}`,
      });
    }
    if (copies.length > 1) {
      observations.push({
        level: 'info',
        label: `skill ${name} duplicate copies`,
        detail: `${copies.length} copies found; using ${first.path}`,
      });
    }
  }

  // ui-ux-pro-max is a user-level skill, not a superpowers package member;
  // its cache location must not be mistaken for a superpowers version source.
  const packageRoots = new Set<string>();
  for (const name of REQUIRED_SKILLS) {
    if (name === 'ui-ux-pro-max') continue;
    for (const copy of discovery.byName[name] ?? []) {
      if (copy.packageRoot) packageRoots.add(resolve(copy.packageRoot));
    }
  }
  if (packageRoots.size === 0) {
    observations.push(unknownVersion());
  } else {
    for (const packageRoot of [...packageRoots].sort()) {
      observations.push(observePackageVersion(packageRoot));
    }
  }
  return observations;
}

interface ParsedVersion {
  version: string;
  prerelease: boolean;
}

function observePackageVersion(packageRoot: string): SkillObservation {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  } catch {
    return unknownVersion();
  }
  const value = isRecord(raw) ? raw.version : undefined;
  const parsed = parseVersion(value);
  if (!parsed) return unknownVersion();
  if (parsed.prerelease) {
    return {
      level: 'warn',
      label: 'superpowers version',
      detail: `observed superpowers ${parsed.version} (prerelease); Kiki agents were tested against ${TESTED_SUPERPOWERS_VERSION} — re-verify skill behavior after any superpowers change`,
    };
  }
  if (parsed.version === TESTED_SUPERPOWERS_VERSION) {
    return {
      level: 'pass',
      label: 'superpowers version',
      detail: `${parsed.version} (matches tested version)`,
    };
  }
  return {
    level: 'warn',
    label: 'superpowers version',
    detail: `observed superpowers ${parsed.version}; Kiki agents were tested against ${TESTED_SUPERPOWERS_VERSION} — re-verify skill behavior after any superpowers change`,
  };
}

function unknownVersion(): SkillObservation {
  return {
    level: 'warn',
    label: 'superpowers version',
    detail: 'version unknown (unreadable package.json)',
  };
}

function matchesEntire(pattern: RegExp, value: string): boolean {
  return pattern.exec(value)?.[0] === value;
}

function parseVersion(value: unknown): ParsedVersion | undefined {
  if (typeof value !== 'string') return undefined;

  let main = value;
  const buildIndex = value.indexOf('+');
  if (buildIndex !== -1) {
    const build = value.slice(buildIndex + 1);
    main = value.slice(0, buildIndex);
    if (!build || !build.split('.').every(identifier => matchesEntire(IDENTIFIER_CHARACTERS, identifier))) {
      return undefined;
    }
  }

  let prerelease: string | undefined;
  const prereleaseIndex = main.indexOf('-');
  if (prereleaseIndex !== -1) {
    prerelease = main.slice(prereleaseIndex + 1);
    main = main.slice(0, prereleaseIndex);
    if (!prerelease) return undefined;
    for (const identifier of prerelease.split('.')) {
      if (!identifier) return undefined;
      if (matchesEntire(DIGITS_ONLY, identifier)) {
        // Numeric prerelease identifiers never have leading zeros.
        if (!matchesEntire(NUMERIC_IDENTIFIER, identifier)) return undefined;
      } else if (!matchesEntire(IDENTIFIER_CHARACTERS, identifier)) {
        return undefined;
      }
    }
  }

  const core = main.split('.');
  if (core.length !== 3 || !core.every(identifier => matchesEntire(NUMERIC_IDENTIFIER, identifier))) {
    return undefined;
  }
  return { version: value, prerelease: prerelease !== undefined };
}

function scanSkillRoot(directory: string, record: RecordSkill, skipped: SkipCounter): void {
  const root = resolve(directory);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (error) {
    // Missing roots are normal; access failures (including an inaccessible
    // ancestor, where existsSync would return false) are skipped-counted.
    if (!isMissingError(error)) skipped.count++;
    return;
  }
  for (const entry of sortEntries(entries)) {
    const child = join(root, entry.name);
    if (!isDirectory(child, skipped)) continue;
    record(child);
  }
}

function scanCacheRoot(
  directory: string,
  record: RecordSkill,
  traversalDirectories: Set<string>,
  skipped: SkipCounter,
): void {
  const root = resolve(directory);
  let realRoot: string;
  try {
    realRoot = fs.realpathSync(root);
  } catch (error) {
    if (!isMissingError(error)) skipped.count++;
    return;
  }
  if (traversalDirectories.has(realRoot)) return;
  traversalDirectories.add(realRoot);
  walkCache(root, 0, record, traversalDirectories, skipped);
}

function walkCache(
  directory: string,
  depth: number,
  record: RecordSkill,
  traversalDirectories: Set<string>,
  skipped: SkipCounter,
): void {
  if (depth > MAX_CACHE_DEPTH) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    skipped.count++;
    return;
  }
  for (const entry of sortEntries(entries)) {
    const child = join(directory, entry.name);
    const childDepth = depth + 1;
    let realChild: string;
    try {
      realChild = fs.realpathSync(child);
    } catch {
      skipped.count++;
      continue;
    }
    if (!isDirectory(realChild, skipped)) continue;
    if (traversalDirectories.has(realChild)) continue;
    traversalDirectories.add(realChild);
    if (childDepth > MAX_CACHE_DEPTH) continue;
    if (basename(child) === 'node_modules') {
      scanNodeModules(child, childDepth, record, skipped);
      continue;
    }
    walkCache(child, childDepth, record, traversalDirectories, skipped);
  }
}

function scanNodeModules(
  directory: string,
  depth: number,
  record: RecordSkill,
  skipped: SkipCounter,
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    skipped.count++;
    return;
  }
  for (const entry of sortEntries(entries)) {
    const child = join(directory, entry.name);
    if (!isDirectory(child, skipped)) continue;
    if (entry.name.startsWith('@')) {
      scanScope(child, depth + 1, record, skipped);
    } else {
      scanPackage(child, depth + 1, record, skipped);
    }
  }
}

function scanScope(
  directory: string,
  depth: number,
  record: RecordSkill,
  skipped: SkipCounter,
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    skipped.count++;
    return;
  }
  for (const entry of sortEntries(entries)) {
    const child = join(directory, entry.name);
    if (!isDirectory(child, skipped)) continue;
    scanPackage(child, depth + 1, record, skipped);
  }
}

function scanPackage(
  directory: string,
  depth: number,
  record: RecordSkill,
  skipped: SkipCounter,
): void {
  // The skill directory sits two levels below the package directory.
  if (depth + 2 > MAX_CACHE_DEPTH) return;
  const skillsDirectory = join(directory, 'skills');
  let skillsStat: fs.Stats;
  try {
    skillsStat = fs.statSync(skillsDirectory);
  } catch (error) {
    // Packages without a skills/ directory are normal, not skipped entries.
    if (!isMissingError(error)) skipped.count++;
    return;
  }
  if (!skillsStat.isDirectory()) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(skillsDirectory, { withFileTypes: true });
  } catch {
    skipped.count++;
    return;
  }
  for (const entry of sortEntries(entries)) {
    const child = join(skillsDirectory, entry.name);
    if (!isDirectory(child, skipped)) continue;
    record(child, resolve(directory));
  }
}

function recordSkill(
  directory: string,
  packageRoot: string | undefined,
  byName: Record<string, SkillCopy[]>,
  skillDirectories: Set<string>,
  skipped: SkipCounter,
): void {
  const resolvedDirectory = resolve(directory);
  let realDirectory: string;
  try {
    realDirectory = fs.realpathSync(resolvedDirectory);
  } catch {
    skipped.count++;
    return;
  }
  if (skillDirectories.has(realDirectory)) return;
  skillDirectories.add(realDirectory);

  const path = join(resolvedDirectory, SKILL_FILE);
  let text: string;
  try {
    text = fs.readFileSync(path, 'utf8');
  } catch {
    skipped.count++;
    return;
  }

  const frontmatter = parseFrontmatter(text);
  const frontmatterName = typeof frontmatter?.name === 'string' ? frontmatter.name : undefined;
  const directoryName = basename(resolvedDirectory);

  for (const required of REQUIRED_SKILLS) {
    const matchesFrontmatter = frontmatterName === required;
    const matchesDirectory = directoryName === required;
    if (!matchesFrontmatter && !matchesDirectory) continue;
    const copy: SkillCopy = {
      path,
      directoryName,
      frontmatterName,
      nameDrift: !matchesFrontmatter,
    };
    if (packageRoot) copy.packageRoot = packageRoot;
    byName[required].push(copy);
  }
}

function parseFrontmatter(text: string): Record<string, unknown> | undefined {
  const match = text.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return undefined;
  try {
    const parsed = parseYaml(match[1], { uniqueKeys: false });
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    // Unreadable frontmatter falls back to the directory name with drift.
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissingError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

function isDirectory(path: string, skipped: SkipCounter): boolean {
  try {
    return fs.statSync(path).isDirectory();
  } catch {
    skipped.count++;
    return false;
  }
}

function sortEntries(entries: fs.Dirent[]): fs.Dirent[] {
  return [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
