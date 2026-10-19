import type { TokenSummary, TrendingToken } from '@sift/shared';
import { createClient } from '@supabase/supabase-js';
import {
  type SwapRecord,
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
    return rows.map(toSummary);
  }

  async listTrending({ since, limit }: { since: Date; limit: number }): Promise<TrendingToken[]> {
    const rows = await this.call<TrendingRow>('trending_tokens', {
      since: since.toISOString(),
      max_rows: limit,
    });
    return rows.map((row) => ({
      ...toSummary(row),
      swapCount: Number(row.swap_count),
      uniqueTraders: Number(row.unique_traders),
      volumeSol: Number(row.volume_sol),
    }));
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
  };
}

function toIso(value: string | Date): string {
  return new Date(value).toISOString();
}
