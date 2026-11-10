import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  REQUIRED_SKILLS, TESTED_SUPERPOWERS_VERSION, discoverSkills, observeSkills,
  type SkillDiscovery, type SkillObservation,
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
  'brainstorming', 'writing-plans', 'executing-plans', 'test-driven-development',
  'systematic-debugging', 'receiving-code-review', 'requesting-code-review', 'ui-ux-pro-max',
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
  env = { HOME: home, XDG_CONFIG_HOME: xdgConfig, XDG_CACHE_HOME: xdgCache } as NodeJS.ProcessEnv;
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
const projectSkillRoot = () => join(project, '.opencode', 'skill');
const globalSkills = () => join(xdgConfig, 'opencode', 'skills');
const globalSkillRoot = () => join(xdgConfig, 'opencode', 'skill');
const cacheSkills = () => join(xdgCache, 'opencode', 'skills');
const copies = (discovery: SkillDiscovery, name: string) => discovery.byName[name] ?? [];

function writeConfig(file: string, value: unknown): void {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
}

function writePackage(packageRoot: string, contents: unknown | string): void {
  mkdirSync(packageRoot, { recursive: true });
  writeFileSync(join(packageRoot, 'package.json'), typeof contents === 'string' ? contents : JSON.stringify(contents));
}

function packageSkill(packageRoot: string, name: string, frontmatter?: string): string {
  return writeSkill(join(packageRoot, 'skills', name), frontmatter ?? fm(name));
}

const versionObservations = (observations: SkillObservation[]) =>
  observations.filter(observation => observation.label === 'superpowers version');

function observeVersionValue(version: string): SkillObservation {
  const packageRoot = join(root, 'packages', 'superpowers');
  packageSkill(packageRoot, 'brainstorming');
  writePackage(packageRoot, { name: 'superpowers', version });
  writeConfig(join(project, 'opencode.json'), { skills: [join(packageRoot, 'skills')] });
  return versionObservations(observeSkills(discoverSkills(project, env)))[0];
}

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

describe('native OC2 skill roots', () => {
  it('discovers config skill/ and skills/ directories in project and global config', () => {
    const projectCopy = writeSkill(join(projectSkills(), 'brainstorming'), fm('brainstorming'));
    const projectSingle = writeSkill(join(projectSkillRoot(), 'writing-plans'), fm('writing-plans'));
    const globalCopy = writeSkill(join(globalSkills(), 'executing-plans'), fm('executing-plans'));
    const globalSingle = writeSkill(join(globalSkillRoot(), 'systematic-debugging'), fm('systematic-debugging'));

    const discovery = discoverSkills(project, env);

    expect(copies(discovery, 'brainstorming')[0]).toMatchObject({
      path: projectCopy, directoryName: 'brainstorming', frontmatterName: 'brainstorming',
      nameDrift: false, source: 'config-directory',
    });
    expect(copies(discovery, 'writing-plans')[0].path).toBe(projectSingle);
    expect(copies(discovery, 'executing-plans')[0].path).toBe(globalCopy);
    expect(copies(discovery, 'systematic-debugging')[0].path).toBe(globalSingle);
    for (const name of EXPECTED_SKILLS) {
      for (const copy of copies(discovery, name)) expect(isAbsolute(copy.path)).toBe(true);
    }
  });

  it('discovers explicit local, home-relative and absolute config skills paths', () => {
    const local = writeSkill(join(project, 'custom-skills', 'brainstorming'), fm('brainstorming'));
    const homeRelative = writeSkill(join(home, 'global-skills', 'writing-plans'), fm('writing-plans'));
    const absolute = writeSkill(join(root, 'absolute-skills', 'executing-plans'), fm('executing-plans'));
    writeConfig(join(project, 'opencode.json'), {
      skills: ['./custom-skills', '~/global-skills', join(root, 'absolute-skills')],
    });

    const discovery = discoverSkills(project, env);

    expect(copies(discovery, 'brainstorming')[0]).toMatchObject({ path: local, source: 'config-skills' });
    expect(copies(discovery, 'writing-plans')[0].path).toBe(homeRelative);
    expect(copies(discovery, 'executing-plans')[0].path).toBe(absolute);
  });

  it('discovers only the isolated URL cache, never V1 package-cache skills', () => {
    const cached = writeSkill(join(cacheSkills(), 'hash', 'ui-ux-pro-max'), fm('ui-ux-pro-max'));
    const v1Legacy = writeSkill(join(home, '.opencode', 'skills', 'brainstorming'), fm('brainstorming'));
    const v1Package = writeSkill(
      join(xdgCache, 'opencode', 'packages', 'superpowers', 'node_modules', 'superpowers', 'skills', 'writing-plans'),
      fm('writing-plans'),
    );

    const discovery = discoverSkills(project, env);

    expect(copies(discovery, 'ui-ux-pro-max')[0]).toMatchObject({ path: cached, source: 'url-cache' });
    expect(copies(discovery, 'brainstorming')).toEqual([]);
    expect(copies(discovery, 'writing-plans')).toEqual([]);
    expect(v1Legacy).not.toBe(cached);
    expect(v1Package).not.toBe(cached);
    expect(versionObservations(observeSkills(discovery))[0].detail).toContain('version unknown');
  });

  it('orders project config directories before global and preserves distinct copies', () => {
    const projectCopy = writeSkill(join(projectSkills(), 'brainstorming'), fm('brainstorming'));
    const globalCopy = writeSkill(join(globalSkills(), 'brainstorming'), fm('brainstorming'));
    const cacheCopy = writeSkill(join(cacheSkills(), 'hash', 'brainstorming'), fm('brainstorming'));

    const found = copies(discoverSkills(project, env), 'brainstorming');

    expect(found.map(copy => copy.path)).toEqual([projectCopy, globalCopy, cacheCopy]);
  });

  it('deduplicates identical realpaths while retaining distinct copies', () => {
    const target = join(projectSkills(), 'brainstorming');
    const projectCopy = writeSkill(target, fm('brainstorming'));
    mkdirSync(join(globalSkills()), { recursive: true });
    symlinkSync(target, join(globalSkills(), 'linked-copy'), 'dir');
    writeSkill(join(cacheSkills(), 'hash', 'brainstorming'), fm('brainstorming'));

    const found = copies(discoverSkills(project, env), 'brainstorming');

    expect(found).toHaveLength(2);
    expect(found[0].path).toBe(projectCopy);
    expect(found.every(copy => copy.path !== join(globalSkills(), 'linked-copy', 'SKILL.md'))).toBe(true);
  });
});

describe('frontmatter and directory-name matching', () => {
  it('matches frontmatter names even when the directory name differs', () => {
    const path = writeSkill(join(projectSkills(), 'renamed-dir'), fm('test-driven-development'));
    expect(copies(discoverSkills(project, env), 'test-driven-development')[0]).toMatchObject({
      path, directoryName: 'renamed-dir', frontmatterName: 'test-driven-development', nameDrift: false,
    });
  });

  it('falls back to the directory name with a drift marker when frontmatter differs', () => {
    const path = writeSkill(join(projectSkills(), 'brainstorming'), fm('some-other-name'));
    expect(copies(discoverSkills(project, env), 'brainstorming')[0]).toMatchObject({
      path, directoryName: 'brainstorming', frontmatterName: 'some-other-name', nameDrift: true,
    });
  });

  it('falls back to the directory name when frontmatter is missing or malformed', () => {
    const missing = writeSkill(join(projectSkills(), 'writing-plans'), undefined);
    const malformed = writeSkill(join(projectSkills(), 'executing-plans'), 'name: [unterminated');
    const discovery = discoverSkills(project, env);
    expect(copies(discovery, 'writing-plans')[0]).toMatchObject({ path: missing, nameDrift: true });
    expect(copies(discovery, 'executing-plans')[0]).toMatchObject({ path: malformed, nameDrift: true });
  });

  it('records both alias observations when frontmatter and directory match different required names', () => {
    const path = writeSkill(join(projectSkills(), 'brainstorming'), fm('writing-plans'));
    const discovery = discoverSkills(project, env);
    expect(copies(discovery, 'writing-plans')[0]).toMatchObject({ path, nameDrift: false });
    expect(copies(discovery, 'brainstorming')[0]).toMatchObject({ path, nameDrift: true });
  });
});

describe('bounded traversal and error handling', () => {
  it('discovers nested URL-cache skills but bounds traversal and skips dot directories', () => {
    const found = writeSkill(join(cacheSkills(), 'hash', 'a', 'ui-ux-pro-max'), fm('ui-ux-pro-max'));
    writeSkill(join(cacheSkills(), '.hidden', 'brainstorming'), fm('brainstorming'));
    const discovery = discoverSkills(project, env);
    expect(copies(discovery, 'ui-ux-pro-max').map(copy => copy.path)).toEqual([found]);
    expect(copies(discovery, 'brainstorming')).toEqual([]);
  });

  it('terminates on cyclic symlinks and deduplicates duplicate symlinked skills', () => {
    const skill = writeSkill(join(projectSkills(), 'brainstorming'), fm('brainstorming'));
    const loop = join(projectSkills(), 'loop');
    mkdirSync(loop, { recursive: true });
    symlinkSync(loop, join(loop, 'self'), 'dir');
    mkdirSync(join(globalSkills()), { recursive: true });
    symlinkSync(join(projectSkills(), 'brainstorming'), join(globalSkills(), 'zz-duplicate'), 'dir');
    expect(copies(discoverSkills(project, env), 'brainstorming').map(copy => copy.path)).toEqual([skill]);
  });

  it('counts an ordinary-root lookup EACCES and an injected unreadable skill without printing', () => {
    fsControl.eaccesReaddir = resolve(projectSkills());
    expect(discoverSkills(project, env).skippedEntries).toBeGreaterThanOrEqual(1);
    fsControl.eaccesReaddir = '';
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

describe('skill observations', () => {
  it('warns for every missing required skill and for an unknown superpowers version', () => {
    const observations = observeSkills(discoverSkills(project, env));
    for (const name of EXPECTED_SKILLS) {
      const observation = observations.find(item => item.label === `skill ${name}`);
      expect(observation, name).toMatchObject({ level: 'warn' });
      expect(observation!.detail).toContain('not found on disk');
    }
    expect(observations.find(item => item.label === 'skill brainstorming')!.detail).toContain(
      'OpenCode config skills/ directory',
    );
    expect(observations.find(item => item.label === 'skill ui-ux-pro-max')!.detail).toContain(
      'OpenCode config skills/ directory',
    );
    const versions = versionObservations(observations);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ level: 'warn' });
    expect(versions[0].detail).toContain('version unknown');
  });

  it('warns on name drift and reports duplicate distinct copies as info', () => {
    const drift = writeSkill(join(projectSkills(), 'brainstorming'), fm('some-other-name'));
    const first = writeSkill(join(globalSkills(), 'writing-plans'), fm('writing-plans'));
    writeSkill(join(cacheSkills(), 'hash', 'writing-plans'), fm('writing-plans'));

    const observations = observeSkills(discoverSkills(project, env));
    const driftObservation = observations.find(item => item.label === 'skill brainstorming')!;
    expect(driftObservation).toMatchObject({ level: 'warn' });
    expect(driftObservation.detail).toContain("name drift: frontmatter says 'some-other-name'");
    expect(readFileSync(drift, 'utf8')).toContain('some-other-name');

    const result = observations.find(item => item.label === 'skill writing-plans')!;
    const duplicate = observations.find(item => item.label === 'skill writing-plans duplicate copies')!;
    expect(result).toMatchObject({ level: 'pass' });
    expect(result.detail).toContain(first);
    expect(result.detail).toContain('config skills directory');
    expect(duplicate).toMatchObject({ level: 'info' });
    expect(duplicate.detail).toContain('2 copies found');
  });

  it('marks explicit path and URL-cache observations as disk-only', () => {
    const explicit = writeSkill(join(project, 'custom-skills', 'brainstorming'), fm('brainstorming'));
    const cached = writeSkill(join(cacheSkills(), 'hash', 'writing-plans'), fm('writing-plans'));
    writeConfig(join(project, 'opencode.json'), { skills: ['./custom-skills'] });
    const observations = observeSkills(discoverSkills(project, env));
    const explicitObservation = observations.find(item => item.label === 'skill brainstorming')!;
    const cacheObservation = observations.find(item => item.label === 'skill writing-plans')!;
    expect(explicitObservation.detail).toContain(explicit);
    expect(explicitObservation.detail).toContain('configured skills path; disk-only');
    expect(cacheObservation.detail).toContain(cached);
    expect(cacheObservation.detail).toContain('URL cache; disk-only');
  });

  it('reports a pass when the observed superpowers version equals the tested version', () => {
    const packageRoot = join(root, 'packages', 'superpowers');
    packageSkill(packageRoot, 'brainstorming');
    writePackage(packageRoot, { name: 'superpowers', version: TESTED_SUPERPOWERS_VERSION });
    writeConfig(join(project, 'opencode.json'), { skills: [join(packageRoot, 'skills')] });
    const versions = versionObservations(observeSkills(discoverSkills(project, env)));
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ level: 'pass' });
    expect(versions[0].detail).toContain(`${TESTED_SUPERPOWERS_VERSION} (matches tested version)`);
  });

  it.each(['6.0.0', '8.0.0', '7.0.1-beta.2'])(
    'warns without a floor or compatibility claim for observed version %s',
    version => {
      const observation = observeVersionValue(version);
      expect(observation).toMatchObject({ level: 'warn' });
      expect(observation.detail).toContain(`observed superpowers ${version}`);
      expect(observation.detail).toContain(`tested against ${TESTED_SUPERPOWERS_VERSION}`);
      expect(observation.detail).toContain('re-verify skill behavior after any superpowers change');
      expect(observation.detail).not.toContain('>=');
    },
  );

  it.each([
    ['missing package.json', undefined], ['malformed package.json', '{'],
    ['non-string version', JSON.stringify({ name: 'superpowers', version: 7 })],
    ['invalid version', JSON.stringify({ name: 'superpowers', version: '7.0' })],
  ])('warns with an unknown version for a %s', (_label, packageJson) => {
    const packageRoot = join(root, 'packages', 'superpowers');
    packageSkill(packageRoot, 'brainstorming');
    if (packageJson !== undefined) writeFileSync(join(packageRoot, 'package.json'), packageJson);
    writeConfig(join(project, 'opencode.json'), { skills: [join(packageRoot, 'skills')] });
    expect(versionObservations(observeSkills(discoverSkills(project, env)))[0]).toMatchObject({ level: 'warn' });
  });

  it.each([
    ['leading-zero major', '07.0.1'], ['leading-zero minor', '7.00.1'], ['leading-zero patch', '7.0.01'],
    ['empty prerelease identifier', '7.0.1-beta..2'], ['empty build identifier', '7.0.1+.'],
    ['trailing build separator', '7.0.1+build.'], ['multiple build separators', '7.0.1+build+build'],
    ['empty prerelease', '7.0.1-'], ['numeric prerelease leading zero', '7.0.1-01'],
    ['four core identifiers', '7.0.1.0'], ['v prefix', 'v7.0.1'], ['leading whitespace', ' 7.0.1'],
  ])('classifies malformed SemVer %s as unknown', (_label, version) => {
    const observation = observeVersionValue(version);
    expect(observation).toMatchObject({ level: 'warn', detail: 'version unknown (unreadable package.json)' });
    expect(observation.detail).not.toContain('observed superpowers');
  });

  it.each([
    ['zero core', '0.0.0'], ['numeric prerelease zero', '7.0.1-0'],
    ['dotted prerelease', '7.0.1-alpha.0'], ['build metadata with leading zeros', '7.0.1+001'],
  ])('keeps valid SemVer %s as a warning observation', (_label, version) => {
    const observation = observeVersionValue(version);
    expect(observation.level).toBe('warn');
    expect(observation.detail).toContain(`observed superpowers ${version}`);
  });

  it('reads the package version from an explicit skills path and not a V1 package cache', () => {
    const packageRoot = join(root, 'packages', 'superpowers');
    packageSkill(packageRoot, 'brainstorming');
    writePackage(packageRoot, { name: 'superpowers', version: TESTED_SUPERPOWERS_VERSION });
    writeConfig(join(project, 'opencode.json'), { skills: [join(packageRoot, 'skills')] });
    const observations = observeSkills(discoverSkills(project, env));
    expect(observations.find(item => item.label === 'skill brainstorming')).toMatchObject({ level: 'pass' });
    expect(versionObservations(observations)[0]).toMatchObject({ level: 'pass' });
  });
});
