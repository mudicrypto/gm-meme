import type { RiskLevel } from './risk';

/** Lowercase letters, digits and underscores; 3–20 characters. */
export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;
export const DISPLAY_NAME_MAX = 40;

/** Sign-in: the wallet signs this text (it is not a transaction and moves no funds). */
export function signInMessage(opts: { wallet: string; nonce: string; issuedAt: string }): string {
  return [
    'Sift wants you to sign in with your Solana account:',
    opts.wallet,
    '',
    'Sign in to Sift. This only proves you own this wallet: it does not move funds or cost anything.',
    '',
    `Nonce: ${opts.nonce}`,
    `Issued At: ${opts.issuedAt}`,
  ].join('\n');
}

export interface AuthChallenge {
  message: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}

/**
 * Whether a challenge from the server is exactly Sift's sign-in text for this wallet, freshly
 * issued. The phone checks this before signing, so a compromised server can't get a wallet
 * to sign some other site's login message.
 */
export function isSignInChallengeFor(challenge: unknown, wallet: string, now: Date): boolean {
  if (typeof challenge !== 'object' || challenge === null) return false;
  const { message, nonce, issuedAt } = challenge as Record<string, unknown>;
  if (typeof message !== 'string' || typeof nonce !== 'string' || typeof issuedAt !== 'string')
    return false;
  if (!/^[0-9a-f]{32}$/.test(nonce)) return false;
  const issued = Date.parse(issuedAt);
  // Allow for a phone clock a few minutes out.
  if (!Number.isFinite(issued) || Math.abs(now.getTime() - issued) > 10 * 60_000) return false;
  return message === signInMessage({ wallet, nonce, issuedAt });
}

export interface AuthSession {
  token: string;
  wallet: string;
  expiresAt: string;
}

/** Your own profile, as you see it. */
export interface MyProfile {
  wallet: string;
  handle: string;
  displayName: string;
  /** Opt-in: when on, trades you make in Sift appear in your followers' feeds. */
  shareTrades: boolean;
  followers: number;
  following: number;
}

export interface MeResponse {
  wallet: string;
  /** Null until you pick a handle. */
  profile: MyProfile | null;
}

export interface ProfileUpdate {
  handle: string;
  displayName: string;
  shareTrades: boolean;
}

/** Someone else's profile. Their wallet address is not part of it. */
export interface PublicProfile {
  handle: string;
  displayName: string;
  shareTrades: boolean;
  followers: number;
  following: number;
  /** Whether you follow them (false when signed out). */
  followedByMe: boolean;
}

export interface FeedToken {
  mint: string;
  symbol?: string;
  name?: string;
  imageUrl?: string;
  riskLevel?: RiskLevel;
}

/** A trade someone chose to share, made in Sift and confirmed on chain. */
export interface SharedTrade {
  /** Opaque ID. Not the transaction signature, which would reveal the trader's wallet. */
  id: string;
  handle: string;
  displayName: string;
  side: 'buy' | 'sell';
  /** SOL spent (buy) or received (sell), as quoted, in lamports. */
  solLamports: number;
  /** Tokens bought or sold, in base units. */
  tokenAmount: string;
  tokenDecimals: number;
  token: FeedToken;
  at: string;
}

export interface FeedResponse {
  trades: SharedTrade[];
}

export interface ProfileResponse {
  profile: PublicProfile;
  trades: SharedTrade[];
}

export interface WatchlistResponse {
  tokens: (FeedToken & { addedAt: string; priceSol: number | null })[];
}

export type AlertDirection = 'above' | 'below';

export interface PriceAlert {
  id: string;
  mint: string;
  direction: AlertDirection;
  /** SOL per whole token. */
  priceSol: number;
  createdAt: string;
  /** Set once the price crossed the target; each alert fires once. */
  triggeredAt: string | null;
  triggeredPriceSol: number | null;
  token: FeedToken;
}

export interface AlertsResponse {
  alerts: PriceAlert[];
}
