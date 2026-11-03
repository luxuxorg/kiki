import { parseScope } from '../args.js';
import { installGlobalFiles } from '../opencode-config.js';

export async function update(args: string[] | string = []): Promise<void> {
  const { help } = parseScope(typeof args === 'string' ? [args] : args, 'update', false);
  if (help) { console.log('Usage: kiki update [--global] — update the global installation; projects are untouched.'); return; }
  installGlobalFiles(undefined, true);
}
