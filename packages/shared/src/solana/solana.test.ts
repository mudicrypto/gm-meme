import { describe, expect, it } from 'vitest';
import { base58Decode, base58Encode, publicKeyBytes } from './base58';
import { solanaKeys } from './keys';
import {
  base64ToBytes,
  bytesToBase64,
  decodeTransaction,
  readU32,
  readU64,
  withSignature,
} from './transaction';

describe('base58', () => {
  it('round-trips, keeping leading zero bytes as 1s', () => {
    const bytes = Uint8Array.from([0, 0, 1, 2, 255, 128]);
    expect(base58Decode(base58Encode(bytes))).toEqual(bytes);
    expect(base58Encode(new Uint8Array(32))).toBe('11111111111111111111111111111111');
  });

  it('decodes a real address to 32 bytes and rejects bad input', () => {
    expect(publicKeyBytes('So11111111111111111111111111111111111111112')).toHaveLength(32);
    expect(() => base58Decode('0OIl')).toThrow(/invalid base58/);
    expect(() => publicKeyBytes('abc')).toThrow(/32-byte/);
  });
});

describe('base64', () => {
  it.each([[[]], [[1]], [[1, 2]], [[1, 2, 3]], [[255, 0, 128, 7, 9]]])(
    'round-trips %j',
    (input) => {
      const bytes = Uint8Array.from(input);
      expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    },
  );

  it('matches the standard encoding', () => {
    expect(bytesToBase64(Uint8Array.from([104, 105, 33]))).toBe('aGkh');
    expect(bytesToBase64(Uint8Array.from([104, 105]))).toBe('aGk=');
  });
});

describe('ed25519 keys', () => {
  const seed = Uint8Array.from({ length: 32 }, (_, i) => i + 1);

  it('signs and verifies for the derived address only', () => {
    const address = solanaKeys.publicKey(seed);
    const message = Uint8Array.from([1, 2, 3]);
    const signature = solanaKeys.sign(message, seed);
    expect(solanaKeys.verify(signature, message, address)).toBe(true);
    expect(solanaKeys.verify(signature, Uint8Array.from([1, 2, 4]), address)).toBe(false);
    expect(
      solanaKeys.verify(signature, message, 'So11111111111111111111111111111111111111112'),
    ).toBe(false);
  });
});

describe('transaction decoding', () => {
  it('rejects garbage and truncated input', () => {
    expect(() => decodeTransaction(Uint8Array.from([1, 2, 3]))).toThrow();
    expect(() => decodeTransaction(new Uint8Array(0))).toThrow();
  });

  it('places a signature in the right slot', () => {
    const tx = Uint8Array.from([1, ...new Array(64).fill(0), 9, 9]);
    const signed = withSignature(tx, 0, new Uint8Array(64).fill(7));
    expect(signed.subarray(1, 65).every((b) => b === 7)).toBe(true);
    expect(Array.from(signed.subarray(65))).toEqual([9, 9]);
    expect(() => withSignature(tx, 1, new Uint8Array(64))).toThrow(/no such signer/);
  });

  it('reads little-endian integers', () => {
    expect(readU64(Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 1]), 0)).toBe(72057594037927937n);
    expect(readU32(Uint8Array.from([0xff, 0xff, 0xff, 0xff]), 0)).toBe(4294967295);
  });
});
