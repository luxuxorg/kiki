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

  it('defaults to general', () => {
    expect(classifyDomain('Refactor some code')).toBe('general');
  });
});
