export interface StabilizerState {
    taskLocks: Record<string, string>;
}
export declare function loadStabilizerState(): StabilizerState;
export declare function lockTaskModel(state: StabilizerState, taskId: string, model: string): StabilizerState;
export declare function getLockedModel(state: StabilizerState, taskId: string | null): string | null;
//# sourceMappingURL=stabilizer.d.ts.map