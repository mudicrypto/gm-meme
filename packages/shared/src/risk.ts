/** Traffic-light risk level shown on every token. */
export type RiskLevel = 'green' | 'amber' | 'red';

export const RISK_LEVELS: readonly RiskLevel[] = ['green', 'amber', 'red'];

/** One plain-language reason behind a token's risk level. */
export interface RiskReason {
  /** Stable machine-readable id of the check, e.g. "mint_authority". */
  check: string;
  level: RiskLevel;
  message: string;
}

export interface RiskScore {
  mint: string;
  level: RiskLevel;
  reasons: RiskReason[];
  checkedAt: string;
}

const SEVERITY: Record<RiskLevel, number> = { green: 0, amber: 1, red: 2 };

/** The overall level is the worst level among the individual checks. */
export function worstRiskLevel(levels: readonly RiskLevel[]): RiskLevel {
  return levels.reduce<RiskLevel>(
    (worst, level) => (SEVERITY[level] > SEVERITY[worst] ? level : worst),
    'green',
  );
}
