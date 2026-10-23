import { buildApp } from './app';
import { loadConfig } from './config';
import { syncWebhook } from './helius/webhook-registration';

const config = loadConfig();
const app = buildApp(config);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  await app.listen({ port: config.PORT, host: config.HOST });
  app.log.info({ cluster: config.SOLANA_CLUSTER }, 'Sift API ready');
  void registerWebhook();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

/** Point Helius discovery webhooks at this server, when it has a public address. */
async function registerWebhook() {
  const publicUrl = config.PUBLIC_URL ?? config.RENDER_EXTERNAL_URL;
  if (!publicUrl || !config.HELIUS_API_KEY || !config.HELIUS_WEBHOOK_SECRET) return;
  try {
    const result = await syncWebhook(config.HELIUS_API_KEY, {
      webhookURL: new URL('/webhooks/helius', publicUrl).toString(),
      cluster: config.SOLANA_CLUSTER,
      accountAddresses: config.HELIUS_WATCH_ADDRESSES,
      secret: config.HELIUS_WEBHOOK_SECRET,
    });
    app.log.info(result, 'Helius webhook registered');
  } catch (err) {
    app.log.error({ err }, 'could not register the Helius webhook');
  }
}
