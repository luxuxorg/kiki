import type { StaticRoutingTable } from '../types.js';
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
export declare const DEFAULT_ROUTING_TABLE: StaticRoutingTable;
export declare function loadConfig(targetPath: string): KikiConfig;
export declare function generateOrchestratorTemplate(config: KikiConfig): string;
export declare function generateBrainstormerTemplate(config: KikiConfig): string;
export declare function generatePlannerTemplate(config: KikiConfig): string;
export declare function generateImplementerTemplate(config: KikiConfig): string;
export declare function generateGuiDesignerTemplate(config: KikiConfig): string;
export declare function generateReviewerTemplate(config: KikiConfig): string;
export declare function generateEscalationTemplate(config: KikiConfig): string;
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
    guiDesigner: string;
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