import type {
  HoldingsResponse,
  RiskScore,
  TokenChartResponse,
  TokenListResponse,
} from '@sift/shared';
import { RISK_DISCLAIMER } from '@sift/shared';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app';
import { pumpBondingCurve } from '../src/risk/gather';
import { loadConfig } from '../src/config';
import { createHeliusClient } from '../src/helius/client';
import { createRiskQueue } from '../src/risk/queue';
import type { RiskService } from '../src/risk/service';
import { buildChart } from '../src/tokens/chart';
import { createDiscoveryService } from '../src/tokens/discovery';
import { InMemoryTokenRepository } from '../src/tokens/memory-repository';
import { ALICE, BOB, DEV, MINT_A, MINT_B, T0, addr, buyTx, createTx } from './fixtures/helius';
import devnetHoldings from './fixtures/helius-devnet-holdings.json';
import { cleanMint, pct } from './fixtures/risk';
import { fakeHelius, silentLog } from './helpers/fake-helius';

const score = (mint: string, level: RiskScore['level'] = 'green'): RiskScore => ({
  mint,
  level,
  reasons: [],
  checkedAt: new Date().toISOString(),
  disclaimer: RISK_DISCLAIMER,
});

describe('risk queue', () => {
  it('scores each mint once, a few at a time', async () => {
    let active = 0;
    let peak = 0;
    const risk: RiskService = {
      getRisk: vi.fn(async (mint: string) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active -= 1;
        return score(mint);
      }),
    };
    const queue = createRiskQueue({ risk, log: silentLog, concurrency: 2 });
    const mints = Array.from({ length: 6 }, (_, i) => addr(`Q${String.fromCharCode(65 + i)}`));
    queue.enqueue([...mints, mints[0]!]);
    queue.enqueue([mints[1]!]);
    await queue.idle();
    expect(risk.getRisk).toHaveBeenCalledTimes(6);
    expect(peak).toBe(2);
    expect(queue.size).toBe(0);
  });

  it('drops new mints when full and survives failures', async () => {
    const risk: RiskService = { getRisk: vi.fn().mockRejectedValue(new Error('Helius down')) };
    const queue = createRiskQueue({ risk, log: silentLog, maxPending: 2 });
    queue.enqueue([addr('QA'), addr('QB'), addr('QC')]);
    await queue.idle();
    expect(risk.getRisk).toHaveBeenCalledTimes(2);
  });
});

describe('discovery hands launches to the risk queue', () => {
  it('reports newly launched mints once per batch', async () => {
    const onLaunched = vi.fn();
    const discovery = createDiscoveryService({
      repository: new InMemoryTokenRepository(),
      helius: null,
      log: silentLog,
      onLaunched,
    });
    await discovery.ingest([createTx(MINT_A, DEV, T0), buyTx(MINT_A, ALICE, 1, T0)]);
    await discovery.ingest([buyTx(MINT_B, BOB, 1, T0)]);
    expect(onLaunched).toHaveBeenCalledTimes(1);
    expect(onLaunched).toHaveBeenCalledWith([MINT_A]);
  });
});

describe('buildChart', () => {
  const since = new Date('2026-10-19T11:00:00Z');
  const now = new Date('2026-10-19T12:00:00Z');
  const trade = (minute: number, priceSol: number, volumeSol = 1) => ({
    blockTime: new Date(since.getTime() + minute * 60_000).toISOString(),
    priceSol,
    volumeSol,
  });

  it('takes the last price in each bucket and sums volume, skipping empty buckets', () => {
    const points = buildChart([trade(0, 1), trade(0.5, 2, 3), trade(30, 5)], {
      since,
      now,
      buckets: 60,
    });
    expect(points).toEqual([
      { t: '2026-10-19T11:00:00.000Z', priceSol: 2, volumeSol: 4 },
      { t: '2026-10-19T11:30:00.000Z', priceSol: 5, volumeSol: 1 },
    ]);
  });

  it('puts a trade at exactly "now" in the last bucket and ignores bad prices', () => {
    const points = buildChart([trade(60, 7), trade(10, 0), trade(-5, 9)], {
      since,
      now,
      buckets: 60,
    });
    expect(points).toEqual([{ t: '2026-10-19T11:59:00.000Z', priceSol: 7, volumeSol: 1 }]);
  });
});

describe('Helius getWalletHoldings (real devnet response)', () => {
  it('turns DAS assets into whole-token balances', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(JSON.stringify(devnetHoldings)));
    const holdings = await createHeliusClient({
      apiKey: 'k',
      cluster: 'devnet',
      fetch,
    }).getWalletHoldings(DEV);
    expect(holdings.tokens[0]).toMatchObject({
      mint: 'GEtph2tD2kxEKFJqwKYBa8hua8mQDQ3ttsGxhAQziUT5',
      symbol: 'MOON',
      amount: 66_285_709.815747,
      amountRaw: '66285709815747',
      decimals: 6,
    });
    expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string)).toMatchObject({
      method: 'getAssetsByOwner',
      params: { ownerAddress: DEV, options: { showFungible: true, showZeroBalance: false } },
    });
  });
});

describe('Step 5 routes', () => {
  const NOW = new Date('2026-10-19T12:00:00Z');
  const repository = new InMemoryTokenRepository(() => NOW);
  const helius = fakeHelius();
  helius.getMint.mockResolvedValue(cleanMint({ freezeAuthority: DEV }));
  helius.getLargestTokenAccounts.mockImplementation(async (mint) => [
    {
      owner: pumpBondingCurve(mint),
      ownerProgram: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
      amount: pct(90),
    },
  ]);
  helius.getWalletHoldings.mockResolvedValue({
    lamports: 2_500_000_000,
    tokens: [
      { mint: MINT_A, symbol: 'AAA', amount: 1234.5, amountRaw: '1234500000', decimals: 6 },
      { mint: MINT_B, amount: 1, amountRaw: '1000000', decimals: 6 },
    ],
  });
  const app = buildApp(loadConfig({ LOG_LEVEL: 'silent' }), {
    tokenRepository: repository,
    helius,
    jupiter: null,
    summaryModel: null,
    now: () => NOW,
  });
  afterAll(() => app.close());

  it('stores a risk level when a token is scored, and the feed shows it', async () => {
    await repository.upsertTokens([
      { mint: MINT_A, symbol: 'AAA', launchedAt: '2026-10-19T11:00:00Z' },
    ]);
    await app.inject({ method: 'GET', url: `/tokens/${MINT_A}/risk` });
    const feed = (
      await app.inject({ method: 'GET', url: '/tokens/new' })
    ).json<TokenListResponse>();
    expect(feed.tokens[0]).toMatchObject({ mint: MINT_A, riskLevel: 'red' });
  });

  it('GET /tokens/:mint/chart returns bucketed prices from recorded trades', async () => {
    await repository.recordSwaps([
      {
        signature: 'c1',
        mint: MINT_A,
        trader: ALICE,
        volumeSol: 1,
        tokenAmount: 1000,
        side: 'buy',
        blockTime: '2026-10-19T11:50:00Z',
      },
      {
        signature: 'c2',
        mint: MINT_A,
        trader: BOB,
        volumeSol: 2,
        tokenAmount: 1000,
        side: 'buy',
        blockTime: '2026-10-19T11:55:00Z',
      },
    ]);
    const res = await app.inject({
      method: 'GET',
      url: `/tokens/${MINT_A}/chart?windowMinutes=60`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<TokenChartResponse>()).toEqual({
      mint: MINT_A,
      windowMinutes: 60,
      points: [
        { t: '2026-10-19T11:50:00.000Z', priceSol: 0.001, volumeSol: 1 },
        { t: '2026-10-19T11:55:00.000Z', priceSol: 0.002, volumeSol: 2 },
      ],
    });
    expect(
      (await app.inject({ method: 'GET', url: `/tokens/${MINT_A}/chart?windowMinutes=2` }))
        .statusCode,
    ).toBe(400);
  });

  it('GET /wallets/:address/holdings lists balances with stored risk levels', async () => {
    const res = await app.inject({ method: 'GET', url: `/wallets/${ALICE}/holdings` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=15');
    expect(res.json<HoldingsResponse>()).toEqual({
      address: ALICE,
      solBalance: 2.5,
      holdings: [
        {
          mint: MINT_A,
          symbol: 'AAA',
          amount: 1234.5,
          amountRaw: '1234500000',
          decimals: 6,
          riskLevel: 'red',
        },
        { mint: MINT_B, amount: 1, amountRaw: '1000000', decimals: 6 },
      ],
    });
    expect((await app.inject({ method: 'GET', url: '/wallets/nope/holdings' })).statusCode).toBe(
      400,
    );
  });

  it('stores and scores holdings Sift has not checked, so the next view has badges', async () => {
    await vi.waitFor(async () => {
      const res = await app.inject({ method: 'GET', url: `/wallets/${ALICE}/holdings` });
      const holding = res.json<HoldingsResponse>().holdings.find((h) => h.mint === MINT_B);
      expect(holding?.riskLevel).toBe('red'); // fake mint has a freeze authority
    });
    expect(await repository.getToken(MINT_B)).toMatchObject({ mint: MINT_B });
  });
});
