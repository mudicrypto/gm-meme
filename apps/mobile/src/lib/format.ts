const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';

/**
 * Price in SOL, readable at meme-coin scale. Tiny prices use the subscript notation
 * traders know: 0.000000028 → "0.0₇28" (seven zeros after the decimal point).
 */
export function formatSolPrice(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return '–';
  if (price >= 1) return trimZeros(price.toFixed(price >= 1000 ? 0 : 2));
  if (price >= 0.0001) return trimZeros(price.toPrecision(3));
  const exponent = Math.floor(Math.log10(price));
  let zeros = -exponent - 1;
  let digits = Math.round(price / 10 ** (exponent - 1));
  if (digits >= 100) {
    // Rounded up into the next power of ten (e.g. 9.99e-8 → 1.0e-7).
    digits = 10;
    zeros -= 1;
  }
  const subscript = String(zeros)
    .split('')
    .map((d) => SUBSCRIPT_DIGITS[Number(d)])
    .join('');
  return `0.0${subscript}${String(digits).replace(/0$/, '')}`;
}

/** SOL amounts like volume: "3.14 SOL", "12.5K SOL". */
export function formatSol(amount: number): string {
  if (!Number.isFinite(amount)) return '–';
  if (amount === 0) return '0 SOL';
  if (amount < 0.01) return '<0.01 SOL';
  return `${formatCompact(amount)} SOL`;
}

/** 1234 → "1.2K", 3_400_000 → "3.4M". */
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  for (const [limit, suffix] of [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ] as const) {
    if (abs >= limit) return `${trimZeros((value / limit).toFixed(1))}${suffix}`;
  }
  return trimZeros(value.toFixed(abs < 10 ? 2 : abs < 100 ? 1 : 0));
}

/** Time since an ISO date, as "just now", "5m", "3h", "2d". */
export function formatAge(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return '–';
  const seconds = Math.max(0, (now.getTime() - Date.parse(iso)) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

/** "just now", "5m ago", "3h ago". */
export function formatAgo(iso: string, now: Date = new Date()): string {
  const age = formatAge(iso, now);
  return age === 'just now' || age === '–' ? age : `${age} ago`;
}

/** "GEtph2tD…UFT5" style. */
export function shortAddress(address: string, chars = 4): string {
  return address.length <= chars * 2 + 1
    ? address
    : `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

/** Percentage change from the first to the last price, or undefined if unknowable. */
export function priceChangePct(points: ReadonlyArray<{ priceSol: number }>): number | undefined {
  const first = points[0]?.priceSol;
  const last = points[points.length - 1]?.priceSol;
  if (!first || !last || points.length < 2) return undefined;
  return ((last - first) / first) * 100;
}

export function formatPct(pct: number): string {
  const sign = pct > 0 ? '+' : '';
  return `${sign}${Math.abs(pct) >= 100 ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

function trimZeros(text: string): string {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}
