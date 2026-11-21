import { type PermissionRule } from '../opencode-config.js';
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
export declare function parsePermissionsArgs(args: string[]): Parsed;
/** `kiki permissions` — metadata inspection plus explicit project-scope apply. */
export declare function permissions(args: string[]): Promise<number>;
export {};
//# sourceMappingURL=permissions.d.ts.map