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
