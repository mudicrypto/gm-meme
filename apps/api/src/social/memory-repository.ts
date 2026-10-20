import type {
  AlertRecord,
  ProfileRecord,
  SharedTradeRecord,
  SocialRepository,
  TradeRecord,
} from './repository';

type Profile = Omit<ProfileRecord, 'followers' | 'following'>;

/** In-memory SocialRepository for local runs without Supabase, and for tests. */
export class InMemorySocialRepository implements SocialRepository {
  private sessions = new Map<string, { wallet: string; expiresAt: string }>();
  private profiles = new Map<string, Profile>();
  private follows = new Set<string>();
  private trades = new Map<string, TradeRecord>();
  private watching = new Map<string, { wallet: string; mint: string; addedAt: string }>();
  private alerts = new Map<string, AlertRecord>();
  private push = new Map<string, string>();

  async createSession(session: { tokenHash: string; wallet: string; expiresAt: string }) {
    this.sessions.set(session.tokenHash, { wallet: session.wallet, expiresAt: session.expiresAt });
  }

  async sessionWallet(tokenHash: string, now: Date) {
    const session = this.sessions.get(tokenHash);
    return session && Date.parse(session.expiresAt) > now.getTime() ? session.wallet : null;
  }

  async deleteSession(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }

  async getProfile(wallet: string) {
    const profile = this.profiles.get(wallet);
    return profile ? this.withCounts(profile) : null;
  }

  async getProfileByHandle(handle: string) {
    const profile = [...this.profiles.values()].find((p) => p.handle === handle);
    return profile ? this.withCounts(profile) : null;
  }

  async saveProfile(profile: Profile): Promise<'ok' | 'handle_taken'> {
    const owner = [...this.profiles.values()].find((p) => p.handle === profile.handle);
    if (owner && owner.wallet !== profile.wallet) return 'handle_taken';
    this.profiles.set(profile.wallet, { ...profile });
    if (!profile.shareTrades) {
      for (const [signature, trade] of this.trades) {
        if (trade.wallet === profile.wallet) this.trades.delete(signature);
      }
    }
    return 'ok';
  }

  async searchProfiles(prefix: string, limit: number) {
    return [...this.profiles.values()]
      .filter((p) => p.handle.startsWith(prefix))
      .sort((a, b) => (a.handle < b.handle ? -1 : 1))
      .slice(0, limit)
      .map((p) => this.withCounts(p));
  }

  async follow(follower: string, followee: string) {
    if (follower === followee) throw new Error('cannot follow yourself');
    if (!this.profiles.has(followee)) throw new Error('no such profile');
    this.follows.add(key(follower, followee));
  }

  async unfollow(follower: string, followee: string) {
    this.follows.delete(key(follower, followee));
  }

  async isFollowing(follower: string, followee: string) {
    return this.follows.has(key(follower, followee));
  }

  async recordTrade(trade: TradeRecord) {
    if (!this.profiles.get(trade.wallet)?.shareTrades || this.trades.has(trade.signature)) {
      return false;
    }
    this.trades.set(trade.signature, { ...trade });
    return true;
  }

  async feed(viewer: string, limit: number) {
    const followed = new Set(
      [...this.follows].filter((f) => f.startsWith(`${viewer}:`)).map((f) => f.split(':')[1]!),
    );
    return this.sharedTrades((trade) => followed.has(trade.wallet), limit);
  }

  async tradesBy(wallet: string, limit: number) {
    return this.sharedTrades((trade) => trade.wallet === wallet, limit);
  }

  async watch(wallet: string, mint: string, at: string) {
    if (!this.watching.has(key(wallet, mint))) {
      this.watching.set(key(wallet, mint), { wallet, mint, addedAt: at });
    }
  }

  async unwatch(wallet: string, mint: string) {
    this.watching.delete(key(wallet, mint));
  }

  async watchlist(wallet: string) {
    return [...this.watching.values()]
      .filter((w) => w.wallet === wallet)
      .sort((a, b) => compareDesc(a.addedAt, b.addedAt) || (a.mint < b.mint ? -1 : 1))
      .map(({ mint, addedAt }) => ({ mint, addedAt }));
  }

  async createAlert(alert: Omit<AlertRecord, 'triggeredAt' | 'triggeredPriceSol'>) {
    if (this.alerts.has(alert.id)) throw new Error('duplicate alert id');
    this.alerts.set(alert.id, { ...alert, triggeredAt: null, triggeredPriceSol: null });
  }

  async alertsOf(wallet: string) {
    return [...this.alerts.values()]
      .filter((a) => a.wallet === wallet)
      .sort((a, b) => compareDesc(a.createdAt, b.createdAt) || (a.id < b.id ? -1 : 1))
      .map((a) => ({ ...a }));
  }

  async deleteAlert(wallet: string, id: string) {
    if (this.alerts.get(id)?.wallet !== wallet) return false;
    return this.alerts.delete(id);
  }

  async activeAlerts() {
    return [...this.alerts.values()]
      .filter((a) => a.triggeredAt === null)
      .sort((a, b) => -compareDesc(a.createdAt, b.createdAt) || (a.id < b.id ? -1 : 1))
      .map((a) => ({ ...a }));
  }

  async triggerAlert(id: string, at: string, priceSol: number) {
    const alert = this.alerts.get(id);
    if (!alert || alert.triggeredAt !== null) return false;
    alert.triggeredAt = at;
    alert.triggeredPriceSol = priceSol;
    return true;
  }

  async savePushToken(wallet: string, token: string) {
    this.push.set(token, wallet);
  }

  async deletePushToken(token: string) {
    this.push.delete(token);
  }

  async pushTokens(wallets: readonly string[]) {
    const wanted = new Set(wallets);
    return [...this.push.entries()]
      .filter(([, wallet]) => wanted.has(wallet))
      .map(([token, wallet]) => ({ wallet, token }))
      .sort((a, b) => (a.wallet + a.token < b.wallet + b.token ? -1 : 1));
  }

  private withCounts(profile: Profile): ProfileRecord {
    let followers = 0;
    let following = 0;
    for (const f of this.follows) {
      const [follower, followee] = f.split(':');
      if (followee === profile.wallet) followers += 1;
      if (follower === profile.wallet) following += 1;
    }
    return { ...profile, followers, following };
  }

  private sharedTrades(include: (trade: TradeRecord) => boolean, limit: number) {
    const out: SharedTradeRecord[] = [];
    for (const trade of this.trades.values()) {
      const profile = this.profiles.get(trade.wallet);
      if (!profile?.shareTrades || !include(trade)) continue;
      const { wallet: _wallet, ...rest } = trade;
      out.push({ ...rest, handle: profile.handle, displayName: profile.displayName });
    }
    return out
      .sort((a, b) => compareDesc(a.at, b.at) || (a.signature < b.signature ? -1 : 1))
      .slice(0, limit);
  }
}

// Wallets and mints are base58, so ':' can't appear in them.
const key = (a: string, b: string) => `${a}:${b}`;

function compareDesc(a: string, b: string): number {
  return Date.parse(b) - Date.parse(a);
}
