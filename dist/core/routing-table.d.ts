import type { StaticRoutingTable, Skill, Domain, Risk } from '../types.js';
export declare let ROUTING_PATH: string;
export declare function setRoutingPath(newPath: string): void;
export declare function loadRoutingTable(): StaticRoutingTable | null;
export declare function saveRoutingTable(table: StaticRoutingTable): void;
export declare function lookupModel(table: StaticRoutingTable, skill: Skill, domain: Domain, risk: Risk): string | null;
//# sourceMappingURL=routing-table.d.ts.map