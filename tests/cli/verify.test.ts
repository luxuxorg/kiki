import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { verify } from '../../src/cli/commands/verify';

describe('cli verify', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = `tmp/cli-verify-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('exits with error when no file path provided', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(verify(undefined)).rejects.toThrow('process.exit(1)');
    expect(errorSpy).toHaveBeenCalledWith('Usage: kiki verify <file>');

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('exits with error when file does not exist', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(verify(path.join(tmpDir, 'nonexistent.txt'))).rejects.toThrow('process.exit(1)');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('File not found'));

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('reports no placeholders for clean file', async () => {
    const filePath = path.join(tmpDir, 'clean.txt');
    await fs.writeFile(filePath, 'This is a clean file with no issues.\nEverything looks good.');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await verify(filePath);

    expect(logSpy).toHaveBeenCalledWith('No placeholders found.');

    logSpy.mockRestore();
  });

  it('finds and reports TODO placeholders', async () => {
    const filePath = path.join(tmpDir, 'with-todo.txt');
    await fs.writeFile(filePath, 'Some code here.\nTODO: implement this feature\nMore code.');

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(verify(filePath)).rejects.toThrow('process.exit(1)');

    const logs = logSpy.mock.calls.map(c => c[0]).join('\n');
    expect(logs).toContain('TODO');
    expect(logs).toContain('Line 2:');
    expect(logs).toContain('Found 1 placeholder(s). Fix before proceeding.');

    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('finds and reports TBD placeholders', async () => {
    const filePath = path.join(tmpDir, 'with-tbd.txt');
    await fs.writeFile(filePath, 'Design doc.\nThis section is TBD.\nEnd.');

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(verify(filePath)).rejects.toThrow('process.exit(1)');

    const logs = logSpy.mock.calls.map(c => c[0]).join('\n');
    expect(logs).toContain('TBD');

    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('finds multiple different placeholders', async () => {
    const filePath = path.join(tmpDir, 'mixed.txt');
    await fs.writeFile(filePath, 'TODO: fix this\nTBD: decide later\nFIXME: broken code\nMore text.\nFill in details here.\nHandle edge cases properly.');

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(verify(filePath)).rejects.toThrow('process.exit(1)');

    const logs = logSpy.mock.calls.map(c => c[0]).join('\n');
    expect(logs).toContain('TODO');
    expect(logs).toContain('TBD');
    expect(logs).toContain('FIXME');
    expect(logs).toContain('fill in details');
    expect(logs).toContain('handle edge cases');

    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('is case-insensitive for placeholders', async () => {
    const filePath = path.join(tmpDir, 'case.txt');
    await fs.writeFile(filePath, 'todo: lowercase\nTBD: uppercase\nTodo: mixed case');

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(verify(filePath)).rejects.toThrow('process.exit(1)');

    const logs = logSpy.mock.calls.map(c => c[0]).join('\n');
    expect(logs).toContain('todo');

    exitSpy.mockRestore();
    logSpy.mockRestore();
  });
});
