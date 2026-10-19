// Register (create) the Helius webhook that feeds token discovery.
// Usage: pnpm --filter @sift/api helius:webhook https://<public-host>/webhooks/helius
import { loadConfig } from '../src/config';
import { buildWebhookRequest } from '../src/helius/webhook-registration';

const webhookURL = process.argv[2];
if (!webhookURL) {
  console.error(
    'Usage: pnpm --filter @sift/api helius:webhook https://<public-host>/webhooks/helius',
  );
  process.exit(1);
}

const config = loadConfig();
if (!config.HELIUS_API_KEY || !config.HELIUS_WEBHOOK_SECRET) {
  console.error('Set HELIUS_API_KEY and HELIUS_WEBHOOK_SECRET in apps/api/.env first.');
  process.exit(1);
}

const request = buildWebhookRequest(config.HELIUS_API_KEY, {
  webhookURL,
  cluster: config.SOLANA_CLUSTER,
  accountAddresses: config.HELIUS_WATCH_ADDRESSES,
  secret: config.HELIUS_WEBHOOK_SECRET,
});

const res = await fetch(request.url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(request.body),
});
const text = await res.text();
if (!res.ok) {
  console.error(`Helius rejected the webhook (HTTP ${res.status}): ${text}`);
  process.exit(1);
}
const { webhookID } = JSON.parse(text) as { webhookID?: string };
console.log(
  `Webhook ${webhookID} created: ${request.body.webhookType} on ${request.body.accountAddresses.join(', ')}`,
);
