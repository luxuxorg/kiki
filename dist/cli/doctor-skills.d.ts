/**
 * Skills the Kiki agent templates require. The last entry is a user-level
 * skill rather than a superpowers skill; it is included because the
 * gui-designer template requires it.
 */
export declare const REQUIRED_SKILLS: readonly ["brainstorming", "writing-plans", "executing-plans", "test-driven-development", "systematic-debugging", "receiving-code-review", "requesting-code-review", "ui-ux-pro-max"];
/**
 * Version Kiki's agent templates were last verified against. This is an
 * observation, never a support floor or compatibility guarantee.
 */
export declare const TESTED_SUPERPOWERS_VERSION = "7.0.1";
export interface SkillCopy {
    path: string;
    directoryName: string;
    frontmatterName?: string;
    nameDrift: boolean;
    packageRoot?: string;
}
export interface SkillDiscovery {
    byName: Record<string, SkillCopy[]>;
    skippedEntries: number;
}
export interface SkillObservation {
    level: 'pass' | 'warn' | 'info';
    label: string;
    detail: string;
}
/**
 * Read-only discovery of the required skills across project, legacy user,
 * XDG user and package-cache locations. Returns copies in deterministic
 * precedence/lexical order; the first copy per name wins for observations.
 */
export declare function discoverSkills(project: string, env?: NodeJS.ProcessEnv): SkillDiscovery;
/**
 * Turn a discovery result into warning-only observations. Missing skills,
 * name drift and version differences are warnings; duplicate copies are
 * informational. No observation changes doctor's exit status.
 */
export declare function observeSkills(discovery: SkillDiscovery): SkillObservation[];
//# sourceMappingURL=doctor-skills.d.ts.map