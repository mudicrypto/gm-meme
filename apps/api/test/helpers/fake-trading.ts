import { PUMP_PROGRAM, TOKEN_2022_PROGRAM, associatedTokenAddress } from '@sift/shared';
import { createAssociatedTokenAccountIdempotentInstruction } from '@solana/spl-token';
import { type Connection, Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js';
import BN from 'bn.js';
import { vi } from 'vitest';
import type { PumpTrade, PumpTrader } from '../../src/trading/pump-trader';

export const MINT = new PublicKey('E8NT2qghrktonV3RSSAc9nRmhhNxganaFo7ZWZpAFdCf');
export const FEE_WALLET = '4wEjLrMqewYf5kkgAjS4htKoHmtpyXPn8Ye9BDS9vjgJ';
const TOKEN_2022 = new PublicKey(TOKEN_2022_PROGRAM);
const BUY = Buffer.from('66063d1201daebea', 'hex');
const SELL = Buffer.from('33e685a4017f83ad', 'hex');

const u64 = (value: BN | bigint | number) => new BN(value.toString()).toArrayLike(Buffer, 'le', 8);
const other = (label: string) => Keypair.fromSeed(Buffer.alloc(32, label)).publicKey;

/** A pump.fun buy or sell with the real account layout and data encoding. */
export function pumpInstruction(opts: {
  side: 'buy' | 'sell';
  user: PublicKey;
  amount: BN;
  solLimit: BN;
  mint?: PublicKey;
  userTokenAccount?: PublicKey;
}): TransactionInstruction {
  const mint = opts.mint ?? MINT;
  const ata =
    opts.userTokenAccount ??
    new PublicKey(
      associatedTokenAddress(opts.user.toBase58(), mint.toBase58(), TOKEN_2022_PROGRAM),
    );
  const keys = Array.from({ length: opts.side === 'buy' ? 16 : 14 }, (_, i) => ({
    pubkey: other(`k${i}`),
    isSigner: false,
    isWritable: false,
  }));
  keys[2] = { pubkey: mint, isSigner: false, isWritable: false };
  keys[5] = { pubkey: ata, isSigner: false, isWritable: true };
  keys[6] = { pubkey: opts.user, isSigner: true, isWritable: true };
  keys[opts.side === 'buy' ? 8 : 9] = { pubkey: TOKEN_2022, isSigner: false, isWritable: false };
  const tail = opts.side === 'buy' ? Buffer.from([1, 1, 0, 0]) : Buffer.alloc(0); // OptionBool args
  return new TransactionInstruction({
    programId: new PublicKey(PUMP_PROGRAM),
    keys,
    data: Buffer.concat([
      opts.side === 'buy' ? BUY : SELL,
      u64(opts.amount),
      u64(opts.solLimit),
      tail,
    ]),
  });
}

/** A PumpTrader that prices 1 lamport = 1000 base units and builds real-shaped instructions. */
export function fakePumpTrader(): PumpTrader & {
  buildBuy: ReturnType<typeof vi.fn>;
  buildSell: ReturnType<typeof vi.fn>;
} {
  const trade = (
    side: 'buy' | 'sell',
    user: PublicKey,
    tokens: BN,
    expected: BN,
    limit: BN,
    createsAta: boolean,
  ): PumpTrade => {
    const instructions: TransactionInstruction[] = [];
    if (createsAta) {
      const ata = new PublicKey(
        associatedTokenAddress(user.toBase58(), MINT.toBase58(), TOKEN_2022_PROGRAM),
      );
      instructions.push(
        createAssociatedTokenAccountIdempotentInstruction(user, ata, user, MINT, TOKEN_2022),
      );
    }
    instructions.push(pumpInstruction({ side, user, amount: tokens, solLimit: limit }));
    return {
      instructions,
      tokenAmount: tokens,
      expectedLamports: expected,
      limitLamports: limit,
      tokenProgram: TOKEN_2022,
      decimals: 6,
      createsTokenAccount: createsAta,
      priceImpactPct: 1.5,
    };
  };
  return {
    buildBuy: vi.fn(async ({ user, solLamports, slippageBps }) => {
      const limit = solLamports.add(
        solLamports.muln(Math.floor((slippageBps / 100) * 10)).divn(1000),
      );
      return trade('buy', new PublicKey(user), solLamports.muln(1000), solLamports, limit, true);
    }),
    buildSell: vi.fn(async ({ user, tokenAmount, slippageBps }) => {
      const expected = tokenAmount.divn(1000);
      const limit = expected.sub(expected.muln(Math.floor((slippageBps / 100) * 10)).divn(1000));
      return trade('sell', new PublicKey(user), tokenAmount, expected, limit, false);
    }),
  };
}

export function fakeConnection(
  overrides: { balance?: number; simulationError?: { logs: string[] } } = {},
) {
  return {
    getLatestBlockhash: vi.fn(async () => ({
      blockhash: 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi',
      lastValidBlockHeight: 1,
    })),
    getBalance: vi.fn(async () => overrides.balance ?? 5_000_000_000),
    getMinimumBalanceForRentExemption: vi.fn(async () => 2_074_080),
    simulateTransaction: vi.fn(async () => ({
      context: { slot: 1 },
      value: overrides.simulationError
        ? {
            err: { InstructionError: [2, { Custom: 6002 }] },
            logs: overrides.simulationError.logs,
            unitsConsumed: 40_000,
          }
        : { err: null, logs: [], unitsConsumed: 90_000 },
    })),
    sendRawTransaction: vi.fn(async () => '5'.repeat(88)),
    getSignatureStatuses: vi.fn(async () => ({
      context: { slot: 1 },
      value: [{ confirmationStatus: 'confirmed', err: null, slot: 1, confirmations: 1 }],
    })),
  };
}

export const asConnection = (c: ReturnType<typeof fakeConnection>) => c as unknown as Connection;
