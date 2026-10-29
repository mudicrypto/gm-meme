import type { LeaderboardEntry } from '@sift/shared';
import type { SharedTradeRecord } from './repository';

/**
 * Realized profit per trader from their shared trades: for each token, sales minus the
 * average cost of the tokens sold. Sells without a recorded buy in the window are left out
 * (their cost is unknown), so nobody's profit is inflated.
 */
export function buildLeaderboard(
  trades: readonly SharedTradeRecord[],
  limit = 50,
): LeaderboardEntry[] {
  const byTrader = new Map<
    string,
    {
      displayName: string;
      trades: number;
      positions: Map<string, { tokens: bigint; cost: number; realized: number; sold: boolean }>;
    }
  >();
  const ordered = [...trades].sort((a, b) => a.at.localeCompare(b.at));
  for (const trade of ordered) {
    const trader = byTrader.get(trade.handle) ?? {
      displayName: trade.displayName,
      trades: 0,
      positions: new Map(),
    };
    byTrader.set(trade.handle, trader);
    trader.trades += 1;
    const position = trader.positions.get(trade.mint) ?? {
      tokens: 0n,
      cost: 0,
      realized: 0,
      sold: false,
    };
    trader.positions.set(trade.mint, position);
    const amount = BigInt(trade.tokenAmount);
    if (trade.side === 'buy') {
      position.tokens += amount;
      position.cost += trade.solLamports;
      continue;
    }
    if (position.tokens <= 0n) continue;
    const sold = amount > position.tokens ? position.tokens : amount;
    const costOfSold = (position.cost * Number(sold)) / Number(position.tokens);
    // Proceeds for the part we know the cost of.
    const proceeds = (trade.solLamports * Number(sold)) / Number(amount);
    position.realized += proceeds - costOfSold;
    position.cost -= costOfSold;
    position.tokens -= sold;
    position.sold = true;
  }

  return [...byTrader.entries()]
    .map(([handle, trader]) => {
      const sold = [...trader.positions.values()].filter((p) => p.sold);
      return {
        handle,
        displayName: trader.displayName,
        realizedLamports: Math.round(sold.reduce((total, p) => total + p.realized, 0)),
        trades: trader.trades,
        winningTokens: sold.filter((p) => p.realized > 0).length,
        soldTokens: sold.length,
      };
    })
    .filter((entry) => entry.soldTokens > 0)
    .sort((a, b) => b.realizedLamports - a.realizedLamports || b.trades - a.trades)
    .slice(0, limit)
    .map((entry, index) => ({ rank: index + 1, ...entry }));
}
