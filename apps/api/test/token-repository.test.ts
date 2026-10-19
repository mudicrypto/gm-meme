import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTokenRepository } from '../src/tokens/memory-repository';
import type { TokenRepository } from '../src/tokens/repository';
import { SupabaseTokenRepository } from '../src/tokens/supabase-repository';
import { ALICE, BOB, CAROL, DEV, MINT_A, MINT_B, addr } from './fixtures/helius';
import { createPgliteRpc } from './helpers/pglite-rpc';

const MINT_C = addr('MintC');
const at = (minutes: number) => new Date(Date.UTC(2026, 9, 19, 10, minutes)).toISOString();

// Booting Postgres takes a few seconds, so share one database and empty it per test.
let pg: Awaited<ReturnType<typeof createPgliteRpc>>;
beforeAll(async () => {
  pg = await createPgliteRpc();
}, 30_000);

// The same contract must hold for the in-memory store and the real SQL functions.
const implementations: Array<[string, () => Promise<TokenRepository>]> = [
  ['in-memory', async () => new InMemoryTokenRepository()],
  [
    'supabase (SQL on PGlite)',
    async () => {
      await pg.db.exec('truncate public.tokens, public.token_swaps');
      return new SupabaseTokenRepository(pg.rpc);
    },
  ],
];

describe.each(implementations)('TokenRepository: %s', (_name, create) => {
  let repo: TokenRepository;
  beforeEach(async () => {
    repo = await create();
  });

  it('lists launched tokens newest first, skipping tokens never seen launching', async () => {
    await repo.upsertTokens([
      { mint: MINT_A, symbol: 'AAA', launchedAt: at(1) },
      { mint: MINT_B, symbol: 'BBB', launchedAt: at(5) },
      { mint: MINT_C }, // seen only through a swap
    ]);
    const tokens = await repo.listNew(10);
    expect(tokens.map((t) => t.mint)).toEqual([MINT_B, MINT_A]);
    expect(tokens[0]).toMatchObject({ symbol: 'BBB', launchedAt: at(5) });
    expect(Date.parse(tokens[0]!.firstSeenAt)).not.toBeNaN();
    expect(await repo.listNew(1)).toHaveLength(1);
  });

  it('merges without losing data: newest metadata, first creator, earliest launch', async () => {
    await repo.upsertTokens([{ mint: MINT_A, launchedAt: at(10), creator: DEV, symbol: 'OLD' }]);
    await repo.upsertTokens([{ mint: MINT_A }]); // bare record from a swap
    await repo.upsertTokens([
      { mint: MINT_A, launchedAt: at(2), creator: ALICE, symbol: 'NEW', name: 'New Name' },
    ]);
    const [token] = await repo.listNew(10);
    expect(token).toMatchObject({
      mint: MINT_A,
      symbol: 'NEW',
      name: 'New Name',
      launchedAt: at(2),
    });
  });

  it('accepts the same mint twice in one batch', async () => {
    await repo.upsertTokens([
      { mint: MINT_A, launchedAt: at(1) },
      { mint: MINT_A, symbol: 'AAA', enrichedAt: at(2) },
    ]);
    expect(await repo.listNew(10)).toMatchObject([{ mint: MINT_A, symbol: 'AAA' }]);
  });

  it('gets one token with everything stored about it', async () => {
    await repo.upsertTokens([
      {
        mint: MINT_A,
        symbol: 'AAA',
        creator: DEV,
        launchedAt: at(1),
        decimals: 6,
        launchSource: 'PUMP_FUN',
      },
    ]);
    expect(await repo.getToken(MINT_A)).toMatchObject({
      mint: MINT_A,
      symbol: 'AAA',
      creator: DEV,
      decimals: 6,
      launchSource: 'PUMP_FUN',
      launchedAt: at(1),
    });
    expect(await repo.getToken(MINT_B)).toBeNull();
  });

  it('reports which mints already have metadata', async () => {
    await repo.upsertTokens([{ mint: MINT_A, enrichedAt: at(0) }, { mint: MINT_B }]);
    expect(await repo.enrichedMints([MINT_A, MINT_B, MINT_C])).toEqual(new Set([MINT_A]));
    expect(await repo.enrichedMints([])).toEqual(new Set());
  });

  it('ranks trending by distinct traders, so one wallet spamming swaps loses', async () => {
    await repo.upsertTokens([{ mint: MINT_A }, { mint: MINT_B }, { mint: MINT_C }]);
    await repo.recordSwaps([
      // A: one wallet, many swaps, big volume (wash trading)
      ...[1, 2, 3, 4, 5].map((i) => ({
        signature: `a${i}`,
        mint: MINT_A,
        trader: DEV,
        volumeSol: 50,
        blockTime: at(30),
      })),
      // B: three different traders
      { signature: 'b1', mint: MINT_B, trader: ALICE, volumeSol: 1, blockTime: at(30) },
      { signature: 'b2', mint: MINT_B, trader: BOB, volumeSol: 1, blockTime: at(31) },
      { signature: 'b3', mint: MINT_B, trader: CAROL, blockTime: at(32) },
      // C: busy, but before the window
      { signature: 'c1', mint: MINT_C, trader: ALICE, volumeSol: 9, blockTime: at(1) },
      { signature: 'c2', mint: MINT_C, trader: BOB, volumeSol: 9, blockTime: at(2) },
    ]);

    const trending = await repo.listTrending({ since: new Date(at(10)), limit: 10 });

    expect(trending.map((t) => t.mint)).toEqual([MINT_B, MINT_A]);
    expect(trending[0]).toMatchObject({ swapCount: 3, uniqueTraders: 3, volumeSol: 2 });
    expect(trending[1]).toMatchObject({ swapCount: 5, uniqueTraders: 1, volumeSol: 250 });
  });

  it("reports one token's activity since a time", async () => {
    await repo.upsertTokens([{ mint: MINT_A }, { mint: MINT_B }]);
    await repo.recordSwaps([
      { signature: 'x1', mint: MINT_A, trader: ALICE, volumeSol: 1.5, blockTime: at(20) },
      { signature: 'x2', mint: MINT_A, trader: ALICE, volumeSol: 0.5, blockTime: at(25) },
      { signature: 'x3', mint: MINT_A, trader: BOB, blockTime: at(30) },
      { signature: 'x4', mint: MINT_A, trader: CAROL, volumeSol: 9, blockTime: at(1) }, // too old
      { signature: 'x5', mint: MINT_B, trader: CAROL, volumeSol: 9, blockTime: at(30) }, // other token
    ]);
    expect(await repo.getActivity(MINT_A, new Date(at(10)))).toEqual({
      swapCount: 3,
      uniqueTraders: 2,
      volumeSol: 2,
    });
    expect(await repo.getActivity(MINT_C, new Date(at(0)))).toEqual({
      swapCount: 0,
      uniqueTraders: 0,
      volumeSol: 0,
    });
  });

  it('ignores redelivered swaps', async () => {
    await repo.upsertTokens([{ mint: MINT_A }]);
    const swap = { signature: 's1', mint: MINT_A, trader: ALICE, volumeSol: 1, blockTime: at(30) };
    await repo.recordSwaps([swap, swap]);
    await repo.recordSwaps([swap]);
    const [token] = await repo.listTrending({ since: new Date(at(0)), limit: 10 });
    expect(token).toMatchObject({ swapCount: 1, volumeSol: 1 });
  });

  it('leaves out swaps of tokens it has no record of', async () => {
    await repo.recordSwaps([{ signature: 's1', mint: MINT_A, trader: ALICE, blockTime: at(30) }]);
    expect(await repo.listTrending({ since: new Date(at(0)), limit: 10 })).toEqual([]);
  });
});

describe('Supabase SQL permissions', () => {
  let db: PGlite;
  beforeAll(() => {
    db = pg.db;
  });

  it('only the service role can call any of the functions', async () => {
    const { rows } = await db.query<{ fn: string; role: string; allowed: boolean }>(`
      select p.proname as fn, r as role, has_function_privilege(r, p.oid, 'execute') as allowed
      from pg_proc p cross join unnest(array['anon', 'authenticated', 'service_role']) as r
      where p.pronamespace = 'public'::regnamespace`);
    const functions = [...new Set(rows.map((row) => row.fn))];
    expect(functions.length).toBeGreaterThanOrEqual(6);
    for (const row of rows) {
      expect({ ...row, allowed: row.allowed }).toEqual({
        ...row,
        allowed: row.role === 'service_role',
      });
    }
  });

  it('turns on row level security for every table', async () => {
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(`
      select relname, relrowsecurity from pg_class
      where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname`);
    expect(rows).toEqual([
      { relname: 'token_swaps', relrowsecurity: true },
      { relname: 'tokens', relrowsecurity: true },
    ]);
  });
});
