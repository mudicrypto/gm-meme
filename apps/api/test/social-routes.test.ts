import { base58Encode, solanaKeys } from '@sift/shared';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { checkPriceAlerts } from '../src/social/alerts';
import { InMemorySocialRepository } from '../src/social/memory-repository';
import type { PushSender } from '../src/social/push';
import { InMemoryTokenRepository } from '../src/tokens/memory-repository';
import { MINT_A, MINT_B } from './fixtures/helius';

const NOW = new Date('2026-10-20T10:00:00Z');

function person() {
  const seed = crypto.getRandomValues(new Uint8Array(32));
  return { seed, wallet: solanaKeys.publicKey(seed) };
}

function setup() {
  const social = new InMemorySocialRepository();
  const tokens = new InMemoryTokenRepository();
  const push: PushSender & { send: ReturnType<typeof vi.fn> } = {
    send: vi.fn(async () => []),
  };
  const app = buildApp(loadConfig({ LOG_LEVEL: 'silent', ALERT_CHECK_INTERVAL_MS: '0' }), {
    tokenRepository: tokens,
    socialRepository: social,
    push,
    helius: null,
    now: () => NOW,
  });
  return { app, social, tokens, push };
}

type App = ReturnType<typeof setup>['app'];

async function signIn(app: App, who: ReturnType<typeof person>): Promise<string> {
  const challenge = await app.inject({
    method: 'POST',
    url: '/auth/challenge',
    payload: { wallet: who.wallet },
  });
  const { message, nonce } = challenge.json<{ message: string; nonce: string }>();
  const signature = solanaKeys.sign(new TextEncoder().encode(message), who.seed);
  const session = await app.inject({
    method: 'POST',
    url: '/auth/session',
    payload: { wallet: who.wallet, nonce, signature: base58Encode(signature) },
  });
  expect(session.statusCode).toBe(200);
  return session.json<{ token: string }>().token;
}

const as = (token: string) => ({ authorization: `Bearer ${token}` });

describe('sign in with a wallet', () => {
  const { app } = setup();
  afterAll(() => app.close());

  it('issues a plain-text challenge and a session for a valid signature', async () => {
    const alice = person();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/challenge',
      payload: { wallet: alice.wallet },
    });
    const { message } = res.json<{ message: string }>();
    expect(message).toContain(alice.wallet);
    expect(message).toContain('does not move funds');
    const token = await signIn(app, alice);
    const me = await app.inject({ method: 'GET', url: '/me', headers: as(token) });
    expect(me.json()).toEqual({ wallet: alice.wallet, profile: null });
    expect(me.headers['cache-control']).toBe('no-store');
  });

  it('refuses a signature from another wallet, and challenges are single-use', async () => {
    const alice = person();
    const mallory = person();
    const { message, nonce } = (
      await app.inject({
        method: 'POST',
        url: '/auth/challenge',
        payload: { wallet: alice.wallet },
      })
    ).json<{ message: string; nonce: string }>();
    const forged = solanaKeys.sign(new TextEncoder().encode(message), mallory.seed);
    const attempt = (signature: Uint8Array) =>
      app.inject({
        method: 'POST',
        url: '/auth/session',
        payload: { wallet: alice.wallet, nonce, signature: base58Encode(signature) },
      });
    expect((await attempt(forged)).statusCode).toBe(401);
    // Even the right signature fails now: the challenge was used up.
    const real = solanaKeys.sign(new TextEncoder().encode(message), alice.seed);
    expect((await attempt(real)).statusCode).toBe(401);
  });

  it('needs a session for personal routes, and signing out ends it', async () => {
    expect((await app.inject({ method: 'GET', url: '/me' })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: '/feed', headers: as('x'.repeat(43)) })).statusCode,
    ).toBe(401);
    const token = await signIn(app, person());
    await app.inject({ method: 'DELETE', url: '/auth/session', headers: as(token) });
    expect((await app.inject({ method: 'GET', url: '/me', headers: as(token) })).statusCode).toBe(
      401,
    );
  });
});

describe('profiles, follows and the friends feed', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });
  afterAll(() => ctx.app.close());

  const saveProfile = (token: string, body: object) =>
    ctx.app.inject({ method: 'PUT', url: '/me/profile', headers: as(token), payload: body });

  it('validates and saves a profile; names are unique and case-insensitive', async () => {
    const alice = await signIn(ctx.app, person());
    const bob = await signIn(ctx.app, person());
    expect(
      (await saveProfile(alice, { handle: 'a', displayName: 'A', shareTrades: false })).statusCode,
    ).toBe(400);
    expect(
      (await saveProfile(alice, { handle: 'alice', displayName: '  ', shareTrades: false }))
        .statusCode,
    ).toBe(400);

    const saved = await saveProfile(alice, {
      handle: 'Alice',
      displayName: 'Alice\u0000  Smith',
      shareTrades: true,
    });
    expect(saved.json()).toMatchObject({
      profile: { handle: 'alice', displayName: 'Alice Smith', shareTrades: true, followers: 0 },
    });
    const taken = await saveProfile(bob, { handle: 'ALICE', displayName: 'B', shareTrades: false });
    expect(taken.statusCode).toBe(409);
    expect(taken.json().message).toBe('That name is taken.');
  });

  it('follows people; the feed shows trades only from followed people who share', async () => {
    const aliceKeys = person();
    const bobKeys = person();
    const alice = await signIn(ctx.app, aliceKeys);
    const bob = await signIn(ctx.app, bobKeys);
    const carol = await signIn(ctx.app, person());
    await saveProfile(alice, { handle: 'alice', displayName: 'Alice', shareTrades: true });
    await saveProfile(bob, { handle: 'bob', displayName: 'Bob', shareTrades: false });
    await ctx.tokens.upsertTokens([{ mint: MINT_A, symbol: 'AAA', name: 'Token A' }]);
    await ctx.tokens.setRiskLevel(MINT_A, 'amber', NOW.toISOString());
    for (const [signature, wallet] of [
      ['sig-a', aliceKeys.wallet],
      ['sig-b', bobKeys.wallet],
    ] as const) {
      await ctx.social.recordTrade({
        signature,
        wallet,
        mint: MINT_A,
        side: 'buy',
        solLamports: 10_000_000,
        tokenAmount: '5000000',
        tokenDecimals: 6,
        at: NOW.toISOString(),
      });
    }

    const follow = (token: string, handle: string, method: 'PUT' | 'DELETE' = 'PUT') =>
      ctx.app.inject({ method, url: `/follows/${handle}`, headers: as(token) });
    expect((await follow(carol, 'alice')).statusCode).toBe(204);
    expect((await follow(carol, 'bob')).statusCode).toBe(204);
    expect((await follow(carol, 'nobody')).statusCode).toBe(404);
    expect((await follow(alice, 'alice')).statusCode).toBe(400);
    expect((await ctx.app.inject({ method: 'PUT', url: '/follows/alice' })).statusCode).toBe(401);

    const feed = await ctx.app.inject({ method: 'GET', url: '/feed', headers: as(carol) });
    expect(feed.json()).toEqual({
      trades: [
        {
          id: expect.stringMatching(/^[0-9a-f]{24}$/),
          handle: 'alice',
          displayName: 'Alice',
          side: 'buy',
          solLamports: 10_000_000,
          tokenAmount: '5000000',
          tokenDecimals: 6,
          at: NOW.toISOString(),
          token: { mint: MINT_A, symbol: 'AAA', name: 'Token A', riskLevel: 'amber' },
        },
      ],
    });

    const profile = await ctx.app.inject({
      method: 'GET',
      url: '/profiles/alice',
      headers: as(carol),
    });
    expect(profile.json()).toMatchObject({
      profile: { handle: 'alice', followers: 1, followedByMe: true },
      trades: [{ id: feed.json().trades[0].id }],
    });
    // A public profile never includes the wallet address, nor the transaction signature
    // (an explorer would show the wallet behind it).
    expect(JSON.stringify(profile.json())).not.toContain(aliceKeys.wallet);
    expect(JSON.stringify(profile.json())).not.toContain('sig-a');

    const search = await ctx.app.inject({ method: 'GET', url: '/profiles?q=AL' });
    expect(search.json()).toMatchObject({ profiles: [{ handle: 'alice', followedByMe: false }] });
    expect((await ctx.app.inject({ method: 'GET', url: '/profiles?q=%25' })).statusCode).toBe(400);

    await follow(carol, 'alice', 'DELETE');
    expect(
      (await ctx.app.inject({ method: 'GET', url: '/feed', headers: as(carol) })).json(),
    ).toEqual({ trades: [] });
  });
});

describe('watchlist and price alerts', () => {
  let ctx: ReturnType<typeof setup>;
  let token: string;
  let wallet: string;
  beforeEach(async () => {
    ctx = setup();
    const who = person();
    wallet = who.wallet;
    token = await signIn(ctx.app, who);
    await ctx.tokens.upsertTokens([{ mint: MINT_A, symbol: 'AAA' }, { mint: MINT_B }]);
    await ctx.tokens.recordSwaps([
      {
        signature: 's1',
        mint: MINT_A,
        trader: wallet,
        volumeSol: 1,
        tokenAmount: 1000,
        blockTime: NOW.toISOString(),
      },
    ]);
  });
  afterAll(() => ctx.app.close());

  it('adds and removes watched tokens, with their latest price', async () => {
    const watch = (mint: string, method: 'PUT' | 'DELETE' = 'PUT') =>
      ctx.app.inject({ method, url: `/me/watchlist/${mint}`, headers: as(token) });
    expect((await watch(MINT_A)).statusCode).toBe(204);
    expect((await watch(MINT_B)).statusCode).toBe(204);
    expect((await watch('nope')).statusCode).toBe(400);
    const list = await ctx.app.inject({ method: 'GET', url: '/me/watchlist', headers: as(token) });
    expect(list.json().tokens).toEqual([
      // Added at the same (fixed) time, so ordered by mint.
      expect.objectContaining({ mint: MINT_A, symbol: 'AAA', priceSol: 0.001 }),
      expect.objectContaining({ mint: MINT_B, priceSol: null }),
    ]);
    await watch(MINT_B, 'DELETE');
    const after = await ctx.app.inject({ method: 'GET', url: '/me/watchlist', headers: as(token) });
    expect(after.json().tokens.map((t: { mint: string }) => t.mint)).toEqual([MINT_A]);
  });

  it('creates alerts, refuses ones already met, fires once with a push, and deletes', async () => {
    const create = (body: object) =>
      ctx.app.inject({ method: 'POST', url: '/me/alerts', headers: as(token), payload: body });
    // The price is 0.001 SOL.
    const already = await create({ mint: MINT_A, direction: 'above', priceSol: 0.0005 });
    expect(already.statusCode).toBe(400);
    expect(already.json().message).toContain('already above');
    expect((await create({ mint: MINT_A, direction: 'sideways', priceSol: 1 })).statusCode).toBe(
      400,
    );
    expect((await create({ mint: MINT_A, direction: 'above', priceSol: -1 })).statusCode).toBe(400);

    const made = await create({ mint: MINT_A, direction: 'above', priceSol: 0.002 });
    expect(made.statusCode).toBe(201);
    const alert = made.json().alert;
    expect(alert).toMatchObject({ direction: 'above', priceSol: 0.002, triggeredAt: null });

    await ctx.app.inject({
      method: 'PUT',
      url: '/me/push-token',
      headers: as(token),
      payload: { token: 'ExponentPushToken[abcdefghij12]' },
    });
    const check = () =>
      checkPriceAlerts({ social: ctx.social, tokens: ctx.tokens, push: ctx.push, now: () => NOW });
    expect(await check()).toEqual([]); // not crossed yet

    // One trade at 0.003 doesn't move the median price; a sustained move does.
    const tradeAt = (signature: string, minutes: number) => ({
      signature,
      mint: MINT_A,
      trader: wallet,
      volumeSol: 3,
      tokenAmount: 1000,
      blockTime: new Date(NOW.getTime() + minutes * 60_000).toISOString(),
    });
    await ctx.tokens.recordSwaps([tradeAt('s2', 1)]);
    expect(await check()).toEqual([]);
    await ctx.tokens.recordSwaps([tradeAt('s2b', 2), tradeAt('s2c', 3)]);
    expect((await check()).map((a) => a.id)).toEqual([alert.id]);
    expect(await check()).toEqual([]); // fires once
    expect(ctx.push.send).toHaveBeenCalledTimes(1);
    expect(ctx.push.send.mock.calls[0]![0]).toEqual([
      {
        to: 'ExponentPushToken[abcdefghij12]',
        title: 'AAA is above 0.002 SOL',
        body: 'Price now 0.003 SOL. You set this alert in Sift.',
        data: { mint: MINT_A, alertId: alert.id },
      },
    ]);

    const list = await ctx.app.inject({ method: 'GET', url: '/me/alerts', headers: as(token) });
    expect(list.json().alerts[0]).toMatchObject({ id: alert.id, triggeredPriceSol: 0.003 });
    const del = (id: string) =>
      ctx.app.inject({ method: 'DELETE', url: `/me/alerts/${id}`, headers: as(token) });
    expect((await del(alert.id)).statusCode).toBe(204);
    expect((await del(alert.id)).statusCode).toBe(404);
  });

  it('drops push tokens Expo says are no longer registered', async () => {
    ctx.push.send.mockResolvedValueOnce(['ExponentPushToken[abcdefghij12]']);
    await ctx.social.savePushToken(wallet, 'ExponentPushToken[abcdefghij12]');
    await ctx.app.inject({
      method: 'POST',
      url: '/me/alerts',
      headers: as(token),
      payload: { mint: MINT_A, direction: 'below', priceSol: 0.0009 },
    });
    await ctx.tokens.recordSwaps(
      ['s3', 's3b'].map((signature, i) => ({
        signature,
        mint: MINT_A,
        trader: wallet,
        volumeSol: 0.5,
        tokenAmount: 1000,
        blockTime: new Date(NOW.getTime() + (i + 1) * 60_000).toISOString(),
      })),
    );
    await checkPriceAlerts({
      social: ctx.social,
      tokens: ctx.tokens,
      push: ctx.push,
      now: () => NOW,
    });
    expect(await ctx.social.pushTokens([wallet])).toEqual([]);
  });
});
