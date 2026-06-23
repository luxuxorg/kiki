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
export interface KikiModels {
    standard: string;
    critical: string;
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
    riskMatrix: {
        highRiskPaths: string[];
        criticalRiskPaths: string[];
    };
    paths: KikiPaths;
    models: KikiModels;
}
export declare const DEFAULT_PATHS: KikiPaths;
export declare const DEFAULT_MODELS: KikiModels;
export declare const DEFAULT_CONFIG: KikiConfig;
export declare const DEFAULT_ALIGNMENT: {
    guardrails: string[];
    compliance: string[];
};
export declare const DEFAULT_ROUTING_TABLE: {
    rules: {
        'brainstorming:gui': {
            standard: string;
        };
        'brainstorming:backend': {
            standard: string;
        };
        'brainstorming:security': {
            standard: string;
            critical: string;
        };
        'brainstorming:database': {
            standard: string;
        };
        'brainstorming:general': {
            standard: string;
        };
        'writing-plans:gui': {
            standard: string;
        };
        'writing-plans:backend': {
            standard: string;
        };
        'writing-plans:security': {
            standard: string;
            critical: string;
        };
        'writing-plans:database': {
            standard: string;
        };
        'writing-plans:general': {
            standard: string;
        };
        'executing-plans:gui': {
            standard: string;
        };
        'executing-plans:backend': {
            standard: string;
        };
        'executing-plans:security': {
            standard: string;
            critical: string;
        };
        'executing-plans:database': {
            standard: string;
        };
        'executing-plans:general': {
            standard: string;
        };
        'reviewing:gui': {
            standard: string;
        };
        'reviewing:backend': {
            standard: string;
        };
        'reviewing:security': {
            standard: string;
            critical: string;
        };
        'reviewing:database': {
            standard: string;
        };
        'reviewing:general': {
            standard: string;
        };
        'documenting:gui': {
            standard: string;
        };
        'documenting:backend': {
            standard: string;
        };
        'documenting:security': {
            standard: string;
        };
        'documenting:database': {
            standard: string;
        };
        'documenting:general': {
            standard: string;
        };
    };
};
export declare function loadConfig(targetPath: string): KikiConfig;
export declare function generateOrchestratorTemplate(config: KikiConfig): string;
export declare function generateBrainstormerTemplate(config: KikiConfig): string;
export declare function generatePlannerTemplate(config: KikiConfig): string;
export declare function generateImplementerTemplate(config: KikiConfig): string;
export declare function generateReviewerTemplate(config: KikiConfig): string;
export declare function generateEscalationTemplate(_config: KikiConfig): string;
export declare function generateHistorianTemplate(config: KikiConfig): string;
export declare function generatePluginTemplate(): string;
export declare function generateWorkflowTemplate(config: KikiConfig): string;
export declare const OPENCODE_PACKAGE_JSON_TEMPLATE = "{\n  \"dependencies\": {\n    \"@opencode-ai/plugin\": \"1.15.13\"\n  }\n}\n";
export declare const OPENCODE_GITIGNORE_TEMPLATE = "node_modules\npackage.json\npackage-lock.json\nbun.lock\n.gitignore\n";
export interface GeneratedTemplates {
    orchestrator: string;
    brainstormer: string;
    planner: string;
    implementer: string;
    reviewer: string;
    escalation: string;
    historian: string;
    plugin: string;
    packageJson: string;
    gitignore: string;
    workflow: string;
}
export declare function generateAllTemplates(config: KikiConfig): GeneratedTemplates;
export declare function writeOpencodeFiles(targetPath: string, config: KikiConfig): void;
export declare function writeAgenticFiles(targetPath: string, config: KikiConfig): string;
export declare function ensurePathExists(targetPath: string, filePath: string): void;
//# sourceMappingURL=config.d.ts.map