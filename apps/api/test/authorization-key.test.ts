import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseAuthorizationKey } from '../src/sift-wallet/signer';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const expected = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const publicOf = (input: string) =>
  createPublicKey(parseAuthorizationKey(input))
    .export({ format: 'der', type: 'spki' })
    .toString('base64');

const pkcs8 = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const sec1 = privateKey.export({ format: 'der', type: 'sec1' }).toString('base64');
const d = Buffer.from(privateKey.export({ format: 'jwk' }).d!, 'base64url');

describe('parseAuthorizationKey', () => {
  it.each([
    ['wallet-auth: + PKCS#8', `wallet-auth:${pkcs8}`],
    ['PKCS#8 base64 with spaces and line breaks', ` ${pkcs8.slice(0, 40)}\n${pkcs8.slice(40)} `],
    ['SEC1 base64', sec1],
    ['PEM', privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()],
    [
      'PEM with literal \\n',
      privateKey.export({ format: 'pem', type: 'pkcs8' }).toString().replace(/\n/g, '\\n'),
    ],
    ['bare private number, base64', d.toString('base64')],
    ['bare private number, hex', d.toString('hex')],
  ])('reads %s', (_label, input) => {
    expect(publicOf(input)).toBe(expected);
  });

  it('rejects anything else without echoing it', () => {
    const junk = 'not-a-key-but-a-secret-looking-value';
    expect(() => parseAuthorizationKey(junk)).toThrow(/isn’t a P-256 private key/);
    expect(() => parseAuthorizationKey(junk)).not.toThrow(new RegExp(junk));
  });

  it('rejects a public key pasted by mistake', () => {
    expect(() => parseAuthorizationKey(expected)).toThrow(/isn’t a P-256 private key/);
  });
});
