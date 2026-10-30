import type { OrderKind, OrderStatus } from '@sift/shared';

/** A user's Sift wallet. The key itself lives only in the signing provider. */
export interface WalletRecord {
  /** The signed-in account (the wallet the user signs in with). */
  owner: string;
  /** The signing provider's id for the wallet. */
  providerId: string;
  address: string;
  frozen: boolean;
  perOrderLamports: number;
  dailyLamports: number;
  withdrawAddress: string | null;
  withdrawReadyAt: string | null;
  /** Base32 TOTP secret (a 2FA code seed, not a wallet key). */
  totpSecret: string | null;
  totpEnabled: boolean;
  createdAt: string;
}

export interface OrderRecord {
  id: string;
  owner: string;
  mint: string;
  kind: OrderKind;
  triggerPriceSol: number;
  buyLamports?: number;
  sellPercent?: number;
  trailingPct?: number;
  peakPriceSol?: number;
  slippageBps: number;
  status: OrderStatus;
  group?: string;
  attempts: number;
  createdAt: string;
  expiresAt: string;
  filledAt?: string;
  signature?: string;
  message?: string;
}

export type MutableWalletFields = Pick<
  WalletRecord,
  | 'frozen'
  | 'perOrderLamports'
  | 'dailyLamports'
  | 'withdrawAddress'
  | 'withdrawReadyAt'
  | 'totpSecret'
  | 'totpEnabled'
>;

export interface OrderResult {
  status: 'open' | 'filled' | 'failed';
  signature?: string;
  message?: string;
  filledAt?: string;
}

export interface SiftWalletRepository {
  getWallet(owner: string): Promise<WalletRecord | null>;
  /** Store a new wallet unless the owner has one; returns the stored wallet. */
  insertWallet(record: WalletRecord): Promise<WalletRecord>;
  updateWallet(owner: string, fields: MutableWalletFields): Promise<void>;
  /** Deletes the wallet record with its spend history and orders. */
  deleteWallet(owner: string): Promise<void>;

  /** SOL spent on buys from the Sift wallet, for the daily cap. */
  recordSpend(owner: string, lamports: number, at: string): Promise<void>;
  spentSince(owner: string, since: string): Promise<number>;

  insertOrder(order: OrderRecord): Promise<void>;
  /** Newest first. */
  ordersOf(owner: string, limit: number): Promise<OrderRecord[]>;
  openOrders(): Promise<OrderRecord[]>;
  countOpen(owner: string): Promise<number>;
  cancelOrder(owner: string, id: string): Promise<boolean>;
  /** Move an open order to executing, once; true for the caller that won. */
  claimOrder(id: string): Promise<boolean>;
  /** Finish an executing order, or put it back to open (with a reason) to retry. */
  settleOrder(id: string, result: OrderResult): Promise<void>;
  /** Update an open order's trailing peak or waiting message. */
  touchOrder(id: string, patch: { peakPriceSol?: number; message?: string | null }): Promise<void>;
  /** Expire open orders past their expiry; returns the expired ones. */
  expireOrders(now: string): Promise<OrderRecord[]>;
}
