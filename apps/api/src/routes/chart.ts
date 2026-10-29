import {
  type TokenActivityResponse,
  type TokenChartResponse,
  type TokenStatsResponse,
  isSolanaAddress,
} from '@sift/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { buildChart, buildStats } from '../tokens/chart';
import type { TokenRepository } from '../tokens/repository';
import { parseOrReply } from './validation';

const params = z.object({
  mint: z.string().refine(isSolanaAddress, { message: 'not a Solana address' }),
});
const query = z.object({ windowMinutes: z.coerce.number().int().min(5).max(1440).default(60) });

const statsQuery = z.object({
  mints: z
    .string()
    .transform((value) => [
      ...new Set(
        value
          .split(',')
          .map((m) => m.trim())
          .filter(Boolean),
      ),
    ])
    .pipe(
      z
        .array(z.string().refine(isSolanaAddress, { message: 'not a Solana address' }))
        .min(1)
        .max(50),
    ),
  windowMinutes: z.coerce.number().int().min(5).max(1440).default(60),
});

const BUCKETS = 60;
const SPARK_BUCKETS = 24;
const MAX_TRADES = 5000;
const STATS_MAX_TRADES = 2000;
const ACTIVITY_LIMIT = 30;

/** Price chart built from the trades Sift has recorded. */
export const chartRoutes: FastifyPluginAsync<{
  repository: TokenRepository;
  now: () => Date;
}> = async (app, { repository, now }) => {
  app.get(
    '/tokens/:mint/chart',
    async (request, reply): Promise<TokenChartResponse | undefined> => {
      const p = parseOrReply(params, request.params, reply);
      const q = p && parseOrReply(query, request.query, reply);
      if (!p || !q) return;
      const at = now();
      const since = new Date(at.getTime() - q.windowMinutes * 60_000);
      const trades = await repository.getTrades(p.mint, since, MAX_TRADES);
      reply.header('cache-control', 'public, max-age=10');
      return {
        mint: p.mint,
        windowMinutes: q.windowMinutes,
        points: buildChart(trades, { since, now: at, buckets: BUCKETS }),
      };
    },
  );

  // Price, change, volume and a sparkline for many tokens at once (the Discover list).
  app.get('/tokens/stats', async (request, reply): Promise<TokenStatsResponse | undefined> => {
    const q = parseOrReply(statsQuery, request.query, reply);
    if (!q) return;
    const at = now();
    const since = new Date(at.getTime() - q.windowMinutes * 60_000);
    const stats = await Promise.all(
      q.mints.map(async (mint) => {
        const [trades, token] = await Promise.all([
          repository.getTrades(mint, since, STATS_MAX_TRADES),
          repository.getToken(mint),
        ]);
        return buildStats(mint, trades, {
          since,
          now: at,
          buckets: SPARK_BUCKETS,
          // Helius reports supply in base units.
          ...(token?.supply && token.decimals !== undefined
            ? { supply: token.supply / 10 ** token.decimals }
            : {}),
        });
      }),
    );
    reply.header('cache-control', 'public, max-age=10');
    return { windowMinutes: q.windowMinutes, stats };
  });

  // The latest recorded trades of a token, newest first.
  app.get(
    '/tokens/:mint/activity',
    async (request, reply): Promise<TokenActivityResponse | undefined> => {
      const p = parseOrReply(params, request.params, reply);
      if (!p) return;
      const since = new Date(now().getTime() - 24 * 60 * 60_000);
      const trades = await repository.getTrades(p.mint, since, MAX_TRADES);
      reply.header('cache-control', 'public, max-age=5');
      return {
        mint: p.mint,
        trades: trades
          .slice(-ACTIVITY_LIMIT)
          .reverse()
          .map((trade) => ({
            at: trade.blockTime,
            side: trade.side ?? 'unknown',
            priceSol: trade.priceSol,
            volumeSol: trade.volumeSol,
            tokenAmount: trade.priceSol > 0 ? trade.volumeSol / trade.priceSol : 0,
          })),
      };
    },
  );
};
