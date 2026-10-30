import type { AlertDirection } from '@sift/shared';

export interface ProfileRecord {
  wallet: string;
  handle: string;
  displayName: string;
  shareTrades: boolean;
  followers: number;
  following: number;
}

export interface TradeRecord {
  signature: string;
  wallet: string;
  mint: string;
  side: 'buy' | 'sell';
  solLamports: number;
  /** Base units, as a decimal string. */
  tokenAmount: string;
  tokenDecimals: number;
  at: string;
}

export interface SharedTradeRecord extends Omit<TradeRecord, 'wallet'> {
  handle: string;
  displayName: string;
}

export interface AlertRecord {
  id: string;
  wallet: string;
  mint: string;
  direction: AlertDirection;
  priceSol: number;
  createdAt: string;
  triggeredAt: string | null;
  triggeredPriceSol: number | null;
}

/** Profiles, follows, shared trades, watchlists, alerts and push tokens. */
export interface SocialRepository {
  /** Store a sign-in session by the SHA-256 hash of its token. Expired sessions are purged,
   * and a wallet keeps its 10 newest. */
  createSession(session: { tokenHash: string; wallet: string; expiresAt: string }): Promise<void>;
  /** The session's wallet, or null if unknown or expired at `now`. */
  sessionWallet(tokenHash: string, now: Date): Promise<string | null>;
  deleteSession(tokenHash: string): Promise<void>;

  getProfile(wallet: string): Promise<ProfileRecord | null>;
  getProfileByHandle(handle: string): Promise<ProfileRecord | null>;
  /** Create or update. Turning sharing off deletes the trades shared so far. */
  saveProfile(profile: {
    wallet: string;
    handle: string;
    displayName: string;
    shareTrades: boolean;
  }): Promise<'ok' | 'handle_taken'>;
  /** Profiles whose handle starts with `prefix`, alphabetically. */
  searchProfiles(prefix: string, limit: number): Promise<ProfileRecord[]>;

  /** Follow a wallet that has a profile. Following twice is a no-op. */
  follow(follower: string, followee: string): Promise<void>;
  unfollow(follower: string, followee: string): Promise<void>;
  isFollowing(follower: string, followee: string): Promise<boolean>;

  /** Store a trade if its wallet has a profile that shares trades. True if stored. */
  recordTrade(trade: TradeRecord): Promise<boolean>;
  /** Shared trades by the people `viewer` follows, newest first. */
  feed(viewer: string, limit: number): Promise<SharedTradeRecord[]>;
  /** One person's shared trades, newest first (none while sharing is off). */
  tradesBy(wallet: string, limit: number): Promise<SharedTradeRecord[]>;
  /** Every shared trade since a time, newest first (for the leaderboard). */
  sharedTradesSince(since: string, limit: number): Promise<SharedTradeRecord[]>;

  watch(wallet: string, mint: string, at: string): Promise<void>;
  unwatch(wallet: string, mint: string): Promise<void>;
  /** Newest first. */
  watchlist(wallet: string): Promise<{ mint: string; addedAt: string }[]>;

  createAlert(alert: Omit<AlertRecord, 'triggeredAt' | 'triggeredPriceSol'>): Promise<void>;
  /** Newest first. */
  alertsOf(wallet: string): Promise<AlertRecord[]>;
  /** Only the owner can delete. True if deleted. */
  deleteAlert(wallet: string, id: string): Promise<boolean>;
  /** Alerts that haven't fired, oldest first. */
  activeAlerts(): Promise<AlertRecord[]>;
  /** Mark an alert fired. True only for the call that fired it. */
  triggerAlert(id: string, at: string, priceSol: number): Promise<boolean>;

  /** Register a device; a wallet keeps its 10 most recent. */
  savePushToken(wallet: string, token: string): Promise<void>;
  /** Only the wallet that registered a token can remove it. */
  deletePushToken(wallet: string, token: string): Promise<void>;
  pushTokens(wallets: readonly string[]): Promise<{ wallet: string; token: string }[]>;

  /** Removes everything kept about a wallet: profile, follows, shared trades, sessions,
   * watchlist, alerts and push tokens. */
  deleteAccount(wallet: string): Promise<void>;
}
