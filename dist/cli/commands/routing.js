/** Kept as a read-only compatibility notice for existing scripts. */
export async function routing(_args = []) {
    console.log('kiki routing is retired. Configure agent.<name>.model in global or project opencode.json/opencode.jsonc. Use kiki migrate --project <path> to import legacy routing.json.');
    return 0;
}
//# sourceMappingURL=routing.js.map