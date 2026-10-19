import { describe, expect, it } from 'vitest';
import { chartGeometry } from './chart';

describe('chartGeometry', () => {
  it('scales the lowest price to the bottom and the highest to the top', () => {
    const g = chartGeometry([1, 3, 2], 100, 50, 0)!;
    expect(g.line).toBe('M0 50 L50 0 L100 25');
    expect(g.area).toBe('M0 50 L50 0 L100 25 L100 50 L0 50 Z');
    expect([g.min, g.max]).toEqual([1, 3]);
  });

  it('draws a level line for one point or a flat series', () => {
    expect(chartGeometry([5], 100, 50, 0)!.line).toBe('M0 25 L100 25');
    expect(chartGeometry([5, 5], 100, 50, 0)!.line).toBe('M0 25 L100 25');
  });

  it('ignores unusable prices and returns null with nothing to draw', () => {
    expect(chartGeometry([0, Number.NaN], 100, 50)).toBeNull();
    expect(chartGeometry([], 100, 50)).toBeNull();
  });
});
