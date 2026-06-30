import type { StaticRoutingTable, Skill, Domain, Risk } from '../types.js';
export declare let ROUTING_PATH: string;
export declare function setRoutingPath(newPath: string): void;
export declare function loadRoutingTable(filePath?: string): StaticRoutingTable | null;
export declare function saveRoutingTable(table: StaticRoutingTable): void;
export declare function lookupModel(table: StaticRoutingTable, skill: Skill, domain: Domain, risk: Risk): string | null;
export declare function mergeRoutingTables(project: StaticRoutingTable | null, global: StaticRoutingTable | null): StaticRoutingTable;
//# sourceMappingURL=routing-table.d.ts.map