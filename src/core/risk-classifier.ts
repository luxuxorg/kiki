import type { Risk, KikiConfig } from '../types.js';

export function classifyRisk(filePaths: string[], config: KikiConfig['riskMatrix']): Risk {
  if (filePaths.length === 0) return 'micro';

  const matchesCritical = filePaths.some((p: string) => 
    config.criticalRiskPaths.some((critical: string) => p.includes(critical))
  );
  if (matchesCritical) return 'critical';

  const matchesHigh = filePaths.some((p: string) =>
    config.highRiskPaths.some((high: string) => p.includes(high))
  );
  if (matchesHigh) return 'high';

  return 'medium';
}
