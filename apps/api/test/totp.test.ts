import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, totpCode, totpUri, verifyTotp } from '../src/sift-wallet/totp';

// RFC 6238 appendix B, SHA-1 secret "12345678901234567890" (8-digit codes there; the last
// 6 digits are what a 6-digit authenticator shows).
const SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP', () => {
  it('round-trips base32', () => {
    expect(base32Decode(SECRET).toString()).toBe('12345678901234567890');
  });

  it('matches the RFC 6238 test vectors', () => {
    expect(totpCode(SECRET, new Date(59_000))).toBe('287082');
    expect(totpCode(SECRET, new Date(1111111109_000))).toBe('081804');
    expect(totpCode(SECRET, new Date(1234567890_000))).toBe('005924');
  });

  it('accepts the neighbouring step and nothing else', () => {
    const at = new Date(1234567890_000);
    expect(verifyTotp(SECRET, '005924', at)).toBe(true);
    expect(verifyTotp(SECRET, totpCode(SECRET, at, -1), at)).toBe(true);
    expect(verifyTotp(SECRET, totpCode(SECRET, at, 3), at)).toBe(false);
    expect(verifyTotp(SECRET, '12345', at)).toBe(false);
    expect(verifyTotp(SECRET, 'abcdef', at)).toBe(false);
  });

  it('builds an authenticator link', () => {
    expect(totpUri(SECRET, 'So11111111111111111111111111111111111111112')).toMatch(
      /^otpauth:\/\/totp\/Sift%3ASo11%E2%80%A61112\?secret=[A-Z2-7]+&issuer=Sift/,
    );
  });
});
