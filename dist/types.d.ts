export type Skill = 'brainstorming' | 'writing-plans' | 'executing-plans' | 'reviewing';
export type Domain = 'gui' | 'backend' | 'security' | 'database' | 'general';
export type Risk = 'critical' | 'high' | 'medium' | 'low' | 'micro';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
export interface BenchmarkScore {
    readonly model: string;
    readonly category: string;
    readonly score: number;
    readonly rank: number;
}
export interface PricingData {
    readonly model: string;
    readonly promptCostPer1k: number;
    readonly completionCostPer1k: number;
    readonly avgCostPer1k: number;
}
export interface RoutingRule {
    readonly skill: Skill;
    readonly domain: Domain;
    readonly risk: Risk;
    readonly model: string;
    readonly scorePerDollar: number;
    readonly benchmarkScore: number;
    readonly costPer1k: number;
    readonly reason: string;
}
export interface RoutingTable {
    readonly version: string;
    readonly generatedAt: string;
    readonly sources: {
        readonly benchmarks: string;
        readonly pricing: string;
    };
    readonly rules: readonly RoutingRule[];
    projectDefaults: Record<string, string>;
}
export interface BridgeBenchCache {
    readonly scrapedAt: string;
    readonly categories: Record<string, readonly BenchmarkScore[]>;
}
export interface OpenRouterCache {
    readonly fetchedAt: string;
    readonly models: readonly PricingData[];
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
    };
    readonly riskMatrix: {
        readonly highRiskPaths: readonly string[];
        readonly criticalRiskPaths: readonly string[];
    };
    readonly routingPreferences: {
        readonly refreshIntervalHours: number;
        readonly minBenchmarkRank: number;
        readonly costCeilingPer1kTokens: number;
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