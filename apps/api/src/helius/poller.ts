import type { FastifyBaseLogger } from 'fastify';
import type { DiscoveryService } from '../tokens/discovery';
import type { HeliusClient } from './client';

export interface PollerOptions {
  helius: HeliusClient;
  discovery: DiscoveryService;
  addresses: readonly string[];
  intervalMs: number;
  log: Pick<FastifyBaseLogger, 'info' | 'warn'>;
}

/**
 * Poll Helius for recent transactions on the watched addresses. An alternative to
 * the webhook for local development, where Helius can't reach localhost. Ingest is
 * idempotent, so overlap between polls (or with the webhook) is harmless.
 * Returns a function that stops polling.
 */
export function startHeliusPoller(options: PollerOptions): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  const tick = async () => {
    for (const address of options.addresses) {
      try {
        const transactions = await options.helius.getAddressTransactions(address);
        const result = await options.discovery.ingest(transactions);
        options.log.info({ address, ...result }, 'Helius poll ingested');
      } catch (err) {
        options.log.warn({ err, address }, 'Helius poll failed');
      }
    }
    if (!stopped) timer = setTimeout(tick, options.intervalMs);
  };

  void tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
