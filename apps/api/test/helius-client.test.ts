import { describe, expect, it, vi } from 'vitest';
import { HeliusError, createHeliusClient } from '../src/helius/client';
import { MINT_A, MINT_B, addr, dasAsset } from './fixtures/helius';
// Real responses captured from Helius devnet.
import devnetRpc from './fixtures/helius-devnet-rpc.json';

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

  it.each([
    ['a raw IP address', 'https://203.0.113.7/a.png'],
    ['credentials in the URL', 'https://user:pass@example.com/a.png'],
    ['an unusual port', 'https://example.com:8443/a.png'],
    ['a very long URL', `https://example.com/${'a'.repeat(600)}.png`],
  ])('drops an image URL with %s', async (_name, image) => {
    const asset = dasAsset(MINT_A, 'Name', 'SYM');
    asset.content.links.image = image;
    const fetch = mockFetch({ body: { result: [asset] } });
    const [meta] = await createHeliusClient({
      apiKey: API_KEY,
      cluster: 'devnet',
      fetch,
    }).getAssetBatch([MINT_A]);
    expect(meta?.imageUrl).toBeUndefined();
  });

  it('strips invisible and direction-changing characters from names', async () => {
    // U+202E (right-to-left override) makes "CDSU" display as "USDC".
    const asset = dasAsset(MINT_A, 'Fake\u200b  Coin\n', '\u202eCDSU');
    const fetch = mockFetch({ body: { result: [asset] } });
    const [meta] = await createHeliusClient({
      apiKey: API_KEY,
      cluster: 'devnet',
      fetch,
    }).getAssetBatch([MINT_A]);
    expect(meta).toMatchObject({ name: 'Fake Coin', symbol: 'CDSU' });
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

describe('Helius client: Solana RPC for the risk score', () => {
  const MOON_CAT = 'GEtph2tD2kxEKFJqwKYBa8hua8mQDQ3ttsGxhAQziUT5';

  it('getMint reads a Token-2022 pump.fun mint', async () => {
    const fetch = mockFetch({ body: devnetRpc.getAccountInfo });
    const mint = await createHeliusClient({ apiKey: API_KEY, cluster: 'devnet', fetch }).getMint(
      MOON_CAT,
    );
    expect(mint).toMatchObject({
      mintAuthority: null,
      freezeAuthority: null,
      supply: 1_000_000_000_000_000n,
      decimals: 6,
      tokenProgram: 'spl-token-2022',
    });
    expect(mint?.extensions.map((e) => e.extension)).toEqual(['metadataPointer', 'tokenMetadata']);
    expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string)).toMatchObject({
      method: 'getAccountInfo',
      params: [MOON_CAT, { encoding: 'jsonParsed' }],
    });
  });

  it('getMint returns null for an address that is not a mint', async () => {
    const wallet = {
      result: { value: { owner: '11111111111111111111111111111111', data: ['', 'base64'] } },
    };
    const missing = { result: { value: null } };
    const fetch = mockFetch({ body: wallet }, { body: missing });
    const helius = createHeliusClient({ apiKey: API_KEY, cluster: 'devnet', fetch });
    expect(await helius.getMint(MINT_A)).toBeNull();
    expect(await helius.getMint(MINT_A)).toBeNull();
  });

  it('getLargestTokenAccounts resolves each holder and the program behind it', async () => {
    const fetch = mockFetch(
      { body: devnetRpc.getTokenLargestAccounts },
      { body: devnetRpc.getMultipleAccounts_tokenAccounts },
      { body: devnetRpc.getMultipleAccounts_owners },
    );
    const holdings = await createHeliusClient({
      apiKey: API_KEY,
      cluster: 'devnet',
      fetch,
    }).getLargestTokenAccounts(MOON_CAT);

    expect(holdings).toHaveLength(7);
    // The bonding curve PDA belongs to the pump.fun program; the rest are wallets.
    expect(holdings[0]).toEqual({
      owner: '2bV3dhEWoTqNsqijgpKVG8HEKpTaJLwfpX6jePNx7H1j',
      ownerProgram: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
      amount: 879_732_848_938_038n,
    });
    expect(holdings[1]).toMatchObject({
      owner: 'A1Qx18n8YWDHHNfH9GU4jJmmP1XtN52RcqCSQjCRMY6q',
      ownerProgram: null,
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('getLargestTokenAccounts fails rather than drop a holder it cannot read', async () => {
    const tokenAccounts = structuredClone(devnetRpc.getMultipleAccounts_tokenAccounts) as {
      result: { value: unknown[] };
    };
    tokenAccounts.result.value[0] = null; // closed between the two calls
    const fetch = mockFetch(
      { body: devnetRpc.getTokenLargestAccounts },
      { body: tokenAccounts },
      { body: devnetRpc.getMultipleAccounts_owners },
    );
    await expect(
      createHeliusClient({ apiKey: API_KEY, cluster: 'devnet', fetch }).getLargestTokenAccounts(
        MOON_CAT,
      ),
    ).rejects.toThrow(/every large holder/);
  });

  it('getLargestTokenAccounts stops early for a token with no holders', async () => {
    const fetch = mockFetch({ body: { result: { value: [] } } });
    expect(
      await createHeliusClient({
        apiKey: API_KEY,
        cluster: 'devnet',
        fetch,
      }).getLargestTokenAccounts(MINT_A),
    ).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('surfaces RPC errors', async () => {
    const fetch = mockFetch({
      body: { error: { code: -32602, message: 'Invalid param: not a Token mint' } },
    });
    await expect(
      createHeliusClient({ apiKey: API_KEY, cluster: 'devnet', fetch }).getLargestTokenAccounts(
        MINT_A,
      ),
    ).rejects.toThrow('not a Token mint');
  });

  it('can filter address history by transaction type', async () => {
    const fetch = mockFetch({ body: [] });
    await createHeliusClient({ apiKey: API_KEY, cluster: 'devnet', fetch }).getAddressTransactions(
      MINT_A,
      {
        type: 'CREATE',
        limit: 1,
      },
    );
    expect(fetch.mock.calls[0]![0]).toContain('&limit=1&type=CREATE');
  });
});
