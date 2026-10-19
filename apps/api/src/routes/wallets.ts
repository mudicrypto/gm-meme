import { type HoldingsResponse, LAMPORTS_PER_SOL, isSolanaAddress } from '@sift/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { HeliusClient } from '../helius/client';
import type { TokenRepository } from '../tokens/repository';
import { parseOrReply } from './validation';

const params = z.object({
  address: z.string().refine(isSolanaAddress, { message: 'not a Solana address' }),
});

/** Read-only view of a wallet's tokens. Public chain data; no keys involved. */
export const walletRoutes: FastifyPluginAsync<{
  helius: HeliusClient;
  repository: TokenRepository;
}> = async (app, { helius, repository }) => {
  app.get(
    '/wallets/:address/holdings',
    async (request, reply): Promise<HoldingsResponse | undefined> => {
      const p = parseOrReply(params, request.params, reply);
      if (!p) return;
      const { lamports, tokens } = await helius.getWalletHoldings(p.address);
      const levels = await repository.getRiskLevels(tokens.map((t) => t.mint));
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
          riskLevel: levels.get(t.mint),
        })),
      };
    },
  );
};
