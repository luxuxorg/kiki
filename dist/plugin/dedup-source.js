/**
 * Plain-JS/TS source of the plugin deduplication logic, inlined verbatim
 * into the generated .opencode/plugins/kiki.ts. Must stay free of backticks
 * and ${ sequences (the outer template literal in config.ts would break).
 * The outer scope provides: appendFileSync, existsSync, mkdirSync, join,
 * dirname (imported by the plugin template from fs/path), and the module-
 * level constants KIKI_PLUGIN_VERSION and KIKI_PLUGIN_SCOPE (declared in the
 * template before this string is interpolated).
 */
export const DEDUP_SOURCE = `
interface OwnershipRecord {
  root: string;
  scope: 'global' | 'project';
  version: string;
  startedAt: number;
}

const KIKI_OWNERSHIP_KEY = Symbol.for('kiki.plugin');

function acquireOwnership(root: string): OwnershipRecord | null {
  var registry: any = null;
  try {
    registry = (globalThis as any)[KIKI_OWNERSHIP_KEY];
  } catch (e) {
    registry = null;
  }
  if (!registry || typeof registry !== 'object') registry = {};
  if (registry[root]) return null;
  var record: OwnershipRecord = {
    root: root,
    scope: KIKI_PLUGIN_SCOPE,
    version: KIKI_PLUGIN_VERSION,
    startedAt: Date.now()
  };
  registry[root] = record;
  (globalThis as any)[KIKI_OWNERSHIP_KEY] = registry;
  return record;
}

function getOwner(root: string): OwnershipRecord | undefined {
  var registry: any = null;
  try {
    registry = (globalThis as any)[KIKI_OWNERSHIP_KEY];
  } catch (e) {
    return undefined;
  }
  if (!registry || typeof registry !== 'object') return undefined;
  return registry[root];
}

function reportVersionMismatch(root: string, owner: OwnershipRecord, client: any, directory: string): void {
  var message = 'kiki plugin-dedup-version-mismatch: owner scope=' + owner.scope + ' version=' + owner.version + ' this scope=' + KIKI_PLUGIN_SCOPE + ' version=' + KIKI_PLUGIN_VERSION + ' at ' + root + ' - run \\'kiki install --force\\' and/or \\'kiki update <project>\\' to realign.';
  try {
    console.warn(message);
  } catch (e) { /* ignore */ }
  try {
    var logPath = join(directory, '.agentic', 'kiki', 'health_log.jsonl');
    var dir = dirname(logPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(logPath, JSON.stringify({
      level: 'warn',
      timestamp: new Date().toISOString(),
      event: 'plugin-dedup-version-mismatch',
      root: root,
      ownerScope: owner.scope,
      ownerVersion: owner.version,
      thisScope: KIKI_PLUGIN_SCOPE,
      thisVersion: KIKI_PLUGIN_VERSION
    }) + '\\n');
  } catch (e) { /* best effort */ }
  try {
    if (client && client.app && client.app.log) {
      client.app.log({ body: { service: 'kiki-plugin', level: 'warn', message: 'plugin-dedup-version-mismatch', extra: { root: root, ownerScope: owner.scope, ownerVersion: owner.version, thisScope: KIKI_PLUGIN_SCOPE, thisVersion: KIKI_PLUGIN_VERSION } } });
    }
  } catch (e2) { /* best effort */ }
}
`;
//# sourceMappingURL=dedup-source.js.map