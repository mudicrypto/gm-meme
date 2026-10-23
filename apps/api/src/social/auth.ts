import { createHash, randomBytes } from 'node:crypto';
import {
  type AuthChallenge,
  type AuthSession,
  base58Decode,
  signInMessage,
  solanaKeys,
} from '@sift/shared';
import type { SocialRepository } from './repository';

export class AuthError extends Error {
  override name = 'AuthError';
}

export interface Auth {
  /** A one-time message for `wallet` to sign. */
  challenge(wallet: string): AuthChallenge;
  /** Check the signed challenge and open a session. Throws AuthError. */
  signIn(wallet: string, nonce: string, signatureBase58: string): Promise<AuthSession>;
  /** The wallet behind a bearer token, or null. */
  walletFor(token: string): Promise<string | null>;
  signOut(token: string): Promise<void>;
}

const CHALLENGE_TTL_MS = 5 * 60_000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;
// Unclaimed challenges live in memory; cap them so a flood can't exhaust it.
const MAX_CHALLENGES = 10_000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Sign in with a wallet: the user signs a plain-text message proving they hold its key.
 * Nothing is ever signed that could move funds. Sessions are random bearer tokens; only
 * their SHA-256 hash is stored.
 */
export function createAuth(opts: { repository: SocialRepository; now?: () => Date }): Auth {
  const now = opts.now ?? (() => new Date());
  const challenges = new Map<string, { wallet: string; message: string; expiresAt: number }>();

  function prune() {
    const at = now().getTime();
    for (const [nonce, c] of challenges) if (c.expiresAt <= at) challenges.delete(nonce);
    // Maps iterate oldest first.
    for (const nonce of challenges.keys()) {
      if (challenges.size < MAX_CHALLENGES) break;
      challenges.delete(nonce);
    }
  }

  return {
    challenge(wallet) {
      prune();
      const nonce = randomBytes(16).toString('hex');
      const issued = now();
      const message = signInMessage({ wallet, nonce, issuedAt: issued.toISOString() });
      const expiresAt = issued.getTime() + CHALLENGE_TTL_MS;
      challenges.set(nonce, { wallet, message, expiresAt });
      return {
        message,
        nonce,
        issuedAt: issued.toISOString(),
        expiresAt: new Date(expiresAt).toISOString(),
      };
    },

    async signIn(wallet, nonce, signatureBase58) {
      const challenge = challenges.get(nonce);
      challenges.delete(nonce); // one attempt per challenge
      if (!challenge || challenge.wallet !== wallet || challenge.expiresAt <= now().getTime()) {
        throw new AuthError('This sign-in request has expired. Please try again.');
      }
      let signature: Uint8Array;
      try {
        signature = base58Decode(signatureBase58);
      } catch {
        throw new AuthError('That signature is not valid.');
      }
      const message = new TextEncoder().encode(challenge.message);
      if (signature.length !== 64 || !solanaKeys.verify(signature, message, wallet)) {
        throw new AuthError('That signature is not valid.');
      }
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(now().getTime() + SESSION_TTL_MS).toISOString();
      await opts.repository.createSession({ tokenHash: hash(token), wallet, expiresAt });
      return { token, wallet, expiresAt };
    },

    async walletFor(token) {
      if (!TOKEN_PATTERN.test(token)) return null;
      return opts.repository.sessionWallet(hash(token), now());
    },

    async signOut(token) {
      if (TOKEN_PATTERN.test(token)) await opts.repository.deleteSession(hash(token));
    },
  };
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
