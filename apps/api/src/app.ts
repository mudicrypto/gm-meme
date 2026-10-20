import cors from '@fastify/cors';
import Fastify, { type FastifyBaseLogger, type FastifyError } from 'fastify';
import type { Config } from './config';
import { type HeliusClient, createHeliusClient } from './helius/client';
import { startHeliusPoller } from './helius/poller';
import { type JupiterClient, createJupiterClient } from './risk/jupiter';
import { createRiskQueue } from './risk/queue';
import { createRiskService } from './risk/service';
import { type SummaryModel, createClaudeSummaryModel } from './summary/claude';
import { createSummaryService } from './summary/service';
import { type Airdrop, createAirdrop, createDefaultTradeService } from './trading/factory';
import type { TradeService } from './trading/service';
import { createAuth } from './social/auth';
import { startAlertChecker } from './social/alerts';
import { InMemorySocialRepository } from './social/memory-repository';
import { type PushSender, createExpoPushSender } from './social/push';
import type { SocialRepository } from './social/repository';
import { createSocialService } from './social/service';
import { SupabaseSocialRepository } from './social/supabase-repository';
import { healthRoutes } from './routes/health';
import { chartRoutes } from './routes/chart';
import { heliusWebhookRoutes } from './routes/helius-webhook';
import { riskRoutes } from './routes/risk';
import { socialRoutes } from './routes/social';
import { summaryRoutes } from './routes/summary';
import { tokenRoutes } from './routes/tokens';
import { tradeRoutes } from './routes/trades';
import { walletRoutes } from './routes/wallets';
import { createDiscoveryService } from './tokens/discovery';
import { InMemoryTokenRepository } from './tokens/memory-repository';
import type { TokenRepository } from './tokens/repository';
import { SupabaseTokenRepository, createSupabaseRpc } from './tokens/supabase-repository';

/** Overrides for tests. Anything left out is built from config. */
export interface AppDeps {
  tokenRepository?: TokenRepository;
  socialRepository?: SocialRepository;
  /** Pass null to skip push notifications. */
  push?: PushSender | null;
  /** Pass null to run without Helius. */
  helius?: HeliusClient | null;
  /** Pass null to skip the Jupiter test sale. */
  jupiter?: JupiterClient | null;
  /** Pass null for rules-only summaries. */
  summaryModel?: SummaryModel | null;
  /** Pass null to disable trading. */
  tradeService?: TradeService | null;
  airdrop?: Airdrop;
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
  // Only for the web build. Sign-in uses bearer tokens, never cookies.
  app.register(cors, {
    origin: config.CORS_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['content-type', 'authorization'],
  });

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

  const socialRepository = deps.socialRepository ?? createSocialRepository(config, app.log);
  const auth = createAuth({ repository: socialRepository, now });
  const social = createSocialService({ social: socialRepository, tokens: repository, now });
  app.register(socialRoutes, { auth, social });

  const push =
    deps.push !== undefined
      ? deps.push
      : createExpoPushSender({ accessToken: config.EXPO_ACCESS_TOKEN });
  if (config.ALERT_CHECK_INTERVAL_MS > 0) {
    let stopAlerts: (() => void) | undefined;
    app.addHook('onReady', async () => {
      stopAlerts = startAlertChecker({
        social: socialRepository,
        tokens: repository,
        push,
        intervalMs: config.ALERT_CHECK_INTERVAL_MS,
        log: app.log,
        now,
      });
    });
    app.addHook('onClose', async () => stopAlerts?.());
  }
  // Trades made in Sift go to followers' feeds, for people who opted in to sharing.
  const recordTrade = (trade: Parameters<SocialRepository['recordTrade']>[0]) =>
    socialRepository.recordTrade(trade).then(
      () => undefined,
      (err: unknown) => app.log.error({ err }, 'could not record shared trade'),
    );

  app.register(healthRoutes, { config });
  app.register(tokenRoutes, { repository, now });
  app.register(chartRoutes, { repository, now });

  // Newly launched tokens are scored in the background for the feeds' risk badges.
  let onLaunched: ((mints: string[]) => void) | undefined;

  if (helius) {
    // Jupiter only routes mainnet, so on devnet the test sale is skipped.
    const jupiter =
      deps.jupiter !== undefined
        ? deps.jupiter
        : config.SOLANA_CLUSTER === 'mainnet-beta'
          ? createJupiterClient({ baseUrl: config.JUPITER_API_URL, apiKey: config.JUPITER_API_KEY })
          : null;
    const risk = createRiskService({
      helius,
      jupiter,
      repository,
      log: app.log,
      now,
      onScored: (score) => repository.setRiskLevel(score.mint, score.level, score.checkedAt),
    });
    const riskQueue = createRiskQueue({ risk, log: app.log });
    onLaunched = (mints) => riskQueue.enqueue(mints);
    app.register(riskRoutes, { risk });
    app.register(walletRoutes, {
      helius,
      repository,
      scoreLater: (mints) => riskQueue.enqueue(mints),
    });

    const tradingEnabled = config.SOLANA_CLUSTER === 'devnet' || config.ALLOW_MAINNET_TRADING;
    const trades =
      deps.tradeService !== undefined
        ? deps.tradeService
        : tradingEnabled && config.HELIUS_API_KEY
          ? createDefaultTradeService(config, config.HELIUS_API_KEY, app.log, recordTrade)
          : null;
    if (!trades)
      app.log.warn('trading disabled (mainnet needs ALLOW_MAINNET_TRADING after Step 8)');
    app.register(tradeRoutes, {
      trades,
      cluster: config.SOLANA_CLUSTER,
      platformFeeBps: config.FEE_WALLET ? config.PLATFORM_FEE_BPS : 0,
      feeWallet: config.FEE_WALLET ?? null,
      airdrop: config.SOLANA_CLUSTER === 'devnet' ? (deps.airdrop ?? createAirdrop(config)) : null,
    });

    const summaryModel =
      deps.summaryModel !== undefined
        ? deps.summaryModel
        : config.ANTHROPIC_API_KEY
          ? createClaudeSummaryModel({
              apiKey: config.ANTHROPIC_API_KEY,
              model: config.SUMMARY_MODEL,
            })
          : null;
    if (!summaryModel) app.log.warn('ANTHROPIC_API_KEY not set: summaries are rules-based, not AI');
    const summary = createSummaryService({
      risk,
      repository,
      model: summaryModel,
      log: app.log,
      now,
    });
    app.register(summaryRoutes, { summary });
  } else {
    app.log.warn('HELIUS_API_KEY not set: GET /tokens/:mint/risk and /summary are disabled');
  }

  const discovery = createDiscoveryService({ repository, helius, log: app.log, now, onLaunched });

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

function createSocialRepository(config: Config, log: FastifyBaseLogger): SocialRepository {
  if (config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY) {
    return new SupabaseSocialRepository(
      createSupabaseRpc(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY),
    );
  }
  log.warn('Supabase not configured: profiles and sign-ins are in memory (lost on restart)');
  return new InMemorySocialRepository();
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
