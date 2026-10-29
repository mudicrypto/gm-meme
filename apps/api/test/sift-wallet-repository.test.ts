import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { InMemorySiftWalletRepository } from '../src/sift-wallet/memory-repository';
import type {
  OrderRecord,
  SiftWalletRepository,
  WalletRecord,
} from '../src/sift-wallet/repository';
import { SupabaseSiftWalletRepository } from '../src/sift-wallet/supabase-repository';
import { ALICE, BOB, MINT_A, MINT_B } from './fixtures/helius';
import { createPgliteRpc } from './helpers/pglite-rpc';

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 29, 10, minutes)).toISOString();
const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

let pg: Awaited<ReturnType<typeof createPgliteRpc>>;
beforeAll(async () => {
  pg = await createPgliteRpc();
}, 30_000);

const implementations: Array<[string, () => Promise<SiftWalletRepository>]> = [
  ['in-memory', async () => new InMemorySiftWalletRepository()],
  [
    'supabase (SQL on PGlite)',
    async () => {
      await pg.db.exec(
        'truncate public.sift_wallets, public.sift_spend, public.sift_orders cascade',
      );
      return new SupabaseSiftWalletRepository(pg.rpc);
    },
  ],
];

const wallet = (owner: string, address: string): WalletRecord => ({
  owner,
  providerId: `pv-${owner.slice(0, 6)}`,
  address,
  frozen: false,
  perOrderLamports: 1_000_000_000,
  dailyLamports: 5_000_000_000,
  withdrawAddress: null,
  withdrawReadyAt: null,
  totpSecret: null,
  totpEnabled: false,
  createdAt: at(0),
});

const order = (overrides: Partial<OrderRecord>): OrderRecord => ({
  id: id(1),
  owner: ALICE,
  mint: MINT_A,
  kind: 'stop_loss',
  triggerPriceSol: 0.0000038,
  sellPercent: 100,
  slippageBps: 1000,
  status: 'open',
  attempts: 0,
  createdAt: at(1),
  expiresAt: at(30),
  ...overrides,
});

describe.each(implementations)('SiftWalletRepository: %s', (_name, create) => {
  let repo: SiftWalletRepository;
  beforeEach(async () => {
    repo = await create();
    await repo.insertWallet(wallet(ALICE, MINT_B));
  });

  it('creates one wallet per owner and keeps the first', async () => {
    const again = await repo.insertWallet({ ...wallet(ALICE, BOB), providerId: 'other' });
    expect(again).toEqual(wallet(ALICE, MINT_B));
    expect(await repo.getWallet(ALICE)).toEqual(wallet(ALICE, MINT_B));
    expect(await repo.getWallet(BOB)).toBeNull();
  });

  it('updates the mutable fields', async () => {
    const fields = {
      frozen: true,
      perOrderLamports: 2,
      dailyLamports: 3,
      withdrawAddress: BOB,
      withdrawReadyAt: at(20),
      totpSecret: 'JBSWY3DPEHPK3PXP',
      totpEnabled: true,
    };
    await repo.updateWallet(ALICE, fields);
    expect(await repo.getWallet(ALICE)).toEqual({ ...wallet(ALICE, MINT_B), ...fields });
  });

  it('sums spending since a time', async () => {
    await repo.recordSpend(ALICE, 100, at(1));
    await repo.recordSpend(ALICE, 200, at(5));
    expect(await repo.spentSince(ALICE, at(2))).toBe(200);
    expect(await repo.spentSince(ALICE, at(0))).toBe(300);
    expect(await repo.spentSince(BOB, at(0))).toBe(0);
  });

  it('stores, lists and cancels orders', async () => {
    await repo.insertOrder(order({}));
    await repo.insertOrder(
      order({
        id: id(2),
        kind: 'limit_buy',
        sellPercent: undefined,
        buyLamports: 500_000_000,
        group: 'g1',
        createdAt: at(2),
      }),
    );
    const mine = await repo.ordersOf(ALICE, 10);
    expect(mine.map((o) => o.id)).toEqual([id(2), id(1)]);
    expect(mine[0]).toEqual(
      order({
        id: id(2),
        kind: 'limit_buy',
        sellPercent: undefined,
        buyLamports: 500_000_000,
        group: 'g1',
        createdAt: at(2),
      }),
    );
    expect(await repo.countOpen(ALICE)).toBe(2);
    expect(await repo.cancelOrder(BOB, id(1))).toBe(false);
    expect(await repo.cancelOrder(ALICE, id(1))).toBe(true);
    expect(await repo.cancelOrder(ALICE, id(1))).toBe(false);
    expect((await repo.openOrders()).map((o) => o.id)).toEqual([id(2)]);
  });

  it('lets only one caller claim an order, then settles or reopens it', async () => {
    await repo.insertOrder(order({}));
    expect(await repo.claimOrder(id(1))).toBe(true);
    expect(await repo.claimOrder(id(1))).toBe(false);
    await repo.settleOrder(id(1), { status: 'open', message: 'Retrying' });
    let [stored] = await repo.ordersOf(ALICE, 1);
    expect(stored).toMatchObject({ status: 'open', attempts: 1, message: 'Retrying' });
    expect(await repo.claimOrder(id(1))).toBe(true);
    await repo.settleOrder(id(1), { status: 'filled', signature: 'sig', filledAt: at(3) });
    [stored] = await repo.ordersOf(ALICE, 1);
    expect(stored).toMatchObject({
      status: 'filled',
      attempts: 2,
      signature: 'sig',
      filledAt: at(3),
    });
    // A settled order can't be settled again.
    await repo.settleOrder(id(1), { status: 'failed' });
    [stored] = await repo.ordersOf(ALICE, 1);
    expect(stored?.status).toBe('filled');
  });

  it('tracks a trailing peak and a waiting message on open orders', async () => {
    await repo.insertOrder(order({ trailingPct: 20, peakPriceSol: 1 }));
    await repo.touchOrder(id(1), { peakPriceSol: 2, message: 'Waiting' });
    let [stored] = await repo.ordersOf(ALICE, 1);
    expect(stored).toMatchObject({ peakPriceSol: 2, message: 'Waiting' });
    await repo.touchOrder(id(1), { message: null });
    [stored] = await repo.ordersOf(ALICE, 1);
    expect(stored?.message).toBeUndefined();
    expect(stored?.peakPriceSol).toBe(2);
  });

  it('expires open orders past their expiry', async () => {
    await repo.insertOrder(order({}));
    await repo.insertOrder(order({ id: id(2), expiresAt: at(50) }));
    const expired = await repo.expireOrders(at(40));
    expect(expired.map((o) => o.id)).toEqual([id(1)]);
    expect(expired[0]?.status).toBe('expired');
    expect((await repo.openOrders()).map((o) => o.id)).toEqual([id(2)]);
  });
});
