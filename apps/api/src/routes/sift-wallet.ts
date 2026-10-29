import { MAX_ORDER_EXPIRY_DAYS, isSolanaAddress } from '@sift/shared';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { SiftWalletError, type SiftWalletService } from '../sift-wallet/service';
import { SignerError } from '../sift-wallet/signer';
import type { Auth } from '../social/auth';
import { TradeError } from '../trading/errors';
import { parseOrReply } from './validation';

const address = z.string().refine(isSolanaAddress, { message: 'not a Solana address' });
const code = z.string().regex(/^\d{6}$/, '6 digits');
const lamports = z
  .number()
  .int()
  .positive()
  .max(1_000_000 * 1e9);

const limitsBody = z.object({
  perOrderLamports: lamports,
  dailyLamports: lamports,
  code: code.optional(),
});
const codeBody = z.object({ code });
const optionalCodeBody = z.object({ code: code.optional() });
const addressBody = z.object({ address, code });
const withdrawBody = z.object({ lamports, code });
const exportBody = z.object({
  code,
  // An uncompressed P-256 public key (65 bytes), base64.
  recipientPublicKey: z
    .string()
    .regex(/^[A-Za-z0-9+/]{87}=$/, 'a base64 P-256 public key')
    .refine((value) => Buffer.from(value, 'base64')[0] === 4, 'an uncompressed P-256 key'),
});
const tradeBody = z.object({ quoteId: z.string().regex(/^[0-9a-f]{32}$/) });
const orderRequest = z.object({
  mint: address,
  kind: z.enum(['limit_buy', 'stop_loss', 'take_profit']),
  triggerPriceSol: z.number().positive().finite().max(1e9),
  buyLamports: lamports.optional(),
  sellPercent: z.number().int().min(1).max(100).optional(),
  trailing: z.boolean().optional(),
  slippageBps: z.number().int().min(50).max(3000),
  expiresInDays: z.number().int().min(1).max(MAX_ORDER_EXPIRY_DAYS),
});
const ordersBody = z.object({
  orders: z.array(orderRequest).min(1).max(2),
  // "Protect this trade" places its two orders together.
  protect: z.boolean().optional(),
});
const orderParams = z.object({ id: z.uuid() });

/** The Sift wallet and its automatic orders. Needs sign-in. */
export const siftWalletRoutes: FastifyPluginAsync<{
  auth: Auth;
  wallets: SiftWalletService;
}> = async (app, { auth, wallets }) => {
  const signedIn = async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
    const owner = token ? await auth.walletFor(token) : null;
    if (!owner) {
      void reply.status(401).send({ error: 'Unauthorized', message: 'Sign in with your wallet.' });
    }
    return owner;
  };

  // Personal data: never cache.
  app.addHook('onSend', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof SiftWalletError) {
      return reply.status(error.statusCode).send({ error: error.code, message: error.message });
    }
    if (error instanceof TradeError) {
      return reply.status(422).send({ error: error.code, message: error.message });
    }
    if (error instanceof SignerError) {
      request.log.error({ err: error }, 'signing provider failed');
      return reply
        .status(502)
        .send({ error: 'SIGNER', message: 'The signing service is unavailable. Try again soon.' });
    }
    throw error;
  });

  app.get('/me/sift-wallet', async (request, reply) => {
    const owner = await signedIn(request, reply);
    if (!owner) return reply;
    return { wallet: await wallets.get(owner), signing: wallets.signingState() };
  });

  app.post('/me/sift-wallet', async (request, reply) => {
    const owner = await signedIn(request, reply);
    if (!owner) return reply;
    return { wallet: await wallets.create(owner) };
  });

  app.put('/me/sift-wallet/limits', async (request, reply) => {
    const owner = await signedIn(request, reply);
    if (!owner) return reply;
    const body = parseOrReply(limitsBody, request.body, reply);
    if (!body) return reply;
    return { wallet: await wallets.setLimits(owner, body, body.code) };
  });

  app.post('/me/sift-wallet/freeze', async (request, reply) => {
    const owner = await signedIn(request, reply);
    if (!owner) return reply;
    return { wallet: await wallets.freeze(owner) };
  });

  app.post('/me/sift-wallet/unfreeze', async (request, reply) => {
    const owner = await signedIn(request, reply);
    if (!owner) return reply;
    const body = parseOrReply(optionalCodeBody, request.body ?? {}, reply);
    if (!body) return reply;
    return { wallet: await wallets.unfreeze(owner, body.code) };
  });

  app.post('/me/sift-wallet/2fa', async (request, reply) => {
    const owner = await signedIn(request, reply);
    if (!owner) return reply;
    return wallets.startTwoFactor(owner);
  });

  app.post('/me/sift-wallet/2fa/confirm', async (request, reply) => {
    const owner = await signedIn(request, reply);
    if (!owner) return reply;
    const body = parseOrReply(codeBody, request.body, reply);
    if (!body) return reply;
    return { wallet: await wallets.confirmTwoFactor(owner, body.code) };
  });

  app.put('/me/sift-wallet/withdrawal-address', async (request, reply) => {
    const owner = await signedIn(request, reply);
    if (!owner) return reply;
    const body = parseOrReply(addressBody, request.body, reply);
    if (!body) return reply;
    return { wallet: await wallets.setWithdrawalAddress(owner, body.address, body.code) };
  });

  app.post('/me/sift-wallet/withdraw', async (request, reply) => {
    const owner = await signedIn(request, reply);
    if (!owner) return reply;
    const body = parseOrReply(withdrawBody, request.body, reply);
    if (!body) return reply;
    return wallets.withdraw(owner, body.lamports, body.code);
  });

  app.post('/me/sift-wallet/export', async (request, reply) => {
    const owner = await signedIn(request, reply);
    if (!owner) return reply;
    const body = parseOrReply(exportBody, request.body, reply);
    if (!body) return reply;
    return wallets.exportKey(owner, body.code, body.recipientPublicKey);
  });

  app.post('/me/sift-wallet/trades', async (request, reply) => {
    const owner = await signedIn(request, reply);
    if (!owner) return reply;
    const body = parseOrReply(tradeBody, request.body, reply);
    if (!body) return reply;
    return wallets.trade(owner, body.quoteId);
  });

  app.get('/me/orders', async (request, reply) => {
    const owner = await signedIn(request, reply);
    if (!owner) return reply;
    return { orders: await wallets.orders(owner) };
  });

  app.post('/me/orders', async (request, reply) => {
    const owner = await signedIn(request, reply);
    if (!owner) return reply;
    const body = parseOrReply(ordersBody, request.body, reply);
    if (!body) return reply;
    const group = body.protect ? crypto.randomUUID() : undefined;
    return reply.status(201).send({ orders: await wallets.placeOrders(owner, body.orders, group) });
  });

  app.delete('/me/orders/:id', async (request, reply) => {
    const owner = await signedIn(request, reply);
    if (!owner) return reply;
    const params = parseOrReply(orderParams, request.params, reply);
    if (!params) return reply;
    await wallets.cancelOrder(owner, params.id);
    return reply.status(204).send();
  });
};
