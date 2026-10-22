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
