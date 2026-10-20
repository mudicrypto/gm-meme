import { LAMPORTS_PER_SOL } from '@sift/shared';

/** "0.05" → "50000000". Exact string math: no floating point anywhere near money. */
export function parseSolToLamports(input: string): string | null {
  const text = input.trim().replace(',', '.');
  const match = /^(\d{0,9})(?:\.(\d{0,9}))?$/.exec(text);
  if (!match || (match[1] === '' && (match[2] ?? '') === '')) return null;
  const whole = BigInt(match[1] || '0');
  const fraction = BigInt((match[2] ?? '').padEnd(9, '0'));
  const lamports = whole * BigInt(LAMPORTS_PER_SOL) + fraction;
  return lamports > 0n ? lamports.toString() : null;
}

/**
 * 21523995 → "0.0215". Amounts under 0.001 SOL (fees) get 6 decimals so they're shown
 * at their real size. `roundUp` for costs, so the screen never understates them.
 */
export function formatLamports(lamports: number, { roundUp = false } = {}): string {
  const sol = lamports / LAMPORTS_PER_SOL;
  const digits = Math.abs(sol) < 0.001 ? 6 : 4;
  const factor = 10 ** digits;
  const rounded = (roundUp ? Math.ceil(sol * factor - 1e-9) : Math.round(sol * factor)) / factor;
  if (lamports > 0 && rounded === 0) return `<${(1 / factor).toFixed(digits)}`;
  return rounded.toFixed(digits).replace(/\.?0+$/, '') || '0';
}

/** A share of a raw token balance, in base units, rounded down. 100% sells everything. */
export function percentOfRaw(raw: string, percent: number): string {
  if (percent >= 100) return raw;
  return ((BigInt(raw) * BigInt(Math.round(percent * 100))) / 10_000n).toString();
}

/** Base units → whole tokens, for display. */
export function rawToTokens(raw: string, decimals: number): number {
  return Number(BigInt(raw)) / 10 ** decimals;
}
