import type { Risk } from '../types';

export function classifyRisk(filePaths: string[], config: { highRiskPaths: string[]; criticalRiskPaths: string[] }): Risk {
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
