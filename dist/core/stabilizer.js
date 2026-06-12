const HYSTERESIS_THRESHOLD = 0.2; // 20%
export function loadStabilizerState(routingTable) {
    return {
        projectDefaults: routingTable.projectDefaults ?? {},
        taskLocks: {}
    };
}
export function selectModel(state, key, // "skill:domain"
taskId, candidateModel, candidateScore, currentDefaultModel, currentDefaultScore) {
    // If task exists, use locked model
    if (taskId && state.taskLocks[taskId]) {
        return { model: state.taskLocks[taskId], updatedDefaults: { ...state.projectDefaults } };
    }
    // If no default, set candidate as default
    if (!currentDefaultModel) {
        const updatedDefaults = { ...state.projectDefaults, [key]: candidateModel };
        return { model: candidateModel, updatedDefaults };
    }
    // Handle division by zero or negative current score
    if (currentDefaultScore <= 0) {
        // If current score is 0 or negative, always switch to candidate if it's better
        const updatedDefaults = { ...state.projectDefaults, [key]: candidateModel };
        return { model: candidateModel, updatedDefaults };
    }
    // Check if candidate is significantly better (>20%)
    const improvement = candidateScore / currentDefaultScore - 1;
    if (improvement > HYSTERESIS_THRESHOLD) {
        const updatedDefaults = { ...state.projectDefaults, [key]: candidateModel };
        return { model: candidateModel, updatedDefaults };
    }
    // Use existing default
    return { model: currentDefaultModel, updatedDefaults: { ...state.projectDefaults } };
}
export function lockTaskModel(state, taskId, model) {
    return {
        ...state,
        taskLocks: { ...state.taskLocks, [taskId]: model }
    };
}
//# sourceMappingURL=stabilizer.js.map