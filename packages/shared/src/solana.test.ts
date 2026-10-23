import { describe, expect, it } from 'vitest';
import { isSolanaAddress } from './solana';

describe('isSolanaAddress', () => {
  it('accepts real addresses', () => {
    expect(isSolanaAddress('So11111111111111111111111111111111111111112')).toBe(true);
    expect(isSolanaAddress('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toBe(true);
  });

  it('rejects non-strings', () => {
    expect(isSolanaAddress(undefined)).toBe(false);
    expect(isSolanaAddress(123)).toBe(false);
  });

  it('rejects wrong lengths', () => {
    expect(isSolanaAddress('')).toBe(false);
    expect(isSolanaAddress('So111')).toBe(false);
    expect(isSolanaAddress('1'.repeat(45))).toBe(false);
  });

  it('rejects characters outside base58', () => {
    expect(isSolanaAddress('0'.repeat(32))).toBe(false);
    expect(isSolanaAddress('O'.repeat(32))).toBe(false);
    expect(isSolanaAddress(`${'1'.repeat(31)}l`)).toBe(false);
  });
});

describe('decodeTransaction length prefixes', () => {
  it('refuses non-canonical or oversized compact-u16 values', async () => {
    const { decodeTransaction } = await import('./solana/transaction');
    // 0x80 0x00 encodes 0 in two bytes (non-canonical); 0xff 0xff 0x7f is above 0xffff.
    expect(() => decodeTransaction(Uint8Array.from([0x80, 0x00]))).toThrow(/compact-u16/);
    expect(() => decodeTransaction(Uint8Array.from([0xff, 0xff, 0x7f]))).toThrow(/compact-u16/);
  });
});

describe('isSignInChallengeFor', () => {
  it('accepts only Sift’s own sign-in text for this wallet, freshly issued', async () => {
    const { isSignInChallengeFor, signInMessage } = await import('./social');
    const wallet = '6YcCaR7hSgW3NWgLYTf3wqE3vPs3tdKnJJEbiWBvaikr';
    const now = new Date('2026-10-23T10:00:00Z');
    const nonce = 'ab'.repeat(16);
    const issuedAt = '2026-10-23T09:59:58.000Z';
    const good = { nonce, issuedAt, message: signInMessage({ wallet, nonce, issuedAt }) };
    expect(isSignInChallengeFor(good, wallet, now)).toBe(true);
    // Another site's login text, another wallet, an old challenge, a malformed nonce.
    expect(
      isSignInChallengeFor({ ...good, message: 'example.com wants you to sign in…' }, wallet, now),
    ).toBe(false);
    expect(isSignInChallengeFor(good, 'J9T9XM6G2And1HyhPSSaPGDwH9BZVqMCKfhyiEoAVR65', now)).toBe(
      false,
    );
    expect(isSignInChallengeFor(good, wallet, new Date('2026-10-23T11:00:00Z'))).toBe(false);
    expect(isSignInChallengeFor({ ...good, nonce: 'x' }, wallet, now)).toBe(false);
    expect(isSignInChallengeFor(null, wallet, now)).toBe(false);
  });
});
