import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import { p256 } from '@noble/curves/nist.js';
import { expand, extract } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

// HPKE (RFC 9180), base mode, as the signing provider uses for key export:
// DHKEM(P-256, HKDF-SHA256), HKDF-SHA256, ChaCha20-Poly1305. The phone makes a one-time key
// pair, the provider encrypts the wallet key to it, and only the phone can open it: Sift's
// server only ever relays ciphertext.

const KEM_ID = 0x0010;
const KDF_ID = 0x0001;
const AEAD_ID = 0x0003;

// Labels are ASCII.
const text = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const u16 = (n: number) => new Uint8Array([(n >> 8) & 255, n & 255]);

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const KEM_SUITE = concat(text('KEM'), u16(KEM_ID));
const HPKE_SUITE = concat(text('HPKE'), u16(KEM_ID), u16(KDF_ID), u16(AEAD_ID));

function labeledExtract(suite: Uint8Array, salt: Uint8Array, label: string, ikm: Uint8Array) {
  return extract(sha256, concat(text('HPKE-v1'), suite, text(label), ikm), salt);
}

function labeledExpand(
  suite: Uint8Array,
  prk: Uint8Array,
  label: string,
  info: Uint8Array,
  length: number,
) {
  return expand(
    sha256,
    prk,
    concat(u16(length), text('HPKE-v1'), suite, text(label), info),
    length,
  );
}

export interface HpkeKeyPair {
  secretKey: Uint8Array;
  /** Uncompressed P-256 point (65 bytes), as the provider expects it. */
  publicKey: Uint8Array;
}

export function hpkeKeyPair(): HpkeKeyPair {
  const secretKey = p256.utils.randomSecretKey();
  return { secretKey, publicKey: p256.getPublicKey(secretKey, false) };
}

/** Decrypt a single-shot HPKE message (sequence 0). Throws if it was tampered with. */
export function hpkeOpen(opts: {
  secretKey: Uint8Array;
  encapsulatedKey: Uint8Array;
  ciphertext: Uint8Array;
  info?: Uint8Array;
  aad?: Uint8Array;
}): Uint8Array {
  const empty = new Uint8Array(0);
  const publicKey = p256.getPublicKey(opts.secretKey, false);
  // ECDH: the shared point's x-coordinate.
  const dh = p256.getSharedSecret(opts.secretKey, opts.encapsulatedKey, true).slice(1);
  const kemContext = concat(opts.encapsulatedKey, publicKey);
  const eaePrk = labeledExtract(KEM_SUITE, empty, 'eae_prk', dh);
  const sharedSecret = labeledExpand(KEM_SUITE, eaePrk, 'shared_secret', kemContext, 32);

  const pskIdHash = labeledExtract(HPKE_SUITE, empty, 'psk_id_hash', empty);
  const infoHash = labeledExtract(HPKE_SUITE, empty, 'info_hash', opts.info ?? empty);
  const context = concat(new Uint8Array([0]), pskIdHash, infoHash);
  const secret = labeledExtract(HPKE_SUITE, sharedSecret, 'secret', empty);
  const key = labeledExpand(HPKE_SUITE, secret, 'key', context, 32);
  const nonce = labeledExpand(HPKE_SUITE, secret, 'base_nonce', context, 12);
  return chacha20poly1305(key, nonce, opts.aad ?? empty).decrypt(opts.ciphertext);
}
