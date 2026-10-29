import { bytesToBase64 } from '@sift/shared';
import {
  ComputeBudgetProgram,
  type Connection,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';

/** The Solana reads and sends the Sift wallet needs beyond trading. */
export interface WalletChain {
  solBalance(address: string): Promise<number>;
  /** The owner's balance of a token, in base units; null when they hold none. */
  tokenBalance(
    owner: string,
    mint: string,
  ): Promise<{ amountRaw: string; decimals: number } | null>;
  /** An unsigned SOL transfer (base64), paid by `from`. */
  buildTransfer(from: string, to: string, lamports: number): Promise<string>;
  sendSigned(transaction: string): Promise<string>;
}

// A fixed, small priority fee for withdrawals: 1,000 units at 1,000 micro-lamports.
const TRANSFER_UNITS = 1_000;
const TRANSFER_MICRO_LAMPORTS = 1_000;

export function createWalletChain(connection: Connection): WalletChain {
  return {
    solBalance: (address) => connection.getBalance(new PublicKey(address)),

    async tokenBalance(owner, mint) {
      const { value } = await connection.getParsedTokenAccountsByOwner(new PublicKey(owner), {
        mint: new PublicKey(mint),
      });
      let total = 0n;
      let decimals = 0;
      for (const account of value) {
        const info = (account.account.data as { parsed?: { info?: { tokenAmount?: unknown } } })
          .parsed?.info?.tokenAmount as { amount?: string; decimals?: number } | undefined;
        if (!info?.amount) continue;
        total += BigInt(info.amount);
        decimals = info.decimals ?? decimals;
      }
      return total > 0n ? { amountRaw: total.toString(), decimals } : null;
    },

    async buildTransfer(from, to, lamports) {
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      const message = new TransactionMessage({
        payerKey: new PublicKey(from),
        recentBlockhash: blockhash,
        instructions: [
          ComputeBudgetProgram.setComputeUnitLimit({ units: TRANSFER_UNITS }),
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: TRANSFER_MICRO_LAMPORTS }),
          SystemProgram.transfer({
            fromPubkey: new PublicKey(from),
            toPubkey: new PublicKey(to),
            lamports: BigInt(lamports),
          }),
        ],
      }).compileToV0Message();
      return bytesToBase64(new VersionedTransaction(message).serialize());
    },

    sendSigned: (transaction) =>
      connection.sendRawTransaction(Buffer.from(transaction, 'base64'), {
        skipPreflight: false,
        maxRetries: 3,
      }),
  };
}

/** Network fee for a withdrawal: signature fee plus the fixed priority fee, rounded up. */
export const WITHDRAWAL_FEE_LAMPORTS =
  5000 + Math.ceil((TRANSFER_UNITS * TRANSFER_MICRO_LAMPORTS) / 1_000_000);
