import { accessSync, constants, existsSync, statSync } from 'fs';
import { dirname } from 'path';
import { homedir } from 'os';
import { Plugin } from '@opencode/plugin/tui';
import {
  listAgentModels, readOpenCodeSettings, removeAgentModel, removeAllProjectModels, setAgentModel,
  type ModelContext,
} from '../cli/opencode-config.js';
import { assertOC2Target, canonicalPath, pathsOverlap, resolveOC2Roots } from '../cli/oc2-paths.js';
import { registerKikiMenu, type ModelSettings } from './model-menu.js';

/** The host has not supplied a V2 location yet; the menu delays instead of writing. */
export class LocationNotReadyError extends Error {
  constructor() {
    super('OpenCode location is not available yet.');
    this.name = 'LocationNotReadyError';
  }
}

export const SETUP_ERROR_MESSAGE = 'Kiki konnte nicht gestartet werden: OpenCode-2-Konfiguration ist überlappend, ungültig oder nicht beschreibbar. Konfiguration und Zugriffsrechte prüfen.';

/**
 * A target is writable when it is a directory (or does not exist yet and its
 * nearest existing ancestor is a writable directory). This mirrors the atomic
 * write path without creating, reading or truncating the user's file.
 */
function assertWritableDirectory(target: string): void {
  let existing = target;
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  if (!statSync(existing).isDirectory()) throw new Error('Invalid OpenCode configuration path.');
  accessSync(existing, constants.W_OK);
  if (existsSync(target) && !statSync(target).isDirectory()) {
    throw new Error('Invalid OpenCode configuration path.');
  }
}

/**
 * Build the ModelContext used by the shared Task 3 model functions. The global
 * config comes from the same isolated XDG/OPENCODE_CONFIG_DIR resolution as the
 * CLI; the project comes from the verified V2 host location. Config files are
 * parsed through the shared readers (never auth/.env or arbitrary files) and
 * every guard fails before the menu can write.
 */
export function buildModelContext(
  ctx: Plugin.Context,
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): ModelContext {
  const roots = resolveOC2Roots(env, home);
  assertOC2Target(roots, home);

  const globalConfigDirectory = canonicalPath(roots.config);
  assertWritableDirectory(globalConfigDirectory);
  readOpenCodeSettings(globalConfigDirectory, true);

  const location = ctx.location;
  if (!location || typeof location.directory !== 'string' || !location.directory.trim()) {
    throw new LocationNotReadyError();
  }

  const projectDirectory = canonicalPath(location.directory);
  if (!existsSync(projectDirectory) || !statSync(projectDirectory).isDirectory()) {
    throw new Error('Invalid OpenCode project location.');
  }
  if (pathsOverlap(globalConfigDirectory, projectDirectory)) {
    throw new Error('Refusing to modify overlapping OpenCode configuration directories.');
  }
  readOpenCodeSettings(projectDirectory);

  return { globalConfigDirectory, projectDirectory };
}

/**
 * V2 TUI setup: fail closed on bad roots, otherwise register the existing
 * native menu against the shared model operations. A not-yet-available
 * location is safe to delay: the menu refuses to open any write flow until the
 * host reports both location and model/provider collections.
 */
export function setup(
  ctx: Plugin.Context,
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): Plugin.Cleanup | undefined {
  let current: ModelContext | undefined;
  try {
    current = buildModelContext(ctx, env, home);
  } catch (error) {
    if (!(error instanceof LocationNotReadyError)) {
      // Never print a path, config value, parser detail or stack trace.
      ctx.ui.toast.show({ variant: 'error', message: SETUP_ERROR_MESSAGE });
      return undefined;
    }
  }

  const modelContext = (): ModelContext => {
    current ??= buildModelContext(ctx, env, home);
    return current;
  };
  const settings: ModelSettings = {
    list: scope => listAgentModels(scope, modelContext()),
    save: (scope, agent, model, availableModels) =>
      Promise.resolve(setAgentModel(scope, agent, model, availableModels, modelContext())),
    remove: (scope, agent) => Promise.resolve(removeAgentModel(scope, agent, modelContext())),
    removeAllProject: () => Promise.resolve(removeAllProjectModels(modelContext())),
  };

  return registerKikiMenu(ctx, settings);
}

const plugin: Plugin.Definition = Plugin.define({ id: 'kiki', setup });

export default plugin;
