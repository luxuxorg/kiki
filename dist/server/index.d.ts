import { Plugin } from '@opencode/plugin';
import { type KikiHealthConfig } from '../cli/config.js';
/**
 * Canonical server context derived from the published SDK, as pinned by the
 * Task 2 contract. `Plugin.Context` is the exact context handed to setup.
 */
export type ServerContext = Parameters<typeof Plugin.define>[0]['setup'] extends (ctx: infer C) => unknown ? C : never;
/**
 * Sanitizes a health section exactly like the V1 runtime did: invalid values
 * fall back to the default for that field, never to an unvalidated input.
 */
export declare function sanitizeHealth(raw: unknown): KikiHealthConfig;
/** Loads only the project-scoped health settings; no global or cwd fallback. */
export declare function loadHealthConfig(directory: string): KikiHealthConfig;
export declare function setup(ctx: ServerContext): Promise<Plugin.Cleanup>;
declare const _default: Plugin.Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map