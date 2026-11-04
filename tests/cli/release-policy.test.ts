import { describe, it, expect } from 'vitest';
import {
  parseReleaseArgs,
  selectBaseline,
  decideVersion,
  prepareChangelog,
  transformVersions,
  type Commit,
} from '../../src/cli/release-policy';

function commit(hash: string, subject: string, body = ''): Commit {
  return { hash, subject, body };
}

const RELEASED = [
  commit('abc123', 'feat: release v2.2.0 with global-only installation and native /kiki menu'),
  commit('def456', 'fix: older fix'),
];

describe('parseReleaseArgs', () => {
  it('defaults to an auto-bump dry run without since or help', () => {
    expect(parseReleaseArgs([])).toEqual({
      apply: false,
      bump: 'auto',
      since: undefined,
      help: false,
    });
  });

  it('accepts --apply and every supported bump', () => {
    expect(parseReleaseArgs(['--apply', '--bump', 'major'])).toMatchObject({
      apply: true,
      bump: 'major',
    });
    for (const bump of ['auto', 'major', 'minor', 'patch'] as const) {
      expect(parseReleaseArgs(['--bump', bump]).bump).toBe(bump);
    }
  });

  it('accepts --since as data and both help spellings', () => {
    expect(parseReleaseArgs(['--since', 'origin/main'])).toEqual({
      apply: false,
      bump: 'auto',
      since: 'origin/main',
      help: false,
    });
    expect(parseReleaseArgs(['--help']).help).toBe(true);
    expect(parseReleaseArgs(['-h']).help).toBe(true);
  });

  it('accepts a non-empty security exception reason with dry-run and apply', () => {
    expect(parseReleaseArgs(['--security-exception', 'approved type-only graph'])).toEqual({
      apply: false,
      bump: 'auto',
      since: undefined,
      help: false,
      securityException: 'approved type-only graph',
    });
    expect(
      parseReleaseArgs(['--apply', '--security-exception', 'approved type-only graph']),
    ).toMatchObject({
      apply: true,
      securityException: 'approved type-only graph',
    });
  });

  it('does not add a securityException property when the flag is absent', () => {
    expect(Object.prototype.hasOwnProperty.call(parseReleaseArgs([]), 'securityException')).toBe(
      false,
    );
  });

  it('rejects unknown and positional arguments', () => {
    expect(() => parseReleaseArgs(['--dry-run'])).toThrow(/unsupported argument/);
    expect(() => parseReleaseArgs(['patch'])).toThrow(/unsupported argument/);
  });

  it('rejects duplicate options', () => {
    expect(() => parseReleaseArgs(['--apply', '--apply'])).toThrow(/duplicate/);
    expect(() => parseReleaseArgs(['--bump', 'patch', '--bump', 'minor'])).toThrow(/duplicate/);
    expect(() => parseReleaseArgs(['--since', 'a', '--since', 'b'])).toThrow(/duplicate/);
    expect(() =>
      parseReleaseArgs(['--security-exception', 'a', '--security-exception', 'b']),
    ).toThrow(/duplicate/);
    expect(() =>
      parseReleaseArgs(['--security-exception', 'a', '--security-exception', 'a']),
    ).toThrow(/duplicate/);
  });

  it('rejects missing, empty, and flag-like option values', () => {
    expect(() => parseReleaseArgs(['--bump'])).toThrow(/requires a value/);
    expect(() => parseReleaseArgs(['--bump', ''])).toThrow(/requires a value/);
    expect(() => parseReleaseArgs(['--bump', '  '])).toThrow(/requires a value/);
    expect(() => parseReleaseArgs(['--bump', '--apply'])).toThrow(/requires a value/);
    expect(() => parseReleaseArgs(['--since'])).toThrow(/requires a value/);
    expect(() => parseReleaseArgs(['--since', ''])).toThrow(/requires a value/);
    expect(() => parseReleaseArgs(['--since', '--apply'])).toThrow(/requires a value/);
    expect(() => parseReleaseArgs(['--security-exception'])).toThrow(/requires a value/);
    expect(() => parseReleaseArgs(['--security-exception', ''])).toThrow(/requires a value/);
    expect(() => parseReleaseArgs(['--security-exception', '  '])).toThrow(/requires a value/);
    expect(() => parseReleaseArgs(['--security-exception', '--apply'])).toThrow(/requires a value/);
  });

  it('rejects invalid bump values', () => {
    expect(() => parseReleaseArgs(['--bump', 'prerelease'])).toThrow(/invalid --bump/);
  });

  it('rejects refs that begin with a dash', () => {
    expect(() => parseReleaseArgs(['--since', '-HEAD~1'])).toThrow(/requires a value/);
  });
});

describe('selectBaseline', () => {
  it('recognizes the real shipped release subject', () => {
    expect(selectBaseline(RELEASED, '2.2.0')).toBe('abc123');
  });

  it('recognizes the optional v prefix and release tokens later in a subject', () => {
    expect(selectBaseline([commit('a', 'chore: tag release 2.2.0 now')], '2.2.0')).toBe('a');
    expect(selectBaseline([commit('a', 'docs: mention release v2.2.0 again')], '2.2.0')).toBe('a');
  });

  it('chooses the newest matching commit in git-log order', () => {
    const commits = [
      commit('new', 'fix: unrelated'),
      commit('mid', 'feat: release v2.2.0 second'),
      commit('old', 'feat: release v2.2.0 first'),
      commit('older', 'feat: release v2.1.0'),
    ];
    expect(selectBaseline(commits, '2.2.0')).toBe('mid');
  });

  it('rejects partial, prerelease, other-version, and body-only matches', () => {
    const rejects = [
      commit('a', 'feat: release v2.2.00'),
      commit('b', 'feat: release v2.2.0-beta'),
      commit('c', 'feat: release v2.2.1'),
      commit('d', 'fix: no release token here', 'feat: release v2.2.0'),
      commit('e', 'feat: unrelease v2.2.0'),
    ];
    expect(() => selectBaseline(rejects, '2.2.0')).toThrow(/no commit matches/);
  });

  it('lets an explicit since override discovery, including when no subject matches', () => {
    expect(selectBaseline([commit('a', 'fix: unrelated')], '2.2.0', 'origin/main')).toBe('origin/main');
  });

  it('fails closed without a baseline and tells the caller to pass --since', () => {
    expect(() => selectBaseline([commit('a', 'fix: unrelated')], '2.2.0')).toThrow(/--since/);
  });

  it('rejects an explicitly supplied unsafe or empty since value', () => {
    expect(() => selectBaseline([], '2.2.0', '')).toThrow(/--since/);
    expect(() => selectBaseline([], '2.2.0', '-HEAD~1')).toThrow(/--since/);
  });

  it('rejects a non-stable current version', () => {
    expect(() => selectBaseline(RELEASED, '2.2.0-beta.1')).toThrow(/stable SemVer/);
  });
});

describe('decideVersion', () => {
  it('infers a minor release from a scoped feat', () => {
    expect(decideVersion('2.2.0', [commit('a', 'feat(cli): add release command')], 'auto')).toEqual({
      current: '2.2.0',
      next: '2.3.0',
      rule: 'feat',
      ignored: 0,
    });
  });

  it('treats subject bang as a major change', () => {
    const decision = decideVersion('2.2.0', [commit('a', 'feat(api)!: replace exports')], 'auto');
    expect(decision.next).toBe('3.0.0');
    expect(decision.rule).toBe('breaking change');
  });

  it('recognizes both breaking footer aliases in the body', () => {
    for (const footer of ['BREAKING CHANGE: old path removed', 'BREAKING-CHANGE: old path removed']) {
      const decision = decideVersion('2.2.0', [commit('a', 'fix: adjust api', footer)], 'auto');
      expect(decision.next).toBe('3.0.0');
      expect(decision.rule).toBe('breaking change');
    }
  });

  it('recognizes a breaking footer with multi-line detail', () => {
    const body = 'Details line one.\nDetails line two.\n\nBREAKING CHANGE: this is the first\ncontinued explanation';
    expect(decideVersion('2.2.0', [commit('a', 'refactor(core): move things', body)], 'auto').next).toBe('3.0.0');
  });

  it('infers patch from fix and perf', () => {
    expect(decideVersion('2.2.0', [commit('a', 'fix(ui): correct label')], 'auto').next).toBe('2.2.1');
    expect(decideVersion('2.2.0', [commit('a', 'perf(ui): faster render')], 'auto').next).toBe('2.2.1');
  });

  it('lets the highest rule win across the full range', () => {
    const commits = [
      commit('a', 'fix: one'),
      commit('b', 'feat: two'),
      commit('c', 'chore: three'),
      commit('d', 'feat!: four'),
    ];
    expect(decideVersion('2.2.0', commits, 'auto')).toMatchObject({ next: '3.0.0', rule: 'breaking change' });
  });

  it('does not infer a release from docs or refactor without feat/fix/perf/breaking', () => {
    expect(() => decideVersion('2.2.0', [commit('a', 'docs(readme): typo')], 'auto')).toThrow(/nothing release-worthy/);
    expect(() => decideVersion('2.2.0', [commit('a', 'refactor: tidy')], 'auto')).toThrow(/nothing release-worthy/);
  });

  it('counts merge and non-conventional commits as ignored', () => {
    const decision = decideVersion(
      '2.2.0',
      [
        commit('a', 'Merge branch main'),
        commit('b', 'plain text subject'),
        commit('c', 'fix: real fix'),
      ],
      'auto',
    );
    expect(decision).toMatchObject({ next: '2.2.1', ignored: 2 });
  });

  it('lets an explicit bump override inference and still reports ignored commits', () => {
    const decision = decideVersion(
      '2.2.0',
      [commit('a', 'docs: notes'), commit('b', 'not conventional')],
      'patch',
    );
    expect(decision).toEqual({ current: '2.2.0', next: '2.2.1', rule: '--bump patch', ignored: 1 });
  });

  it('fails closed for docs-only auto inference', () => {
    expect(() => decideVersion('2.2.0', [commit('a', 'docs: only docs')], 'auto')).toThrow(
      /nothing release-worthy.*--bump/,
    );
  });

  it('rejects malformed, prerelease, and leading-zero current versions', () => {
    for (const current of ['2.2', '02.2.0', '2.2.0-beta', '2.2.0+build', 'v2.2.0', ' 2.2.0']) {
      expect(() => decideVersion(current, [commit('a', 'fix: x')], 'patch')).toThrow(/stable SemVer/);
    }
  });

  it('always produces a strictly increasing next version', () => {
    const decision = decideVersion('2.2.0', [], 'major');
    expect(decision.next).toBe('3.0.0');
    const patch = decideVersion('2.2.0', [], 'patch');
    expect(patch.next).toBe('2.2.1');
  });

  it('normalizes standard conventional types case-insensitively', () => {
    expect(decideVersion('2.2.0', [commit('a', 'FEAT(cli): add command')], 'auto')).toEqual({
      current: '2.2.0',
      next: '2.3.0',
      rule: 'feat',
      ignored: 0,
    });
    expect(
      decideVersion('2.2.0', [commit('a', 'FEAT(cli): add'), commit('b', 'fix: patch')], 'auto').next,
    ).toBe('2.3.0');
    expect(decideVersion('2.2.0', [commit('a', 'FiX(ui): label')], 'auto').next).toBe('2.2.1');
    expect(decideVersion('2.2.0', [commit('a', 'PERF: faster')], 'auto').next).toBe('2.2.1');
    expect(decideVersion('2.2.0', [commit('a', 'fEaT(api)!: replace')], 'auto').next).toBe('3.0.0');
  });

  it('rejects unsafe integer components instead of returning the same version', () => {
    expect(() => decideVersion('2.2.9007199254740992', [], 'patch')).toThrow(/safe integer|stable SemVer/);
    expect(() => decideVersion('2.2.9007199254740991', [], 'patch')).toThrow(/safe integer|stable SemVer/);
    expect(() => decideVersion('9007199254740991.0.0', [], 'major')).toThrow(/safe integer|stable SemVer/);
    expect(() => decideVersion('0.9007199254740991.0', [], 'minor')).toThrow(/safe integer|stable SemVer/);
  });

  it('keeps results valid and strictly increasing at the safe boundary', () => {
    expect(decideVersion('2.2.9007199254740990', [], 'patch').next).toBe('2.2.9007199254740991');
    expect(decideVersion('2.2.0', [], 'patch').next).toBe('2.2.1');
  });
});

describe('prepareChangelog', () => {
  const header = '# Changelog\n\n## [Unreleased]\n\n## [2.2.0] — 2026-01-02\n\n- historical entry\n';

  it('generates deterministic grouped bullets in commit order with scopes', () => {
    const commits = [
      commit('a', 'feat(cli): add release command'),
      commit('b', 'fix(ui): correct label'),
      commit('c', 'refactor(core): tidy internals'),
      commit('d', 'feat: unscoped feature'),
      commit('e', 'perf: faster'),
      commit('f', 'Merge branch main'),
      commit('g', 'not conventional'),
    ];
    const output = prepareChangelog(header, commits, '2.3.0', '2026-11-04');
    expect(output).toBe(prepareChangelog(header, commits, '2.3.0', '2026-11-04'));
    expect(output).toContain(
      [
        '## [Unreleased]',
        '',
        '## [2.3.0] — 2026-11-04',
        '### Added',
        '- add release command (cli)',
        '- unscoped feature',
        '',
        '### Changed',
        '- tidy internals (core)',
        '- faster',
        '',
        '### Fixed',
        '- correct label (ui)',
      ].join('\n'),
    );
    expect(output).not.toContain('Merge branch main');
    expect(output).not.toContain('not conventional');
  });

  it('keeps historical sections byte-for-byte after the dated heading', () => {
    const output = prepareChangelog(header, [commit('a', 'feat: new')], '2.3.0', '2026-11-04');
    expect(output.endsWith('\n\n## [2.2.0] — 2026-01-02\n\n- historical entry\n')).toBe(true);
  });

  it('retains manual Unreleased content byte-for-byte without adding generated duplication', () => {
    const manual = '# Changelog\n\n## [Unreleased]\n\n- Manual line one.\n- Manual line two.\n\n## [2.2.0] — 2026-01-02\n\n- old\n';
    const output = prepareChangelog(
      manual,
      [commit('a', 'feat: generated bullet must not appear')],
      '2.3.0',
      '2026-11-04',
    );
    expect(output).toContain('- Manual line one.\n- Manual line two.');
    expect(output).not.toContain('generated bullet must not appear');
    expect(output).toContain('## [Unreleased]\n\n## [2.3.0] — 2026-11-04\n\n- Manual line one.');
  });

  it('fails when Unreleased is missing or duplicated', () => {
    expect(() => prepareChangelog('# Changelog\n', [], '2.3.0', '2026-11-04')).toThrow(/Unreleased/);
    const duplicate = '# Changelog\n\n## [Unreleased]\n\n## [Unreleased]\n';
    expect(() => prepareChangelog(duplicate, [commit('a', 'feat: x')], '2.3.0', '2026-11-04')).toThrow(/Unreleased/);
  });

  it('fails when the target version heading already exists', () => {
    const text = '# Changelog\n\n## [Unreleased]\n\n## [2.3.0] — 2026-01-01\n';
    expect(() => prepareChangelog(text, [commit('a', 'feat: x')], '2.3.0', '2026-11-04')).toThrow(/already exists/);
  });

  it('blocks TODO and TBD placeholders after generation but allows longer words', () => {
    expect(() =>
      prepareChangelog(
        '# Changelog\n\n## [Unreleased]\n\n- TODO: write notes\n\n## [2.2.0] — 2026-01-02\n',
        [],
        '2.3.0',
        '2026-11-04',
      ),
    ).toThrow(/TODO\/TBD/);
    expect(() =>
      prepareChangelog(
        '# Changelog\n\n## [Unreleased]\n\n- TBD\n\n## [2.2.0] — 2026-01-02\n',
        [],
        '2.3.0',
        '2026-11-04',
      ),
    ).toThrow(/TODO\/TBD/);
    const safe = prepareChangelog(
      '# Changelog\n\n## [Unreleased]\n\n- TODOS and TBDs are not whole-word placeholders\n\n## [2.2.0] — 2026-01-02\n',
      [],
      '2.3.0',
      '2026-11-04',
    );
    expect(safe).toContain('TODOS and TBDs');
  });

  it('requires generated content to be non-empty when Unreleased starts empty', () => {
    expect(() =>
      prepareChangelog(header, [commit('a', 'Merge branch main'), commit('b', 'not conventional')], '2.3.0', '2026-11-04'),
    ).toThrow(/non-empty/);
  });

  it('validates the next version and injected date', () => {
    expect(() => prepareChangelog(header, [commit('a', 'feat: x')], '2.3', '2026-11-04')).toThrow(/stable SemVer/);
    expect(() => prepareChangelog(header, [commit('a', 'feat: x')], '2.3.0', '11/04/2026')).toThrow(/date/);
  });

  it('normalizes mixed-case conventional types in generated groups', () => {
    const commits = [
      commit('a', 'FEAT(cli): upper feature'),
      commit('b', 'FiX(ui): mixed fix'),
      commit('c', 'ReFaCtOr(core): mixed change'),
      commit('d', 'FeAt: another feature'),
    ];
    const output = prepareChangelog(header, commits, '2.3.0', '2026-11-04');
    expect(output).toContain('### Added\n- upper feature (cli)\n- another feature');
    expect(output).toContain('### Changed\n- mixed change (core)');
    expect(output).toContain('### Fixed\n- mixed fix (ui)');
  });
});

describe('transformVersions', () => {
  const packageJson = '{\n  "name": "kiki",\n  "version": "2.2.0",\n  "engines": {\n    "node": ">=18.0.0"\n  }\n}\n';
  const lockJson =
    '{\n  "name": "kiki",\n  "version": "2.2.0",\n  "lockfileVersion": 3,\n  "packages": {\n    "": {\n      "name": "kiki",\n      "version": "2.2.0"\n    },\n    "node_modules/dep": {\n      "version": "2.2.0"\n    }\n  }\n}\n';
  const configTs =
    "import { x } from 'y';\n\nexport const KIKI_VERSION = '2.2.0';\n\nexport const OTHER = '2.2.0';\n";

  it('updates all four required version fields', () => {
    const out = transformVersions({ packageJson, lockJson, configTs }, '2.3.0');
    expect(JSON.parse(out.packageJson).version).toBe('2.3.0');
    expect(JSON.parse(out.lockJson).version).toBe('2.3.0');
    expect(JSON.parse(out.lockJson).packages[''].version).toBe('2.3.0');
    expect(out.configTs).toContain("export const KIKI_VERSION = '2.3.0';");
    expect(JSON.parse(out.lockJson).packages['node_modules/dep'].version).toBe('2.2.0');
  });

  it('uses 2-space ordered stringify for package.json and preserves its final newline', () => {
    const out = transformVersions({ packageJson, lockJson, configTs }, '2.3.0');
    expect(out.packageJson.startsWith('{\n  "name": "kiki",\n  "version": "2.3.0",\n')).toBe(true);
    expect(out.packageJson.endsWith('}\n')).toBe(true);
  });

  it('edits the lockfile byte-locally instead of reformatting it', () => {
    const atypical =
      '{\r\n\t"version":   "2.2.0",\r\n\t"packages": {\r\n\t\t"": {\r\n\t\t\t"version"   :"2.2.0",\r\n\t\t\t"dep": { "version": "2.2.0" }\r\n\t\t}\r\n\t}\r\n}\r\n';
    const out = transformVersions(
      { packageJson: '{"name":"kiki","version":"2.2.0"}\n', lockJson: atypical, configTs },
      '2.3.0',
    );
    expect(out.lockJson).toBe(
      '{\r\n\t"version":   "2.3.0",\r\n\t"packages": {\r\n\t\t"": {\r\n\t\t\t"version"   :"2.3.0",\r\n\t\t\t"dep": { "version": "2.2.0" }\r\n\t\t}\r\n\t}\r\n}\r\n',
    );
  });

  it('preserves a lockfile without a final newline', () => {
    const noNewline = lockJson.slice(0, -1);
    const out = transformVersions({ packageJson, lockJson: noNewline, configTs }, '2.3.0');
    expect(out.lockJson.endsWith('}\n}')).toBe(true);
    expect(out.lockJson.endsWith('\n')).toBe(false);
  });

  it('fails on missing required lock fields', () => {
    const noRoot = '{\n  "packages": {\n    "": { "version": "2.2.0" }\n  }\n}\n';
    const noPackage = '{\n  "version": "2.2.0",\n  "packages": {}\n}\n';
    const noPackageVersion = '{\n  "version": "2.2.0",\n  "packages": { "": {} }\n}\n';
    for (const lock of [noRoot, noPackage, noPackageVersion]) {
      expect(() => transformVersions({ packageJson, lockJson: lock, configTs }, '2.3.0')).toThrow(/lockfile/);
    }
  });

  it('rejects duplicate required JSON fields using AST path uniqueness', () => {
    const duplicatePackage = packageJson.replace(
      '  "version": "2.2.0",',
      '  "version": "2.2.0",\n  "version": "2.2.0",',
    );
    const duplicateLockRoot = lockJson.replace(
      '  "version": "2.2.0",\n  "lockfileVersion"',
      '  "version": "2.2.0",\n  "version": "2.2.0",\n  "lockfileVersion"',
    );
    const duplicatePackages = lockJson.replace(
      '  "packages": {',
      '  "packages": {},\n  "packages": {',
    );
    const duplicateEmptyPackage = lockJson.replace(
      '    "": {',
      '    "": {},\n    "": {',
    );
    const duplicateRootPackageVersion = lockJson.replace(
      '      "name": "kiki",\n      "version": "2.2.0"',
      '      "name": "kiki",\n      "version": "2.2.0",\n      "version": "2.2.0"',
    );

    expect(() =>
      transformVersions({ packageJson: duplicatePackage, lockJson, configTs }, '2.3.0'),
    ).toThrow(/package\.json version is duplicated/);
    expect(() =>
      transformVersions({ packageJson, lockJson: duplicateLockRoot, configTs }, '2.3.0'),
    ).toThrow(/lockfile root version is duplicated/);
    expect(() =>
      transformVersions({ packageJson, lockJson: duplicatePackages, configTs }, '2.3.0'),
    ).toThrow(/lockfile packages is duplicated/);
    expect(() =>
      transformVersions({ packageJson, lockJson: duplicateEmptyPackage, configTs }, '2.3.0'),
    ).toThrow(/lockfile packages\[""\] is duplicated/);
    expect(() =>
      transformVersions({ packageJson, lockJson: duplicateRootPackageVersion, configTs }, '2.3.0'),
    ).toThrow(/lockfile packages\[""\] version is duplicated/);
  });

  it('does not reject or reformat unrelated nested duplicate keys', () => {
    const nestedDuplicates = lockJson.replace(
      '    "node_modules/dep": {\n      "version": "2.2.0"\n    }',
      '    "node_modules/dep": {\n      "version": "2.2.0",\n      "version": "2.2.1",\n      "dup": 1,\n      "dup": 2\n    }',
    );
    const out = transformVersions({ packageJson, lockJson: nestedDuplicates, configTs }, '2.3.0');
    expect(out.lockJson.match(/"version": "2\.2\.1"/g)?.length).toBe(1);
    expect(out.lockJson.match(/"dup"/g)?.length).toBe(2);
  });

  it('fails on a missing package version or malformed JSON', () => {
    expect(() =>
      transformVersions({ packageJson: '{"name":"kiki"}\n', lockJson, configTs }, '2.3.0'),
    ).toThrow(/package.json/);
    expect(() => transformVersions({ packageJson: '{', lockJson, configTs }, '2.3.0')).toThrow(/package.json/);
    expect(() => transformVersions({ packageJson, lockJson: '{', configTs }, '2.3.0')).toThrow(/lockfile/);
  });

  it('requires exactly one anchored KIKI_VERSION line', () => {
    expect(() =>
      transformVersions({ packageJson, lockJson, configTs: "export const KIKI_VERSION = '2.2.0';\n" }, '2.3.0'),
    ).not.toThrow();
    expect(() =>
      transformVersions({ packageJson, lockJson, configTs: 'export const OTHER = 1;\n' }, '2.3.0'),
    ).toThrow(/KIKI_VERSION/);
    expect(() =>
      transformVersions(
        { packageJson, lockJson, configTs: "export const KIKI_VERSION = '2.2.0';\nexport const KIKI_VERSION = '2.2.0';\n" },
        '2.3.0',
      ),
    ).toThrow(/exactly one/);
    expect(() =>
      transformVersions({ packageJson, lockJson, configTs: "  export const KIKI_VERSION = '2.2.0';\n" }, '2.3.0'),
    ).toThrow(/KIKI_VERSION/);
  });

  it('fails on inconsistent current version sources', () => {
    const mismatchedLock = lockJson.replace('"version": "2.2.0"', '"version": "2.2.1"');
    expect(() => transformVersions({ packageJson, lockJson: mismatchedLock, configTs }, '2.3.0')).toThrow(
      /do not match/,
    );
  });

  it('rejects a non-stable next version', () => {
    for (const next of ['2.3', '2.3.0-beta', 'v2.3.0', '02.3.0', '2.2.9007199254740992']) {
      expect(() => transformVersions({ packageJson, lockJson, configTs }, next)).toThrow(/stable SemVer/);
    }
  });

  it('rejects unsafe integer components in current sources', () => {
    const unsafe = '2.2.9007199254740992';
    const unsafePackage = packageJson.replace('"version": "2.2.0"', `"version": "${unsafe}"`);
    const unsafeLock = lockJson.replaceAll('"version": "2.2.0"', `"version": "${unsafe}"`);
    const unsafeConfig = configTs.replace("'2.2.0'", `'${unsafe}'`);
    expect(() =>
      transformVersions({ packageJson: unsafePackage, lockJson: unsafeLock, configTs: unsafeConfig }, '2.3.0'),
    ).toThrow(/safe integer|stable SemVer/);
  });
});
