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
        if (!parsed || !parsed.rules || typeof parsed.rules !== 'object') {
            return null;
        }
        return parsed;
    }
    catch {
        return null;
    }
}
export function saveRoutingTable(table) {
    const dir = path.dirname(ROUTING_PATH);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(ROUTING_PATH, JSON.stringify(table, null, 2));
}
export function lookupModel(table, skill, domain, risk) {
    const key = `${skill}:${domain}`;
    const rule = table.rules[key];
    if (!rule)
        return null;
    // If risk is critical and a critical model is explicitly defined, use it
    if (risk === 'critical' && rule.critical) {
        return rule.critical;
    }
    // Otherwise fall back to standard
    return rule.standard ?? null;
}
export function mergeRoutingTables(project, global) {
    const result = { rules: {} };
    if (global) {
        Object.assign(result.rules, global.rules);
    }
    if (project) {
        Object.assign(result.rules, project.rules);
    }
    return result;
}
//# sourceMappingURL=routing-table.js.map