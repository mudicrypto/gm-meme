import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { WITHDRAWAL_FEE_LAMPORTS, createWalletChain } from '../src/sift-wallet/chain';
import { createTradeService } from '../src/trading/service';
import { asConnection, fakeConnection, fakePumpTrader } from './helpers/fake-trading';

const SOL = 1_000_000_000;
const from = Keypair.generate();
const to = Keypair.generate().publicKey.toBase58();

function setup(balance = 2 * SOL) {
  const connection = fakeConnection({ balance });
  const app = buildApp(loadConfig({ LOG_LEVEL: 'silent', ALERT_CHECK_INTERVAL_MS: '0' }), {
    helius: null,
    tradeService: createTradeService({
      connection: asConnection(connection),
      pump: fakePumpTrader(),
      estimatePriorityFee: async () => 10_000,
      feeWallet: null,
      platformFeeBps: 0,
    }),
    walletChain: createWalletChain(asConnection(connection)),
  });
  return { app, connection };
}

const transfer = { from: from.publicKey.toBase58(), to, lamports: SOL / 2 };

function signed(base64: string) {
  const tx = VersionedTransaction.deserialize(Buffer.from(base64, 'base64'));
  tx.sign([from]);
  return Buffer.from(tx.serialize()).toString('base64');
}

describe('transfers', () => {
  it('builds exactly the transfer asked for, with its fee', async () => {
    const { app } = setup();
    const res = await app.inject({ method: 'POST', url: '/transfers/build', payload: transfer });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ transaction: string; feeLamports: number }>();
    expect(body.feeLamports).toBe(WITHDRAWAL_FEE_LAMPORTS);
    const tx = VersionedTransaction.deserialize(Buffer.from(body.transaction, 'base64'));
    expect(tx.message.staticAccountKeys[0]!.toBase58()).toBe(transfer.from);
  });

  it('refuses more than the balance, a self-send and bad input', async () => {
    const { app } = setup(SOL / 4);
    const tooMuch = await app.inject({
      method: 'POST',
      url: '/transfers/build',
      payload: transfer,
    });
    expect(tooMuch.statusCode).toBe(422);
    expect(tooMuch.json<{ message: string }>().message).toMatch(/up to/);
    const self = await app.inject({
      method: 'POST',
      url: '/transfers/build',
      payload: { ...transfer, to: transfer.from },
    });
    expect(self.statusCode).toBe(400);
    const bad = await app.inject({
      method: 'POST',
      url: '/transfers/build',
      payload: { ...transfer, lamports: -1 },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('relays the signed transfer', async () => {
    const { app, connection } = setup();
    const built = await app.inject({ method: 'POST', url: '/transfers/build', payload: transfer });
    const transaction = signed(built.json<{ transaction: string }>().transaction);
    const res = await app.inject({
      method: 'POST',
      url: '/transfers/send',
      payload: { transfer, transaction },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ signature: string }>().signature).toBeTruthy();
    expect(connection.sendRawTransaction).toHaveBeenCalledOnce();
  });

  it('refuses to relay anything but the transfer asked for', async () => {
    const { app, connection } = setup();
    const other = Keypair.generate().publicKey;
    const tampered = new VersionedTransaction(
      new TransactionMessage({
        payerKey: from.publicKey,
        recentBlockhash: 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi',
        instructions: [
          SystemProgram.transfer({
            fromPubkey: from.publicKey,
            toPubkey: other,
            lamports: SOL / 2,
          }),
        ],
      }).compileToV0Message(),
    );
    tampered.sign([from]);
    const res = await app.inject({
      method: 'POST',
      url: '/transfers/send',
      payload: { transfer, transaction: Buffer.from(tampered.serialize()).toString('base64') },
    });
    expect(res.statusCode).toBe(422);
    expect(connection.sendRawTransaction).not.toHaveBeenCalled();
  });

  it('is off without a trading setup', async () => {
    const app = buildApp(loadConfig({ LOG_LEVEL: 'silent' }), { helius: null });
    const res = await app.inject({ method: 'POST', url: '/transfers/build', payload: transfer });
    expect(res.statusCode).toBe(503);
  });

  it('a transfer checked with other words names them', async () => {
    const { transferProblems } = await import('@sift/shared');
    const tx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: from.publicKey,
        recentBlockhash: 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi',
        instructions: [
          SystemProgram.transfer({
            fromPubkey: from.publicKey,
            toPubkey: new PublicKey(Keypair.generate().publicKey),
            lamports: 1,
          }),
        ],
      }).compileToV0Message(),
    );
    const problems = transferProblems(Buffer.from(tx.serialize()).toString('base64'), transfer, {
      payer: 'your wallet',
      recipient: 'the address you entered',
    });
    expect(problems).toContain('transfer not to the address you entered');
    expect(problems).toContain('wrong amount');
  });
});
