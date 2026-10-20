import type { TradeQuote } from '@sift/shared';
import { formatLamports } from './amounts';

export interface CostLine {
  label: string;
  value: string;
  note?: string;
  emphasis?: boolean;
}

const sol = (lamports: number, roundUp = true) => `${formatLamports(lamports, { roundUp })} SOL`;

/** The full cost breakdown shown before confirming, in the order users read it. */
export function costLines(quote: TradeQuote): CostLine[] {
  const { fees } = quote;
  const isBuy = quote.side === 'buy';
  const slippage = `${quote.slippageBps / 100}%`;
  const lines: CostLine[] = [
    isBuy
      ? { label: 'Spent on tokens', value: sol(quote.expectedLamports) }
      : { label: 'Sale proceeds', value: sol(quote.expectedLamports, false) },
    {
      label: `Sift fee (${fees.platformBps / 100}%)`,
      value: sol(fees.platformLamports),
    },
    {
      label: 'Priority fee',
      value: sol(fees.priorityLamports),
      note: 'Paid to Solana validators for faster inclusion.',
    },
    { label: 'Network fee', value: sol(fees.networkLamports) },
  ];
  if (fees.accountRentLamports > 0) {
    lines.push({
      label: 'Token account (one-off)',
      value: sol(fees.accountRentLamports),
      note: 'Opens your account for this token. Refundable if you later close it.',
    });
  }
  lines.push(
    isBuy
      ? { label: 'Expected total', value: sol(quote.expectedTotalLamports), emphasis: true }
      : {
          label: 'Expected to receive',
          value: sol(quote.expectedTotalLamports, false),
          emphasis: true,
        },
    isBuy
      ? {
          label: `Most you can pay (${slippage} slippage)`,
          value: sol(quote.worstCaseLamports),
          note: 'If the price moves more than this, the trade cancels and you only pay network fees.',
        }
      : {
          label: `Minimum received (${slippage} slippage)`,
          value: sol(quote.worstCaseLamports, false),
          note: 'If the price drops more than this, the trade cancels.',
        },
  );
  return lines;
}

/** Seconds left on a quote, never negative. */
export function secondsLeft(quote: Pick<TradeQuote, 'expiresAt'>, now: Date = new Date()): number {
  return Math.max(0, Math.floor((Date.parse(quote.expiresAt) - now.getTime()) / 1000));
}
