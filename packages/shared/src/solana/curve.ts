import type { TradeQuote } from '../trade';
import { base58Encode, publicKeyBytes } from './base58';
import { findProgramAddress } from './keys';
import { readU64 } from './transaction';
import { PUMP_PROGRAM } from './verify-trade';

// pump.fun's bonding curve, read straight from the chain so the phone can check a quote's
// price without trusting the Sift API. Layout from pump.fun's IDL (Anchor account).

const CURVE_DISCRIMINATOR = [23, 183, 248, 55, 96, 216, 172, 96];
const text = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

/** The curve account that prices `mint` (and owns its token vault). */
export function pumpBondingCurveAddress(mint: string): string {
  return findProgramAddress([text('bonding-curve'), publicKeyBytes(mint)], PUMP_PROGRAM);
}

/** pump.fun's per-wallet volume tracker, opened (with rent) on a wallet's first buy. */
export function pumpVolumeAccumulatorAddress(user: string): string {
  return findProgramAddress([text('user_volume_accumulator'), publicKeyBytes(user)], PUMP_PROGRAM);
}

export interface BondingCurveState {
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  complete: boolean;
  /** False when the curve is priced in another token rather than SOL. */
  solQuoted: boolean;
  /** A creator fee set on this curve (0 when the default schedule applies). */
  creatorFeeBps: number;
}

/** Decode a bonding curve account, or null if the bytes aren't one. */
export function parseBondingCurve(data: Uint8Array): BondingCurveState | null {
  if (data.length < 49 || CURVE_DISCRIMINATOR.some((b, i) => data[i] !== b)) return null;
  // Older curves end before quote_mint (always SOL); newer ones carry it at offset 83.
  const quoteMint = data.length >= 115 ? base58Encode(data.subarray(83, 115)) : SYSTEM_PROGRAM_ID;
  const creatorFeeBps = data.length >= 123 ? Number(readU64(data, 115)) : 0;
  return {
    virtualTokenReserves: readU64(data, 8),
    virtualSolReserves: readU64(data, 16),
    complete: data[48] === 1,
    solQuoted: quoteMint === SYSTEM_PROGRAM_ID || quoteMint === WSOL_MINT,
    creatorFeeBps,
  };
}

/**
 * Room allowed between the on-chain price and a quote: pump.fun's protocol fee plus the
 * default creator fee (at most 2.5% between them today), any creator fee set on the curve,
 * and 1% for the price moving between the quote and this check.
 */
const BASE_FEE_ALLOWANCE_BPS = 250n;
const PRICE_MOVE_ALLOWANCE_BPS = 100n;

/**
 * Whether a quote's price is in line with the curve on chain. A server that understates a
 * sale's proceeds (or a buy's tokens) widens the window for the trade to be sandwiched,
 * even inside the user's slippage; this keeps the quote within fees and a small move.
 */
export function curvePriceProblems(quote: TradeQuote, curve: BondingCurveState): string[] {
  if (curve.complete) return ['this token has left pump.fun’s bonding curve'];
  if (!curve.solQuoted) return ['this token is not priced in SOL'];
  if (curve.virtualTokenReserves === 0n || curve.virtualSolReserves === 0n) {
    return ['the bonding curve has no reserves'];
  }
  const keep =
    10_000n - BASE_FEE_ALLOWANCE_BPS - PRICE_MOVE_ALLOWANCE_BPS - BigInt(curve.creatorFeeBps);
  const { virtualTokenReserves: tokens, virtualSolReserves: sol } = curve;
  if (quote.side === 'buy') {
    // Tokens the SOL buys at the curve, after the most fees could take.
    const solIn = (BigInt(quote.expectedLamports) * keep) / 10_000n;
    const fewest = (solIn * tokens) / (sol + solIn);
    return BigInt(quote.tokenAmount) < fewest
      ? ['the quote gives fewer tokens than the price on chain']
      : [];
  }
  const tokensIn = BigInt(quote.tokenAmount);
  const gross = (tokensIn * sol) / (tokens + tokensIn);
  return BigInt(quote.expectedLamports) < (gross * keep) / 10_000n
    ? ['the quote pays less SOL than the price on chain']
    : [];
}
