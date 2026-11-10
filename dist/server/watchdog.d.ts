import type { KikiHealthConfig } from '../cli/config.js';
import type { WatchdogEvent } from './watchdog-events.js';
export interface WatchdogSessionInfo {
    id: string;
    parentID?: string;
    agent?: string;
    location?: {
        directory?: string;
    };
    time?: {
        archived?: number;
    };
}
export interface WatchdogSessionPage {
    data: ReadonlyArray<WatchdogSessionInfo>;
    cursor?: {
        next?: string | null;
        previous?: string | null;
    };
}
export interface WatchdogSessionListInput {
    limit?: number;
    cursor?: string;
    archived?: boolean;
    directory?: string;
}
/** Public-client child discovery and interrupt boundary for the V2 session API. */
export interface WatchdogSessionApi {
    list(input?: WatchdogSessionListInput): Promise<WatchdogSessionPage>;
    interrupt(input: {
        sessionID: string;
    }): Promise<unknown>;
}
export interface WatchdogSessionAdapter {
    discover(): Promise<WatchdogEvent[]>;
    interrupt(id: string): Promise<void>;
}
/**
 * Adapts the published OC2 session domain to the watchdog. Child discovery uses
 * `session.list()` and the `parentID` field, follows `cursor.next` so a default
 * server page cap cannot hide older children, and ignores archived or
 * foreign-location sessions. Interruption uses `session.interrupt({ sessionID })`.
 * The OC1 `session.messages`/`session.abort` surface is intentionally absent.
 */
export declare function createWatchdogSessionAdapter(session: WatchdogSessionApi, directory?: string): WatchdogSessionAdapter;
export interface WatchdogDeps {
    config: KikiHealthConfig;
    directory: string;
    now: () => number;
    interrupt: (id: string) => Promise<void>;
    discover: () => Promise<WatchdogEvent[]>;
    writeHealth: (level: string, entry: Record<string, unknown>) => void;
}
export interface Watchdog {
    handle(event: WatchdogEvent): void;
    start(): void;
    stop(): Promise<void>;
}
/**
 * Typed replacement for the generated V1 watchdog. The thresholds, rings,
 * content normalization/hash, grace/absolute/silence gates, agent filtering,
 * root exclusion and health-log fields are unchanged; only the input event
 * shape and interrupt call are V2-native.
 */
export declare function createWatchdog(deps: WatchdogDeps): Watchdog;
//# sourceMappingURL=watchdog.d.ts.map