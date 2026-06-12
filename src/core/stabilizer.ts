const HYSTERESIS_THRESHOLD = 0.2; // 20%

export interface StabilizerState {
  projectDefaults: Record<string, string>;
  taskLocks: Record<string, string>; // taskId -> model
}

export function loadStabilizerState(routingTable: { projectDefaults?: Record<string, string> }): StabilizerState {
  return {
    projectDefaults: routingTable.projectDefaults ?? {},
    taskLocks: {}
  };
}

export function selectModel(
  state: StabilizerState,
  key: string, // "skill:domain"
  taskId: string | null,
  candidateModel: string,
  candidateScore: number,
  currentDefaultModel: string | null,
  currentDefaultScore: number
): { model: string; updatedDefaults: Record<string, string> } {
  // If task exists, use locked model
  if (taskId && state.taskLocks[taskId]) {
    return { model: state.taskLocks[taskId], updatedDefaults: state.projectDefaults };
  }

  // If no default, set candidate as default
  if (!currentDefaultModel) {
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
  return { model: currentDefaultModel, updatedDefaults: state.projectDefaults };
}

export function lockTaskModel(state: StabilizerState, taskId: string, model: string): StabilizerState {
  return {
    ...state,
    taskLocks: { ...state.taskLocks, [taskId]: model }
  };
}
