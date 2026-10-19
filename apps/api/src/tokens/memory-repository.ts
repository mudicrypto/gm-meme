import type { TokenSummary, TrendingToken } from '@sift/shared';
import {
  type StoredToken,
  type SwapRecord,
  type TokenRecord,
  type TokenRepository,
  dedupeTokenRecords,
  mergeTokenRecord,
} from './repository';

/**
 * In-process store with the same behaviour as the Supabase one. Used in tests and
 * when Supabase isn't configured locally. Data is lost on restart.
 */
export class InMemoryTokenRepository implements TokenRepository {
  private readonly tokens = new Map<string, StoredToken>();
  private readonly swaps = new Map<string, SwapRecord>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async getToken(mint: string): Promise<StoredToken | null> {
    const token = this.tokens.get(mint);
    return token ? { ...token } : null;
  }

  async upsertTokens(records: readonly TokenRecord[]): Promise<void> {
    for (const record of dedupeTokenRecords(records)) {
      const existing = this.tokens.get(record.mint);
      this.tokens.set(
        record.mint,
        existing
          ? { ...mergeTokenRecord(existing, record), firstSeenAt: existing.firstSeenAt }
          : { ...record, firstSeenAt: this.now().toISOString() },
      );
    }
  }

  async recordSwaps(records: readonly SwapRecord[]): Promise<void> {
    for (const swap of records) {
      const key = `${swap.signature}:${swap.mint}`;
      if (!this.swaps.has(key)) this.swaps.set(key, swap);
    }
  }

  async enrichedMints(mints: readonly string[]): Promise<Set<string>> {
    return new Set(mints.filter((mint) => this.tokens.get(mint)?.enrichedAt));
  }

  async listNew(limit: number): Promise<TokenSummary[]> {
    return [...this.tokens.values()]
      .filter((token) => token.launchedAt)
      .sort((a, b) => Date.parse(b.launchedAt!) - Date.parse(a.launchedAt!))
      .slice(0, limit)
      .map(toSummary);
  }

  async listTrending({ since, limit }: { since: Date; limit: number }): Promise<TrendingToken[]> {
    const stats = new Map<string, { swapCount: number; traders: Set<string>; volumeSol: number }>();
    for (const swap of this.swaps.values()) {
      if (Date.parse(swap.blockTime) < since.getTime() || !this.tokens.has(swap.mint)) continue;
      const entry = stats.get(swap.mint) ?? { swapCount: 0, traders: new Set(), volumeSol: 0 };
      entry.swapCount += 1;
      entry.traders.add(swap.trader);
      entry.volumeSol += swap.volumeSol ?? 0;
      stats.set(swap.mint, entry);
    }

    return [...stats.entries()]
      .map(([mint, entry]) => ({
        ...toSummary(this.tokens.get(mint)!),
        swapCount: entry.swapCount,
        uniqueTraders: entry.traders.size,
        volumeSol: entry.volumeSol,
      }))
      .sort(
        (a, b) =>
          b.uniqueTraders - a.uniqueTraders ||
          b.swapCount - a.swapCount ||
          b.volumeSol - a.volumeSol,
      )
      .slice(0, limit);
  }
}

function toSummary(token: StoredToken): TokenSummary {
  return {
    mint: token.mint,
    symbol: token.symbol,
    name: token.name,
    imageUrl: token.imageUrl,
    launchedAt: token.launchedAt,
    firstSeenAt: token.firstSeenAt,
  };
}
