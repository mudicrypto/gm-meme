import { describe, expect, it } from 'vitest';
import { createDiscoveryService } from '../src/tokens/discovery';
import { InMemoryTokenRepository } from '../src/tokens/memory-repository';
import { ALICE, BOB, DEV, MINT_A, MINT_B, T0, buyTx, createTx } from './fixtures/helius';
import { fakeHelius, silentLog } from './helpers/fake-helius';

const NOW = new Date('2026-10-19T10:05:00Z');

function setup(helius: ReturnType<typeof fakeHelius> | null = fakeHelius()) {
  const repository = new InMemoryTokenRepository(() => NOW);
  const discovery = createDiscoveryService({ repository, helius, log: silentLog, now: () => NOW });
  return { repository, discovery };
}

describe('discovery ingest', () => {
  it('stores a launch with its Helius metadata', async () => {
    const helius = fakeHelius({ [MINT_A]: { name: 'Doge Moon', symbol: 'DMOON', decimals: 6 } });
    const { repository, discovery } = setup(helius);

    const result = await discovery.ingest([createTx(MINT_A, DEV, T0)]);

    expect(result).toEqual({ launches: 1, swaps: 0, enriched: 1, invalid: 0 });
    expect(await repository.listNew(10)).toEqual([
      {
        mint: MINT_A,
        name: 'Doge Moon',
        symbol: 'DMOON',
        imageUrl: undefined,
        launchedAt: '2026-10-19T10:00:00.000Z',
        firstSeenAt: NOW.toISOString(),
      },
    ]);
  });

  it('asks Helius only about tokens that have no metadata yet', async () => {
    const helius = fakeHelius({ [MINT_A]: { symbol: 'AAA' } });
    const { discovery } = setup(helius);

    await discovery.ingest([createTx(MINT_A, DEV, T0)]);
    await discovery.ingest([buyTx(MINT_A, ALICE, 1, T0 + 60), buyTx(MINT_B, BOB, 1, T0 + 60)]);

    expect(helius.getAssetBatch).toHaveBeenCalledTimes(2);
    expect(helius.getAssetBatch.mock.calls[1]![0]).toEqual([MINT_B]);
  });

  it('retries metadata later when DAS has not indexed a new token yet', async () => {
    const helius = fakeHelius(); // knows nothing
    const { repository, discovery } = setup(helius);

    await discovery.ingest([createTx(MINT_A, DEV, T0)]);
    expect(await repository.enrichedMints([MINT_A])).toEqual(new Set());

    await discovery.ingest([buyTx(MINT_A, ALICE, 1, T0 + 60)]);
    expect(helius.getAssetBatch).toHaveBeenCalledTimes(2);
  });

  it('still stores tokens and swaps when Helius metadata fails', async () => {
    const helius = fakeHelius();
    helius.getAssetBatch.mockRejectedValueOnce(new Error('Helius HTTP 503'));
    const { repository, discovery } = setup(helius);

    await discovery.ingest([createTx(MINT_A, DEV, T0), buyTx(MINT_A, ALICE, 2, T0 + 60)]);

    expect(await repository.listNew(10)).toHaveLength(1);
    const trending = await repository.listTrending({ since: new Date(0), limit: 10 });
    expect(trending).toMatchObject([{ mint: MINT_A, swapCount: 1, volumeSol: 2 }]);
    expect(silentLog.warn).toHaveBeenCalled();
  });

  it('works without a Helius key', async () => {
    const { repository, discovery } = setup(null);
    const result = await discovery.ingest([createTx(MINT_A, DEV, T0)]);
    expect(result.enriched).toBe(0);
    expect(await repository.listNew(10)).toMatchObject([{ mint: MINT_A }]);
  });

  it('is idempotent when Helius redelivers a batch', async () => {
    const { repository, discovery } = setup();
    const batch = [createTx(MINT_A, DEV, T0), buyTx(MINT_A, ALICE, 1, T0 + 60)];
    await discovery.ingest(batch);
    await discovery.ingest(batch);
    expect(await repository.listNew(10)).toHaveLength(1);
    expect(await repository.listTrending({ since: new Date(0), limit: 10 })).toMatchObject([
      { swapCount: 1 },
    ]);
  });

  it('does nothing for a batch with no launches or swaps', async () => {
    const helius = fakeHelius();
    const { discovery } = setup(helius);
    expect(await discovery.ingest([])).toEqual({ launches: 0, swaps: 0, enriched: 0, invalid: 0 });
    expect(helius.getAssetBatch).not.toHaveBeenCalled();
  });
});
