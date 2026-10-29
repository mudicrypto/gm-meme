import type { OrderKind, OrderStatus } from '@sift/shared';
import type { RpcCaller } from '../tokens/supabase-repository';
import type {
  MutableWalletFields,
  OrderRecord,
  OrderResult,
  SiftWalletRepository,
  WalletRecord,
} from './repository';

interface WalletRow {
  owner: string;
  provider_id: string;
  address: string;
  frozen: boolean;
  per_order_lamports: number | string;
  daily_lamports: number | string;
  withdraw_address: string | null;
  withdraw_ready_at: string | Date | null;
  totp_secret: string | null;
  totp_enabled: boolean;
  created_at: string | Date;
}

interface OrderRow {
  id: string;
  owner: string;
  mint: string;
  kind: OrderKind;
  trigger_price_sol: number | string;
  buy_lamports: number | string | null;
  sell_percent: number | null;
  trailing_pct: number | string | null;
  peak_price_sol: number | string | null;
  slippage_bps: number;
  status: OrderStatus;
  order_group: string | null;
  attempts: number;
  created_at: string | Date;
  expires_at: string | Date;
  filled_at: string | Date | null;
  signature: string | null;
  message: string | null;
}

const iso = (value: string | Date) => new Date(value).toISOString();

/** SiftWalletRepository backed by the SQL functions in supabase/migrations. */
export class SupabaseSiftWalletRepository implements SiftWalletRepository {
  constructor(private readonly rpc: RpcCaller) {}

  async getWallet(owner: string) {
    const [row] = await this.call<WalletRow>('sift_wallet_of', { wallet_owner: owner });
    return row ? toWallet(row) : null;
  }

  async insertWallet(record: WalletRecord) {
    const [row] = await this.call<WalletRow>('insert_sift_wallet', {
      wallet_owner: record.owner,
      wallet_provider_id: record.providerId,
      wallet_address: record.address,
      wallet_per_order_lamports: record.perOrderLamports,
      wallet_daily_lamports: record.dailyLamports,
      wallet_created_at: record.createdAt,
    });
    if (!row) throw new Error('Supabase insert_sift_wallet returned no row');
    return toWallet(row);
  }

  async updateWallet(owner: string, fields: MutableWalletFields) {
    await this.call('update_sift_wallet', {
      wallet_owner: owner,
      new_frozen: fields.frozen,
      new_per_order_lamports: fields.perOrderLamports,
      new_daily_lamports: fields.dailyLamports,
      new_withdraw_address: fields.withdrawAddress,
      new_withdraw_ready_at: fields.withdrawReadyAt,
      new_totp_secret: fields.totpSecret,
      new_totp_enabled: fields.totpEnabled,
    });
  }

  async recordSpend(owner: string, lamports: number, at: string) {
    await this.call('record_sift_spend', {
      spend_owner: owner,
      spend_lamports: lamports,
      spend_at: at,
    });
  }

  async spentSince(owner: string, since: string) {
    const [row] = await this.call<{ lamports: number | string }>('sift_spent_since', {
      spend_owner: owner,
      since,
    });
    return Number(row?.lamports ?? 0);
  }

  async insertOrder(order: OrderRecord) {
    await this.call('insert_sift_order', {
      order_id: order.id,
      order_owner: order.owner,
      order_mint: order.mint,
      order_kind: order.kind,
      order_trigger_price_sol: order.triggerPriceSol,
      order_buy_lamports: order.buyLamports ?? null,
      order_sell_percent: order.sellPercent ?? null,
      order_trailing_pct: order.trailingPct ?? null,
      order_peak_price_sol: order.peakPriceSol ?? null,
      order_slippage_bps: order.slippageBps,
      order_group: order.group ?? null,
      order_created_at: order.createdAt,
      order_expires_at: order.expiresAt,
    });
  }

  async ordersOf(owner: string, limit: number) {
    const rows = await this.call<OrderRow>('sift_orders_of', {
      order_owner: owner,
      max_rows: limit,
    });
    return rows.map(toOrder);
  }

  async openOrders() {
    return (await this.call<OrderRow>('open_sift_orders', {})).map(toOrder);
  }

  async countOpen(owner: string) {
    const [row] = await this.call<{ open_count: number | string }>('count_open_sift_orders', {
      order_owner: owner,
    });
    return Number(row?.open_count ?? 0);
  }

  async cancelOrder(owner: string, id: string) {
    const [row] = await this.call<{ cancelled: boolean }>('cancel_sift_order', {
      order_owner: owner,
      order_id: id,
    });
    return row?.cancelled ?? false;
  }

  async claimOrder(id: string) {
    const [row] = await this.call<{ claimed: boolean }>('claim_sift_order', { order_id: id });
    return row?.claimed ?? false;
  }

  async settleOrder(id: string, result: OrderResult) {
    await this.call('settle_sift_order', {
      order_id: id,
      new_status: result.status,
      new_signature: result.signature ?? null,
      new_message: result.message ?? null,
      new_filled_at: result.filledAt ?? null,
    });
  }

  async touchOrder(id: string, patch: { peakPriceSol?: number; message?: string | null }) {
    await this.call('touch_sift_order', {
      order_id: id,
      new_peak_price_sol: patch.peakPriceSol ?? null,
      new_message: patch.message ?? null,
      clear_message: patch.message === null,
    });
  }

  async expireOrders(now: string) {
    return (await this.call<OrderRow>('expire_sift_orders', { at_time: now })).map(toOrder);
  }

  private async call<Row>(fn: string, args: Record<string, unknown>): Promise<Row[]> {
    const { data, error } = await this.rpc(fn, args);
    if (error) throw new Error(`Supabase ${fn} failed: ${error.message}`);
    return Array.isArray(data) ? (data as Row[]) : [];
  }
}

function toWallet(row: WalletRow): WalletRecord {
  return {
    owner: row.owner,
    providerId: row.provider_id,
    address: row.address,
    frozen: row.frozen,
    perOrderLamports: Number(row.per_order_lamports),
    dailyLamports: Number(row.daily_lamports),
    withdrawAddress: row.withdraw_address,
    withdrawReadyAt: row.withdraw_ready_at ? iso(row.withdraw_ready_at) : null,
    totpSecret: row.totp_secret,
    totpEnabled: row.totp_enabled,
    createdAt: iso(row.created_at),
  };
}

function toOrder(row: OrderRow): OrderRecord {
  return {
    id: row.id,
    owner: row.owner,
    mint: row.mint,
    kind: row.kind,
    triggerPriceSol: Number(row.trigger_price_sol),
    ...(row.buy_lamports !== null ? { buyLamports: Number(row.buy_lamports) } : {}),
    ...(row.sell_percent !== null ? { sellPercent: row.sell_percent } : {}),
    ...(row.trailing_pct !== null ? { trailingPct: Number(row.trailing_pct) } : {}),
    ...(row.peak_price_sol !== null ? { peakPriceSol: Number(row.peak_price_sol) } : {}),
    slippageBps: row.slippage_bps,
    status: row.status,
    ...(row.order_group !== null ? { group: row.order_group } : {}),
    attempts: row.attempts,
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
    ...(row.filled_at ? { filledAt: iso(row.filled_at) } : {}),
    ...(row.signature !== null ? { signature: row.signature } : {}),
    ...(row.message !== null ? { message: row.message } : {}),
  };
}
