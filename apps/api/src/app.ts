import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { LAMPORTS_PER_SOL } from '@sift/shared';
import Fastify, { type FastifyBaseLogger, type FastifyError } from 'fastify';
import type { Config } from './config';
import { type HeliusClient, createHeliusClient } from './helius/client';
import { startHeliusPoller } from './helius/poller';
import { type JupiterClient, createJupiterClient } from './risk/jupiter';
import { createRiskQueue } from './risk/queue';
import { createRiskService } from './risk/service';
import { type SummaryModel, createClaudeSummaryModel } from './summary/claude';
import { createSummaryService } from './summary/service';
import {
  type Airdrop,
  createAirdrop,
  createDefaultTradeService,
  createDefaultWalletChain,
} from './trading/factory';
import type { ConfirmedTrade, TradeService } from './trading/service';
import { siftWalletRoutes } from './routes/sift-wallet';
import type { WalletChain } from './sift-wallet/chain';
import { InMemorySiftWalletRepository } from './sift-wallet/memory-repository';
import type { SiftWalletRepository } from './sift-wallet/repository';
import { createSiftWalletService } from './sift-wallet/service';
import { type WalletSigner, createPrivySigner } from './sift-wallet/signer';
import { SupabaseSiftWalletRepository } from './sift-wallet/supabase-repository';
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
  siftWalletRepository?: SiftWalletRepository;
  /** Pass null to run without a signing provider (no Sift wallets). */
  walletSigner?: WalletSigner | null;
  walletChain?: WalletChain | null;
  now?: () => Date;
}

/**
 * Per-IP limits for routes that cost money or upstream quota (Helius, Claude, Solana RPC),
 * per minute unless stated. Everything else gets RATE_LIMIT_PER_MINUTE.
 */
const ROUTE_LIMITS: Record<string, { max: number; timeWindow?: number }> = {
  'GET /tokens/:mint/summary': { max: 10 },
  'GET /tokens/:mint/risk': { max: 20 },
  'GET /wallets/:address/holdings': { max: 30 },
  'GET /tokens/stats': { max: 30 },
  'POST /trades/quote': { max: 20 },
  'POST /trades/submit': { max: 20 },
  'GET /trades/:signature': { max: 60 },
  'POST /wallets/:address/airdrop': { max: 3, timeWindow: 60 * 60_000 },
  'POST /auth/challenge': { max: 10 },
  'POST /auth/session': { max: 10 },
  'PUT /me/profile': { max: 10 },
  'GET /profiles': { max: 30 },
  'POST /me/alerts': { max: 20 },
  'POST /me/push-test': { max: 3, timeWindow: 60 * 60_000 },
  'POST /me/sift-wallet': { max: 5 },
  'PUT /me/sift-wallet/limits': { max: 10 },
  'POST /me/sift-wallet/unfreeze': { max: 10 },
  'POST /me/sift-wallet/2fa': { max: 5 },
  'POST /me/sift-wallet/2fa/confirm': { max: 10 },
  'PUT /me/sift-wallet/withdrawal-address': { max: 5 },
  'POST /me/sift-wallet/withdraw': { max: 5, timeWindow: 60 * 60_000 },
  'POST /me/sift-wallet/export': { max: 3, timeWindow: 60 * 60_000 },
  'POST /me/sift-wallet/trades': { max: 20 },
  'POST /me/orders': { max: 20 },
};
// Authenticated by its own secret and called by Helius in bursts; health is for monitors.
const UNLIMITED_ROUTES = new Set(['POST /webhooks/helius', 'GET /health', 'HEAD /health']);

/** Build the Fastify app without listening, so tests can use app.inject(). */
export function buildApp(config: Config, deps: AppDeps = {}) {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      // Keep secrets out of request logs.
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    // Behind a load balancer, read the client IP from X-Forwarded-For, trusting only the
    // configured number of hops (more would let clients pick their own IP).
    trustProxy:
      config.TRUST_PROXY_HOPS > 0 ? (_address, hop) => hop < config.TRUST_PROXY_HOPS : false,
  });

  // Set each route's limit before the rate-limit plugin reads it (hooks run in order).
  app.addHook('onRoute', (route) => {
    for (const method of [route.method].flat()) {
      const key = `${method} ${route.url}`;
      if (UNLIMITED_ROUTES.has(key)) route.config = { ...route.config, rateLimit: false };
      const limit = ROUTE_LIMITS[key];
      if (limit) {
        route.config = {
          ...route.config,
          rateLimit: { max: limit.max, timeWindow: limit.timeWindow ?? 60_000 },
        };
      }
    }
  });
  app.register(rateLimit, {
    global: true,
    max: config.RATE_LIMIT_PER_MINUTE,
    timeWindow: 60_000,
    // A real Error, so every route's error handler passes it on as a 429.
    errorResponseBuilder: () =>
      Object.assign(new Error('Too many requests. Wait a minute and try again.'), {
        statusCode: 429,
      }),
  });

  // A JSON API: nothing here should be sniffed as another type, framed, or sent a referrer.
  app.addHook('onSend', async (_request, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'no-referrer');
  });

  // Only for the web build. Sign-in uses bearer tokens, never cookies.
  app.register(cors, {
    origin: config.CORS_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['content-type', 'authorization'],
  });

  // Don't leak internal error messages (database, upstream APIs) to clients.
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    if (statusCode === 429) {
      return reply.status(429).send({ error: 'Too Many Requests', message: error.message });
    }
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
  const push =
    deps.push !== undefined
      ? deps.push
      : createExpoPushSender({ accessToken: config.EXPO_ACCESS_TOKEN });
  app.register(socialRoutes, { auth, social, push });

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
  // A confirmed Sift trade is a price point (charts, alerts), and goes to followers' feeds
  // if its trader opted in to sharing.
  const recordTrade = async (trade: ConfirmedTrade) => {
    try {
      await repository.upsertTokens([{ mint: trade.mint }]);
      await Promise.all([
        repository.recordSwaps([
          {
            signature: trade.signature,
            mint: trade.mint,
            trader: trade.wallet,
            side: trade.side,
            volumeSol: trade.solLamports / LAMPORTS_PER_SOL,
            tokenAmount: Number(trade.tokenAmount) / 10 ** trade.tokenDecimals,
            blockTime: trade.at,
          },
        ]),
        socialRepository.recordTrade(trade),
      ]);
    } catch (err) {
      app.log.error({ err }, 'could not record confirmed trade');
    }
  };

  app.register(healthRoutes, { config });
  // Set once the risk queue exists (it needs Helius).
  let rescore: ((mints: string[]) => void) | undefined;
  app.register(tokenRoutes, { repository, now, scoreLater: (mints) => rescore?.(mints) });
  app.register(chartRoutes, { repository, now });

  // Without Helius there is no default trade service, but tests can still pass one in.
  let trades: TradeService | null = deps.tradeService ?? null;
  let walletChain: WalletChain | null = deps.walletChain ?? null;

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
    rescore = (mints) => riskQueue.enqueue(mints);
    app.register(riskRoutes, { risk });
    app.register(walletRoutes, {
      helius,
      repository,
      scoreLater: (mints) => riskQueue.enqueue(mints),
      now,
    });

    const tradingEnabled = config.SOLANA_CLUSTER === 'devnet' || config.ALLOW_MAINNET_TRADING;
    trades =
      deps.tradeService !== undefined
        ? deps.tradeService
        : tradingEnabled && config.HELIUS_API_KEY
          ? createDefaultTradeService(config, config.HELIUS_API_KEY, app.log, recordTrade)
          : null;
    if (!trades)
      app.log.warn('trading disabled (mainnet needs ALLOW_MAINNET_TRADING after Step 8)');
    if (deps.walletChain === undefined && trades && config.HELIUS_API_KEY)
      walletChain = createDefaultWalletChain(config, config.HELIUS_API_KEY);
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
      maxModelCallsPerHour: config.SUMMARY_MAX_CALLS_PER_HOUR,
    });
    app.register(summaryRoutes, { summary });
  } else {
    app.log.warn('HELIUS_API_KEY not set: GET /tokens/:mint/risk and /summary are disabled');
  }

  const walletSigner =
    deps.walletSigner !== undefined ? deps.walletSigner : createWalletSigner(config);
  if (!walletSigner) app.log.warn('Privy not configured: Sift wallets are disabled');
  const wallets = createSiftWalletService({
    repo: deps.siftWalletRepository ?? createSiftWalletRepository(config),
    signer: walletSigner,
    trades,
    chain: walletChain,
    tokens: repository,
    feeWallet: config.FEE_WALLET ?? null,
    platformFeeBps: config.FEE_WALLET ? config.PLATFORM_FEE_BPS : 0,
    signingFrozen: config.SIFT_SIGNING_FROZEN,
    log: app.log,
    now,
    notify: async (owner, title, body) => {
      if (!push) return;
      const devices = await socialRepository.pushTokens([owner]);
      if (devices.length === 0) return;
      await push.send(devices.map((device) => ({ to: device.token, title, body })));
    },
  });
  app.register(siftWalletRoutes, { auth, wallets });
  if (config.ORDER_CHECK_INTERVAL_MS > 0) {
    let timer: NodeJS.Timeout | undefined;
    let running = false;
    app.addHook('onReady', async () => {
      timer = setInterval(() => {
        if (running) return;
        running = true;
        wallets
          .runOrders()
          .catch((err: unknown) => app.log.error({ err }, 'order engine pass failed'))
          .finally(() => {
            running = false;
          });
      }, config.ORDER_CHECK_INTERVAL_MS);
      timer.unref();
    });
    app.addHook('onClose', async () => clearInterval(timer));
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

function createWalletSigner(config: Config): WalletSigner | null {
  if (
    !config.PRIVY_APP_ID ||
    !config.PRIVY_APP_SECRET ||
    !config.PRIVY_AUTHORIZATION_KEY ||
    !config.PRIVY_OWNER_ID
  )
    return null;
  return createPrivySigner({
    appId: config.PRIVY_APP_ID,
    appSecret: config.PRIVY_APP_SECRET,
    authorizationKey: config.PRIVY_AUTHORIZATION_KEY,
    ownerId: config.PRIVY_OWNER_ID,
    // The policy's ceiling on any single SOL transfer (withdrawals): 50 SOL on devnet.
    maxTransferLamports: 50 * LAMPORTS_PER_SOL,
  });
}

function createSiftWalletRepository(config: Config): SiftWalletRepository {
  if (config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY) {
    return new SupabaseSiftWalletRepository(
      createSupabaseRpc(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY),
    );
  }
  return new InMemorySiftWalletRepository();
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
