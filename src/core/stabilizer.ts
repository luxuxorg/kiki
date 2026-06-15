export interface StabilizerState {
  taskLocks: Record<string, string>; // taskId -> model
}

export function loadStabilizerState(): StabilizerState {
  return { taskLocks: {} };
}

export function lockTaskModel(state: StabilizerState, taskId: string, model: string): StabilizerState {
  return {
    taskLocks: { ...state.taskLocks, [taskId]: model }
  };
}

export function getLockedModel(state: StabilizerState, taskId: string | null): string | null {
  if (!taskId) return null;
  return state.taskLocks[taskId] ?? null;
}
