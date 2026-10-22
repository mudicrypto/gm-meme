/**
 * Sift's platform fee wallet: a public address, safe to publish. The app only accepts trades
 * whose fee goes here, and never takes the fee address from the API.
 */
export const SIFT_FEE_WALLET = '9x6aHFQawRisd1JfPLNHwDHJU4HwHNqb5x5p6TEGHrtc';
/** The most Sift charges per trade, in basis points (0.5%). The app refuses any higher fee. */
export const SIFT_PLATFORM_FEE_BPS = 50;

export type TradeSide = 'buy' | 'sell';

/** Everything the user confirms before signing. Lamports are numbers; token base units are strings. */
export interface TradeQuote {
  quoteId: string;
  /** Unsigned transaction, base64. */
  transaction: string;
  expiresAt: string;
  side: TradeSide;
  mint: string;
  wallet: string;
  venue: 'pump.fun';
  /** Buy: tokens received (exact). Sell: tokens sold. Base units. */
  tokenAmount: string;
  tokenDecimals: number;
  /** Buy: expected SOL the curve takes. Sell: expected SOL the curve pays. */
  expectedLamports: number;
  /** Buy: most the curve can take. Sell: least it can pay. Set by slippage. */
  limitLamports: number;
  slippageBps: number;
  /** How much worse than the current price this trade fills, fees included. */
  priceImpactPct: number | null;
  fees: {
    platformLamports: number;
    platformBps: number;
    priorityLamports: number;
    networkLamports: number;
    /** One-off rent to open a token account on a first buy (refundable when closed). */
    accountRentLamports: number;
  };
  /** Buy: expected SOL leaving the wallet. Sell: expected SOL arriving. All fees included. */
  expectedTotalLamports: number;
  /** Buy: the most that can leave. Sell: the least that can arrive. */
  worstCaseLamports: number;
}

export interface TradeQuoteRequest {
  mint: string;
  wallet: string;
  side: TradeSide;
  /** Buy: SOL budget in lamports, platform fee included. Sell: tokens in base units. */
  amount: string;
  slippageBps: number;
}

export interface TradeSubmitResponse {
  signature: string;
}

export type TradeStatus = 'pending' | 'confirmed' | 'finalized' | 'failed';

export interface TradeStatusResponse {
  signature: string;
  status: TradeStatus;
  error?: string;
}
