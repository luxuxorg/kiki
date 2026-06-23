export type Skill = 'brainstorming' | 'writing-plans' | 'executing-plans' | 'reviewing' | 'documenting';
export type Domain = 'gui' | 'backend' | 'security' | 'database' | 'general';
export type Risk = 'standard' | 'critical';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
export interface StaticRoutingRule {
    readonly standard: string;
    readonly critical?: string;
}
export interface StaticRoutingTable {
    readonly rules: Record<string, StaticRoutingRule>;
}
export interface TaskRegistryEntry {
    readonly taskId: string;
    readonly createdAt: string;
    readonly skill: Skill;
    readonly domain: Domain;
    readonly model: string;
    readonly status: TaskStatus;
}
export interface KikiConfig {
    readonly projectName: string;
    readonly language: string;
    readonly commands: {
        readonly build: string;
        readonly test: string;
        readonly lint: string;
        readonly security: string;
    };
    readonly riskMatrix: {
        readonly highRiskPaths: readonly string[];
        readonly criticalRiskPaths: readonly string[];
    };
}
export interface RoutingLogEntry {
    readonly timestamp: string;
    readonly taskId?: string;
    readonly skill: Skill;
    readonly domain: Domain;
    readonly risk: Risk;
    readonly selectedModel: string;
    readonly reason: string;
}
//# sourceMappingURL=types.d.ts.map