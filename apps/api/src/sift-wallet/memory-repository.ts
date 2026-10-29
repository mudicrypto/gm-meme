import type {
  MutableWalletFields,
  OrderRecord,
  OrderResult,
  SiftWalletRepository,
  WalletRecord,
} from './repository';

/** In-memory SiftWalletRepository for tests and local runs without Supabase. */
export class InMemorySiftWalletRepository implements SiftWalletRepository {
  private wallets = new Map<string, WalletRecord>();
  private orders = new Map<string, OrderRecord>();
  private spends: Array<{ owner: string; lamports: number; at: string }> = [];

  async getWallet(owner: string) {
    const wallet = this.wallets.get(owner);
    return wallet ? { ...wallet } : null;
  }

  async insertWallet(record: WalletRecord) {
    const existing = this.wallets.get(record.owner);
    if (existing) return { ...existing };
    this.wallets.set(record.owner, { ...record });
    return { ...record };
  }

  async updateWallet(owner: string, fields: MutableWalletFields) {
    const wallet = this.wallets.get(owner);
    if (wallet) this.wallets.set(owner, { ...wallet, ...fields });
  }

  async recordSpend(owner: string, lamports: number, at: string) {
    this.spends.push({ owner, lamports, at });
  }

  async spentSince(owner: string, since: string) {
    const from = Date.parse(since);
    return this.spends
      .filter((s) => s.owner === owner && Date.parse(s.at) >= from)
      .reduce((total, s) => total + s.lamports, 0);
  }

  async insertOrder(order: OrderRecord) {
    this.orders.set(order.id, { ...order });
  }

  async ordersOf(owner: string, limit: number) {
    return [...this.orders.values()]
      .filter((o) => o.owner === owner)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((o) => ({ ...o }));
  }

  async openOrders() {
    return [...this.orders.values()].filter((o) => o.status === 'open').map((o) => ({ ...o }));
  }

  async countOpen(owner: string) {
    return [...this.orders.values()].filter((o) => o.owner === owner && o.status === 'open').length;
  }

  async cancelOrder(owner: string, id: string) {
    const order = this.orders.get(id);
    if (!order || order.owner !== owner || order.status !== 'open') return false;
    order.status = 'cancelled';
    return true;
  }

  async claimOrder(id: string) {
    const order = this.orders.get(id);
    if (!order || order.status !== 'open') return false;
    order.status = 'executing';
    order.attempts += 1;
    return true;
  }

  async settleOrder(id: string, result: OrderResult) {
    const order = this.orders.get(id);
    if (!order || order.status !== 'executing') return;
    order.status = result.status;
    if (result.signature !== undefined) order.signature = result.signature;
    if (result.message !== undefined) order.message = result.message;
    if (result.filledAt !== undefined) order.filledAt = result.filledAt;
  }

  async touchOrder(id: string, patch: { peakPriceSol?: number; message?: string | null }) {
    const order = this.orders.get(id);
    if (!order || order.status !== 'open') return;
    if (patch.peakPriceSol !== undefined) order.peakPriceSol = patch.peakPriceSol;
    if (patch.message === null) delete order.message;
    else if (patch.message !== undefined) order.message = patch.message;
  }

  async expireOrders(now: string) {
    const at = Date.parse(now);
    const expired: OrderRecord[] = [];
    for (const order of this.orders.values()) {
      if (order.status === 'open' && Date.parse(order.expiresAt) <= at) {
        order.status = 'expired';
        expired.push({ ...order });
      }
    }
    return expired;
  }
}
