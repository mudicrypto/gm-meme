import { DISPLAY_NAME_MAX, HANDLE_PATTERN, isSolanaAddress } from '@sift/shared';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { type Auth, AuthError } from '../social/auth';
import { EXPO_PUSH_TOKEN } from '../social/push';
import { SocialError, type SocialService } from '../social/service';
import { parseOrReply } from './validation';

const address = z.string().refine(isSolanaAddress, { message: 'not a Solana address' });
const handle = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.string().regex(HANDLE_PATTERN, '3–20 letters, numbers or underscores'));

const challengeBody = z.object({ wallet: address });
const sessionBody = z.object({
  wallet: address,
  nonce: z.string().regex(/^[0-9a-f]{32}$/),
  signature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/),
});
const profileBody = z.object({
  handle,
  displayName: z
    .string()
    // No control characters, and collapse runs of whitespace.
    .transform((value) =>
      value
        .replace(/[\p{Cc}\p{Cf}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .pipe(z.string().min(1, 'required').max(DISPLAY_NAME_MAX)),
  shareTrades: z.boolean(),
});
const handleParams = z.object({ handle });
const mintParams = z.object({ mint: address });
const searchQuery = z.object({
  q: z
    .string()
    .transform((value) => value.trim().toLowerCase())
    .pipe(z.string().regex(/^[a-z0-9_]{1,20}$/, 'letters, numbers or underscores')),
});
const alertBody = z.object({
  mint: address,
  direction: z.enum(['above', 'below']),
  priceSol: z.number().positive().finite().max(1e9),
});
const alertParams = z.object({ id: z.uuid() });
const pushBody = z.object({ token: z.string().regex(EXPO_PUSH_TOKEN) });

/** Profiles, follows, the friends feed, watchlists and price alerts. Sign in with a wallet. */
export const socialRoutes: FastifyPluginAsync<{ auth: Auth; social: SocialService }> = async (
  app,
  { auth, social },
) => {
  const bearer = (request: FastifyRequest) => {
    const header = request.headers.authorization;
    return header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
  };
  const viewerOf = async (request: FastifyRequest) => {
    const token = bearer(request);
    return token ? auth.walletFor(token) : null;
  };
  /** The signed-in wallet, or a 401 sent and null. */
  const signedIn = async (request: FastifyRequest, reply: FastifyReply) => {
    const wallet = await viewerOf(request);
    if (!wallet) {
      void reply.status(401).send({ error: 'Unauthorized', message: 'Sign in with your wallet.' });
    }
    return wallet;
  };

  // Personal data: never cache.
  app.addHook('onSend', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof SocialError) {
      return reply.status(error.statusCode).send({ error: error.name, message: error.message });
    }
    if (error instanceof AuthError) {
      return reply.status(401).send({ error: 'Unauthorized', message: error.message });
    }
    throw error;
  });

  app.post('/auth/challenge', async (request, reply) => {
    const body = parseOrReply(challengeBody, request.body, reply);
    if (!body) return;
    return auth.challenge(body.wallet);
  });

  app.post('/auth/session', async (request, reply) => {
    const body = parseOrReply(sessionBody, request.body, reply);
    if (!body) return;
    return auth.signIn(body.wallet, body.nonce, body.signature);
  });

  app.delete('/auth/session', async (request, reply) => {
    const token = bearer(request);
    if (token) await auth.signOut(token);
    return reply.status(204).send();
  });

  app.get('/me', async (request, reply) => {
    const wallet = await signedIn(request, reply);
    if (!wallet) return;
    return social.me(wallet);
  });

  app.put('/me/profile', async (request, reply) => {
    const wallet = await signedIn(request, reply);
    if (!wallet) return;
    const body = parseOrReply(profileBody, request.body, reply);
    if (!body) return;
    return { profile: await social.updateProfile(wallet, body) };
  });

  app.get('/profiles', async (request, reply) => {
    const query = parseOrReply(searchQuery, request.query, reply);
    if (!query) return;
    return { profiles: await social.search(query.q, await viewerOf(request)) };
  });

  app.get('/profiles/:handle', async (request, reply) => {
    const params = parseOrReply(handleParams, request.params, reply);
    if (!params) return;
    return social.profile(params.handle, await viewerOf(request));
  });

  app.put('/follows/:handle', async (request, reply) => {
    const wallet = await signedIn(request, reply);
    if (!wallet) return;
    const params = parseOrReply(handleParams, request.params, reply);
    if (!params) return;
    await social.follow(wallet, params.handle);
    return reply.status(204).send();
  });

  app.delete('/follows/:handle', async (request, reply) => {
    const wallet = await signedIn(request, reply);
    if (!wallet) return;
    const params = parseOrReply(handleParams, request.params, reply);
    if (!params) return;
    await social.unfollow(wallet, params.handle);
    return reply.status(204).send();
  });

  app.get('/feed', async (request, reply) => {
    const wallet = await signedIn(request, reply);
    if (!wallet) return;
    return { trades: await social.feed(wallet) };
  });

  app.get('/me/watchlist', async (request, reply) => {
    const wallet = await signedIn(request, reply);
    if (!wallet) return;
    return social.watchlist(wallet);
  });

  app.put('/me/watchlist/:mint', async (request, reply) => {
    const wallet = await signedIn(request, reply);
    if (!wallet) return;
    const params = parseOrReply(mintParams, request.params, reply);
    if (!params) return;
    await social.watch(wallet, params.mint);
    return reply.status(204).send();
  });

  app.delete('/me/watchlist/:mint', async (request, reply) => {
    const wallet = await signedIn(request, reply);
    if (!wallet) return;
    const params = parseOrReply(mintParams, request.params, reply);
    if (!params) return;
    await social.unwatch(wallet, params.mint);
    return reply.status(204).send();
  });

  app.get('/me/alerts', async (request, reply) => {
    const wallet = await signedIn(request, reply);
    if (!wallet) return;
    return { alerts: await social.alerts(wallet) };
  });

  app.post('/me/alerts', async (request, reply) => {
    const wallet = await signedIn(request, reply);
    if (!wallet) return;
    const body = parseOrReply(alertBody, request.body, reply);
    if (!body) return;
    return reply.status(201).send({ alert: await social.createAlert(wallet, body) });
  });

  app.delete('/me/alerts/:id', async (request, reply) => {
    const wallet = await signedIn(request, reply);
    if (!wallet) return;
    const params = parseOrReply(alertParams, request.params, reply);
    if (!params) return;
    await social.deleteAlert(wallet, params.id);
    return reply.status(204).send();
  });

  app.put('/me/push-token', async (request, reply) => {
    const wallet = await signedIn(request, reply);
    if (!wallet) return;
    const body = parseOrReply(pushBody, request.body, reply);
    if (!body) return;
    await social.savePushToken(wallet, body.token);
    return reply.status(204).send();
  });

  app.delete('/me/push-token', async (request, reply) => {
    const wallet = await signedIn(request, reply);
    if (!wallet) return;
    const body = parseOrReply(pushBody, request.body, reply);
    if (!body) return;
    await social.deletePushToken(body.token);
    return reply.status(204).send();
  });
};
