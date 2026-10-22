import type { TradeQuote, TradeQuoteRequest } from '@sift/shared';
import { describe, expect, it } from 'vitest';
import { checkQuote } from './trade-check';

const request: TradeQuoteRequest = {
  mint: 'M',
  wallet: 'W',
  side: 'buy',
  amount: '20000000',
  slippageBps: 500,
};
const quote: TradeQuote = {
  quoteId: 'q',
  expiresAt: '2026-10-22T10:00:00Z',
  venue: 'pump.fun',
  mint: 'M',
  wallet: 'W',
  side: 'buy',
  slippageBps: 500,
  expectedLamports: 19_900_000,
  limitLamports: 20_895_000,
  tokenAmount: '1',
  tokenDecimals: 6,
  priceImpactPct: null,
  fees: {
    platformLamports: 100_000,
    platformBps: 50,
    priorityLamports: 1000,
    networkLamports: 5000,
    accountRentLamports: 0,
  },
  expectedTotalLamports: 20_006_000,
  worstCaseLamports: 21_001_000,
  transaction: 'AQID', // not a real transaction: verification adds its own problem
};

// These tests cover the request checks; transaction checks are tested in the shared package
// and against real built transactions in the API tests.
const requestProblems = (q: TradeQuote, r = request, fee: string | null = 'F') =>
  checkQuote(q, r, fee).filter((p) => !p.startsWith('unreadable') && !p.includes('transaction'));

describe('checkQuote', () => {
  it('refuses a quote whose numbers are not numbers, before doing any arithmetic', () => {
    const bad = { ...quote, limitLamports: '1e30', fees: { ...quote.fees, platformLamports: '5' } };
    expect(checkQuote(bad as unknown as TradeQuote, request, 'F').join('; ')).toMatch(
      /limitLamports is not a whole number.*platformLamports is not a whole number/,
    );
  });

  it('accepts a quote that matches the request', () => {
    expect(requestProblems(quote)).toEqual([]);
  });

  it.each<[string, Partial<TradeQuote>, string]>([
    ['token', { mint: 'X' }, 'different token'],
    ['wallet', { wallet: 'X' }, 'different wallet'],
    ['side', { side: 'sell' }, 'not a buy'],
    ['slippage', { slippageBps: 2000 }, 'slippage differs'],
    ['amount', { expectedLamports: 30_000_000 }, 'amount differs'],
  ])('flags a different %s', (_name, change, problem) => {
    expect(requestProblems({ ...quote, ...change } as TradeQuote).join()).toContain(problem);
  });

  it('checks the token amount of a sell', () => {
    const sell = { ...request, side: 'sell' as const, amount: '500' };
    expect(
      requestProblems({ ...quote, side: 'sell', tokenAmount: '500' } as TradeQuote, sell),
    ).toEqual([]);
    expect(
      requestProblems({ ...quote, side: 'sell', tokenAmount: '400' } as TradeQuote, sell).join(),
    ).toContain('different amount');
  });

  it('refuses a fee when the app has no fee wallet', () => {
    expect(requestProblems(quote, request, null).join()).toContain('unexpected platform fee');
  });

  it('refuses a transaction it cannot verify', () => {
    expect(checkQuote(quote, request, 'F').length).toBeGreaterThan(0);
  });
});
