import type { RiskLevel, TokenSummary, TrendingToken } from '@sift/shared';
import { createClient } from '@supabase/supabase-js';
import {
  type StoredToken,
  type PricedTrade,
  type SwapRecord,
  type TokenActivity,
  type TokenRecord,
  type TokenRepository,
  dedupeTokenRecords,
} from './repository';

/**
 * The one Supabase call this repository makes. All logic lives in the SQL functions
 * of supabase/migrations, so tests can run them in PGlite through the same interface.
 */
export type RpcCaller = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

interface TokenRow {
  mint: string;
  symbol: string | null;
  name: string | null;
  image_url: string | null;
  launched_at: string | Date | null;
  first_seen_at: string | Date;
  risk_level?: RiskLevel | null;
  risk_checked_at?: string | Date | null;
}

interface FullTokenRow extends TokenRow {
  decimals: number | null;
  supply: number | string | null;
  creator: string | null;
  launch_signature: string | null;
  launch_source: string | null;
  enriched_at: string | Date | null;
}

interface TrendingRow extends TokenRow {
  swap_count: number;
  unique_traders: number;
  volume_sol: number | string;
}

export function createSupabaseRpc(url: string, serviceRoleKey: string): RpcCaller {
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return async (fn, args) => client.rpc(fn, args);
}

export class SupabaseTokenRepository implements TokenRepository {
  constructor(private readonly rpc: RpcCaller) {}

  async getToken(mint: string): Promise<StoredToken | null> {
    const [row] = await this.call<FullTokenRow>('get_token', { token_mint: mint });
    if (!row) return null;
    return {
      ...toSummary(row),
      decimals: row.decimals ?? undefined,
      supply: row.supply === null ? undefined : Number(row.supply),
      creator: row.creator ?? undefined,
      launchSignature: row.launch_signature ?? undefined,
      launchSource: row.launch_source ?? undefined,
      enrichedAt: row.enriched_at ? toIso(row.enriched_at) : undefined,
    };
  }

  async upsertTokens(records: readonly TokenRecord[]): Promise<void> {
    if (records.length === 0) return;
    const rows = dedupeTokenRecords(records).map((r) => ({
      mint: r.mint,
      symbol: r.symbol ?? null,
      name: r.name ?? null,
      image_url: r.imageUrl ?? null,
      decimals: r.decimals ?? null,
      supply: r.supply ?? null,
      creator: r.creator ?? null,
      launch_signature: r.launchSignature ?? null,
      launch_source: r.launchSource ?? null,
      launched_at: r.launchedAt ?? null,
      enriched_at: r.enrichedAt ?? null,
    }));
    await this.call('upsert_tokens', { rows });
  }

  async recordSwaps(records: readonly SwapRecord[]): Promise<void> {
    if (records.length === 0) return;
    const rows = records.map((s) => ({
      signature: s.signature,
      mint: s.mint,
      trader: s.trader,
      volume_sol: s.volumeSol ?? null,
      block_time: s.blockTime,
      side: s.side ?? null,
      token_amount: s.tokenAmount ?? null,
    }));
    await this.call('record_swaps', { rows });
  }

  async enrichedMints(mints: readonly string[]): Promise<Set<string>> {
    if (mints.length === 0) return new Set();
    const rows = await this.call<{ mint: string }>('enriched_mints', { mints: [...mints] });
    return new Set(rows.map((row) => row.mint));
  }

  async listNew(limit: number): Promise<TokenSummary[]> {
    const rows = await this.call<TokenRow>('new_tokens', { max_rows: limit });
    return this.withRiskLevels(rows.map(toSummary));
  }

  async setRiskLevel(mint: string, level: RiskLevel, checkedAt: string): Promise<void> {
    await this.call('set_token_risk', { token_mint: mint, level, checked_at: checkedAt });
  }

  async getRiskLevels(mints: readonly string[]): Promise<Map<string, RiskLevel>> {
    if (mints.length === 0) return new Map();
    const rows = await this.call<{ mint: string; risk_level: RiskLevel }>('risk_levels', {
      mints: [...mints],
    });
    return new Map(rows.map((row) => [row.mint, row.risk_level]));
  }

  async getTrades(mint: string, since: Date, limit: number): Promise<PricedTrade[]> {
    const rows = await this.call<{
      block_time: string | Date;
      side: 'buy' | 'sell' | null;
      price_sol: number | string;
      volume_sol: number | string;
    }>('token_trades', { token_mint: mint, since: since.toISOString(), max_rows: limit });
    return rows.map((row) => ({
      blockTime: toIso(row.block_time),
      side: row.side ?? undefined,
      priceSol: Number(row.price_sol),
      volumeSol: Number(row.volume_sol),
    }));
  }

  async getActivity(mint: string, since: Date): Promise<TokenActivity> {
    const [row] = await this.call<{
      swap_count: number;
      unique_traders: number;
      volume_sol: number | string;
    }>('token_activity', { token_mint: mint, since: since.toISOString() });
    return {
      swapCount: Number(row?.swap_count ?? 0),
      uniqueTraders: Number(row?.unique_traders ?? 0),
      volumeSol: Number(row?.volume_sol ?? 0),
    };
  }

  async getLatestPrices(mints: readonly string[]): Promise<Map<string, number>> {
    if (mints.length === 0) return new Map();
    const rows = await this.call<{ mint: string; price_sol: number | string }>('latest_prices', {
      mints: [...mints],
    });
    return new Map(rows.map((row) => [row.mint, Number(row.price_sol)]));
  }

  async listTrending({ since, limit }: { since: Date; limit: number }): Promise<TrendingToken[]> {
    const rows = await this.call<TrendingRow>('trending_tokens', {
      since: since.toISOString(),
      max_rows: limit,
    });
    return this.withRiskLevels(
      rows.map((row) => ({
        ...toSummary(row),
        swapCount: Number(row.swap_count),
        uniqueTraders: Number(row.unique_traders),
        volumeSol: Number(row.volume_sol),
      })),
    );
  }

  /** The feed functions predate stored risk levels, so merge them in with one lookup. */
  private async withRiskLevels<T extends TokenSummary>(tokens: T[]): Promise<T[]> {
    if (tokens.length === 0) return tokens;
    const rows = await this.call<{
      mint: string;
      risk_level: RiskLevel;
      risk_checked_at: string | Date;
    }>('risk_levels', { mints: tokens.map((t) => t.mint) });
    const byMint = new Map(rows.map((row) => [row.mint, row]));
    return tokens.map((token) => {
      const risk = byMint.get(token.mint);
      return risk
        ? { ...token, riskLevel: risk.risk_level, riskCheckedAt: toIso(risk.risk_checked_at) }
        : token;
    });
  }

  private async call<Row>(fn: string, args: Record<string, unknown>): Promise<Row[]> {
    const { data, error } = await this.rpc(fn, args);
    if (error) throw new Error(`Supabase ${fn} failed: ${error.message}`);
    return Array.isArray(data) ? (data as Row[]) : [];
  }
}

function toSummary(row: TokenRow): TokenSummary {
  return {
    mint: row.mint,
    symbol: row.symbol ?? undefined,
    name: row.name ?? undefined,
    imageUrl: row.image_url ?? undefined,
    launchedAt: row.launched_at ? toIso(row.launched_at) : undefined,
    firstSeenAt: toIso(row.first_seen_at),
    riskLevel: row.risk_level ?? undefined,
    riskCheckedAt: row.risk_checked_at ? toIso(row.risk_checked_at) : undefined,
  };
}

function toIso(value: string | Date): string {
  return new Date(value).toISOString();
}
