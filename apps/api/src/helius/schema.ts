import { z } from 'zod';

// Helius "enhanced" transactions, as delivered by webhooks and the enhanced
// transactions API. Only the fields we use are listed; anything else passes through.
// Shapes follow helius-sdk's EnhancedTransaction type.

const tokenTransfer = z.looseObject({
  fromUserAccount: z.string().nullish(),
  toUserAccount: z.string().nullish(),
  mint: z.string(),
  // UI amount; Helius sends a number, the SDK allows a numeric string.
  tokenAmount: z.union([z.number(), z.string()]).nullish(),
});

const nativeTransfer = z.looseObject({
  fromUserAccount: z.string().nullish(),
  toUserAccount: z.string().nullish(),
  /** Lamports. */
  amount: z.number(),
});

const accountData = z.looseObject({
  account: z.string(),
  /** Lamports gained (+) or spent (-) by this account in the transaction. */
  nativeBalanceChange: z.number().nullish(),
  tokenBalanceChanges: z.array(z.looseObject({ mint: z.string() })).nullish(),
});

export const enhancedTransactionSchema = z.looseObject({
  signature: z.string().min(1),
  type: z.string().nullish(),
  source: z.string().nullish(),
  feePayer: z.string().nullish(),
  /** Unix seconds. */
  timestamp: z.number().nullish(),
  transactionError: z.unknown().optional(),
  tokenTransfers: z.array(tokenTransfer).nullish(),
  nativeTransfers: z.array(nativeTransfer).nullish(),
  accountData: z.array(accountData).nullish(),
});

export type EnhancedTransaction = z.infer<typeof enhancedTransactionSchema>;
