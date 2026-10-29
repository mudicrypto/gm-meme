import { Chacha20Poly1305 } from '@hpke/chacha20poly1305';
import { CipherSuite, DhkemP256HkdfSha256, HkdfSha256 } from '@hpke/core';
import { describe, expect, it } from 'vitest';
import { hpkeKeyPair, hpkeOpen } from './hpke';

// Encrypt with an independent, widely used HPKE implementation; decrypt with ours.
const suite = new CipherSuite({
  kem: new DhkemP256HkdfSha256(),
  kdf: new HkdfSha256(),
  aead: new Chacha20Poly1305(),
});

async function seal(publicKey: Uint8Array, plaintext: Uint8Array) {
  const recipientPublicKey = await suite.kem.deserializePublicKey(publicKey.slice().buffer);
  const sender = await suite.createSenderContext({ recipientPublicKey });
  const ciphertext = new Uint8Array(await sender.seal(plaintext.slice().buffer));
  return { encapsulatedKey: new Uint8Array(sender.enc), ciphertext };
}

describe('hpkeOpen', () => {
  it('opens what a standard HPKE sender sealed to our key', async () => {
    const keys = hpkeKeyPair();
    expect(keys.publicKey).toHaveLength(65);
    const secret = Uint8Array.from('4wBqpZM9xaSheZzJSMawUKKwhdpChKbZ5eu5ky4Vigw9', (c) =>
      c.charCodeAt(0),
    );
    const sealed = await seal(keys.publicKey, secret);
    expect(hpkeOpen({ secretKey: keys.secretKey, ...sealed })).toEqual(secret);
  });

  it('refuses a tampered message or the wrong key', async () => {
    const keys = hpkeKeyPair();
    const sealed = await seal(keys.publicKey, new Uint8Array([1, 2, 3]));
    const tampered = sealed.ciphertext.slice();
    tampered[0]! ^= 1;
    expect(() =>
      hpkeOpen({ secretKey: keys.secretKey, ...sealed, ciphertext: tampered }),
    ).toThrow();
    expect(() => hpkeOpen({ secretKey: hpkeKeyPair().secretKey, ...sealed })).toThrow();
  });
});
