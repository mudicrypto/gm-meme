import type { RiskLevel, TokenSummary, TrendingToken } from '@sift/shared';

/** Everything we store about a token. Optional fields may arrive in any order. */
export interface TokenRecord {
  mint: string;
  symbol?: string;
  name?: string;
  imageUrl?: string;
  decimals?: number;
  supply?: number;
  /** Fee payer of the launch transaction (the dev wallet). */
  creator?: string;
  launchSignature?: string;
  launchSource?: string;
  launchedAt?: string;
  /** Set when Helius metadata was fetched. */
  enrichedAt?: string;
  riskLevel?: RiskLevel;
  riskCheckedAt?: string;
}

export interface SwapRecord {
  signature: string;
  mint: string;
  trader: string;
  volumeSol?: number;
  blockTime: string;
  /** From the trader's point of view; absent when the trader's side can't be told. */
  side?: 'buy' | 'sell';
  /** Whole tokens bought or sold. */
  tokenAmount?: number;
}

/** A trade with a known price. */
export interface PricedTrade {
  blockTime: string;
  side?: 'buy' | 'sell';
  /** SOL per whole token. */
  priceSol: number;
  volumeSol: number;
}

/** A stored token with everything we know about it. */
export interface StoredToken extends TokenRecord {
  firstSeenAt: string;
}

/** Trading activity for one token over a window. */
export interface TokenActivity {
  swapCount: number;
  uniqueTraders: number;
  volumeSol: number;
}

export interface TokenRepository {
  /** One token, or null if we've never seen it. */
  getToken(mint: string): Promise<StoredToken | null>;
  /** Insert or merge tokens (see mergeTokenRecord for the rules). */
  upsertTokens(tokens: readonly TokenRecord[]): Promise<void>;
  /** Record swaps; ones already stored (same signature and mint) are ignored. */
  recordSwaps(swaps: readonly SwapRecord[]): Promise<void>;
  /** The subset of `mints` that already has metadata. */
  enrichedMints(mints: readonly string[]): Promise<Set<string>>;
  /** Launched tokens, newest first. */
  listNew(limit: number): Promise<TokenSummary[]>;
  /** Swaps, distinct traders and SOL volume for one token since `since`. */
  getActivity(mint: string, since: Date): Promise<TokenActivity>;
  /** Store a risk level, unless a newer one is already stored. */
  setRiskLevel(mint: string, level: RiskLevel, checkedAt: string): Promise<void>;
  /** Stored risk levels for the mints that have one. */
  getRiskLevels(mints: readonly string[]): Promise<Map<string, RiskLevel>>;
  /** Priced trades since `since`, oldest first. */
  getTrades(mint: string, since: Date, limit: number): Promise<PricedTrade[]>;
  /** Tokens ranked by distinct traders since `since`. */
  listTrending(options: { since: Date; limit: number }): Promise<TrendingToken[]>;
}

/**
 * Merge a newer record into an existing one, the same way the upsert_tokens SQL
 * function does: metadata takes the newest non-empty value, launch facts keep the
 * first value seen, and the launch time keeps the earliest.
 */
export function mergeTokenRecord(existing: TokenRecord, incoming: TokenRecord): TokenRecord {
  return {
    mint: existing.mint,
    symbol: incoming.symbol ?? existing.symbol,
    name: incoming.name ?? existing.name,
    imageUrl: incoming.imageUrl ?? existing.imageUrl,
    decimals: incoming.decimals ?? existing.decimals,
    supply: incoming.supply ?? existing.supply,
    creator: existing.creator ?? incoming.creator,
    launchSignature: existing.launchSignature ?? incoming.launchSignature,
    launchSource: existing.launchSource ?? incoming.launchSource,
    launchedAt: earliest(existing.launchedAt, incoming.launchedAt),
    enrichedAt: incoming.enrichedAt ?? existing.enrichedAt,
  };
}

/** Collapse records for the same mint into one, in order. */
export function dedupeTokenRecords(records: readonly TokenRecord[]): TokenRecord[] {
  const byMint = new Map<string, TokenRecord>();
  for (const record of records) {
    const existing = byMint.get(record.mint);
    byMint.set(record.mint, existing ? mergeTokenRecord(existing, record) : record);
  }
  return [...byMint.values()];
}

function earliest(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) <= Date.parse(b) ? a : b;
}
