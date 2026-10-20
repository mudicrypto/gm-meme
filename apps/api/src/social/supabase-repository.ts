import type { AlertDirection } from '@sift/shared';
import type { RpcCaller } from '../tokens/supabase-repository';
import type {
  AlertRecord,
  ProfileRecord,
  SharedTradeRecord,
  SocialRepository,
  TradeRecord,
} from './repository';

interface ProfileRow {
  wallet: string;
  handle: string;
  display_name: string;
  share_trades: boolean;
  followers: number | string;
  following: number | string;
}

interface TradeRow {
  signature: string;
  handle: string;
  display_name: string;
  mint: string;
  side: 'buy' | 'sell';
  sol_lamports: number | string;
  token_amount: string;
  token_decimals: number;
  traded_at: string | Date;
}

interface AlertRow {
  id: string;
  wallet: string;
  mint: string;
  direction: AlertDirection;
  price_sol: number | string;
  created_at: string | Date;
  triggered_at: string | Date | null;
  triggered_price_sol: number | string | null;
}

/** SocialRepository backed by the SQL functions in supabase/migrations. */
export class SupabaseSocialRepository implements SocialRepository {
  constructor(private readonly rpc: RpcCaller) {}

  async createSession(session: { tokenHash: string; wallet: string; expiresAt: string }) {
    await this.call('create_session', {
      token_hash: session.tokenHash,
      session_wallet: session.wallet,
      expires_at: session.expiresAt,
    });
  }

  async sessionWallet(tokenHash: string, now: Date) {
    const [row] = await this.call<{ wallet: string }>('session_wallet', {
      token_hash: tokenHash,
      at_time: now.toISOString(),
    });
    return row?.wallet ?? null;
  }

  async deleteSession(tokenHash: string) {
    await this.call('delete_session', { token_hash: tokenHash });
  }

  async getProfile(wallet: string) {
    const [row] = await this.call<ProfileRow>('profile_rows', { wallets: [wallet], handles: [] });
    return row ? toProfile(row) : null;
  }

  async getProfileByHandle(handle: string) {
    const [row] = await this.call<ProfileRow>('profile_rows', { wallets: [], handles: [handle] });
    return row ? toProfile(row) : null;
  }

  async saveProfile(profile: {
    wallet: string;
    handle: string;
    displayName: string;
    shareTrades: boolean;
  }): Promise<'ok' | 'handle_taken'> {
    const { data, error } = await this.rpc('save_profile', {
      profile_wallet: profile.wallet,
      new_handle: profile.handle,
      new_display_name: profile.displayName,
      new_share_trades: profile.shareTrades,
    });
    if (error) throw new Error(`Supabase save_profile failed: ${error.message}`);
    // PostgREST returns a scalar; PGlite returns [{ save_profile: ... }].
    const result = Array.isArray(data)
      ? (data[0] as { save_profile?: string } | undefined)?.save_profile
      : data;
    return result === 'handle_taken' ? 'handle_taken' : 'ok';
  }

  async searchProfiles(prefix: string, limit: number) {
    const rows = await this.call<ProfileRow>('search_profiles', { prefix, max_rows: limit });
    return rows.map(toProfile);
  }

  async follow(follower: string, followee: string) {
    await this.call('follow', { follower_wallet: follower, followee_wallet: followee });
  }

  async unfollow(follower: string, followee: string) {
    await this.call('unfollow', { follower_wallet: follower, followee_wallet: followee });
  }

  async isFollowing(follower: string, followee: string) {
    const [row] = await this.call<{ following: boolean }>('is_following', {
      follower_wallet: follower,
      followee_wallet: followee,
    });
    return row?.following === true;
  }

  async recordTrade(trade: TradeRecord) {
    const [row] = await this.call<{ stored: boolean }>('record_shared_trade', {
      trade_signature: trade.signature,
      trade_wallet: trade.wallet,
      trade_mint: trade.mint,
      trade_side: trade.side,
      trade_sol_lamports: trade.solLamports,
      trade_token_amount: trade.tokenAmount,
      trade_token_decimals: trade.tokenDecimals,
      trade_at: trade.at,
    });
    return row?.stored === true;
  }

  async feed(viewer: string, limit: number) {
    const rows = await this.call<TradeRow>('friends_feed', { viewer, max_rows: limit });
    return rows.map(toTrade);
  }

  async tradesBy(wallet: string, limit: number) {
    const rows = await this.call<TradeRow>('trades_by', { trader: wallet, max_rows: limit });
    return rows.map(toTrade);
  }

  async watch(wallet: string, mint: string, at: string) {
    await this.call('watch_token', { watcher: wallet, token_mint: mint, at_time: at });
  }

  async unwatch(wallet: string, mint: string) {
    await this.call('unwatch_token', { watcher: wallet, token_mint: mint });
  }

  async watchlist(wallet: string) {
    const rows = await this.call<{ mint: string; added_at: string | Date }>('watchlist_of', {
      watcher: wallet,
    });
    return rows.map((row) => ({ mint: row.mint, addedAt: toIso(row.added_at) }));
  }

  async createAlert(alert: Omit<AlertRecord, 'triggeredAt' | 'triggeredPriceSol'>) {
    await this.call('create_price_alert', {
      alert_id: alert.id,
      alert_wallet: alert.wallet,
      alert_mint: alert.mint,
      alert_direction: alert.direction,
      alert_price_sol: alert.priceSol,
      at_time: alert.createdAt,
    });
  }

  async alertsOf(wallet: string) {
    const rows = await this.call<AlertRow>('price_alerts_of', { alert_wallet: wallet });
    return rows.map(toAlert);
  }

  async deleteAlert(wallet: string, id: string) {
    const [row] = await this.call<{ deleted: boolean }>('delete_price_alert', {
      alert_wallet: wallet,
      alert_id: id,
    });
    return row?.deleted === true;
  }

  async activeAlerts() {
    const rows = await this.call<AlertRow>('active_price_alerts', {});
    return rows.map(toAlert);
  }

  async triggerAlert(id: string, at: string, priceSol: number) {
    const [row] = await this.call<{ triggered: boolean }>('trigger_price_alert', {
      alert_id: id,
      at_time: at,
      price: priceSol,
    });
    return row?.triggered === true;
  }

  async savePushToken(wallet: string, token: string) {
    await this.call('save_push_token', { push_token: token, owner: wallet });
  }

  async deletePushToken(token: string) {
    await this.call('delete_push_token', { push_token: token });
  }

  async pushTokens(wallets: readonly string[]) {
    if (wallets.length === 0) return [];
    return this.call<{ wallet: string; token: string }>('push_tokens_for', {
      wallets: [...wallets],
    });
  }

  private async call<Row>(fn: string, args: Record<string, unknown>): Promise<Row[]> {
    const { data, error } = await this.rpc(fn, args);
    if (error) throw new Error(`Supabase ${fn} failed: ${error.message}`);
    return Array.isArray(data) ? (data as Row[]) : [];
  }
}

function toProfile(row: ProfileRow): ProfileRecord {
  return {
    wallet: row.wallet,
    handle: row.handle,
    displayName: row.display_name,
    shareTrades: row.share_trades,
    followers: Number(row.followers),
    following: Number(row.following),
  };
}

function toTrade(row: TradeRow): SharedTradeRecord {
  return {
    signature: row.signature,
    handle: row.handle,
    displayName: row.display_name,
    mint: row.mint,
    side: row.side,
    solLamports: Number(row.sol_lamports),
    tokenAmount: String(row.token_amount),
    tokenDecimals: row.token_decimals,
    at: toIso(row.traded_at),
  };
}

function toAlert(row: AlertRow): AlertRecord {
  return {
    id: row.id,
    wallet: row.wallet,
    mint: row.mint,
    direction: row.direction,
    priceSol: Number(row.price_sol),
    createdAt: toIso(row.created_at),
    triggeredAt: row.triggered_at ? toIso(row.triggered_at) : null,
    triggeredPriceSol: row.triggered_price_sol === null ? null : Number(row.triggered_price_sol),
  };
}

function toIso(value: string | Date): string {
  return new Date(value).toISOString();
}
