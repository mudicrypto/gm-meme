import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { InMemorySocialRepository } from '../src/social/memory-repository';
import type { SocialRepository, TradeRecord } from '../src/social/repository';
import { SupabaseSocialRepository } from '../src/social/supabase-repository';
import { ALICE, BOB, CAROL, MINT_A, MINT_B } from './fixtures/helius';
import { createPgliteRpc } from './helpers/pglite-rpc';

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 20, 10, minutes)).toISOString();
const ALERT_1 = '00000000-0000-4000-8000-000000000001';
const ALERT_2 = '00000000-0000-4000-8000-000000000002';

let pg: Awaited<ReturnType<typeof createPgliteRpc>>;
beforeAll(async () => {
  pg = await createPgliteRpc();
}, 30_000);

const implementations: Array<[string, () => Promise<SocialRepository>]> = [
  ['in-memory', async () => new InMemorySocialRepository()],
  [
    'supabase (SQL on PGlite)',
    async () => {
      await pg.db.exec(
        'truncate public.profiles, public.follows, public.sessions, public.shared_trades, public.watchlist, public.price_alerts, public.push_tokens cascade',
      );
      return new SupabaseSocialRepository(pg.rpc);
    },
  ],
];

const trade = (overrides: Partial<TradeRecord>): TradeRecord => ({
  signature: 'sig1',
  wallet: ALICE,
  mint: MINT_A,
  side: 'buy',
  solLamports: 50_000_000,
  tokenAmount: '123456789012',
  tokenDecimals: 6,
  at: at(1),
  ...overrides,
});

const profile = (wallet: string, handle: string, shareTrades = true) => ({
  wallet,
  handle,
  displayName: handle.toUpperCase(),
  shareTrades,
});

describe.each(implementations)('SocialRepository: %s', (_name, create) => {
  let repo: SocialRepository;
  beforeEach(async () => {
    repo = await create();
  });

  it('keeps sessions until they expire, and deletes them', async () => {
    await repo.createSession({ tokenHash: 'h1', wallet: ALICE, expiresAt: at(30) });
    expect(await repo.sessionWallet('h1', new Date(at(10)))).toBe(ALICE);
    expect(await repo.sessionWallet('h1', new Date(at(30)))).toBeNull();
    expect(await repo.sessionWallet('nope', new Date(at(10)))).toBeNull();
    await repo.deleteSession('h1');
    expect(await repo.sessionWallet('h1', new Date(at(10)))).toBeNull();
  });

  it('saves profiles, keeps handles unique, and finds them by wallet, handle or prefix', async () => {
    expect(await repo.saveProfile(profile(ALICE, 'alice'))).toBe('ok');
    expect(await repo.saveProfile(profile(BOB, 'alice'))).toBe('handle_taken');
    expect(await repo.saveProfile(profile(BOB, 'alina'))).toBe('ok');
    // Renaming yourself, or saving the same handle again, is fine.
    expect(await repo.saveProfile({ ...profile(ALICE, 'alice'), displayName: 'Al' })).toBe('ok');

    expect(await repo.getProfile(ALICE)).toEqual({
      wallet: ALICE,
      handle: 'alice',
      displayName: 'Al',
      shareTrades: true,
      followers: 0,
      following: 0,
    });
    expect((await repo.getProfileByHandle('alina'))?.wallet).toBe(BOB);
    expect(await repo.getProfile(CAROL)).toBeNull();
    expect(await repo.getProfileByHandle('nobody')).toBeNull();
    expect((await repo.searchProfiles('al', 10)).map((p) => p.handle)).toEqual(['alice', 'alina']);
    expect((await repo.searchProfiles('al', 1)).map((p) => p.handle)).toEqual(['alice']);
    // "_" is a literal underscore, not a wildcard.
    expect(await repo.searchProfiles('a_', 10)).toEqual([]);
  });

  it('follows and unfollows, with counts', async () => {
    await repo.saveProfile(profile(ALICE, 'alice'));
    await repo.saveProfile(profile(BOB, 'bob'));
    await repo.follow(CAROL, ALICE);
    await repo.follow(CAROL, ALICE);
    await repo.follow(BOB, ALICE);
    await repo.follow(ALICE, BOB);
    expect(await repo.isFollowing(CAROL, ALICE)).toBe(true);
    expect(await repo.isFollowing(ALICE, CAROL)).toBe(false);
    expect(await repo.getProfile(ALICE)).toMatchObject({ followers: 2, following: 1 });
    await repo.unfollow(CAROL, ALICE);
    expect(await repo.isFollowing(CAROL, ALICE)).toBe(false);
    expect(await repo.getProfile(ALICE)).toMatchObject({ followers: 1 });
  });

  it('refuses following yourself or a wallet without a profile', async () => {
    await repo.saveProfile(profile(ALICE, 'alice'));
    await expect(repo.follow(ALICE, ALICE)).rejects.toThrow();
    await expect(repo.follow(ALICE, BOB)).rejects.toThrow();
  });

  it('stores trades only for people who share them, once', async () => {
    await repo.saveProfile(profile(ALICE, 'alice', true));
    await repo.saveProfile(profile(BOB, 'bob', false));
    expect(await repo.recordTrade(trade({}))).toBe(true);
    expect(await repo.recordTrade(trade({}))).toBe(false); // same signature
    expect(await repo.recordTrade(trade({ signature: 'b1', wallet: BOB }))).toBe(false);
    expect(await repo.recordTrade(trade({ signature: 'c1', wallet: CAROL }))).toBe(false);
    expect(await repo.tradesBy(ALICE, 10)).toEqual([
      {
        signature: 'sig1',
        handle: 'alice',
        displayName: 'ALICE',
        mint: MINT_A,
        side: 'buy',
        solLamports: 50_000_000,
        tokenAmount: '123456789012',
        tokenDecimals: 6,
        at: at(1),
      },
    ]);
    expect(await repo.tradesBy(BOB, 10)).toEqual([]);
  });

  it('turning sharing off deletes shared trades', async () => {
    await repo.saveProfile(profile(ALICE, 'alice', true));
    await repo.recordTrade(trade({}));
    await repo.saveProfile(profile(ALICE, 'alice', false));
    await repo.saveProfile(profile(ALICE, 'alice', true));
    expect(await repo.tradesBy(ALICE, 10)).toEqual([]);
  });

  it('builds the feed from followed people who share, newest first', async () => {
    await repo.saveProfile(profile(ALICE, 'alice'));
    await repo.saveProfile(profile(BOB, 'bob'));
    await repo.saveProfile(profile(CAROL, 'carol'));
    await repo.recordTrade(trade({ signature: 'a1', at: at(1) }));
    await repo.recordTrade(trade({ signature: 'b1', wallet: BOB, side: 'sell', at: at(5) }));
    await repo.recordTrade(trade({ signature: 'a2', mint: MINT_B, at: at(9) }));
    await repo.recordTrade(trade({ signature: 'c1', wallet: CAROL, at: at(7) })); // not followed
    await repo.follow(CAROL, ALICE);
    await repo.follow(CAROL, BOB);

    const feed = await repo.feed(CAROL, 10);
    expect(feed.map((t) => [t.signature, t.handle])).toEqual([
      ['a2', 'alice'],
      ['b1', 'bob'],
      ['a1', 'alice'],
    ]);
    expect(await repo.feed(CAROL, 2)).toHaveLength(2);
    expect(await repo.feed(ALICE, 10)).toEqual([]);

    // Bob stops sharing: his trades leave the feed.
    await repo.saveProfile(profile(BOB, 'bob', false));
    expect((await repo.feed(CAROL, 10)).map((t) => t.signature)).toEqual(['a2', 'a1']);
  });

  it('keeps a watchlist per wallet, newest first', async () => {
    await repo.watch(ALICE, MINT_A, at(1));
    await repo.watch(ALICE, MINT_B, at(2));
    await repo.watch(ALICE, MINT_A, at(3)); // already watched: keeps the first time
    await repo.watch(BOB, MINT_A, at(4));
    expect(await repo.watchlist(ALICE)).toEqual([
      { mint: MINT_B, addedAt: at(2) },
      { mint: MINT_A, addedAt: at(1) },
    ]);
    await repo.unwatch(ALICE, MINT_B);
    expect(await repo.watchlist(ALICE)).toEqual([{ mint: MINT_A, addedAt: at(1) }]);
  });

  it('price alerts: create, list, fire once, and delete only your own', async () => {
    await repo.createAlert({
      id: ALERT_1,
      wallet: ALICE,
      mint: MINT_A,
      direction: 'above',
      priceSol: 0.002,
      createdAt: at(1),
    });
    await repo.createAlert({
      id: ALERT_2,
      wallet: ALICE,
      mint: MINT_B,
      direction: 'below',
      priceSol: 0.5,
      createdAt: at(2),
    });
    expect((await repo.alertsOf(ALICE)).map((a) => a.id)).toEqual([ALERT_2, ALERT_1]);
    expect((await repo.activeAlerts()).map((a) => a.id)).toEqual([ALERT_1, ALERT_2]);

    expect(await repo.triggerAlert(ALERT_1, at(5), 0.0025)).toBe(true);
    expect(await repo.triggerAlert(ALERT_1, at(6), 0.003)).toBe(false);
    expect((await repo.activeAlerts()).map((a) => a.id)).toEqual([ALERT_2]);
    expect((await repo.alertsOf(ALICE))[1]).toEqual({
      id: ALERT_1,
      wallet: ALICE,
      mint: MINT_A,
      direction: 'above',
      priceSol: 0.002,
      createdAt: at(1),
      triggeredAt: at(5),
      triggeredPriceSol: 0.0025,
    });

    expect(await repo.deleteAlert(BOB, ALERT_2)).toBe(false);
    expect(await repo.deleteAlert(ALICE, ALERT_2)).toBe(true);
    expect((await repo.alertsOf(ALICE)).map((a) => a.id)).toEqual([ALERT_1]);
  });

  it('keeps push tokens per wallet; a token moves to whoever registered it last', async () => {
    await repo.savePushToken(ALICE, 'ExponentPushToken[a]');
    await repo.savePushToken(ALICE, 'ExponentPushToken[b]');
    await repo.savePushToken(BOB, 'ExponentPushToken[c]');
    await repo.savePushToken(BOB, 'ExponentPushToken[b]');
    expect(await repo.pushTokens([ALICE])).toEqual([
      { wallet: ALICE, token: 'ExponentPushToken[a]' },
    ]);
    await repo.deletePushToken('ExponentPushToken[c]');
    expect(await repo.pushTokens([BOB])).toEqual([{ wallet: BOB, token: 'ExponentPushToken[b]' }]);
    expect(await repo.pushTokens([])).toEqual([]);
  });
});
