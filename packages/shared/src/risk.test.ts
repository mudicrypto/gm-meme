import { describe, expect, it } from 'vitest';
import { sortBySeverity, worstRiskLevel } from './risk';

describe('worstRiskLevel', () => {
  it('is green when there are no checks', () => {
    expect(worstRiskLevel([])).toBe('green');
  });

  it('is green when every check is green', () => {
    expect(worstRiskLevel(['green', 'green'])).toBe('green');
  });

  it('picks amber over green', () => {
    expect(worstRiskLevel(['green', 'amber', 'green'])).toBe('amber');
  });

  it('picks red over everything', () => {
    expect(worstRiskLevel(['amber', 'red', 'green'])).toBe('red');
  });
});

describe('sortBySeverity', () => {
  it('puts red first and keeps order within a level', () => {
    const items = [
      { id: 1, level: 'green' as const },
      { id: 2, level: 'red' as const },
      { id: 3, level: 'amber' as const },
      { id: 4, level: 'red' as const },
    ];
    expect(sortBySeverity(items).map((i) => i.id)).toEqual([2, 4, 3, 1]);
  });
});
