import type { TradeQuote } from '@sift/shared';
import { describe, expect, it } from 'vitest';
import { costLines, secondsLeft } from './costs';

const buy: TradeQuote = {
  quoteId: 'q',
  transaction: '',
  expiresAt: '2026-10-20T10:01:15Z',
  side: 'buy',
  mint: 'm',
  wallet: 'w',
  venue: 'pump.fun',
  tokenAmount: '65974660671019',
  tokenDecimals: 6,
  expectedLamports: 19_900_000,
  limitLamports: 20_895_000,
  slippageBps: 500,
  priceImpactPct: 7.88,
  fees: {
    platformLamports: 100_000,
    platformBps: 50,
    priorityLamports: 5155,
    networkLamports: 5000,
    accountRentLamports: 1_513_840,
  },
  expectedTotalLamports: 21_523_995,
  worstCaseLamports: 22_518_995,
};

describe('costLines', () => {
  it('lists every cost of a buy, totals and worst case', () => {
    expect(costLines(buy).map((l) => [l.label, l.value])).toEqual([
      ['Spent on tokens', '0.0199 SOL'],
      ['Sift fee (0.5%)', '0.0001 SOL'],
      ['Priority fee', '0.000006 SOL'],
      ['Network fee', '0.000005 SOL'],
      ['New accounts (one-off)', '0.0016 SOL'],
      ['Expected total', '0.0216 SOL'],
      ['Most you can pay (5% slippage)', '0.0226 SOL'],
    ]);
  });

  it('shows a sell as proceeds and a minimum received, without account rent', () => {
    const sell: TradeQuote = {
      ...buy,
      side: 'sell',
      fees: { ...buy.fees, accountRentLamports: 0 },
      expectedLamports: 14_446_674,
      expectedTotalLamports: 14_369_619,
      worstCaseLamports: 13_647_286,
    };
    const labels = costLines(sell).map((l) => l.label);
    expect(labels).toContain('Sale proceeds');
    expect(labels).toContain('Minimum received (5% slippage)');
    expect(labels).not.toContain('New accounts (one-off)');
    expect(costLines(sell).find((l) => l.label === 'Expected to receive')?.value).toBe(
      '0.0144 SOL',
    );
  });
});

describe('secondsLeft', () => {
  it('counts down and stops at zero', () => {
    expect(secondsLeft(buy, new Date('2026-10-20T10:00:00Z'))).toBe(75);
    expect(secondsLeft(buy, new Date('2026-10-20T10:05:00Z'))).toBe(0);
  });
});
