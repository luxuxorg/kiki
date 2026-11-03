import { it, expect, vi } from 'vitest';
import { routing } from '../../src/cli/commands/routing';

it('retires routing without writing agent files', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    expect(await routing([])).toBe(0);
    expect(log.mock.calls.flat().join(' ')).toContain('opencode.json');
    expect(await routing(['--check'])).toBe(0);
  } finally { log.mockRestore(); }
});
