import { Plugin } from '@opencode/plugin/tui';
import { type ModelContext } from '../cli/opencode-config.js';
/** The host has not supplied a V2 location yet; the menu delays instead of writing. */
export declare class LocationNotReadyError extends Error {
    constructor();
}
export declare const SETUP_ERROR_MESSAGE = "Kiki konnte nicht gestartet werden: OpenCode-2-Konfiguration ist \u00FCberlappend, ung\u00FCltig oder nicht beschreibbar. Konfiguration und Zugriffsrechte pr\u00FCfen.";
/**
 * Build the ModelContext used by the shared Task 3 model functions. The global
 * config comes from the same XDG/OPENCODE_CONFIG_DIR resolution as the CLI; the
 * project comes from the verified V2 host location. Config files are parsed
 * through the shared readers (never auth/.env or arbitrary files) and every
 * guard fails before the menu can write.
 */
export declare function buildModelContext(ctx: Plugin.Context, env?: NodeJS.ProcessEnv, home?: string): ModelContext;
/**
 * V2 TUI setup: fail closed on bad roots, otherwise register the existing
 * native menu against the shared model operations. A not-yet-available
 * location is safe to delay: the menu refuses to open any write flow until the
 * host reports both location and model/provider collections.
 */
export declare function setup(ctx: Plugin.Context, env?: NodeJS.ProcessEnv, home?: string): Plugin.Cleanup | undefined;
declare const plugin: Plugin.Definition;
export default plugin;
//# sourceMappingURL=index.d.ts.map