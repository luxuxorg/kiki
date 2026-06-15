export function loadStabilizerState() {
    return { taskLocks: {} };
}
export function lockTaskModel(state, taskId, model) {
    return {
        taskLocks: { ...state.taskLocks, [taskId]: model }
    };
}
export function getLockedModel(state, taskId) {
    if (!taskId)
        return null;
    return state.taskLocks[taskId] ?? null;
}
//# sourceMappingURL=stabilizer.js.map