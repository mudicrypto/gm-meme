/** Traffic-light risk level shown on every token. */
export type RiskLevel = 'green' | 'amber' | 'red';

export const RISK_LEVELS: readonly RiskLevel[] = ['green', 'amber', 'red'];

/** The individual checks behind a risk score. */
export type RiskCheckId =
  | 'mint_authority'
  | 'freeze_authority'
  | 'token_extensions'
  | 'holder_concentration'
  | 'liquidity'
  | 'dev_history'
  | 'sell_test';

/** One plain-language reason behind a token's risk level. */
export interface RiskReason {
  check: RiskCheckId;
  level: RiskLevel;
  message: string;
}

export interface RiskScore {
  mint: string;
  /** The worst level among the reasons. */
  level: RiskLevel;
  /** Most severe first. */
  reasons: RiskReason[];
  checkedAt: string;
  disclaimer: string;
}

/** Shown with every risk score and AI summary. */
export const RISK_DISCLAIMER =
  'Automated checks, not financial advice. A green score does not mean a token is safe: most meme coins lose most of their value.';

const SEVERITY: Record<RiskLevel, number> = { green: 0, amber: 1, red: 2 };

/** The overall level is the worst level among the individual checks. */
export function worstRiskLevel(levels: readonly RiskLevel[]): RiskLevel {
  return levels.reduce<RiskLevel>(
    (worst, level) => (SEVERITY[level] > SEVERITY[worst] ? level : worst),
    'green',
  );
}

/** Sort reasons most severe first, keeping the original order within a level. */
export function sortBySeverity<T extends { level: RiskLevel }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => SEVERITY[b.level] - SEVERITY[a.level]);
}
