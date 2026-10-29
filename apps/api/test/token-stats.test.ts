import type { TokenActivityResponse, TokenStatsResponse } from '@sift/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { buildStats } from '../src/tokens/chart';
import { InMemoryTokenRepository } from '../src/tokens/memory-repository';
import { ALICE, BOB, MINT_A, MINT_B } from './fixtures/helius';

const since = new Date('2026-10-29T11:00:00Z');
const now = new Date('2026-10-29T12:00:00Z');
const trade = (minute: number, priceSol: number, side: 'buy' | 'sell' = 'buy', volumeSol = 1) => ({
  blockTime: new Date(since.getTime() + minute * 60_000).toISOString(),
  side,
  priceSol,
  volumeSol,
});

describe('buildStats', () => {
  it('measures change, volume and sides, with a gap-filled sparkline', () => {
    const stats = buildStats(MINT_A, [trade(1, 1), trade(20, 2, 'sell'), trade(50, 1.5)], {
      since,
      now,
      buckets: 6,
      supply: 1000,
    });
    expect(stats).toEqual({
      mint: MINT_A,
      priceSol: 1.5,
      changePct: 50,
      volumeSol: 3,
      buys: 2,
      sells: 1,
      sparkline: [1, 1, 2, 2, 2, 1.5],
      marketCapSol: 1500,
    });
  });

  it('leaves out what it can’t know', () => {
    expect(buildStats(MINT_A, [], { since, now, buckets: 6 })).toEqual({
      mint: MINT_A,
      volumeSol: 0,
      buys: 0,
      sells: 0,
      sparkline: [],
    });
    const one = buildStats(MINT_A, [trade(5, 2)], { since, now, buckets: 6 });
    expect(one.changePct).toBeUndefined();
    expect(one.marketCapSol).toBeUndefined();
  });
});

describe('token stats and activity routes', () => {
  const repository = new InMemoryTokenRepository(() => now);
  const app = buildApp(loadConfig({ LOG_LEVEL: 'silent', ALERT_CHECK_INTERVAL_MS: '0' }), {
    tokenRepository: repository,
    helius: null,
    now: () => now,
  });
  afterAll(() => app.close());

  it('returns stats for many tokens and the latest trades of one', async () => {
    await repository.upsertTokens([
      { mint: MINT_A, supply: 1_000_000_000_000, decimals: 6 },
      { mint: MINT_B },
    ]);
    await repository.recordSwaps([
      {
        signature: 's1',
        mint: MINT_A,
        trader: ALICE,
        volumeSol: 1,
        tokenAmount: 1000,
        side: 'buy',
        blockTime: '2026-10-29T11:10:00Z',
      },
      {
        signature: 's2',
        mint: MINT_A,
        trader: BOB,
        volumeSol: 3,
        tokenAmount: 1000,
        side: 'sell',
        blockTime: '2026-10-29T11:40:00Z',
      },
    ]);
    const res = await app.inject({
      method: 'GET',
      url: `/tokens/stats?mints=${MINT_A},${MINT_B},${MINT_A}&windowMinutes=60`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<TokenStatsResponse>();
    expect(body.stats).toHaveLength(2);
    expect(body.stats[0]).toMatchObject({
      mint: MINT_A,
      priceSol: 0.003,
      changePct: 200,
      volumeSol: 4,
      buys: 1,
      sells: 1,
      marketCapSol: 3000,
    });
    expect(body.stats[1]).toMatchObject({ mint: MINT_B, volumeSol: 0, sparkline: [] });

    const activity = await app.inject({ method: 'GET', url: `/tokens/${MINT_A}/activity` });
    expect(activity.json<TokenActivityResponse>().trades.map((t) => t.side)).toEqual([
      'sell',
      'buy',
    ]);
    expect(activity.json<TokenActivityResponse>().trades[0]).toMatchObject({
      priceSol: 0.003,
      volumeSol: 3,
      tokenAmount: 1000,
    });
  });

  it('refuses bad input', async () => {
    expect((await app.inject({ method: 'GET', url: '/tokens/stats?mints=nope' })).statusCode).toBe(
      400,
    );
    const many = Array.from({ length: 51 }, () => MINT_A).join(',');
    // Duplicates collapse, so 51 copies of one mint is fine; 51 distinct would not be.
    expect(
      (await app.inject({ method: 'GET', url: `/tokens/stats?mints=${many}` })).statusCode,
    ).toBe(200);
  });
});
