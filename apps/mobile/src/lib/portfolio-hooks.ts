import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useSiftWallet } from './social-hooks';
import { useWallet } from './wallet';

/** The wallet that trades: the Sift wallet when it's live, else the wallet on this device. */
export function useActiveAddress(): string | null {
  const wallet = useWallet();
  const sift = useSiftWallet().data?.wallet;
  return sift && !sift.frozen && sift.signing === 'live' ? sift.address : wallet.address;
}

/**
 * A wallet's SOL and tokens, each token valued at its last traded price in SOL ("est.").
 * Sift has no cost basis, so this is value now, never profit or loss.
 */
export function usePortfolio(address: string | null) {
  const holdings = useQuery({
    queryKey: ['holdings', address],
    queryFn: () => api.holdings(address!),
    enabled: address !== null,
    refetchInterval: 20_000,
  });
  const items = holdings.data?.holdings ?? [];
  const mints = items.map((h) => h.mint);
  const stats = useQuery({
    queryKey: ['token-stats', mints, 1440],
    queryFn: () => api.stats(mints, 1440),
    enabled: mints.length > 0,
    refetchInterval: 30_000,
  });
  const byMint = new Map((stats.data?.stats ?? []).map((s) => [s.mint, s]));
  const rows = items
    .map((h) => {
      const s = byMint.get(h.mint);
      const value = s?.priceSol !== undefined ? h.amount * s.priceSol : undefined;
      return { h, s, value };
    })
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  const sol = holdings.data?.solBalance;
  const tokenValue = rows.reduce((sum, r) => sum + (r.value ?? 0), 0);
  return {
    holdings,
    stats,
    items,
    rows,
    sol,
    tokenValue,
    total: sol !== undefined ? sol + tokenValue : undefined,
    priced: rows.filter((r) => r.value !== undefined).length,
    pricesPending: stats.isPending && mints.length > 0,
  };
}
