import type { TradeQuote } from '../trade';
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
): TradeCheck {
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
  let microLamports = 0n;
  let platformPaid = 0;
  let pumpInstructions = 0;
  let accountRent = 0;

  for (const ix of tx.instructions) {
    const tag = ix.data[0];
    switch (ix.programId) {
      case COMPUTE_BUDGET_PROGRAM:
        if (tag === 2 && ix.data.length === 5) computeUnits = readU32(ix.data, 1);
        else if (tag === 3 && ix.data.length === 9) microLamports = readU64(ix.data, 1);
        else problems.push('unexpected compute budget instruction');
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

  // The priority fee and the worst case on screen must be binding, not just shown.
  const priority =
    computeUnits === undefined
      ? 0
      : Number((BigInt(computeUnits) * microLamports + 999_999n) / 1_000_000n);
  if (priority > quote.fees.priorityLamports) problems.push('priority fee is higher than shown');
  const network = SIGNATURE_FEE_LAMPORTS * tx.numRequiredSignatures;
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
