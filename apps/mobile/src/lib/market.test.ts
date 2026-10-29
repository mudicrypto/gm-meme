import type { TokenStats, TokenSummary } from '@sift/shared';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  applyFilters,
  formatChange,
  isStale,
  matchesSearch,
  nextSort,
  searchAddress,
  sortTokens,
} from './market';

const NOW = Date.parse('2026-10-29T12:00:00Z');
const token = (mint: string, extra: Partial<TokenSummary> = {}): TokenSummary => ({
  mint,
  firstSeenAt: '2026-10-29T11:00:00Z',
  ...extra,
});
const A = 'So11111111111111111111111111111111111111112';
const B = 'E8NT2qghrktonV3RSSAc9nRmhhNxganaFo7ZWZpAFdCf';
const C = '9CLJ4D5qCmLiYaWEFULecHPwfpW5KDAWRtpFygBmkwaY';
const stats = new Map<string, TokenStats>([
  [A, { mint: A, priceSol: 2, changePct: 10, volumeSol: 5, buys: 1, sells: 0, sparkline: [] }],
  [B, { mint: B, priceSol: 1, changePct: -3, volumeSol: 1, buys: 0, sells: 1, sparkline: [] }],
]);
const list = [
  token(A, { name: 'Moon Cat', symbol: 'MOON', riskLevel: 'green' }),
  token(B, { name: 'Rug', symbol: 'RUG', riskLevel: 'red', launchedAt: '2026-10-29T11:55:00Z' }),
  token(C, { symbol: 'NEW' }),
];

describe('search', () => {
  it('matches name, symbol (with or without $) and address prefix', () => {
    expect(matchesSearch(list[0]!, 'moon')).toBe(true);
    expect(matchesSearch(list[0]!, '$moo')).toBe(true);
    expect(matchesSearch(list[0]!, 'So111')).toBe(true);
    expect(matchesSearch(list[0]!, 'xyz')).toBe(false);
    expect(searchAddress(` ${C} `)).toBe(C);
    expect(searchAddress('moon')).toBeNull();
  });
});

describe('applyFilters', () => {
  it('hides red tokens by default, and filters by level, volume and age', () => {
    const base = { query: '', stats, now: NOW };
    expect(applyFilters(list, { ...base, filters: DEFAULT_FILTERS }).map((t) => t.mint)).toEqual([
      A,
      C,
    ]);
    const all = { ...DEFAULT_FILTERS, hideRed: false };
    expect(applyFilters(list, { ...base, filters: { ...all, levels: ['unknown'] } })).toHaveLength(
      1,
    );
    expect(
      applyFilters(list, { ...base, filters: { ...all, minVolumeSol: 2 } }).map((t) => t.mint),
    ).toEqual([A]);
    expect(
      applyFilters(list, { ...base, filters: { ...all, maxAgeMinutes: 10 } }).map((t) => t.mint),
    ).toEqual([B]);
    expect(activeFilterCount({ ...all, minVolumeSol: 2 })).toBe(2);
  });
});

describe('sorting', () => {
  it('sorts by a column with missing values last', () => {
    const desc = sortTokens(list, { key: 'change', direction: 'desc' }, stats, NOW);
    expect(desc.map((t) => t.mint)).toEqual([A, B, C]);
    const asc = sortTokens(list, { key: 'change', direction: 'asc' }, stats, NOW);
    expect(asc.map((t) => t.mint)).toEqual([B, A, C]);
  });

  it('cycles desc, asc, default', () => {
    let s = nextSort({ key: 'default', direction: 'desc' }, 'volume');
    expect(s).toEqual({ key: 'volume', direction: 'desc' });
    s = nextSort(s, 'volume');
    expect(s).toEqual({ key: 'volume', direction: 'asc' });
    expect(nextSort(s, 'volume').key).toBe('default');
  });
});

describe('formatChange and isStale', () => {
  it('always shows the sign', () => {
    expect(formatChange(12.44)).toBe('+12.4%');
    expect(formatChange(-5.1)).toBe('−5.1%');
    expect(formatChange(0.01)).toBe('0.0%');
    expect(formatChange(undefined)).toBe('–');
    expect(formatChange(12345)).toBe('+12,345%');
  });

  it('flags data older than a minute', () => {
    expect(isStale(NOW - 61_000, NOW)).toBe(true);
    expect(isStale(NOW - 5_000, NOW)).toBe(false);
    expect(isStale(0, NOW)).toBe(false);
  });
});
