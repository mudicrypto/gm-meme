import { createHash, randomUUID } from 'node:crypto';
import type {
  AlertDirection,
  FeedToken,
  MeResponse,
  MyProfile,
  PriceAlert,
  ProfileResponse,
  ProfileUpdate,
  PublicProfile,
  SharedTrade,
  WatchlistResponse,
} from '@sift/shared';
import { RISK_BADGE_MAX_AGE_MS, type TokenRepository } from '../tokens/repository';
import { crossed, formatPriceSol } from './alerts';
import type { ProfileRecord, SharedTradeRecord, SocialRepository } from './repository';

/** A request we refuse, with a message for the user. */
export class SocialError extends Error {
  override name = 'SocialError';
  constructor(
    readonly statusCode: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

const FEED_LIMIT = 50;
const PROFILE_TRADES_LIMIT = 30;
const MAX_WATCHLIST = 100;
const MAX_ACTIVE_ALERTS = 20;

export function createSocialService(deps: {
  social: SocialRepository;
  tokens: TokenRepository;
  now?: () => Date;
}) {
  const { social, tokens } = deps;
  const now = deps.now ?? (() => new Date());

  async function tokenInfo(mints: readonly string[]): Promise<Map<string, FeedToken>> {
    const unique = [...new Set(mints)];
    const [stored, risk] = await Promise.all([
      Promise.all(unique.map((mint) => tokens.getToken(mint))),
      tokens.getRiskLevels(unique, new Date(now().getTime() - RISK_BADGE_MAX_AGE_MS)),
    ]);
    return new Map(
      unique.map((mint, i) => {
        const token = stored[i];
        return [
          mint,
          {
            mint,
            symbol: token?.symbol,
            name: token?.name,
            imageUrl: token?.imageUrl,
            riskLevel: risk.get(mint),
          },
        ];
      }),
    );
  }

  async function withTokens(records: SharedTradeRecord[]): Promise<SharedTrade[]> {
    const info = await tokenInfo(records.map((r) => r.mint));
    return records.map(({ mint, signature, ...rest }) => ({
      ...rest,
      // The signature would let anyone look up the trader's wallet on an explorer.
      id: createHash('sha256').update(`sift-trade:${signature}`).digest('hex').slice(0, 24),
      token: info.get(mint)!,
    }));
  }

  async function publicProfile(record: ProfileRecord, viewer: string | null) {
    const followedByMe =
      viewer !== null && viewer !== record.wallet
        ? await social.isFollowing(viewer, record.wallet)
        : false;
    const { wallet: _wallet, ...rest } = record;
    return { ...rest, followedByMe } satisfies PublicProfile;
  }

  async function profileOrThrow(handle: string) {
    const profile = await social.getProfileByHandle(handle);
    if (!profile) throw new SocialError(404, 'No one on Sift has that name.');
    return profile;
  }

  return {
    async me(wallet: string): Promise<MeResponse> {
      return { wallet, profile: (await social.getProfile(wallet)) satisfies MyProfile | null };
    },

    async updateProfile(wallet: string, update: ProfileUpdate): Promise<MyProfile> {
      const result = await social.saveProfile({ wallet, ...update });
      if (result === 'handle_taken') throw new SocialError(409, 'That name is taken.');
      return (await social.getProfile(wallet))!;
    },

    async profile(handle: string, viewer: string | null): Promise<ProfileResponse> {
      const record = await profileOrThrow(handle);
      const [profile, trades] = await Promise.all([
        publicProfile(record, viewer),
        social.tradesBy(record.wallet, PROFILE_TRADES_LIMIT).then(withTokens),
      ]);
      return { profile, trades };
    },

    async search(prefix: string, viewer: string | null): Promise<PublicProfile[]> {
      const records = await social.searchProfiles(prefix, 20);
      return Promise.all(records.map((r) => publicProfile(r, viewer)));
    },

    async follow(viewer: string, handle: string) {
      const target = await profileOrThrow(handle);
      if (target.wallet === viewer) throw new SocialError(400, 'You can’t follow yourself.');
      await social.follow(viewer, target.wallet);
    },

    async unfollow(viewer: string, handle: string) {
      const target = await profileOrThrow(handle);
      await social.unfollow(viewer, target.wallet);
    },

    async feed(viewer: string): Promise<SharedTrade[]> {
      return withTokens(await social.feed(viewer, FEED_LIMIT));
    },

    async watchlist(wallet: string): Promise<WatchlistResponse> {
      const entries = await social.watchlist(wallet);
      const mints = entries.map((e) => e.mint);
      const [info, prices] = await Promise.all([tokenInfo(mints), tokens.getLatestPrices(mints)]);
      return {
        tokens: entries.map((e) => ({
          ...info.get(e.mint)!,
          addedAt: e.addedAt,
          priceSol: prices.get(e.mint) ?? null,
        })),
      };
    },

    async watch(wallet: string, mint: string) {
      const current = await social.watchlist(wallet);
      if (current.some((e) => e.mint === mint)) return;
      if (current.length >= MAX_WATCHLIST) {
        throw new SocialError(400, `Your watchlist is full (${MAX_WATCHLIST} tokens).`);
      }
      await social.watch(wallet, mint, now().toISOString());
    },

    unwatch: (wallet: string, mint: string) => social.unwatch(wallet, mint),

    async alerts(wallet: string): Promise<PriceAlert[]> {
      const records = await social.alertsOf(wallet);
      const info = await tokenInfo(records.map((r) => r.mint));
      return records.map(({ wallet: _wallet, ...rest }) => ({
        ...rest,
        token: info.get(rest.mint)!,
      }));
    },

    async createAlert(
      wallet: string,
      alert: { mint: string; direction: AlertDirection; priceSol: number },
    ): Promise<PriceAlert> {
      const existing = await social.alertsOf(wallet);
      if (existing.filter((a) => a.triggeredAt === null).length >= MAX_ACTIVE_ALERTS) {
        throw new SocialError(400, `You can have up to ${MAX_ACTIVE_ALERTS} active alerts.`);
      }
      const price = (await tokens.getLatestPrices([alert.mint])).get(alert.mint);
      if (price !== undefined && crossed(alert, price)) {
        throw new SocialError(
          400,
          `The price is already ${alert.direction} that (now ${formatPriceSol(price)}).`,
        );
      }
      const record = { id: randomUUID(), wallet, ...alert, createdAt: now().toISOString() };
      await social.createAlert(record);
      const info = await tokenInfo([alert.mint]);
      const { wallet: _wallet, ...rest } = record;
      return {
        ...rest,
        triggeredAt: null,
        triggeredPriceSol: null,
        token: info.get(alert.mint)!,
      };
    },

    async deleteAlert(wallet: string, id: string) {
      if (!(await social.deleteAlert(wallet, id))) throw new SocialError(404, 'No such alert.');
    },

    savePushToken: (wallet: string, token: string) => social.savePushToken(wallet, token),
    pushDevices: async (wallet: string) =>
      (await social.pushTokens([wallet])).map((device) => device.token),
    deletePushToken: (wallet: string, token: string) => social.deletePushToken(wallet, token),
  };
}

export type SocialService = ReturnType<typeof createSocialService>;
