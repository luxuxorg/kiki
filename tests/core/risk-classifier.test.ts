import { describe, it, expect } from 'vitest';
import { classifyRisk } from '../../src/core/risk-classifier';

const config = {
  highRiskPaths: ['src/auth/'],
  criticalRiskPaths: ['src/security/', 'migrations/']
};

describe('risk-classifier', () => {
  it('returns standard for empty file paths', () => {
    expect(classifyRisk([], config)).toBe('standard');
  });

  it('returns standard for non-critical paths', () => {
    expect(classifyRisk(['src/app/main.ts', 'src/components/button.tsx'], config)).toBe('standard');
  });

  it('returns standard for high-risk but not critical paths', () => {
    expect(classifyRisk(['src/auth/login.ts'], config)).toBe('standard');
  });

  it('returns critical when a path matches criticalRiskPaths', () => {
    expect(classifyRisk(['src/security/crypto.ts'], config)).toBe('critical');
  });

  it('returns critical when any path matches (among many)', () => {
    expect(classifyRisk(['src/app/main.ts', 'src/security/crypto.ts'], config)).toBe('critical');
  });

  it('returns critical for migration paths', () => {
    expect(classifyRisk(['migrations/001_add_users.sql'], config)).toBe('critical');
  });

  it('returns standard when config has no criticalRiskPaths', () => {
    expect(classifyRisk(['src/anything.ts'], { criticalRiskPaths: [], highRiskPaths: [] })).toBe('standard');
  });
});
