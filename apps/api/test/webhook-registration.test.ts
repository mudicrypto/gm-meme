import { describe, expect, it } from 'vitest';
import { buildWebhookRequest } from '../src/helius/webhook-registration';
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
