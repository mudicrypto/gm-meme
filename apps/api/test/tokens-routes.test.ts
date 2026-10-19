import type { TokenListResponse, TrendingResponse } from '@sift/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { InMemoryTokenRepository } from '../src/tokens/memory-repository';
import type { TokenRepository } from '../src/tokens/repository';
import { ALICE, BOB, MINT_A, MINT_B } from './fixtures/helius';

const NOW = new Date('2026-10-19T12:00:00Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

describe('token routes', () => {
  const repository = new InMemoryTokenRepository(() => NOW);
  const app = buildApp(loadConfig({ LOG_LEVEL: 'silent' }), {
    tokenRepository: repository,
    helius: null,
    now: () => NOW,
  });

  beforeAll(async () => {
    await repository.upsertTokens([
      { mint: MINT_A, symbol: 'AAA', launchedAt: minutesAgo(90) },
      { mint: MINT_B, symbol: 'BBB', launchedAt: minutesAgo(10) },
    ]);
    await repository.recordSwaps([
      { signature: 's1', mint: MINT_A, trader: ALICE, volumeSol: 1, blockTime: minutesAgo(30) },
      { signature: 's2', mint: MINT_A, trader: BOB, volumeSol: 1, blockTime: minutesAgo(20) },
      { signature: 's3', mint: MINT_B, trader: ALICE, volumeSol: 5, blockTime: minutesAgo(5) },
    ]);
  });
  afterAll(() => app.close());

  it('GET /tokens/new lists newest launches first', async () => {
    const res = await app.inject({ method: 'GET', url: '/tokens/new' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=5');
    const body = res.json<TokenListResponse>();
    expect(body.tokens.map((t) => t.symbol)).toEqual(['BBB', 'AAA']);
  });

  it('GET /tokens/new respects limit', async () => {
    const res = await app.inject({ method: 'GET', url: '/tokens/new?limit=1' });
    expect(res.json<TokenListResponse>().tokens).toHaveLength(1);
  });

  it('GET /tokens/trending ranks by distinct traders in the default 60 minute window', async () => {
    const res = await app.inject({ method: 'GET', url: '/tokens/trending' });
    expect(res.statusCode).toBe(200);
    const body = res.json<TrendingResponse>();
    expect(body.windowMinutes).toBe(60);
    expect(body.tokens).toMatchObject([
      { mint: MINT_A, uniqueTraders: 2, swapCount: 2, volumeSol: 2 },
      { mint: MINT_B, uniqueTraders: 1, swapCount: 1, volumeSol: 5 },
    ]);
  });

  it('GET /tokens/trending narrows to the requested window', async () => {
    const res = await app.inject({ method: 'GET', url: '/tokens/trending?windowMinutes=15' });
    expect(res.json<TrendingResponse>().tokens.map((t) => t.mint)).toEqual([MINT_B]);
  });

  it.each([
    '/tokens/new?limit=0',
    '/tokens/new?limit=101',
    '/tokens/new?limit=abc',
    '/tokens/trending?windowMinutes=1',
    '/tokens/trending?windowMinutes=99999',
  ])('rejects bad query %s with 400', async (url) => {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'Bad Request' });
  });

  it('hides internal errors behind a generic 500', async () => {
    class FailingRepository extends InMemoryTokenRepository {
      override async listNew(): Promise<never> {
        throw new Error('Supabase new_tokens failed: password authentication failed');
      }
    }
    const failing: TokenRepository = new FailingRepository();
    const broken = buildApp(loadConfig({ LOG_LEVEL: 'silent' }), {
      tokenRepository: failing,
      helius: null,
    });
    const res = await broken.inject({ method: 'GET', url: '/tokens/new' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'Internal Server Error' });
    await broken.close();
  });
});
