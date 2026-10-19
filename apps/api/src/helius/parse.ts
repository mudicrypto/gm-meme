import { LAMPORTS_PER_SOL, QUOTE_MINTS, WSOL_MINT, isSolanaAddress } from '@sift/shared';
import type { SwapRecord, TokenRecord } from '../tokens/repository';
import { type EnhancedTransaction, enhancedTransactionSchema } from './schema';

/** Helius transaction types that create a token (pump.fun reports CREATE). */
const LAUNCH_TYPES = new Set(['CREATE', 'TOKEN_MINT']);
const SWAP_TYPE = 'SWAP';

export interface ParsedBatch {
  launches: TokenRecord[];
  swaps: SwapRecord[];
  /** Entries that failed validation and were skipped. */
  invalid: number;
}

/**
 * Turn a batch of Helius enhanced transactions into token launches and swaps.
 * Failed transactions and anything not shaped like a launch or swap are ignored.
 * Malformed entries are counted, not thrown, so one bad item can't drop a batch.
 */
export function parseTransactions(items: readonly unknown[]): ParsedBatch {
  const batch: ParsedBatch = { launches: [], swaps: [], invalid: 0 };

  for (const item of items) {
    const parsed = enhancedTransactionSchema.safeParse(item);
    if (!parsed.success) {
      batch.invalid += 1;
      continue;
    }
    const tx = parsed.data;
    if (tx.transactionError) continue;

    if (tx.type && LAUNCH_TYPES.has(tx.type)) {
      batch.launches.push(...parseLaunch(tx));
    } else if (tx.type === SWAP_TYPE) {
      batch.swaps.push(...parseSwap(tx));
    }
  }

  return batch;
}

function parseLaunch(tx: EnhancedTransaction): TokenRecord[] {
  const transfers = tx.tokenTransfers ?? [];
  const tradedMints = uniqueTokenMints(transfers.map((t) => t.mint));
  // Prefer mints that were minted in this transaction (sent from no account).
  const minted = uniqueTokenMints(transfers.filter((t) => !t.fromUserAccount).map((t) => t.mint));
  const mints = minted.length > 0 ? minted : tradedMints;

  return mints.map((mint) => ({
    mint,
    creator: tx.feePayer && isSolanaAddress(tx.feePayer) ? tx.feePayer : undefined,
    launchSignature: tx.signature,
    launchSource: tx.source ?? undefined,
    launchedAt: blockTime(tx),
  }));
}

function parseSwap(tx: EnhancedTransaction): SwapRecord[] {
  const trader = tx.feePayer;
  if (!trader || !isSolanaAddress(trader)) return [];

  const mints = uniqueTokenMints((tx.tokenTransfers ?? []).map((t) => t.mint));
  const volumeSol = swapVolumeSol(tx, trader);

  return mints.map((mint) => ({
    signature: tx.signature,
    mint,
    trader,
    volumeSol,
    blockTime: blockTime(tx),
  }));
}

/**
 * Trade size in SOL: the largest single SOL movement to or from the trader, native
 * or wrapped. Taking the largest ignores the small fee and tip transfers alongside it.
 * Undefined for token-for-token swaps with no SOL leg.
 */
function swapVolumeSol(tx: EnhancedTransaction, trader: string): number | undefined {
  const amounts: number[] = [];
  for (const t of tx.nativeTransfers ?? []) {
    if (t.fromUserAccount === trader || t.toUserAccount === trader) {
      amounts.push(t.amount / LAMPORTS_PER_SOL);
    }
  }
  for (const t of tx.tokenTransfers ?? []) {
    if (t.mint !== WSOL_MINT) continue;
    if (t.fromUserAccount !== trader && t.toUserAccount !== trader) continue;
    const amount = Number(t.tokenAmount);
    if (Number.isFinite(amount)) amounts.push(amount);
  }
  const positive = amounts.filter((amount) => amount > 0);
  return positive.length > 0 ? Math.max(...positive) : undefined;
}

/** Distinct valid mints that aren't SOL or stablecoins. */
function uniqueTokenMints(mints: readonly string[]): string[] {
  return [...new Set(mints)].filter((mint) => isSolanaAddress(mint) && !QUOTE_MINTS.has(mint));
}

function blockTime(tx: EnhancedTransaction): string {
  return (tx.timestamp ? new Date(tx.timestamp * 1000) : new Date()).toISOString();
}
