import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Authenticator-app codes (TOTP, RFC 6238): 6 digits, 30-second steps, SHA-1, as every
// authenticator app expects.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of text.replace(/=+$/, '').toUpperCase()) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error('invalid base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpCode(secret: string, at: Date, offsetSteps = 0): string {
  const counter = Math.floor(at.getTime() / 1000 / STEP_SECONDS) + offsetSteps;
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secret)).update(message).digest();
  const offset = hmac[hmac.length - 1]! & 15;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return (binary % 1_000_000).toString().padStart(6, '0');
}

/** Accepts the current code and the one either side, for phone clocks a little out. */
export function verifyTotp(secret: string, code: string, at: Date): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  return [-1, 0, 1].some((offset) =>
    timingSafeEqual(Buffer.from(totpCode(secret, at, offset)), Buffer.from(code)),
  );
}

/** The link authenticator apps open (otpauth://), labelled with the account. */
export function totpUri(secret: string, account: string): string {
  const label = encodeURIComponent(`Sift:${account.slice(0, 4)}…${account.slice(-4)}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=Sift&algorithm=SHA1&digits=6&period=30`;
}
