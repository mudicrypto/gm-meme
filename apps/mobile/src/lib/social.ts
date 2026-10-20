import { HANDLE_PATTERN, type PriceAlert, type SharedTrade } from '@sift/shared';
import { formatLamports, rawToTokens } from './amounts';
import { formatCompact, formatSolPrice, shortAddress } from './format';

export function tokenLabel(token: { mint: string; symbol?: string; name?: string }): string {
  return token.symbol ?? token.name ?? shortAddress(token.mint);
}

/** "bought 1.2M AAA for 0.05 SOL" */
export function describeTrade(trade: SharedTrade): string {
  const tokens = formatCompact(rawToTokens(trade.tokenAmount, trade.tokenDecimals));
  const sol = formatLamports(trade.solLamports);
  return trade.side === 'buy'
    ? `bought ${tokens} ${tokenLabel(trade.token)} for ${sol} SOL`
    : `sold ${tokens} ${tokenLabel(trade.token)} for ${sol} SOL`;
}

/** "Above 0.0₇28 SOL" */
export function describeAlert(alert: Pick<PriceAlert, 'direction' | 'priceSol'>): string {
  return `${alert.direction === 'above' ? 'Above' : 'Below'} ${formatSolPrice(alert.priceSol)} SOL`;
}

/** A price typed by the user ("0.000002", "2e-6", "0,5"), or null if it isn't one. */
export function parsePriceSol(input: string): number | null {
  const text = input.trim().replace(',', '.');
  if (!/^(\d+\.?\d*|\.\d+)(e-?\d{1,2})?$/i.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 && value <= 1e9 ? value : null;
}

/** The handle as the API will store it, or null with a reason. */
export function normalizeHandle(input: string): { handle: string } | { error: string } {
  const handle = input.trim().toLowerCase().replace(/^@/, '');
  return HANDLE_PATTERN.test(handle)
    ? { handle }
    : { error: 'Use 3–20 letters, numbers or underscores.' };
}

/** A starting point for a new alert: 2× (above) or ½× (below) the current price. */
export function suggestedAlertPrice(current: number, direction: 'above' | 'below'): string {
  const target = direction === 'above' ? current * 2 : current / 2;
  return Number(target.toPrecision(2)).toString();
}
