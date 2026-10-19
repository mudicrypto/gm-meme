import type { RiskLevel } from './risk';

/** A token as shown in the discovery feed. */
export interface TokenSummary {
  mint: string;
  /** Absent until Helius metadata has been fetched. */
  symbol?: string;
  name?: string;
  imageUrl?: string;
  priceUsd?: number;
  marketCapUsd?: number;
  /** Latest stored risk level; absent until the token has been checked. */
  riskLevel?: RiskLevel;
  riskCheckedAt?: string;
  /** When the launch transaction landed. Absent if Sift first saw the token through a swap. */
  launchedAt?: string;
  /** When Sift first saw the token. */
  firstSeenAt: string;
}

/** A token in the trending feed, with the activity it was ranked on. */
export interface TrendingToken extends TokenSummary {
  swapCount: number;
  /** Distinct wallets that swapped it in the window: the main ranking signal. */
  uniqueTraders: number;
  volumeSol: number;
}

export interface TokenListResponse<T extends TokenSummary = TokenSummary> {
  tokens: T[];
}

export interface TrendingResponse extends TokenListResponse<TrendingToken> {
  /** Look-back window the ranking covers. */
  windowMinutes: number;
}

/** One point on a price chart: the last trade price in a time bucket. */
export interface PricePoint {
  /** Bucket start. */
  t: string;
  /** SOL per whole token, from the last trade in the bucket. */
  priceSol: number;
  /** SOL traded in the bucket. */
  volumeSol: number;
}

export interface TokenChartResponse {
  mint: string;
  windowMinutes: number;
  points: PricePoint[];
}

/** A token held by a wallet. */
export interface Holding {
  mint: string;
  symbol?: string;
  name?: string;
  imageUrl?: string;
  /** Whole tokens. */
  amount: number;
  riskLevel?: RiskLevel;
}

export interface HoldingsResponse {
  address: string;
  solBalance: number;
  holdings: Holding[];
}
