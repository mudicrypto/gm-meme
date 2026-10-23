import type { SolanaCluster } from '@sift/shared';
import { z } from 'zod';

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

const listedWebhook = z.object({ webhookID: z.string(), webhookURL: z.string() });

/**
 * Make sure Helius sends discovery webhooks to this server: update the webhook already
 * pointing here, or create one. Safe to run on every start.
 */
export async function syncWebhook(
  apiKey: string,
  registration: WebhookRegistration,
  fetchFn: typeof fetch = fetch,
): Promise<{ webhookID: string; created: boolean }> {
  const request = buildWebhookRequest(apiKey, registration);
  const key = `api-key=${encodeURIComponent(apiKey)}`;
  const send = async (url: string, method: 'GET' | 'POST' | 'PUT', body?: unknown) => {
    const res = await fetchFn(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // The URL carries the API key: never include it in errors.
    if (!res.ok) throw new Error(`Helius webhooks ${method} failed: HTTP ${res.status}`);
    return res.json() as Promise<unknown>;
  };

  const existing = z
    .array(listedWebhook.loose())
    .catch([])
    .parse(await send(`${WEBHOOKS_URL}?${key}`, 'GET'))
    .find((hook) => hook.webhookURL === registration.webhookURL);
  if (existing) {
    await send(
      `${WEBHOOKS_URL}/${encodeURIComponent(existing.webhookID)}?${key}`,
      'PUT',
      request.body,
    );
    return { webhookID: existing.webhookID, created: false };
  }
  const created = z
    .object({ webhookID: z.string() })
    .loose()
    .parse(await send(request.url, 'POST', request.body));
  return { webhookID: created.webhookID, created: true };
}
