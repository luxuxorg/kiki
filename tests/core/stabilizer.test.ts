import { describe, it, expect } from 'vitest';
import { selectModel, lockTaskModel, type StabilizerState } from '../../src/core/stabilizer';

describe('stabilizer', () => {
  it('sets default when none exists', () => {
    const state: StabilizerState = { projectDefaults: {}, taskLocks: {} };
    const result = selectModel(state, 'brainstorming:gui', null, 'model-a', 100, null, 0);
    expect(result.model).toBe('model-a');
    expect(result.updatedDefaults['brainstorming:gui']).toBe('model-a');
  });

  it('uses locked model for existing task', () => {
    const state: StabilizerState = { 
      projectDefaults: { 'brainstorming:gui': 'model-a' }, 
      taskLocks: { 'task-1': 'model-b' } 
    };
    const result = selectModel(state, 'brainstorming:gui', 'task-1', 'model-c', 200, 'model-a', 100);
    expect(result.model).toBe('model-b');
  });

  it('switches default when >20% better', () => {
    const state: StabilizerState = { projectDefaults: { 'brainstorming:gui': 'model-a' }, taskLocks: {} };
    const result = selectModel(state, 'brainstorming:gui', null, 'model-b', 130, 'model-a', 100);
    expect(result.model).toBe('model-b');
    expect(result.updatedDefaults['brainstorming:gui']).toBe('model-b');
  });

  it('keeps default when improvement <20%', () => {
    const state: StabilizerState = { projectDefaults: { 'brainstorming:gui': 'model-a' }, taskLocks: {} };
    const result = selectModel(state, 'brainstorming:gui', null, 'model-b', 110, 'model-a', 100);
    expect(result.model).toBe('model-a');
  });

  it('locks task model', () => {
    const state: StabilizerState = { projectDefaults: {}, taskLocks: {} };
    const locked = lockTaskModel(state, 'task-1', 'model-x');
    expect(locked.taskLocks['task-1']).toBe('model-x');
  });

  it('does NOT switch when improvement is exactly 20%', () => {
    const state: StabilizerState = { projectDefaults: { 'brainstorming:gui': 'model-a' }, taskLocks: {} };
    const result = selectModel(state, 'brainstorming:gui', null, 'model-b', 120, 'model-a', 100);
    expect(result.model).toBe('model-a');
  });

  it('keeps default when scores are equal (0% improvement)', () => {
    const state: StabilizerState = { projectDefaults: { 'brainstorming:gui': 'model-a' }, taskLocks: {} };
    const result = selectModel(state, 'brainstorming:gui', null, 'model-b', 100, 'model-a', 100);
    expect(result.model).toBe('model-a');
  });

  it('switches to candidate when current default score is zero', () => {
    const state: StabilizerState = { projectDefaults: { 'brainstorming:gui': 'model-a' }, taskLocks: {} };
    const result = selectModel(state, 'brainstorming:gui', null, 'model-b', 10, 'model-a', 0);
    expect(result.model).toBe('model-b');
    expect(result.updatedDefaults['brainstorming:gui']).toBe('model-b');
  });

  it('handles negative current default score gracefully', () => {
    const state: StabilizerState = { projectDefaults: { 'brainstorming:gui': 'model-a' }, taskLocks: {} };
    const result = selectModel(state, 'brainstorming:gui', null, 'model-b', 10, 'model-a', -50);
    expect(result.model).toBe('model-b');
    expect(result.updatedDefaults['brainstorming:gui']).toBe('model-b');
  });

  it('does not mutate the original state object', () => {
    const state: StabilizerState = { projectDefaults: { 'brainstorming:gui': 'model-a' }, taskLocks: {} };
    const result = selectModel(state, 'brainstorming:gui', null, 'model-b', 130, 'model-a', 100);
    expect(result.model).toBe('model-b');
    // Original state should be unchanged
    expect(state.projectDefaults['brainstorming:gui']).toBe('model-a');
    expect(state.projectDefaults).not.toBe(result.updatedDefaults);
  });

  it('falls through to default logic when task ID is provided but not yet locked', () => {
    const state: StabilizerState = { projectDefaults: { 'brainstorming:gui': 'model-a' }, taskLocks: {} };
    const result = selectModel(state, 'brainstorming:gui', 'task-2', 'model-b', 130, 'model-a', 100);
    expect(result.model).toBe('model-b');
    expect(result.updatedDefaults['brainstorming:gui']).toBe('model-b');
  });
});
