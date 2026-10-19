import type { SolanaCluster } from '@sift/shared';

// Webhook management lives on the mainnet host for every cluster (as in helius-sdk);
// webhookType picks the cluster the webhook listens to.
const WEBHOOKS_URL = 'https://api-mainnet.helius-rpc.com/v0/webhooks';

export interface WebhookRegistration {
  webhookURL: string;
  cluster: SolanaCluster;
  accountAddresses: readonly string[];
  /** Sent back in the Authorization header of every delivery. */
  secret: string;
}

/** The Helius create-webhook request for Sift's discovery feed. */
export function buildWebhookRequest(apiKey: string, registration: WebhookRegistration) {
  const url = new URL(registration.webhookURL);
  if (url.protocol !== 'https:') throw new Error('Webhook URL must use https');
  if (!url.pathname.endsWith('/webhooks/helius')) {
    throw new Error('Webhook URL must point at /webhooks/helius');
  }

  return {
    url: `${WEBHOOKS_URL}?api-key=${encodeURIComponent(apiKey)}`,
    body: {
      webhookURL: registration.webhookURL,
      // The parser picks out launches and swaps itself.
      transactionTypes: ['ANY'],
      accountAddresses: [...registration.accountAddresses],
      webhookType: registration.cluster === 'devnet' ? 'enhancedDevnet' : 'enhanced',
      authHeader: registration.secret,
      txnStatus: 'success',
    },
  };
}
