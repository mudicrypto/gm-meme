import { describe, expect, it, vi } from 'vitest';
import { buildWebhookRequest, syncWebhook } from '../src/helius/webhook-registration';
import { MINT_A } from './fixtures/helius';

const base = {
  webhookURL: 'https://sift.example/webhooks/helius',
  cluster: 'devnet' as const,
  accountAddresses: [MINT_A],
  secret: 'a-long-random-webhook-secret-for-tests',
};

describe('buildWebhookRequest', () => {
  it('creates an enhanced devnet webhook that sends our secret back', () => {
    const { url, body } = buildWebhookRequest('key', base);
    expect(url).toBe('https://api-mainnet.helius-rpc.com/v0/webhooks?api-key=key');
    expect(body).toEqual({
      webhookURL: base.webhookURL,
      transactionTypes: ['ANY'],
      accountAddresses: [MINT_A],
      webhookType: 'enhancedDevnet',
      authHeader: base.secret,
      txnStatus: 'success',
    });
  });

  it('uses the mainnet webhook type on mainnet', () => {
    expect(buildWebhookRequest('key', { ...base, cluster: 'mainnet-beta' }).body.webhookType).toBe(
      'enhanced',
    );
  });

  it('refuses plain http and the wrong path', () => {
    expect(() =>
      buildWebhookRequest('key', { ...base, webhookURL: 'http://sift.example/webhooks/helius' }),
    ).toThrow(/https/);
    expect(() =>
      buildWebhookRequest('key', { ...base, webhookURL: 'https://sift.example/' }),
    ).toThrow(/webhooks\/helius/);
  });
});

describe('syncWebhook', () => {
  const respond = (...bodies: unknown[]) => {
    const fetchFn = vi.fn<typeof fetch>();
    for (const body of bodies) fetchFn.mockResolvedValueOnce(new Response(JSON.stringify(body)));
    return fetchFn;
  };

  it('updates the webhook already pointing at this server', async () => {
    const fetchFn = respond(
      [
        { webhookID: 'other', webhookURL: 'https://elsewhere/webhooks/helius' },
        { webhookID: 'w1', webhookURL: base.webhookURL },
      ],
      { webhookID: 'w1' },
    );
    expect(await syncWebhook('key', base, fetchFn)).toEqual({ webhookID: 'w1', created: false });
    const [url, init] = fetchFn.mock.calls[1]!;
    expect(url).toBe('https://api-mainnet.helius-rpc.com/v0/webhooks/w1?api-key=key');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toMatchObject({ authHeader: base.secret });
  });

  it('creates one when none exists', async () => {
    const fetchFn = respond([], { webhookID: 'new' });
    expect(await syncWebhook('key', base, fetchFn)).toEqual({ webhookID: 'new', created: true });
    expect(fetchFn.mock.calls[1]![1]?.method).toBe('POST');
  });

  it('never puts the API key in its errors', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response('no', { status: 401 }));
    await expect(syncWebhook('secret-key', base, fetchFn)).rejects.toThrow(/HTTP 401/);
    await expect(syncWebhook('secret-key', base, fetchFn)).rejects.not.toThrow(/secret-key/);
  });
});
