import type { FastifyBaseLogger } from 'fastify';
import type { HeliusClient } from '../helius/client';
import { parseTransactions } from '../helius/parse';
import type { TokenRecord, TokenRepository } from './repository';

export interface IngestResult {
  launches: number;
  swaps: number;
  enriched: number;
  invalid: number;
}

export interface DiscoveryService {
  /** Store the launches and swaps in a batch of Helius enhanced transactions. Idempotent. */
  ingest(items: readonly unknown[]): Promise<IngestResult>;
}

export interface DiscoveryDeps {
  repository: TokenRepository;
  /** Null when no Helius key is set: tokens are stored without metadata. */
  helius: HeliusClient | null;
  log: Pick<FastifyBaseLogger, 'warn'>;
  now?: () => Date;
  /** Called with the mints launched in each batch, after they are stored. */
  onLaunched?: (mints: string[]) => void;
}

export function createDiscoveryService(deps: DiscoveryDeps): DiscoveryService {
  const now = deps.now ?? (() => new Date());

  return {
    async ingest(items) {
      const { launches, swaps, invalid } = parseTransactions(items);
      const swapMints = [...new Set(swaps.map((swap) => swap.mint))];
      const mints = [...new Set([...launches.map((launch) => launch.mint), ...swapMints])];
      if (mints.length === 0) return { launches: 0, swaps: 0, enriched: 0, invalid };

      // Fetch metadata once per token. Tokens DAS hasn't indexed yet (common right
      // after launch) stay un-enriched and are retried the next time they show up.
      const alreadyEnriched = await deps.repository.enrichedMints(mints);
      const missing = mints.filter((mint) => !alreadyEnriched.has(mint));
      const enrichedAt = now().toISOString();
      const metadata: TokenRecord[] = [];
      if (deps.helius && missing.length > 0) {
        try {
          for (const asset of await deps.helius.getAssetBatch(missing)) {
            metadata.push({ ...asset, enrichedAt });
          }
        } catch (err) {
          deps.log.warn({ err, mints: missing.length }, 'Helius metadata lookup failed');
        }
      }

      await deps.repository.upsertTokens([
        // Bare records so tokens first seen through a swap can still trend.
        ...swapMints.map((mint) => ({ mint })),
        ...launches,
        ...metadata,
      ]);
      await deps.repository.recordSwaps(swaps);
      if (launches.length > 0) deps.onLaunched?.([...new Set(launches.map((l) => l.mint))]);

      return { launches: launches.length, swaps: swaps.length, enriched: metadata.length, invalid };
    },
  };
}
