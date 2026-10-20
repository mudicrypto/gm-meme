import {
  type TradeQuote,
  TOKEN_2022_PROGRAM,
  associatedTokenAddress,
  base64ToBytes,
  bytesToBase64,
  verifyTradeTransaction,
} from '@sift/shared';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  type TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import BN from 'bn.js';
import { describe, expect, it } from 'vitest';
import { TradeError } from '../src/trading/errors';
import { createTradeService } from '../src/trading/service';
import {
  FEE_WALLET,
  MINT,
  asConnection,
  fakeConnection,
  fakePumpTrader,
  pumpInstruction,
} from './helpers/fake-trading';

const user = Keypair.generate();
const wallet = user.publicKey.toBase58();
const attacker = Keypair.generate().publicKey;

function setup(connection = fakeConnection(), feeWallet: string | null = FEE_WALLET) {
  const pump = fakePumpTrader();
  const service = createTradeService({
    connection: asConnection(connection),
    pump,
    estimatePriorityFee: async () => 50_000,
    feeWallet,
    platformFeeBps: 50,
  });
  return { service, pump, connection };
}

const buyRequest = {
  mint: MINT.toBase58(),
  wallet,
  side: 'buy' as const,
  amount: '100000000',
  slippageBps: 500,
};

describe('associated token address', () => {
  it('matches spl-token for both token programs', () => {
    for (const program of [TOKEN_2022_PROGRAM, 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA']) {
      expect(associatedTokenAddress(wallet, MINT.toBase58(), program)).toBe(
        getAssociatedTokenAddressSync(
          MINT,
          user.publicKey,
          false,
          new PublicKey(program),
        ).toBase58(),
      );
    }
  });
});

describe('trade quotes', () => {
  it('quotes a buy with every cost spelled out, and the numbers add up', async () => {
    const { service } = setup();
    const q = await service.quote(buyRequest);
    // 0.1 SOL budget: 0.5% platform fee comes out of it, the rest goes to the curve.
    expect(q.fees.platformLamports).toBe(500_000);
    expect(q.expectedLamports).toBe(99_500_000);
    expect(q.limitLamports).toBe(104_475_000); // +5% slippage
    expect(q.fees.priorityLamports).toBe(Math.ceil((108_000 * 50_000) / 1e6)); // 90k units × 1.2
    expect(q.fees.networkLamports).toBe(5000);
    // Token account (170 bytes) + pump.fun's volume tracker (137 bytes) on a first buy.
    expect(q.fees.accountRentLamports).toBe(1_513_840 + 1_346_200);
    const fees = q.fees.platformLamports + q.fees.priorityLamports + q.fees.networkLamports;
    expect(q.expectedTotalLamports).toBe(q.expectedLamports + fees + q.fees.accountRentLamports);
    expect(q.worstCaseLamports).toBe(q.limitLamports + fees + q.fees.accountRentLamports);
    expect(verifyTradeTransaction(base64ToBytes(q.transaction), q, FEE_WALLET)).toEqual({
      ok: true,
      problems: [],
    });
  });

  it('quotes a sell with the fee taken from the guaranteed minimum', async () => {
    const { service } = setup();
    const q = await service.quote({ ...buyRequest, side: 'sell', amount: '50000000000' });
    expect(q.expectedLamports).toBe(50_000_000);
    expect(q.limitLamports).toBe(47_500_000);
    expect(q.fees.platformLamports).toBe(237_500);
    expect(q.worstCaseLamports).toBe(47_500_000 - 237_500 - q.fees.priorityLamports - 5000);
    expect(verifyTradeTransaction(base64ToBytes(q.transaction), q, FEE_WALLET).ok).toBe(true);
  });

  it('charges no platform fee when no fee wallet is set', async () => {
    const { service } = setup(fakeConnection(), null);
    const q = await service.quote(buyRequest);
    expect(q.fees).toMatchObject({ platformLamports: 0, platformBps: 0 });
    expect(q.expectedLamports).toBe(100_000_000);
    expect(verifyTradeTransaction(base64ToBytes(q.transaction), q, null).ok).toBe(true);
  });

  it('charges no fee while the fee wallet is too empty to receive one, and says so', async () => {
    const connection = fakeConnection();
    let feeWalletBalance = 0;
    connection.getBalance.mockImplementation(async (key: PublicKey) =>
      key.toBase58() === FEE_WALLET ? feeWalletBalance : 5_000_000_000,
    );
    const errors: unknown[] = [];
    let clock = Date.parse('2026-10-20T10:00:00Z');
    const service = createTradeService({
      connection: asConnection(connection),
      pump: fakePumpTrader(),
      estimatePriorityFee: async () => 50_000,
      feeWallet: FEE_WALLET,
      platformFeeBps: 50,
      log: { error: (...args: unknown[]) => errors.push(args) },
      now: () => new Date(clock),
    });

    const unfunded = await service.quote(buyRequest);
    expect(unfunded.fees).toMatchObject({ platformLamports: 0, platformBps: 0 });
    expect(
      verifyTradeTransaction(base64ToBytes(unfunded.transaction), unfunded, FEE_WALLET).ok,
    ).toBe(true);
    expect(errors).toHaveLength(1);

    feeWalletBalance = 1_000_000; // funded; rechecked after a minute
    clock += 61_000;
    const funded = await service.quote(buyRequest);
    expect(funded.fees).toMatchObject({ platformLamports: 500_000, platformBps: 50 });
  });

  it('refuses a buy the wallet cannot afford in the worst case', async () => {
    const { service } = setup(fakeConnection({ balance: 100_000_000 }));
    await expect(service.quote(buyRequest)).rejects.toMatchObject({ code: 'INSUFFICIENT_SOL' });
  });

  it('says plainly when the wallet has no SOL at all, without simulating', async () => {
    const connection = fakeConnection({ balance: 0 });
    const { service } = setup(connection);
    await expect(service.quote(buyRequest)).rejects.toMatchObject({
      code: 'INSUFFICIENT_SOL',
      message: expect.stringContaining('no SOL yet'),
    });
    expect(connection.simulateTransaction).not.toHaveBeenCalled();
  });

  it('explains a trade that would fail on chain', async () => {
    const logs = [
      'Program log: AnchorError thrown. Error Code: TooLittleSolReceived. Error Message: slippage: Too little SOL received to sell the given amount of tokens.',
    ];
    const { service } = setup(fakeConnection({ simulationError: { logs } }));
    const error = await service.quote(buyRequest).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TradeError);
    expect((error as TradeError).message).toBe(
      'This trade would fail: slippage: Too little SOL received to sell the given amount of tokens',
    );
  });
});

describe('submitting signed trades', () => {
  const sign = (q: TradeQuote, signer = user) => {
    const tx = VersionedTransaction.deserialize(base64ToBytes(q.transaction));
    tx.sign([signer]);
    return bytesToBase64(tx.serialize());
  };

  it('relays a correctly signed quote once', async () => {
    const { service, connection } = setup();
    const q = await service.quote(buyRequest);
    expect(await service.submit(q.quoteId, sign(q))).toBe('5'.repeat(88));
    expect(connection.sendRawTransaction).toHaveBeenCalledTimes(1);
    await expect(service.submit(q.quoteId, sign(q))).rejects.toMatchObject({
      code: 'QUOTE_NOT_FOUND',
    });
  });

  it('refuses a transaction signed by someone else', async () => {
    const { service, connection } = setup();
    const q = await service.quote(buyRequest);
    const tx = VersionedTransaction.deserialize(base64ToBytes(q.transaction));
    tx.signatures[0] = Keypair.generate().secretKey.subarray(0, 64);
    await expect(service.submit(q.quoteId, bytesToBase64(tx.serialize()))).rejects.toMatchObject({
      code: 'BAD_SIGNATURE',
    });
    expect(connection.sendRawTransaction).not.toHaveBeenCalled();
  });

  it('refuses to relay anything other than the quoted transaction', async () => {
    const { service } = setup();
    const q = await service.quote(buyRequest);
    const other = await service.quote({ ...buyRequest, amount: '200000000' });
    await expect(service.submit(q.quoteId, sign(other))).rejects.toMatchObject({
      code: 'TRANSACTION_MISMATCH',
    });
    await expect(service.submit(q.quoteId, 'not base64 !!')).rejects.toMatchObject({
      code: 'TRANSACTION_MISMATCH',
    });
  });

  it('refuses an expired quote', async () => {
    let clock = Date.parse('2026-10-20T10:00:00Z');
    const pump = fakePumpTrader();
    const service = createTradeService({
      connection: asConnection(fakeConnection()),
      pump,
      estimatePriorityFee: async () => 50_000,
      feeWallet: FEE_WALLET,
      platformFeeBps: 50,
      now: () => new Date(clock),
    });
    const q = await service.quote(buyRequest);
    clock += 76_000;
    await expect(service.submit(q.quoteId, sign(q))).rejects.toMatchObject({
      code: 'QUOTE_NOT_FOUND',
    });
  });

  it('reports confirmation status', async () => {
    const { service } = setup();
    expect(await service.status('5'.repeat(88))).toEqual({
      signature: '5'.repeat(88),
      status: 'confirmed',
    });
  });
});

describe('on-device verification catches a malicious server', () => {
  // Rebuild the quoted transaction with its instructions changed, as a compromised API might.
  async function tampered(
    change: (ixs: TransactionInstruction[], q: TradeQuote) => TransactionInstruction[],
    payer = user.publicKey,
  ) {
    const { service } = setup();
    const q = await service.quote(buyRequest);
    const tx = VersionedTransaction.deserialize(base64ToBytes(q.transaction));
    const message = TransactionMessage.decompile(tx.message);
    const rebuilt = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: message.recentBlockhash,
      instructions: change(message.instructions, q),
    }).compileToV0Message();
    return verifyTradeTransaction(new VersionedTransaction(rebuilt).serialize(), q, FEE_WALLET);
  }
  const isPump = (ix: TransactionInstruction) =>
    ix.programId.toBase58() === '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
  const isFee = (ix: TransactionInstruction) => ix.programId.equals(SystemProgram.programId);

  it.each<
    [string, (ixs: TransactionInstruction[], q: TradeQuote) => TransactionInstruction[], RegExp]
  >([
    [
      'an extra SOL transfer to an attacker',
      (ixs) => [
        ...ixs,
        SystemProgram.transfer({ fromPubkey: user.publicKey, toPubkey: attacker, lamports: 1 }),
      ],
      /more than one fee transfer|unknown address/,
    ],
    [
      'the fee redirected to an attacker',
      (ixs) =>
        ixs.map((ix) =>
          isFee(ix)
            ? SystemProgram.transfer({
                fromPubkey: user.publicKey,
                toPubkey: attacker,
                lamports: 500_000,
              })
            : ix,
        ),
      /unknown address/,
    ],
    [
      'a bigger platform fee',
      (ixs) =>
        ixs.map((ix) =>
          isFee(ix)
            ? SystemProgram.transfer({
                fromPubkey: user.publicKey,
                toPubkey: new PublicKey(FEE_WALLET),
                lamports: 5_000_000,
              })
            : ix,
        ),
      /platform fee differs/,
    ],
    [
      'a higher max SOL cost',
      (ixs, q) =>
        ixs.map((ix) =>
          isPump(ix)
            ? pumpInstruction({
                side: 'buy',
                user: user.publicKey,
                amount: new BN(q.tokenAmount),
                solLimit: new BN(q.limitLamports * 2),
              })
            : ix,
        ),
      /more SOL than the quote/,
    ],
    [
      'fewer tokens bought',
      (ixs, q) =>
        ixs.map((ix) =>
          isPump(ix)
            ? pumpInstruction({
                side: 'buy',
                user: user.publicKey,
                amount: new BN(q.tokenAmount).divn(2),
                solLimit: new BN(q.limitLamports),
              })
            : ix,
        ),
      /token amount differs/,
    ],
    [
      'tokens sent to an attacker account',
      (ixs, q) =>
        ixs.map((ix) =>
          isPump(ix)
            ? pumpInstruction({
                side: 'buy',
                user: user.publicKey,
                amount: new BN(q.tokenAmount),
                solLimit: new BN(q.limitLamports),
                userTokenAccount: attacker,
              })
            : ix,
        ),
      /not yours/,
    ],
    [
      'a different token',
      (ixs, q) =>
        ixs.map((ix) =>
          isPump(ix)
            ? pumpInstruction({
                side: 'buy',
                user: user.publicKey,
                amount: new BN(q.tokenAmount),
                solLimit: new BN(q.limitLamports),
                mint: attacker,
              })
            : ix,
        ),
      /different token/,
    ],
    [
      'a sell instead of a buy',
      (ixs, q) =>
        ixs.map((ix) =>
          isPump(ix)
            ? pumpInstruction({
                side: 'sell',
                user: user.publicKey,
                amount: new BN(q.tokenAmount),
                solLimit: new BN(0),
              })
            : ix,
        ),
      /not a buy/,
    ],
    [
      'an unknown program',
      (ixs) => [...ixs, { ...ixs[0]!, programId: attacker, keys: [], data: Buffer.alloc(0) }],
      /unexpected program/,
    ],
    [
      'a much higher priority fee',
      (ixs) =>
        ixs.map((ix) =>
          ix.programId.equals(ComputeBudgetProgram.programId) && ix.data[0] === 3
            ? ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000_000 })
            : ix,
        ),
      /priority fee is higher/,
    ],
    ['two trades in one transaction', (ixs) => [...ixs, ixs.find(isPump)!], /exactly one trade/],
  ])('rejects %s', async (_name, change, problem) => {
    const check = await tampered(change);
    expect(check.ok).toBe(false);
    expect(check.problems.join('; ')).toMatch(problem);
  });

  it('rejects a different fee payer', async () => {
    const other = Keypair.generate().publicKey;
    const check = await tampered((ixs) => ixs, other);
    expect(check.problems).toContain('fee payer is not your wallet');
  });

  it('rejects a fee transfer when the app has no fee wallet configured', async () => {
    const { service } = setup();
    const q = await service.quote(buyRequest);
    expect(verifyTradeTransaction(base64ToBytes(q.transaction), q, null).problems).toContain(
      'SOL transfer to an unknown address',
    );
  });

  it('rejects a quote whose on-screen worst case understates the limit', async () => {
    const { service } = setup();
    const q = await service.quote(buyRequest);
    const understated = { ...q, worstCaseLamports: q.worstCaseLamports - 1 };
    expect(
      verifyTradeTransaction(base64ToBytes(q.transaction), understated, FEE_WALLET).problems,
    ).toContain('worst case cost is higher than shown');
  });

  it('rejects bytes that are not a transaction', () => {
    expect(
      verifyTradeTransaction(Uint8Array.from([1, 2, 3]), {} as TradeQuote, FEE_WALLET).ok,
    ).toBe(false);
  });
});

describe('phone-side signing is standard Solana', () => {
  it('signs exactly like @solana/web3.js, and the exported key imports as the same wallet', async () => {
    const {
      base58Decode,
      base58Encode,
      publicKeyBytes,
      solanaKeys,
      withSignature,
      decodeTransaction,
    } = await import('@sift/shared');
    const seed = Uint8Array.from({ length: 32 }, (_, i) => (i * 7 + 3) % 256);
    const address = solanaKeys.publicKey(seed);
    const official = Keypair.fromSeed(seed);
    expect(address).toBe(official.publicKey.toBase58());

    // The wallet's "Show private key" format: seed followed by public key, base58.
    const exported = base58Encode(Uint8Array.from([...seed, ...publicKeyBytes(address)]));
    expect(Keypair.fromSecretKey(base58Decode(exported)).publicKey.toBase58()).toBe(address);

    // Sign a real quote both ways: ed25519 is deterministic, so the bytes must match.
    const { service } = setup();
    const q = await service.quote({ ...buyRequest, wallet: address });
    const bytes = base64ToBytes(q.transaction);
    const ours = withSignature(bytes, 0, solanaKeys.sign(decodeTransaction(bytes).message, seed));
    const theirs = VersionedTransaction.deserialize(bytes);
    theirs.sign([official]);
    expect(bytesToBase64(ours)).toBe(bytesToBase64(theirs.serialize()));
    expect(await service.submit(q.quoteId, bytesToBase64(ours))).toBe('5'.repeat(88));
  });
});
