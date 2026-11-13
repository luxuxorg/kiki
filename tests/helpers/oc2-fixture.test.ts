import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { observedOC2Version, requireOC2Binary } from './oc2-fixture';

const originalBinary = process.env.OPENCODE_TEST_BINARY;
const roots: string[] = [];

function stubBinary(output: string): string {
  const root = mkdtempSync(join(tmpdir(), 'kiki-oc2-gate-'));
  roots.push(root);
  const binary = join(root, 'opencode');
  writeFileSync(binary, `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(output)});\n`);
  chmodSync(binary, 0o755);
  process.env.OPENCODE_TEST_BINARY = binary;
  return binary;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  if (originalBinary === undefined) delete process.env.OPENCODE_TEST_BINARY;
  else process.env.OPENCODE_TEST_BINARY = originalBinary;
});

describe('OpenCode test-binary version gate', () => {
  it('accepts an available OpenCode 2 binary instead of requiring 2.2.6', () => {
    const binary = stubBinary('opencode v2.2.7\n');
    expect(requireOC2Binary()).toBe(binary);
  });

  it('records the exact OpenCode version it accepted', () => {
    const binary = stubBinary('opencode v2.2.7\n');
    requireOC2Binary();
    expect(observedOC2Version(binary)).toBe('2.2.7');
  });

  it('rejects an OpenCode 1 binary', () => {
    stubBinary('opencode v1.18.35\n');
    expect(() => requireOC2Binary()).toThrow(/OpenCode 2|2\.x/i);
  });

  it('rejects malformed version output', () => {
    stubBinary('opencode v2.2\n');
    expect(() => requireOC2Binary()).toThrow(/version/i);
  });

  it('rejects a future major version instead of silently accepting it', () => {
    stubBinary('opencode v3.0.0\n');
    expect(() => requireOC2Binary()).toThrow(/OpenCode 2|2\.x/i);
  });

  it('requires an absolute OPENCODE_TEST_BINARY path', () => {
    process.env.OPENCODE_TEST_BINARY = 'opencode';
    expect(() => requireOC2Binary()).toThrow(/absolute/i);
  });

  it('requires OPENCODE_TEST_BINARY to be set', () => {
    delete process.env.OPENCODE_TEST_BINARY;
    expect(() => requireOC2Binary()).toThrow(/OPENCODE_TEST_BINARY/);
  });
});
