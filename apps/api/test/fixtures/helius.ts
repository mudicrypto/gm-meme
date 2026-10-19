// Helius enhanced transactions, shaped like real webhook deliveries (helius-sdk's
// EnhancedTransaction). Only what Sift reads is filled in.
import { WSOL_MINT } from '@sift/shared';

/** A valid-looking base58 address built from a readable label (no 0, O, I or l). */
export const addr = (label: string) => label.padEnd(44, '1');

export const MINT_A = addr('MintA');
export const MINT_B = addr('MintB');
export const DEV = addr('Dev');
export const ALICE = addr('A1ice');
export const BOB = addr('Bob');
export const CAROL = addr('Caro');
const CURVE = addr('Curve');
const FEES = addr('Fees');

/** 2026-10-19T10:00:00Z */
export const T0 = Date.UTC(2026, 9, 19, 10) / 1000;

export function createTx(
  mint: string,
  creator: string,
  timestamp: number,
  signature = `create-${mint}`,
) {
  return {
    signature,
    type: 'CREATE',
    source: 'PUMP_FUN',
    feePayer: creator,
    timestamp,
    transactionError: null,
    description: `${creator} created a token`,
    tokenTransfers: [
      {
        fromUserAccount: '',
        toUserAccount: CURVE,
        fromTokenAccount: '',
        toTokenAccount: addr('CurveATA'),
        mint,
        tokenAmount: 1_000_000_000,
      },
    ],
    nativeTransfers: [{ fromUserAccount: creator, toUserAccount: CURVE, amount: 20_000_000 }],
  };
}

/** Buy on the bonding curve: SOL in natively, tokens out. */
export function buyTx(
  mint: string,
  trader: string,
  sol: number,
  timestamp: number,
  signature = `buy-${mint}-${trader}-${timestamp}`,
) {
  return {
    signature,
    type: 'SWAP',
    source: 'PUMP_FUN',
    feePayer: trader,
    timestamp,
    transactionError: null,
    tokenTransfers: [
      { fromUserAccount: CURVE, toUserAccount: trader, mint, tokenAmount: 35_000.5 },
    ],
    nativeTransfers: [
      { fromUserAccount: trader, toUserAccount: CURVE, amount: sol * 1_000_000_000 },
      // Platform fee: must not count as the trade size.
      { fromUserAccount: trader, toUserAccount: FEES, amount: sol * 10_000_000 },
    ],
  };
}

/** Sell through an AMM: tokens in, wrapped SOL out (amount as a string, as the SDK allows). */
export function sellForWsolTx(mint: string, trader: string, sol: string, timestamp: number) {
  return {
    signature: `sell-${mint}-${trader}-${timestamp}`,
    type: 'SWAP',
    source: 'RAYDIUM',
    feePayer: trader,
    timestamp,
    tokenTransfers: [
      { fromUserAccount: trader, toUserAccount: addr('Poo'), mint, tokenAmount: 1000 },
      { fromUserAccount: addr('Poo'), toUserAccount: trader, mint: WSOL_MINT, tokenAmount: sol },
    ],
    nativeTransfers: [],
  };
}

export function failedTx(mint: string) {
  return {
    ...buyTx(mint, ALICE, 1, T0),
    signature: 'failed',
    transactionError: { InstructionError: [0, 'Custom'] },
  };
}

/** getAssetBatch result entry. */
export function dasAsset(mint: string, name: string, symbol: string) {
  return {
    interface: 'FungibleToken',
    id: mint,
    content: {
      metadata: { name, symbol },
      links: { image: `https://ipfs.example/${symbol}.png` },
    },
    token_info: {
      symbol,
      decimals: 6,
      supply: 1_000_000_000_000_000,
      token_program: addr('Tokenkeg'),
    },
    ownership: { frozen: false, delegated: false, ownership_model: 'token', owner: '' },
    mutable: true,
    burnt: false,
  };
}
