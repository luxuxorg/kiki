import { afterEach, beforeEach, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
let fixture: string;

beforeEach(() => {
  mkdirSync(join(root, 'tmp'), { recursive: true });
  fixture = mkdtempSync(join(root, 'tmp', 'kiki-test-discovery-'));
});

afterEach(() => {
  rmSync(fixture, { recursive: true, force: true });
});

it('discovers tests only in tests/, not in sibling worktrees or source directories', () => {
  for (const file of [
    'tests/main.test.ts',
    'tests/nested/other.spec.ts',
    '.worktrees/sample/tests/copied.test.ts',
    '.worktree/sample/tests/copied.test.ts',
    'worktrees/sample/tests/copied.test.ts',
    'src/unexpected.test.ts',
  ]) {
    const target = join(fixture, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, 'throw new Error("File discovery must not execute tests");\n');
  }
  const config = join(root, 'vitest.config.ts');
  if (existsSync(config)) copyFileSync(config, join(fixture, 'vitest.config.ts'));

  const output = execFileSync(process.execPath, [
    join(root, 'node_modules', 'vitest', 'vitest.mjs'),
    'list', '--filesOnly', '--json', '--root', fixture,
  ], { cwd: fixture, encoding: 'utf8', timeout: 30_000 });
  const files = JSON.parse(output) as Array<{ file: string }>;

  expect(files.map(entry => relative(fixture, entry.file).split(sep).join('/')).sort())
    .toEqual(['tests/main.test.ts', 'tests/nested/other.spec.ts']);
}, 40_000);
