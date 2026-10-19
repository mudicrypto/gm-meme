import type { PricePoint } from '@sift/shared';
import type { PricedTrade } from './repository';

/**
 * Bucket trades into evenly spaced points: the last trade's price in each bucket and
 * the SOL traded. Buckets with no trades are left out rather than invented.
 */
export function buildChart(
  trades: readonly PricedTrade[],
  options: { since: Date; now: Date; buckets: number },
): PricePoint[] {
  const start = options.since.getTime();
  const span = Math.max(1, options.now.getTime() - start);
  const width = span / options.buckets;
  const points = new Map<number, PricePoint>();

  for (const trade of trades) {
    const at = Date.parse(trade.blockTime);
    if (at < start || at > options.now.getTime() || !(trade.priceSol > 0)) continue;
    const index = Math.min(options.buckets - 1, Math.floor((at - start) / width));
    const existing = points.get(index);
    points.set(index, {
      t: new Date(start + index * width).toISOString(),
      // Trades arrive oldest first, so the latest one sets the bucket's price.
      priceSol: trade.priceSol,
      volumeSol: (existing?.volumeSol ?? 0) + trade.volumeSol,
    });
  }
  return [...points.entries()].sort(([a], [b]) => a - b).map(([, point]) => point);
}
