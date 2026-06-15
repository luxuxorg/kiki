import { describe, it, expect } from 'vitest';
import { loadStabilizerState, lockTaskModel, getLockedModel } from '../../src/core/stabilizer';

describe('stabilizer', () => {
  it('loads empty state', () => {
    const state = loadStabilizerState();
    expect(state.taskLocks).toEqual({});
  });

  it('locks a task to a model', () => {
    const state = loadStabilizerState();
    const updated = lockTaskModel(state, 'task-1', 'claude-4');
    expect(updated.taskLocks['task-1']).toBe('claude-4');
  });

  it('returns locked model for known task', () => {
    const state = loadStabilizerState();
    const updated = lockTaskModel(state, 'task-1', 'claude-4');
    const locked = getLockedModel(updated, 'task-1');
    expect(locked).toBe('claude-4');
  });

  it('returns null for unknown task', () => {
    const state = loadStabilizerState();
    const updated = lockTaskModel(state, 'task-1', 'claude-4');
    const locked = getLockedModel(updated, 'task-2');
    expect(locked).toBeNull();
  });

  it('returns null for null taskId', () => {
    const state = loadStabilizerState();
    const locked = getLockedModel(state, null);
    expect(locked).toBeNull();
  });

  it('locks multiple tasks independently', () => {
    const state = loadStabilizerState();
    const s1 = lockTaskModel(state, 'task-1', 'claude-4');
    const s2 = lockTaskModel(s1, 'task-2', 'kimi-k2');
    expect(getLockedModel(s2, 'task-1')).toBe('claude-4');
    expect(getLockedModel(s2, 'task-2')).toBe('kimi-k2');
  });
});
