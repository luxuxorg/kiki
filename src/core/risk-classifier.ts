import type { Risk, KikiConfig } from '../types.js';

export function classifyRisk(filePaths: string[], config: KikiConfig['riskMatrix']): Risk {
  if (filePaths.length === 0) return 'standard';

  const matchesCritical = filePaths.some((p: string) =>
    config.criticalRiskPaths.some((critical: string) => p.includes(critical))
  );
  if (matchesCritical) return 'critical';

  return 'standard';
}
