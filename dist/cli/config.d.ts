export interface KikiPaths {
    source: string;
    tests: string;
    docs: string;
    superpowers: string;
    specs: string;
    plans: string;
    changelog: string;
    readme: string;
    decisions: string | null;
    knowledge: string | null;
    taskRegistry: string;
}
export interface KikiHealthConfig {
    watchdogEnabled: boolean;
    stuckThresholdMs: number;
    gracePeriodMs: number;
    absoluteMaxMs: number;
    checkIntervalMs: number;
    loopRepeatCount: number;
    watchAllSubagents: boolean;
    logPath: string;
}
export interface KikiConfig {
    projectName: string;
    language: string;
    commands: {
        build: string;
        test: string;
        lint: string;
        security: string;
    };
    paths: KikiPaths;
    health: KikiHealthConfig;
}
export declare const DEFAULT_PATHS: KikiPaths;
export declare const DEFAULT_HEALTH: KikiHealthConfig;
/**
 * Kiki version. MUST be kept in sync with package.json on every release. The
 * published package ships only dist/ (see package.json "files"), so a globally
 * installed CLI cannot read its own package.json at runtime — this const is the
 * runtime source of truth for version checks and release transforms.
 */
export declare const KIKI_VERSION = "3.0.0";
export declare const DEFAULT_CONFIG: KikiConfig;
export declare const DEFAULT_ALIGNMENT: {
    guardrails: string[];
    compliance: string[];
};
export declare function loadConfig(targetPath: string): KikiConfig;
export declare function generateOrchestratorTemplate(config: KikiConfig): string;
export declare function generateBrainstormerTemplate(config: KikiConfig): string;
export declare function generatePlannerTemplate(config: KikiConfig): string;
export declare function generateImplementerTemplate(config: KikiConfig): string;
export declare function generateGuiDesignerTemplate(config: KikiConfig): string;
export declare function generateReviewerTemplate(config: KikiConfig): string;
export declare function generateEscalationTemplate(_config: KikiConfig): string;
export declare function generateHistorianTemplate(config: KikiConfig): string;
export declare function generateWorkflowTemplate(config: KikiConfig): string;
export interface GeneratedTemplates {
    orchestrator: string;
    brainstormer: string;
    planner: string;
    implementer: string;
    guiDesigner: string;
    reviewer: string;
    escalation: string;
    historian: string;
    workflow: string;
}
export declare function generateAllTemplates(config: KikiConfig): GeneratedTemplates;
export declare function ensurePathExists(targetPath: string, filePath: string): void;
//# sourceMappingURL=config.d.ts.map