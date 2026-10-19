import { RISK_DISCLAIMER, type RiskScore } from '@sift/shared';
import { scoreRisk } from './checks';
import { type GatherDeps, gatherRiskInputs } from './gather';

export interface RiskService {
  /** The risk score for a mint, or null if the address is not a token mint. */
  getRisk(mint: string): Promise<RiskScore | null>;
}

export interface RiskServiceOptions extends GatherDeps {
  /** How long a score is reused. Holders and liquidity move quickly; keep it short. */
  ttlMs?: number;
  now?: () => Date;
  /** Cap on cached mints, so a flood of lookups can't grow memory without bound. */
  maxEntries?: number;
}

export function createRiskService(options: RiskServiceOptions): RiskService {
  const ttlMs = options.ttlMs ?? 60_000;
  // Retry sooner when a data source failed and some checks only say "couldn't verify".
  const partialTtlMs = Math.min(ttlMs, 10_000);
  const maxEntries = options.maxEntries ?? 5_000;
  const now = options.now ?? (() => new Date());
  // One entry per mint, holding the in-flight or finished lookup, so concurrent
  // requests for the same token share a single round of RPC calls.
  const cache = new Map<string, { expiresAt: number; result: Promise<RiskScore | null> }>();

  const compute = async (mint: string, entry: { expiresAt: number }): Promise<RiskScore | null> => {
    const inputs = await gatherRiskInputs(mint, options);
    if (!inputs) return null;
    const incomplete = [
      inputs.mintInfo,
      inputs.holders,
      inputs.creatorHistory,
      inputs.sellTest,
    ].includes(undefined);
    if (incomplete) entry.expiresAt = Math.min(entry.expiresAt, now().getTime() + partialTtlMs);
    return {
      mint,
      ...scoreRisk(inputs),
      checkedAt: now().toISOString(),
      disclaimer: RISK_DISCLAIMER,
    };
  };

  return {
    getRisk(mint) {
      const at = now().getTime();
      const cached = cache.get(mint);
      if (cached && cached.expiresAt > at) return cached.result;

      const entry = { expiresAt: at + ttlMs } as {
        expiresAt: number;
        result: Promise<RiskScore | null>;
      };
      entry.result = compute(mint, entry);
      // Failures shouldn't stick around in the cache.
      entry.result.catch(() => {
        if (cache.get(mint) === entry) cache.delete(mint);
      });
      cache.delete(mint);
      // Map keeps insertion order, so the first key is the oldest entry.
      if (cache.size >= maxEntries) cache.delete(cache.keys().next().value!);
      cache.set(mint, entry);
      return entry.result;
    },
  };
}
