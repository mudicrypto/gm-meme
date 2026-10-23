import { type SolanaCluster, type TradeQuote, isSolanaAddress } from '@sift/shared';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import { TradeError } from '../trading/errors';
import type { Airdrop } from '../trading/factory';
import type { TradeService } from '../trading/service';
import { parseOrReply } from './validation';

const address = z.string().refine(isSolanaAddress, { message: 'not a Solana address' });
const baseUnits = z.string().regex(/^[1-9]\d{0,19}$/, 'a positive whole number of base units');

const quoteBody = z
  .object({
    mint: address,
    wallet: address,
    side: z.enum(['buy', 'sell']),
    amount: baseUnits,
    slippageBps: z.number().int().min(10).max(5000),
  })
  .refine(
    (q) =>
      q.side === 'sell' ||
      !/^\d+$/.test(q.amount) ||
      (BigInt(q.amount) >= 1_000_000n && BigInt(q.amount) <= 100_000_000_000n),
    {
      message: 'buy between 0.001 and 100 SOL',
      path: ['amount'],
    },
  );

const submitBody = z.object({
  quoteId: z.string().regex(/^[0-9a-f]{32}$/),
  transaction: z.string().min(100).max(4000),
});

const signatureParams = z.object({ signature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/) });
const walletParams = z.object({ address });

// One devnet airdrop per wallet per 10 minutes, to be a good faucet citizen.
const AIRDROP_COOLDOWN_MS = 10 * 60_000;

/**
 * Non-custodial trading: the API builds and relays transactions; the user's device
 * verifies and signs them. No keys ever reach the server.
 */
export const tradeRoutes: FastifyPluginAsync<{
  trades: TradeService | null;
  cluster: SolanaCluster;
  platformFeeBps: number;
  feeWallet: string | null;
  airdrop: Airdrop | null;
}> = async (app, { trades, cluster, platformFeeBps, feeWallet, airdrop }) => {
  const lastAirdrop = new Map<string, number>();

  app.get('/config', async () => ({
    cluster,
    trading: { enabled: trades !== null, platformFeeBps, feeWallet },
  }));

  app.post('/trades/quote', async (request, reply): Promise<TradeQuote | undefined> => {
    if (!trades) return void disabled(reply);
    const body = parseOrReply(quoteBody, request.body, reply);
    if (!body) return;
    return withTradeErrors(reply, () => trades.quote(body));
  });

  app.post('/trades/submit', async (request, reply) => {
    if (!trades) return void disabled(reply);
    const body = parseOrReply(submitBody, request.body, reply);
    if (!body) return;
    return withTradeErrors(reply, async () => ({
      signature: await trades.submit(body.quoteId, body.transaction),
    }));
  });

  app.get('/trades/:signature', async (request, reply) => {
    if (!trades) return void disabled(reply);
    const params = parseOrReply(signatureParams, request.params, reply);
    if (!params) return;
    reply.header('cache-control', 'no-store');
    return trades.status(params.signature);
  });

  app.post('/wallets/:address/airdrop', async (request, reply) => {
    if (!airdrop) {
      return reply.status(404).send({ error: 'Not Found', message: 'Airdrops are devnet only.' });
    }
    const params = parseOrReply(walletParams, request.params, reply);
    if (!params) return;
    const last = lastAirdrop.get(params.address);
    if (last && Date.now() - last < AIRDROP_COOLDOWN_MS) {
      return reply.status(429).send({
        error: 'Too Many Requests',
        message: 'One devnet airdrop per wallet every 10 minutes.',
      });
    }
    if (lastAirdrop.size > 10_000) {
      for (const [address, at] of lastAirdrop) {
        if (Date.now() - at >= AIRDROP_COOLDOWN_MS) lastAirdrop.delete(address);
      }
    }
    lastAirdrop.set(params.address, Date.now());
    try {
      return { signature: await airdrop(params.address) };
    } catch {
      lastAirdrop.delete(params.address);
      return reply.status(503).send({
        error: 'Service Unavailable',
        message: "Solana's devnet faucet is busy. Try again later, or use faucet.solana.com.",
      });
    }
  });
};

function disabled(reply: FastifyReply) {
  return reply.status(503).send({
    error: 'Service Unavailable',
    code: 'TRADING_DISABLED',
    message: 'Trading is not available right now.',
  });
}

async function withTradeErrors<T>(
  reply: FastifyReply,
  run: () => Promise<T>,
): Promise<T | undefined> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof TradeError) {
      await reply
        .status(422)
        .send({ error: 'Unprocessable Entity', code: err.code, message: err.message });
      return undefined;
    }
    throw err;
  }
}
