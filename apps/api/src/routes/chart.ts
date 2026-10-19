import { type TokenChartResponse, isSolanaAddress } from '@sift/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { buildChart } from '../tokens/chart';
import type { TokenRepository } from '../tokens/repository';
import { parseOrReply } from './validation';

const params = z.object({
  mint: z.string().refine(isSolanaAddress, { message: 'not a Solana address' }),
});
const query = z.object({ windowMinutes: z.coerce.number().int().min(5).max(1440).default(60) });

const BUCKETS = 60;
const MAX_TRADES = 5000;

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
};
