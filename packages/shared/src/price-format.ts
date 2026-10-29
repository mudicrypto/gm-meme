// Prices in SOL at meme-coin scale, the same everywhere (app screens and order text).

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

function trimZeros(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value;
}
