import { type RiskScore, isSolanaAddress } from '@sift/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { RiskService } from '../risk/service';
import { parseOrReply } from './validation';

const params = z.object({
  mint: z.string().refine(isSolanaAddress, { message: 'not a Solana address' }),
});

export const riskRoutes: FastifyPluginAsync<{ risk: RiskService }> = async (app, { risk }) => {
  app.get('/tokens/:mint/risk', async (request, reply): Promise<RiskScore | undefined> => {
    const parsed = parseOrReply(params, request.params, reply);
    if (!parsed) return;
    const score = await risk.getRisk(parsed.mint);
    if (!score) {
      await reply
        .status(404)
        .send({ error: 'Not Found', message: 'No token mint at this address.' });
      return;
    }
    reply.header('cache-control', 'public, max-age=30');
    return score;
  });
};
