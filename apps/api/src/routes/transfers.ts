import { isSolanaAddress, transferProblems } from '@sift/shared';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import { type WalletChain, WITHDRAWAL_FEE_LAMPORTS } from '../sift-wallet/chain';
import { parseOrReply } from './validation';

const address = z.string().refine(isSolanaAddress, { message: 'not a Solana address' });
const transferBody = z
  .object({
    from: address,
    to: address,
    lamports: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .refine((t) => t.from !== t.to, { message: 'send to another address', path: ['to'] });
const sendBody = z.object({
  transfer: transferBody,
  transaction: z.string().min(100).max(2000),
});

/**
 * Sending SOL from a user's own wallet. Non-custodial: the API builds a plain transfer,
 * the device checks it is exactly that (`transferProblems`) and signs it, and the API
 * relays the signed transaction after checking it again. No keys reach the server.
 */
export const transferRoutes: FastifyPluginAsync<{ chain: WalletChain | null }> = async (
  app,
  { chain },
) => {
  app.post('/transfers/build', async (request, reply) => {
    if (!chain) return disabled(reply);
    const body = parseOrReply(transferBody, request.body, reply);
    if (!body) return;
    const balance = await chain.solBalance(body.from);
    if (body.lamports + WITHDRAWAL_FEE_LAMPORTS > balance) {
      return reply.status(422).send({
        error: 'Unprocessable Entity',
        code: 'BAD_AMOUNT',
        message: `You can send up to ${Math.max(0, balance - WITHDRAWAL_FEE_LAMPORTS) / 1e9} SOL.`,
      });
    }
    const transaction = await chain.buildTransfer(body.from, body.to, body.lamports);
    if (transferProblems(transaction, body).length > 0) {
      app.log.error('built a transfer that failed its own check');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
    return { transaction, feeLamports: WITHDRAWAL_FEE_LAMPORTS };
  });

  app.post('/transfers/send', async (request, reply) => {
    if (!chain) return disabled(reply);
    const body = parseOrReply(sendBody, request.body, reply);
    if (!body) return;
    // Relay only the transfer the user asked for, nothing else.
    if (transferProblems(body.transaction, body.transfer).length > 0) {
      return reply.status(422).send({
        error: 'Unprocessable Entity',
        code: 'CHECK_FAILED',
        message: 'That transaction isn’t the transfer you asked for, so it wasn’t sent.',
      });
    }
    try {
      return { signature: await chain.sendSigned(body.transaction) };
    } catch (err) {
      return reply.status(422).send({
        error: 'Unprocessable Entity',
        code: 'SEND_FAILED',
        message: `Solana rejected the transfer: ${(err as Error).message.slice(0, 160)}`,
      });
    }
  });
};

function disabled(reply: FastifyReply) {
  return reply.status(503).send({
    error: 'Service Unavailable',
    code: 'TRANSFERS_DISABLED',
    message: 'Sending is not available right now.',
  });
}
