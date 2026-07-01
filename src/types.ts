export type Skill = 'brainstorming' | 'writing-plans' | 'executing-plans' | 'reviewing' | 'documenting';

export interface StaticRoutingTable {
  agents: Record<string, string>;
}

export interface KikiConfig {
  readonly projectName: string;
  readonly language: string;
  readonly commands: {
    readonly build: string;
    readonly test: string;
    readonly lint: string;
    readonly security: string;
  };
}

export interface RoutingLogEntry {
  readonly timestamp: string;
  readonly agent: string;
  readonly model: string;
}
