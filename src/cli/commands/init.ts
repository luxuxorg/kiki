import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const DEFAULT_CONFIG = {
  projectName: 'my-project',
  language: 'typescript',
  commands: {
    build: 'npm run build',
    test: 'npm test',
    lint: 'npm run lint'
  },
  riskMatrix: {
    highRiskPaths: ['src/auth/', 'src/db/schema.ts'],
    criticalRiskPaths: ['src/security/', 'migrations/']
  },
  routingPreferences: {
    refreshIntervalHours: 24,
    minBenchmarkRank: 20,
    costCeilingPer1kTokens: 0.05
  }
};

const DEFAULT_ALIGNMENT = {
  guardrails: [
    'No hardcoded secrets in source code',
    'All database queries must use parameterized statements',
    'API responses must not leak internal stack traces'
  ],
  compliance: ['OWASP Top 10', 'SOC 2 Type II']
};

export async function init(targetPath: string): Promise<void> {
  const agenticDir = join(targetPath, '.agentic');
  const cacheDir = join(agenticDir, 'cache');

  if (!existsSync(agenticDir)) {
    mkdirSync(agenticDir, { recursive: true });
    mkdirSync(cacheDir, { recursive: true });
  }

  writeFileSync(join(agenticDir, 'config.json'), JSON.stringify(DEFAULT_CONFIG, null, 2));
  writeFileSync(join(agenticDir, 'alignment.json'), JSON.stringify(DEFAULT_ALIGNMENT, null, 2));
  writeFileSync(join(agenticDir, 'TASK_REGISTRY.json'), JSON.stringify({ tasks: [] }, null, 2));
  writeFileSync(join(agenticDir, 'routing.json'), JSON.stringify({ 
    version: '1.0.0', 
    generatedAt: new Date().toISOString(),
    sources: { benchmarks: '', pricing: '' },
    rules: [],
    projectDefaults: {}
  }, null, 2));

  console.log(`Initialized Kiki in ${agenticDir}`);
}
