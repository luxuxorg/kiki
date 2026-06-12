import type { Risk, KikiConfig } from '../types';

export function classifyRisk(filePaths: string[], config: KikiConfig['riskMatrix']): Risk {
  if (filePaths.length === 0) return 'micro';

  const matchesCritical = filePaths.some(p => 
    config.criticalRiskPaths.some(critical => p.includes(critical))
  );
  if (matchesCritical) return 'critical';

  const matchesHigh = filePaths.some(p =>
    config.highRiskPaths.some(high => p.includes(high))
  );
  if (matchesHigh) return 'high';

  return 'medium';
}
