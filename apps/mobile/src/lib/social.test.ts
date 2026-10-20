import type { SharedTrade } from '@sift/shared';
import { describe, expect, it } from 'vitest';
import {
  describeAlert,
  describeTrade,
  normalizeHandle,
  parsePriceSol,
  suggestedAlertPrice,
  tokenLabel,
} from './social';

const MINT = 'E8NT2qghrktonV3RSSAc9nRmhhNxganaFo7ZWZpAFdCf';
const trade = (overrides: Partial<SharedTrade> = {}): SharedTrade => ({
  signature: 's',
  handle: 'alice',
  displayName: 'Alice',
  side: 'buy',
  solLamports: 50_000_000,
  tokenAmount: '1234567000000',
  tokenDecimals: 6,
  token: { mint: MINT, symbol: 'AAA' },
  at: '2026-10-20T10:00:00Z',
  ...overrides,
});

describe('social formatting', () => {
  it('describes trades in plain words', () => {
    expect(describeTrade(trade())).toBe('bought 1.2M AAA for 0.05 SOL');
    // No symbol or name: the shortened mint.
    expect(describeTrade(trade({ side: 'sell', token: { mint: MINT } }))).toBe(
      'sold 1.2M E8NT…FdCf for 0.05 SOL',
    );
    expect(tokenLabel({ mint: MINT, name: 'Token' })).toBe('Token');
  });

  it('describes alerts', () => {
    expect(describeAlert({ direction: 'above', priceSol: 0.002 })).toBe('Above 0.002 SOL');
    expect(describeAlert({ direction: 'below', priceSol: 0.000000028 })).toBe('Below 0.0₇28 SOL');
  });

  it('parses typed prices, refusing anything else', () => {
    expect(parsePriceSol('0.000002')).toBe(0.000002);
    expect(parsePriceSol('2e-6')).toBe(0.000002);
    expect(parsePriceSol('0,5')).toBe(0.5);
    expect(parsePriceSol('.5')).toBe(0.5);
    for (const bad of ['', '0', '-1', 'abc', '1.2.3', 'Infinity', '1e999']) {
      expect(parsePriceSol(bad)).toBeNull();
    }
  });

  it('normalizes handles like the API', () => {
    expect(normalizeHandle(' @Alice_1 ')).toEqual({ handle: 'alice_1' });
    expect(normalizeHandle('al')).toHaveProperty('error');
    expect(normalizeHandle('al ice')).toHaveProperty('error');
  });

  it('suggests a round alert price either side of the current one', () => {
    expect(suggestedAlertPrice(0.0000123, 'above')).toBe('0.000025');
    expect(suggestedAlertPrice(0.0000123, 'below')).toBe('0.0000062');
  });
});
