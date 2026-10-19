import type { RiskLevel } from './risk';

/** Plain-language explanation of a token, from GET /tokens/:mint/summary. */
export interface TokenExplanation {
  mint: string;
  /** About three sentences. */
  summary: string;
  /** Short phrases, most severe first; empty when nothing was flagged. */
  redFlags: string[];
  riskLevel: RiskLevel;
  /** "ai" when written by Claude; "rules" when assembled from the risk checks. */
  source: 'ai' | 'rules';
  generatedAt: string;
  disclaimer: string;
}
