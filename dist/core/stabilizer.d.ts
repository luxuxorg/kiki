export interface StabilizerState {
    projectDefaults: Record<string, string>;
    taskLocks: Record<string, string>;
}
export declare function loadStabilizerState(routingTable: {
    projectDefaults?: Record<string, string>;
}): StabilizerState;
export declare function selectModel(state: StabilizerState, key: string, // "skill:domain"
taskId: string | null, candidateModel: string, candidateScore: number, currentDefaultModel: string | null, currentDefaultScore: number): {
    model: string;
    updatedDefaults: Record<string, string>;
};
export declare function lockTaskModel(state: StabilizerState, taskId: string, model: string): StabilizerState;
//# sourceMappingURL=stabilizer.d.ts.map