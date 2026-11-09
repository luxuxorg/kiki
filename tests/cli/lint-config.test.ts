import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const configPath = path.join(root, 'eslint.config.mjs');

type LintMessage = {
  ruleId: string | null;
  severity: number;
  message: string;
};

type ESLintLike = {
  lintText: (
    code: string,
    options: { filePath: string },
  ) => Promise<[{ messages: LintMessage[] }]>;
  isPathIgnored: (filePath: string) => Promise<boolean>;
};

async function localEslint(): Promise<ESLintLike> {
  const { ESLint } = await import('eslint');
  return new ESLint({ cwd: root, overrideConfigFile: configPath }) as ESLintLike;
}

async function lint(src: string, filePath = 'src/fixture.ts'): Promise<LintMessage[]> {
  const eslint = await localEslint();
  const [result] = await eslint.lintText(src, {
    filePath: path.join(root, filePath),
  });
  return result.messages;
}

function unusedVarDiagnostics(messages: LintMessage[]): LintMessage[] {
  return messages.filter(
    (message) => message.ruleId === '@typescript-eslint/no-unused-vars',
  );
}

describe('lint foundation contract', () => {
  it('declares the approved direct dev dependencies and exact src-only script', () => {
    const pkg = JSON.parse(
      readFileSync(path.join(root, 'package.json'), 'utf8'),
    ) as {
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
      engines: Record<string, string>;
    };

    expect(pkg.devDependencies.eslint).toBe('^9.39.4');
    expect(pkg.devDependencies['typescript-eslint']).toBe('^8.62.0');
    expect(pkg.scripts.lint).toBe('eslint "src/**/*.ts"');
    expect(pkg.scripts.lint).not.toContain('tests/');
    expect(pkg.engines.node).toBe('>=18.0.0');
  });

  it('keeps the config flat, ESM, source-scoped and non-type-aware', () => {
    const source = readFileSync(configPath, 'utf8');

    expect(source).toContain('typescript-eslint');
    expect(source).toContain('configs.recommended');
    expect(source).toContain("files: ['src/**/*.ts']");
    expect(source).toContain("'@typescript-eslint/no-explicit-any': 'off'");
    expect(source).toContain("'@typescript-eslint/no-unused-vars': [");
    expect(source).toContain("args: 'all'");
    expect(source).toContain("caughtErrors: 'all'");
    expect(source).toContain("argsIgnorePattern: '^_'");
    expect(source).toContain("caughtErrorsIgnorePattern: '^_'");
    expect(source).toContain("varsIgnorePattern: '^_'");
    expect(source).not.toMatch(/recommendedTypeChecked|strictTypeChecked/);
    expect(source).not.toMatch(/\bproject(?:Service)?\s*:/);
  });

  it('ignores generated, dependency, worktree, temp, coverage and agentic paths', async () => {
    const eslint = await localEslint();

    for (const ignored of [
      'dist/fixture.ts',
      'node_modules/fixture.ts',
      '.worktree/fixture.ts',
      '.worktrees/fixture.ts',
      'tmp/fixture.ts',
      'coverage/fixture.ts',
      '.agentic/fixture.ts',
    ]) {
      await expect(eslint.isPathIgnored(path.join(root, ignored))).resolves.toBe(
        true,
      );
    }

    await expect(
      eslint.isPathIgnored(path.join(root, 'src', 'fixture.ts')),
    ).resolves.toBe(false);
  });

  it('does not apply recommended rules outside src', async () => {
    const messages = await lint(
      'const anything: any = 1;\nconst unusedValue = 1;\n',
      'tests/other.ts',
    );

    expect(messages.filter((message) => message.ruleId !== null)).toEqual([]);
  });

  it('still applies recommended rules inside src', async () => {
    const messages = await lint('export namespace Namespace {}\n');

    expect(
      messages.some(
        (message) => message.ruleId === '@typescript-eslint/no-namespace',
      ),
    ).toBe(true);
  });

  it('permits explicit any', async () => {
    const messages = await lint(
      'export const anything: any = 1;\nexport function identity(value: any): any { return value; }\n',
    );

    expect(
      messages.filter(
        (message) => message.ruleId === '@typescript-eslint/no-explicit-any',
      ),
    ).toEqual([]);
  });

  it('rejects ordinary unused vars and accepts _-prefixed vars at error severity', async () => {
    const rejected = unusedVarDiagnostics(
      await lint('const ordinaryValue = 1;\n'),
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.severity).toBe(2);

    const accepted = unusedVarDiagnostics(
      await lint('const _ignoredValue = 1;\n'),
    );
    expect(accepted).toEqual([]);
  });

  it('checks every unused argument and accepts _-prefixed arguments', async () => {
    const rejected = unusedVarDiagnostics(
      await lint(
        'export function withUnused(ordinaryArg: string) { return 1; }\n',
      ),
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.severity).toBe(2);

    const accepted = unusedVarDiagnostics(
      await lint(
        'export function withIgnored(_ignoredArg: string) { return 1; }\n',
      ),
    );
    expect(accepted).toEqual([]);
  });

  it('checks every caught error and accepts _-prefixed caught errors', async () => {
    const rejected = unusedVarDiagnostics(
      await lint(
        'export function catchesError() { try { throw new Error("x"); } catch (ordinaryError) { return 1; } }\n',
      ),
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.severity).toBe(2);

    const accepted = unusedVarDiagnostics(
      await lint(
        'export function catchesIgnored() { try { throw new Error("x"); } catch (_ignoredError) { return 1; } }\n',
      ),
    );
    expect(accepted).toEqual([]);
  });
});
