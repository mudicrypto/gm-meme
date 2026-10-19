export interface ChartGeometry {
  /** SVG path for the price line. */
  line: string;
  /** Closed path under the line, for a soft fill. */
  area: string;
  min: number;
  max: number;
}

/**
 * Scale prices into an SVG box. Points are spread evenly left to right (they are
 * already time-bucketed by the API); a single point or a flat series draws a level line.
 */
export function chartGeometry(
  prices: readonly number[],
  width: number,
  height: number,
  padding = 4,
): ChartGeometry | null {
  const values = prices.filter((p) => Number.isFinite(p) && p > 0);
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  const coords = values.map((value, i) => {
    const x = padding + (values.length === 1 ? innerW : (i / (values.length - 1)) * innerW);
    // Flat series sit in the middle rather than on the floor.
    const y = max === min ? height / 2 : padding + innerH - ((value - min) / range) * innerH;
    return [round(x), round(y)] as const;
  });
  if (coords.length === 1) coords.unshift([padding, coords[0]![1]]);

  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
  const last = coords[coords.length - 1]!;
  const area = `${line} L${last[0]} ${height} L${coords[0]![0]} ${height} Z`;
  return { line, area, min, max };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
