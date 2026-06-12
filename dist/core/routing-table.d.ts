import type { RoutingTable, BridgeBenchCache, OpenRouterCache, Skill, Domain, Risk } from '../types.js';
export declare let ROUTING_PATH: string;
export declare function setRoutingPath(newPath: string): void;
export declare function loadRoutingTable(): RoutingTable | null;
export declare function saveRoutingTable(table: RoutingTable): void;
export declare function generateRoutingTable(benchmarks: BridgeBenchCache, pricing: OpenRouterCache, availableModels: string[], config: {
    minBenchmarkRank: number;
    costCeilingPer1kTokens: number;
}): RoutingTable;
export declare function mapSkillDomainToCategory(skill: Skill, domain: Domain): string;
export declare function lookupModel(table: RoutingTable, skill: Skill, domain: Domain, risk: Risk): string | null;
//# sourceMappingURL=routing-table.d.ts.map