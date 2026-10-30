import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Auth } from '../social/auth';
import type { SocialRepository } from '../social/repository';
import { SiftWalletError, type SiftWalletService } from '../sift-wallet/service';
import { parseOrReply } from './validation';

const deleteBody = z.object({ confirm: z.literal('DELETE') });

/**
 * Account deletion (required by both app stores). Deletes everything Sift keeps about the
 * signed-in wallet. A Sift wallet must be empty first; the phone's own wallet and its key
 * stay on the phone (Sift never had them).
 */
export const accountRoutes: FastifyPluginAsync<{
  auth: Auth;
  social: SocialRepository;
  wallets: SiftWalletService;
}> = async (app, { auth, social, wallets }) => {
  app.delete('/me', async (request, reply) => {
    void reply.header('cache-control', 'no-store');
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
    const owner = token ? await auth.walletFor(token) : null;
    if (!owner)
      return reply
        .status(401)
        .send({ error: 'Unauthorized', message: 'Sign in with your wallet.' });
    const body = parseOrReply(deleteBody, request.body, reply);
    if (!body) return;
    try {
      await wallets.deleteForAccount(owner);
    } catch (error) {
      if (error instanceof SiftWalletError)
        return reply.status(error.statusCode).send({ error: error.code, message: error.message });
      throw error;
    }
    await social.deleteAccount(owner);
    request.log.info('account deleted');
    return reply.status(204).send();
  });
};
