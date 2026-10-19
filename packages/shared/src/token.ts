import type { RiskLevel } from './risk';

/** A token as shown in the discovery feed. */
export interface TokenSummary {
  mint: string;
  symbol: string;
  name: string;
  imageUrl?: string;
  priceUsd?: number;
  marketCapUsd?: number;
  /** Absent until the risk check has run. */
  riskLevel?: RiskLevel;
  createdAt: string;
}
