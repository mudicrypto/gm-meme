import { base58Decode, base58Encode, solanaKeys, withSignature } from '@sift/shared';
import nacl from 'tweetnacl';
import { describe, expect, it } from 'vitest';
import {
  PhantomError,
  connectUrl,
  newDappKeypair,
  parseConnect,
  parseSignMessage,
  parseSignTransaction,
  signMessageUrl,
  signTransactionUrl,
} from './phantom-protocol';

const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const REDIRECT = 'sift://phantom-callback/connect';

/** A stand-in for the Phantom app, following the same documented protocol. */
function fakePhantom() {
  const keys = nacl.box.keyPair();
  const walletSeed = random(32);
  const wallet = solanaKeys.publicKey(walletSeed);
  const session = 'phantom-session-token';
  const shared = (dappPublicKey: string) =>
    nacl.box.before(base58Decode(dappPublicKey), keys.secretKey);
  const respond = (dappPublicKey: string, body: unknown) => {
    const nonce = random(24);
    const data = nacl.box.after(
      Uint8Array.from(JSON.stringify(body), (c) => c.charCodeAt(0)),
      nonce,
      shared(dappPublicKey),
    );
    return { nonce: base58Encode(nonce), data: base58Encode(data) };
  };
  const read = (url: string) => Object.fromEntries(new URL(url).searchParams);
  const openPayload = (q: Record<string, string>) => {
    const opened = nacl.box.open.after(
      base58Decode(q.payload!),
      base58Decode(q.nonce!),
      shared(q.dapp_encryption_public_key!),
    );
    return JSON.parse(String.fromCharCode(...opened!)) as Record<string, string>;
  };
  return {
    wallet,
    session,
    connect(url: string) {
      const q = read(url);
      return {
        phantom_encryption_public_key: base58Encode(keys.publicKey),
        ...respond(q.dapp_encryption_public_key!, { public_key: wallet, session }),
      };
    },
    sign(url: string, tamper = false) {
      const q = read(url);
      const payload = openPayload(q);
      expect(payload.session).toBe(session);
      let tx = base58Decode(payload.transaction!);
      if (tamper) tx = Uint8Array.from(tx.map((b, i) => (i === tx.length - 2 ? b ^ 1 : b)));
      const message = tx.subarray(65);
      const signed = withSignature(tx, 0, solanaKeys.sign(message, walletSeed));
      return respond(q.dapp_encryption_public_key!, { transaction: base58Encode(signed) });
    },
    signMessage(url: string) {
      const q = read(url);
      const payload = openPayload(q);
      expect(payload.display).toBe('utf8');
      const signature = solanaKeys.sign(base58Decode(payload.message!), walletSeed);
      return respond(q.dapp_encryption_public_key!, { signature: base58Encode(signature) });
    },
    payloadOf: (url: string) => openPayload(read(url)),
  };
}

/** A minimal one-signer legacy transaction: [1][sig][header 1,0,1][1 key][blockhash][0 ix]. */
function transactionFor(address: string) {
  return Uint8Array.from([
    1,
    ...new Array(64).fill(0),
    1,
    0,
    0,
    1,
    ...base58Decode(address),
    ...new Array(32).fill(7),
    0,
  ]);
}

describe('Phantom deeplinks', () => {
  it('connects: the request carries our encryption key; the response decrypts to the wallet', () => {
    const phantom = fakePhantom();
    const dapp = newDappKeypair(random);
    const url = connectUrl({
      dappPublicKey: dapp.publicKey,
      cluster: 'devnet',
      appUrl: 'https://example.org',
      redirectLink: REDIRECT,
    });
    expect(url.startsWith('https://phantom.com/ul/v1/connect?')).toBe(true);
    expect(new URL(url).searchParams.get('cluster')).toBe('devnet');
    expect(new URL(url).searchParams.get('redirect_link')).toBe(REDIRECT);

    const session = parseConnect(phantom.connect(url), dapp.secretKey);
    expect(session).toMatchObject({ publicKey: phantom.wallet, session: phantom.session });
  });

  it('signs: the transaction travels encrypted and comes back signed by the wallet', () => {
    const phantom = fakePhantom();
    const dapp = newDappKeypair(random);
    const session = parseConnect(
      phantom.connect(
        connectUrl({
          dappPublicKey: dapp.publicKey,
          cluster: 'devnet',
          appUrl: 'https://x.org',
          redirectLink: REDIRECT,
        }),
      ),
      dapp.secretKey,
    );
    const tx = transactionFor(session.publicKey);

    const url = signTransactionUrl({
      session,
      transaction: tx,
      redirectLink: REDIRECT,
      nonce: random(24),
    });
    expect(url).not.toContain(phantom.session); // the session token never appears in the clear
    expect(phantom.payloadOf(url).transaction).toBe(base58Encode(tx));

    const signed = parseSignTransaction(phantom.sign(url), session, tx);
    expect(solanaKeys.verify(signed.subarray(1, 65), signed.subarray(65), session.publicKey)).toBe(
      true,
    );
  });

  it('refuses a transaction Phantom changed', () => {
    const phantom = fakePhantom();
    const dapp = newDappKeypair(random);
    const session = parseConnect(
      phantom.connect(
        connectUrl({
          dappPublicKey: dapp.publicKey,
          cluster: 'devnet',
          appUrl: 'https://x.org',
          redirectLink: REDIRECT,
        }),
      ),
      dapp.secretKey,
    );
    const tx = transactionFor(session.publicKey);
    const url = signTransactionUrl({
      session,
      transaction: tx,
      redirectLink: REDIRECT,
      nonce: random(24),
    });
    expect(() => parseSignTransaction(phantom.sign(url, true), session, tx)).toThrow(
      /different transaction/,
    );
  });

  it('refuses a signature that is not from the connected wallet', () => {
    const phantom = fakePhantom();
    const dapp = newDappKeypair(random);
    const session = parseConnect(
      phantom.connect(
        connectUrl({
          dappPublicKey: dapp.publicKey,
          cluster: 'devnet',
          appUrl: 'https://x.org',
          redirectLink: REDIRECT,
        }),
      ),
      dapp.secretKey,
    );
    const tx = transactionFor(session.publicKey);
    const url = signTransactionUrl({
      session,
      transaction: tx,
      redirectLink: REDIRECT,
      nonce: random(24),
    });
    const someoneElse = { ...session, publicKey: solanaKeys.publicKey(random(32)) };
    expect(() => parseSignTransaction(phantom.sign(url), someoneElse, tx)).toThrow(/signature/);
  });

  it('signs a sign-in message and checks the signature', () => {
    const phantom = fakePhantom();
    const dapp = newDappKeypair(random);
    const session = parseConnect(
      phantom.connect(
        connectUrl({
          dappPublicKey: dapp.publicKey,
          cluster: 'devnet',
          appUrl: 'https://x.org',
          redirectLink: REDIRECT,
        }),
      ),
      dapp.secretKey,
    );
    const message = Uint8Array.from('Sign in to Sift', (c) => c.charCodeAt(0));
    const url = signMessageUrl({ session, message, redirectLink: REDIRECT, nonce: random(24) });
    expect(url.startsWith('https://phantom.com/ul/v1/signMessage?')).toBe(true);
    const answer = phantom.signMessage(url);
    expect(parseSignMessage(answer, session, message)).toHaveLength(64);
    const other = Uint8Array.from('Something else', (c) => c.charCodeAt(0));
    expect(() => parseSignMessage(answer, session, other)).toThrow(/signature/);
  });

  it('turns Phantom errors into plain messages', () => {
    const dapp = newDappKeypair(random);
    const error = (() => {
      try {
        parseConnect(
          { errorCode: '4001', errorMessage: 'User rejected the request.' },
          dapp.secretKey,
        );
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(PhantomError);
    expect(error).toMatchObject({ code: '4001', message: 'You declined the request in Phantom.' });
  });

  it('rejects responses it cannot decrypt or that are incomplete', () => {
    const dapp = newDappKeypair(random);
    const other = nacl.box.keyPair();
    expect(() =>
      parseConnect(
        {
          phantom_encryption_public_key: base58Encode(other.publicKey),
          nonce: base58Encode(random(24)),
          data: base58Encode(random(40)),
        },
        dapp.secretKey,
      ),
    ).toThrow(/Could not read/);
    expect(() => parseConnect({}, dapp.secretKey)).toThrow(/incomplete/);
  });
});
