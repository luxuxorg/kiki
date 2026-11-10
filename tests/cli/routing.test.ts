import { it, expect, vi } from 'vitest';
import { routing } from '../../src/cli/commands/routing';

it('retires routing with the native agents.<id>.model destination and never writes files', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    expect(await routing([])).toBe(0);
    expect(log.mock.calls.flat().join(' ')).toContain('agents.<id>.model');
    expect(log.mock.calls.flat().join(' ')).not.toContain('agent.<name>.model');
    expect(await routing(['--check'])).toBe(0);
  } finally { log.mockRestore(); }
});
