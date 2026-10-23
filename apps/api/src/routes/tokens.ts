import type { TokenListResponse, TrendingResponse } from '@sift/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { TokenSummary } from '@sift/shared';
import { RISK_BADGE_MAX_AGE_MS, type TokenRepository } from '../tokens/repository';
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
  /** Rescore tokens whose badge is missing or stale (absent without Helius). */
  scoreLater?: (mints: string[]) => void;
}> = async (app, { repository, now, scoreLater }) => {
  // A stale badge reads as "not checked yet", and the token goes back in the scoring queue.
  const freshBadges = <T extends TokenSummary>(tokens: T[]): T[] => {
    const cutoff = now().getTime() - RISK_BADGE_MAX_AGE_MS;
    const stale: string[] = [];
    const out = tokens.map((token) => {
      if (token.riskCheckedAt && Date.parse(token.riskCheckedAt) >= cutoff) return token;
      stale.push(token.mint);
      return { ...token, riskLevel: undefined, riskCheckedAt: undefined };
    });
    if (stale.length > 0) scoreLater?.(stale);
    return out;
  };

  app.get('/tokens/new', async (request, reply): Promise<TokenListResponse | undefined> => {
    const query = parseOrReply(newQuery, request.query, reply);
    if (!query) return;
    reply.header('cache-control', CACHE_CONTROL);
    return { tokens: freshBadges(await repository.listNew(query.limit)) };
  });

  app.get('/tokens/trending', async (request, reply): Promise<TrendingResponse | undefined> => {
    const query = parseOrReply(trendingQuery, request.query, reply);
    if (!query) return;
    const since = new Date(now().getTime() - query.windowMinutes * 60_000);
    reply.header('cache-control', CACHE_CONTROL);
    return {
      tokens: freshBadges(await repository.listTrending({ since, limit: query.limit })),
      windowMinutes: query.windowMinutes,
    };
  });
};
