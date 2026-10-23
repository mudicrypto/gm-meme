import { WSOL_MINT } from '@sift/shared';
import { z } from 'zod';

export type SellQuote =
  | { status: 'quoted'; priceImpactPct: number; routes: string[] }
  | { status: 'no_route'; reason: string };

export interface JupiterClient {
  /** Quote selling `amount` base units of `mint` for SOL. */
  quoteSell(mint: string, amount: bigint): Promise<SellQuote>;
}

export interface JupiterClientOptions {
  baseUrl: string;
  apiKey?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const quoteResponse = z.looseObject({
  // A real, finite number ("" or "abc" would become 0 or NaN and slip past the thresholds).
  priceImpactPct: z
    .union([z.string().regex(/^-?\d+(\.\d+)?(e-?\d+)?$/i), z.number()])
    .transform(Number)
    .pipe(z.number().finite()),
  routePlan: z
    .array(z.looseObject({ swapInfo: z.looseObject({ label: z.string().nullish() }) }))
    .min(1),
});
const errorResponse = z.looseObject({
  error: z.string().optional(),
  errorCode: z.string().optional(),
});

// Jupiter answers 400 with these codes when a token simply can't be sold.
const NO_ROUTE_CODES = new Set([
  'TOKEN_NOT_TRADABLE',
  'COULD_NOT_FIND_ANY_ROUTE',
  'NO_ROUTES_FOUND',
]);

export class JupiterError extends Error {
  override name = 'JupiterError';
}

export function createJupiterClient(options: JupiterClientOptions): JupiterClient {
  const fetchFn = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;

  return {
    async quoteSell(mint, amount) {
      const params = new URLSearchParams({
        inputMint: mint,
        outputMint: WSOL_MINT,
        amount: amount.toString(),
        slippageBps: '100',
      });
      const res = await fetchFn(`${options.baseUrl}/quote?${params}`, {
        headers: options.apiKey ? { 'x-api-key': options.apiKey } : {},
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        const error = errorResponse.safeParse(body);
        const code = error.success ? error.data.errorCode : undefined;
        if (res.status === 400 && code && NO_ROUTE_CODES.has(code)) {
          return {
            status: 'no_route',
            reason: code === 'TOKEN_NOT_TRADABLE' ? 'not tradable' : 'no route found',
          };
        }
        throw new JupiterError(`Jupiter HTTP ${res.status}${code ? ` ${code}` : ''}`);
      }

      const quote = quoteResponse.parse(body);
      const routes = [
        ...new Set(quote.routePlan.map((r) => r.swapInfo.label).filter((l): l is string => !!l)),
      ];
      // Jupiter reports impact as a fraction ("0.12" = 12%).
      return { status: 'quoted', priceImpactPct: Math.abs(quote.priceImpactPct) * 100, routes };
    },
  };
}
