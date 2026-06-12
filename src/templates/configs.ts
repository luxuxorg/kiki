export const DEFAULT_CONFIG = `{
  "project_name": "my-project",
  "language": "javascript",
  "commands": {
    "build": "npm run build",
    "test": "npm test",
    "lint": "npm run lint"
  },
  "risk_matrix": {
    "high_risk_paths": [
      "src/auth/",
      "src/db/schema.ts"
    ],
    "critical_risk_paths": [
      "src/security/",
      "migrations/"
    ]
  }
}`;

export const DEFAULT_ALIGNMENT = `{
  "audit_type": "Security, Compliance & Alignment Gate",
  "core_guardrails": [
    {
      "id": "GR-01",
      "name": "Design & Scope Adherence",
      "rule": "Every design decision must verify that it adheres strictly to the approved specifications, concept documents, and architecture plan without introducing feature creep."
    },
    {
      "id": "GR-02",
      "name": "Security & Privacy Integrity",
      "rule": "Every change must verify that it does not weaken authentication, expose sensitive customer/user data, or violate defined system security boundaries."
    }
  ],
  "wait_cost_rationale": "It is always preferable to deploy a fully secure and compliant implementation with complete logging and warning indicators than to skip security gates for immediate release."
}`;

export const DEFAULT_MODELS = `{
  "roles": {
    "kiki-orchestrator": {
      "primary": "google/gemini-3.5-flash",
      "fallback": "google/gemini-3.1-pro-preview"
    },
    "kiki-brainstormer": {
      "primary": "deepseek/deepseek-v4-pro",
      "fallback": "google/gemini-3.1-pro-preview"
    },
    "kiki-planner": {
      "primary": "moonshotai/kimi-k2.6",
      "fallback": "google/gemini-3.1-pro-preview"
    },
    "kiki-architect": {
      "primary": "anthropic/claude-opus-4-8",
      "fallback": "google/gemini-3.1-pro-preview"
    },
    "kiki-implementation-standard": {
      "primary": "deepseek/deepseek-v4-pro",
      "fallback": "moonshotai/kimi-k2.6"
    },
    "kiki-implementation-complexity": {
      "primary": "anthropic/claude-opus-4-8",
      "fallback": "google/gemini-3.1-pro-preview"
    },
    "kiki-first-reviewer": {
      "primary": "moonshotai/kimi-k2.6",
      "fallback": "anthropic/claude-sonnet-4.6"
    },
    "kiki-second-reviewer": {
      "primary": "anthropic/claude-opus-4-8",
      "fallback": "google/gemini-3.1-pro-preview"
    },
    "kiki-escalation-agent": {
      "primary": "anthropic/claude-opus-4-8",
      "fallback": "google/gemini-3.1-pro-preview"
    }
  },
  "default_fallback": "moonshotai/kimi-k2.6"
}
`;
