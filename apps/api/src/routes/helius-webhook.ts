import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { DiscoveryService } from '../tokens/discovery';
import { parseOrReply } from './validation';

// Helius batches transactions per delivery; anything bigger than this is not Helius.
const MAX_TRANSACTIONS = 1000;
const webhookBody = z.array(z.unknown()).max(MAX_TRANSACTIONS);

/**
 * Receives Helius enhanced-transaction webhooks. Helius sends the webhook's
 * authHeader value in the Authorization header; requests without it are rejected.
 */
export const heliusWebhookRoutes: FastifyPluginAsync<{
  secret: string;
  discovery: DiscoveryService;
}> = async (app, { secret, discovery }) => {
  app.post(
    '/webhooks/helius',
    {
      bodyLimit: 3 * 1024 * 1024,
      // Checked before the body is read, so unauthenticated uploads are never parsed.
      onRequest: async (request, reply) => {
        if (!secretMatches(request.headers.authorization, secret)) {
          await reply.status(401).send({ error: 'Unauthorized' });
        }
      },
    },
    async (request, reply) => {
      const transactions = parseOrReply(webhookBody, request.body, reply);
      if (!transactions) return;
      const result = await discovery.ingest(transactions);
      request.log.info(result, 'Helius webhook ingested');
      return { ok: true, ...result };
    },
  );
};

/** Constant-time comparison; hashing first makes both sides the same length. */
function secretMatches(received: string | undefined, expected: string): boolean {
  if (!received) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(received), digest(expected));
}
