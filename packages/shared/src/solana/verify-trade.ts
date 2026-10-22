import { SIFT_PLATFORM_FEE_BPS, type TradeQuote } from '../trade';
import {
  ASSOCIATED_TOKEN_PROGRAM,
  COMPUTE_BUDGET_PROGRAM,
  SYSTEM_PROGRAM,
  TOKEN_2022_PROGRAM,
  TOKEN_PROGRAM,
  associatedTokenAddress,
} from './keys';
import { type DecodedTransaction, decodeTransaction, readU32, readU64 } from './transaction';

export const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const PUMP_BUY = '66063d1201daebea';
const PUMP_SELL = '33e685a4017f83ad';
const SIGNATURE_FEE_LAMPORTS = 5000;
/** No trade needs more than 0.01 SOL of priority fee; anything above is refused. */
export const MAX_PRIORITY_LAMPORTS = 10_000_000;

const LAMPORT_FIELDS = [
  'expectedLamports',
  'limitLamports',
  'expectedTotalLamports',
  'worstCaseLamports',
] as const;
const FEE_FIELDS = [
  'platformLamports',
  'platformBps',
  'priorityLamports',
  'networkLamports',
  'accountRentLamports',
] as const;
const isAmount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;

/**
 * The quote comes from the network: check every field has the type the checks rely on
 * before comparing anything. ("1e30" > 5 is true in JavaScript, and "5" + 1 is "51".)
 */
export function quoteShapeProblems(quote: unknown): string[] {
  if (typeof quote !== 'object' || quote === null) return ['quote is not an object'];
  const q = quote as Record<string, unknown>;
  const problems: string[] = [];
  for (const field of ['quoteId', 'transaction', 'expiresAt', 'mint', 'wallet'] as const) {
    if (typeof q[field] !== 'string') problems.push(`quote ${field} is not text`);
  }
  if (q.side !== 'buy' && q.side !== 'sell') problems.push('quote side is not buy or sell');
  if (typeof q.tokenAmount !== 'string' || !/^\d{1,20}$/.test(q.tokenAmount))
    problems.push('quote token amount is not a whole number');
  if (
    !Number.isInteger(q.tokenDecimals) ||
    (q.tokenDecimals as number) < 0 ||
    (q.tokenDecimals as number) > 18
  )
    problems.push('quote token decimals out of range');
  if (
    !Number.isInteger(q.slippageBps) ||
    (q.slippageBps as number) < 0 ||
    (q.slippageBps as number) > 10_000
  )
    problems.push('quote slippage out of range');
  if (q.priceImpactPct !== null && !Number.isFinite(q.priceImpactPct))
    problems.push('quote price impact is not a number');
  for (const field of LAMPORT_FIELDS) {
    if (!isAmount(q[field])) problems.push(`quote ${field} is not a whole number of lamports`);
  }
  const fees = q.fees;
  if (typeof fees !== 'object' || fees === null) {
    problems.push('quote fees missing');
  } else {
    for (const field of FEE_FIELDS) {
      if (!isAmount((fees as Record<string, unknown>)[field]))
        problems.push(`quote fee ${field} is not a whole number`);
    }
  }
  return problems;
}

/** The slippage limit pump.fun's SDK sets: expected ± expected × floor(bps / 10) / 1000. */
export function slippageLimit(
  side: 'buy' | 'sell',
  expectedLamports: number,
  slippageBps: number,
): number {
  const expected = BigInt(expectedLamports);
  const margin = (expected * BigInt(Math.floor(slippageBps / 10))) / 1000n;
  return Number(side === 'buy' ? expected + margin : expected - margin);
}

/** The platform fee for a quote at `bps`: a share of the buy budget, or of a sale's minimum. */
export function platformFeeFor(quote: TradeQuote, bps: number): number {
  const base =
    quote.side === 'buy'
      ? quote.expectedLamports + quote.fees.platformLamports
      : quote.limitLamports;
  return Number((BigInt(base) * BigInt(bps)) / 10_000n);
}

export interface TradeCheck {
  ok: boolean;
  /** Why the transaction must not be signed; empty when ok. */
  problems: string[];
}

/**
 * Check, on the user's device, that a transaction from the Sift API does exactly what
 * the quote on screen says before it is signed. A compromised server must not be able
 * to slip in transfers, redirect tokens, or raise limits. Anything unexpected fails.
 *
 * @param feeWallet The platform fee address built into the app, not taken from the API.
 */
export function verifyTradeTransaction(
  transactionBytes: Uint8Array,
  quote: TradeQuote,
  feeWallet: string | null,
  maxFeeBps: number = SIFT_PLATFORM_FEE_BPS,
): TradeCheck {
  const shape = quoteShapeProblems(quote);
  if (shape.length > 0) return { ok: false, problems: shape };
  const problems: string[] = [];
  let tx: DecodedTransaction;
  try {
    tx = decodeTransaction(transactionBytes);
  } catch (err) {
    return { ok: false, problems: [`unreadable transaction: ${(err as Error).message}`] };
  }

  if (tx.addressTableLookups > 0) problems.push('uses address lookup tables');
  if (tx.numRequiredSignatures !== 1) problems.push('needs more than one signer');
  if (tx.accountKeys[0] !== quote.wallet) problems.push('fee payer is not your wallet');

  let computeUnits: number | undefined;
  let microLamports: bigint | undefined;
  let platformPaid = 0;
  let pumpInstructions = 0;
  let accountRent = 0;

  for (const ix of tx.instructions) {
    const tag = ix.data[0];
    switch (ix.programId) {
      case COMPUTE_BUDGET_PROGRAM:
        if (tag === 2 && ix.data.length === 5) {
          if (computeUnits !== undefined) problems.push('more than one compute unit limit');
          computeUnits = readU32(ix.data, 1);
        } else if (tag === 3 && ix.data.length === 9) {
          if (microLamports !== undefined) problems.push('more than one priority fee price');
          microLamports = readU64(ix.data, 1);
        } else problems.push('unexpected compute budget instruction');
        break;

      case SYSTEM_PROGRAM: {
        // Only the platform fee: Transfer(lamports) from you to the fee wallet built into the app.
        const isTransfer = ix.data.length === 12 && readU32(ix.data, 0) === 2;
        if (!isTransfer) {
          problems.push('unexpected system instruction');
          break;
        }
        const [from, to] = ix.accounts;
        const lamports = Number(readU64(ix.data, 4));
        if (from !== quote.wallet) problems.push('transfer not from your wallet');
        if (!feeWallet || to !== feeWallet) problems.push('SOL transfer to an unknown address');
        if (platformPaid > 0) problems.push('more than one fee transfer');
        platformPaid += lamports;
        break;
      }

      case ASSOCIATED_TOKEN_PROGRAM: {
        // Opening your own token account for this mint, paid by you.
        const [payer, account, owner, mint, , tokenProgram] = ix.accounts;
        const create = ix.data.length === 0 || (ix.data.length === 1 && (tag === 0 || tag === 1));
        if (!create) problems.push('unexpected token account instruction');
        if (payer !== quote.wallet || owner !== quote.wallet)
          problems.push('token account not owned by you');
        if (mint !== quote.mint) problems.push('token account for a different token');
        if (
          !tokenProgram ||
          ![TOKEN_PROGRAM, TOKEN_2022_PROGRAM].includes(tokenProgram) ||
          account !== associatedTokenAddress(quote.wallet, quote.mint, tokenProgram)
        ) {
          problems.push('token account address is not yours');
        }
        accountRent = quote.fees.accountRentLamports;
        break;
      }

      case PUMP_PROGRAM: {
        pumpInstructions += 1;
        const discriminator = toHex(ix.data.subarray(0, 8));
        const expected = quote.side === 'buy' ? PUMP_BUY : PUMP_SELL;
        if (discriminator !== expected) {
          problems.push(`pump.fun instruction is not a ${quote.side}`);
          break;
        }
        const mint = ix.accounts[2];
        const userTokenAccount = ix.accounts[5];
        const user = ix.accounts[6];
        const tokenProgram = ix.accounts[quote.side === 'buy' ? 8 : 9];
        if (mint !== quote.mint) problems.push('trades a different token');
        if (user !== quote.wallet) problems.push('trades for a different wallet');
        if (
          !tokenProgram ||
          ![TOKEN_PROGRAM, TOKEN_2022_PROGRAM].includes(tokenProgram) ||
          userTokenAccount !== associatedTokenAddress(quote.wallet, quote.mint, tokenProgram)
        ) {
          problems.push('tokens would go to or come from an account that is not yours');
        }
        if (ix.data.length < 24) {
          problems.push('trade instruction is too short');
          break;
        }
        const amount = readU64(ix.data, 8);
        const solLimit = Number(readU64(ix.data, 16));
        if (amount !== BigInt(quote.tokenAmount))
          problems.push('token amount differs from the quote');
        if (quote.side === 'buy' && solLimit > quote.limitLamports) {
          problems.push('could spend more SOL than the quote allows');
        }
        if (quote.side === 'sell' && solLimit < quote.limitLamports) {
          problems.push('could pay out less SOL than the quote promises');
        }
        break;
      }

      default:
        problems.push(`calls an unexpected program: ${ix.programId}`);
    }
  }

  if (pumpInstructions !== 1) problems.push('expected exactly one trade instruction');
  if (platformPaid !== quote.fees.platformLamports)
    problems.push('platform fee differs from the quote');

  // Without an explicit limit, Solana charges the price on up to 1.4M default units, so a
  // price is only accepted together with a limit.
  if (microLamports !== undefined && computeUnits === undefined)
    problems.push('priority fee has no compute unit limit');
  const priority =
    computeUnits === undefined || microLamports === undefined
      ? 0
      : Number((BigInt(computeUnits) * microLamports + 999_999n) / 1_000_000n);
  if (priority > quote.fees.priorityLamports) problems.push('priority fee is higher than shown');
  if (quote.fees.priorityLamports > MAX_PRIORITY_LAMPORTS)
    problems.push('priority fee is above the 0.01 SOL cap');

  // The limits and fee must follow from your own settings, not just from the server's numbers.
  if (quote.limitLamports !== slippageLimit(quote.side, quote.expectedLamports, quote.slippageBps))
    problems.push('slippage limit does not match your slippage setting');
  if (quote.fees.platformBps > maxFeeBps) problems.push('platform fee rate is higher than Sift’s');
  if (quote.fees.platformLamports !== platformFeeFor(quote, quote.fees.platformBps))
    problems.push('platform fee does not match its rate');

  // The totals on screen must add up.
  const network = SIGNATURE_FEE_LAMPORTS * tx.numRequiredSignatures;
  if (quote.fees.networkLamports !== network) problems.push('network fee differs from Solana’s');
  const shownFees = quote.fees.platformLamports + quote.fees.priorityLamports + network;
  const expectedTotal =
    quote.side === 'buy'
      ? quote.expectedLamports + shownFees + quote.fees.accountRentLamports
      : quote.expectedLamports - shownFees;
  if (quote.expectedTotalLamports !== expectedTotal)
    problems.push('expected total does not add up');
  const fees = platformPaid + priority + network;
  if (quote.side === 'buy') {
    const worst = quote.limitLamports + fees + accountRent;
    if (worst > quote.worstCaseLamports) problems.push('worst case cost is higher than shown');
  } else {
    const worst = quote.limitLamports - fees;
    if (worst < quote.worstCaseLamports) problems.push('worst case payout is lower than shown');
  }

  return { ok: problems.length === 0, problems };
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
