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
const quote = {
  mint: 'M',
  wallet: 'W',
  side: 'buy',
  slippageBps: 500,
  expectedLamports: 19_900_000,
  tokenAmount: '1',
  fees: { platformLamports: 100_000 },
  transaction: 'AQID', // not a real transaction: verification adds its own problem
} as unknown as TradeQuote;

// These tests cover the request checks; transaction checks are tested in the shared package
// and against real built transactions in the API tests.
const requestProblems = (q: TradeQuote, r = request, fee: string | null = 'F') =>
  checkQuote(q, r, fee).filter((p) => !p.startsWith('unreadable') && !p.includes('transaction'));

describe('checkQuote', () => {
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
