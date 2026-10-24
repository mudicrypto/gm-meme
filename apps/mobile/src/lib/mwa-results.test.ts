import { bytesToBase64, publicKeyBytes, solanaKeys, withSignature } from '@sift/shared';
import { describe, expect, it } from 'vitest';
import {
  authorizedAddress,
  checkedMessageSignature,
  checkedSignedTransaction,
  mwaErrorMessage,
  safeWalletUriBase,
} from './mwa-results';

const seed = new Uint8Array(32).fill(5);
const address = solanaKeys.publicKey(seed);
const keyBytes = () => publicKeyBytes(address);

/** A minimal one-signer legacy transaction for `signer`. */
function tx(signer: string, blockhashByte = 7) {
  return Uint8Array.from([
    1,
    ...new Array(64).fill(0),
    1,
    0,
    0,
    1,
    ...publicKeyBytes(signer),
    ...new Array(32).fill(blockhashByte),
    0,
  ]);
}
const sign = (bytes: Uint8Array, key = seed) =>
  withSignature(bytes, 0, solanaKeys.sign(bytes.subarray(65), key));

describe('Mobile Wallet Adapter answers', () => {
  it('reads the authorized address from either account shape', () => {
    expect(authorizedAddress([{ address: bytesToBase64(keyBytes()) }])).toBe(address);
    expect(authorizedAddress([{ address, publicKey: keyBytes() }])).toBe(address);
    expect(() => authorizedAddress([])).toThrow(/didn’t share an account/);
    expect(() => authorizedAddress([{ address: 'AAAA' }])).toThrow();
  });

  it('accepts only the exact transaction, signed by the connected wallet', () => {
    const sent = tx(address);
    expect(checkedSignedTransaction(bytesToBase64(sign(sent)), sent, address)).toEqual(sign(sent));
    // Changed by the wallet (different blockhash) → refused.
    expect(() =>
      checkedSignedTransaction(bytesToBase64(sign(tx(address, 9))), sent, address),
    ).toThrow(/different transaction/);
    // Signed by some other key → refused.
    const other = new Uint8Array(32).fill(6);
    expect(() => checkedSignedTransaction(bytesToBase64(sign(sent, other)), sent, address)).toThrow(
      /signature/,
    );
    expect(() => checkedSignedTransaction(undefined, sent, address)).toThrow();
  });

  it('takes the signature appended to a signed message, and checks it', () => {
    const message = Uint8Array.from('Sign in to Sift', (c) => c.charCodeAt(0));
    const signature = solanaKeys.sign(message, seed);
    const signed = bytesToBase64(Uint8Array.from([...message, ...signature]));
    expect(checkedMessageSignature(signed, message, address)).toEqual(signature);
    const other = solanaKeys.sign(message, new Uint8Array(32).fill(6));
    expect(() =>
      checkedMessageSignature(
        bytesToBase64(Uint8Array.from([...message, ...other])),
        message,
        address,
      ),
    ).toThrow();
  });

  it('reuses only https wallet links, and explains errors plainly', () => {
    expect(safeWalletUriBase('https://phantom.app/ul/v1')).toBe('https://phantom.app/ul/v1');
    expect(safeWalletUriBase('javascript:alert(1)')).toBeUndefined();
    expect(mwaErrorMessage({ code: 'ERROR_ASSOCIATION_CANCELLED' })).toBeNull();
    expect(mwaErrorMessage({ code: 'ERROR_WALLET_NOT_FOUND' })).toMatch(
      /Install Phantom or Solflare/,
    );
    expect(mwaErrorMessage({ code: -3 })).toMatch(/declined/);
  });
});
