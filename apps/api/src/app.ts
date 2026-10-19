import Fastify, { type FastifyBaseLogger, type FastifyError } from 'fastify';
import type { Config } from './config';
import { type HeliusClient, createHeliusClient } from './helius/client';
import { startHeliusPoller } from './helius/poller';
import { type JupiterClient, createJupiterClient } from './risk/jupiter';
import { createRiskService } from './risk/service';
import { healthRoutes } from './routes/health';
import { heliusWebhookRoutes } from './routes/helius-webhook';
import { riskRoutes } from './routes/risk';
import { tokenRoutes } from './routes/tokens';
import { createDiscoveryService } from './tokens/discovery';
import { InMemoryTokenRepository } from './tokens/memory-repository';
import type { TokenRepository } from './tokens/repository';
import { SupabaseTokenRepository, createSupabaseRpc } from './tokens/supabase-repository';

/** Overrides for tests. Anything left out is built from config. */
export interface AppDeps {
  tokenRepository?: TokenRepository;
  /** Pass null to run without Helius. */
  helius?: HeliusClient | null;
  /** Pass null to skip the Jupiter test sale. */
  jupiter?: JupiterClient | null;
  now?: () => Date;
}

/** Build the Fastify app without listening, so tests can use app.inject(). */
export function buildApp(config: Config, deps: AppDeps = {}) {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      // Keep secrets out of request logs.
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
  });

  // Don't leak internal error messages (database, upstream APIs) to clients.
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) {
      request.log.error({ err: error }, 'request failed');
      return reply.status(statusCode).send({ error: 'Internal Server Error' });
    }
    return reply.status(statusCode).send({ error: error.message });
  });

  const now = deps.now ?? (() => new Date());
  const repository = deps.tokenRepository ?? createTokenRepository(config, app.log);
  const helius =
    deps.helius !== undefined
      ? deps.helius
      : config.HELIUS_API_KEY
        ? createHeliusClient({ apiKey: config.HELIUS_API_KEY, cluster: config.SOLANA_CLUSTER })
        : null;
  if (!helius) app.log.warn('HELIUS_API_KEY not set: tokens will be stored without metadata');

  const discovery = createDiscoveryService({ repository, helius, log: app.log, now });

  app.register(healthRoutes, { config });
  app.register(tokenRoutes, { repository, now });

  if (helius) {
    // Jupiter only routes mainnet, so on devnet the test sale is skipped.
    const jupiter =
      deps.jupiter !== undefined
        ? deps.jupiter
        : config.SOLANA_CLUSTER === 'mainnet-beta'
          ? createJupiterClient({ baseUrl: config.JUPITER_API_URL, apiKey: config.JUPITER_API_KEY })
          : null;
    const risk = createRiskService({ helius, jupiter, repository, log: app.log, now });
    app.register(riskRoutes, { risk });
  } else {
    app.log.warn('HELIUS_API_KEY not set: GET /tokens/:mint/risk is disabled');
  }

  if (config.HELIUS_WEBHOOK_SECRET) {
    app.register(heliusWebhookRoutes, { secret: config.HELIUS_WEBHOOK_SECRET, discovery });
  } else {
    app.log.warn('HELIUS_WEBHOOK_SECRET not set: POST /webhooks/helius is disabled');
  }

  if (helius && config.HELIUS_POLL_INTERVAL_MS > 0) {
    let stopPolling: (() => void) | undefined;
    app.addHook('onReady', async () => {
      stopPolling = startHeliusPoller({
        helius,
        discovery,
        addresses: config.HELIUS_WATCH_ADDRESSES,
        intervalMs: config.HELIUS_POLL_INTERVAL_MS,
        log: app.log,
      });
    });
    app.addHook('onClose', async () => stopPolling?.());
  }

  return app;
}

function createTokenRepository(config: Config, log: FastifyBaseLogger): TokenRepository {
  if (config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY) {
    return new SupabaseTokenRepository(
      createSupabaseRpc(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY),
    );
  }
  log.warn('Supabase not configured: using an in-memory token store (lost on restart)');
  return new InMemoryTokenRepository();
}
