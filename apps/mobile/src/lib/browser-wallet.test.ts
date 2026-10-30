import { decodeTransaction, publicKeyBytes, solanaKeys, withSignature } from '@sift/shared';
import { describe, expect, it } from 'vitest';
import {
  browserSignMessage,
  browserSignTransaction,
  connectBrowserWallet,
  installedWallets,
  registerForTest,
  sameMessage,
} from './browser-wallet';

const seed = new Uint8Array(32).fill(7);
const address = solanaKeys.publicKey(seed);
const other = solanaKeys.publicKey(new Uint8Array(32).fill(9));

/** A minimal legacy transaction: one signer (us), one other account, no instructions. */
function unsignedTx(blockhashByte = 1): Uint8Array {
  return Uint8Array.from([
    1,
    ...new Uint8Array(64), // one empty signature
    1,
    0,
    1, // header
    2,
    ...publicKeyBytes(address),
    ...publicKeyBytes(other),
    ...new Uint8Array(32).fill(blockhashByte), // recent blockhash
    0, // no instructions
  ]);
}

type Behaviour = 'honest' | 'tamper' | 'badSignature';
function fakeWallet(name: string, behaviour: Behaviour) {
  const account = { address, publicKey: publicKeyBytes(address), chains: ['solana:devnet'] };
  return {
    name,
    icon: 'data:image/svg+xml,',
    chains: ['solana:devnet', 'solana:mainnet'],
    accounts: [account],
    features: {
      'standard:connect': { connect: async () => ({ accounts: [account] }) },
      'solana:signMessage': {
        signMessage: async ({ message }: { message: Uint8Array }) => [
          { signature: solanaKeys.sign(message, seed) },
        ],
      },
      'solana:signTransaction': {
        signTransaction: async ({ transaction }: { transaction: Uint8Array }) => {
          const tx = behaviour === 'tamper' ? unsignedTx(2) : transaction;
          const message = decodeTransaction(tx).message;
          const signature =
            behaviour === 'badSignature'
              ? new Uint8Array(64).fill(1)
              : solanaKeys.sign(message, seed);
          return [{ signedTransaction: withSignature(tx, 0, signature) }];
        },
      },
    },
  };
}

registerForTest(fakeWallet('Honest', 'honest'), fakeWallet('Tamper', 'tamper'));
registerForTest(fakeWallet('BadSig', 'badSignature'));
registerForTest({ ...fakeWallet('NoSigning', 'honest'), features: {} });

describe('browser wallets', () => {
  it('lists only wallets that can connect and sign on Solana', () => {
    expect(installedWallets().map((w) => w.name)).toEqual(['Honest', 'Tamper', 'BadSig']);
  });

  it('connects and signs a transaction without changing it', async () => {
    const session = await connectBrowserWallet('Honest', 'devnet');
    expect(session).toEqual({ walletName: 'Honest', address, cluster: 'devnet' });
    const tx = unsignedTx();
    const signed = await browserSignTransaction(session, tx);
    expect(sameMessage(tx, signed)).toBe(true);
  });

  it('refuses a transaction the wallet changed', async () => {
    const session = await connectBrowserWallet('Tamper', 'devnet');
    await expect(browserSignTransaction(session, unsignedTx())).rejects.toThrow(
      /changed the transaction/,
    );
  });

  it('refuses a transaction without a valid signature', async () => {
    const session = await connectBrowserWallet('BadSig', 'devnet');
    await expect(browserSignTransaction(session, unsignedTx())).rejects.toThrow(
      /without a valid signature/,
    );
  });

  it('signs sign-in messages', async () => {
    const session = await connectBrowserWallet('Honest', 'devnet');
    const message = new TextEncoder().encode('Sift wants you to sign in');
    const signature = await browserSignMessage(session, message);
    expect(solanaKeys.verify(signature, message, address)).toBe(true);
  });

  it('says so when a wallet is not installed', async () => {
    await expect(connectBrowserWallet('Missing', 'devnet')).rejects.toThrow(/isn’t available/);
  });
});
