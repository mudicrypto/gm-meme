import { describe, expect, it } from 'vitest';
import {
  formatAge,
  formatCompact,
  formatPct,
  formatSol,
  formatSolPrice,
  priceChangePct,
  shortAddress,
} from './format';

describe('formatSolPrice', () => {
  it.each([
    [2.8e-8, '0.0₇28'],
    [1.234e-5, '0.0₄12'],
    [9.99e-8, '0.0₆1'],
    [0.000123, '0.000123'],
    [0.5, '0.5'],
    [12.345, '12.35'],
    [2500, '2500'],
    [0, '–'],
    [Number.NaN, '–'],
  ])('%s → %s', (price, text) => {
    expect(formatSolPrice(price)).toBe(text);
  });
});

describe('number formatting', () => {
  it('compacts large numbers', () => {
    expect(formatCompact(1234)).toBe('1.2K');
    expect(formatCompact(3_400_000)).toBe('3.4M');
    expect(formatCompact(1_000_000_000)).toBe('1B');
    expect(formatCompact(3.14159)).toBe('3.14');
    expect(formatCompact(42.25)).toBe('42.3');
  });

  it('formats SOL amounts', () => {
    expect(formatSol(0)).toBe('0 SOL');
    expect(formatSol(0.004)).toBe('<0.01 SOL');
    expect(formatSol(3.14159)).toBe('3.14 SOL');
    expect(formatSol(12_500)).toBe('12.5K SOL');
  });

  it('formats percentages with a sign', () => {
    expect(formatPct(12.345)).toBe('+12.3%');
    expect(formatPct(-4)).toBe('-4.0%');
    expect(formatPct(250)).toBe('+250%');
  });
});

describe('formatAge', () => {
  const now = new Date('2026-10-19T12:00:00Z');
  it.each([
    ['2026-10-19T11:59:30Z', 'just now'],
    ['2026-10-19T11:55:00Z', '5m'],
    ['2026-10-19T09:00:00Z', '3h'],
    ['2026-10-17T12:00:00Z', '2d'],
    [undefined, '–'],
  ])('%s → %s', (iso, text) => {
    expect(formatAge(iso, now)).toBe(text);
  });
});

describe('helpers', () => {
  it('shortens addresses', () => {
    expect(shortAddress('GEtph2tD2kxEKFJqwKYBa8hua8mQDQ3ttsGxhAQziUT5')).toBe('GEtp…iUT5');
    expect(shortAddress('short')).toBe('short');
  });

  it('computes price change over a series', () => {
    expect(priceChangePct([{ priceSol: 2 }, { priceSol: 3 }])).toBe(50);
    expect(priceChangePct([{ priceSol: 2 }])).toBeUndefined();
    expect(priceChangePct([])).toBeUndefined();
  });
});
