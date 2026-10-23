import type { TokenListResponse, TrendingResponse } from '@sift/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { InMemoryTokenRepository } from '../src/tokens/memory-repository';
import { ALICE, BOB, DEV, MINT_A, T0, buyTx, createTx } from './fixtures/helius';
import { fakeHelius } from './helpers/fake-helius';

const SECRET = 'a-long-random-webhook-secret-for-tests';
const NOW = new Date((T0 + 300) * 1000);

describe('POST /webhooks/helius', () => {
  const helius = fakeHelius({ [MINT_A]: { name: 'Doge Moon', symbol: 'DMOON' } });
  const app = buildApp(loadConfig({ LOG_LEVEL: 'silent', HELIUS_WEBHOOK_SECRET: SECRET }), {
    tokenRepository: new InMemoryTokenRepository(() => NOW),
    helius,
    now: () => NOW,
  });
  afterAll(() => app.close());

  const post = (payload: unknown, authorization?: string) =>
    app.inject({
      method: 'POST',
      url: '/webhooks/helius',
      headers: authorization ? { authorization } : {},
      payload: payload as object,
    });

  it('rejects deliveries without the secret', async () => {
    expect((await post([createTx(MINT_A, DEV, T0)])).statusCode).toBe(401);
    expect((await post([createTx(MINT_A, DEV, T0)], 'wrong')).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/tokens/new' })).json()).toEqual({
      tokens: [],
    });
  });

  it('rejects an unauthenticated delivery before reading its body', async () => {
    // Malformed JSON would be a 400 if the body were parsed first.
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/helius',
      headers: { 'content-type': 'application/json' },
      payload: '{not json',
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a body that is not an array of transactions', async () => {
    expect((await post({ signature: 'x' }, SECRET)).statusCode).toBe(400);
    expect(
      (
        await post(
          Array.from({ length: 1001 }, () => ({})),
          SECRET,
        )
      ).statusCode,
    ).toBe(400);
  });

  it('ingests a delivery and serves it from the feeds', async () => {
    const res = await post(
      [createTx(MINT_A, DEV, T0), buyTx(MINT_A, ALICE, 1, T0 + 30), buyTx(MINT_A, BOB, 2, T0 + 60)],
      SECRET,
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, launches: 1, swaps: 2, enriched: 1, invalid: 0 });

    const fresh = await app.inject({ method: 'GET', url: '/tokens/new' });
    expect(fresh.json<TokenListResponse>().tokens).toMatchObject([
      { mint: MINT_A, symbol: 'DMOON', name: 'Doge Moon' },
    ]);

    const trending = await app.inject({ method: 'GET', url: '/tokens/trending' });
    expect(trending.json<TrendingResponse>().tokens).toMatchObject([
      { mint: MINT_A, uniqueTraders: 2, volumeSol: 3 },
    ]);
  });
});

describe('webhook route without a secret configured', () => {
  it('is not registered at all', async () => {
    const app = buildApp(loadConfig({ LOG_LEVEL: 'silent' }), { helius: null });
    const res = await app.inject({ method: 'POST', url: '/webhooks/helius', payload: [] });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
