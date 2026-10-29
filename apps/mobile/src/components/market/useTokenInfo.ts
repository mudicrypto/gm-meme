import { useQueryClient } from '@tanstack/react-query';
import type { MarketToken } from '../../lib/market';

/** Name, symbol and image for a token, from any token list already loaded. */
export function useTokenInfo(mint: string): MarketToken | undefined {
  const queryClient = useQueryClient();
  return queryClient
    .getQueriesData<{ tokens: MarketToken[] }>({ queryKey: ['feed'] })
    .flatMap(([, data]) => data?.tokens ?? [])
    .find((token) => token.mint === mint);
}
