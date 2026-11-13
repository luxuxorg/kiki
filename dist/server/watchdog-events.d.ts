import type { Plugin } from '@opencode/plugin';
type EventStream = ReturnType<Plugin.Context['event']['subscribe']>;
/** The published `OpenCodeEvent` union, extracted through the subscribe result. */
export type OpenCodeEvent = EventStream extends AsyncIterable<infer Event> ? Event : never;
/** Client-observed token counters, preserving the original V1 field semantics. */
export interface TokenCounters {
    input: number;
    output: number;
    reasoning: number;
    cacheRead: number;
    cacheWrite: number;
}
/**
 * SDK-independent watchdog input. The event adapter normalizes the published
 * OC2 event union into this small discriminated union; the engine owns all
 * accumulation and timing state.
 *
 * `parentID` is optional on `child` so the stateless adapter can forward
 * `session.agent.selected` (which carries no parent) as an agent update for an
 * already tracked child. The engine never registers a session without a
 * parentID, preserving root-session exclusion.
 *
 * `running.status` is optional and defaults to `busy`. It exists only so the
 * V2 explicit retry status keeps the original "retrying is active but not
 * abortable" outcome without adding another top-level variant.
 *
 * Permission variants carry the OpenCode 2.x payload identities. The
 * `permission.asked.data.{sessionID,id}` shape was live-captured; the
 * `permission.replied.data.{sessionID,requestID,reply}` shape is verified
 * against the published schema rather than live-captured. Pending state is
 * observable only from the live event stream; session discovery exposes no
 * permission state, so a reconnect/reload cannot be reconstructed here and
 * is documented as a rollout limitation rather than guessed.
 */
export type WatchdogEvent = {
    type: 'child';
    id: string;
    parentID?: string;
    agent?: string;
} | {
    type: 'running';
    id: string;
    status?: 'busy' | 'retry';
} | {
    type: 'finished';
    id: string;
} | {
    type: 'text';
    id: string;
    key: string;
    text: string;
    mode: 'append' | 'replace';
} | {
    type: 'tool';
    id: string;
    key: string;
    name: string;
    input: unknown;
} | {
    type: 'tokens';
    id: string;
    counters: TokenCounters;
} | {
    type: 'permission-asked';
    id: string;
    requestID: string;
} | {
    type: 'permission-replied';
    id: string;
    requestID: string;
    reply: 'once' | 'always' | 'reject';
};
/**
 * Stateless OC2 event decoder. No state, no V1 payload shapes, no casts: every
 * branch narrows the published union and reads payload fields from `.data`.
 */
export declare function decodeWatchdogEvent(event: OpenCodeEvent): WatchdogEvent[];
export {};
//# sourceMappingURL=watchdog-events.d.ts.map