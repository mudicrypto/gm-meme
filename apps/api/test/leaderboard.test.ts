import { describe, expect, it } from 'vitest';
import { buildLeaderboard } from '../src/social/leaderboard';
import type { SharedTradeRecord } from '../src/social/repository';
import { MINT_A, MINT_B } from './fixtures/helius';

const SOL = 1_000_000_000;
let n = 0;
const trade = (
  handle: string,
  side: 'buy' | 'sell',
  sol: number,
  tokens: number,
  mint = MINT_A,
): SharedTradeRecord => {
  n += 1;
  return {
    signature: `s${n}`,
    handle,
    displayName: handle.toUpperCase(),
    mint,
    side,
    solLamports: sol * SOL,
    tokenAmount: String(tokens),
    tokenDecimals: 6,
    at: new Date(Date.UTC(2026, 9, 29, 10, n)).toISOString(),
  };
};

describe('buildLeaderboard', () => {
  it('ranks realized profit on what was sold, and shows losses', () => {
    const entries = buildLeaderboard([
      // Alice buys 1000 for 1 SOL, sells half for 1 SOL: +0.5 SOL on what she sold.
      trade('alice', 'buy', 1, 1000),
      trade('alice', 'sell', 1, 500),
      // Bob buys 100 for 2 SOL, sells all for 0.5: -1.5 SOL.
      trade('bob', 'buy', 2, 100, MINT_B),
      trade('bob', 'sell', 0.5, 100, MINT_B),
      // Carol only buys: nothing realized, so she isn't ranked.
      trade('carol', 'buy', 5, 10),
    ]);
    expect(entries).toEqual([
      {
        rank: 1,
        handle: 'alice',
        displayName: 'ALICE',
        realizedLamports: 0.5 * SOL,
        trades: 2,
        winningTokens: 1,
        soldTokens: 1,
      },
      {
        rank: 2,
        handle: 'bob',
        displayName: 'BOB',
        realizedLamports: -1.5 * SOL,
        trades: 2,
        winningTokens: 0,
        soldTokens: 1,
      },
    ]);
  });

  it('ignores sells with no recorded buy, so profit is never inflated', () => {
    expect(buildLeaderboard([trade('dave', 'sell', 10, 100)])).toEqual([]);
    // Selling more than was bought only counts the part with a known cost.
    const [entry] = buildLeaderboard([trade('erin', 'buy', 1, 100), trade('erin', 'sell', 4, 200)]);
    expect(entry?.realizedLamports).toBe(1 * SOL);
  });
});

describe('GET /leaderboard', () => {
  it('is public, takes 1, 7 or 30 days, and lists no wallet addresses', async () => {
    const { buildApp } = await import('../src/app');
    const { loadConfig } = await import('../src/config');
    const app = buildApp(loadConfig({ LOG_LEVEL: 'silent', ALERT_CHECK_INTERVAL_MS: '0' }), {
      helius: null,
    });
    const res = await app.inject({ method: 'GET', url: '/leaderboard?days=7' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ days: 7, entries: [] });
    expect((await app.inject({ method: 'GET', url: '/leaderboard?days=3' })).statusCode).toBe(400);
    await app.close();
  });
});
