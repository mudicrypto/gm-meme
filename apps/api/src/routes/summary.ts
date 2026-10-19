import { type TokenExplanation, isSolanaAddress } from '@sift/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { SummaryService } from '../summary/service';
import { parseOrReply } from './validation';

const params = z.object({
  mint: z.string().refine(isSolanaAddress, { message: 'not a Solana address' }),
});

export const summaryRoutes: FastifyPluginAsync<{ summary: SummaryService }> = async (
  app,
  { summary },
) => {
  app.get(
    '/tokens/:mint/summary',
    async (request, reply): Promise<TokenExplanation | undefined> => {
      const parsed = parseOrReply(params, request.params, reply);
      if (!parsed) return;
      const explanation = await summary.getSummary(parsed.mint);
      if (!explanation) {
        await reply
          .status(404)
          .send({ error: 'Not Found', message: 'No token mint at this address.' });
        return;
      }
      reply.header('cache-control', 'public, max-age=60');
      return explanation;
    },
  );
};
