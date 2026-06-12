import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { scaffold } from '../src/scaffold.js';
import { checkScaffolding, readTaskRegistry, auditContent } from '../src/lib.js';

describe('lib', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kiki-lib-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('checkScaffolding returns true after scaffold', async () => {
    await scaffold(tmpDir);
    const result = await checkScaffolding(tmpDir);
    expect(result).toBe(true);
  });

  it('checkScaffolding returns false for empty dir', async () => {
    const result = await checkScaffolding(tmpDir);
    expect(result).toBe(false);
  });

  it('readTaskRegistry returns parsed registry', async () => {
    await scaffold(tmpDir);
    const registry = await readTaskRegistry(tmpDir);
    expect(registry).not.toBeNull();
    expect(registry!.version).toBe('1.0.0');
    expect(registry!.tasks).toEqual([]);
  });

  it('readTaskRegistry returns null when missing', async () => {
    const registry = await readTaskRegistry(tmpDir);
    expect(registry).toBeNull();
  });

  it('auditContent detects TODO', () => {
    const content = '# Hello\nTODO: fix this\n';
    const result = auditContent(content);
    expect(result.length).toBe(1);
    expect(result[0]).toContain('TODO');
  });

  it('auditContent detects TBD', () => {
    const content = '# Plan\nTBD: finalize approach\n';
    const result = auditContent(content);
    expect(result.length).toBe(1);
    expect(result[0]).toContain('TBD');
  });

  it('auditContent detects placeholder', () => {
    const content = '# Spec\n[insert details here]\n';
    const result = auditContent(content);
    expect(result.length).toBe(1);
    expect(result[0]).toContain('[insert');
  });

  it('auditContent returns empty for clean text', () => {
    const content = '# Hello\nAll done.\n';
    const result = auditContent(content);
    expect(result).toEqual([]);
  });
});
