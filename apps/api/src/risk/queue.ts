import type { FastifyBaseLogger } from 'fastify';
import type { RiskService } from './service';

export interface RiskQueue {
  /** Queue mints for scoring. Duplicates and overflow are dropped. */
  enqueue(mints: readonly string[]): void;
  /** Mints waiting or being scored. */
  readonly size: number;
  /** Resolves once everything queued so far has been scored (for tests and shutdown). */
  idle(): Promise<void>;
}

export interface RiskQueueOptions {
  risk: RiskService;
  log: Pick<FastifyBaseLogger, 'warn'>;
  /** Scores at once; each one makes several Helius calls. */
  concurrency?: number;
  /** Beyond this, new mints are dropped; the detail screen scores them on demand. */
  maxPending?: number;
}

/** Scores newly discovered tokens in the background so the feeds can show risk badges. */
export function createRiskQueue(options: RiskQueueOptions): RiskQueue {
  const concurrency = options.concurrency ?? 2;
  const maxPending = options.maxPending ?? 500;
  const waiting: string[] = [];
  const queued = new Set<string>();
  let running = 0;
  let idleWaiters: Array<() => void> = [];

  const pump = () => {
    while (running < concurrency && waiting.length > 0) {
      const mint = waiting.shift()!;
      running += 1;
      options.risk
        .getRisk(mint)
        .catch((err: unknown) => options.log.warn({ err, mint }, 'background risk score failed'))
        .finally(() => {
          running -= 1;
          queued.delete(mint);
          pump();
        });
    }
    if (running === 0 && waiting.length === 0) {
      const waiters = idleWaiters;
      idleWaiters = [];
      waiters.forEach((resolve) => resolve());
    }
  };

  return {
    enqueue(mints) {
      for (const mint of mints) {
        if (queued.has(mint)) continue;
        if (queued.size >= maxPending) {
          options.log.warn({ dropped: mints.length }, 'risk queue full; dropping new tokens');
          break;
        }
        queued.add(mint);
        waiting.push(mint);
      }
      pump();
    },
    get size() {
      return queued.size;
    },
    idle() {
      if (queued.size === 0) return Promise.resolve();
      return new Promise((resolve) => idleWaiters.push(resolve));
    },
  };
}
