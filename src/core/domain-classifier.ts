import type { Domain } from '../types';

const DOMAIN_KEYWORDS: Record<Domain, string[]> = {
  gui: ['ui', 'frontend', 'react', 'css', 'html', 'dom', 'component', 'viewport', 'modal', 'form'],
  backend: ['api', 'endpoint', 'server', 'route', 'controller', 'middleware', 'handler'],
  security: ['auth', 'security', 'vulnerability', 'encrypt', 'token', 'password', 'xss', 'csrf', 'injection'],
  database: ['db', 'sql', 'query', 'schema', 'migration', 'table', 'index', 'transaction'],
  general: []
};

export function classifyDomain(taskDescription: string): Domain {
  const lower = taskDescription.toLowerCase();
  const scores: Record<string, number> = {};

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    scores[domain] = keywords.filter(kw => lower.includes(kw)).length;
  }

  const best = Object.entries(scores)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])[0];

  return (best?.[0] as Domain) ?? 'general';
}
