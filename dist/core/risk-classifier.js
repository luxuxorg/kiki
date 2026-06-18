export function classifyRisk(filePaths, config) {
    if (filePaths.length === 0)
        return 'standard';
    const matchesCritical = filePaths.some((p) => config.criticalRiskPaths.some((critical) => p.includes(critical)));
    if (matchesCritical)
        return 'critical';
    return 'standard';
}
//# sourceMappingURL=risk-classifier.js.map