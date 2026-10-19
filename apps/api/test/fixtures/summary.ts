import { RISK_DISCLAIMER, type RiskScore } from '@sift/shared';
import type { SummaryInput } from '../../src/summary/prompt';
import { RISK_MINT } from './risk';

const NOW = new Date('2026-10-19T12:00:00Z');

export function riskScore(overrides: Partial<RiskScore> = {}): RiskScore {
  return {
    mint: RISK_MINT,
    level: 'red',
    reasons: [
      {
        check: 'dev_history',
        level: 'red',
        message: "The creator's wallet has launched 49 other tokens.",
      },
      {
        check: 'liquidity',
        level: 'amber',
        message: 'Trades on PumpSwap; the lock is not confirmed.',
      },
      { check: 'mint_authority', level: 'green', message: 'Minting is switched off.' },
    ],
    checkedAt: NOW.toISOString(),
    disclaimer: RISK_DISCLAIMER,
    ...overrides,
  };
}

export function summaryInput(overrides: Partial<SummaryInput> = {}): SummaryInput {
  return {
    mint: RISK_MINT,
    token: {
      mint: RISK_MINT,
      name: 'Moon Cat',
      symbol: 'MOON',
      launchedAt: '2026-10-19T11:15:00Z',
      firstSeenAt: '2026-10-19T11:15:05Z',
    },
    risk: riskScore(),
    activityLastHour: { swapCount: 12, uniqueTraders: 7, volumeSol: 3.14159 },
    activityLast24h: { swapCount: 40, uniqueTraders: 22, volumeSol: 10 },
    now: NOW,
    ...overrides,
  };
}
