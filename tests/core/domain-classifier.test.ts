import { describe, it, expect } from 'vitest';
import { classifyDomain } from '../../src/core/domain-classifier';

describe('classifyDomain', () => {
  it('detects UI tasks', () => {
    expect(classifyDomain('Build a React modal component')).toBe('gui');
    expect(classifyDomain('Fix CSS layout bug')).toBe('gui');
  });

  it('detects security tasks', () => {
    expect(classifyDomain('Add auth token validation')).toBe('security');
    expect(classifyDomain('Fix SQL injection vulnerability')).toBe('security');
  });

  it('detects backend tasks', () => {
    expect(classifyDomain('Add API endpoint handler')).toBe('backend');
    expect(classifyDomain('Fix server route controller')).toBe('backend');
  });

  it('detects database tasks', () => {
    expect(classifyDomain('Update db schema migration')).toBe('database');
    expect(classifyDomain('Fix SQL query transaction')).toBe('database');
  });

  it('does not match substrings (word boundaries)', () => {
    expect(classifyDomain('Add reaction feature')).toBe('general');
  });

  it('breaks ties using domain order (gui first)', () => {
    expect(classifyDomain('api and ui')).toBe('gui');
  });

  it('defaults to general', () => {
    expect(classifyDomain('Refactor some code')).toBe('general');
  });
});
