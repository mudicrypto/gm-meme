import { describe, expect, it, vi } from 'vitest';
import { HeliusError, createHeliusClient } from '../src/helius/client';
import { MINT_A, MINT_B, addr, dasAsset } from './fixtures/helius';

const API_KEY = 'test-key-123';

function mockFetch(...responses: Array<{ status?: number; body: unknown }>) {
  const fn = vi.fn<typeof fetch>();
  for (const { status = 200, body } of responses) {
    fn.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
  }
  return fn;
}

describe('Helius client', () => {
  it('getAssetBatch calls DAS on the configured cluster and maps metadata', async () => {
    const fetch = mockFetch({
      body: { jsonrpc: '2.0', id: 'sift', result: [dasAsset(MINT_A, 'Doge Moon', 'DMOON'), null] },
    });
    const helius = createHeliusClient({ apiKey: API_KEY, cluster: 'devnet', fetch });

    const assets = await helius.getAssetBatch([MINT_A, MINT_B]);

    expect(assets).toEqual([
      {
        mint: MINT_A,
        name: 'Doge Moon',
        symbol: 'DMOON',
        imageUrl: 'https://ipfs.example/DMOON.png',
        decimals: 6,
        supply: 1_000_000_000_000_000,
      },
    ]);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(`https://devnet.helius-rpc.com/?api-key=${API_KEY}`);
    expect(JSON.parse(init!.body as string)).toMatchObject({
      method: 'getAssetBatch',
      params: { ids: [MINT_A, MINT_B] },
    });
  });

  it('getAssetBatch splits large requests into chunks of 100', async () => {
    const mints = Array.from({ length: 150 }, (_, i) => addr(`M${i}`.replace(/0/g, 'z')));
    const fetch = mockFetch({ body: { result: [] } }, { body: { result: [] } });
    await createHeliusClient({ apiKey: API_KEY, cluster: 'devnet', fetch }).getAssetBatch(mints);
    expect(fetch).toHaveBeenCalledTimes(2);
    const sizes = fetch.mock.calls.map(
      ([, init]) => JSON.parse(init!.body as string).params.ids.length,
    );
    expect(sizes).toEqual([100, 50]);
  });

  it('drops non-https images and caps attacker-controlled names', async () => {
    const asset = dasAsset(MINT_A, 'x'.repeat(500), 'SYMBOLTHATISWAYTOOLONG');
    asset.content.links.image = 'javascript:alert(1)';
    const fetch = mockFetch({ body: { result: [asset] } });
    const [meta] = await createHeliusClient({
      apiKey: API_KEY,
      cluster: 'devnet',
      fetch,
    }).getAssetBatch([MINT_A]);
    expect(meta?.imageUrl).toBeUndefined();
    expect(meta?.name).toHaveLength(64);
    expect(meta?.symbol).toBe('SYMBOLTHATISWAYT');
  });

  it('throws on HTTP errors without leaking the API key', async () => {
    const fetch = mockFetch({ status: 429, body: { error: 'rate limited' } });
    const promise = createHeliusClient({ apiKey: API_KEY, cluster: 'devnet', fetch }).getAssetBatch(
      [MINT_A],
    );
    await expect(promise).rejects.toThrow(HeliusError);
    await expect(promise).rejects.not.toThrow(API_KEY);
  });

  it('throws on JSON-RPC errors', async () => {
    const fetch = mockFetch({ body: { error: { code: -32602, message: 'invalid params' } } });
    await expect(
      createHeliusClient({ apiKey: API_KEY, cluster: 'devnet', fetch }).getAssetBatch([MINT_A]),
    ).rejects.toThrow('invalid params');
  });

  it('getAddressTransactions uses the enhanced API for the cluster', async () => {
    const fetch = mockFetch({ body: [{ signature: 'abc' }] });
    const helius = createHeliusClient({ apiKey: API_KEY, cluster: 'mainnet-beta', fetch });
    expect(await helius.getAddressTransactions(MINT_A, { limit: 25 })).toEqual([
      { signature: 'abc' },
    ]);
    expect(fetch.mock.calls[0]![0]).toBe(
      `https://api-mainnet.helius-rpc.com/v0/addresses/${MINT_A}/transactions?api-key=${API_KEY}&limit=25`,
    );
  });
});
