import type { RiskLevel, TokenSummary, TrendingToken } from '@sift/shared';
import {
  type StoredToken,
  type PricedTrade,
  type SwapRecord,
  type TokenActivity,
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
          ? {
              ...mergeTokenRecord(existing, record),
              firstSeenAt: existing.firstSeenAt,
              riskLevel: existing.riskLevel,
              riskCheckedAt: existing.riskCheckedAt,
            }
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

  async setRiskLevel(mint: string, level: RiskLevel, checkedAt: string): Promise<void> {
    const token = this.tokens.get(mint);
    if (!token) return;
    if (token.riskCheckedAt && Date.parse(token.riskCheckedAt) >= Date.parse(checkedAt)) return;
    this.tokens.set(mint, { ...token, riskLevel: level, riskCheckedAt: checkedAt });
  }

  async getRiskLevels(mints: readonly string[]): Promise<Map<string, RiskLevel>> {
    const levels = new Map<string, RiskLevel>();
    for (const mint of mints) {
      const level = this.tokens.get(mint)?.riskLevel;
      if (level) levels.set(mint, level);
    }
    return levels;
  }

  async getTrades(mint: string, since: Date, limit: number): Promise<PricedTrade[]> {
    return [...this.swaps.values()]
      .filter(
        (s) =>
          s.mint === mint &&
          Date.parse(s.blockTime) >= since.getTime() &&
          (s.tokenAmount ?? 0) > 0 &&
          (s.volumeSol ?? 0) > 0,
      )
      .sort((a, b) => Date.parse(a.blockTime) - Date.parse(b.blockTime))
      .slice(0, limit)
      .map((s) => ({
        blockTime: s.blockTime,
        side: s.side,
        priceSol: s.volumeSol! / s.tokenAmount!,
        volumeSol: s.volumeSol!,
      }));
  }

  async getActivity(mint: string, since: Date): Promise<TokenActivity> {
    const swaps = [...this.swaps.values()].filter(
      (swap) => swap.mint === mint && Date.parse(swap.blockTime) >= since.getTime(),
    );
    return {
      swapCount: swaps.length,
      uniqueTraders: new Set(swaps.map((swap) => swap.trader)).size,
      volumeSol: swaps.reduce((total, swap) => total + (swap.volumeSol ?? 0), 0),
    };
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
    riskLevel: token.riskLevel,
    riskCheckedAt: token.riskCheckedAt,
  };
}
