import { LAMPORTS_PER_SOL, QUOTE_MINTS, WSOL_MINT, isSolanaAddress } from '@sift/shared';
import type { SwapRecord, TokenRecord } from '../tokens/repository';
import { type EnhancedTransaction, enhancedTransactionSchema } from './schema';

/** Helius transaction types that create a token (pump.fun reports CREATE; checked on devnet). */
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
  // Prefer mints that were minted in this transaction (sent from no account), then any
  // traded mint (pump.fun's create-and-buy). A create with no dev buy has no token
  // transfers at all; its mint only shows up in the balance changes.
  const minted = uniqueTokenMints(transfers.filter((t) => !t.fromUserAccount).map((t) => t.mint));
  const traded = uniqueTokenMints(transfers.map((t) => t.mint));
  const balanceChanged = uniqueTokenMints(
    (tx.accountData ?? []).flatMap((a) => (a.tokenBalanceChanges ?? []).map((c) => c.mint)),
  );
  const mints = [minted, traded, balanceChanged].find((list) => list.length > 0) ?? [];

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
 * Trade size in SOL. The trader's own SOL balance change is the most reliable signal:
 * pump.fun pays sellers by moving lamports directly, which never shows up as a
 * transfer. Swaps paid in wrapped SOL leave the balance almost unchanged (just the
 * fee), so also consider the largest SOL transfer to or from the trader and take the
 * bigger of the two. Undefined for token-for-token swaps with no SOL leg.
 */
function swapVolumeSol(tx: EnhancedTransaction, trader: string): number | undefined {
  const amounts: number[] = [];
  const balanceChange = tx.accountData?.find((a) => a.account === trader)?.nativeBalanceChange;
  if (balanceChange) amounts.push(Math.abs(balanceChange) / LAMPORTS_PER_SOL);
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
