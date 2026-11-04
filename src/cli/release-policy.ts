import { applyEdits, getNodeValue, modify, parseTree, type Node, type ParseError } from 'jsonc-parser';

export interface ReleaseOptions {
  apply: boolean;
  bump: 'auto' | 'major' | 'minor' | 'patch';
  since?: string;
  securityException?: string;
  help: boolean;
}

export interface Commit {
  hash: string;
  subject: string;
  body: string;
}

export interface VersionDecision {
  current: string;
  next: string;
  rule: string;
  ignored: number;
}

type Bump = ReleaseOptions['bump'];

const STABLE_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const CONVENTIONAL_SUBJECT = /^([A-Za-z][A-Za-z0-9-]*)(?:\(([^()\r\n]+)\))?(!)?: (.+)$/;
const BREAKING_FOOTER = /(?:^|\r?\n)BREAKING(?: CHANGE|-CHANGE):(?:[ \t]|\r?\n|$)/;

interface StableVersion {
  major: number;
  minor: number;
  patch: number;
}

interface ParsedCommit {
  type: string;
  scope?: string;
  description: string;
  breaking: boolean;
}

function stableVersion(value: string, label: string): StableVersion {
  const match = STABLE_SEMVER.exec(value);
  if (!match) {
    throw new Error(`release: ${label} '${value}' is not a stable SemVer version (X.Y.Z).`);
  }
  const parts: StableVersion = {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
  for (const component of [parts.major, parts.minor, parts.patch]) {
    if (!Number.isSafeInteger(component)) {
      throw new Error(
        `release: ${label} '${value}' is not a stable SemVer version with safe integer components.`,
      );
    }
  }
  return parts;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function requireSinceValue(value: string): void {
  if (value.trim() === '' || value.startsWith('-')) {
    throw new Error('release: --since requires a non-empty ref that does not begin with "-".');
  }
}

export function parseReleaseArgs(args: string[]): ReleaseOptions {
  let apply = false;
  let bump: Bump = 'auto';
  let since: string | undefined;
  let securityException: string | undefined;
  let help = false;
  const seen = new Set<string>();

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--apply' || arg === '--help' || arg === '-h') {
      const key = arg === '--apply' ? 'apply' : 'help';
      if (seen.has(key)) throw new Error(`release: duplicate option '${arg}'.`);
      seen.add(key);
      if (key === 'apply') apply = true;
      else help = true;
      continue;
    }
    if (arg === '--bump' || arg === '--since' || arg === '--security-exception') {
      const key = arg.slice(2);
      if (seen.has(key)) throw new Error(`release: duplicate option '${arg}'.`);
      seen.add(key);
      const value = args[++index];
      if (value === undefined || value.trim() === '' || value.startsWith('-')) {
        throw new Error(`release: ${arg} requires a value.`);
      }
      if (arg === '--bump') {
        if (value !== 'auto' && value !== 'major' && value !== 'minor' && value !== 'patch') {
          throw new Error(`release: invalid --bump value '${value}'.`);
        }
        bump = value;
      } else if (arg === '--since') {
        requireSinceValue(value);
        since = value;
      } else {
        securityException = value;
      }
      continue;
    }
    throw new Error(`release: unsupported argument '${arg}'.`);
  }

  const options: ReleaseOptions = { apply, bump, since, help };
  if (securityException !== undefined) options.securityException = securityException;
  return options;
}

export function selectBaseline(commitsNewestFirst: Commit[], current: string, since?: string): string {
  if (since !== undefined) {
    requireSinceValue(since);
    return since;
  }
  stableVersion(current, 'current version');
  const releaseToken = new RegExp(
    `(?:^|[^0-9A-Za-z.-])release\\s+v?${escapeRegExp(current)}(?![0-9A-Za-z.-])`,
  );
  const match = commitsNewestFirst.find((commit) => releaseToken.test(commit.subject));
  if (!match) {
    throw new Error(
      `release: no commit matches 'release v${current}'; pass --since <ref> to select the release baseline.`,
    );
  }
  return match.hash;
}

function parseConventionalSubject(subject: string): ParsedCommit | null {
  const match = CONVENTIONAL_SUBJECT.exec(subject);
  if (!match) return null;
  return {
    type: match[1].toLowerCase(),
    scope: match[2],
    description: match[4].trim(),
    breaking: match[3] === '!',
  };
}

function hasBreakingFooter(body: string): boolean {
  return BREAKING_FOOTER.test(body);
}

function compareVersions(a: StableVersion, b: StableVersion): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function nextVersion(
  current: StableVersion,
  bump: Exclude<Bump, 'auto'>,
  currentText: string,
): string {
  let next: StableVersion;
  if (bump === 'major') next = { major: current.major + 1, minor: 0, patch: 0 };
  else if (bump === 'minor') next = { major: current.major, minor: current.minor + 1, patch: 0 };
  else next = { major: current.major, minor: current.minor, patch: current.patch + 1 };
  const nextText = `${next.major}.${next.minor}.${next.patch}`;
  const parsedNext = stableVersion(nextText, 'next version');
  if (compareVersions(parsedNext, current) <= 0) {
    throw new Error(`release: next version '${nextText}' is not strictly greater than '${currentText}'.`);
  }
  return nextText;
}

export function decideVersion(current: string, commits: Commit[], bump: Bump): VersionDecision {
  const parsedCurrent = stableVersion(current, 'current version');
  let high: Exclude<Bump, 'auto'> | undefined;
  let inferredRule = '';
  let ignored = 0;

  for (const commit of commits) {
    const parsed = parseConventionalSubject(commit.subject);
    if (!parsed) {
      ignored++;
      continue;
    }
    if (parsed.breaking || hasBreakingFooter(commit.body)) {
      if (high !== 'major') {
        high = 'major';
        inferredRule = 'breaking change';
      }
    } else if (parsed.type === 'feat') {
      if (high !== 'major' && high !== 'minor') {
        high = 'minor';
        inferredRule = 'feat';
      }
    } else if ((parsed.type === 'fix' || parsed.type === 'perf') && high === undefined) {
      high = 'patch';
      inferredRule = 'fix/perf';
    }
  }

  let chosen: Exclude<Bump, 'auto'>;
  let rule: string;
  if (bump === 'auto') {
    if (high === undefined) {
      throw new Error('release: nothing release-worthy; use --bump to force a version bump.');
    }
    chosen = high;
    rule = inferredRule;
  } else {
    chosen = bump;
    rule = `--bump ${bump}`;
  }

  return {
    current,
    next: nextVersion(parsedCurrent, chosen, current),
    rule,
    ignored,
  };
}

function changelogBody(commits: Commit[]): string {
  const added: string[] = [];
  const changed: string[] = [];
  const fixed: string[] = [];

  for (const commit of commits) {
    const parsed = parseConventionalSubject(commit.subject);
    if (!parsed) continue;
    const bullet = `- ${parsed.description}${parsed.scope ? ` (${parsed.scope})` : ''}`;
    if (parsed.type === 'feat') added.push(bullet);
    else if (parsed.type === 'fix') fixed.push(bullet);
    else changed.push(bullet);
  }

  const groups: string[] = [];
  if (added.length > 0) groups.push(`### Added\n${added.join('\n')}`);
  if (changed.length > 0) groups.push(`### Changed\n${changed.join('\n')}`);
  if (fixed.length > 0) groups.push(`### Fixed\n${fixed.join('\n')}`);
  return groups.join('\n\n');
}

export function prepareChangelog(text: string, commits: Commit[], next: string, date: string): string {
  stableVersion(next, 'next version');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('release: changelog date must be YYYY-MM-DD.');
  }

  const unreleasedMatches = [...text.matchAll(/^## \[Unreleased\][ \t]*$/gm)];
  if (unreleasedMatches.length !== 1) {
    throw new Error("release: changelog must contain exactly one '## [Unreleased]' heading.");
  }

  const targetHeading = new RegExp(`^## \\[${escapeRegExp(next)}\\]`, 'm');
  if (targetHeading.test(text)) {
    throw new Error(`release: changelog target heading '## [${next}]' already exists.`);
  }

  const unreleased = unreleasedMatches[0];
  const headingStart = unreleased.index ?? 0;
  const headingEnd = headingStart + unreleased[0].length;
  const newline = /^\r\n|^\n|^\r/.exec(text.slice(headingEnd));
  const eol = newline?.[0] ?? '\n';
  const contentStart = headingEnd + eol.length;

  const nextHeading = /^## /gm;
  nextHeading.lastIndex = contentStart;
  const followingHeading = nextHeading.exec(text);
  const contentEnd = followingHeading ? followingHeading.index : text.length;
  const originalContent = text.slice(contentStart, contentEnd);
  const rest = text.slice(contentEnd);

  let content = originalContent;
  if (originalContent.trim() === '') {
    const generated = changelogBody(commits);
    if (generated === '') {
      throw new Error('release: changelog Unreleased content must be non-empty after generation.');
    }
    content = `${generated}${eol}${eol}`;
  }

  if (content.trim() === '') {
    throw new Error('release: changelog Unreleased content must be non-empty after generation.');
  }
  if (/\b(?:TODO|TBD)\b/.test(content)) {
    throw new Error('release: changelog contains a TODO/TBD placeholder.');
  }

  const freshUnreleased = `## [Unreleased]${eol}${eol}`;
  return `${text.slice(0, headingStart)}${freshUnreleased}## [${next}] — ${date}${eol}${content}${rest}`;
}

function parseDocument(text: string, label: string): Node {
  const errors: ParseError[] = [];
  const root = parseTree(text, errors, { disallowComments: true, allowTrailingComma: false });
  if (!root || errors.length > 0) {
    throw new Error(`release: ${label} is not valid JSON.`);
  }
  if (root.type !== 'object') {
    throw new Error(`release: ${label} must contain a JSON object.`);
  }
  return root;
}

function objectProperties(node: Node): Node[] {
  return (node.children ?? []).filter((child) => child.type === 'property');
}

function uniqueProperty(node: Node, key: string, label: string): Node {
  const properties = objectProperties(node).filter((property) => property.children?.[0]?.value === key);
  if (properties.length === 0) {
    throw new Error(`release: ${label} is required.`);
  }
  if (properties.length > 1) {
    throw new Error(`release: ${label} is duplicated (ambiguous).`);
  }
  const value = properties[0].children?.[1];
  if (!value) {
    throw new Error(`release: ${label} is required.`);
  }
  return value;
}

function requireStringProperty(node: Node, key: string, label: string): string {
  const value = uniqueProperty(node, key, label);
  if (value.type !== 'string' || typeof value.value !== 'string') {
    throw new Error(`release: ${label} must be a string.`);
  }
  return value.value;
}

function requireObjectProperty(node: Node, key: string, label: string): Node {
  const value = uniqueProperty(node, key, label);
  if (value.type !== 'object') {
    throw new Error(`release: ${label} must be an object.`);
  }
  return value;
}

function readLockfileVersions(text: string, label: string): { root: string; rootPackage: string } {
  const lock = parseDocument(text, label);
  const root = requireStringProperty(lock, 'version', `${label} root version`);
  const packages = requireObjectProperty(lock, 'packages', `${label} packages`);
  const rootPackage = requireObjectProperty(packages, '', `${label} packages[""]`);
  return {
    root,
    rootPackage: requireStringProperty(rootPackage, 'version', `${label} packages[""] version`),
  };
}

function synchronized(oldVersions: string[], next: string, label: string): void {
  if (oldVersions.some((value) => value !== next)) {
    throw new Error(`release: ${label} was not synchronized to ${next}.`);
  }
}

export function transformVersions(
  input: { packageJson: string; lockJson: string; configTs: string },
  next: string,
): { packageJson: string; lockJson: string; configTs: string } {
  stableVersion(next, 'next version');

  const packageRoot = parseDocument(input.packageJson, 'package.json');
  const packageVersion = requireStringProperty(packageRoot, 'version', 'package.json version');
  const packageData = getNodeValue(packageRoot) as Record<string, unknown>;

  const lockVersions = readLockfileVersions(input.lockJson, 'lockfile');
  const lockVersion = lockVersions.root;
  const lockPackageVersion = lockVersions.rootPackage;

  const configMatches = [...input.configTs.matchAll(/^export const KIKI_VERSION = '([^'\r\n]+)';$/gm)];
  if (configMatches.length !== 1) {
    throw new Error('release: src/cli/config.ts must contain exactly one anchored KIKI_VERSION export.');
  }
  const configOld = configMatches[0][1];

  const oldVersion = packageVersion;
  if ([lockVersion, lockPackageVersion, configOld].some((value) => value !== oldVersion)) {
    throw new Error(
      'release: current version sources do not match (package.json, package-lock.json, src/cli/config.ts).',
    );
  }
  stableVersion(oldVersion, 'current version');

  const packageNewline = /\r?\n$/.exec(input.packageJson)?.[0] ?? '';
  const packageJson = `${JSON.stringify({ ...packageData, version: next }, null, 2)}${packageNewline}`;

  const formattingOptions = { insertSpaces: true, tabSize: 2 };
  let lockJson = applyEdits(
    input.lockJson,
    modify(input.lockJson, ['version'], next, { formattingOptions }),
  );
  lockJson = applyEdits(
    lockJson,
    modify(lockJson, ['packages', '', 'version'], next, { formattingOptions }),
  );

  const configMatch = configMatches[0];
  const configStart = configMatch.index ?? 0;
  const configTs =
    input.configTs.slice(0, configStart) +
    `export const KIKI_VERSION = '${next}';` +
    input.configTs.slice(configStart + configMatch[0].length);

  synchronized(
    [
      requireStringProperty(
        parseDocument(packageJson, 'transformed package.json'),
        'version',
        'transformed package.json version',
      ),
      readLockfileVersions(lockJson, 'transformed lockfile').root,
      readLockfileVersions(lockJson, 'transformed lockfile').rootPackage,
    ],
    next,
    'transformed version sources',
  );
  if (!configTs.includes(`export const KIKI_VERSION = '${next}';`)) {
    throw new Error(`release: transformed src/cli/config.ts does not export KIKI_VERSION = '${next}'.`);
  }

  return { packageJson, lockJson, configTs };
}
