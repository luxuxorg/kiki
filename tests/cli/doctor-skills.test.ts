import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  REQUIRED_SKILLS,
  TESTED_SUPERPOWERS_VERSION,
  discoverSkills,
  observeSkills,
  type SkillDiscovery,
  type SkillObservation,
} from '../../src/cli/doctor-skills';

const fsControl = vi.hoisted(() => ({ unreadable: '', eaccesRealpath: '', eaccesReaddir: '' }));
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const denied = (): NodeJS.ErrnoException => {
    const error = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
    error.code = 'EACCES';
    return error;
  };
  const readFileSync = ((...args: Parameters<typeof actual.readFileSync>) => {
    if (fsControl.unreadable && String(args[0]) === fsControl.unreadable) throw denied();
    return actual.readFileSync(...args);
  }) as typeof actual.readFileSync;
  const realpathSync = ((...args: Parameters<typeof actual.realpathSync>) => {
    if (fsControl.eaccesRealpath && String(args[0]) === fsControl.eaccesRealpath) throw denied();
    return actual.realpathSync(...args);
  }) as typeof actual.realpathSync;
  const readdirSync = ((...args: Parameters<typeof actual.readdirSync>) => {
    if (fsControl.eaccesReaddir && String(args[0]) === fsControl.eaccesReaddir) throw denied();
    return actual.readdirSync(...args);
  }) as typeof actual.readdirSync;
  return { ...actual, readFileSync, realpathSync, readdirSync };
});

const EXPECTED_SKILLS = [
  'brainstorming',
  'writing-plans',
  'executing-plans',
  'test-driven-development',
  'systematic-debugging',
  'receiving-code-review',
  'requesting-code-review',
  'ui-ux-pro-max',
];

let root: string;
let project: string;
let home: string;
let xdgConfig: string;
let xdgCache: string;
let env: NodeJS.ProcessEnv;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'kiki-skills-'));
  project = join(root, 'project');
  home = join(root, 'home');
  xdgConfig = join(root, 'xdg-config');
  xdgCache = join(root, 'xdg-cache');
  mkdirSync(project, { recursive: true });
  mkdirSync(home, { recursive: true });
  env = {
    HOME: home,
    XDG_CONFIG_HOME: xdgConfig,
    XDG_CACHE_HOME: xdgCache,
  } as NodeJS.ProcessEnv;
});

afterEach(() => {
  fsControl.unreadable = '';
  fsControl.eaccesRealpath = '';
  fsControl.eaccesReaddir = '';
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

function writeSkill(dir: string, frontmatter?: string, body = 'Skill body'): string {
  mkdirSync(dir, { recursive: true });
  const text = frontmatter === undefined ? body : `---\n${frontmatter}\n---\n${body}`;
  const file = join(dir, 'SKILL.md');
  writeFileSync(file, text);
  return file;
}

const fm = (name: string) => `name: ${name}\ndescription: fixture`;
const projectSkills = () => join(project, '.opencode', 'skills');
const legacySkills = () => join(home, '.opencode', 'skills');
const xdgSkills = () => join(xdgConfig, 'opencode', 'skills');
const cachePackages = () => join(xdgCache, 'opencode', 'packages');

function cacheSkill(relativePackagePath: string, directoryName: string, frontmatter?: string): string {
  return writeSkill(join(cachePackages(), relativePackagePath, 'skills', directoryName), frontmatter);
}

const copies = (discovery: SkillDiscovery, name: string) => discovery.byName[name] ?? [];

describe('constants and discovery shape', () => {
  it('exports exactly the eight required skill names in spec order', () => {
    expect(REQUIRED_SKILLS).toEqual(EXPECTED_SKILLS);
    expect(EXPECTED_SKILLS).toHaveLength(8);
  });

  it('records the tested superpowers version as a plain observation', () => {
    expect(TESTED_SUPERPOWERS_VERSION).toBe('7.0.1');
  });

  it('returns an empty discovery for missing roots', () => {
    const discovery = discoverSkills(project, {
      HOME: join(root, 'missing-home'),
      XDG_CONFIG_HOME: join(root, 'missing-config'),
      XDG_CACHE_HOME: join(root, 'missing-cache'),
    } as NodeJS.ProcessEnv);
    expect(discovery.skippedEntries).toBe(0);
    for (const name of EXPECTED_SKILLS) expect(copies(discovery, name)).toEqual([]);
  });
});

describe('four discovery roots', () => {
  it('discovers project, legacy user, XDG user and nested package-cache skills', () => {
    const projectCopy = writeSkill(join(projectSkills(), 'brainstorming'), fm('brainstorming'));
    const legacyCopy = writeSkill(join(legacySkills(), 'writing-plans'), fm('writing-plans'));
    const xdgCopy = writeSkill(join(xdgSkills(), 'executing-plans'), fm('executing-plans'));
    const packageRoot = join(
      cachePackages(),
      'superpowers@git+https:/github.com/obra/superpowers.git/node_modules/superpowers',
    );
    const cacheCopy = writeSkill(join(packageRoot, 'skills', 'test-driven-development'), fm('test-driven-development'));

    const discovery = discoverSkills(project, env);

    expect(copies(discovery, 'brainstorming')[0]).toMatchObject({
      path: projectCopy,
      directoryName: 'brainstorming',
      frontmatterName: 'brainstorming',
      nameDrift: false,
    });
    expect(copies(discovery, 'brainstorming')[0].packageRoot).toBeUndefined();
    expect(copies(discovery, 'writing-plans')[0].path).toBe(legacyCopy);
    expect(copies(discovery, 'writing-plans')[0].packageRoot).toBeUndefined();
    expect(copies(discovery, 'executing-plans')[0].path).toBe(xdgCopy);
    expect(copies(discovery, 'executing-plans')[0].packageRoot).toBeUndefined();
    expect(copies(discovery, 'test-driven-development')[0]).toMatchObject({
      path: cacheCopy,
      directoryName: 'test-driven-development',
      frontmatterName: 'test-driven-development',
      nameDrift: false,
      packageRoot,
    });
    for (const name of EXPECTED_SKILLS) {
      for (const copy of copies(discovery, name)) expect(isAbsolute(copy.path)).toBe(true);
    }
  });

  it('falls back to HOME defaults when XDG variables are absent', () => {
    writeSkill(join(home, '.config', 'opencode', 'skills', 'systematic-debugging'), fm('systematic-debugging'));
    writeSkill(
      join(
        home,
        '.cache',
        'opencode',
        'packages',
        'superpowers@git+https:/github.com/x/superpowers.git',
        'node_modules',
        'superpowers',
        'skills',
        'receiving-code-review',
      ),
      fm('receiving-code-review'),
    );

    const discovery = discoverSkills(project, { HOME: home } as NodeJS.ProcessEnv);

    expect(copies(discovery, 'systematic-debugging')).toHaveLength(1);
    expect(copies(discovery, 'receiving-code-review')).toHaveLength(1);
  });

  it('uses XDG overrides instead of HOME defaults', () => {
    writeSkill(join(home, '.config', 'opencode', 'skills', 'brainstorming'), fm('brainstorming'));
    writeSkill(join(home, '.cache', 'opencode', 'packages', 'p/node_modules/superpowers/skills/brainstorming'), fm('brainstorming'));
    writeSkill(join(xdgSkills(), 'writing-plans'), fm('writing-plans'));
    cacheSkill('p/node_modules/superpowers', 'executing-plans', fm('executing-plans'));

    const discovery = discoverSkills(project, env);

    expect(copies(discovery, 'writing-plans')).toHaveLength(1);
    expect(copies(discovery, 'executing-plans')).toHaveLength(1);
    expect(copies(discovery, 'brainstorming')).toEqual([]);
  });

  it('supports scoped package cache layouts and reports the owning package', () => {
    const packageRoot = join(cachePackages(), 'p', 'node_modules', '@scope', 'superpowers');
    const skill = writeSkill(join(packageRoot, 'skills', 'ui-ux-pro-max'), fm('ui-ux-pro-max'));

    const discovery = discoverSkills(project, env);

    expect(copies(discovery, 'ui-ux-pro-max')[0]).toMatchObject({ path: skill, packageRoot });
  });
});

describe('precedence, ordering and deduplication', () => {
  it('orders copies project then legacy user then XDG user then package cache', () => {
    const projectCopy = writeSkill(join(projectSkills(), 'brainstorming'), fm('brainstorming'));
    const legacyCopy = writeSkill(join(legacySkills(), 'a-legacy'), fm('brainstorming'));
    const xdgCopy = writeSkill(join(xdgSkills(), 'z-xdg'), fm('brainstorming'));
    const cacheCopy = cacheSkill('p/node_modules/superpowers', 'cache-copy', fm('brainstorming'));

    const found = copies(discoverSkills(project, env), 'brainstorming');

    expect(found.map(copy => copy.path)).toEqual([projectCopy, legacyCopy, xdgCopy, cacheCopy]);
  });

  it('sorts copies inside a root lexically and keeps distinct copies', () => {
    const second = writeSkill(join(projectSkills(), 'z-second'), fm('brainstorming'));
    const first = writeSkill(join(projectSkills(), 'a-first'), fm('brainstorming'));

    const found = copies(discoverSkills(project, env), 'brainstorming');

    expect(found.map(copy => copy.path)).toEqual([first, second]);
  });

  it('deduplicates identical realpaths while retaining distinct copies', () => {
    const target = join(projectSkills(), 'brainstorming');
    const projectCopy = writeSkill(target, fm('brainstorming'));
    mkdirSync(legacySkills(), { recursive: true });
    symlinkSync(target, join(legacySkills(), 'linked-copy'), 'dir');
    writeSkill(join(xdgSkills(), 'brainstorming'), fm('brainstorming'));

    const found = copies(discoverSkills(project, env), 'brainstorming');

    expect(found).toHaveLength(2);
    expect(found[0].path).toBe(projectCopy);
    expect(found.every(copy => copy.path !== join(legacySkills(), 'linked-copy', 'SKILL.md'))).toBe(true);
  });
});

describe('frontmatter and directory-name matching', () => {
  it('matches frontmatter names even when the directory name differs', () => {
    const path = writeSkill(join(projectSkills(), 'renamed-dir'), fm('test-driven-development'));

    const found = copies(discoverSkills(project, env), 'test-driven-development');

    expect(found[0]).toMatchObject({
      path,
      directoryName: 'renamed-dir',
      frontmatterName: 'test-driven-development',
      nameDrift: false,
    });
  });

  it('falls back to the directory name with a drift marker when frontmatter differs', () => {
    const path = writeSkill(join(projectSkills(), 'brainstorming'), fm('some-other-name'));

    const found = copies(discoverSkills(project, env), 'brainstorming');

    expect(found[0]).toMatchObject({
      path,
      directoryName: 'brainstorming',
      frontmatterName: 'some-other-name',
      nameDrift: true,
    });
  });

  it('falls back to the directory name when frontmatter is missing or malformed', () => {
    const missing = writeSkill(join(projectSkills(), 'writing-plans'), undefined);
    const malformed = writeSkill(join(projectSkills(), 'executing-plans'), 'name: [unterminated');

    const discovery = discoverSkills(project, env);

    expect(copies(discovery, 'writing-plans')[0]).toMatchObject({
      path: missing,
      frontmatterName: undefined,
      nameDrift: true,
    });
    expect(copies(discovery, 'executing-plans')[0]).toMatchObject({
      path: malformed,
      frontmatterName: undefined,
      nameDrift: true,
    });
  });

  it('records both alias observations when frontmatter and directory match different required names', () => {
    const path = writeSkill(join(projectSkills(), 'brainstorming'), fm('writing-plans'));

    const discovery = discoverSkills(project, env);

    expect(copies(discovery, 'writing-plans')[0]).toMatchObject({
      path,
      directoryName: 'brainstorming',
      frontmatterName: 'writing-plans',
      nameDrift: false,
    });
    expect(copies(discovery, 'brainstorming')[0]).toMatchObject({
      path,
      directoryName: 'brainstorming',
      frontmatterName: 'writing-plans',
      nameDrift: true,
    });
  });

  it('keeps deterministic first-wins ordering per required name', () => {
    const first = writeSkill(join(projectSkills(), 'a-alias'), fm('systematic-debugging'));
    const second = writeSkill(join(projectSkills(), 'b-alias'), fm('systematic-debugging'));

    const found = copies(discoverSkills(project, env), 'systematic-debugging');

    expect(found.map(copy => copy.path)).toEqual([first, second]);
    expect(found[0].path).toBe(first);
  });
});

describe('bounded cache traversal', () => {
  it('discovers a skill directory at exactly depth 8 but ignores depth 9', () => {
    const atDepth8 = cacheSkill('p1/p2/p3/p4/node_modules/pkg', 'brainstorming', fm('brainstorming'));
    cacheSkill('p1/p2/p3/p4/p5/node_modules/pkg', 'writing-plans', fm('writing-plans'));

    const discovery = discoverSkills(project, env);

    expect(copies(discovery, 'brainstorming').map(copy => copy.path)).toEqual([atDepth8]);
    expect(copies(discovery, 'writing-plans')).toEqual([]);
  });

  it('does not count packages without a skills directory as skipped', () => {
    const skill = cacheSkill('p/node_modules/superpowers', 'brainstorming', fm('brainstorming'));
    mkdirSync(join(cachePackages(), 'p', 'node_modules', 'no-skills-here'), { recursive: true });

    const discovery = discoverSkills(project, env);

    expect(copies(discovery, 'brainstorming').map(copy => copy.path)).toEqual([skill]);
    expect(discovery.skippedEntries).toBe(0);
  });

  it('does not crawl arbitrary node_modules interiors', () => {
    cacheSkill('p/node_modules/pkg/lib/deep', 'brainstorming', fm('brainstorming'));
    cacheSkill('p/node_modules/pkg/node_modules/other', 'writing-plans', fm('writing-plans'));

    const discovery = discoverSkills(project, env);

    expect(copies(discovery, 'brainstorming')).toEqual([]);
    expect(copies(discovery, 'writing-plans')).toEqual([]);
  });

  it('retains a real package skill after a symlink alias was walked generically', () => {
    const packageRoot = join(cachePackages(), 'z', 'node_modules', 'superpowers');
    const skill = writeSkill(join(packageRoot, 'skills', 'brainstorming'), fm('brainstorming'));
    symlinkSync(packageRoot, join(cachePackages(), 'a-link'), 'dir');

    const discovery = discoverSkills(project, env);

    expect(copies(discovery, 'brainstorming').map(copy => copy.path)).toEqual([skill]);
    expect(discovery.skippedEntries).toBe(0);
  });

  it('terminates on cyclic symlinks and deduplicates duplicate symlinked packages', () => {
    const packageRoot = join(cachePackages(), 'p', 'node_modules', 'superpowers');
    const skill = writeSkill(join(packageRoot, 'skills', 'brainstorming'), fm('brainstorming'));
    const loop = join(cachePackages(), 'loop');
    mkdirSync(loop, { recursive: true });
    symlinkSync(loop, join(loop, 'self'), 'dir');
    symlinkSync(packageRoot, join(cachePackages(), 'p', 'node_modules', 'zz-duplicate-package'), 'dir');

    const discovery = discoverSkills(project, env);

    expect(copies(discovery, 'brainstorming').map(copy => copy.path)).toEqual([skill]);
  });

  it('survives malformed partial cache trees without throwing', () => {
    mkdirSync(cachePackages(), { recursive: true });
    writeFileSync(join(cachePackages(), 'not-a-directory'), 'partial');
    mkdirSync(join(cachePackages(), 'p', 'node_modules', 'pkg', 'skills'), { recursive: true });
    writeFileSync(join(cachePackages(), 'p', 'node_modules', 'pkg', 'skills', 'not-a-skill'), 'not a directory');
    symlinkSync(join(root, 'missing-target'), join(cachePackages(), 'broken-link'), 'dir');
    writeSkill(join(projectSkills(), 'sample-without-frontmatter'), undefined);

    expect(() => discoverSkills(project, env)).not.toThrow();
  });

  it('counts a cache-root realpath EACCES instead of silently returning', () => {
    fsControl.eaccesRealpath = resolve(cachePackages());

    const discovery = discoverSkills(project, env);

    expect(discovery.skippedEntries).toBeGreaterThanOrEqual(1);
  });

  it('counts an ordinary-root lookup EACCES even when the root path is absent', () => {
    fsControl.eaccesReaddir = resolve(projectSkills());

    const discovery = discoverSkills(project, env);

    expect(discovery.skippedEntries).toBeGreaterThanOrEqual(1);
  });

  it('counts injected EACCES entries without printing file contents', () => {
    const readable = writeSkill(join(projectSkills(), 'brainstorming'), fm('brainstorming'));
    const blocked = writeSkill(join(projectSkills(), 'writing-plans'), fm('writing-plans'));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

    fsControl.unreadable = blocked;
    const discovery = discoverSkills(project, env);

    expect(copies(discovery, 'brainstorming').map(copy => copy.path)).toEqual([readable]);
    expect(copies(discovery, 'writing-plans')).toEqual([]);
    expect(discovery.skippedEntries).toBeGreaterThanOrEqual(1);
    expect(log).not.toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();
  });
});

function writePackage(packageRoot: string, contents: unknown | string): void {
  mkdirSync(packageRoot, { recursive: true });
  const text = typeof contents === 'string' ? contents : JSON.stringify(contents);
  writeFileSync(join(packageRoot, 'package.json'), text);
}

function cachePackage(relative: string): string {
  return join(cachePackages(), relative);
}

const versionObservations = (observations: SkillObservation[]) =>
  observations.filter(observation => observation.label === 'superpowers version');

function observeVersionValue(version: string): SkillObservation {
  const packageRoot = cachePackage('p/node_modules/superpowers');
  cacheSkill('p/node_modules/superpowers', 'brainstorming', fm('brainstorming'));
  writePackage(packageRoot, { name: 'superpowers', version });
  return versionObservations(observeSkills(discoverSkills(project, env)))[0];
}

describe('skill observations', () => {
  it('warns for every missing required skill and for an unknown superpowers version', () => {
    const observations = observeSkills(discoverSkills(project, env));

    for (const name of EXPECTED_SKILLS) {
      const observation = observations.find(item => item.label === `skill ${name}`);
      expect(observation, name).toMatchObject({ level: 'warn' });
      expect(observation!.detail).toContain('not found on disk');
    }
    expect(observations.find(item => item.label === 'skill brainstorming')!.detail).toContain(
      'install the superpowers OpenCode package',
    );
    expect(observations.find(item => item.label === 'skill ui-ux-pro-max')!.detail).toContain(
      'install the ui-ux-pro-max skill in ~/.opencode/skills',
    );

    const versions = versionObservations(observations);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ level: 'warn' });
    expect(versions[0].detail).toContain('version unknown');
  });

  it('warns on name drift without repairing the file', () => {
    const path = writeSkill(join(projectSkills(), 'brainstorming'), fm('some-other-name'));
    const before = readFileSync(path);
    const observation = observeSkills(discoverSkills(project, env)).find(
      item => item.label === 'skill brainstorming',
    );

    expect(observation).toMatchObject({ level: 'warn' });
    expect(observation!.detail).toContain("name drift: frontmatter says 'some-other-name'");
    expect(readFileSync(path)).toEqual(before);
  });

  it('warns on drift when frontmatter is missing or malformed', () => {
    writeSkill(join(projectSkills(), 'executing-plans'), undefined);
    writeSkill(join(projectSkills(), 'writing-plans'), 'name: [unterminated');
    const observations = observeSkills(discoverSkills(project, env));

    for (const name of ['executing-plans', 'writing-plans']) {
      const observation = observations.find(item => item.label === `skill ${name}`);
      expect(observation).toMatchObject({ level: 'warn' });
      expect(observation!.detail).toContain('name drift');
    }
  });

  it('reports duplicate distinct copies as info while the first copy wins', () => {
    const first = writeSkill(join(projectSkills(), 'brainstorming'), fm('brainstorming'));
    const second = writeSkill(join(xdgSkills(), 'brainstorming'), fm('brainstorming'));

    const observations = observeSkills(discoverSkills(project, env));
    const result = observations.find(item => item.label === 'skill brainstorming')!;
    const duplicate = observations.find(item => item.label === 'skill brainstorming duplicate copies')!;

    expect(result).toMatchObject({ level: 'pass' });
    expect(result.detail).toContain(first);
    expect(duplicate).toMatchObject({ level: 'info' });
    expect(duplicate.detail).toContain('2 copies found');
    expect(duplicate.detail).toContain(first);
    expect(second).not.toBe(first);
  });

  it('reports a pass when the observed superpowers version equals the tested version', () => {
    const packageRoot = cachePackage('p/node_modules/superpowers');
    cacheSkill('p/node_modules/superpowers', 'brainstorming', fm('brainstorming'));
    writePackage(packageRoot, { name: 'superpowers', version: TESTED_SUPERPOWERS_VERSION });

    const versions = versionObservations(observeSkills(discoverSkills(project, env)));

    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ level: 'pass' });
    expect(versions[0].detail).toContain(`${TESTED_SUPERPOWERS_VERSION} (matches tested version)`);
  });

  it.each(['6.0.0', '8.0.0', '7.0.1-beta.2'])(
    'warns without a floor or compatibility claim for observed version %s',
    version => {
      const packageRoot = cachePackage('p/node_modules/superpowers');
      cacheSkill('p/node_modules/superpowers', 'brainstorming', fm('brainstorming'));
      writePackage(packageRoot, { name: 'superpowers', version });

      const observation = versionObservations(observeSkills(discoverSkills(project, env)))[0];

      expect(observation).toMatchObject({ level: 'warn' });
      expect(observation.detail).toContain(`observed superpowers ${version}`);
      expect(observation.detail).toContain(`tested against ${TESTED_SUPERPOWERS_VERSION}`);
      expect(observation.detail).toContain('re-verify skill behavior after any superpowers change');
      expect(observation.detail).not.toContain('>=');
    },
  );

  it.each([
    ['missing package.json', undefined],
    ['malformed package.json', '{'],
    ['non-string version', JSON.stringify({ name: 'superpowers', version: 7 })],
    ['invalid version', JSON.stringify({ name: 'superpowers', version: '7.0' })],
  ])('warns with an unknown version for a %s', (_label, packageJson) => {
    const packageRoot = cachePackage('p/node_modules/superpowers');
    cacheSkill('p/node_modules/superpowers', 'brainstorming', fm('brainstorming'));
    if (packageJson !== undefined) writeFileSync(join(packageRoot, 'package.json'), packageJson);

    const observation = versionObservations(observeSkills(discoverSkills(project, env)))[0];

    expect(observation).toMatchObject({ level: 'warn' });
    expect(observation.detail).toContain('version unknown');
  });

  it.each([
    ['leading-zero major', '07.0.1'],
    ['leading-zero minor', '7.00.1'],
    ['leading-zero patch', '7.0.01'],
    ['empty prerelease identifier', '7.0.1-beta..2'],
    ['empty build identifier', '7.0.1+.'],
    ['empty middle build identifier', '7.0.1+build..1'],
    ['trailing build separator', '7.0.1+build.'],
    ['multiple build separators', '7.0.1+build+build'],
    ['empty prerelease', '7.0.1-'],
    ['numeric prerelease leading zero', '7.0.1-01'],
    ['dotted numeric prerelease leading zero', '7.0.1-alpha.01'],
    ['four core identifiers', '7.0.1.0'],
    ['v prefix', 'v7.0.1'],
    ['leading whitespace', ' 7.0.1'],
  ])('classifies malformed SemVer %s as unknown, not observed', (_label, version) => {
    const observation = observeVersionValue(version);

    expect(observation).toMatchObject({
      level: 'warn',
      detail: 'version unknown (unreadable package.json)',
    });
    expect(observation.detail).not.toContain('observed superpowers');
    expect(observation.detail).not.toContain('(prerelease)');
  });

  it.each([
    ['zero core', '0.0.0'],
    ['numeric prerelease zero', '7.0.1-0'],
    ['alphanumeric prerelease starting with a digit', '7.0.1-0a'],
    ['dotted prerelease', '7.0.1-alpha.0'],
    ['hyphenated prerelease', '7.0.1-alpha-beta'],
    ['build metadata with leading zeros', '7.0.1+001'],
    ['prerelease with build metadata', '7.0.1-beta+exp.sha.5114f85'],
  ])('keeps valid SemVer %s as a warning observation', (_label, version) => {
    const observation = observeVersionValue(version);

    expect(observation.level).toBe('warn');
    expect(observation.detail).toContain(`observed superpowers ${version}`);
    expect(observation.detail).not.toContain('version unknown');
    if (version.includes('-')) expect(observation.detail).toContain(`${version} (prerelease)`);
    else expect(observation.detail).not.toContain('(prerelease)');
  });

  const TRAILING_TERMINATOR_VERSIONS: Array<[string, string]> = [
    ['core LF', '7.0.1\n'],
    ['core CR', '7.0.1\r'],
    ['core CRLF', '7.0.1\r\n'],
    ['core U+2028', '7.0.1\u2028'],
    ['core U+2029', '7.0.1\u2029'],
    ['prerelease LF', '7.0.1-beta\n'],
    ['prerelease CR', '7.0.1-beta\r'],
    ['prerelease CRLF', '7.0.1-beta\r\n'],
    ['prerelease U+2028', '7.0.1-beta\u2028'],
    ['prerelease U+2029', '7.0.1-beta\u2029'],
    ['build LF', '7.0.1+build\n'],
    ['build CR', '7.0.1+build\r'],
    ['build CRLF', '7.0.1+build\r\n'],
    ['build U+2028', '7.0.1+build\u2028'],
    ['build U+2029', '7.0.1+build\u2029'],
  ];

  it.each(TRAILING_TERMINATOR_VERSIONS)(
    'classifies %s as unknown because the validator must consume the entire value',
    (_label, version) => {
      const observation = observeVersionValue(version);

      expect(observation).toMatchObject({
        level: 'warn',
        detail: 'version unknown (unreadable package.json)',
      });
      expect(observation.detail).not.toContain('observed superpowers');
      expect(observation.detail).not.toContain('(prerelease)');
    },
  );

  it('uses full-consumption matching for version validator patterns', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/cli/doctor-skills.ts'), 'utf8');

    expect(source).toContain('function matchesEntire(pattern: RegExp, value: string): boolean');
    expect(source).toContain('pattern.exec(value)?.[0] === value');
    expect(source).not.toMatch(/const (?:NUMERIC_IDENTIFIER|IDENTIFIER_CHARACTERS) = [^\n]*\$\/;/);
    expect(source).not.toContain('/^\d+$/');
  });

  it('warns when no package-cache package was discovered', () => {
    writeSkill(join(projectSkills(), 'brainstorming'), fm('brainstorming'));

    const versions = versionObservations(observeSkills(discoverSkills(project, env)));

    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ level: 'warn' });
    expect(versions[0].detail).toContain('version unknown');
  });

  it('reads the package version even when the primary skill copy is in the project', () => {
    const primary = writeSkill(join(projectSkills(), 'brainstorming'), fm('brainstorming'));
    const packageRoot = cachePackage('p/node_modules/superpowers');
    writeSkill(join(packageRoot, 'skills', 'writing-plans'), fm('writing-plans'));
    writePackage(packageRoot, { name: 'superpowers', version: TESTED_SUPERPOWERS_VERSION });

    const observations = observeSkills(discoverSkills(project, env));
    const skill = observations.find(item => item.label === 'skill brainstorming')!;
    const versions = versionObservations(observations);

    expect(skill).toMatchObject({ level: 'pass' });
    expect(skill.detail).toContain(primary);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ level: 'pass' });
  });

  it('does not let ui-ux-pro-max impersonate a superpowers package', () => {
    const packageRoot = cachePackage('p/node_modules/ui-ux-pro-max');
    writeSkill(join(packageRoot, 'skills', 'ui-ux-pro-max'), fm('ui-ux-pro-max'));
    writePackage(packageRoot, { name: 'ui-ux-pro-max', version: TESTED_SUPERPOWERS_VERSION });

    const observations = observeSkills(discoverSkills(project, env));
    const versions = versionObservations(observations);

    expect(observations.find(item => item.label === 'skill ui-ux-pro-max')).toMatchObject({
      level: 'pass',
    });
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ level: 'warn' });
    expect(versions[0].detail).toContain('version unknown');
  });

  it('reports conflicting package versions as separate deterministic observations', () => {
    const firstRoot = cachePackage('a/node_modules/superpowers');
    const secondRoot = cachePackage('b/node_modules/superpowers');
    writeSkill(join(firstRoot, 'skills', 'brainstorming'), fm('brainstorming'));
    writeSkill(join(secondRoot, 'skills', 'writing-plans'), fm('writing-plans'));
    writePackage(firstRoot, { name: 'superpowers', version: '6.0.0' });
    writePackage(secondRoot, { name: 'superpowers', version: TESTED_SUPERPOWERS_VERSION });

    const versions = versionObservations(observeSkills(discoverSkills(project, env)));

    expect(versions).toHaveLength(2);
    expect(versions.map(item => item.level)).toEqual(['warn', 'pass']);
    expect(versions[0].detail).toContain('6.0.0');
    expect(versions[1].detail).toContain(TESTED_SUPERPOWERS_VERSION);
  });
});
