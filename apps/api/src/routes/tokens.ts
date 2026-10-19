import type { TokenListResponse, TrendingResponse } from '@sift/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { TokenRepository } from '../tokens/repository';
import { parseOrReply } from './validation';

const limit = z.coerce.number().int().min(1).max(100).default(50);

const newQuery = z.object({ limit });
const trendingQuery = z.object({
  limit,
  windowMinutes: z.coerce.number().int().min(5).max(1440).default(60),
});

// The feed changes every few seconds; a short cache absorbs bursts of refreshes.
const CACHE_CONTROL = 'public, max-age=5';

export const tokenRoutes: FastifyPluginAsync<{
  repository: TokenRepository;
  now: () => Date;
}> = async (app, { repository, now }) => {
  app.get('/tokens/new', async (request, reply): Promise<TokenListResponse | undefined> => {
    const query = parseOrReply(newQuery, request.query, reply);
    if (!query) return;
    reply.header('cache-control', CACHE_CONTROL);
    return { tokens: await repository.listNew(query.limit) };
  });

  app.get('/tokens/trending', async (request, reply): Promise<TrendingResponse | undefined> => {
    const query = parseOrReply(trendingQuery, request.query, reply);
    if (!query) return;
    const since = new Date(now().getTime() - query.windowMinutes * 60_000);
    reply.header('cache-control', CACHE_CONTROL);
    return {
      tokens: await repository.listTrending({ since, limit: query.limit }),
      windowMinutes: query.windowMinutes,
    };
  });
};
