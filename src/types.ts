export type Skill = 'brainstorming' | 'writing-plans' | 'executing-plans' | 'reviewing';
export type Domain = 'gui' | 'backend' | 'security' | 'database' | 'general';
export type Risk = 'critical' | 'high' | 'medium' | 'low' | 'micro';

export interface BenchmarkScore {
  model: string;
  category: string;
  score: number;
  rank: number;
}

export interface PricingData {
  model: string;
  prompt_cost_per_1k: number;
  completion_cost_per_1k: number;
  avg_cost_per_1k: number;
}

export interface RoutingRule {
  skill: Skill;
  domain: Domain;
  risk: Risk;
  model: string;
  score_per_dollar: number;
  benchmark_score: number;
  cost_per_1k: number;
  reason: string;
}

export interface RoutingTable {
  version: string;
  generated_at: string;
  sources: {
    benchmarks: string;
    pricing: string;
  };
  rules: RoutingRule[];
  project_defaults: Record<string, string>;
}

export interface BridgeBenchCache {
  scraped_at: string;
  categories: Record<string, BenchmarkScore[]>;
}

export interface OpenRouterCache {
  fetched_at: string;
  models: PricingData[];
}

export interface TaskRegistryEntry {
  task_id: string;
  created_at: string;
  skill: Skill;
  domain: Domain;
  model: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export interface KikiConfig {
  project_name: string;
  language: string;
  commands: {
    build: string;
    test: string;
    lint: string;
  };
  risk_matrix: {
    high_risk_paths: string[];
    critical_risk_paths: string[];
  };
  routing_preferences: {
    refresh_interval_hours: number;
    min_benchmark_rank: number;
    cost_ceiling_per_1k_tokens: number;
  };
}

export interface RoutingLogEntry {
  timestamp: string;
  task_id?: string;
  skill: string;
  domain: string;
  risk: string;
  selected_model: string;
  reason: string;
}
