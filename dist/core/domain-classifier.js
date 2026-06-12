const DOMAIN_KEYWORDS = {
    gui: ['ui', 'frontend', 'react', 'css', 'html', 'dom', 'component', 'viewport', 'modal', 'form'],
    backend: ['api', 'endpoint', 'server', 'route', 'controller', 'middleware', 'handler'],
    security: ['auth', 'security', 'vulnerability', 'encrypt', 'token', 'password', 'xss', 'csrf', 'injection'],
    database: ['db', 'sql', 'query', 'schema', 'migration', 'table', 'index', 'transaction'],
    general: []
};
const DOMAIN_ORDER = ['gui', 'backend', 'security', 'database', 'general'];
export function classifyDomain(taskDescription) {
    const words = taskDescription.toLowerCase().split(/[^a-z0-9]+/);
    const scores = {
        gui: 0,
        backend: 0,
        security: 0,
        database: 0,
        general: 0
    };
    for (const domain of DOMAIN_ORDER) {
        const keywords = DOMAIN_KEYWORDS[domain];
        scores[domain] = keywords.filter(kw => words.includes(kw)).length;
    }
    let bestDomain = 'general';
    let bestScore = 0;
    for (const domain of DOMAIN_ORDER) {
        const score = scores[domain];
        if (score > bestScore) {
            bestScore = score;
            bestDomain = domain;
        }
    }
    return bestDomain;
}
//# sourceMappingURL=domain-classifier.js.map