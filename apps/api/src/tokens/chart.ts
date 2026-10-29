import type { PricePoint, TokenStats } from '@sift/shared';
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
      // Trades arrive oldest first: the first sets the open, the latest the close.
      priceSol: trade.priceSol,
      open: existing?.open ?? trade.priceSol,
      high: Math.max(existing?.high ?? trade.priceSol, trade.priceSol),
      low: Math.min(existing?.low ?? trade.priceSol, trade.priceSol),
      volumeSol: (existing?.volumeSol ?? 0) + trade.volumeSol,
    });
  }
  return [...points.entries()].sort(([a], [b]) => a - b).map(([, point]) => point);
}

/**
 * List-row stats from a window of trades: last price, change, volume, buy/sell counts and a
 * sparkline of closes in `buckets` steps (gaps carry the previous close).
 */
export function buildStats(
  mint: string,
  trades: readonly PricedTrade[],
  options: { since: Date; now: Date; buckets: number; supply?: number },
): TokenStats {
  const priced = trades.filter((t) => t.priceSol > 0 && Number.isFinite(t.priceSol));
  const points = buildChart(priced, options);
  const start = options.since.getTime();
  const width = Math.max(1, options.now.getTime() - start) / options.buckets;
  const sparkline: number[] = [];
  let last: number | undefined;
  let next = 0;
  for (let i = 0; i < options.buckets; i++) {
    const point = points[next];
    if (point && Date.parse(point.t) < start + (i + 1) * width - 1) {
      last = point.priceSol;
      next += 1;
    }
    if (last !== undefined) sparkline.push(last);
  }
  const first = priced[0]?.priceSol;
  const price = priced[priced.length - 1]?.priceSol;
  return {
    mint,
    ...(price !== undefined ? { priceSol: price } : {}),
    ...(first !== undefined && price !== undefined && priced.length > 1
      ? { changePct: ((price - first) / first) * 100 }
      : {}),
    volumeSol: priced.reduce((total, t) => total + t.volumeSol, 0),
    buys: priced.filter((t) => t.side === 'buy').length,
    sells: priced.filter((t) => t.side === 'sell').length,
    sparkline,
    ...(price !== undefined && options.supply ? { marketCapSol: price * options.supply } : {}),
  };
}
