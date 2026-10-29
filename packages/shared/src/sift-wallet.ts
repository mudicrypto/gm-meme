import { formatSolPrice } from './price-format';
import { LAMPORTS_PER_SOL } from './solana';
import type { FeedToken } from './social';

// The Sift wallet: a wallet Sift creates for each user and signs from through a signing
// provider (keys never touch Sift's servers), so orders run while the phone is off.

export type OrderKind = 'limit_buy' | 'stop_loss' | 'take_profit';
export type OrderStatus = 'open' | 'executing' | 'filled' | 'failed' | 'cancelled' | 'expired';

export interface SiftOrder {
  id: string;
  token: FeedToken;
  kind: OrderKind;
  /** SOL per whole token that fires the order (for a trailing stop: the starting level). */
  triggerPriceSol: number;
  /** Limit buys: SOL to spend, in lamports. */
  buyLamports?: number;
  /** Sells: share of the holding when the order fires, 1–100. */
  sellPercent?: number;
  /** Trailing stops: how far below the highest price since placing, in percent. */
  trailingPct?: number;
  /** Highest price seen since a trailing stop was placed. */
  peakPriceSol?: number;
  slippageBps: number;
  status: OrderStatus;
  /** Orders placed together by "Protect this trade" share a group. */
  group?: string;
  createdAt: string;
  expiresAt: string;
  filledAt?: string;
  signature?: string;
  /** Plain-language reason for a failure, or why an open order is waiting. */
  message?: string;
}

export interface CreateOrderRequest {
  mint: string;
  kind: OrderKind;
  triggerPriceSol: number;
  buyLamports?: number;
  sellPercent?: number;
  trailing?: boolean;
  slippageBps: number;
  expiresInDays: number;
}

export interface SiftWalletInfo {
  address: string;
  /** Frozen: nothing is signed until the owner unfreezes (or Sift lifts a platform freeze). */
  frozen: boolean;
  /** Whether Sift's server can sign right now. */
  signing: 'live' | 'paused' | 'not_configured';
  limits: { perOrderLamports: number; dailyLamports: number; usedTodayLamports: number };
  withdrawal: {
    address: string | null;
    /** A new address can be used from this time (24 hours after it was set). */
    readyAt: string | null;
  };
  twoFactor: { enabled: boolean };
}

export interface SiftWalletResponse {
  /** Null until the user creates their Sift wallet. */
  wallet: SiftWalletInfo | null;
}

export const DEFAULT_PER_ORDER_LAMPORTS = 1 * LAMPORTS_PER_SOL;
export const DEFAULT_DAILY_LAMPORTS = 5 * LAMPORTS_PER_SOL;
export const MAX_ORDER_EXPIRY_DAYS = 30;
export const MAX_OPEN_ORDERS = 25;
/** Address or 2FA changes wait this long before withdrawals are allowed again. */
export const WITHDRAWAL_HOLD_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_ORDER_SLIPPAGE_BPS = 1000;

/** Quick trigger chips, as percent from the current price. */
export const TRIGGER_STEPS: Record<OrderKind, readonly number[]> = {
  limit_buy: [-5, -10, -20, -30],
  stop_loss: [-10, -20, -30, -50],
  take_profit: [50, 100, 200, 500],
};

export const ORDER_LABELS: Record<OrderKind, string> = {
  limit_buy: 'Limit buy',
  stop_loss: 'Stop loss',
  take_profit: 'Take profit',
};

/** The level that fires the order now: a trailing stop follows the peak down. */
export function effectiveTrigger(
  order: Pick<SiftOrder, 'kind' | 'triggerPriceSol' | 'trailingPct' | 'peakPriceSol'>,
): number {
  if (order.kind === 'stop_loss' && order.trailingPct && order.peakPriceSol) {
    return Math.max(order.triggerPriceSol, order.peakPriceSol * (1 - order.trailingPct / 100));
  }
  return order.triggerPriceSol;
}

/** Whether `price` fires the order. */
export function orderTriggered(
  order: Pick<SiftOrder, 'kind' | 'triggerPriceSol' | 'trailingPct' | 'peakPriceSol'>,
  price: number,
): boolean {
  const trigger = effectiveTrigger(order);
  return order.kind === 'take_profit' ? price >= trigger : price <= trigger;
}

/**
 * The lowest price a sell may fill at (a stop-limit): the trigger minus the slippage. If the
 * price gaps below it, the order waits instead of selling at any price.
 */
export function sellFloor(
  order: Pick<
    SiftOrder,
    'kind' | 'triggerPriceSol' | 'trailingPct' | 'peakPriceSol' | 'slippageBps'
  >,
): number {
  return effectiveTrigger(order) * (1 - order.slippageBps / 10_000);
}

/** How close the price is to the trigger: percent away, and a 0–100 progress bar. */
export function orderProgress(
  order: Pick<SiftOrder, 'kind' | 'triggerPriceSol' | 'trailingPct' | 'peakPriceSol'>,
  price: number | undefined,
): { pctAway: number; fill: number } | null {
  if (!price || price <= 0) return null;
  const trigger = effectiveTrigger(order);
  const pctAway = (Math.abs(trigger - price) / price) * 100;
  const fill = (Math.min(price, trigger) / Math.max(price, trigger)) * 100;
  return { pctAway, fill: orderTriggered(order, price) ? 100 : fill };
}

/** SOL price with enough significant digits for tiny meme coin prices. */
export function formatOrderPrice(price: number): string {
  return `${formatSolPrice(price)} SOL`;
}

function solText(lamports: number): string {
  return `${Number((lamports / LAMPORTS_PER_SOL).toPrecision(3)).toString()} SOL`;
}

function signedPct(pct: number): string {
  const rounded = Math.round(pct);
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

/** One line for an order card: "Sell 100% if price falls to 0.0000038 SOL". */
export function describeOrder(
  order: Pick<
    SiftOrder,
    'kind' | 'triggerPriceSol' | 'buyLamports' | 'sellPercent' | 'trailingPct' | 'peakPriceSol'
  >,
): string {
  const price = formatOrderPrice(effectiveTrigger(order));
  switch (order.kind) {
    case 'limit_buy':
      return `Buy with ${solText(order.buyLamports ?? 0)} if price drops to ${price}`;
    case 'stop_loss':
      return order.trailingPct
        ? `Sell ${order.sellPercent ?? 100}% if price falls ${order.trailingPct}% from its high (now ${price})`
        : `Sell ${order.sellPercent ?? 100}% if price falls to ${price}`;
    case 'take_profit':
      return `Sell ${order.sellPercent ?? 100}% when price reaches ${price}`;
  }
}

/**
 * Exactly what will happen, in plain words, for the confirm screen. Facts only, and honest
 * about what a stop can't do.
 */
export function orderSummary(opts: {
  kind: OrderKind;
  symbol: string;
  triggerPriceSol: number;
  currentPriceSol?: number;
  buyLamports?: number;
  sellPercent?: number;
  trailing?: boolean;
  slippageBps: number;
}): string {
  const price = formatOrderPrice(opts.triggerPriceSol);
  const move =
    opts.currentPriceSol && opts.currentPriceSol > 0
      ? ` (${signedPct((opts.triggerPriceSol / opts.currentPriceSol - 1) * 100)})`
      : '';
  const slip = `${opts.slippageBps / 100}%`;
  const share = `${opts.sellPercent ?? 100}%`;
  switch (opts.kind) {
    case 'limit_buy':
      return `If ${opts.symbol} drops to ${price}${move}, Sift buys with ${solText(opts.buyLamports ?? 0)} from your Sift wallet, paying at most ${slip} more than that price.`;
    case 'stop_loss':
      return opts.trailing
        ? `The stop starts at ${price}${move} and rises as the price rises. If ${opts.symbol} then falls back to it, Sift sells ${share} of your ${opts.symbol}. If the price gaps more than ${slip} below the stop, the order waits rather than selling at any price, so in a crash it may not sell.`
        : `If ${opts.symbol} falls to ${price}${move}, Sift sells ${share} of your ${opts.symbol}. If the price gaps more than ${slip} below that, the order waits rather than selling at any price, so in a crash it may not sell.`;
    case 'take_profit':
      return `If ${opts.symbol} reaches ${price}${move}, Sift sells ${share} of your ${opts.symbol} and keeps the SOL in your Sift wallet.`;
  }
}

/** "Protect this trade": sell everything if it falls 30%, sell half when it doubles. */
export function protectPreset(
  entryPriceSol: number,
): Array<Pick<CreateOrderRequest, 'kind' | 'triggerPriceSol' | 'sellPercent'>> {
  return [
    { kind: 'stop_loss', triggerPriceSol: entryPriceSol * 0.7, sellPercent: 100 },
    { kind: 'take_profit', triggerPriceSol: entryPriceSol * 2, sellPercent: 50 },
  ];
}

/** Problems with an order request, in plain words; empty when it's fine. */
export function orderRequestProblems(
  request: CreateOrderRequest,
  limits: { perOrderLamports: number },
): string[] {
  const problems: string[] = [];
  if (!Number.isFinite(request.triggerPriceSol) || request.triggerPriceSol <= 0)
    problems.push('Set a trigger price above zero.');
  if (request.kind === 'limit_buy') {
    if (!request.buyLamports || request.buyLamports <= 0) problems.push('Set an amount to spend.');
    else if (request.buyLamports > limits.perOrderLamports)
      problems.push(`That's above your per-order limit of ${solText(limits.perOrderLamports)}.`);
    if (request.trailing) problems.push('Only stop losses can trail.');
  } else if (
    !request.sellPercent ||
    !Number.isInteger(request.sellPercent) ||
    request.sellPercent < 1 ||
    request.sellPercent > 100
  ) {
    problems.push('Choose how much to sell (1–100%).');
  }
  if (request.trailing && request.kind !== 'stop_loss')
    problems.push('Only stop losses can trail.');
  if (request.slippageBps < 50 || request.slippageBps > 3000)
    problems.push('Max price move must be between 0.5% and 30%.');
  if (request.expiresInDays < 1 || request.expiresInDays > MAX_ORDER_EXPIRY_DAYS)
    problems.push(`Orders last 1 to ${MAX_ORDER_EXPIRY_DAYS} days.`);
  return [...new Set(problems)];
}
