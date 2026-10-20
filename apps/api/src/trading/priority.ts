import { z } from 'zod';

export interface PriorityFeeOptions {
  rpcUrl: string;
  fetch?: typeof fetch;
  /** Bounds protect users from fee spikes and broken estimates. */
  minMicroLamports?: number;
  maxMicroLamports?: number;
  fallbackMicroLamports?: number;
}

const estimateResponse = z.object({
  result: z.object({ priorityFeeEstimate: z.number() }).nullish(),
});

/** Helius' priority fee estimate (micro-lamports per compute unit) for a program, clamped. */
export function createPriorityFeeEstimator(options: PriorityFeeOptions) {
  const fetchFn = options.fetch ?? fetch;
  const min = options.minMicroLamports ?? 1_000;
  const max = options.maxMicroLamports ?? 1_000_000;
  const fallback = options.fallbackMicroLamports ?? 50_000;

  return async (programId: string): Promise<number> => {
    try {
      const res = await fetchFn(options.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'sift',
          method: 'getPriorityFeeEstimate',
          params: [{ accountKeys: [programId], options: { priorityLevel: 'Medium' } }],
        }),
        signal: AbortSignal.timeout(5_000),
      });
      const body = estimateResponse.parse(await res.json());
      const estimate = body.result?.priorityFeeEstimate;
      if (estimate === undefined || !Number.isFinite(estimate)) return fallback;
      return Math.min(max, Math.max(min, Math.ceil(estimate)));
    } catch {
      return fallback;
    }
  };
}
