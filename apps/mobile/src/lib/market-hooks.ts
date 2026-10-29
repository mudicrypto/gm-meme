import type { SharedTrade, TokenStats } from '@sift/shared';
import { useQuery } from '@tanstack/react-query';
import { api, socialApi } from './api';
import type { MarketToken } from './market';
import { useSession } from './session';

export type Feed = 'trending' | 'new' | 'smart';

/** How many of the leaderboard's top traders count as "smart money". */
const SMART_TRADERS = 5;
const REFRESH_MS = 15_000;

/**
 * Tokens bought recently by smart money: the leaderboard's top traders by realized profit
 * (7 days) plus the people you follow. Real shared trades only, newest first.
 */
async function smartMoney(token: string | null): Promise<{
  tokens: MarketToken[];
  traders: Map<string, number>;
}> {
  const board = await api.leaderboard(7);
  const top = board.entries.filter((e) => e.realizedLamports > 0).slice(0, SMART_TRADERS);
  const profiles = await Promise.all(
    top.map((e) => socialApi.profile(token, e.handle).catch(() => null)),
  );
  const trades: SharedTrade[] = profiles.flatMap((p) => p?.trades ?? []);
  if (token) trades.push(...((await socialApi.feed(token).catch(() => null))?.trades ?? []));

  const byMint = new Map<string, { token: MarketToken; traders: Set<string> }>();
  for (const trade of trades.sort((a, b) => b.at.localeCompare(a.at))) {
    if (trade.side !== 'buy') continue;
    const entry = byMint.get(trade.token.mint) ?? {
      token: {
        mint: trade.token.mint,
        ...(trade.token.symbol ? { symbol: trade.token.symbol } : {}),
        ...(trade.token.name ? { name: trade.token.name } : {}),
        ...(trade.token.imageUrl ? { imageUrl: trade.token.imageUrl } : {}),
        ...(trade.token.riskLevel ? { riskLevel: trade.token.riskLevel } : {}),
        firstSeenAt: trade.at,
      },
      traders: new Set<string>(),
    };
    entry.traders.add(trade.handle);
    byMint.set(trade.token.mint, entry);
  }
  return {
    tokens: [...byMint.values()].map((e) => e.token),
    traders: new Map([...byMint].map(([mint, e]) => [mint, e.traders.size])),
  };
}

/** The Discover data: a token list for the feed, plus stats for the window. */
export function useMarket(feed: Feed, windowMinutes: number) {
  const { token } = useSession();
  const list = useQuery({
    queryKey: [
      'feed',
      feed,
      feed === 'trending' ? windowMinutes : 0,
      feed === 'smart' ? token : null,
    ],
    queryFn: async (): Promise<{ tokens: MarketToken[]; traders?: Map<string, number> }> => {
      if (feed === 'new') return api.newTokens();
      if (feed === 'trending') return api.trending(windowMinutes);
      return smartMoney(token);
    },
    refetchInterval: REFRESH_MS,
  });
  const mints = (list.data?.tokens ?? []).slice(0, 50).map((t) => t.mint);
  const stats = useQuery({
    queryKey: ['token-stats', mints, windowMinutes],
    queryFn: () => api.stats(mints, windowMinutes),
    enabled: mints.length > 0,
    refetchInterval: REFRESH_MS,
    placeholderData: (previous) => previous,
  });
  const statsMap = new Map<string, TokenStats>(
    (stats.data?.stats ?? []).map((s) => [s.mint, s] as const),
  );
  return {
    list,
    stats,
    tokens: list.data?.tokens ?? [],
    statsMap,
    traders: list.data?.traders,
    updatedAt: Math.max(list.dataUpdatedAt, stats.dataUpdatedAt),
  };
}

/** Stats for one token (the token screen and the desktop panel). */
export function useTokenStats(mint: string, windowMinutes: number, enabled = true) {
  return useQuery({
    queryKey: ['token-stats', [mint], windowMinutes],
    queryFn: () => api.stats([mint], windowMinutes),
    enabled,
    refetchInterval: REFRESH_MS,
    select: (data) => data.stats[0],
  });
}
