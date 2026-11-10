/** Kept as a read-only compatibility notice for existing scripts. */
export async function routing(_args: string[] = []): Promise<number> {
  console.log('kiki routing is retired. Configure agents.<id>.model in global or project opencode.json/opencode.jsonc. Use kiki migrate --project <path> to import legacy routing.json.');
  return 0;
}
