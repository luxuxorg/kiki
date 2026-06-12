import { describe, it, expect } from 'vitest';
import { classifyRisk } from '../../src/core/risk-classifier';

describe('classifyRisk', () => {
  const config = {
    highRiskPaths: ['src/auth/', 'src/db/schema.ts'],
    criticalRiskPaths: ['src/security/', 'migrations/']
  };

  it('classifies critical risk', () => {
    expect(classifyRisk(['src/security/auth.ts'], config)).toBe('critical');
  });

  it('classifies high risk', () => {
    expect(classifyRisk(['src/auth/login.ts'], config)).toBe('high');
  });

  it('classifies medium risk for normal file paths', () => {
    expect(classifyRisk(['src/utils/helper.ts'], config)).toBe('medium');
  });

  it('classifies micro risk for empty file paths', () => {
    expect(classifyRisk([], config)).toBe('micro');
  });
});
