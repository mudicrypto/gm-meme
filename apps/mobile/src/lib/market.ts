import {
  type RiskLevel,
  type TokenStats,
  type TokenSummary,
  type TrendingToken,
  isSolanaAddress,
} from '@sift/shared';

export type MarketToken = TokenSummary | TrendingToken;

/** Time windows for the lists and charts, in minutes. */
export const LIST_WINDOWS = [
  { label: '5m', minutes: 5 },
  { label: '1h', minutes: 60 },
  { label: '6h', minutes: 360 },
  { label: '24h', minutes: 1440 },
] as const;

export const CHART_WINDOWS = [
  { label: '5m', minutes: 5 },
  { label: '15m', minutes: 15 },
  { label: '1h', minutes: 60 },
  { label: '4h', minutes: 240 },
  { label: '1d', minutes: 1440 },
] as const;

export interface MarketFilters {
  /** Safety filter: hide tokens rated red. */
  hideRed: boolean;
  /** Only these risk levels (empty: all). "unknown" is a token not checked yet. */
  levels: ReadonlyArray<RiskLevel | 'unknown'>;
  /** Minimum volume in the window, SOL. */
  minVolumeSol: number;
  /** Launched at most this many minutes ago (0: any age). */
  maxAgeMinutes: number;
}

export const DEFAULT_FILTERS: MarketFilters = {
  hideRed: true,
  levels: [],
  minVolumeSol: 0,
  maxAgeMinutes: 0,
};

/** How many filters differ from the defaults (for the Filters button badge). */
export function activeFilterCount(filters: MarketFilters): number {
  return (
    (filters.hideRed ? 0 : 1) +
    (filters.levels.length > 0 ? 1 : 0) +
    (filters.minVolumeSol > 0 ? 1 : 0) +
    (filters.maxAgeMinutes > 0 ? 1 : 0)
  );
}

const LEVEL_NAMES: Record<RiskLevel | 'unknown', string> = {
  green: 'No red flags',
  amber: 'Caution',
  red: 'Risky',
  unknown: 'Not checked',
};

function ageLabel(minutes: number): string {
  return minutes < 60 ? `${minutes}m` : `${minutes / 60}h`;
}

/**
 * The active filters as removable chips: each has a label and the filters without it.
 * Turning the safety filter off is shown too, since red tokens then appear.
 */
export function filterChips(
  filters: MarketFilters,
): Array<{ key: string; label: string; without: MarketFilters }> {
  const chips: Array<{ key: string; label: string; without: MarketFilters }> = [];
  if (!filters.hideRed)
    chips.push({ key: 'red', label: 'Showing red tokens', without: { ...filters, hideRed: true } });
  for (const level of filters.levels)
    chips.push({
      key: `level-${level}`,
      label: `Risk: ${LEVEL_NAMES[level]}`,
      without: { ...filters, levels: filters.levels.filter((l) => l !== level) },
    });
  if (filters.minVolumeSol > 0)
    chips.push({
      key: 'volume',
      label: `Volume ≥ ${filters.minVolumeSol} SOL`,
      without: { ...filters, minVolumeSol: 0 },
    });
  if (filters.maxAgeMinutes > 0)
    chips.push({
      key: 'age',
      label: `Age < ${ageLabel(filters.maxAgeMinutes)}`,
      without: { ...filters, maxAgeMinutes: 0 },
    });
  return chips;
}

export type SortKey = 'default' | 'price' | 'change' | 'volume' | 'marketCap' | 'age';

export interface SortState {
  key: SortKey;
  direction: 'asc' | 'desc';
}

function ageMinutes(token: MarketToken, now: number): number {
  const at = Date.parse(token.launchedAt ?? token.firstSeenAt);
  return Number.isFinite(at) ? (now - at) / 60_000 : Number.POSITIVE_INFINITY;
}

/** Search by name, symbol or address prefix (case-insensitive). */
export function matchesSearch(token: MarketToken, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    token.mint.toLowerCase().startsWith(q) ||
    (token.symbol?.toLowerCase().includes(q.replace(/^\$/, '')) ?? false) ||
    (token.name?.toLowerCase().includes(q) ?? false)
  );
}

/** A full token address typed into search: offer to open it directly. */
export function searchAddress(query: string): string | null {
  const q = query.trim();
  return isSolanaAddress(q) ? q : null;
}

export function applyFilters(
  tokens: readonly MarketToken[],
  options: {
    query: string;
    filters: MarketFilters;
    stats: ReadonlyMap<string, TokenStats>;
    now: number;
  },
): MarketToken[] {
  const { filters } = options;
  return tokens.filter((token) => {
    if (!matchesSearch(token, options.query)) return false;
    const level = token.riskLevel ?? 'unknown';
    if (filters.hideRed && level === 'red') return false;
    if (filters.levels.length > 0 && !filters.levels.includes(level)) return false;
    if (filters.minVolumeSol > 0) {
      const volume = options.stats.get(token.mint)?.volumeSol ?? 0;
      if (volume < filters.minVolumeSol) return false;
    }
    if (filters.maxAgeMinutes > 0 && ageMinutes(token, options.now) > filters.maxAgeMinutes)
      return false;
    return true;
  });
}

function sortValue(
  token: MarketToken,
  key: SortKey,
  stats: ReadonlyMap<string, TokenStats>,
  now: number,
): number | undefined {
  const s = stats.get(token.mint);
  switch (key) {
    case 'price':
      return s?.priceSol;
    case 'change':
      return s?.changePct;
    case 'volume':
      return s?.volumeSol;
    case 'marketCap':
      return s?.marketCapSol;
    case 'age':
      return ageMinutes(token, now);
    case 'default':
      return undefined;
  }
}

/** Sort by a column; tokens without a value for it go last, whatever the direction. */
export function sortTokens(
  tokens: readonly MarketToken[],
  sort: SortState,
  stats: ReadonlyMap<string, TokenStats>,
  now: number,
): MarketToken[] {
  if (sort.key === 'default') return [...tokens];
  const sign = sort.direction === 'asc' ? 1 : -1;
  return [...tokens]
    .map((token, index) => ({ token, index, value: sortValue(token, sort.key, stats, now) }))
    .sort((a, b) => {
      if (a.value === undefined && b.value === undefined) return a.index - b.index;
      if (a.value === undefined) return 1;
      if (b.value === undefined) return -1;
      return (a.value - b.value) * sign || a.index - b.index;
    })
    .map((entry) => entry.token);
}

/** Next sort state when a column header is pressed: desc, then asc, then back to default. */
export function nextSort(current: SortState, key: SortKey): SortState {
  if (current.key !== key) return { key, direction: 'desc' };
  if (current.direction === 'desc') return { key, direction: 'asc' };
  return { key: 'default', direction: 'desc' };
}

/** "+12.4%" / "−5.1%": the sign always shows, so change never relies on colour alone. */
export function formatChange(pct: number | undefined): string {
  if (pct === undefined || !Number.isFinite(pct)) return '–';
  const rounded = Math.abs(pct) >= 1000 ? Math.round(pct) : Number(pct.toFixed(1));
  if (rounded === 0) return '0.0%';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
}

/** Whether data is old enough to say so (the lists refresh every 15 seconds). */
export function isStale(updatedAt: number, now: number, maxAgeMs = 60_000): boolean {
  return updatedAt > 0 && now - updatedAt > maxAgeMs;
}
