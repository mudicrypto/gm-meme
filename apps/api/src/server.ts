import { buildApp } from './app';
import { loadConfig } from './config';

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
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
