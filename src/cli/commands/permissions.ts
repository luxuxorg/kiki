import { readSettings, globalDirectory, AGENT_NAMES, type PermissionRule } from '../opencode-config.js';
import {
  applyProjectPermissions,
  inheritedPermissionRules,
  inspectPermissions,
  planPermissionAdd,
  planPermissionRemoval,
  protectProjectSurvivors,
  selectProjectTarget,
  type PermissionContext,
} from '../permission-requests.js';
import { discoverConfigTiers } from '../opencode-config.js';
import { duplicateAgentConfigKeys } from '../opencode-config.js';

type Subcommand = 'list' | 'check' | 'add' | 'remove';

interface Parsed {
  subcommand: Subcommand;
  project: string;
  agent?: string;
  file?: string;
  action?: string;
  resource?: string;
  effect?: PermissionRule['effect'];
  entry?: number;
  apply: boolean;
  help: boolean;
}

const USAGE = `Usage: kiki permissions <list|check|add|remove> [options]

  permissions list [--project <dir>] [--agent <name>]
  permissions check [--project <dir>] [--agent <name>]
  permissions add <literal-resource> --agent <name> --action read|edit [--project <dir>] [--file <project-config-path>] --apply
  permissions remove --agent <name> --entry <index> --action <action> --resource <literal-resource> --effect allow|ask|deny [--project <dir>] [--file <project-config-path>] --apply

list/check are metadata-only and never write. add/remove preview without --apply.
The CLI edits only project configuration; global policy and markdown are never changed.
The native permission ask is the human approval; the CLI validates shape only.`;

export function parsePermissionsArgs(args: string[]): Parsed {
  const subcommand = args[0] as Subcommand | undefined;
  if (!subcommand || !['list', 'check', 'add', 'remove'].includes(subcommand)) {
    throw new Error('permissions: unknown or missing subcommand.');
  }
  if (args.includes('--help') || args.includes('-h')) {
    return { subcommand, project: process.cwd(), apply: false, help: true };
  }
  let project = process.cwd();
  let agent: string | undefined;
  let file: string | undefined;
  let action: string | undefined;
  let resource: string | undefined;
  let effect: PermissionRule['effect'] | undefined;
  let entry: number | undefined;
  let apply = false;
  const seen = new Set<string>();
  const flag = (name: string): void => {
    if (seen.has(name)) throw new Error(`permissions: duplicate ${name}.`);
    seen.add(name);
  };
  const value = (index: number, name: string): string => {
    const next = args[index];
    if (!next || next.startsWith('-')) throw new Error(`permissions: ${name} requires one value.`);
    return next;
  };
  for (let index = 1; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--project') {
      flag(arg);
      project = value(++index, arg);
    } else if (arg === '--file') {
      if (subcommand === 'list' || subcommand === 'check') throw new Error('permissions: --file is not supported here.');
      flag(arg);
      file = value(++index, arg);
    } else if (arg === '--agent') {
      flag(arg);
      agent = value(++index, arg);
    } else if (arg === '--action') {
      if (subcommand === 'list' || subcommand === 'check') throw new Error('permissions: --action is not supported here.');
      flag(arg);
      const next = value(++index, arg);
      if (subcommand === 'add' && next !== 'read' && next !== 'edit') {
        throw new Error('permissions: --action must be read or edit.');
      }
      if (!/^[A-Za-z0-9_*.-]+$/.test(next)) throw new Error('permissions: invalid --action.');
      action = next;
    } else if (arg === '--resource') {
      if (subcommand !== 'remove') throw new Error('permissions: --resource is only valid for remove.');
      flag(arg);
      resource = value(++index, arg);
    } else if (arg === '--effect') {
      if (subcommand !== 'remove') throw new Error('permissions: --effect is only valid for remove.');
      flag(arg);
      const next = value(++index, arg);
      if (next !== 'allow' && next !== 'ask' && next !== 'deny') {
        throw new Error('permissions: --effect must be allow, ask or deny.');
      }
      effect = next;
    } else if (arg === '--entry') {
      if (subcommand !== 'remove') throw new Error('permissions: --entry is only valid for remove.');
      flag(arg);
      const next = value(++index, arg);
      if (!/^\d+$/.test(next)) throw new Error('permissions: --entry must be a zero-based integer.');
      entry = Number(next);
    } else if (arg === '--apply') {
      if (subcommand === 'list' || subcommand === 'check') throw new Error('permissions: --apply is not supported here.');
      flag(arg);
      apply = true;
    } else if (arg === '--help' || arg === '-h') {
      continue;
    } else if (arg.startsWith('-')) {
      throw new Error(`permissions: unsupported option '${arg}'.`);
    } else {
      if (subcommand !== 'add') throw new Error(`permissions: unexpected argument '${arg}'.`);
      if (resource !== undefined) throw new Error('permissions: add accepts exactly one literal resource.');
      resource = arg;
    }
  }

  if (agent !== undefined && !AGENT_NAMES.includes(agent)) throw new Error('permissions: unknown Kiki agent.');
  if (subcommand === 'add') {
    if (!resource) throw new Error('permissions: add requires one literal resource.');
    if (!agent) throw new Error('permissions: add requires --agent.');
    if (!action) throw new Error('permissions: add requires --action read|edit.');
    if (action !== 'read' && action !== 'edit') throw new Error('permissions: --action must be read or edit.');
  }
  if (subcommand === 'remove') {
    if (!agent) throw new Error('permissions: remove requires --agent.');
    if (entry === undefined) throw new Error('permissions: remove requires --entry.');
    if (!action) throw new Error('permissions: remove requires --action.');
    if (!resource) throw new Error('permissions: remove requires --resource.');
    if (!effect) throw new Error('permissions: remove requires --effect.');
  }
  return {
    subcommand, project, apply, help: false,
    ...(agent !== undefined ? { agent } : {}),
    ...(file !== undefined ? { file } : {}),
    ...(action !== undefined ? { action } : {}),
    ...(resource !== undefined ? { resource } : {}),
    ...(effect !== undefined ? { effect } : {}),
    ...(entry !== undefined ? { entry } : {}),
  };
}

function contextFor(parsed: Parsed): PermissionContext {
  return {
    projectDirectory: parsed.project,
    globalConfigDirectory: globalDirectory(),
  };
}

function printRows(parsed: Parsed): number {
  const rows = inspectPermissions(contextFor(parsed))
    .filter(row => parsed.agent === undefined || row.agent === parsed.agent);
  for (const row of rows) {
    console.log(`${row.scope}\t${row.file}\t${row.agent}\t${row.index}\t${row.rule.action}\t${row.rule.resource}\t${row.rule.effect}`);
  }
  return 0;
}

function checkProject(parsed: Parsed): number {
  const context = contextFor(parsed);
  let conflicts = 0;
  for (const tier of discoverConfigTiers(context.projectDirectory, context.globalConfigDirectory)) {
    if (tier.scope !== 'project') continue;
    const duplicates = duplicateAgentConfigKeys(tier.file);
    if (duplicates.length) {
      console.error(`conflict\t${tier.file}\tduplicate agent keys: ${duplicates.join(', ')}`);
      conflicts += duplicates.length;
    }
    const settings = readSettings(tier.file);
    for (const agent of AGENT_NAMES) {
      if (parsed.agent !== undefined && parsed.agent !== agent) continue;
      const local = settings.agents?.[agent]?.permissions;
      if (!Array.isArray(local)) continue;
      const result = protectProjectSurvivors(local as PermissionRule[], inheritedPermissionRules(context, agent));
      if (result.ok) continue;
      conflicts += 1;
      console.error(`conflict\t${tier.file}\t${agent}\t${result.reason}`);
    }
  }
  return conflicts ? 1 : 0;
}

function add(parsed: Parsed): number {
  const context = contextFor(parsed);
  const target = selectProjectTarget(context, parsed.file);
  const settings = readSettings(target.file);
  const local = (settings.agents?.[parsed.agent!]?.permissions ?? []) as PermissionRule[];
  const inherited = inheritedPermissionRules(context, parsed.agent!);
  const grant: PermissionRule = {
    action: parsed.action!, resource: parsed.resource!, effect: 'allow',
  };
  const plan = planPermissionAdd(local, inherited, grant);
  if (!plan.ok) {
    console.error(`Refused: ${plan.reason}`);
    return 1;
  }
  console.log(`proposal\t${target.file}\t${parsed.agent}\t${grant.action}\t${grant.resource}\t${grant.effect}`);
  if (!parsed.apply) {
    console.log('Preview only; rerun with --apply to write.');
    return 0;
  }
  const result = applyProjectPermissions(context, target.file, parsed.agent!, target.expected, plan.rules);
  console.log(`${result.changed ? 'updated' : 'unchanged'}\t${result.file}`);
  return 0;
}

function remove(parsed: Parsed): number {
  const context = contextFor(parsed);
  const target = selectProjectTarget(context, parsed.file);
  const settings = readSettings(target.file);
  const local = (settings.agents?.[parsed.agent!]?.permissions ?? []) as PermissionRule[];
  const inherited = inheritedPermissionRules(context, parsed.agent!);
  const expectedRule: PermissionRule = {
    action: parsed.action!, resource: parsed.resource!, effect: parsed.effect!,
  };
  const plan = planPermissionRemoval(local, inherited, parsed.entry!, expectedRule);
  if (!plan.ok) {
    console.error(`Refused: ${plan.reason}`);
    return 1;
  }
  console.log(`proposal\t${target.file}\t${parsed.agent}\tremove[${parsed.entry}]\t${expectedRule.action}\t${expectedRule.resource}\t${expectedRule.effect}`);
  if (!parsed.apply) {
    console.log('Preview only; rerun with --apply to write.');
    return 0;
  }
  const result = applyProjectPermissions(context, target.file, parsed.agent!, target.expected, plan.rules);
  console.log(`${result.changed ? 'updated' : 'unchanged'}\t${result.file}`);
  return 0;
}

/** `kiki permissions` — metadata inspection plus explicit project-scope apply. */
export async function permissions(args: string[]): Promise<number> {
  try {
    if (args[0] === '--help' || args[0] === '-h') {
      console.log(USAGE);
      return 0;
    }
    const parsed = parsePermissionsArgs(args);
    if (parsed.help) {
      console.log(USAGE);
      return 0;
    }
    if (parsed.subcommand === 'list') return printRows(parsed);
    if (parsed.subcommand === 'check') return checkProject(parsed);
    if (parsed.subcommand === 'add') return add(parsed);
    return remove(parsed);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Kiki permissions command failed.');
    return 1;
  }
}
