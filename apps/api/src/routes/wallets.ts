import { type HoldingsResponse, LAMPORTS_PER_SOL, isSolanaAddress } from '@sift/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { HeliusClient } from '../helius/client';
import { RISK_BADGE_MAX_AGE_MS, type TokenRepository } from '../tokens/repository';
import { parseOrReply } from './validation';

const params = z.object({
  address: z.string().refine(isSolanaAddress, { message: 'not a Solana address' }),
});

/** Holdings without a stored risk level that get scored per request. */
const MAX_SCORED_PER_REQUEST = 20;

/** Read-only view of a wallet's tokens. Public chain data; no keys involved. */
export const walletRoutes: FastifyPluginAsync<{
  helius: HeliusClient;
  repository: TokenRepository;
  /** Queue tokens for background risk scoring. */
  scoreLater: (mints: string[]) => void;
  now: () => Date;
}> = async (app, { helius, repository, scoreLater, now }) => {
  app.get(
    '/wallets/:address/holdings',
    async (request, reply): Promise<HoldingsResponse | undefined> => {
      const p = parseOrReply(params, request.params, reply);
      if (!p) return;
      const { lamports, tokens } = await helius.getWalletHoldings(p.address);
      const levels = await repository.getRiskLevels(
        tokens.map((t) => t.mint),
        new Date(now().getTime() - RISK_BADGE_MAX_AGE_MS),
      );

      // Tokens Sift hasn't scored lately: store what DAS told us (risk levels attach to
      // stored tokens), then score them in the background so the next view has badges.
      const unscored = tokens.filter((t) => !levels.has(t.mint)).slice(0, MAX_SCORED_PER_REQUEST);
      if (unscored.length > 0) {
        await repository.upsertTokens(
          unscored.map(({ amount: _amount, amountRaw: _raw, ...metadata }) => ({
            ...metadata,
            enrichedAt: new Date().toISOString(),
          })),
        );
        scoreLater(unscored.map((t) => t.mint));
      }

      reply.header('cache-control', 'private, max-age=15');
      return {
        address: p.address,
        solBalance: lamports / LAMPORTS_PER_SOL,
        holdings: tokens.map((t) => ({
          mint: t.mint,
          symbol: t.symbol,
          name: t.name,
          imageUrl: t.imageUrl,
          amount: t.amount,
          amountRaw: t.amountRaw,
          decimals: t.decimals,
          riskLevel: levels.get(t.mint),
        })),
      };
    },
  );
};
