import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'node:path';
export let ROUTING_PATH = '.agentic/kiki/routing.json';
export function setRoutingPath(newPath) {
    if (newPath.includes('..') || newPath.startsWith('/')) {
        throw new Error('Invalid routing path');
    }
    ROUTING_PATH = newPath;
}
export function loadRoutingTable(filePath) {
    const targetPath = filePath ?? ROUTING_PATH;
    if (!existsSync(targetPath))
        return null;
    try {
        const raw = readFileSync(targetPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!parsed?.agents || typeof parsed.agents !== 'object') {
            return null;
        }
        return { agents: parsed.agents };
    }
    catch {
        return null;
    }
}
export function saveRoutingTable(filePath, table) {
    const dir = path.dirname(filePath);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, JSON.stringify(table, null, 2));
}
export function lookupAgentModel(table, agentName) {
    return table.agents[agentName] ?? null;
}
export function mergeRoutingTables(project, global) {
    const result = { agents: {} };
    if (global) {
        Object.assign(result.agents, global.agents);
    }
    if (project) {
        Object.assign(result.agents, project.agents);
    }
    return result;
}
//# sourceMappingURL=routing-table.js.map