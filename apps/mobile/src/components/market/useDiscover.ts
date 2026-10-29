import { router } from 'expo-router';
import { useState } from 'react';
import { type Feed, useMarket } from '../../lib/market-hooks';
import {
  DEFAULT_FILTERS,
  type MarketFilters,
  type SortKey,
  type SortState,
  applyFilters,
  nextSort,
  searchAddress,
  sortTokens,
} from '../../lib/market';

export const FEEDS: ReadonlyArray<{ value: Feed; label: string }> = [
  { value: 'trending', label: 'Trending' },
  { value: 'new', label: 'New pairs' },
  { value: 'smart', label: 'Smart money' },
];

/** Everything the Discover screens share: feed, window, search, filters, sort, selection. */
export function useDiscover() {
  const [feed, setFeed] = useState<Feed>('trending');
  const [windowMinutes, setWindowMinutes] = useState(60);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<MarketFilters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortState>({ key: 'default', direction: 'desc' });
  const [selected, setSelected] = useState<string | null>(null);
  const [now] = useState(Date.now);
  const market = useMarket(feed, windowMinutes);

  const filtered = applyFilters(market.tokens, { query, filters, stats: market.statsMap, now });
  const rows = sortTokens(filtered, sort, market.statsMap, now);
  const hiddenRed = filters.hideRed
    ? applyFilters(market.tokens, {
        query,
        filters: { ...filters, hideRed: false },
        stats: market.statsMap,
        now,
      }).filter((t) => t.riskLevel === 'red').length
    : 0;
  const address = searchAddress(query);

  return {
    feed,
    setFeed: (next: Feed) => {
      setFeed(next);
      setSort({ key: 'default', direction: 'desc' });
    },
    windowMinutes,
    setWindowMinutes,
    query,
    setQuery,
    filters,
    setFilters,
    sort,
    sortBy: (key: SortKey) => setSort((current) => nextSort(current, key)),
    sortMark: (key: SortKey) => (sort.key === key ? (sort.direction === 'desc' ? ' ↓' : ' ↑') : ''),
    market,
    rows,
    hiddenRed,
    showRed: () => setFilters((f) => ({ ...f, hideRed: false })),
    address: address && !rows.some((t) => t.mint === address) ? address : null,
    openAddress: () => {
      if (address) router.push(`/token/${address}`);
    },
    selected: selected ?? rows[0]?.mint ?? null,
    select: setSelected,
    noteFor: (mint: string) => {
      const count = market.traders?.get(mint);
      return count ? `${count} smart ${count === 1 ? 'trader' : 'traders'}` : undefined;
    },
  };
}

export type DiscoverState = ReturnType<typeof useDiscover>;

export function emptyMessage(state: DiscoverState): string {
  if (state.query) return 'No tokens match your search. Paste a full token address to open it.';
  if (state.market.tokens.length > 0)
    return state.hiddenRed > 0
      ? 'Only red-flagged tokens match. Tap Show above to see them.'
      : 'No tokens match these filters.';
  if (state.feed === 'smart')
    return 'No smart money activity yet. This shows tokens bought by the leaderboard’s top traders and the people you follow.';
  return 'No tokens yet. New launches appear here within seconds.';
}
