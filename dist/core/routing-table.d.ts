import type { StaticRoutingTable } from '../types.js';
export declare let ROUTING_PATH: string;
export declare function setRoutingPath(newPath: string): void;
export declare function loadRoutingTable(filePath?: string): StaticRoutingTable | null;
export declare function saveRoutingTable(filePath: string, table: StaticRoutingTable): void;
export declare function lookupAgentModel(table: StaticRoutingTable, agentName: string): string | null;
export declare function mergeRoutingTables(project: StaticRoutingTable | null, global: StaticRoutingTable | null): StaticRoutingTable;
//# sourceMappingURL=routing-table.d.ts.map