import { describe, expect, it } from 'vitest';
import { worstRiskLevel } from './risk';

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
